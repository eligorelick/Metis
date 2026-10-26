import type { ReactNode } from "react";
import type { Report } from "@/report/schema";
import { deriveReportCompletenessPresentation } from "@/report/completeness";
import { syntheticNotice } from "@/report/presentation";

/** Shared selected-snapshot identity. No live data or latest-run lookup. */
export function ReportSnapshotHeader({ snapshot: report, reportId, status, actions, navigation, controls }: {
  snapshot: Report; reportId: number; status: string; actions: ReactNode; navigation?: ReactNode; controls?: ReactNode;
}) {
  const c = deriveReportCompletenessPresentation(report.meta.dataCompleteness, report.appendix.missingData, report.appendix.sources);
  const quoteDate = report.meta.evidenceTiming?.quote.observedAt ?? report.marketData?.quote?.asOf ?? report.meta.asOfMap.quote ?? report.meta.asOfMap["quote.price"];
  const generated = new Date(report.meta.generatedAt);
  const time = Number.isFinite(generated.valueOf()) ? generated.toISOString().replace("T", " ").replace("Z", " UTC") : report.meta.generatedAt;
  return <header className="report-snapshot-header">
    <div className="snapshot-heading-row">
      <div className="min-w-0">
        <h1 className="dossier-company-title">{report.meta.companyName} <span className="snapshot-ticker">{report.meta.symbol}</span></h1>
        <p className="snapshot-identity">Saved report <strong>#{reportId}</strong> · <time dateTime={report.meta.generatedAt}>{time}</time></p>
      </div>
      <div className="company-actions">{actions}</div>
    </div>
    <p className="snapshot-status"><span>Process: {status?.toUpperCase() ?? "UNKNOWN"}</span><span>Research: {c.dataOnly ? "data-only" : c.state}</span><span>{c.dataOnly ? "No completed analyst analysis" : "Recorded analysis"}</span><span>Saved snapshot</span></p>
    {quoteDate && <p className="snapshot-observation">Quote observed <time dateTime={quoteDate}>{quoteDate}</time>{report.meta.evidenceTiming?.quote.stale ? " · stale" : ""}. Other inputs retain their individual observation dates.</p>}
    {syntheticNotice(report) && <p className="snapshot-synthetic">{syntheticNotice(report)}</p>}
    <div className="snapshot-workspace-tools">{navigation}{controls}</div>
  </header>;
}
