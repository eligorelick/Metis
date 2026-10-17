import type { Report } from "@/report/schema";

export const PRINCIPAL_CORRECTION_FIELD = "presentation.principalAggregation";
export const PRINCIPAL_CORRECTION_NOTE = "Deterministic presentation correction: an earlier generated principal-total annotation was withheld or re-derived from retained issuer text. No analyst or model rerun occurred. Original stored reports, source snapshots, model usage and analysis conventions are unchanged.";

/** Only the exact legacy pipeline annotation; never rewrite issuer or analyst prose. */
export function withoutLegacyPrincipalAnnotation(summary: string): string {
  return summary.replace(/ ?\[computed: [1-9]\d* series, (?:US)?\$\d+(?:\.\d+)? (?:billion|million) aggregate principal amount in total\]/g, "");
}

export interface PrincipalSummaryCorrection {
  accession: string;
  before: string;
  after: string;
  kind: "legacy-principal-total-withheld" | "source-principal-summary-rederived";
}

export function principalSummaryCorrections(report: Pick<Report, "filingDisclosures">): PrincipalSummaryCorrection[] {
  return (report.filingDisclosures?.events ?? []).flatMap((event) => {
    const after = withoutLegacyPrincipalAnnotation(event.summary);
    const kind = after !== event.summary ? "legacy-principal-total-withheld" : event.summaryCorrection;
    return kind === undefined ? [] : [{ accession: event.accession, before: event.summary, after, kind }];
  });
}

/** Immutable view/export copy. This never changes the saved report's conventions or model output. */
export function withPrincipalSummarySafety(report: Report): Report {
  const corrections = principalSummaryCorrections(report);
  if (corrections.length === 0) return report;
  const alreadyDisclosed = report.appendix.missingData.some((gap) => gap.field === PRINCIPAL_CORRECTION_FIELD && gap.expected === true && gap.severity === "info" && gap.reason === PRINCIPAL_CORRECTION_NOTE);
  if (alreadyDisclosed && corrections.every((change) => change.before === change.after)) return report;
  return {
    ...report,
    filingDisclosures: {
      ...report.filingDisclosures!,
      events: report.filingDisclosures!.events.map((event) => {
        const summary = withoutLegacyPrincipalAnnotation(event.summary);
        return summary === event.summary ? event : { ...event, summary, summaryCorrection: "legacy-principal-total-withheld" as const };
      }),
    },
    appendix: {
      ...report.appendix,
      missingData: alreadyDisclosed ? report.appendix.missingData : [...report.appendix.missingData.filter((gap) => gap.field !== PRINCIPAL_CORRECTION_FIELD), {
        field: PRINCIPAL_CORRECTION_FIELD, reason: PRINCIPAL_CORRECTION_NOTE, severity: "info" as const,
        expected: true,
        attemptedSources: corrections.map((change) => `SEC current report ${change.accession}`),
      }],
    },
  };
}
