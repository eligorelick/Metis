import { CORE_FACT_FORMS, QUARTER_DURATION_DAYS, parseFactPoints, type CompanyFacts, type FactPoint } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload, FmpStatementRow, StatementFieldProvenance } from "@/providers/fmp";
import type { FetchResult, ManifestEntry } from "@/types/core";
import { CURRENT_DEBT_TAGS, DEBT_AGGREGATE_TAGS, commercialPaperInsideBorrowings, currentMaturitiesFoldedIn, fiscalMaturityScopeReason, incompleteDebtReason, omittedConvertibleCarryingReason, uncomposedDebtReason, zeroCurrentDebtReason } from "@/edgar/debtCompleteness";
import { reconcileDebtPresentation } from "@/edgar/debtPresentation";
import { reconcileDebtNoteCarrying } from "@/edgar/debtNoteCarrying";
import type { EdgarBundle, ExtractedSection } from "@/pipeline/types";
import { supplementTemporaryEquity, temporaryEquityFiledEnds, temporaryEquityRows } from "@/edgar/temporaryEquityEnrichment";
import { admitCashInvestment, type FilingCashInvestment } from "@/edgar/cashInvestment";
import { vendorAgreesWithDerived, vendorAgreesWithFiled } from "@/edgar/vendorAgreement";
import type { FilingEquityStatementNci } from "@/edgar/equityStatementNci";
import { COMBINED_CURRENT_DEBT_TAG, tagsFor } from "@/edgar/tagSynonyms";
import { millions, millionsPair } from "@/pipeline/stageB/netDebt";
import { oneBasisPair, representationLabelled, type LabelCopy } from "@/edgar/presentationLineage";
import { DISCONTINUED_LABEL_TAGS, RESTATEMENT_THRESHOLD_PCT, longTermInvestmentsChainAt } from "@/edgar/statements";

/** Already acquired filing sections only; no additional provider reads. */
export function debtPresentationSections(edgar: Pick<EdgarBundle, "tenQNotes" | "tenKNotes"> | undefined): ExtractedSection[] {
  return [edgar?.tenQNotes, edgar?.tenKNotes].flatMap((result) => result?.ok ? [result.value.data] : []);
}

const DAY = 86_400_000;
function validDay(day: unknown): day is string {
  return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
}
const span = (p: FactPoint) => p.start ? (Date.parse(p.end) - Date.parse(p.start)) / DAY : null;
const newest = (points: FactPoint[]) => [...points].sort((a, b) => b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn))[0];
interface Resolved {
  value: number;
  evidence: StatementFieldProvenance;
  /** The two filed copies a derived value nets (minuend, then subtrahend); absent for a directly filed value. */
  operands?: readonly FactPoint[];
  /** The later copy that re-filed the minuend, when the first-reported pair stands in (C-9's within-1% or labelled case). */
  refiledBy?: FactPoint;
}

/**
 * One enrichment call's derivation state (audit 2026-10-27 FIN-511-V2): the C-9 label copies, the derivations
 * `oneBasisPair` withheld (tag and period end), and the vendor fields those left unverified (field to dates),
 * disclosed once per field.
 */
interface DerivationContext {
  labels: readonly LabelCopy[];
  withheld: Set<string>;
  unverified: Map<string, Set<string>>;
}
const derivationKey = (tag: string, end: string): string => `${tag}|${end}`;
/** A vendor `field` at `date` that no SEC value checks because a derivation of one of `tags` was withheld. */
function keptUnverified(ctx: DerivationContext, field: string, date: string, tags: readonly string[]): void {
  if (!tags.some((tag) => ctx.withheld.has(derivationKey(tag, date)))) return;
  ctx.unverified.set(field, (ctx.unverified.get(field) ?? new Set<string>()).add(date));
}
const CASH_MOVEMENT_TAG = "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect";
const OPERATING_CASH_FLOW_TAG = "NetCashProvidedByUsedInOperatingActivities";
const PRINCIPAL_TAG = "FinanceLeasePrincipalPayments";

/** Dated facts, exact monetary unit only; no implicit USD or million scaling. */
function points(facts: CompanyFacts, tag: string, unit: string, observedAt: string): FactPoint[] {
  const c = facts.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown[]> } | undefined;
  return parseFactPoints(c?.units?.[unit] ?? []).filter((p) => CORE_FACT_FORMS.has(p.form) && validDay(p.end) && p.end <= observedAt.slice(0, 10) && validDay(p.filed) && p.filed <= observedAt.slice(0, 10) && (p.start === undefined || validDay(p.start)));
}
function resolved(value: number, tags: string[], ps: FactPoint[], unit: string, observedAt: string, periodStart: string | null, periodEnd: string): Resolved {
  return { value, evidence: { source: "edgar", unit, periodStart, periodEnd, observedAt, tags: tags.map((t) => `us-gaap/${t}`), filings: ps.map((p) => ({ accn: p.accn, filed: p.filed, form: p.form })) } };
}
function instant(facts: CompanyFacts, tag: string, unit: string, end: string, observedAt: string, filingDate?: string, filings?: StatementFieldProvenance["filings"]): Resolved | null {
  const candidates = points(facts, tag, unit, observedAt).filter(p => p.end === end && p.start === undefined &&
    (filingDate === undefined || p.filed === filingDate) &&
    (filings === undefined || filings.some(f => f.accn === p.accn && f.filed === p.filed && f.form === p.form)));
  const p = filingDate === undefined && filings === undefined ? newest(candidates.filter(p => p.val >= 0)) : unambiguousNewest(candidates);
  if (p && p.val < 0) return null;
  return p ? resolved(p.val, [tag], [p], unit, observedAt, null, end) : null;
}
/** Maturities cannot exceed their own total; a complete split must reconcile. */
function incompatibleLeaseMaturities(total: number | null, current: number | null, noncurrent: number | null): boolean {
  if (total === null) return false;
  if (current !== null && current > total || noncurrent !== null && noncurrent > total) return true;
  return current !== null && noncurrent !== null &&
    Math.abs(total - current - noncurrent) > Math.max(1, Math.min(Math.abs(total), Math.abs(current + noncurrent)) * 1e-6);
}
function liability(facts: CompanyFacts, prefix: "Operating" | "Finance", unit: string, end: string, observedAt: string): Resolved | null {
  const tag = `${prefix}LeaseLiability`;
  const total = instant(facts, tag, unit, end, observedAt);
  if (total) {
    // A fact from another filing cannot contradict or corroborate this total.
    const ownCurrent = instant(facts, `${tag}Current`, unit, end, observedAt, undefined, total.evidence.filings);
    const ownNoncurrent = instant(facts, `${tag}Noncurrent`, unit, end, observedAt, undefined, total.evidence.filings);
    return incompatibleLeaseMaturities(total.value, ownCurrent?.value ?? null, ownNoncurrent?.value ?? null) ? null : total;
  }
  const current = instant(facts, `${tag}Current`, unit, end, observedAt);
  const noncurrent = instant(facts, `${tag}Noncurrent`, unit, end, observedAt);
  if (!current || !noncurrent) return null;
  // A total assembled across unrelated filing versions is not a filed total.
  if (current.evidence.filings[0]?.accn !== noncurrent.evidence.filings[0]?.accn) return null;
  return { value: current.value + noncurrent.value, evidence: { ...current.evidence, tags: [...current.evidence.tags, ...noncurrent.evidence.tags] } };
}
/** Select by filing recency before applying a sign rule; refusals cannot expose older facts. */
function unambiguousNewest(candidates: FactPoint[]): FactPoint | null {
  const last = newest(candidates);
  if (!last) return null;
  return candidates.filter(p => p.filed === last.filed && p.accn === last.accn)
    .every(p => p.start === last.start && p.end === last.end && p.val === last.val) ? last : null;
}

/**
 * Every core copy of every discontinued-operations element, with its tag and unit: the one re-presentation label
 * companyfacts carries (decision C-9; the statement builder reads the same tags). Read once per enrichment call.
 */
function labelCopies(facts: CompanyFacts, observedAt: string): LabelCopy[] {
  return DISCONTINUED_LABEL_TAGS.flatMap((tag) => {
    const units = (facts.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown[]> } | undefined)?.units ?? {};
    return Object.keys(units).flatMap((unit) => points(facts, tag, unit, observedAt).map((p) => ({ ...p, tag, unit })));
  });
}

/**
 * Direct and YTD-derived flows use the exact emitted start/end interval. A derived quarter nets two copies on one
 * presentation, chosen by `oneBasisPair` as in the statement builder (audit 2026-10-27 FIN-511-V2, decision C-9): a
 * pair that would net two presentations, or a copy that a material re-filing labelling no re-presentation
 * superseded, gives no SEC value, so nothing is compared or written.
 */
function filedFlow(facts: CompanyFacts, tag: string, unit: string, end: string, scope: "annual" | "quarter", observedAt: string, signed: boolean, ctx: DerivationContext): Resolved | null {
  const ps = points(facts, tag, unit, observedAt).filter(p => p.start !== undefined);
  const [min, max] = scope === "annual" ? [350, 380] : QUARTER_DURATION_DAYS;
  const directCandidates = ps.filter(p => p.end === end && span(p)! >= min! && span(p)! <= max!);
  const direct = unambiguousNewest(directCandidates);
  if (directCandidates.length > 0) return direct && (signed || direct.val >= 0)
    ? resolved(direct.val, [tag], [direct], unit, observedAt, direct.start!, end) : null;
  if (scope === "annual") return null;
  const ytd = unambiguousNewest(ps.filter(p => p.end === end && span(p)! > QUARTER_DURATION_DAYS[1] && span(p)! <= 380));
  if (!ytd) return null;
  // A prior cumulative end is the day BEFORE the derived start. Validate the
  // resulting interval, not the one-day-longer difference between period ends.
  const subtrahendsFor = (m: FactPoint): FactPoint[] | null => {
    const prior = unambiguousNewest(ps.filter(p => p.start === m.start && p.end < end && p.filed <= m.filed &&
      (Date.parse(end) - Date.parse(p.end)) / DAY - 1 >= QUARTER_DURATION_DAYS[0] &&
      (Date.parse(end) - Date.parse(p.end)) / DAY - 1 <= QUARTER_DURATION_DAYS[1]));
    return prior ? [prior] : null;
  };
  const choice = oneBasisPair(ps, ytd, subtrahendsFor, RESTATEMENT_THRESHOLD_PCT, (m) => representationLabelled(ctx.labels, m, RESTATEMENT_THRESHOLD_PCT));
  if (choice.kind === "withheld") ctx.withheld.add(derivationKey(tag, end));
  if (choice.kind !== "pair") return null;
  const minuend = choice.minuend;
  const prior = choice.subtrahends[0]!;
  if (!signed && (minuend.val < 0 || prior.val < 0 || minuend.val < prior.val)) return null;
  const start = new Date(Date.parse(prior.end) + DAY).toISOString().slice(0, 10);
  const out = resolved(minuend.val - prior.val, [tag], [minuend, prior], unit, observedAt, start, end);
  out.evidence.derivation = "ytd-difference";
  out.operands = [minuend, prior];
  if (choice.basis === "first-reported" && choice.refiledBy !== null) out.refiledBy = choice.refiledBy;
  return out;
}
/**
 * A vendor figure against SEC values: A-11, or for a value derived from filed operands (every part derived), A-11
 * widened to the operands' rounding (audit 2026-10-27 FIN-511-V2, `vendorAgreesWithDerived`). `value` is the parts'
 * figure as compared (signed, or summed).
 */
function agreesWithSec(vendor: number, value: number, parts: readonly Resolved[]): boolean {
  return parts.length > 0 && parts.every((part) => part.operands !== undefined)
    ? vendorAgreesWithDerived(vendor, value, parts.flatMap((part) => part.operands!.map((operand) => operand.val)))
    : vendorAgreesWithFiled(vendor, value);
}
/**
 * How a derived SEC value was built, for reason texts: "(fiscal year or year to date less the prior year to date, from
 * the <filing> and the <filing>)", or for the first-reported pair "(the first-reported fiscal year or year to date ...;
 * re-filed later in the <filing>)".
 */
function derivedFrom(sec: Resolved): string {
  const filing = (f: FactPoint) => `${f.form.trim()} of ${f.filed} (${f.accn})`;
  const from = `from ${(sec.operands ?? []).map((f) => `the ${filing(f)}`).join(" and ")}`;
  return sec.refiledBy
    ? `(the first-reported fiscal year or year to date less the prior year to date, ${from}; re-filed later in the ${filing(sec.refiledBy)})`
    : `(fiscal year or year to date less the prior year to date, ${from})`;
}
function principal(facts: CompanyFacts, unit: string, end: string, scope: "annual" | "quarter", observedAt: string, ctx: DerivationContext): Resolved | null {
  return filedFlow(facts, PRINCIPAL_TAG, unit, end, scope, observedAt, false, ctx);
}
function filedOperatingCashFlow(facts: CompanyFacts, unit: string, end: string, scope: "annual" | "quarter", observedAt: string, ctx: DerivationContext): Resolved | null {
  return filedFlow(facts, OPERATING_CASH_FLOW_TAG, unit, end, scope, observedAt, true, ctx);
}

/** Refutation only: a later comparative cannot create a canonical standalone quarter. */
function crossFilingCfoQuarter(facts: CompanyFacts, unit: string, end: string, observedAt: string, tag = OPERATING_CASH_FLOW_TAG): Resolved | null {
  const ps = points(facts, tag, unit, observedAt);
  const total = unambiguousNewest(ps.filter(p => p.end === end && span(p) !== null && span(p)! > QUARTER_DURATION_DAYS[1] && span(p)! <= 380));
  if (!total) return null;
  const prior = unambiguousNewest(ps.filter(p => p.start === total.start && p.end < end &&
    (Date.parse(end) - Date.parse(p.end)) / DAY - 1 >= QUARTER_DURATION_DAYS[0] &&
    (Date.parse(end) - Date.parse(p.end)) / DAY - 1 <= QUARTER_DURATION_DAYS[1]));
  if (!prior || prior.filed <= total.filed) return null;
  const start = new Date(Date.parse(prior.end) + DAY).toISOString().slice(0, 10);
  return { ...resolved(total.val - prior.val, [tag], [total, prior], unit, observedAt, start, end), operands: [total, prior] };
}

