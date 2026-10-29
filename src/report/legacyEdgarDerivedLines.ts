import { specVersionBefore } from "@/report/legacyPayloadRecordSafety";
import type { Report } from "@/report/schema";

/**
 * Display-time marking of a stored report whose statements were built from SEC
 * filings before this batch's report spec (audit 2026-10-27, B13, D-67). The
 * derived lines and growth cells it shows are as stored; the notes below say
 * which derivations changed since. No figure is rewritten. Two classes carry a
 * note: FULL (the income statements were served by EDGAR: a `keyless.incomeAnnual`
 * or `keyless.incomeQuarterly` entry whose reason starts "served by edgar") and
 * BACKFILL (only older periods came from SEC filings: a `statements.backfill.income*`
 * entry, an appended `edgar.predecessor` entry, or a scoped `keyless.income*.backfill.*`
 * or `.predecessor.*` entry), whose two notes are scoped to those older periods. FULL
 * wins when both are present. An appended `edgar.predecessor` entry covers all six statement
 * members, so a predecessor history without income periods also carries the BACKFILL notes, and a
 * member served wholly by predecessor rows carries the BACKFILL wording: both are conservative
 * over-inclusions. A report at or after the since-version, or in neither
 * class (an FMP-route report, whose `.shareBasis` entries describe vendor rows), is
 * returned as the identical object (Task 10b, R1 pre-flight I3).
 *
 * The since-version is frozen: it never compares against `REPORT_SPEC_VERSION`
 * itself, because later batches move that constant. Every note is a fixed
 * string: no provider, filing or model text reaches it, because those are
 * untrusted.
 */
export const EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION = "1.49.0";

const SINCE = EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION;

export const LEGACY_EDGAR_FAIR_VALUE_NOTE =
  `Statement lines on this report were built from SEC filings before report spec ${SINCE}. Since then, a derived operating income: no longer drops a period that files the non-operating aggregate without an interest element; removes a filer-tagged other non-operating result; does not add back interest the filer itself placed inside the aggregate. D&A and R&D are never a synonym below their own filed component, and derived quarters and growth cells are checked for one presentation where the filings show a re-presentation, or withheld. Figures shown are as stored; re-run the report for the current derivation.`;

export const LEGACY_EDGAR_TREND_NOTE =
  `YoY/QoQ cells and derived fourth quarters on this report were computed before report spec ${SINCE} without checking whether the two quarters sit on one filed presentation (see the restatements entry in the missing-data manifest); re-run for one-basis growth.`;

export const LEGACY_EDGAR_QUALITY_NOTE =
  `Statement-derived screens on this report were computed before report spec ${SINCE}: where the filer tags no NonoperatingIncomeExpense aggregate, the one-time-items screen was skipped without notice, so 'no flags were raised' may mean it was not evaluated; and D&A could be a sub-line below the filer's own Depreciation, which moves EBITDA, net debt/EBITDA and capex/D&A. Re-run the report for the current derivation.`;

export const LEGACY_EDGAR_BACKFILL_FAIR_VALUE_NOTE = LEGACY_EDGAR_FAIR_VALUE_NOTE.replace(
  `Statement lines on this report were built from SEC filings before report spec ${SINCE}.`,
  `The older statement periods on this report that were backfilled from SEC filings were built before report spec ${SINCE}.`,
);

export const LEGACY_EDGAR_BACKFILL_QUALITY_NOTE = LEGACY_EDGAR_QUALITY_NOTE.replace(
  `Statement-derived screens on this report were computed before report spec ${SINCE}:`,
  `Statement-derived screens on this report's older periods backfilled from SEC filings were computed before report spec ${SINCE}:`,
);

const STATEMENT_FIELDS = ["keyless.incomeAnnual", "keyless.incomeQuarterly"] as const;

const isStatementField = (field: string): boolean =>
  STATEMENT_FIELDS.some((prefix) => field === prefix || field.startsWith(`${prefix}.`));

