/**
 * Watchlist sidebar : the app-wide left rail. Renders, per watched
 * symbol, a dense scannable row — ticker (mono, links to /company/SYMBOL),
 * price + colored change%, a compact grade chip strip (n/a when no report),
 * last-report date, and next-earnings date. An AddTicker control sits at the
 * top and a per-row remove (×) at the right.
 *
 * Two entry points:
 *   - {@link WatchlistSidebar} — an async SERVER component that calls
 *     getWatchlistView() itself. The integrator slots <WatchlistSidebar/> into
 *     AppShell's `sidebar` prop across pages.
 *   - {@link Sidebar} — the presentational body, given an already-computed
 *     WatchlistRowView[]. Server-friendly (no hooks); reuses it in tests /
 *     stories or when a page has already loaded the view.
 *
 * Data fetching lives in the server data layer (@/watchlist/watchlist); the
 * only client pieces are AddTicker + RemoveButton, imported as leaves.
 */

import Link from "next/link";

import { GradeChip } from "@/components/ui";
import { GRADE_SURFACES } from "@/report/surfaceManifest";
import type { Grade } from "@/types/core";
import { getWatchlistView, type WatchlistRowView, type WatchlistGrades, type WatchlistGradeLabels } from "@/watchlist/watchlist";

import { AddTicker } from "./AddTicker";
import { RemoveButton } from "./RemoveButton";
import { RunsDisclosure } from "./RunsDisclosure";

/* ------------------------------------------------------------------------ *
 * Async server entry — the mountable component
 * ------------------------------------------------------------------------ */

/**
 * Async server component: loads the enriched view and renders the sidebar.
 * Keeps the app chrome available when loading fails, while distinguishing
 * unavailable data from a successfully loaded empty watchlist.
 */
export async function WatchlistSidebar({ activeSymbol, activeReportId }: { activeSymbol?: string; activeReportId?: number }) {
  let rows: WatchlistRowView[] = [];
  let loadFailed = false;
  try {
    rows = await getWatchlistView();
  } catch {
    loadFailed = true;
  }
  return <Sidebar rows={rows} activeSymbol={activeSymbol} activeReportId={activeReportId} loadFailed={loadFailed} />;
}

/* ------------------------------------------------------------------------ *
 * Presentational body
 * ------------------------------------------------------------------------ */