export interface FiledCashFlowTtm {
  value: number; operands: number[]; reason: string; start: string; end: string;
  tag: string; points: FactPoint[];
}
/** FY + current YTD - prior YTD; both YTD values must be in the same current 10-Q. */
export function filedCashFlowTtm(facts: CompanyFacts, tag: string, unit: string, end: string, observedAt: string): FiledCashFlowTtm | null {
  const ps = points(facts, tag, unit, observedAt);
  const currentCopies = ps.filter(p => p.end === end && p.form.replace(/\/A$/, "") === "10-Q" && span(p) !== null && span(p)! >= 70 && span(p)! <= 300);
  const latest = newest(currentCopies);
  // Expense tags can carry both a standalone Q2/Q3 and a cumulative YTD in
  // the same filing. The longest duration is the YTD; distinct values for
  // that same duration still fail closed.
  const newestCopies = currentCopies.filter(p => p.filed === latest?.filed && p.accn === latest?.accn);
  const longest = Math.max(...newestCopies.map(p => span(p)!));
  const current = unambiguousNewest(newestCopies.filter(p => span(p) === longest));
  if (!current?.start) return null;
  const annualEnd = new Date(Date.parse(current.start) - DAY).toISOString().slice(0, 10);
  const annual = unambiguousNewest(ps.filter(p => p.end === annualEnd && p.filed <= current.filed && span(p) !== null && span(p)! >= 350 && span(p)! <= 380));
  if (!annual?.start) return null;
  const prior = unambiguousNewest(ps.filter(p => p.accn === current.accn && p.filed === current.filed && p.form === current.form &&
    p.start === annual.start && p.end < annualEnd && span(p) !== null && Math.abs(span(p)! - span(current)!) <= 7 &&
    (Date.parse(end) - Date.parse(p.end)) / DAY >= 350 && (Date.parse(end) - Date.parse(p.end)) / DAY <= 380));
  if (!prior) return null;
  const value = annual.val + current.val - prior.val;
  const start = new Date(Date.parse(prior.end) + DAY).toISOString().slice(0, 10);
  const name = tag === OPERATING_CASH_FLOW_TAG ? "operating cash flow"
    : tag === "ShareBasedCompensation" ? "SBC, cash-flow add-back (ShareBasedCompensation)"
    : tag === "AllocatedShareBasedCompensationExpense" ? "SBC, allocated expense (AllocatedShareBasedCompensationExpense)"
    : `cash capital expenditure (${tag})`;
  return { value, operands: [annual.val, current.val, prior.val], start, end, tag, points: [annual, current, prior],
    reason: `TTM ${name} = filed fiscal year ${annual.val} + current YTD ${current.val} - prior-year YTD ${prior.val} = ${value} ${unit} through ${end}. Both YTD operands come from the same current ${current.form} ${current.accn}, filed ${current.filed}; fiscal year from ${annual.form} ${annual.accn}, filed ${annual.filed}. This filed YTD identity does not establish standalone quarters or any other accounting/tag basis.` };
}
export function filedCfoTtm(facts: CompanyFacts, unit: string, end: string, observedAt: string): FiledCashFlowTtm | null {
  return filedCashFlowTtm(facts, OPERATING_CASH_FLOW_TAG, unit, end, observedAt);
}

/** R9: retain exactly the annual capex tag basis; no new quarterly capex synonyms or component sums. */
export function filedCapexTtm(facts: CompanyFacts, annualRow: FmpCashFlowRow | undefined, unit: string, end: string, observedAt: string): FiledCashFlowTtm | null {
  if (!annualRow || annualRow.fieldConflicts?.capitalExpenditure?.usable === false || annualRow.reportedCurrency !== unit || typeof annualRow.capitalExpenditure !== "number" || !Number.isFinite(annualRow.capitalExpenditure)) return null;
  const provenance = annualRow.fieldProvenance?.capitalExpenditure;
  const candidates = [...tagsFor("capitalExpenditure"), "PaymentsToDevelopSoftware"].filter(tag =>
    !provenance || provenance.source === "edgar" && provenance.unit === unit && provenance.tags.length === 1 && provenance.tags[0] === `us-gaap/${tag}`)
    .flatMap(tag => {
      const ttm = filedCashFlowTtm(facts, tag, unit, end, observedAt);
      return ttm && ttm.points[0]!.end === annualRow.date && ttm.points.every(p => p.val >= 0) && ttm.value >= 0 &&
        vendorAgreesWithFiled(Math.abs(annualRow.capitalExpenditure!), ttm.points[0]!.val) ? [ttm] : [];
    });
  // Equal numeric values on different tags do not prove an interchangeable basis.
  return candidates.length === 1 ? candidates[0]! : null;
}

/** Cash-flow balances have an unknown restricted-cash scope in vendor rows.
 * Compare only where BOTH filed scopes agree, with an FX-inclusive flow and
 * compatible instants. The interval comes from the filing, not an invented
 * vendor periodStart. Prior-quarter cash need not have the ending filing's ID.
 */
function filedCashAmounts(facts: CompanyFacts, unit: string, row: FmpStatementRow, scope: "annual" | "quarter", observedAt: string, ctx: DerivationContext): Partial<Record<"cashAtBeginningOfPeriod" | "cashAtEndOfPeriod" | "netChangeInCash", Resolved>> {
  if (!validDay(row.date)) return {};
  const cashTag = "CashAndCashEquivalentsAtCarryingValue";
  const totalTag = "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents";
  const cash = (tag: string, day: string): Resolved | null => {
    const p = unambiguousNewest(points(facts, tag, unit, observedAt).filter(p => p.end === day && p.start === undefined && p.val >= 0));
    return p ? resolved(p.val, [tag], [p], unit, observedAt, null, day) : null;
  };
  const common = (day: string): Resolved | null => {
    const unrestricted = cash(cashTag, day), total = cash(totalTag, day);
    if (!unrestricted || !total || unrestricted.value !== total.value ||
      JSON.stringify(unrestricted.evidence.filings) !== JSON.stringify(total.evidence.filings)) return null;
    return { value: total.value, evidence: { ...total.evidence, tags: [...unrestricted.evidence.tags, ...total.evidence.tags] } };
  };
  const ending = common(row.date);
  const movement = filedFlow(facts, CASH_MOVEMENT_TAG, unit, row.date, scope, observedAt, true, ctx);
  const start = movement?.evidence.periodStart;
  const flowFiling = movement?.evidence.filings[0];
  if (!ending || !start || !flowFiling || (typeof row.periodStart === "string" && row.periodStart !== start) ||
    !ending.evidence.filings.every(f => f.accn === flowFiling.accn && f.filed === flowFiling.filed && f.form === flowFiling.form)) return {};
  const beginningDay = new Date(Date.parse(start) - DAY).toISOString().slice(0, 10);
  const beginning = common(beginningDay);
  if (!beginning || beginning.evidence.filings.some(f => f.filed > flowFiling.filed) || ending.value - beginning.value !== movement!.value) return {};
  return { cashAtBeginningOfPeriod: beginning, cashAtEndOfPeriod: ending, netChangeInCash: {
    value: movement!.value, evidence: { ...movement!.evidence, tags: [...new Set([...movement!.evidence.tags, ...beginning.evidence.tags, ...ending.evidence.tags])],
      filings: [...movement!.evidence.filings, ...beginning.evidence.filings, ...ending.evidence.filings], calculation: "ending-cash-minus-beginning-cash" },
    ...(movement!.operands ? { operands: movement!.operands } : {}),
  } };
}

/** Legacy comparison is valid only when the vendor's two cash amounts already
 * establish the unrestricted definition. It cannot validate a wrong balance.
 */
function matchingCashChange(facts: CompanyFacts, unit: string, row: FmpStatementRow, scope: "annual" | "quarter", observedAt: string): Resolved | null {
  if (!validDay(row.periodStart) || !validDay(row.date)) return null;
  const days = (Date.parse(row.date) - Date.parse(row.periodStart)) / DAY;
  const [min, max] = scope === "annual" ? [350, 380] : QUARTER_DURATION_DAYS;
  if (days < min! || days > max!) return null;
  const tag = "CashAndCashEquivalentsAtCarryingValue";
  const beginningDay = new Date(Date.parse(row.periodStart) - DAY).toISOString().slice(0, 10);
  const beginning = instant(facts, tag, unit, beginningDay, observedAt), ending = instant(facts, tag, unit, row.date, observedAt);
  // A cash-plus-restrictions or otherwise unclassified cash-flow balance
  // cannot borrow the unrestricted balance-sheet definition by name alone.
  if (!beginning || !ending || row.cashAtBeginningOfPeriod !== beginning.value || row.cashAtEndOfPeriod !== ending.value ||
    JSON.stringify(beginning.evidence.filings) !== JSON.stringify(ending.evidence.filings)) return null;
  return { value: ending.value - beginning.value, evidence: { ...ending.evidence, periodStart: row.periodStart,
    calculation: "ending-cash-minus-beginning-cash" } };
}

/** Compare only exact definitions; treasury movement, withholding and restricted cash are not substitutes. */
function admitCashFields<T extends FmpStatementRow>(row: T, facts: CompanyFacts, unit: string, scope: "annual" | "quarter", observedAt: string, kind: "balance" | "cashflow", ctx: DerivationContext, onlySbc = false): { row: T; gaps: ManifestEntry[] } {
  const cashAmounts = kind === "cashflow" && !onlySbc ? filedCashAmounts(facts, unit, row, scope, observedAt, ctx) : {};
  const specifications: [string, string, boolean, number][] = kind === "balance"
    ? [["cashAndCashEquivalents", "CashAndCashEquivalentsAtCarryingValue", true, 1]]
    : [["commonStockRepurchased", "PaymentsForRepurchaseOfCommonStock", false, -1],
      ["stockBasedCompensation", "ShareBasedCompensation", true, 1],
      ["netCashProvidedByInvestingActivities", "NetCashProvidedByUsedInInvestingActivities", true, 1],
      ["netCashProvidedByFinancingActivities", "NetCashProvidedByUsedInFinancingActivities", true, 1],
      ["cashAtBeginningOfPeriod", "CashAndCashEquivalentsAtCarryingValue", true, 1],
      ["cashAtEndOfPeriod", "CashAndCashEquivalentsAtCarryingValue", true, 1],
      ["netChangeInCash", "CashAndCashEquivalentsAtCarryingValue", true, 1]];
  let out = row;
  const gaps: ManifestEntry[] = [];
  if (kind === "cashflow" && !onlySbc) {
    const unavailable: Record<string, null> = {};
    const fieldConflicts = { ...out.fieldConflicts };
    for (const field of ["cashAtBeginningOfPeriod", "cashAtEndOfPeriod", "netChangeInCash"]) {
      const prior = fieldConflicts[field];
      if (prior?.usable !== false) continue;
      unavailable[field] = null;
      if (field === "netChangeInCash") continue;
      unavailable.netChangeInCash = null;
      fieldConflicts.netChangeInCash ??= { usable: false, vendorValue: typeof row.netChangeInCash === "number" ? row.netChangeInCash : null,
        secValue: null, reason: `cash movement unavailable because ${field} was refused: ${prior.reason}`, ...(prior.secEvidence ? { secEvidence: prior.secEvidence } : {}) };
    }
    out = { ...out, ...unavailable, fieldConflicts };
  }
  for (const [field, tag, signed, sign] of specifications) {
    if (onlySbc && field !== "stockBasedCompensation") continue;
    // SEC-built rows retain the first reporter's filing date while each field
    // carries the filing that supplied its latest value, including restatements.
    const proof = row.fieldProvenance?.[field];
    const balanceFilings = kind === "balance" && proof?.source === "edgar" && proof.unit === unit &&
      proof.periodStart === null && proof.periodEnd === row.date && proof.tags.includes(`us-gaap/${tag}`) && proof.filings.length > 0
      ? proof.filings : undefined;
    const sec = kind === "balance" ? instant(facts, tag, unit, row.date!, observedAt,
      balanceFilings ? undefined : validDay(row.filingDate) ? row.filingDate : undefined, balanceFilings)
      : field === "cashAtBeginningOfPeriod" || field === "cashAtEndOfPeriod" || field === "netChangeInCash"
        ? cashAmounts[field] ?? (field === "netChangeInCash" ? matchingCashChange(facts, unit, row, scope, observedAt) : null)
        : filedFlow(facts, tag, unit, row.date!, scope, observedAt, signed, ctx) ??
          (field === "stockBasedCompensation" && scope === "quarter" ? crossFilingCfoQuarter(facts, unit, row.date!, observedAt, tag) : null);
    // A prior-quarter filing is a calculation dependency, not authority for
    // comparing the current vendor row. All three cash fields share the
    // ending/current-flow filing anchor; retain every dependency in secEvidence.
    const cashField = field === "cashAtBeginningOfPeriod" || field === "cashAtEndOfPeriod" || field === "netChangeInCash";
    const filingAnchor = cashField ? cashAmounts.cashAtEndOfPeriod ?? sec : sec;
    if (!sec && kind === "cashflow" && typeof row[field] === "number" && Number.isFinite(row[field])) {
      keptUnverified(ctx, field, row.date!, [cashField ? CASH_MOVEMENT_TAG : tag]);
    }
    if (!sec || (sec.evidence.periodStart !== null && kind === "cashflow" && typeof row.periodStart === "string" && row.periodStart !== sec.evidence.periodStart) ||
      (!balanceFilings && validDay(row.filingDate) && !filingAnchor?.evidence.filings.some(filing => filing.filed === row.filingDate))) continue;
    const vendor = row[field];
    if (typeof vendor !== "number" || !Number.isFinite(vendor)) continue;
    const value = sec.value * sign;
    if (agreesWithSec(vendor, value, [sec])) continue;
    if (kind === "cashflow" && scope === "quarter" && field === "stockBasedCompensation" && proof === undefined &&
      out.fieldConflicts?.[field]?.usable !== false && !sec.operands && sec.evidence.periodStart && sec.evidence.filings.length === 1 && value >= 0) {
      const filing = sec.evidence.filings[0]!;
      const cumulative = unambiguousNewest(points(facts, tag, unit, observedAt).filter(p => p.end === row.date &&
        p.start !== undefined && p.start < sec.evidence.periodStart! && span(p)! > QUARTER_DURATION_DAYS[1] && span(p)! <= 380 &&
        p.accn === filing.accn && p.filed === filing.filed && p.form === filing.form));
      if (cumulative && cumulative.val > value && vendor === cumulative.val) {
        const reason = `vendor stock-based compensation period reconciled at ${row.date}: vendor ${millions(vendor)} ${unit} matches the same filing's cumulative ${cumulative.start} through ${cumulative.end} amount; directly filed quarter ${sec.evidence.periodStart} through ${row.date} amount ${millions(value)} ${unit} used; original vendor observation retained`;
        out = { ...out, [field]: value, fieldProvenance: { ...out.fieldProvenance, [field]: sec.evidence },
          fieldConflicts: { ...out.fieldConflicts, [field]: { usable: true, vendorValue: vendor, secValue: value,
            resolution: "filed-family", reason, secEvidence: sec.evidence } } };
        gaps.push({ field: `statements.cashflow.${row.date}.${field}`, reason, severity: "info", expected: true,
          attemptedSources: [`edgar:companyfacts/us-gaap/${tag}`] });
        continue;
      }
    }
    if (kind === "balance" && field === "cashAndCashEquivalents" && proof === undefined && out.fieldConflicts?.[field]?.usable !== false) {
      const inclusiveTag = "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents";
      const inclusive = instant(facts, inclusiveTag, unit, row.date!, observedAt, undefined, sec.evidence.filings);
      // Positive admission needs an unambiguous latest point before applying
      // the sign rule. A newer invalid point cannot expose an older balance.
      const unrestricted = unambiguousNewest(points(facts, tag, unit, observedAt).filter(p =>
        p.end === row.date && p.start === undefined && (!validDay(row.filingDate) || p.filed === row.filingDate)));
      const unrestrictedProved = unrestricted && unrestricted.val >= 0 && unrestricted.val === value &&
        sec.evidence.filings.some(f => f.accn === unrestricted.accn && f.filed === unrestricted.filed && f.form === unrestricted.form);
      // Two explicitly filed scopes, from one filing. The unrestricted amount
      // is read directly; no absent restricted maturity is presumed zero.
      if (unrestrictedProved && inclusive && inclusive.value > value && Math.abs(vendor - inclusive.value) <= Math.max(1, inclusive.value * 1e-6)) {
        const reason = `vendor cash scope reconciled at ${row.date}: vendor ${millions(vendor)} ${unit} equals the same filing's ${inclusiveTag}, which includes restricted cash; directly filed unrestricted cash ${millions(value)} ${unit} used; original vendor observation retained`;
        const evidence = { ...sec.evidence, tags: [...sec.evidence.tags, ...inclusive.evidence.tags] };
        const fieldConflicts: NonNullable<FmpStatementRow["fieldConflicts"]> = { ...out.fieldConflicts, [field]: { usable: true, vendorValue: vendor, secValue: value,
          resolution: "filed-family" as const, reason, secEvidence: evidence } };
        const debtProof = out.fieldProvenance?.totalDebt;
        const sameDebtFiling = debtProof?.source === "edgar" && debtProof.unit === unit && debtProof.periodStart === null &&
          debtProof.periodEnd === row.date && debtProof.filings.length > 0 && debtProof.filings.every(f =>
            sec.evidence.filings.some(c => c.accn === f.accn && c.filed === f.filed && c.form === f.form));
        const canRecomputeDebt = sameDebtFiling && typeof out.totalDebt === "number" && Number.isFinite(out.totalDebt) &&
          out.fieldConflicts?.totalDebt?.usable !== false && out.fieldConflicts?.netDebt?.usable !== false;
        const netDebt = canRecomputeDebt ? (out.totalDebt as number) - value : null;
        for (const dependent of ["cashAndShortTermInvestments", "netDebt"]) {
          if (fieldConflicts[dependent]?.usable === false) continue;
          fieldConflicts[dependent] = { usable: dependent === "netDebt" && canRecomputeDebt === true,
            vendorValue: typeof out[dependent] === "number" ? out[dependent] as number : null,
            secValue: dependent === "netDebt" ? netDebt : null, secEvidence: evidence,
            reason: `${reason}; ${dependent === "netDebt" && canRecomputeDebt ? "net debt recomputed from same-filing admitted debt less unrestricted cash" : `${dependent} unavailable until its own composition is reconciled`}` };
        }
        out = { ...out, cashAndCashEquivalents: value, cashAndShortTermInvestments: null, netDebt, fieldConflicts,
          vendorNetDebt: out.vendorNetDebt !== undefined ? out.vendorNetDebt : typeof out.netDebt === "number" && Number.isFinite(out.netDebt) ? out.netDebt : null,
          fieldProvenance: { ...out.fieldProvenance, [field]: sec.evidence,
            ...(canRecomputeDebt ? { netDebt: { ...sec.evidence, tags: [...new Set([...debtProof!.tags, ...sec.evidence.tags])], calculation: "total-debt-minus-unrestricted-cash" } } : {}) } };
        gaps.push({ field: `statements.balance.${row.date}.${field}`, reason, severity: "info", expected: true,
          attemptedSources: evidence.tags.map(t => `edgar:companyfacts/${t}`) });
        continue;
      }
    }
    // FIN-511-V2: a quarter derived from two filings is called derived, never filed.
    const [vendorText, secText] = millionsPair(vendor, value);
    const reason = sec.operands
      ? `vendor/SEC ${field} conflict: derived ${secText} ${unit} for ${sec.evidence.periodStart} through ${sec.evidence.periodEnd} ${derivedFrom(sec)}; vendor ${vendorText}; field unavailable until reconciled`
      : `vendor/SEC ${field} conflict: exact ${sec.evidence.periodStart ?? "instant"} through ${sec.evidence.periodEnd} ${unit}; vendor ${vendorText}, filed ${secText}; field unavailable until reconciled`;
    const fieldConflicts = { ...out.fieldConflicts };
    const unavailable: Record<string, null> = {};
    const dependents = field === "cashAndCashEquivalents" ? [field, "cashAndShortTermInvestments", "netDebt"]
      : field === "cashAtBeginningOfPeriod" || field === "cashAtEndOfPeriod" ? [field, "netChangeInCash"] : [field];
    for (const dependent of dependents) {
      unavailable[dependent] = null;
      if (fieldConflicts[dependent]?.usable === false) continue;
      fieldConflicts[dependent] = { usable: false, vendorValue: typeof out[dependent] === "number" && Number.isFinite(out[dependent]) ? out[dependent] : null,
        secValue: dependent === field ? value : dependent === "netChangeInCash" ? cashAmounts.netChangeInCash?.value ?? null : null,
        secEvidence: dependent === "netChangeInCash" ? cashAmounts.netChangeInCash?.evidence ?? sec.evidence : sec.evidence, reason };
    }
    out = { ...out, ...unavailable, fieldConflicts };
    gaps.push({ field: `statements.${kind}.${row.date}.${field}`, reason, severity: "warn", attemptedSources: [`edgar:companyfacts/us-gaap/${tag}`, `fmp:${kind}-statement`] });
  }
  return { row: out, gaps };
}

