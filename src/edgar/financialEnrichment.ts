import { CORE_FACT_FORMS, QUARTER_DURATION_DAYS, parseFactPoints, type CompanyFacts, type FactPoint } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload, FmpStatementRow, StatementFieldProvenance } from "@/providers/fmp";
import type { FetchResult, ManifestEntry } from "@/types/core";
import { fiscalMaturityScopeReason, incompleteDebtReason, omittedConvertibleCarryingReason } from "@/edgar/debtCompleteness";
import { reconcileDebtPresentation } from "@/edgar/debtPresentation";
import { reconcileDebtNoteCarrying } from "@/edgar/debtNoteCarrying";
import type { EdgarBundle, ExtractedSection } from "@/pipeline/types";
import { supplementTemporaryEquity, temporaryEquityRows } from "@/edgar/temporaryEquityEnrichment";
import { admitCashInvestment, type FilingCashInvestment } from "@/edgar/cashInvestment";

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
interface Resolved { value: number; evidence: StatementFieldProvenance }

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

/** Direct and YTD-derived flows use the exact emitted start/end interval. */
function filedFlow(facts: CompanyFacts, tag: string, unit: string, end: string, scope: "annual" | "quarter", observedAt: string, signed: boolean): Resolved | null {
  const ps = points(facts, tag, unit, observedAt).filter(p => p.start !== undefined);
  const [min, max] = scope === "annual" ? [350, 380] : QUARTER_DURATION_DAYS;
  const directCandidates = ps.filter(p => p.end === end && span(p)! >= min! && span(p)! <= max!);
  const direct = unambiguousNewest(directCandidates);
  if (directCandidates.length > 0) return direct && (signed || direct.val >= 0)
    ? resolved(direct.val, [tag], [direct], unit, observedAt, direct.start!, end) : null;
  if (scope === "annual") return null;
  const ytd = unambiguousNewest(ps.filter(p => p.end === end && span(p)! > QUARTER_DURATION_DAYS[1] && span(p)! <= 380));
  if (!ytd || (!signed && ytd.val < 0)) return null;
  // A prior cumulative end is the day BEFORE the derived start. Validate the
  // resulting interval, not the one-day-longer difference between period ends.
  const prior = unambiguousNewest(ps.filter(p => p.start === ytd.start && p.end < end && p.filed <= ytd.filed &&
    (Date.parse(end) - Date.parse(p.end)) / DAY - 1 >= QUARTER_DURATION_DAYS[0] &&
    (Date.parse(end) - Date.parse(p.end)) / DAY - 1 <= QUARTER_DURATION_DAYS[1]));
  if (!prior || (!signed && (prior.val < 0 || ytd.val < prior.val))) return null;
  const start = new Date(Date.parse(prior.end) + DAY).toISOString().slice(0, 10);
  const out = resolved(ytd.val - prior.val, [tag], [ytd, prior], unit, observedAt, start, end);
  out.evidence.derivation = "ytd-difference";
  return out;
}
function principal(facts: CompanyFacts, unit: string, end: string, scope: "annual" | "quarter", observedAt: string): Resolved | null {
  return filedFlow(facts, "FinanceLeasePrincipalPayments", unit, end, scope, observedAt, false);
}
function filedOperatingCashFlow(facts: CompanyFacts, unit: string, end: string, scope: "annual" | "quarter", observedAt: string): Resolved | null {
  return filedFlow(facts, "NetCashProvidedByUsedInOperatingActivities", unit, end, scope, observedAt, true);
}

/** Cash-flow balances have an unknown restricted-cash scope in vendor rows.
 * Compare only where BOTH filed scopes agree, with an FX-inclusive flow and
 * compatible instants. The interval comes from the filing, not an invented
 * vendor periodStart. Prior-quarter cash need not have the ending filing's ID.
 */
