/**
 * /company/[symbol]/report/[reportId] — the full, in-app view of ONE saved run.
 *
 * The company page always shows a symbol's LATEST report; this route renders a
 * specific persisted run by id (every run is saved as its own row — see
 * persistReport in jobRunner.ts), so past runs are actually viewable, not just
 * the newest. It reuses the shared ReportView renderer inside the normal
 * AppShell chrome (watchlist sidebar, current ticker auto-expanded).
 *
 * Deliberately does NOT re-run the pipeline: this is a pure DB read of the saved
 * snapshot, so it is fast and faithful — a historical run is shown as it was,
 * not decorated with today's live price/fundamentals charts (those live on the
 * company page). A missing / unparseable id degrades to a friendly in-shell
 * message rather than a 500.
 *
 * Server Component; reads persisted rows at request time.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/shell";
import { WatchlistSidebar } from "@/components/watchlist/Sidebar";
import { PersistedReportView } from "@/components/report/PersistedReportView";
import { ExportButtons } from "@/components/report/ExportButtons";
import { ReportNotes } from "@/components/report/ReportNotes";
import { ReportSnapshotHeader } from "@/components/report/ReportSnapshotHeader";
import { getReportByIdForSymbol, parseReportId } from "@/report/history";
import { normalizeRouteSymbol } from "@/symbol";
import { getConfig } from "@/config/env";
import { ResearchNavigation } from "@/components/report/ResearchNavigation";
import { DeleteReportButton } from "@/components/report/DeleteReportButton";
import { GenerateReport } from "../../GenerateReport";
import { activeRunIdentity } from "@/pipeline/companyJobIdentity";
import { describeAnalysisRoute } from "@/ai/connections";

// Reads persisted rows at request time — never statically pre-render.
export const dynamic = "force-dynamic";

export default async function RunReportPage({
  params,
}: {
  params: Promise<{ symbol: string; reportId: string }>;
}) {
  const { symbol: routeSymbol, reportId: rawId } = await params;
  const symbol = normalizeRouteSymbol(routeSymbol);
  if (symbol === null) notFound();
  const reportId = parseReportId(rawId);

  const loaded = reportId !== null ? getReportByIdForSymbol(reportId, symbol) : null;

  if (loaded === null) {
    return (
      <AppShell sidebar={<WatchlistSidebar activeSymbol={symbol} />}>
        <div className="mx-auto max-w-2xl p-6">
          <div className="border border-neg/40 bg-neg/10 px-4 py-3 text-[12px] text-neg">
            <div className="mono font-semibold">run unavailable</div>
            <p className="mt-1 text-muted">
              No readable report was found for id{" "}
              <span className="mono text-fg">#{rawId}</span> ({symbol}). It may
              not exist, or its stored content could not be parsed.
            </p>
            <div className="mt-3 flex gap-3 text-[11px]">
              <Link
                href={`/company/${encodeURIComponent(symbol)}/history`}
                className="text-accent hover:underline"
              >
                ← {symbol} history
              </Link>
              <Link
                href={`/company/${encodeURIComponent(symbol)}?view=live`}
                prefetch={false}
                className="text-accent hover:underline"
              >
                {symbol} (live) →
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const { row, report } = loaded;
  const dossier = getConfig().uiRedesign;
  let route = null;
  try { route = describeAnalysisRoute(); } catch { /* The report remains readable without connection storage. */ }

  return (
    <AppShell sidebar={<WatchlistSidebar activeSymbol={symbol} activeReportId={row.id} />}>
      <div className="saved-research-workspace flex flex-col gap-3 p-4">
        <ReportSnapshotHeader snapshot={report} reportId={row.id} status={row.status}
          actions={<><ExportButtons reportId={row.id} symbol={symbol} /><DeleteReportButton reportId={row.id} symbol={symbol} redirect />{!dossier && <Link href={`/company/${encodeURIComponent(symbol)}/history`}>History</Link>}</>}
          navigation={dossier ? <ResearchNavigation symbol={symbol} active="report" reportHref={`/company/${encodeURIComponent(symbol)}/report/${row.id}`} /> : <Link href={`/company/${encodeURIComponent(symbol)}?view=live`} prefetch={false}>Ticker data</Link>}
          controls={<div className="snapshot-controls"><GenerateReport symbol={symbol} initialJobId={await activeRunIdentity(symbol)} route={route} renderedReportId={row.id} liveView />{dossier && <ReportNotes symbol={symbol} reportId={row.id} />}</div>}
        />
        <PersistedReportView key={row.id} report={report} selectedReportId={row.id} selectedReportStatus={row.status} headerNotices />
      </div>
    </AppShell>
  );
}