/** Same field admission at replay boundaries; never re-open other cash-flow scopes. */
export function admitStockCompensation<T extends FmpStatementRow>(row: T, facts: CompanyFacts, scope: "annual" | "quarter", observedAt: string): { row: T; gaps: ManifestEntry[] } {
  if (!validDay(row.date) || !/^[A-Z]{3}$/.test(row.reportedCurrency ?? "") ||
    (row.cik != null && Number(row.cik) !== facts.cik)) return { row, gaps: [] };
  return admitCashFields(row, facts, row.reportedCurrency!, scope, observedAt, "cashflow",
    { labels: labelCopies(facts, observedAt), withheld: new Set(), unverified: new Map() }, true);
}

/** Cash honors field-level SEC lineage; unproved vendor values use their original filing. */
export function admitBalanceCash<T extends FmpStatementRow>(row: T, facts: CompanyFacts, scope: "annual" | "quarter", observedAt: string): { row: T; gaps: ManifestEntry[] } {
  if (!validDay(row.date) || !/^[A-Z]{3}$/.test(row.reportedCurrency ?? "") ||
      (row.cik != null && Number(row.cik) !== facts.cik)) return { row, gaps: [] };
  return admitCashFields(row, facts, row.reportedCurrency!, scope, observedAt, "balance",
    { labels: [], withheld: new Set(), unverified: new Map() });
}

/** Retain conflicting observations for audit; aliases and dependent FCF cannot launder them. */
function admitOperatingCashFlow<T extends FmpStatementRow>(row: T, facts: CompanyFacts, currency: string, scope: "annual" | "quarter", observedAt: string, ctx: DerivationContext): { row: T; gaps: ManifestEntry[] } {
  if (row.cik != null && row.cik.replace(/^0+/, "") !== String(facts.cik).replace(/^0+/, "")) return { row, gaps: [] };
  const fields = ["operatingCashFlow", "netCashProvidedByOperatingActivities"];
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const canonical = filedOperatingCashFlow(facts, currency, row.date!, scope, observedAt, ctx);
  const sec = canonical ?? (scope === "quarter" ? crossFilingCfoQuarter(facts, currency, row.date!, observedAt) : null);
  if (!sec && fields.some((field) => finite(row[field]))) keptUnverified(ctx, "operatingCashFlow", row.date!, [OPERATING_CASH_FLOW_TAG]);
  if (!sec || (typeof row.periodStart === "string" && row.periodStart !== sec.evidence.periodStart)) return { row, gaps: [] };
  const conflict = fields.some(field => finite(row[field]) && !agreesWithSec(row[field], sec.value, [sec]));
  if (!conflict) return { row, gaps: [] };
  // FIN-511-V2: a quarter derived from two filings is called derived, never filed.
  const secText = sec.operands
    ? `derived ${millions(sec.value)} ${currency} for ${sec.evidence.periodStart} through ${sec.evidence.periodEnd} ${derivedFrom(sec)}`
    : `filed ${millions(sec.value)} ${currency} for ${sec.evidence.periodStart} through ${sec.evidence.periodEnd}`;
  const reason = canonical === null
    ? `Vendor operating cash flow at ${row.date} is refuted by YTD operands ${sec.operands![0]!.val} - ${sec.operands![1]!.val} = ${sec.value} ${currency} across two filings (${sec.evidence.filings.map(f => `${f.form} ${f.accn}, filed ${f.filed}`).join("; ")}). Standalone quarter withheld under the canonical filing-lineage rule; both vendor CFO aliases and dependent FCF withheld; vendor observations retained.`
    : `vendor/SEC operating cash-flow conflict at ${row.date}: ${secText}; vendor observations retained, CFO aliases and dependent standardized FCF unavailable until reconciled`;
  const fieldConflicts = { ...row.fieldConflicts };
  for (const field of [...fields, "freeCashFlow"]) {
    if (fieldConflicts[field]?.usable === false) continue;
    fieldConflicts[field] = {
      vendorValue: finite(row[field]) ? row[field] : null,
      secValue: field === "freeCashFlow" ? null : sec.value,
      usable: false, reason, secEvidence: sec.evidence,
    };
  }
  return { row: { ...row, operatingCashFlow: null, netCashProvidedByOperatingActivities: null, freeCashFlow: null, fieldConflicts },
    gaps: [{ field: `statements.cashflow.${row.date}.operatingCashFlow`, reason, severity: "warn", attemptedSources: ["fmp:cash-flow-statement", "edgar:companyfacts/us-gaap/NetCashProvidedByUsedInOperatingActivities"] }] };
}

/** Generic vendor investment buckets cannot override filed component scope.
 * Only a complete same-interval short-term purchase/sale/maturity set is a
 * comparison here. Mixed long-term investments/intangibles/other assets are
 * not silently classified as financial assets or subtracted from CFI.
 */
function admitInvestmentFlows<T extends FmpStatementRow>(row: T, facts: CompanyFacts, currency: string, scope: "annual" | "quarter", observedAt: string, ctx: DerivationContext): { row: T; gaps: ManifestEntry[] } {
  const tags = ["PaymentsToAcquireShortTermInvestments", "ProceedsFromSaleOfShortTermInvestments", "ProceedsFromMaturitiesPrepaymentsAndCallsOfShorttermInvestments"];
  const parts = tags.map(tag => filedFlow(facts, tag, currency, row.date!, scope, observedAt, false, ctx));
  if (parts.some(part => part === null)) {
    for (const field of ["purchasesOfInvestments", "salesMaturitiesOfInvestments"]) {
      if (typeof row[field] === "number" && Number.isFinite(row[field])) keptUnverified(ctx, field, row.date!, tags);
    }
    return { row, gaps: [] };
  }
  const [purchase, sale, maturity] = parts as Resolved[];
  const evidence = purchase!.evidence;
  if (parts.some(part => part!.evidence.periodStart !== evidence.periodStart || JSON.stringify(part!.evidence.filings) !== JSON.stringify(evidence.filings)) ||
    (typeof row.periodStart === "string" && row.periodStart !== evidence.periodStart) ||
    (validDay(row.filingDate) && !evidence.filings.some(f => f.filed === row.filingDate))) return { row, gaps: [] };
  const expected: Record<string, number> = { purchasesOfInvestments: -purchase!.value, salesMaturitiesOfInvestments: sale!.value + maturity!.value };
  const expectedParts: Record<string, Resolved[]> = { purchasesOfInvestments: [purchase!], salesMaturitiesOfInvestments: [sale!, maturity!] };
  if (!Object.entries(expected).some(([field,value]) => typeof row[field] === "number" && Number.isFinite(row[field]) && !agreesWithSec(row[field], value, expectedParts[field]!))) return { row, gaps: [] };
  // FIN-511-V2: the three parts share their filings, so they are all derived or all filed directly.
  const amounts = purchase!.operands
    ? `derived ${millions(-purchase!.value)} short-term purchases and ${millions(sale!.value + maturity!.value)} sales/maturities ${currency} ` +
      `for ${evidence.periodStart} through ${evidence.periodEnd} ${derivedFrom(purchase!)}`
    : `same-period filed short-term purchases ${millions(-purchase!.value)} and sales/maturities ${millions(sale!.value + maturity!.value)} ${currency}`;
  const reason = `financial-investment classification unreconciled at ${row.date}: ${amounts} differ from generic vendor buckets. Mixed long-term investment/intangible/other payments remain unclassified; financial-asset-adjusted accruals unavailable, with operating accruals disclosed separately.`;
  const fieldConflicts = { ...row.fieldConflicts };
  const secEvidence = { ...evidence, tags: tags.map(tag => `us-gaap/${tag}`) };
  for (const field of [...Object.keys(expected), "otherInvestingActivities"]) if (fieldConflicts[field]?.usable !== false) fieldConflicts[field] = {
    usable: false, vendorValue: typeof row[field] === "number" ? row[field] : null, secValue: null, secEvidence, reason,
  };
  return { row: { ...row, purchasesOfInvestments: null, salesMaturitiesOfInvestments: null, otherInvestingActivities: null, fieldConflicts },
    gaps: [{ field: `statements.cashflow.${row.date}.financialInvestments`, reason, severity: "warn", attemptedSources: tags.map(tag => `edgar:companyfacts/us-gaap/${tag}`) }] };
}

