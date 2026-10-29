import { CORE_FACT_FORMS, QUARTER_DURATION_DAYS, parseFactPoints, type CompanyFacts, type FactPoint } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload, FmpStatementRow, StatementFieldProvenance } from "@/providers/fmp";
import type { FetchResult, ManifestEntry } from "@/types/core";
import { CURRENT_DEBT_TAGS, DEBT_AGGREGATE_TAGS, commercialPaperInsideBorrowings, currentMaturitiesFoldedIn, fiscalMaturityScopeReason, incompleteDebtReason, omittedConvertibleCarryingReason, uncomposedDebtReason, zeroCurrentDebtReason } from "@/edgar/debtCompleteness";
import { reconcileDebtPresentation } from "@/edgar/debtPresentation";
import { reconcileDebtNoteCarrying } from "@/edgar/debtNoteCarrying";
import type { EdgarBundle, ExtractedSection } from "@/pipeline/types";
import { supplementTemporaryEquity, temporaryEquityRows } from "@/edgar/temporaryEquityEnrichment";
import { admitCashInvestment, type FilingCashInvestment } from "@/edgar/cashInvestment";
import { vendorAgreesWithDerived, vendorAgreesWithFiled } from "@/edgar/vendorAgreement";
import type { FilingEquityStatementNci } from "@/edgar/equityStatementNci";
import { COMBINED_CURRENT_DEBT_TAG, tagsFor } from "@/edgar/tagSynonyms";
import { millions } from "@/pipeline/stageB/netDebt";
import { oneBasisPair, representationLabelled, type LabelCopy } from "@/edgar/presentationLineage";
import { DISCONTINUED_LABEL_TAGS, RESTATEMENT_THRESHOLD_PCT } from "@/edgar/statements";

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
}