export function Sidebar({
  rows,
  activeSymbol,
  activeReportId,
  loadFailed = false,
}: {
  rows: WatchlistRowView[];
  activeSymbol?: string;
  activeReportId?: number;
  loadFailed?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <span className="mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
          watchlist
        </span>
        <span className="mono text-[10px] text-faint">{loadFailed ? "unavailable" : rows.length}</span>
      </div>

      <div className="border-b border-edge p-2">
        <AddTicker />
      </div>

      {loadFailed ? (
        <p role="alert" className="px-3 py-4 text-[11px] text-neg">
          Could not load watchlist. Reload this page to try again.
        </p>
      ) : rows.length === 0 ? (
        <div className="px-3 py-6 text-center text-[11px] text-faint">
          no tickers yet
          <div className="mt-1 text-[10px] text-faint">add one above to track it</div>
        </div>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <WatchRow
              key={row.symbol}
              row={row}
              active={activeSymbol !== undefined && row.symbol === activeSymbol}
              selectedReportId={row.symbol === activeSymbol ? activeReportId : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ *
 * Row
 * ------------------------------------------------------------------------ */

function WatchRow({ row, active, selectedReportId }: { row: WatchlistRowView; active: boolean; selectedReportId?: number }) {
  const price = typeof row.price === "number" ? row.price : null;
  const change = typeof row.changePct === "number" ? row.changePct : null;
  const changeTone =
    change === null ? "text-faint" : change >= 0 ? "text-pos" : "text-neg";

  return (
    <li className="watch-row group relative border-b border-edge last:border-b-0">
      {/* The remove control is a SIBLING of the row link, not a child: HTML
          forbids interactive content inside <a>, and a nested button folded
          "remove AAPL" into the link's accessible name (audit 2026-09-06,
          F218). It sits at the top-right, over the padding the price row
          leaves for it. */}
      <div className="watch-row-remove absolute right-3 top-2">
        <RemoveButton symbol={row.symbol} />
      </div>
      <Link
        href={`/company/${encodeURIComponent(row.symbol)}`}
        aria-current={active ? "page" : undefined}
        className="block px-3 py-2 hover:bg-raised"
      >
        {/* ticker + price */}
        <div className="watch-row-heading flex items-baseline justify-between gap-2 pr-5">
          <div className="watch-row-identity flex min-w-0 items-baseline gap-2">
            <span className="watch-row-ticker mono text-[13px] font-semibold tracking-[0.06em] text-fg">
              {row.symbol}
            </span>
            {row.companyName ? (
              <span className="watch-row-company truncate text-[10px] text-faint">{row.companyName}</span>
            ) : null}
          </div>
          <span className="watch-row-price mono shrink-0 text-[12px] text-fg">
            {price === null ? "—" : fmtPrice(price)}
          </span>
        </div>

        {/* change% + grade strip */}
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className={`mono text-[11px] ${changeTone}`}>
            {change === null ? "" : fmtSignedPct(change)}
          </span>
          <div>{row.lastReportAt && <span className="watch-grade-identity">Latest saved report{row.latestReportId ? ` #${row.latestReportId}` : ""}</span>}<GradeStrip grades={row.grades ?? null} labels={row.gradeLabels} /></div>
        </div>

        {price !== null && row.asOf ? (
          <div className="mono mt-1 text-[9px] text-faint">
            {`cached quote · ${row.asOf.slice(0, 10)}${row.priceStale ? " · stale" : ""}`}
          </div>
        ) : null}

        {/* last report / next earnings */}
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-faint">
          <span className="mono">
            {row.lastReportAt ? `rpt ${row.lastReportAt.slice(0, 10)}` : "no report"}
            {typeof row.verificationRate === "number" ? (
              <span title="citation coverage — provenance, not correctness">
                {` · ${(row.verificationRate * 100).toFixed(1)}% figures traced`}
              </span>
            ) : (
              ""
            )}
          </span>
          <span className="mono">
            {row.nextEarnings ? `ER ${row.nextEarnings}` : "ER —"}
          </span>
        </div>
      </Link>
      <RunsDisclosure symbol={row.symbol} runs={row.runs ?? []} defaultOpen={active} selectedReportId={selectedReportId} />
    </li>
  );
}

/** Compact grade strip; a plain "n/a" placeholder when no report exists. */
function GradeStrip({ grades, labels }: { grades: WatchlistGrades | null; labels?: WatchlistGradeLabels }) {
  if (grades === null) {
    return <span className="mono text-[10px] text-faint">grades n/a</span>;
  }
  return (
    <div className="flex items-center gap-0.5" aria-label="section grades">
      {GRADE_SURFACES.map((descriptor) => {
        const grade = grades[descriptor.key];
        return grade === undefined
          ? null
          : <MiniGrade key={descriptor.id} label={descriptor.shortLabel} grade={grade} explanation={labels?.[descriptor.key]} />;
      })}
    </div>
  );
}

/**
 * A single tiny grade cell: a one-letter section label over a color-coded grade.
 * Reuses GradeChip's --grade-* coloring for the letter; the section label keeps
 * the strip legible in the narrow rail.
 */
function MiniGrade({ label, grade, explanation }: { label: string; grade: Grade | null; explanation?: string }) {
  const description = `${label}: ${explanation ?? grade ?? "not assessed"}`;
  return (
    <span className="flex flex-col items-center gap-px" title={description} aria-label={description}>
      <span className="text-[7px] leading-none text-faint">{label}</span>
      <GradeChip grade={grade} />
    </span>
  );
}

/* ------------------------------------------------------------------------ *
 * Local formatters (kept independent of the company page's format helpers)
 * ------------------------------------------------------------------------ */

function fmtPrice(v: number): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtSignedPct(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}
