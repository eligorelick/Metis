import type { ReactNode } from "react";
import type { Report } from "@/report/schema";
import { deriveReportCompletenessPresentation } from "@/report/completeness";
import { syntheticNotice } from "@/report/presentation";

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
export function ReportSnapshotHeader({ snapshot: report, reportId, status, actions, navigation, controls }: {
  snapshot: Report; reportId: number; status: string; actions: ReactNode; navigation?: ReactNode; controls?: ReactNode;
}) {
  const c = deriveReportCompletenessPresentation(report.meta.dataCompleteness, report.appendix.missingData, report.appendix.sources);
  const quoteDate = report.meta.evidenceTiming?.quote.observedAt ?? report.marketData?.quote?.asOf ?? report.meta.asOfMap.quote ?? report.meta.asOfMap["quote.price"];
  const time = generatedTimeText(report.meta.generatedAt);
  return <header className="report-snapshot-header">
    <div className="snapshot-heading-row">
      <div className="min-w-0">
        <h1 className="dossier-company-title">{report.meta.companyName} <span className="snapshot-ticker">{report.meta.symbol}</span></h1>
        <p className="snapshot-identity">Saved report <strong>#{reportId}</strong> · <time dateTime={report.meta.generatedAt}>{time}</time></p>
      </div>
      <div className="company-actions">{actions}</div>
    </div>
    <p className="snapshot-status"><span>Process: {status?.toUpperCase() ?? "UNKNOWN"}</span><span>Research: {c.dataOnly ? "data-only" : c.state}</span><span>{c.dataOnly ? "No completed analyst analysis" : "Recorded analysis"}</span><span>Saved snapshot</span></p>
    {quoteDate && <p className="snapshot-observation">Quote observed <time dateTime={quoteDate}>{observationText(quoteDate)}</time>{report.meta.evidenceTiming?.quote.stale ? " · stale" : ""}. Other inputs retain their individual observation dates.</p>}
    {syntheticNotice(report) && <p className="snapshot-synthetic">{syntheticNotice(report)}</p>}
    <div className="snapshot-workspace-tools">{navigation}{controls}</div>
  </header>;
}