/** Dated facts, exact monetary unit only; no implicit USD or million scaling. */
function points(facts: CompanyFacts, tag: string, unit: string, observedAt: string): FactPoint[] {
  const c = facts.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown[]> } | undefined;
  return parseFactPoints(c?.units?.[unit] ?? []).filter((p) => CORE_FACT_FORMS.has(p.form) && validDay(p.end) && p.end <= observedAt.slice(0, 10) && validDay(p.filed) && p.filed <= observedAt.slice(0, 10) && (p.start === undefined || validDay(p.start)));
}
function resolved(value: number, tags: string[], ps: FactPoint[], unit: string, observedAt: string, periodStart: string | null, periodEnd: string): Resolved {
  return { value, evidence: { source: "edgar", unit, periodStart, periodEnd, observedAt, tags: tags.map((t) => `us-gaap/${t}`), filings: ps.map((p) => ({ accn: p.accn, filed: p.filed, form: p.form })) } };
}
function instant(facts: CompanyFacts, tag: string, unit: string, end: string, observedAt: string): Resolved | null {
  const p = newest(points(facts, tag, unit, observedAt).filter((p) => p.end === end && p.start === undefined && p.val >= 0));
  return p ? resolved(p.val, [tag], [p], unit, observedAt, null, end) : null;
}
function liability(facts: CompanyFacts, prefix: "Operating" | "Finance", unit: string, end: string, observedAt: string): Resolved | null {
  const tag = `${prefix}LeaseLiability`;
  const total = instant(facts, tag, unit, end, observedAt);
  if (total) return total;
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
function filedFlow(facts: CompanyFacts, tag: string, unit: string, end: string, scope: "annual" | "quarter", observedAt: string, signed: boolean, labels: readonly LabelCopy[]): Resolved | null {
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
  const choice = oneBasisPair(ps, ytd, subtrahendsFor, RESTATEMENT_THRESHOLD_PCT, (m) => representationLabelled(labels, m, RESTATEMENT_THRESHOLD_PCT));
  if (choice.kind !== "pair") return null;
  const minuend = choice.minuend;
  const prior = choice.subtrahends[0]!;
  if (!signed && (minuend.val < 0 || prior.val < 0 || minuend.val < prior.val)) return null;
  const start = new Date(Date.parse(prior.end) + DAY).toISOString().slice(0, 10);
  const out = resolved(minuend.val - prior.val, [tag], [minuend, prior], unit, observedAt, start, end);
  out.evidence.derivation = "ytd-difference";
  out.operands = [minuend, prior];
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
/** How a derived SEC value was built, for reason texts: "(fiscal year or year to date less the prior year to date, from the <filing> and the <filing>)". */
function derivedFrom(evidence: StatementFieldProvenance): string {
  const filing = (f: StatementFieldProvenance["filings"][number]) => `${f.form.trim()} of ${f.filed} (${f.accn})`;
  return `(fiscal year or year to date less the prior year to date, from ${evidence.filings.map((f) => `the ${filing(f)}`).join(" and ")})`;
}
function principal(facts: CompanyFacts, unit: string, end: string, scope: "annual" | "quarter", observedAt: string, labels: readonly LabelCopy[]): Resolved | null {
  return filedFlow(facts, "FinanceLeasePrincipalPayments", unit, end, scope, observedAt, false, labels);
}
function filedOperatingCashFlow(facts: CompanyFacts, unit: string, end: string, scope: "annual" | "quarter", observedAt: string, labels: readonly LabelCopy[]): Resolved | null {
  return filedFlow(facts, "NetCashProvidedByUsedInOperatingActivities", unit, end, scope, observedAt, true, labels);
}

/** Cash-flow balances have an unknown restricted-cash scope in vendor rows.
 * Compare only where BOTH filed scopes agree, with an FX-inclusive flow and
 * compatible instants. The interval comes from the filing, not an invented
 * vendor periodStart. Prior-quarter cash need not have the ending filing's ID.
 */
function filedCashAmounts(facts: CompanyFacts, unit: string, row: FmpStatementRow, scope: "annual" | "quarter", observedAt: string, labels: readonly LabelCopy[]): Partial<Record<"cashAtBeginningOfPeriod" | "cashAtEndOfPeriod" | "netChangeInCash", Resolved>> {
  if (!validDay(row.date)) return {};
  const cashTag = "CashAndCashEquivalentsAtCarryingValue";
  const totalTag = "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents";
  const movementTag = `${totalTag}PeriodIncreaseDecreaseIncludingExchangeRateEffect`;
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
  const movement = filedFlow(facts, movementTag, unit, row.date, scope, observedAt, true, labels);
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
function admitCashFields<T extends FmpStatementRow>(row: T, facts: CompanyFacts, unit: string, scope: "annual" | "quarter", observedAt: string, kind: "balance" | "cashflow", labels: readonly LabelCopy[]): { row: T; gaps: ManifestEntry[] } {
  const cashAmounts = kind === "cashflow" ? filedCashAmounts(facts, unit, row, scope, observedAt, labels) : {};
  const specifications: [string, string, boolean, number][] = kind === "balance"
    ? [["cashAndCashEquivalents", "CashAndCashEquivalentsAtCarryingValue", true, 1]]
    : [["commonStockRepurchased", "PaymentsForRepurchaseOfCommonStock", false, -1],
      ["netCashProvidedByInvestingActivities", "NetCashProvidedByUsedInInvestingActivities", true, 1],
      ["netCashProvidedByFinancingActivities", "NetCashProvidedByUsedInFinancingActivities", true, 1],
      ["cashAtBeginningOfPeriod", "CashAndCashEquivalentsAtCarryingValue", true, 1],
      ["cashAtEndOfPeriod", "CashAndCashEquivalentsAtCarryingValue", true, 1],
      ["netChangeInCash", "CashAndCashEquivalentsAtCarryingValue", true, 1]];
  let out = row;
  const gaps: ManifestEntry[] = [];
  if (kind === "cashflow") {
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
    const sec = kind === "balance" ? instant(facts, tag, unit, row.date!, observedAt)
      : field === "cashAtBeginningOfPeriod" || field === "cashAtEndOfPeriod" || field === "netChangeInCash"
        ? cashAmounts[field] ?? (field === "netChangeInCash" ? matchingCashChange(facts, unit, row, scope, observedAt) : null)
        : filedFlow(facts, tag, unit, row.date!, scope, observedAt, signed, labels);
    // A prior-quarter filing is a calculation dependency, not authority for
    // comparing the current vendor row. All three cash fields share the
    // ending/current-flow filing anchor; retain every dependency in secEvidence.
    const filingAnchor = field === "cashAtBeginningOfPeriod" || field === "cashAtEndOfPeriod" || field === "netChangeInCash"
      ? cashAmounts.cashAtEndOfPeriod ?? sec : sec;
    if (!sec || (sec.evidence.periodStart !== null && kind === "cashflow" && typeof row.periodStart === "string" && row.periodStart !== sec.evidence.periodStart) ||
      (validDay(row.filingDate) && !filingAnchor?.evidence.filings.some(filing => filing.filed === row.filingDate))) continue;
    const vendor = row[field];
    if (typeof vendor !== "number" || !Number.isFinite(vendor)) continue;
    const value = sec.value * sign;
    if (agreesWithSec(vendor, value, [sec])) continue;
    const reason = `vendor/SEC ${field} conflict: exact ${sec.evidence.periodStart ?? "instant"} through ${sec.evidence.periodEnd} ${unit}; raw vendor ${vendor}, filed ${value}; field unavailable until reconciled`;
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

/** Retain conflicting observations for audit; aliases and dependent FCF cannot launder them. */
function admitOperatingCashFlow<T extends FmpStatementRow>(row: T, facts: CompanyFacts, currency: string, scope: "annual" | "quarter", observedAt: string, labels: readonly LabelCopy[]): { row: T; gaps: ManifestEntry[] } {
  if (row.cik != null && row.cik.replace(/^0+/, "") !== String(facts.cik).replace(/^0+/, "")) return { row, gaps: [] };
  const sec = filedOperatingCashFlow(facts, currency, row.date!, scope, observedAt, labels);
  if (!sec || (typeof row.periodStart === "string" && row.periodStart !== sec.evidence.periodStart)) return { row, gaps: [] };
  const fields = ["operatingCashFlow", "netCashProvidedByOperatingActivities"];
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const conflict = fields.some(field => finite(row[field]) && !agreesWithSec(row[field], sec.value, [sec]));
  if (!conflict) return { row, gaps: [] };
  // FIN-511-V2: a quarter derived from two filings is called derived, never filed.
  const secText = sec.evidence.derivation === "ytd-difference"
    ? `derived ${millions(sec.value)} ${currency} for ${sec.evidence.periodStart} through ${sec.evidence.periodEnd} ${derivedFrom(sec.evidence)}`
    : `filed ${sec.value} ${currency} for ${sec.evidence.periodStart} through ${sec.evidence.periodEnd}`;
  const reason = `vendor/SEC operating cash-flow conflict at ${row.date}: ${secText}; vendor observations retained, CFO aliases and dependent standardized FCF unavailable until reconciled`;
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
function admitInvestmentFlows<T extends FmpStatementRow>(row: T, facts: CompanyFacts, currency: string, scope: "annual" | "quarter", observedAt: string, labels: readonly LabelCopy[]): { row: T; gaps: ManifestEntry[] } {
  const tags = ["PaymentsToAcquireShortTermInvestments", "ProceedsFromSaleOfShortTermInvestments", "ProceedsFromMaturitiesPrepaymentsAndCallsOfShorttermInvestments"];
  const parts = tags.map(tag => filedFlow(facts, tag, currency, row.date!, scope, observedAt, false, labels));
  if (parts.some(part => part === null)) return { row, gaps: [] };
  const [purchase, sale, maturity] = parts as Resolved[];
  const evidence = purchase!.evidence;
  if (parts.some(part => part!.evidence.periodStart !== evidence.periodStart || JSON.stringify(part!.evidence.filings) !== JSON.stringify(evidence.filings)) ||
    (typeof row.periodStart === "string" && row.periodStart !== evidence.periodStart) ||
    (validDay(row.filingDate) && !evidence.filings.some(f => f.filed === row.filingDate))) return { row, gaps: [] };
  const expected: Record<string, number> = { purchasesOfInvestments: -purchase!.value, salesMaturitiesOfInvestments: sale!.value + maturity!.value };
  const expectedParts: Record<string, Resolved[]> = { purchasesOfInvestments: [purchase!], salesMaturitiesOfInvestments: [sale!, maturity!] };
  if (!Object.entries(expected).some(([field,value]) => typeof row[field] === "number" && Number.isFinite(row[field]) && !agreesWithSec(row[field], value, expectedParts[field]!))) return { row, gaps: [] };
  const reason = `financial-investment classification unreconciled at ${row.date}: same-period filed short-term purchases ${-purchase!.value} and sales/maturities ${sale!.value + maturity!.value} ${currency} differ from generic vendor buckets. Mixed long-term investment/intangible/other payments remain unclassified; financial-asset-adjusted accruals unavailable, with operating accruals disclosed separately.`;
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
  if (componentReason === null && row.fieldConflicts?.totalDebt?.usable !== false) {
    const completion = completeNoncurrentLeaseLine(out, facts, currency, observedAt);
    if (completion.status === "completed") {
      out = completion.row;
      admissions.push(completion.admission);
    } else if (completion.status === "refused") leaseLineReason = completion.reason;
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
      DEBT_AGGREGATE_TAGS.map((tag) => ({ tag, value: instant(facts, tag, currency, row.date!, observedAt)?.value ?? null }))));
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
  return { row: out, gaps, admissions };
}

/**
 * Review m6 (2026-10-29): one row's lease-line completion or stake fill. The
 * row keeps its own provenance; the manifest gets one entry per kind listing
 * the dates (`balanceAdmissionEntries`), not one entry per row: on report #51
 * the per-row entries were 51 entries and about 25K characters in every LLM pass.
 */
export interface BalanceAdmission {
  kind: "completion" | "stakes";
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
  for (const kind of ["completion", "stakes"] as const) {
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
      : { field: "statements.balance.longTermInvestments", severity: "info", expected: true,
        reason: `vendor longTermInvestments read as undisclosed at ${dates}; filled with the D-98 chain from the same-period filing, the vendor value retained in the raw row: ${list}. Latest: ${dated[0]!.detail}`,
        ...(sources.length > 0 ? { attemptedSources: sources } : {}) });
  }
  return entries;
}

type LeaseLineCompletion<T> = { status: "none" } | { status: "completed"; row: T; admission: BalanceAdmission } | { status: "refused"; reason: string };

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
      if (current !== null && noncurrentPart !== null && Math.abs(current + noncurrentPart - total) > tolerance(total)) {
        return `the filed ${tag} ${millions(total)} is not its current ${millions(current)} plus noncurrent ${millions(noncurrentPart)}`;
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
  if (!finite(vendorTotal) || Math.abs(vendorTotal - ((vendorShort ?? 0) + longTerm + line)) > tolerance(vendorTotal)) {
    return refuse(`the vendor total debt ${finite(vendorTotal) ? millions(vendorTotal) : "(unavailable)"} is not its short-term debt + long-term debt + lease line, so its composition is unknown`);
  }
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
      `vendor total ${finite(vendorTotal) ? millions(vendorTotal) : "absent"} retained in the raw row` } };
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

/** Enrich missing details; retain conflicting observations in raw evidence and refusal records. */
/** The first tag of an ordered list with an instant at `end` (a `first` step of the statements chain). */
function firstInstant(facts: CompanyFacts, tags: readonly string[], unit: string, end: string, observedAt: string): Resolved | null {
  for (const tag of tags) {
    const hit = instant(facts, tag, unit, end, observedAt);
    if (hit) return hit;
  }
  return null;
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
  const at = (tags: readonly string[]) => firstInstant(facts, tags, currency, date, observedAt);
  const present: { label: string; r: Resolved }[] = [];
  const absent: string[] = [];
  const total = at(tagsFor("longTermInvestments"));
  if (total) present.push({ label: "long-term investments", r: total });
  else {
    const debtSecurities = at(tagsFor("noncurrentDebtSecurities"));
    if (debtSecurities) present.push({ label: "non-current debt securities", r: debtSecurities });
    else absent.push("non-current debt securities");
    const other = at(tagsFor("otherLongTermInvestments"));
    if (other) present.push({ label: "other long-term investments", r: other });
    else {
      const pieces = ([["non-marketable equity securities", at(tagsFor("nonMarketableEquitySecurities"))], ["equity-method investments", at(tagsFor("equityMethodInvestments"))]] as const);
      if (pieces.every(([, r]) => r === null)) absent.push("other long-term investments");
      for (const [label, r] of pieces) {
        if (r) present.push({ label, r });
        else if (pieces.some(([, hit]) => hit !== null)) absent.push(label);
      }
    }
  }
  const value = present.reduce((sum, { r }) => sum + r.value, 0);
  if (present.length === 0 || !(value > 0)) return { row, admissions: [] };
  const filings = present.flatMap(({ r }) => r.evidence.filings).filter((filing, i, all) => all.findIndex((f) => f.accn === filing.accn) === i);
  const evidence: StatementFieldProvenance = { source: "edgar", unit: currency, periodStart: null, periodEnd: date, observedAt,
    tags: present.flatMap(({ r }) => r.evidence.tags), filings };
  const out = { ...row, longTermInvestments: value, fieldProvenance: { ...row.fieldProvenance, longTermInvestments: evidence } } as T;
  const parts = present.map(({ label, r }) => `${label} ${millions(r.value)} (${r.evidence.tags.map((tag) => tag.replace(/^us-gaap\//, "")).join(", ")})`).join(" + ");
  return { row: out, admissions: [{ kind: "stakes", date, summary: `${millions(value)}${vendor == null ? " (vendor absent)" : ""}`,
    detail: `vendor longTermInvestments ${vendor == null ? "absent" : millions(vendor)} at ${date} read as undisclosed: the same-period filing shows noncurrent investments, filled with the D-98 chain: ` +
      `${parts} = ${millions(value)} ${currency}${absent.length > 0 ? `; absent and excluded: ${absent.join(", ")}` : ""}; vendor value retained in the raw row`,
    attemptedSources: evidence.tags.map((tag) => `edgar:companyfacts/${tag.replace(/^us-gaap\//, "")}`) }] };
}

export function enrichFinancialFields(balance: FetchResult<FmpPayload<FmpBalanceSheetRow>>, cashflow: FetchResult<FmpPayload<FmpCashFlowRow>>, facts: CompanyFacts, scope: "annual" | "quarter", observedAt: string, presentations: readonly ExtractedSection[] = [], cashInvestment: readonly FilingCashInvestment[] = [], equityStatementNci: readonly FilingEquityStatementNci[] = []): { balance: typeof balance; cashflow: typeof cashflow; gaps: ManifestEntry[]; admissions: BalanceAdmission[] } {
  const gaps: ManifestEntry[] = [];
  // Review m6: merged into one entry per kind by the caller, across the annual and quarterly families.
  const admissions: BalanceAdmission[] = [];
  const temporaryRows = balance.ok ? temporaryEquityRows(facts, scope, observedAt) : null;
  const labels = labelCopies(facts, observedAt);
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
      ] : [["financeLeasePrincipalPayments", principal(facts, currency, row.date, scope, observedAt, labels)]];
      let out = row;
      for (const [field, sec] of candidates) {
        if (out.fieldConflicts?.[field]?.usable === false) continue;
        if (!sec) {
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
          const reason = `vendor/SEC conflict for ${field} at ${row.date}: ${vendor} versus ${sec.value} ${currency}; vendor observation preserved and field unavailable for reconciliation`;
          out = { ...out, fieldConflicts: { ...out.fieldConflicts, [field]: { vendorValue: vendor, secValue: sec.value, usable: false, reason, secEvidence: sec.evidence } } };
          gaps.push({ field: `statements.${kind}.${row.date}.${field}`, reason, severity: "warn" });
          continue;
        }
        out = { ...out, [field]: sec.value, fieldProvenance: { ...out.fieldProvenance, [field]: sec.evidence } };
        const period = sec.evidence.derivation === "ytd-difference"
          ? `derived for ${sec.evidence.periodStart} through ${sec.evidence.periodEnd} ${derivedFrom(sec.evidence)}`
          : `exact ${scope} period ending ${row.date}`;
        gaps.push({ field: `statements.${kind}.${row.date}.${field}`, reason: `missing ${field} enriched from SEC ${sec.evidence.tags.join(" + ")} in ${currency}, ${period}; vendor row retained`, severity: "info", expected: true, attemptedSources: sec.evidence.tags.map((t) => `edgar:companyfacts/${t}`) });
      }
      if (kind === "cashflow") {
        const admitted = admitOperatingCashFlow(out, facts, currency, scope, observedAt, labels);
        out = admitted.row;
        gaps.push(...admitted.gaps);
        const investments = admitInvestmentFlows(out, facts, currency, scope, observedAt, labels);
        out = investments.row;
        gaps.push(...investments.gaps);
        const investmentScope = admitCashInvestment(out, cashInvestment, facts.cik, scope, observedAt);
        out = investmentScope.row;
        gaps.push(...investmentScope.gaps);
      }
      if (kind === "balance") {
        if (temporaryRows !== null) {
          const temporary = supplementTemporaryEquity(out, temporaryRows, facts.cik);
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
      const cashAdmission = admitCashFields(out, facts, currency, scope, observedAt, kind, labels);
      out = cashAdmission.row;
      gaps.push(...cashAdmission.gaps);
      return out;
    });
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows } } };
  }
  return { balance: enrich(balance, "balance"), cashflow: enrich(cashflow, "cashflow"), gaps, admissions };
}
