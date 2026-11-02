import type { ReactNode } from "react";
import { analysisOutcomeText } from "@/report/analysisCompletion";
import type { Report } from "@/report/schema";
import { deriveReportCompletenessPresentation } from "@/report/completeness";
import { RunNotices } from "./RunNotices";

/**
 * A recorded observation time for reading: a bare date stays a date, a
 * midnight-UTC timestamp (how date-only observations are stored) reads as its
 * date, and any other instant reads to the minute in UTC. The raw value stays
 * in the <time dateTime> attribute.
 */
export function observationText(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}T00:00(?::00(?:\.0+)?)?(?:Z|\+00:00)$/.test(value)) return value.slice(0, 10);
  const instant = new Date(value);
  return Number.isFinite(instant.valueOf()) ? `${instant.toISOString().slice(0, 16).replace("T", " ")} UTC` : value;
}

/** The saved snapshot's generation time, to the millisecond in UTC ("2026-10-25 17:11:18.588 UTC"). */
export function generatedTimeText(value: string): string {
  const generated = new Date(value);
  return Number.isFinite(generated.valueOf()) ? generated.toISOString().replace("T", " ").replace("Z", " UTC") : value;
}

/** Shared selected-snapshot identity. No live data or latest-run lookup. */
export function ReportSnapshotHeader({ snapshot: report, actions, navigation, controls }: {
  snapshot: Report; reportId: number; status: string; actions: ReactNode; navigation?: ReactNode; controls?: ReactNode;
}) {
  return <header className="report-snapshot-header">
    <div className="snapshot-heading-row">
      <div className="min-w-0">
        <h1 className="dossier-company-title">{report.meta.companyName} <span className="snapshot-ticker">{report.meta.symbol}</span></h1>
        <p className="snapshot-identity">Equity Research Report · <time dateTime={report.meta.generatedAt}>{report.meta.generatedAt.slice(0, 10)}</time></p>
      </div>
      <div className="company-actions">{actions}</div>
    </div>
    <p className="text-[10px] text-faint">{report.meta.disclaimer}</p>
    <RunNotices report={report} notices="header" />
    <div className="snapshot-workspace-tools">{navigation}{controls}</div>
  </header>;
}

/** Saved process and observation identity belongs with the appendix disclosures. */
export function ReportSnapshotDetails({ report, reportId, status }: { report: Report; reportId?: number; status?: string }) {
  const c = deriveReportCompletenessPresentation(report.meta.dataCompleteness, report.appendix.missingData, report.appendix.sources);
  const quoteDate = report.meta.evidenceTiming?.quote.observedAt ?? report.marketData?.quote?.asOf ?? report.meta.asOfMap.quote ?? report.meta.asOfMap["quote.price"];
  return <div className="text-[11px] text-muted">
    <p>Saved report {reportId === undefined ? "ID not recorded" : <strong>#{reportId}</strong>} · <time dateTime={report.meta.generatedAt}>{generatedTimeText(report.meta.generatedAt)}</time></p>
    <p className="snapshot-status"><span>Process: {status?.toUpperCase() ?? "UNKNOWN"}</span><span>Research: {c.dataOnly ? "data-only" : c.state}</span><span>{c.dataOnly ? "No completed analyst analysis" : "Recorded analysis"}</span><span>Saved snapshot</span></p>
    {report.meta.analysisOutcome && <p>{analysisOutcomeText(report.meta.analysisOutcome)}</p>}
    {quoteDate && <p className="snapshot-observation">Quote observed <time dateTime={quoteDate}>{observationText(quoteDate)}</time>{report.meta.evidenceTiming?.quote.stale ? " · stale" : ""}. Other inputs retain their individual observation dates.</p>}
  </div>;
}