/** Admit debt only after currency is established, including same-filing currency evidence supplied by Stage B. */
export function admitDebtFields<T extends FmpStatementRow>(row: T, facts: CompanyFacts, currency: string | null, observedAt: string, presentations: readonly ExtractedSection[] = []): { row: T; gaps: ManifestEntry[]; admissions: BalanceAdmission[] } {
  const gaps: ManifestEntry[] = [];
  const admissions: BalanceAdmission[] = [];
  if (!validDay(row.date) || currency === null || !/^[A-Z]{3}$/.test(currency)) return { row, gaps, admissions };
  const recovered = recoverNoteCarryingDebt(row, facts, currency, observedAt, presentations);
  if (recovered !== null) return { row: recovered, gaps: [{ field: `statements.balance.${row.date}.totalDebt`,
    reason: "same-filing debt note reconciles principal less discounts to current and noncurrent carrying debt; recognized operating and finance leases added exactly once", severity: "info", expected: true }], admissions };
  let out = row;
  const maturityTag = "LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths";
  const maturitySourced = out.fieldProvenance?.shortTermDebt?.tags.some((tag) => tag === `us-gaap/${maturityTag}`) === true;
  const scopeReason = maturitySourced ? fiscalMaturityScopeReason(instant(facts, maturityTag, currency, row.date, observedAt)?.value ?? null,
    instant(facts, "LongTermDebtMaturitiesRepaymentsOfPrincipalRemainderOfFiscalYear", currency, row.date, observedAt)?.value ?? null) : null;
  // An inclusive LongTermDebt beside the maturity bucket alone: a refused
  // bucket withholds the current/noncurrent split, never the total the
  // statements built from LongTermDebt itself (audit 2026-10-22 B-40).
  const only = (field: "shortTermDebt" | "longTermDebt", tag: string): boolean =>
    out.fieldProvenance?.[field]?.tags.length === 1 && out.fieldProvenance[field]!.tags[0] === `us-gaap/${tag}`;
  // Only the split's own refusals are exempt: the bucket's scope, and the
  // allocation that depended on it. A component refused for any other reason
  // still withholds the total.
  const splitRefusal = (field: string): boolean => {
    const conflict = row.fieldConflicts?.[field];
    return conflict?.usable === false && (field === "shortTermDebt" ? conflict.reason.startsWith("debt maturity scope unresolved:")
      : field === "longTermDebt" && conflict.reason.startsWith("noncurrent carrying debt allocation unavailable:"));
  };
  const splitOnly = only("longTermDebt", "LongTermDebt") && only("shortTermDebt", maturityTag) &&
    typeof row.totalDebt === "number" && Number.isFinite(row.totalDebt) && row.fieldConflicts?.totalDebt?.usable !== false &&
    (scopeReason !== null || (splitRefusal("shortTermDebt") && splitRefusal("longTermDebt")));
  // Preserve raw observations for audit, but an explicitly rejected financing
  // or lease component cannot establish any aggregate's carrying-value basis.
  const refusedComponent = ["shortTermDebt", "longTermDebt", "financeLeaseLiability", "capitalLeaseObligations", "operatingLeaseLiability"]
    .find((field) => row.fieldConflicts?.[field]?.usable === false && !(splitOnly && splitRefusal(field)));
  const componentReason = refusedComponent === undefined ? null
    : `incomplete debt carrying value: ${refusedComponent} is unavailable (${row.fieldConflicts![refusedComponent]!.reason})`;
  // D-133: a noncurrent-only vendor lease line is completed from its filing, or total debt is withheld.
  let leaseLineReason: string | null = null;
  let compositionFallback: string | null = null;
  const oldSumRefusal = row.fieldConflicts?.totalDebt;
  const revisitVendorSum = oldSumRefusal?.usable === false && typeof oldSumRefusal.vendorValue === "number" &&
    Number.isFinite(oldSumRefusal.vendorValue) && oldSumRefusal.vendorValue >= 0 &&
    (row.cik == null || Number(row.cik) === facts.cik) &&
    /^incomplete debt carrying value: the vendor lease line .*?, but the vendor total debt .* is not its short-term debt \+ long-term debt \+ lease line, so its composition is unknown;/.test(oldSumRefusal.reason);
  if (componentReason === null && (row.fieldConflicts?.totalDebt?.usable !== false || revisitVendorSum)) {
    // Re-evaluate only this guard's old refusal. The original observed total
    // is a candidate for scope proof, never a fallback admitted by itself.
    const candidate = revisitVendorSum ? { ...out, totalDebt: oldSumRefusal!.vendorValue } : out;
    const completion = completeNoncurrentLeaseLine(candidate, facts, currency, observedAt);
    if (completion.status === "completed") {
      out = completion.row;
      if (revisitVendorSum) {
        const fieldConflicts = { ...out.fieldConflicts };
        for (const field of ["totalDebt", "netDebt"]) {
          if (fieldConflicts[field]?.usable === false && fieldConflicts[field]!.reason === oldSumRefusal!.reason) delete fieldConflicts[field];
        }
        const cashRefusal = row.fieldConflicts?.cashAndCashEquivalents;
        if (cashRefusal?.usable === false && fieldConflicts.netDebt?.usable !== false) {
          fieldConflicts.netDebt = { ...cashRefusal, secValue: null, vendorValue: row.fieldConflicts?.netDebt?.vendorValue ?? null };
        }
        out = { ...out, fieldConflicts };
      }
      admissions.push(completion.admission);
    } else if (completion.status === "refused") leaseLineReason = completion.reason;
  }
  // Broader exact scopes (operating-only leases, current leases in vendor
  // debt, or omitted current debt) still require one reconciled filing.
  if (componentReason === null && admissions.length === 0) {
    const completion = completeFiledDebtScope(out, facts, currency, observedAt);
    if (completion.status === "completed") {
      out = completion.row;
      admissions.push(completion.admission);
      leaseLineReason = null;
    } else if (completion.status === "refused") {
      // A failed composition attempt establishes no particular missing fact.
      // Keep it only when the independent guards below find no specific cause;
      // otherwise repeat admission can erase a filed-current-debt qualification.
      if (completion.fallback) compositionFallback = completion.reason;
      else leaseLineReason ??= completion.reason;
    }
  }
  let presentationReason: string | null = null;
  const longTerm = out.fieldProvenance?.longTermDebt;
  const tagged = longTerm?.tags.includes("us-gaap/LongTermDebt") && longTerm.unit === currency && longTerm.periodEnd === row.date
    ? instant(facts, "LongTermDebt", currency, row.date, observedAt) : null;
  const tagFiling = tagged?.evidence.filings[0];
  const source = tagFiling && longTerm?.filings.some((filing) => filing.accn === tagFiling.accn && filing.filed === tagFiling.filed)
    ? presentations.find((section) => section.accession === tagFiling.accn && section.form === tagFiling.form && section.filingDate === tagFiling.filed && section.filingDate <= observedAt.slice(0, 10)) : undefined;
  if (componentReason === null && !splitOnly && source && tagged && tagFiling) {
    const maturities = instant(facts, "LongTermDebtCurrent", currency, row.date, observedAt);
    const maturityFiling = maturities?.evidence.filings[0];
    const currentMaturities = maturityFiling?.accn === tagFiling.accn && maturityFiling.filed === tagFiling.filed ? maturities!.value : null;
    const presentation = reconcileDebtPresentation({ text: source.statementsText ?? source.text, periodEnd: row.date, currency,
      tagValue: tagged.value, currentMaturities, source, tagSource: { cik: String(facts.cik), accession: tagFiling.accn,
        filingDate: tagFiling.filed, periodEnd: row.date, unit: currency } });
    if (presentation.status === "conflict") presentationReason = `debt presentation conflict: ${presentation.reason}`;
    if (presentation.status === "established" && out.fieldConflicts?.longTermDebt?.usable !== false) {
      const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
      const same = vendorAgreesWithFiled;
      const oldLong = finite(out.longTermDebt), oldCurrent = finite(out.shortTermDebt), oldTotal = finite(out.totalDebt);
      const noncurrent = presentation.noncurrentDebt!;
      if (oldLong === null || (!same(oldLong, tagged.value) && (currentMaturities === null || !same(oldLong, tagged.value - currentMaturities))) ||
          (presentation.currentDebt !== null && (oldCurrent === null || !same(oldCurrent, presentation.currentDebt)))) {
        presentationReason = "debt presentation conflict: resolved debt components do not match the same-filing carrying lines or the established taxonomy adjustment";
      } else {
        const delta = noncurrent - oldLong;
        const evidence = { ...longTerm!, tags: [...new Set([...longTerm!.tags, ...presentation.evidence!.tags])] };
        out = { ...out, longTermDebt: noncurrent, fieldProvenance: { ...out.fieldProvenance, longTermDebt: evidence } };
        if (delta !== 0) {
          const componentSum = (oldCurrent ?? 0) + oldLong + (finite(out.capitalLeaseObligations) ?? 0);
          if (oldTotal === null || out.fieldConflicts?.totalDebt?.usable === false || !same(oldTotal, componentSum)) {
            presentationReason = "debt presentation conflict: total debt does not reconcile to the resolved current, noncurrent and lease components";
          } else {
            const totalDebt = oldTotal + delta;
            const cash = finite(out.cashAndCashEquivalents), oldNet = finite(out.netDebt);
            out = { ...out, totalDebt, netDebt: cash !== null && oldNet !== null && same(oldNet, oldTotal - cash) ? totalDebt - cash : null };
          }
          gaps.push({ field: `statements.balance.${row.date}.longTermDebt`, reason: presentation.reason, severity: "info", expected: true });
        }
      }
    }
    if (presentationReason !== null) out = { ...out, longTermDebt: null, fieldConflicts: { ...out.fieldConflicts, longTermDebt: {
      vendorValue: typeof row.longTermDebt === "number" ? row.longTermDebt : null, secValue: null, usable: false, reason: presentationReason,
    } } };
  }
  if (scopeReason !== null) {
    out = { ...out, shortTermDebt: null, fieldConflicts: { ...out.fieldConflicts, shortTermDebt: {
      vendorValue: typeof row.shortTermDebt === "number" ? row.shortTermDebt : null, secValue: null, usable: false, reason: scopeReason,
    } } };
    gaps.push({ field: `statements.balance.${row.date}.shortTermDebt`, reason: scopeReason, severity: "warn" });
    // LongTermDebt less a refused bucket is not noncurrent debt either.
    if (splitOnly && out.fieldConflicts?.longTermDebt?.usable !== false) out = { ...out, longTermDebt: null, fieldConflicts: { ...out.fieldConflicts, longTermDebt: {
      vendorValue: typeof row.longTermDebt === "number" ? row.longTermDebt : null, secValue: null, usable: false,
      reason: "noncurrent carrying debt allocation unavailable: LongTermDebt includes current maturities, but the fiscal maturity bucket was rejected as current carrying debt",
    } } };
  }
  const aggregate = instant(facts, "DebtInstrumentCarryingAmount", currency, row.date, observedAt);
  // A gross/principal combined observation is not a missing carrying
  // component when one filing explicitly bridges it to the inclusive carrying
  // total. The adjustment is signed; neither its magnitude nor its sign is guessed.
  const carrying = instant(facts, "LongTermDebt", currency, row.date, observedAt);
  const gross = instant(facts, "DebtLongtermAndShorttermCombinedAmount", currency, row.date, observedAt);
  const carryingFiling = carrying?.evidence.filings[0];
  const adjustments = tagsFor("debtCarryingAdjustment").flatMap(tag => points(facts, tag, currency, observedAt)
    .filter(p => !p.start && p.end === row.date && p.accn === carryingFiling?.accn && p.filed === carryingFiling.filed && p.form === carryingFiling.form));
  const adjustment = unambiguousNewest(adjustments);
  const financing = typeof out.shortTermDebt === "number" && typeof out.longTermDebt === "number" ? out.shortTermDebt + out.longTermDebt : null;
  const grossReconciled = (row.cik == null || Number(row.cik) === facts.cik) && carrying !== null && gross !== null && adjustment !== null && adjustment.val !== 0 &&
    gross.evidence.filings.some(f => f.accn === carryingFiling?.accn && f.filed === carryingFiling.filed && f.form === carryingFiling.form) &&
    financing !== null && vendorAgreesWithFiled(financing, carrying.value) &&
    Math.abs(gross.value + adjustment.val - carrying.value) <= Math.max(1, Math.abs(carrying.value) * 1e-6);
  if (grossReconciled) {
    const reason = `same-filing gross debt ${millions(gross!.value)} plus signed discount/premium and issuance costs ${millions(adjustment!.val)} reconciles to carrying debt ${millions(carrying!.value)} ${currency}; the gross amount is not an omitted borrowing`;
    gaps.push({ field: `statements.balance.${row.date}.totalDebt`, reason, severity: "info", expected: true });
    const conflict = out.fieldConflicts?.totalDebt;
    if (conflict?.usable === false && conflict.reason.startsWith("incomplete debt carrying value: same-period DebtLongtermAndShorttermCombinedAmount ") &&
        typeof conflict.vendorValue === "number" && vendorAgreesWithFiled(conflict.vendorValue, financing! + (typeof out.capitalLeaseObligations === "number" ? out.capitalLeaseObligations : 0))) {
      const fieldConflicts = { ...out.fieldConflicts };
      delete fieldConflicts.totalDebt;
      if (fieldConflicts.netDebt?.reason === conflict.reason) delete fieldConflicts.netDebt;
      const cash = out.fieldConflicts?.cashAndCashEquivalents?.usable === false ? null : out.cashAndCashEquivalents;
      out = { ...out, totalDebt: conflict.vendorValue, netDebt: typeof cash === "number" ? conflict.vendorValue - cash : null, fieldConflicts };
    }
  }
  const inclusiveTotal = splitOnly ? instant(facts, "LongTermDebt", currency, row.date, observedAt)?.value ?? null : null;
  const convertibleReason = omittedConvertibleCarryingReason({ longTermDebt: splitOnly ? inclusiveTotal : out.longTermDebt }, instant(facts, "ConvertibleLongTermNotesPayable", currency, row.date, observedAt)?.value ?? null, vendorAgreesWithFiled);
  // A vendor short-term debt of 0 beside a filed current debt (D-133); a field the SEC statements built carries its tags.
  // Review m4: a vendor long-term debt that already holds the same filing's current maturities left nothing out.
  const filedCurrent = Object.fromEntries([...CURRENT_DEBT_TAGS, "LongTermDebtNoncurrent"].map((tag) => {
    const fact = instant(facts, tag, currency, row.date!, observedAt);
    return [tag, fact === null ? null : { value: fact.value, accn: fact.evidence.filings[0]?.accn }];
  }));
  const zeroCurrentReason = out.fieldProvenance?.shortTermDebt !== undefined || currentMaturitiesFoldedIn(out.longTermDebt, filedCurrent) ? null
    : zeroCurrentDebtReason(out.shortTermDebt, CURRENT_DEBT_TAGS.map((tag) => ({ tag, value: filedCurrent[tag]?.value ?? null })));
  const reason = componentReason ?? leaseLineReason ?? presentationReason ?? convertibleReason ?? zeroCurrentReason ??
    (scopeReason !== null && !splitOnly ? `incomplete debt carrying value: ${scopeReason}` : incompleteDebtReason(splitOnly ? { shortTermDebt: 0,
      longTermDebt: inclusiveTotal, financeLeaseLiability: out.financeLeaseLiability, totalDebt: out.totalDebt }
      : { shortTermDebt: out.shortTermDebt, longTermDebt: out.longTermDebt, financeLeaseLiability: out.financeLeaseLiability, totalDebt: out.totalDebt }, aggregate?.value ?? null)) ??
    // The statements builder's tagged-total check (B-14), for vendor rows that
    // never pass through it: a same-period total above the composed components
    // shows one is missing. A kept inclusive total has no split to compose.
    (splitOnly ? null : uncomposedDebtReason({ shortTermDebt: out.shortTermDebt, longTermDebt: out.longTermDebt, financeLeaseLiability: out.financeLeaseLiability },
      DEBT_AGGREGATE_TAGS.filter(tag => !(grossReconciled && tag === "DebtLongtermAndShorttermCombinedAmount"))
        .map((tag) => ({ tag, value: instant(facts, tag, currency, row.date!, observedAt)?.value ?? null })))) ?? compositionFallback;
  for (const field of ["totalDebt", "netDebt"] as const) {
    const prior = out.fieldConflicts?.[field];
    if (reason === null && prior?.usable !== false) continue;
    const refusal = reason ?? prior!.reason;
    out = { ...out, [field]: null, fieldConflicts: { ...out.fieldConflicts, [field]: {
      vendorValue: prior?.vendorValue ?? (typeof row[field] === "number" ? row[field] as number : null),
      secValue: null, usable: false, reason: refusal, ...(aggregate ? { secEvidence: aggregate.evidence } : {}),
    } } };
    if (reason !== null) gaps.push({ field: `statements.balance.${row.date}.${field}`, reason, severity: "warn" });
  }
  // Acquisition can complete a row before Stage B sees it. Retain the minor
  // comparison in a bounded manifest entry in either order, rather than lose
  // its qualification when the completed field already carries provenance.
  const retainedTotal = out.fieldConflicts?.totalDebt;
  if (retainedTotal?.usable === true && retainedTotal.resolution === "filed-family" &&
      retainedTotal.reason.startsWith("vendor total ") && retainedTotal.reason.includes("minor difference retained")) {
    admissions.push({ kind: "minor-debt-total", date: row.date!, detail: retainedTotal.reason, summary: retainedTotal.reason });
  }
  return { row: out, gaps, admissions };
}