function filedCashAmounts(facts: CompanyFacts, unit: string, row: FmpStatementRow, scope: "annual" | "quarter", observedAt: string): Partial<Record<"cashAtBeginningOfPeriod" | "cashAtEndOfPeriod" | "netChangeInCash", Resolved>> {
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
  const movement = filedFlow(facts, movementTag, unit, row.date, scope, observedAt, true);
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
function admitCashFields<T extends FmpStatementRow>(row: T, facts: CompanyFacts, unit: string, scope: "annual" | "quarter", observedAt: string, kind: "balance" | "cashflow"): { row: T; gaps: ManifestEntry[] } {
  const cashAmounts = kind === "cashflow" ? filedCashAmounts(facts, unit, row, scope, observedAt) : {};
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
        : filedFlow(facts, tag, unit, row.date!, scope, observedAt, signed);
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
    if (Math.abs(vendor - value) <= Math.max(1e-8, Math.abs(value) * 1e-10)) continue;
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
function admitOperatingCashFlow<T extends FmpStatementRow>(row: T, facts: CompanyFacts, currency: string, scope: "annual" | "quarter", observedAt: string): { row: T; gaps: ManifestEntry[] } {
  if (row.cik != null && row.cik.replace(/^0+/, "") !== String(facts.cik).replace(/^0+/, "")) return { row, gaps: [] };
  const sec = filedOperatingCashFlow(facts, currency, row.date!, scope, observedAt);
  if (!sec || (typeof row.periodStart === "string" && row.periodStart !== sec.evidence.periodStart)) return { row, gaps: [] };
  const fields = ["operatingCashFlow", "netCashProvidedByOperatingActivities"];
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const conflict = fields.some(field => finite(row[field]) && Math.abs(row[field] - sec.value) > Math.max(1e-8, Math.abs(sec.value) * 1e-10));
  if (!conflict) return { row, gaps: [] };
  const reason = `vendor/SEC operating cash-flow conflict at ${row.date}: filed ${sec.value} ${currency} for ${sec.evidence.periodStart} through ${sec.evidence.periodEnd}; vendor observations retained, CFO aliases and dependent standardized FCF unavailable until reconciled`;
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
function admitInvestmentFlows<T extends FmpStatementRow>(row: T, facts: CompanyFacts, currency: string, scope: "annual" | "quarter", observedAt: string): { row: T; gaps: ManifestEntry[] } {
  const tags = ["PaymentsToAcquireShortTermInvestments", "ProceedsFromSaleOfShortTermInvestments", "ProceedsFromMaturitiesPrepaymentsAndCallsOfShorttermInvestments"];
  const parts = tags.map(tag => filedFlow(facts, tag, currency, row.date!, scope, observedAt, false));
  if (parts.some(part => part === null)) return { row, gaps: [] };
  const [purchase, sale, maturity] = parts as Resolved[];
  const evidence = purchase!.evidence;
  if (parts.some(part => part!.evidence.periodStart !== evidence.periodStart || JSON.stringify(part!.evidence.filings) !== JSON.stringify(evidence.filings)) ||
    (typeof row.periodStart === "string" && row.periodStart !== evidence.periodStart) ||
    (validDay(row.filingDate) && !evidence.filings.some(f => f.filed === row.filingDate))) return { row, gaps: [] };
  const expected: Record<string, number> = { purchasesOfInvestments: -purchase!.value, salesMaturitiesOfInvestments: sale!.value + maturity!.value };
  if (!Object.entries(expected).some(([field,value]) => typeof row[field] === "number" && Number.isFinite(row[field]) && Math.abs(row[field] - value) > Math.max(1e-8, Math.abs(value) * 1e-10))) return { row, gaps: [] };
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
export function admitDebtFields<T extends FmpStatementRow>(row: T, facts: CompanyFacts, currency: string | null, observedAt: string, presentations: readonly ExtractedSection[] = []): { row: T; gaps: ManifestEntry[] } {
  const gaps: ManifestEntry[] = [];
  if (!validDay(row.date) || currency === null || !/^[A-Z]{3}$/.test(currency)) return { row, gaps };
  const recovered = recoverNoteCarryingDebt(row, facts, currency, observedAt, presentations);
  if (recovered !== null) return { row: recovered, gaps: [{ field: `statements.balance.${row.date}.totalDebt`,
    reason: "same-filing debt note reconciles principal less discounts to current and noncurrent carrying debt; recognized operating and finance leases added exactly once", severity: "info", expected: true }] };
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
  const splitOnly = only("longTermDebt", "LongTermDebt") && only("shortTermDebt", maturityTag) &&
    typeof row.totalDebt === "number" && Number.isFinite(row.totalDebt) && row.fieldConflicts?.totalDebt?.usable !== false &&
    (scopeReason !== null || (row.fieldConflicts?.shortTermDebt?.usable === false && row.fieldConflicts?.longTermDebt?.usable === false));
  // Preserve raw observations for audit, but an explicitly rejected financing
  // or lease component cannot establish any aggregate's carrying-value basis.
  const refusedComponent = ["shortTermDebt", "longTermDebt", "financeLeaseLiability", "capitalLeaseObligations", "operatingLeaseLiability"]
    .find((field) => row.fieldConflicts?.[field]?.usable === false && !(splitOnly && (field === "shortTermDebt" || field === "longTermDebt")));
  const componentReason = refusedComponent === undefined ? null
    : `incomplete debt carrying value: ${refusedComponent} is unavailable (${row.fieldConflicts![refusedComponent]!.reason})`;
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
      const same = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 1e-10);
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
  const convertibleReason = omittedConvertibleCarryingReason({ longTermDebt: splitOnly ? inclusiveTotal : out.longTermDebt }, instant(facts, "ConvertibleLongTermNotesPayable", currency, row.date, observedAt)?.value ?? null);
  const reason = componentReason ?? presentationReason ?? convertibleReason ??
    (scopeReason !== null && !splitOnly ? `incomplete debt carrying value: ${scopeReason}` : incompleteDebtReason(splitOnly ? { shortTermDebt: 0,
      longTermDebt: inclusiveTotal, financeLeaseLiability: out.financeLeaseLiability, totalDebt: out.totalDebt }
      : { shortTermDebt: out.shortTermDebt, longTermDebt: out.longTermDebt, financeLeaseLiability: out.financeLeaseLiability, totalDebt: out.totalDebt }, aggregate?.value ?? null));
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
  return { row: out, gaps };
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

/** Enrich missing details; retain conflicting observations in raw evidence and refusal records. */
export function enrichFinancialFields(balance: FetchResult<FmpPayload<FmpBalanceSheetRow>>, cashflow: FetchResult<FmpPayload<FmpCashFlowRow>>, facts: CompanyFacts, scope: "annual" | "quarter", observedAt: string, presentations: readonly ExtractedSection[] = [], cashInvestment: readonly FilingCashInvestment[] = []): { balance: typeof balance; cashflow: typeof cashflow; gaps: ManifestEntry[] } {
  const gaps: ManifestEntry[] = [];
  const temporaryRows = balance.ok ? temporaryEquityRows(facts, scope, observedAt) : null;
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
      ] : [["financeLeasePrincipalPayments", principal(facts, currency, row.date, scope, observedAt)]];
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
          if (Math.abs(vendor - sec.value) <= Math.max(1e-8, Math.abs(sec.value) * 1e-10)) continue;
          const reason = `vendor/SEC conflict for ${field} at ${row.date}: ${vendor} versus ${sec.value} ${currency}; vendor observation preserved and field unavailable for reconciliation`;
          out = { ...out, fieldConflicts: { ...out.fieldConflicts, [field]: { vendorValue: vendor, secValue: sec.value, usable: false, reason, secEvidence: sec.evidence } } };
          gaps.push({ field: `statements.${kind}.${row.date}.${field}`, reason, severity: "warn" });
          continue;
        }
        out = { ...out, [field]: sec.value, fieldProvenance: { ...out.fieldProvenance, [field]: sec.evidence } };
        gaps.push({ field: `statements.${kind}.${row.date}.${field}`, reason: `missing ${field} enriched from SEC ${sec.evidence.tags.join(" + ")} in ${currency}, exact ${scope} period ending ${row.date}; vendor row retained`, severity: "info", expected: true, attemptedSources: sec.evidence.tags.map((t) => `edgar:companyfacts/${t}`) });
      }
      if (kind === "cashflow") {
        const admitted = admitOperatingCashFlow(out, facts, currency, scope, observedAt);
        out = admitted.row;
        gaps.push(...admitted.gaps);
        const investments = admitInvestmentFlows(out, facts, currency, scope, observedAt);
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
      }
      const cashAdmission = admitCashFields(out, facts, currency, scope, observedAt, kind);
      out = cashAdmission.row;
      gaps.push(...cashAdmission.gaps);
      return out;
    });
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows } } };
  }
  return { balance: enrich(balance, "balance"), cashflow: enrich(cashflow, "cashflow"), gaps };
}