/**
 * An income restatements entry, scoped (`.backfill`, `.predecessor`) or not, that names a revenue line or lists at
 * most six lines and ends "and N more" (keyless.ts MAX_LISTED_RESTATEMENTS), so a revenue line may sit behind it.
 */
const namesRevenueRepresentation = (entry: { field: string; reason: string }): boolean =>
  isStatementField(entry.field) && entry.field.endsWith(".restatements") && (entry.reason.includes(" revenue ") || /; and \d+ more\b/.test(entry.reason));

/** The `record()` entry of keyless.ts: the whole member was built from SEC filings. Wording unchanged since d6ed91a. */
const isFullEntry = (entry: { field: string; reason: string }): boolean =>
  STATEMENT_FIELDS.some((field) => entry.field === field) && entry.reason.startsWith("served by edgar");

/** Older periods only: `statements.backfill.income*`, an appended predecessor, or a scoped income backfill/predecessor entry. */
const isBackfillEntry = (entry: { field: string; reason: string }): boolean =>
  entry.field === "statements.backfill.incomeAnnual" ||
  entry.field === "statements.backfill.incomeQuarterly" ||
  // predecessorManifestEntry's appended form; the "not appended" form (keyless.ts) says "no pre-reorganization periods were appended".
  (entry.field === "edgar.predecessor" && entry.reason.includes("were taken from the predecessor's filings")) ||
  STATEMENT_FIELDS.some((field) => entry.field.startsWith(`${field}.backfill.`) || entry.field.startsWith(`${field}.predecessor.`));

export function withLegacyEdgarDerivedLines(report: Report): Report {
  if (!specVersionBefore(report.meta.specVersion, SINCE)) return report;
  const manifest = report.appendix.missingData;
  // `keyless.<member>.shareBasis` describes VENDOR rows, so only the entries above mean SEC filings built the statements.
  const full = manifest.some(isFullEntry);
  if (!full && !manifest.some(isBackfillEntry)) return report;
  const fairValueNote = full ? LEGACY_EDGAR_FAIR_VALUE_NOTE : LEGACY_EDGAR_BACKFILL_FAIR_VALUE_NOTE;
  const qualityNote = full ? LEGACY_EDGAR_QUALITY_NOTE : LEGACY_EDGAR_BACKFILL_QUALITY_NOTE;
  // A report that already carries either class's text keeps it: the other class's text is never added beside it.
  const carries = (lines: readonly string[]): boolean =>
    lines.some((line) => line === LEGACY_EDGAR_FAIR_VALUE_NOTE || line === LEGACY_EDGAR_BACKFILL_FAIR_VALUE_NOTE || line === LEGACY_EDGAR_QUALITY_NOTE || line === LEGACY_EDGAR_BACKFILL_QUALITY_NOTE);

  let next: Report = report;

  const fairValue = next.fairValue;
  if (fairValue !== undefined && fairValue.status === "available" && !carries(fairValue.basis)) {
    next = { ...next, fairValue: { ...fairValue, basis: [...fairValue.basis, fairValueNote] } };
  }

  const trend = next.filingDisclosures?.quarterlyTrend;
  const revenueRepresented = manifest.some(namesRevenueRepresentation);
  if (revenueRepresented && trend !== undefined && trend.length > 0 && !(trend[0]!.revenueGrowthNotes ?? []).includes(LEGACY_EDGAR_TREND_NOTE)) {
    const rows = [{ ...trend[0]!, revenueGrowthNotes: [...(trend[0]!.revenueGrowthNotes ?? []), LEGACY_EDGAR_TREND_NOTE] }, ...trend.slice(1)];
    next = { ...next, filingDisclosures: { ...next.filingDisclosures!, quarterlyTrend: rows } };
  }

  const notes = next.quality.notes ?? [];
  if (!carries(notes)) {
    next = { ...next, quality: { ...next.quality, notes: [...notes, qualityNote] } };
  }
  return next;
}