/**
 * Review m6 (2026-10-29): one row's lease-line completion or stake fill. The
 * row keeps its own provenance; the manifest gets one entry per kind listing
 * the dates (`balanceAdmissionEntries`), not one entry per row: on report #51
 * the per-row entries were 51 entries and about 25K characters in every LLM pass.
 */
export interface BalanceAdmission {
  kind: "completion" | "filing-completion" | "minor-debt-total" | "stakes";
  date: string;
  /** The row's full explanation; the merged entry quotes the latest date's. */
  detail: string;
  /** The date's figures, in millions, for the merged entry's list. */
  summary: string;
  attemptedSources?: string[];
}

/** One info entry per kind (completion, stakes), newest date first, a date counted once across the annual and quarterly families. */
export function balanceAdmissionEntries(admissions: readonly BalanceAdmission[]): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  for (const kind of ["completion", "filing-completion", "minor-debt-total", "stakes"] as const) {
    const byDate = new Map<string, BalanceAdmission>();
    for (const admission of admissions) if (admission.kind === kind && !byDate.has(admission.date)) byDate.set(admission.date, admission);
    const dated = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
    if (dated.length === 0) continue;
    const dates = `${dated.length} balance date${dated.length === 1 ? "" : "s"}`;
    const list = dated.map((admission) => `${admission.date} ${admission.summary}`).join("; ");
    const sources = [...new Set(dated.flatMap((admission) => admission.attemptedSources ?? []))];
    entries.push(kind === "completion"
      ? { field: "statements.balance.totalDebt", severity: "info", expected: true,
        reason: `vendor lease line held only the noncurrent lease liabilities at ${dates}; total debt completed from each date's filing, the vendor total retained in the raw row: ${list}. Latest: ${dated[0]!.detail}` }
      : kind === "filing-completion" ? { field: "statements.balance.totalDebt", severity: "info", expected: true,
        reason: `vendor debt scopes completed from one same-period filing at each of ${dates}; raw vendor values retained: ${list}. Latest: ${dated[0]!.detail}` }
      : kind === "minor-debt-total" ? { field: "statements.balance.totalDebt.minorDifference", severity: "info", expected: true,
        reason: `minor vendor-total differences after debt-scope reconciliation at ${dates}: ${list}` }
      : { field: "statements.balance.longTermInvestments", severity: "info", expected: true,
        reason: `vendor longTermInvestments read as undisclosed at ${dates}; filled with the D-98 chain from the same-period filing, the vendor value retained in the raw row: ${list}. Latest: ${dated[0]!.detail}`,
        ...(sources.length > 0 ? { attemptedSources: sources } : {}) });
  }
  return entries;
}

type LeaseLineCompletion<T> = { status: "none" } | { status: "completed"; row: T; admission: BalanceAdmission }
  | { status: "refused"; reason: string; fallback?: true };

/** D-202: measured after scope proof, independently of valuation outcomes.
 * The scoped panel's minor cluster ends at 0.2051%; the next gap is 0.8665%.
 * No absolute monetary floor: a small issuer gets the same relative boundary. */
const MINOR_DEBT_TOTAL_SHARE = 0.005;
const debtTotalAgrees = (vendor: number, components: number): boolean =>
  Math.abs(vendor - components) <= MINOR_DEBT_TOTAL_SHARE * Math.max(Math.abs(vendor), Math.abs(components));
function debtTotalComparison(vendor: number, components: number): string {
  const [vendorText, componentsText] = millionsPair(vendor, components);
  const pct = Math.max(Math.abs(vendor), Math.abs(components)) === 0 ? 0
    : 100 * Math.abs(vendor - components) / Math.max(Math.abs(vendor), Math.abs(components));
  return `vendor total ${vendorText} versus component sum ${componentsText} (${pct.toFixed(6)}% difference; 0.5% minor-difference limit)`;
}
function minorDebtTotalNote(vendor: number, components: number): string {
  return vendor === components ? "" : `${debtTotalComparison(vendor, components)}; minor difference retained as a qualification, not filed equality; reconciled components used with no balancing plug; `;
}

/** Current instrument-level borrowings. A positive one means current debt exists
 * even when a filer tags none of the aggregates. */
const INSTRUMENT_CURRENT_DEBT_TAGS: readonly string[] = (["longTermNotesAndLoansCurrent", "longTermDebtNotesCurrent", "longTermDebtLoansCurrent",
  "longTermDebtSecuredCurrent", "longTermDebtConvertibleCurrent", "longTermDebtRevolverCurrent"] as const).flatMap(tagsFor);
/** Every supported borrowing family beyond the aggregates. Vendor zero borrowings
 * are not accepted while any of these reports a positive amount. */
const INSTRUMENT_DEBT_TAGS: readonly string[] = [...INSTRUMENT_CURRENT_DEBT_TAGS,
  ...(["longTermNotesAndLoans", "debtCombinedTotal", "longTermDebtNotes", "longTermDebtLoans", "longTermDebtSecured",
    "longTermDebtConvertible", "longTermDebtRevolver", "debtInstrumentAggregate"] as const).flatMap(tagsFor)];

/** Scoped component completion, never a principal-total or historical substitute.
 * The older D-133 path remains first. This path also recognizes operating-only
 * vendor lease lines and explicitly tagged debt-and-finance-lease scopes. */
function completeFiledDebtScope<T extends FmpStatementRow>(row: T, facts: CompanyFacts, unit: string, observedAt: string): LeaseLineCompletion<T> {
  const none = { status: "none" } as const;
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (row.fieldProvenance?.capitalLeaseObligations || row.fieldProvenance?.longTermDebt ||
      !finite(row.longTermDebt) || !finite(row.capitalLeaseObligations) || !finite(row.shortTermDebt) ||
      (row.cik != null && Number(row.cik) !== facts.cik)) return none;
  // Only our incomplete-scope refusals may be revisited. Collapse,
  // plausibility, vendor/SEC conflicts and refused components stay refused.
  const recoverable = /^incomplete debt carrying value: (?:the vendor (?:lease line|short-term debt)|same-period )/;
  const refusedCash = row.fieldConflicts?.cashAndCashEquivalents;
  const cashOnlyNetRefusal = refusedCash?.usable === false && row.fieldConflicts?.netDebt?.usable === false &&
    row.fieldConflicts.netDebt.reason === refusedCash.reason;
  for (const field of ["totalDebt", "netDebt"]) {
    const conflict = row.fieldConflicts?.[field];
    if (field === "netDebt" && cashOnlyNetRefusal) continue;
    if (conflict?.usable === false && !recoverable.test(conflict.reason)) return none;
  }
  const vendorTotal = row.totalDebt ?? row.fieldConflicts?.totalDebt?.vendorValue;
  const at = (tag: string) => points(facts, tag, unit, observedAt).filter(p => p.end === row.date && p.start === undefined && p.val >= 0);
  const zeroBorrowings = row.longTermDebt === 0 && row.shortTermDebt === 0 &&
    [...tagsFor("longTermDebt"), ...CURRENT_DEBT_TAGS, COMBINED_CURRENT_DEBT_TAG, ...DEBT_AGGREGATE_TAGS, ...INSTRUMENT_DEBT_TAGS]
      .every(tag => at(tag).every(p => p.val === 0));
  const anchors = ["LongTermDebtNoncurrent", "LongTermNotesAndLoans", "LongTermDebtAndCapitalLeaseObligations",
    ...(zeroBorrowings ? ["OperatingLeaseLiabilityNoncurrent"] : [])];
  const filings = [...new Map(anchors.flatMap(at).sort((a, b) => b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn))
    .map(p => [p.accn, { accn: p.accn, filed: p.filed, form: p.form }] as const)).values()]
    .sort((a, b) => Number(b.filed === row.filingDate) - Number(a.filed === row.filingDate));
  let refusal: LeaseLineCompletion<T> = none;
  for (const filing of filings) {
    const used: string[] = [];
    const notesScope = at("LongTermNotesAndLoans").some(p => p.accn === filing.accn) && !at("LongTermDebtNoncurrent").some(p => p.accn === filing.accn);
    const own = (tag: string): number | null => {
      const ps = at(tag).filter(p => p.accn === filing.accn);
      const values = [...new Set(ps.map(p => p.val))];
      if (values.length > 1) throw new Error(`ambiguous ${tag}`);
      if (values.length === 0 && CURRENT_DEBT_TAGS.includes(tag) && at(tag).length > 0 && !(notesScope && tag === "DebtCurrent")) throw new Error(`current debt ${tag} only in another filing`);
      if (values.length === 1) used.push(tag);
      return values[0] ?? null;
    };
    const eq = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 1e-6);
    try {
      const lease = (prefix: "Operating" | "Finance") => {
        const tag = `${prefix}LeaseLiability`;
        const total = own(tag), current = own(`${tag}Current`), noncurrent = own(`${tag}Noncurrent`);
        if (incompatibleLeaseMaturities(total, current, noncurrent)) throw new Error(`contradictory ${tag}`);
        if (total !== null && current !== null) return { total, current, noncurrent: total - current, split: true, assumed: false, tags: [tag] };
        if (current !== null && noncurrent !== null) return { total: current + noncurrent, current, noncurrent, split: true, assumed: false, tags: [`${tag}Current`, `${tag}Noncurrent`] };
        if (total === 0 && (current === null || current === 0) && (noncurrent === null || noncurrent === 0)) return { total: 0, current: 0, noncurrent: 0, split: true, assumed: false, tags: [tag] };
        if (total !== null && current === null && noncurrent === null) return { total, current: 0, noncurrent: 0, split: false, assumed: false, tags: [tag] };
        if (prefix === "Operating" && total === null && current === null && noncurrent !== null) {
          return { total: noncurrent, current: 0, noncurrent, split: false, assumed: false, partial: true, tags: [`${tag}Noncurrent`] };
        }
        const synonyms = tagsFor(prefix === "Finance" ? "financeLeaseLiability" : "operatingLeaseLiability");
        const family = [...new Set([...synonyms.flatMap(t => [t, `${t}Current`, `${t}Noncurrent`]),
          ...tagsFor(prefix === "Finance" ? "financeLeaseLiabilityParts" : "operatingLeaseLiabilityParts")])];
        if (family.every(t => at(t).length === 0)) return { total: 0, current: 0, noncurrent: 0, split: true, assumed: true, tags: [] };
        throw new Error(`incomplete ${tag}`);
      };
      const op = lease("Operating"), fin = lease("Finance");
      const pure = own("LongTermDebtNoncurrent") ?? own("LongTermNotesAndLoans"), combined = own("LongTermDebtAndCapitalLeaseObligations");
      if (combined !== null && !fin.split) continue;
      // Both scopes filed: debt including finance leases must equal pure debt plus the
      // noncurrent finance lease, also when that lease is zero (PR #86 review).
      if (pure !== null && combined !== null && !eq(combined, pure + fin.noncurrent)) throw new Error("ambiguous noncurrent finance-lease overlap");
      const noncurrent = pure ?? (combined === null ? zeroBorrowings ? 0 : null : combined - fin.noncurrent);
      const line = row.capitalLeaseObligations as number;
      // An unproven provider zero is undisclosed when the same filing shows
      // real leases. Complete the debt composition below; never merely ignore
      // the contradictory zero or subtract leases from borrowings-only debt.
      const undisclosedZero = line === 0 && op.total + fin.total > 0;
      // A separately repeated noncurrent lease line can duplicate the very
      // same amount embedded in vendor long-term debt. Both amounts must
      // reconcile to this filing before composing financing debt plus leases.
      const noncurrentLeaseLine = line > 0 && [op.noncurrent, op.noncurrent + fin.noncurrent].some(v => eq(line, v));
      const operatingInLong = (undisclosedZero || noncurrentLeaseLine) && op.noncurrent > 0 && noncurrent !== null &&
        [noncurrent + op.noncurrent, noncurrent + op.noncurrent + fin.noncurrent].some(v => eq(row.longTermDebt as number, v));
      if (noncurrent === null || noncurrent < 0 || !(vendorAgreesWithFiled(row.longTermDebt as number, noncurrent) ||
          combined !== null && vendorAgreesWithFiled(row.longTermDebt as number, combined) || operatingInLong)) continue;
      if (!undisclosedZero && ![op.total, op.noncurrent, op.total + fin.total, op.noncurrent + fin.noncurrent].some(v => eq(line, v))) continue;
      const refuse = (why: string, fallback = false): LeaseLineCompletion<T> => ({ status: "refused",
        reason: `incomplete debt carrying value: same-filing completion refused: ${why}`, ...(fallback ? { fallback: true as const } : {}) });
      // An unsuccessful zero-line repair keeps the prior admission decision;
      // the independent lease-integrity guard still withholds its bridge.
      // It must not introduce a new debt-field refusal and alter other scores.
      refusal = !undisclosedZero && line < op.total + fin.total ? refuse("current debt or vendor composition cannot be reconciled", true) : none;
      if (undisclosedZero && ([row.capitalLeaseObligationsCurrent, row.capitalLeaseObligationsNonCurrent]
        .some(v => v != null && (!finite(v) || v !== 0)) || !notesScope &&
        INSTRUMENT_CURRENT_DEBT_TAGS.some(tag => (own(tag) ?? 0) > 0))) {
        throw new Error("vendor zero has a contradictory lease split or unresolved current notes");
      }
      const ltd = own("LongTermDebtCurrent") ?? (notesScope ? own("NotesAndLoansPayableCurrent") ?? own("NotesPayableCurrent") : null), dc = own("DebtCurrent"), both = own(COMBINED_CURRENT_DEBT_TAG);
      const stb = own("ShortTermBorrowings"), cp = own("CommercialPaper");
      // A separate finance family or competing inclusive current total leaves
      // this overlap unresolved without pure maturities. Otherwise the stated
      // finance-materiality assumption applies and the vendor current amount
      // must still reconcile to combined maturities plus separate borrowings.
      if (ltd === null && both !== null && (dc !== null || stb !== null || cp !== null) && (!fin.assumed || dc !== null)) continue;
      const borrowing = stb ?? cp ?? 0;
      if (stb !== null && cp !== null && cp > stb && !eq(cp, stb)) throw new Error("commercial paper exceeds inclusive short-term borrowings");
      const components = ltd !== null ? ltd + borrowing : both !== null ? both - fin.current + borrowing : stb !== null || cp !== null ? borrowing : null;
      // DebtCurrent is the inclusive balance-sheet line; maturities are a
      // subset, not another amount to add to it. A smaller aggregate contradicts.
      // When it equals the pure amount plus the current finance lease, that lease
      // is inside it and already counted in the finance total, so keep the pure amount.
      const dcHoldsFinanceLease = dc !== null && components !== null && fin.current > 0 && eq(dc, components + fin.current);
      const current = dc !== null && !dcHoldsFinanceLease && (components === null || dc >= components) ? dc : components ?? (zeroBorrowings || undisclosedZero && row.shortTermDebt === 0 &&
        CURRENT_DEBT_TAGS.every(tag => at(tag).length === 0) && at(COMBINED_CURRENT_DEBT_TAG).length === 0 ? 0 : null);
      if (current === null) {
        if (eq(line, op.total + fin.total)) refusal = none;
        continue;
      }
      if (current < 0) continue;
      if (dc !== null && !eq(dc, current) && !dcHoldsFinanceLease) continue;
      if (ltd !== null && both !== null && !eq(both, ltd + fin.current)) continue;
      const short = row.shortTermDebt as number;
      const currentScopes = current > 0 && (ltd !== null || both !== null || dc !== null)
        ? [current, current + op.current, current + fin.current, current + op.current + fin.current] : [current];
      if (short !== 0 && !currentScopes.some(v => eq(short, v))) continue;
      if (!finite(vendorTotal)) continue;
      for (const [field, value] of [["operatingLeaseLiability", op.total], ["financeLeaseLiability", fin.total]] as const) {
        if (row[field] != null && !eq(row[field] as number, value)) throw new Error(`contradictory ${field}`);
      }
      const vendorComponents = short + (row.longTermDebt as number) + line;
      if (!debtTotalAgrees(vendorTotal, vendorComponents)) {
        refusal = refuse(`${debtTotalComparison(vendorTotal, vendorComponents)} exceeds the minor-difference limit; total and net debt withheld`);
        continue;
      }
      const totalNote = minorDebtTotalNote(vendorTotal, vendorComponents);
      const leases = op.total + fin.total, totalDebt = current + noncurrent + leases;
      if (row.fieldConflicts?.totalDebt?.usable !== false && !("partial" in op) && totalDebt === vendorTotal && eq(line, leases) && eq(short, current) && eq(row.longTermDebt as number, noncurrent)) return none;
      const evidence: StatementFieldProvenance = { source: "edgar", unit, observedAt, periodStart: null, periodEnd: row.date!,
        tags: [...new Set(used)].map(t => `us-gaap/${t}`), filings: [filing], calculation: "same-filing-debt-completed" };
      const fieldConflicts = { ...row.fieldConflicts };
      delete fieldConflicts.totalDebt;
      if (totalNote) fieldConflicts.totalDebt = { usable: true, vendorValue: vendorTotal, secValue: totalDebt,
        resolution: "filed-family", reason: `${totalNote}completed debt ${millions(totalDebt)} ${unit}` };
      if (!cashOnlyNetRefusal) delete fieldConflicts.netDebt;
      if (refusedCash?.usable === false) fieldConflicts.netDebt = { ...refusedCash, secValue: null,
        vendorValue: row.fieldConflicts?.netDebt?.vendorValue ?? (finite(row.netDebt) ? row.netDebt : null) };
      // Lease components retain the exact filed scope that established their
      // amounts. The union and calculation describe the debt composition only;
      // copying them onto a lease field conceals a disclosed single maturity.
      const leaseEvidence = (tags: string[]): StatementFieldProvenance => ({ source: "edgar", unit, observedAt,
        periodStart: null, periodEnd: row.date!, filings: [filing], tags: tags.map(t => `us-gaap/${t}`) });
      const fieldProvenance = { ...row.fieldProvenance,
        ...Object.fromEntries(["shortTermDebt", "longTermDebt", "capitalLeaseObligations", "totalDebt"].map(f => [f, evidence])),
        ...(!op.assumed ? { operatingLeaseLiability: leaseEvidence(op.tags) } : {}),
        ...(!fin.assumed ? { financeLeaseLiability: leaseEvidence(fin.tags) } : {}) };
      return { status: "completed", row: { ...row, shortTermDebt: current, longTermDebt: noncurrent, capitalLeaseObligations: leases,
        operatingLeaseLiability: op.total, financeLeaseLiability: fin.total, totalDebt,
        netDebt: finite(row.cashAndCashEquivalents) && row.fieldConflicts?.cashAndCashEquivalents?.usable !== false ? totalDebt - row.cashAndCashEquivalents : null,
        vendorNetDebt: row.vendorNetDebt ?? row.netDebt ?? row.fieldConflicts?.netDebt?.vendorValue ?? null,
        fieldConflicts, fieldProvenance } as T,
        admission: { kind: "filing-completion", date: row.date!, summary: `${millions(totalDebt)} (vendor ${millions(vendorTotal)}; ${filing.accn})`,
          detail: `same-filing ${filing.form} ${filing.accn} at ${row.date}: current financing debt ${millions(current)} + noncurrent financing debt ${millions(noncurrent)} + operating leases ${millions(op.total)} + finance leases ${millions(fin.total)} = total debt ${millions(totalDebt)} ${unit}; ${"partial" in op ? "only the disclosed noncurrent operating portion is embedded and cancels on the lease-excluded basis; full operating-lease coverage remains unverified; " : ""}${zeroBorrowings ? "vendor zero borrowings retained with no separately disclosed borrowing; not a filed zero; " : ""}${fin.assumed ? "finance leases not separately material is an assumption from absent separate ASC 842 disclosure, not a filed zero; " : ""}${undisclosedZero ? "undisclosed vendor lease zero replaced by filed liabilities; " : ""}${operatingInLong ? "noncurrent operating leases inside vendor long-term debt counted once; " : ""}${totalNote || "vendor component scopes reconciled exactly; "}${[...new Set(used)].join(", ")}` } };
    } catch { /* Ambiguous or incomplete facts never authorize a completion. */ }
  }
  return refusal;
}

