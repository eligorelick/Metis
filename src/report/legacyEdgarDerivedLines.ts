import { specVersionBefore } from "@/report/legacyPayloadRecordSafety";
import type { Report } from "@/report/schema";

/**
 * Display-time marking of a stored report whose statements were built from SEC
 * filings before this batch's report spec (audit 2026-10-27, B13, D-67). The
 * derived lines and growth cells it shows are as stored; the notes below say
 * which derivations changed since. No figure is rewritten, and a report at or
 * after the since-version, or one that was not built from SEC statements, is
 * returned as the identical object.
 *
 * The since-version is frozen: it never compares against `REPORT_SPEC_VERSION`
 * itself, because later batches move that constant. Every note is a fixed
 * string: no provider, filing or model text reaches it, because those are
 * untrusted.
 */
export const EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION = "1.48.0";

const SINCE = EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION;

export const LEGACY_EDGAR_FAIR_VALUE_NOTE =
  `Statement lines on this report were built from SEC filings before report spec ${SINCE}. Since then, a derived operating income: no longer drops a period that files the non-operating aggregate without an interest element; removes a filer-tagged other non-operating result; does not add back interest the filer itself placed inside the aggregate. D&A and R&D are never a synonym below their own filed component, and derived quarters and growth cells net figures on one presentation only. Figures shown are as stored; re-run the report for the current derivation.`;

export const LEGACY_EDGAR_TREND_NOTE =
  `YoY/QoQ cells and derived fourth quarters on this report were computed before report spec ${SINCE} without checking whether the two quarters sit on one filed presentation (see the restatements entry in the missing-data manifest); re-run for one-basis growth.`;

export const LEGACY_EDGAR_QUALITY_NOTE =
  `Statement-derived screens on this report were computed before report spec ${SINCE}: where the filer tags no NonoperatingIncomeExpense aggregate, the one-time-items screen was skipped without notice, so 'no flags were raised' may mean it was not evaluated; and D&A could be a sub-line below the filer's own Depreciation, which moves EBITDA, net debt/EBITDA and capex/D&A. Re-run the report for the current derivation.`;

const STATEMENT_FIELDS = ["keyless.incomeAnnual", "keyless.incomeQuarterly"] as const;
const RESTATEMENT_FIELDS = ["keyless.incomeQuarterly.restatements", "keyless.incomeAnnual.restatements"] as const;

const isStatementField = (field: string): boolean =>
  STATEMENT_FIELDS.some((prefix) => field === prefix || field.startsWith(`${prefix}.`));

export function withLegacyEdgarDerivedLines(report: Report): Report {
  if (!specVersionBefore(report.meta.specVersion, SINCE)) return report;
  const manifest = report.appendix.missingData;
  // A keyless run files `keyless.<member>` "served by edgar (...)": that entry means the statements came from SEC filings.
  if (!manifest.some((entry) => isStatementField(entry.field))) return report;

  let next: Report = report;

  const fairValue = next.fairValue;
  if (fairValue !== undefined && fairValue.status === "available" && !fairValue.basis.includes(LEGACY_EDGAR_FAIR_VALUE_NOTE)) {
    next = { ...next, fairValue: { ...fairValue, basis: [...fairValue.basis, LEGACY_EDGAR_FAIR_VALUE_NOTE] } };
  }

  const trend = next.filingDisclosures?.quarterlyTrend;
  const revenueRepresented = manifest.some(
    (entry) => (RESTATEMENT_FIELDS as readonly string[]).includes(entry.field) && entry.reason.includes(" revenue "),
  );
  if (revenueRepresented && trend !== undefined && trend.length > 0 && !(trend[0]!.revenueGrowthNotes ?? []).includes(LEGACY_EDGAR_TREND_NOTE)) {
    const rows = [{ ...trend[0]!, revenueGrowthNotes: [...(trend[0]!.revenueGrowthNotes ?? []), LEGACY_EDGAR_TREND_NOTE] }, ...trend.slice(1)];
    next = { ...next, filingDisclosures: { ...next.filingDisclosures!, quarterlyTrend: rows } };
  }

  const notes = next.quality.notes ?? [];
  if (!notes.includes(LEGACY_EDGAR_QUALITY_NOTE)) {
    next = { ...next, quality: { ...next.quality, notes: [...notes, LEGACY_EDGAR_QUALITY_NOTE] } };
  }
  return next;
}
