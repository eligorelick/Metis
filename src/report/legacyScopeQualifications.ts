import type { Report } from "@/report/schema";
import { specVersionBefore } from "@/report/legacyPayloadRecordSafety";

/** D-138: frozen independently from the bridge, annualization and share-basis cutoffs. */
export const LEGACY_SCOPE_SINCE_SPEC = "1.53.0";
export const LEGACY_SCOPE_HEADING = "Read-time saved-report clarifications";

function version(report: Pick<Report, "meta">): string {
  return typeof report.meta.specVersion === "string" ? report.meta.specVersion.trim() : "";
}

/** Pure sidecar, never a recorded manifest row, source, gap or verification result. */
export function legacyScopeQualifications(report: Pick<Report, "meta"> & Partial<Pick<Report, "quality">>): readonly string[] {
  const saved = version(report);
  if (!specVersionBefore(saved, LEGACY_SCOPE_SINCE_SPEC)) {
    // Current assembly can consume older computed flags. Version establishes no
    // source scope; only these exact owned wrappers justify a separate caveat.
    // The report adapter still returns the current/future report unchanged.
    const flags = report.quality?.flags ?? [];
    const notes: string[] = [];
    if (flags.some(flag => flag.source === "computed.forensics.flags.receivables-vs-revenue" && RECEIVABLES.test(flag.text))) {
      notes.push("The saved receivables flag alone does not establish like-for-like scope. Check the selected definitions before drawing an accounting conclusion; its amounts, rule and severity remain recorded.");
    }
    if (flags.some(flag => flag.source === "computed.forensics.flags.recurring-discontinued-ops" && DISCONTINUED.test(flag.text))) {
      notes.push("The saved discontinued-results flag alone does not establish transaction number or recurrence. One disposal can affect multiple periods; its observation count, rule and severity remain recorded.");
    }
    return notes;
  }
  return [
    (/^\d+\.\d+\.\d+$/.test(saved)
      ? `Built before report spec ${LEGACY_SCOPE_SINCE_SPEC}.`
      : `Historical scope evidence is not recorded; this read-time convention was introduced in ${LEGACY_SCOPE_SINCE_SPEC}.`) +
      " These are display qualifications, not newly recorded run evidence. Stored figures, grades and recorded evidence are unchanged.",
    "Retained receivables scope comparability is unverified. Historical growth comparisons, DSRI values and adverse flags remain as saved; check the selected receivables definitions before drawing an accounting conclusion. Published ratios alone cannot reconstruct a comparable pair.",
    "Saved debt, net debt, EV, WACC, ROIC and DCF operands retain their saved basis. Without complete period-specific lease coverage, a zero or a verified numeric citation does not establish zero leases or whether unseparated leases are included or excluded. Latest-balance evidence does not establish historical bridge or average-debt coverage; saved partial-scope limitations still apply.",
    "A saved Altman score does not establish its market-cap observation date. Missing date evidence does not prove a missing market-cap value; a genuine missing-value refusal remains valid. No quote, filing, report or acquisition date is substituted.",
    "A discontinued-results observation count does not establish the number or recurrence of portfolio transactions; one disposal can affect multiple periods. The saved count is retained. Where selected observation dates and scope were not retained, they remain unknown; current statements cannot replace them.",
  ];
}

// Exact data-only generator grammar at its owned QualityFlag position. Amounts,
// thresholds and the entire rule suffix are carried verbatim; no arbitrary prose.
const RECEIVABLES = /^(Receivables grew -?\d+\.\d% while revenue grew -?\d+\.\d% — )possible channel stuffing or loosened credit terms\.( \(rule: house rule: receivables growth − revenue growth > \d+(?:\.\d+)?pp \(warn\) \/ > \d+(?:\.\d+)?pp \(flag\), with receivables growth > \d+(?:\.\d+)?%\))$/;
const DISCONTINUED = /^Discontinued operations affected results in (\d+) of the last (\d+) fiscal years — recurring portfolio churn complicates run-rate earnings\.( \(rule: house rule: netIncomeFromDiscontinuedOperations nonzero in >= 2 of the last 5 fiscal years\))$/;

/** Apply after the existing safety chain, especially the bridge's EXCLUDES reader. */
export function withLegacyScopeQualifications(report: Report): Report {
  if (!specVersionBefore(version(report), LEGACY_SCOPE_SINCE_SPEC)) return report;
  const flags = report.quality.flags.map(flag => {
    let text = flag.text;
    if (flag.source === "computed.forensics.flags.receivables-vs-revenue") {
      text = text.replace(RECEIVABLES, "$1scope comparability is unverified; review the underlying receivables definitions before drawing an accounting conclusion.$2");
    } else if (flag.source === "computed.forensics.flags.recurring-discontinued-ops") {
      text = text.replace(DISCONTINUED, "Nonzero discontinued-operation results were retained in $1 of the last $2 fiscal-year observations. The observation count does not establish the number or recurrence of portfolio transactions; one disposal can affect multiple periods. Selected observation dates and scope were not retained.$3");
    }
    return text === flag.text ? flag : { ...flag, text };
  });
  return flags.every((flag, i) => flag === report.quality.flags[i]) ? report : { ...report, quality: { ...report.quality, flags } };
}