/**
 * Audit 2026-10-29, AMZN report #51 (VAL-1, FIG-1, GRD-01; D-133). A vendor
 * lease line can be the balance sheet's NONCURRENT lease liabilities ("Long-term
 * lease liabilities"), with the current lease portion and the current debt left
 * out of the vendor's total debt. SEC enrichment then puts the TOTAL lease
 * liabilities beside it, and the lease guard refuses the row as contradictory.
 *
 * The line is noncurrent-only when, at the row's period end and currency, it
 * equals OperatingLeaseLiabilityNoncurrent + FinanceLeaseLiabilityNoncurrent
 * (the finance part only when filed; a filer with no finance lease, every
 * recognised finance-lease synonym absent, uses the operating part alone)
 * within the lease guard's tolerance, both from one
 * filing, and the vendor's current lease portion is 0 or absent. The row is
 * then recomposed from that filing: the lease line becomes the operating plus
 * finance lease TOTALS; a vendor short-term debt of 0 or absent becomes the
 * filed current debt (LongTermDebtCurrent, plus ShortTermBorrowings and
 * CommercialPaper where tagged, CommercialPaper left out beside
 * ShortTermBorrowings); total debt is current + noncurrent debt +
 * leases; net debt is recomputed as the note recovery does. A nonzero vendor
 * short-term debt is kept, never added to. Anything the filing cannot
 * establish, or that does not reconcile with it, withholds total debt instead.
 *
 * Every filing that tags the operating noncurrent part at the instant is tried,
 * newest first, and the first that establishes the whole composition is used:
 * a later 10-K repeats the prior year-end's balance sheet but not always its
 * debt note, so a part tagged at that instant only in another filing makes this
 * one incomplete; two filings are never mixed.
 */
function completeNoncurrentLeaseLine<T extends FmpStatementRow>(row: T, facts: CompanyFacts, currency: string, observedAt: string): LeaseLineCompletion<T> {
  const none = { status: "none" } as const;
  const line = row.capitalLeaseObligations;
  // A vendor field only: a lease line the SEC statements built carries its tags.
  if (typeof line !== "number" || !Number.isFinite(line) || line < 0 || row.fieldProvenance?.capitalLeaseObligations !== undefined) return none;
  const lineCurrent = row.capitalLeaseObligationsCurrent;
  if (lineCurrent != null && lineCurrent !== 0) return none;
  const date = row.date!;
  const atInstant = (tag: string) => points(facts, tag, currency, observedAt).filter((p) => p.end === date && p.start === undefined && p.val >= 0);
  const filings = [...new Map(atInstant("OperatingLeaseLiabilityNoncurrent")
    .sort((a, b) => b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn))
    .map((p) => [p.accn, { accn: p.accn, filed: p.filed, form: p.form }] as const)).values()];
  let refusal: LeaseLineCompletion<T> | null = null;
  for (const filing of filings) {
    const result = completeFromFiling(row, line, filing, atInstant, currency, observedAt);
    if (result.status === "total") return none;
    if (result.status === "completed") return result;
    if (result.status === "refused") refusal ??= result;
  }
  return refusal ?? none;
}

/** One filing's attempt; "total" when the line already is that filing's total lease liabilities. */
function completeFromFiling<T extends FmpStatementRow>(row: T, line: number, filing: { accn: string; filed: string; form: string },
  atInstant: (tag: string) => FactPoint[], currency: string, observedAt: string): LeaseLineCompletion<T> | { status: "total" } {
  const none = { status: "none" } as const;
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const date = row.date!;
  const tolerance = (whole: number) => Math.max(1, Math.abs(whole) * 1e-6); // leaseDebtConflict's tolerance
  /** The tag's value in THIS filing: null when the filer tagged it nowhere for the instant, "elsewhere" when only another filing (or an ambiguous pair) holds it. */
  const inFiling = (tag: string): number | null | "elsewhere" => {
    const all = atInstant(tag);
    const own = [...new Set(all.filter((p) => p.accn === filing.accn).map((p) => p.val))];
    return own.length === 1 ? own[0]! : all.length > 0 ? "elsewhere" : null;
  };
  const operatingNoncurrent = inFiling("OperatingLeaseLiabilityNoncurrent");
  if (typeof operatingNoncurrent !== "number") return none;
  const financeNoncurrent = inFiling("FinanceLeaseLiabilityNoncurrent");
  if (financeNoncurrent === "elsewhere") return none;
  const noncurrent = operatingNoncurrent + (financeNoncurrent ?? 0);
  if (Math.abs(line - noncurrent) > tolerance(noncurrent)) return none;
  // Fix round 5, B: "no finance lease is filed" only after every recognised finance-lease synonym (from the synonym
  // entry, with the current and noncurrent forms of each total) is absent at this instant; the legacy ASC 840
  // CapitalLeaseObligations is one of them.
  const financeTotals = tagsFor("financeLeaseLiability");
  const financeSynonyms = [...new Set([...financeTotals, ...tagsFor("financeLeaseLiabilityParts"), ...financeTotals.flatMap((tag) => [`${tag}Current`, `${tag}Noncurrent`])])]
    .filter((tag) => tag !== "FinanceLeaseLiabilityNoncurrent");
  const otherFinanceTags = financeNoncurrent !== null ? [] : financeSynonyms.map((tag) => [tag, inFiling(tag)] as const).filter(([, value]) => value !== null);
  const ref = `${filing.form} ${filing.accn}`;
  // Fix round 3: every amount in these texts reads in millions ("94,338M").
  const lineText = `the vendor lease line ${millions(line)} ${currency} is the ${ref} filing's noncurrent lease liabilities ` +
    `(OperatingLeaseLiabilityNoncurrent ${millions(operatingNoncurrent)}${financeNoncurrent !== null ? ` + FinanceLeaseLiabilityNoncurrent ${millions(financeNoncurrent)}`
      : otherFinanceTags.length > 0 ? "; no FinanceLeaseLiabilityNoncurrent is filed" : "; no finance lease is filed"}) at ${date}`;
  // Review m2: the consequence states only what the check established; by default, that the row is not completed.
  const refuse = (cause: string, consequence = "the row is not completed from that filing, so total debt and net debt are withheld"): LeaseLineCompletion<T> => ({ status: "refused",
    reason: `incomplete debt carrying value: ${lineText}, but ${cause}; ${consequence}` });
  if (otherFinanceTags.length > 0) {
    return refuse(`the filing tags a finance lease (${otherFinanceTags.map(([tag, value]) => `${tag} ${typeof value === "number" ? millions(value) : "(in another filing)"}`).join(", ")}) ` +
      "without FinanceLeaseLiabilityNoncurrent, so the finance leases the provider line may leave out cannot be established");
  }
  const leaseTotal = (prefix: "Operating" | "Finance"): { value: number; tags: string[] } | string => {
    const tag = `${prefix}LeaseLiability`;
    const total = inFiling(tag), current = inFiling(`${tag}Current`), noncurrentPart = inFiling(`${tag}Noncurrent`);
    if (total === "elsewhere" || current === "elsewhere" || noncurrentPart === "elsewhere") return `the ${tag} amounts are not all in that filing`;
    if (total !== null) {
      if (incompatibleLeaseMaturities(total, current, noncurrentPart)) {
        if (current !== null && noncurrentPart !== null) return `the filed ${tag} ${millions(total)} is not its current ${millions(current)} plus noncurrent ${millions(noncurrentPart)}`;
        return `the filed ${tag} ${millions(total)} is less than its ${current !== null ? `current ${millions(current)}` : `noncurrent ${millions(noncurrentPart!)}`} maturity`;
      }
      return { value: total, tags: [tag] };
    }
    if (current !== null && noncurrentPart !== null) return { value: current + noncurrentPart, tags: [`${tag}Current`, `${tag}Noncurrent`] };
    return `the filing establishes no total ${prefix.toLowerCase()}-lease liability (neither ${tag} nor its current and noncurrent portions)`;
  };
  const operating = leaseTotal("Operating");
  if (typeof operating === "string") return refuse(operating);
  const finance = financeNoncurrent === null ? { value: 0, tags: [] as string[] } : leaseTotal("Finance");
  if (typeof finance === "string") return refuse(finance);
  const leases = operating.value + finance.value;
  // Current lease liabilities of zero: the line already is the total, as it is today.
  if (Math.abs(line - leases) <= tolerance(leases)) return { status: "total" };
  for (const [field, filed] of [["operatingLeaseLiability", operating.value], ["financeLeaseLiability", finance.value]] as const) {
    const held = row[field];
    if (finite(held) && Math.abs(held - filed) > tolerance(filed)) return refuse(`the row's ${field} ${millions(held)} does not reconcile with the filed ${millions(filed)}`);
  }
  const longTerm = row.longTermDebt;
  const filedNoncurrentDebt = inFiling("LongTermDebtNoncurrent");
  if (!finite(longTerm) || longTerm < 0) return refuse("the vendor long-term debt is unavailable");
  if (typeof filedNoncurrentDebt !== "number") return refuse("the vendor long-term debt cannot be matched to a LongTermDebtNoncurrent in that filing, so a current portion inside it cannot be ruled out");
  if (!vendorAgreesWithFiled(longTerm, filedNoncurrentDebt)) return refuse(`the vendor long-term debt ${millions(longTerm)} does not reconcile with the filed LongTermDebtNoncurrent ${millions(filedNoncurrentDebt)}`);
  // Review m1 (Duke shape): a filer whose noncurrent debt equals its debt-and-lease aggregate may carry the
  // noncurrent finance leases inside it, so adding the filed finance-lease total could count them twice.
  const debtAndLeases = inFiling("LongTermDebtAndCapitalLeaseObligations");
  if (typeof debtAndLeases === "number" && typeof financeNoncurrent === "number" && financeNoncurrent > 0 &&
      Math.abs(debtAndLeases - filedNoncurrentDebt) <= tolerance(filedNoncurrentDebt)) {
    return refuse(`the filing's LongTermDebtNoncurrent ${millions(filedNoncurrentDebt)} equals its LongTermDebtAndCapitalLeaseObligations ${millions(debtAndLeases)} ` +
      `while FinanceLeaseLiabilityNoncurrent is ${millions(financeNoncurrent)}, so the noncurrent debt may already hold the finance leases`);
  }
  const vendorTotal = row.totalDebt;
  const vendorShort = row.shortTermDebt;
  if (vendorShort != null && (!finite(vendorShort) || vendorShort < 0)) return refuse("the vendor short-term debt is not a valid amount");
  if (!finite(vendorTotal)) return refuse("the vendor total debt is unavailable, so its composition is unknown");
  const currentTags = ["LongTermDebtCurrent", "ShortTermBorrowings", "CommercialPaper"];
  const taggedParts = currentTags.map((tag) => [tag, inFiling(tag)] as const);
  if (taggedParts.some(([, value]) => value === "elsewhere")) return refuse("the current debt is not established in that one filing");
  // Fix round 4 (D-133): commercial paper beside ShortTermBorrowings is a component of it, the statements builder's rule.
  const paperInside = commercialPaperInsideBorrowings(taggedParts.filter(([, value]) => value !== null).map(([tag]) => tag));
  const currentParts = taggedParts.filter(([tag]) => !(paperInside && tag === "CommercialPaper"));
  const paperNote = paperInside ? `; CommercialPaper ${millions(taggedParts[2]![1] as number)} excluded as a component of ShortTermBorrowings` : "";
  const filedCurrentTags = currentParts.filter(([, value]) => value !== null).map(([tag]) => tag);
  const filedCurrent = currentParts[0]![1] === null ? null : currentParts.reduce((sum, [, value]) => sum + (typeof value === "number" ? value : 0), 0);
  const debtCurrent = inFiling("DebtCurrent");
  if (debtCurrent === "elsewhere") return refuse("the filing's DebtCurrent is not established in that one filing");
  if (debtCurrent !== null && filedCurrent !== null && Math.abs(filedCurrent - debtCurrent) > tolerance(debtCurrent)) {
    return refuse(`the composed current debt ${millions(filedCurrent)} does not reconcile with the filing's DebtCurrent ${millions(debtCurrent)}`);
  }
  const keepVendorShort = finite(vendorShort) && vendorShort > 0;
  // Fix round 2, I-1: the filed current debt a kept vendor figure is checked against, named by its tags and amounts:
  // LongTermDebtCurrent (with ShortTermBorrowings and CommercialPaper where tagged), else DebtCurrent, else
  // ShortTermBorrowings plus CommercialPaper (CommercialPaper left out beside ShortTermBorrowings, fix round 4);
  // null only when the filing tags none of the four.
  const named = (parts: readonly (readonly [string, number | null | "elsewhere"])[]) => parts.filter(([, value]) => value !== null).map(([tag, value]) => `${tag} ${typeof value === "number" ? millions(value) : value}`).join(" + ");
  const borrowings = currentParts.slice(1).filter((part): part is readonly [string, number] => typeof part[1] === "number");
  // Fix round 5, A: the combined current tag holds the current finance leases, which the completed lease total adds
  // again; as the only current-debt evidence it is checked less FinanceLeaseLiabilityCurrent (resolveDebtOverlaps
  // case 4b), as itself when no finance lease is filed, and not at all (a refusal) when that slice is not tagged.
  // Fix round 6: without LongTermDebtCurrent, a combined figure beside other current-debt evidence holds current
  // maturities that no checked tag names; the row is refused, never composed.
  const combinedTagged = filedCurrent === null ? inFiling(COMBINED_CURRENT_DEBT_TAG) : null;
  if (combinedTagged !== null && (debtCurrent !== null || borrowings.length > 0)) {
    const beside = [...(typeof debtCurrent === "number" ? [`DebtCurrent ${millions(debtCurrent)}`] : []), ...(borrowings.length > 0 ? [named(borrowings) + paperNote] : [])].join(" and ");
    return refuse(`the filing's ${COMBINED_CURRENT_DEBT_TAG} ${typeof combinedTagged === "number" ? millions(combinedTagged) : "(in another filing)"} holds current maturities ` +
      `that no LongTermDebtCurrent names, beside ${beside}`);
  }
  const combined = filedCurrent === null && debtCurrent === null && borrowings.length === 0 ? combinedTagged : null;
  const financeCurrent = inFiling("FinanceLeaseLiabilityCurrent");
  const checkedCurrent: { value: number; tags: string } | null = filedCurrent !== null ? { value: filedCurrent, tags: named(currentParts) + paperNote }
    : typeof debtCurrent === "number" ? { value: debtCurrent, tags: `DebtCurrent ${millions(debtCurrent)}` }
      : borrowings.length > 0 ? { value: borrowings.reduce((sum, [, value]) => sum + value, 0), tags: named(borrowings) + paperNote }
        : typeof combined !== "number" ? null
          : financeNoncurrent === null ? { value: combined, tags: `${COMBINED_CURRENT_DEBT_TAG} ${millions(combined)}; no finance lease is filed` }
            : typeof financeCurrent === "number" ? { value: combined - financeCurrent, tags: `${COMBINED_CURRENT_DEBT_TAG} ${millions(combined)} less FinanceLeaseLiabilityCurrent ${millions(financeCurrent)}` }
              : null;
  const noCurrentTag = `the filing tags none of LongTermDebtCurrent, DebtCurrent, ShortTermBorrowings, CommercialPaper or ${COMBINED_CURRENT_DEBT_TAG}`;
  if (keepVendorShort) {
    if (combined === "elsewhere") return refuse(`the filing's ${COMBINED_CURRENT_DEBT_TAG} is not established in that one filing`);
    if (typeof combined === "number" && checkedCurrent === null) {
      return refuse(`the vendor short-term debt ${millions(vendorShort)} is checked against ${COMBINED_CURRENT_DEBT_TAG} ${millions(combined)}, which holds current finance leases, ` +
        (financeCurrent === "elsewhere" ? "but its FinanceLeaseLiabilityCurrent is not established in that one filing" : "but the filing tags no FinanceLeaseLiabilityCurrent to take them out"));
    }
    // Kept, never added to: it must be the filing's current debt, and never the current leases the completed line now holds.
    const currentLeases = [leases - line, operating.value - operatingNoncurrent, finance.value - (financeNoncurrent ?? 0)].filter((value) => value > 0);
    const isCurrentLease = currentLeases.some((value) => vendorAgreesWithFiled(vendorShort, value));
    if (checkedCurrent !== null && !vendorAgreesWithFiled(vendorShort, checkedCurrent.value)) {
      return refuse(`the vendor short-term debt ${millions(vendorShort)} does not reconcile with the filed current debt ${millions(checkedCurrent.value)} (${checkedCurrent.tags})` +
        (isCurrentLease ? "; it equals current lease liabilities the completed lease total already holds" : ""));
    }
    if (checkedCurrent === null && isCurrentLease) {
      return refuse(`the vendor short-term debt ${millions(vendorShort)} equals current lease liabilities the completed lease total already holds`,
        `${noCurrentTag} to show it is debt, so total debt and net debt are withheld rather than counting those leases twice`);
    }
  } else if (filedCurrent === null) {
    return refuse(`the current debt cannot be established: the filing tags no LongTermDebtCurrent at ${date} and the vendor short-term debt is ${finite(vendorShort) ? millions(vendorShort) : "absent"}`,
      "total debt and net debt are withheld rather than published with a current debt the filing does not establish");
  }
  const currentDebt = keepVendorShort ? vendorShort : filedCurrent!;
  const vendorComponents = (vendorShort ?? 0) + longTerm + line;
  if (!debtTotalAgrees(vendorTotal, vendorComponents)) return refuse(`${debtTotalComparison(vendorTotal, vendorComponents)} exceeds the minor-difference limit`);
  if (Math.abs(vendorTotal - vendorComponents) > tolerance(vendorTotal) && keepVendorShort && checkedCurrent === null) {
    return refuse(`the current debt scope is unproven (${noCurrentTag}); ${debtTotalComparison(vendorTotal, vendorComponents)} cannot establish it`);
  }
  const totalNote = minorDebtTotalNote(vendorTotal, vendorComponents);
  const totalDebt = currentDebt + longTerm + leases;
  const cash = row.fieldConflicts?.cashAndCashEquivalents ? null : row.cashAndCashEquivalents;
  const netDebt = finite(cash) ? totalDebt - cash : null;
  const evidence = (tags: readonly string[]): StatementFieldProvenance => ({ source: "edgar", unit: currency, periodStart: null, periodEnd: date, observedAt,
    tags: tags.map((tag) => `us-gaap/${tag}`), filings: [{ ...filing }] });
  const leaseTags = [...operating.tags, ...finance.tags];
  const fieldProvenance: Record<string, StatementFieldProvenance> = { ...row.fieldProvenance, capitalLeaseObligations: evidence(leaseTags),
    totalDebt: { ...evidence([...(keepVendorShort ? [] : filedCurrentTags), "LongTermDebtNoncurrent", ...leaseTags]), calculation: "noncurrent-lease-line-completed" } };
  if (!keepVendorShort) fieldProvenance.shortTermDebt = evidence(filedCurrentTags);
  if (row.operatingLeaseLiability == null) fieldProvenance.operatingLeaseLiability = evidence(operating.tags);
  if (financeNoncurrent !== null && row.financeLeaseLiability == null) fieldProvenance.financeLeaseLiability = evidence(finance.tags);
  // Review m8: the vendor's own netDebt, captured before the rewrite, for the vendor-convention diagnostic.
  const vendorNetDebt = row.vendorNetDebt !== undefined ? row.vendorNetDebt : finite(row.netDebt) ? row.netDebt : null;
  const out = { ...row, capitalLeaseObligations: leases, totalDebt, netDebt, vendorNetDebt,
    ...(totalNote ? { fieldConflicts: { ...row.fieldConflicts, totalDebt: { usable: true, vendorValue: vendorTotal,
      secValue: totalDebt, resolution: "filed-family" as const, reason: `${totalNote}completed debt ${millions(totalDebt)} ${currency}` } } } : {}),
    ...(keepVendorShort ? {} : { shortTermDebt: currentDebt }),
    ...(row.operatingLeaseLiability == null ? { operatingLeaseLiability: operating.value } : {}),
    ...(financeNoncurrent !== null && row.financeLeaseLiability == null ? { financeLeaseLiability: finance.value } : {}),
    fieldProvenance } as T;
  return { status: "completed", row: out, admission: { kind: "completion", date,
    summary: `${millions(totalDebt)} (vendor ${finite(vendorTotal) ? millions(vendorTotal) : "absent"}; ${ref})`,
    detail: `${lineText}, not total lease liabilities; completed from that filing: lease liabilities ${millions(leases)} ` +
      `(${operating.tags.join(" + ")} ${millions(operating.value)}${financeNoncurrent === null ? "" : ` + ${finance.tags.join(" + ")} ${millions(finance.value)}`}), ` +
      `current debt ${millions(currentDebt)} (${keepVendorShort ? checkedCurrent === null ? `the vendor's short-term debt, kept; ${noCurrentTag} to check it against`
        : `the vendor's short-term debt, kept; it equals the filed current debt (${checkedCurrent.tags})` : filedCurrentTags.join(" + ") + paperNote}), ` +
      `total debt ${millions(currentDebt)} + noncurrent debt ${millions(longTerm)} + leases ${millions(leases)} = ${millions(totalDebt)} ${currency}; ` +
      `${totalNote}vendor total ${millions(vendorTotal)} retained in the raw row` } };
}

/** A missing taxonomy class is recoverable; unrelated refusals remain authoritative. */
function recoverNoteCarryingDebt<T extends FmpStatementRow>(row: T, facts: CompanyFacts, currency: string, observedAt: string, sections: readonly ExtractedSection[]): T | null {
  const aggregate = instant(facts, "DebtInstrumentCarryingAmount", currency, row.date!, observedAt);
  const filing = aggregate?.evidence.filings[0];
  if (!aggregate || !filing) return null;
  const matches = (e: StatementFieldProvenance | undefined): boolean => e?.source === "edgar" && e.unit === currency && e.periodEnd === row.date &&
    e.periodStart === null && e.observedAt.slice(0, 10) <= observedAt.slice(0, 10) && e.filings.length > 0 &&
    e.filings.every((f) => f.accn === filing.accn && f.filed === filing.filed && f.form === filing.form);
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
  const maturityTag = "LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths";
  const currentEvidence = row.fieldProvenance?.shortTermDebt;
  const maturity = instant(facts, maturityTag, currency, row.date!, observedAt);
  const fiscalStandIn = matches(currentEvidence) && currentEvidence!.tags.includes(`us-gaap/${maturityTag}`) && matches(maturity?.evidence);
  for (const field of ["shortTermDebt", "longTermDebt", "totalDebt", "netDebt", "capitalLeaseObligations", "operatingLeaseLiability", "financeLeaseLiability"]) {
    const conflict = row.fieldConflicts?.[field];
    if (!conflict) continue;
    const recoverable = field === "shortTermDebt" ? fiscalStandIn && conflict.reason.startsWith("debt maturity scope unresolved:")
      : ["totalDebt", "netDebt"].includes(field) && (/^incomplete debt carrying value: (?:shortTermDebt is unavailable \(debt maturity scope unresolved:|debt maturity scope unresolved:|current\/noncurrent financing components do not establish the total;)/.test(conflict.reason));
    if (!recoverable || (conflict.vendorValue !== null && !(field === "shortTermDebt" && conflict.vendorValue === maturity?.value)) ||
        (conflict.secEvidence !== undefined && !matches(conflict.secEvidence))) return null;
  }
  const operating = liability(facts, "Operating", currency, row.date!, observedAt);
  const finance = liability(facts, "Finance", currency, row.date!, observedAt);
  if (!operating || !finance || !matches(operating.evidence) || !matches(finance.evidence) ||
      !finite(row.capitalLeaseObligations) || !matches(row.fieldProvenance?.capitalLeaseObligations) ||
      row.capitalLeaseObligations !== operating.value + finance.value ||
      (row.operatingLeaseLiability != null && row.operatingLeaseLiability !== operating.value) ||
      (row.financeLeaseLiability != null && row.financeLeaseLiability !== finance.value)) return null;
  const sources = sections.filter((s) => s.accession === filing.accn && s.filingDate === filing.filed && s.form === filing.form);
  if (sources.length !== 1) return null;
  const note = reconcileDebtNoteCarrying({ text: sources[0]!.text, source: sources[0]!, periodEnd: row.date!, currency, observedAt,
    principal: aggregate.value, principalSource: { cik: String(facts.cik), accession: filing.accn, filingDate: filing.filed, periodEnd: row.date!, unit: currency } });
  if (!note || (row.cik != null && row.cik.replace(/^0+/, "") !== String(facts.cik).replace(/^0+/, ""))) return null;
  const total = note.carryingDebt + row.capitalLeaseObligations;
  const cash = row.fieldConflicts?.cashAndCashEquivalents ? null : row.cashAndCashEquivalents;
  const netDebt = finite(cash) ? total - cash : null;
  if ((row.shortTermDebt != null && row.shortTermDebt !== note.currentDebt && !(fiscalStandIn && row.shortTermDebt === maturity?.value)) ||
      (row.longTermDebt != null && row.longTermDebt !== note.noncurrentDebt) || (row.totalDebt != null && row.totalDebt !== total) ||
      (row.netDebt != null && row.netDebt !== netDebt)) return null;
  const fieldConflicts = { ...row.fieldConflicts };
  for (const field of ["shortTermDebt", "longTermDebt", "totalDebt", "netDebt"]) delete fieldConflicts[field];
  const totalEvidence = { ...note.evidence, tags: [...new Set([...note.evidence.tags, ...row.fieldProvenance!.capitalLeaseObligations!.tags])] };
  return { ...row, shortTermDebt: note.currentDebt, longTermDebt: note.noncurrentDebt, totalDebt: total,
    netDebt, fieldConflicts,
    fieldProvenance: { ...row.fieldProvenance, shortTermDebt: note.evidence, longTermDebt: note.evidence, totalDebt: totalEvidence } };
}

/**
 * Audit 2026-10-22 C-15: a balance row with the consolidated total only takes
 * its parent/NCI split from a filing's equity statement (`equityStatementNci`)
 * at the same instant, when that filing's consolidated total is the row's.
 * The latest filing wins; its observations must agree.
 */
function admitEquityStatementNci<T extends FmpStatementRow>(row: T, filings: readonly FilingEquityStatementNci[], cik: number, currency: string, observedAt: string): { row: T; gaps: ManifestEntry[] } {
  const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const total = row.totalEquity;
  if (isNum(row.minorityInterest) || isNum(row.totalStockholdersEquity) || !isNum(total) || !filings.length) return { row, gaps: [] };
  const candidates = filings.filter(f => Number(f.issuerId) === cik && f.source.filingDate <= observedAt.slice(0, 10))
    .flatMap(f => f.observations.filter(o => o.end === row.date && o.currency === currency).map(o => ({ o, source: f.source })))
    .sort((a, b) => b.source.filingDate.localeCompare(a.source.filingDate) || b.source.accession.localeCompare(a.source.accession));
  if (!candidates.length) return { row, gaps: [] };
  const field = `statements.balance.${row.date}.minorityInterest`;
  const latest = candidates.filter(c => c.source.filingDate === candidates[0]!.source.filingDate);
  if (new Set(latest.map(c => `${c.o.noncontrollingInterest}|${c.o.totalEquity}`)).size > 1) {
    return { row, gaps: [{ field, reason: `noncontrolling interest at ${row.date} not admitted: the equity statements filed ${latest[0]!.source.filingDate} disagree`, severity: "warn" }] };
  }
  const { o, source } = latest[0]!;
  if (o.totalEquity === null || !vendorAgreesWithFiled(total, o.totalEquity)) {
    return { row, gaps: [{ field, reason: `noncontrolling interest at ${row.date} not admitted from ${source.form} ${source.accession}: ` +
      (o.totalEquity === null ? "its equity statement tags no consolidated total at that date to tie to the row" : `its consolidated total ${o.totalEquity} ${currency} differs from the row's total equity ${total}`), severity: "warn" }] };
  }
  const tag = "us-gaap/StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest";
  const evidence: StatementFieldProvenance = { source: "edgar", unit: currency, periodStart: null, periodEnd: o.end, observedAt, tags: [tag],
    filings: [{ accn: source.accession, filed: source.filingDate, form: source.form }] };
  const out = { ...row, minorityInterest: o.noncontrollingInterest, totalStockholdersEquity: total - o.noncontrollingInterest,
    fieldProvenance: { ...row.fieldProvenance, minorityInterest: { ...evidence, calculation: "equity-statement-nci" as const },
      totalStockholdersEquity: { ...evidence, calculation: "total-equity-less-equity-statement-nci" as const } } } as T;
  return { row: out, gaps: [{ field, severity: "info", expected: true,
    reason: `noncontrolling interest ${o.noncontrollingInterest} ${currency} at ${row.date} read from the ${source.form} ${source.accession} equity statement ` +
      `(StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest on StatementEquityComponentsAxis = NoncontrollingInterestMember, a dimensional fact companyfacts does not carry); ` +
      `its consolidated total equals the row's total equity, and parent equity is that total less the NCI` }] };
}

/**
 * Audit 2026-10-29, AMZN #51 (VAL-3, FIG-4; D-133): a vendor long-term
 * investments of 0 or absent is undisclosed, not zero, when the same-period
 * filing shows noncurrent investments. Amazon carries its non-marketable and
 * equity-method stakes inside "Other assets"; the provider row read 0, so no
 * stake reached the DCF bridge and net operating assets kept them.
 *
 * The fill is the D-98 chain `longTermInvestments` in statements.ts, with the
 * same tag lists (tagSynonyms): the filed `LongTermInvestments` total, else
 * the non-current debt securities plus the other long-term investments (a
 * filed `OtherLongTermInvestments` line, else non-marketable equity securities
 * plus equity-method investments). An absent piece is named, never zero. Only
 * a vendor value is filled: one the SEC statements built carries provenance,
 * and a nonzero vendor value or a refused one is left as it is.
 */
export function admitVendorLongTermInvestments<T extends FmpStatementRow>(row: T, facts: CompanyFacts, currency: string | null, observedAt: string): { row: T; admissions: BalanceAdmission[] } {
  const vendor = row.longTermInvestments;
  if (!validDay(row.date) || currency === null || row.fieldProvenance?.longTermInvestments !== undefined || row.fieldConflicts?.longTermInvestments !== undefined
    || (vendor != null && vendor !== 0)) return { row, admissions: [] };
  const date = row.date;
  const resolved = longTermInvestmentsChainAt(facts, date, currency, observedAt);
  if (resolved === null || !(resolved.value > 0)) return { row, admissions: [] };
  const { value, evidence } = resolved;
  const out = { ...row, longTermInvestments: value, fieldProvenance: { ...row.fieldProvenance, longTermInvestments: evidence } } as T;
  const parts = resolved.components.map(c => `${c.label} ${millions(c.value)} (${c.tags.join(", ")})`).join(" + ");
  const floorNotes = resolved.notes.filter(note => note.includes("not used"));
  return { row: out, admissions: [{ kind: "stakes", date, summary: `${millions(value)}${vendor == null ? " (vendor absent)" : ""}`,
    detail: `vendor longTermInvestments ${vendor == null ? "absent" : millions(vendor)} at ${date} read as undisclosed: the same-period filing shows noncurrent investments, filled with the D-98 chain: ` +
      `${parts} = ${millions(value)} ${currency}${resolved.absent.length > 0 ? `; absent and excluded: ${resolved.absent.join(", ")}` : ""}` +
      `${floorNotes.length > 0 ? `; ${floorNotes.join("; ")}` : ""}; vendor value retained in the raw row`,
    attemptedSources: evidence.tags.map((tag) => `edgar:companyfacts/${tag.replace(/^us-gaap\//, "")}`) }] };
}

export function enrichFinancialFields(balance: FetchResult<FmpPayload<FmpBalanceSheetRow>>, cashflow: FetchResult<FmpPayload<FmpCashFlowRow>>, facts: CompanyFacts, scope: "annual" | "quarter", observedAt: string, presentations: readonly ExtractedSection[] = [], cashInvestment: readonly FilingCashInvestment[] = [], equityStatementNci: readonly FilingEquityStatementNci[] = []): { balance: typeof balance; cashflow: typeof cashflow; gaps: ManifestEntry[]; admissions: BalanceAdmission[] } {
  const gaps: ManifestEntry[] = [];
  // Review m6: merged into one entry per kind by the caller, across the annual and quarterly families.
  const admissions: BalanceAdmission[] = [];
  const filedTemporaryEnds = temporaryEquityFiledEnds(facts);
  const temporaryRows = balance.ok ? temporaryEquityRows(facts, scope, observedAt) : null;
  const ctx: DerivationContext = { labels: labelCopies(facts, observedAt), withheld: new Set(), unverified: new Map() };
  function enrich<T extends FmpStatementRow>(input: FetchResult<FmpPayload<T>>, kind: "balance" | "cashflow"): FetchResult<FmpPayload<T>> {
    if (!input.ok) return input;
    const rows = input.value.data.rows.map((row) => {
      if (!validDay(row.date)) return row;
      if (row.cik != null && row.cik.replace(/^0+/, "") !== String(facts.cik).replace(/^0+/, "")) {
        gaps.push({ field: `statements.${kind}.${row.date}`, reason: "SEC financial/temporary-equity enrichment withheld: vendor issuer differs from confirmed company facts", severity: "warn" });
        return row;
      }
      const currency = row.reportedCurrency;
      if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
        gaps.push({ field: `statements.${kind}.${row.date}`, reason: "SEC field enrichment withheld: vendor reporting currency is unknown", severity: "info" });
        return row;
      }
      const candidates: [string, Resolved | null][] = kind === "balance" ? [
        ["operatingLeaseLiability", liability(facts, "Operating", currency, row.date, observedAt)],
        ["financeLeaseLiability", liability(facts, "Finance", currency, row.date, observedAt)],
      ] : [["financeLeasePrincipalPayments", principal(facts, currency, row.date, scope, observedAt, ctx)]];
      let out = row;
      for (const [field, sec] of candidates) {
        if (out.fieldConflicts?.[field]?.usable === false) continue;
        if (!sec) {
          if (kind === "cashflow" && typeof row[field] === "number" && Number.isFinite(row[field])) keptUnverified(ctx, field, row.date, [PRINCIPAL_TAG]);
          const tag = field === "operatingLeaseLiability" ? "OperatingLeaseLiability" : field === "financeLeaseLiability" ? "FinanceLeaseLiability" : "FinanceLeasePrincipalPayments";
          const otherUnits = (facts.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown[]> } | undefined)?.units;
          if (otherUnits && Object.keys(otherUnits).some((u) => u !== currency && /^[A-Z]{3}$/.test(u))) gaps.push({ field: `statements.${kind}.${row.date}.${field}`, reason: `SEC field enrichment withheld: fact currency differs from vendor reporting currency ${currency}`, severity: "warn" });
          continue;
        }
        if (sec.evidence.periodStart !== null && typeof row.periodStart === "string" && row.periodStart !== sec.evidence.periodStart) {
          gaps.push({ field: `statements.${kind}.${row.date}.${field}`, reason: `SEC field enrichment withheld: SEC period starts ${sec.evidence.periodStart}, conflicting with vendor period start ${row.periodStart}`, severity: "warn" });
          continue;
        }
        const vendor = row[field];
        if (typeof vendor === "number" && Number.isFinite(vendor)) {
          if (agreesWithSec(vendor, sec.value, [sec])) continue;
          // FIN-511-V2: a quarter derived from two filings is called derived.
          const [vendorText, secText] = millionsPair(vendor, sec.value);
          const versus = sec.operands
            ? `vendor ${vendorText} versus derived ${secText} ${currency} for ${sec.evidence.periodStart} through ${sec.evidence.periodEnd} ${derivedFrom(sec)}`
            : `${vendorText} versus ${secText} ${currency}`;
          const reason = `vendor/SEC conflict for ${field} at ${row.date}: ${versus}; vendor observation preserved and field unavailable for reconciliation`;
          out = { ...out, fieldConflicts: { ...out.fieldConflicts, [field]: { vendorValue: vendor, secValue: sec.value, usable: false, reason, secEvidence: sec.evidence } } };
          gaps.push({ field: `statements.${kind}.${row.date}.${field}`, reason, severity: "warn" });
          continue;
        }
        out = { ...out, [field]: sec.value, fieldProvenance: { ...out.fieldProvenance, [field]: sec.evidence } };
        const period = sec.operands
          ? `derived for ${sec.evidence.periodStart} through ${sec.evidence.periodEnd} ${derivedFrom(sec)}`
          : `exact ${scope} period ending ${row.date}`;
        gaps.push({ field: `statements.${kind}.${row.date}.${field}`, reason: `missing ${field} enriched from SEC ${sec.evidence.tags.join(" + ")} in ${currency}, ${period}; vendor row retained`, severity: "info", expected: true, attemptedSources: sec.evidence.tags.map((t) => `edgar:companyfacts/${t}`) });
      }
      if (kind === "cashflow") {
        const admitted = admitOperatingCashFlow(out, facts, currency, scope, observedAt, ctx);
        out = admitted.row;
        gaps.push(...admitted.gaps);
        const investments = admitInvestmentFlows(out, facts, currency, scope, observedAt, ctx);
        out = investments.row;
        gaps.push(...investments.gaps);
        const investmentScope = admitCashInvestment(out, cashInvestment, facts.cik, scope, observedAt);
        out = investmentScope.row;
        gaps.push(...investmentScope.gaps);
      }
      if (kind === "balance") {
        if (temporaryRows !== null) {
          const temporary = supplementTemporaryEquity(out, temporaryRows, facts.cik, filedTemporaryEnds);
          out = temporary.row;
          gaps.push(...temporary.gaps);
        }
        const admitted = admitDebtFields(out, facts, currency, observedAt, presentations);
        out = admitted.row;
        gaps.push(...admitted.gaps);
        admissions.push(...admitted.admissions);
        // D-133: a provider row only; the SEC statements already ran the chain.
        if (input.value.source !== "edgar") {
          const stakes = admitVendorLongTermInvestments(out, facts, currency, observedAt);
          out = stakes.row;
          admissions.push(...stakes.admissions);
        }
        const nci = admitEquityStatementNci(out, equityStatementNci, facts.cik, currency, observedAt);
        out = nci.row;
        gaps.push(...nci.gaps);
      }
      const cashAdmission = admitCashFields(out, facts, currency, scope, observedAt, kind, ctx);
      out = cashAdmission.row;
      gaps.push(...cashAdmission.gaps);
      return out;
    });
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows } } };
  }
  const balanceOut = enrich(balance, "balance");
  const cashflowOut = enrich(cashflow, "cashflow");
  // Audit 2026-10-27 FIN-511-V2: one info entry per vendor field left unverified by a withheld pair, listing its dates.
  for (const [field, dates] of ctx.unverified) {
    gaps.push({ field: `statements.cashflow.${field}`, severity: "info", expected: true,
      reason: `vendor ${field} kept unverified for ${[...dates].sort().reverse().join(", ")}: the filing's year and year-to-date figures sit on different presentations, so no one-presentation SEC value exists to check it against` });
  }
  return { balance: balanceOut, cashflow: cashflowOut, gaps, admissions };
}
