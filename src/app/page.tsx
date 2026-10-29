import Link from "next/link";
import { MetisLogo } from "@/brand/MetisLogo";
import { getConfig } from "@/config/env";
import { describeAnalysisRoute } from "@/ai/connections";
import { hasConfiguredEdgarIdentity } from "@/providers/edgar";
import { AppShell } from "@/components/shell";
import { Badge, GradeChip, Panel } from "@/components/ui";
import { WatchlistSidebar } from "@/components/watchlist/Sidebar";
import {
  getWatchlistView,
  type WatchlistRowView,
  type WatchlistGrades,
  type WatchlistGradeLabels,
} from "@/watchlist/watchlist";
import { AddTicker } from "@/components/watchlist/AddTicker";
import { CoverageDesk } from "@/components/watchlist/CoverageDesk";
import { GRADE_SURFACES } from "@/report/surfaceManifest";

// Key presence is read from process.env at request time — never bake it into
// the build output. The dashboard watchlist only reads saved DB/cache data.
export const dynamic = "force-dynamic";

function KeyRow({
  name,
  configured,
  detail,
}: {
  name: string;
  configured: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-edge py-1.5 last:border-b-0">
      <div className="min-w-0">
        <div className="mono text-[12px] text-fg">{name}</div>
        <div className="text-[11px] text-faint">{detail}</div>
      </div>
      {configured ? (
        <Badge tone="pos">configured</Badge>
      ) : (
        <Badge tone="neg">missing</Badge>
      )}
    </div>
  );
}

function KeylessRow({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-edge py-1.5 last:border-b-0">
      <div className="min-w-0">
        <div className="mono text-[12px] text-fg">{name}</div>
        <div className="text-[11px] text-faint">{detail}</div>
      </div>
      <Badge tone="accent">keyless</Badge>
    </div>
  );
}

/* ------------------------------------------------------------------------ *
 * Home watchlist panel — the same enriched view the sidebar renders, but as a
 * prominent dashboard card with a wider grade strip and a quick add control.
 * ------------------------------------------------------------------------ */

function fmtPrice(v: number): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function HomeGradeStrip({ grades, labels }: { grades: WatchlistGrades | null | undefined; labels?: WatchlistGradeLabels }) {
  if (!grades) {
    return <span className="mono text-[10px] text-faint">no report</span>;
  }
  return (
    <div className="flex items-center gap-1" aria-label="section grades">
      {GRADE_SURFACES.map((descriptor) => {
        const grade = grades[descriptor.key];
        const description = `${descriptor.shortLabel}: ${labels?.[descriptor.key] ?? grade ?? "not assessed"}`;
        return grade === undefined ? null : (
          <span key={descriptor.id} className="flex flex-col items-center gap-px" title={description} aria-label={description}>
            <span className="text-[7px] leading-none text-faint">{descriptor.shortLabel}</span>
            <GradeChip grade={grade} />
          </span>
        );
      })}
    </div>
  );
}

function HomeWatchRow({ row }: { row: WatchlistRowView }) {
  const price = typeof row.price === "number" ? row.price : null;
  const change = typeof row.changePct === "number" ? row.changePct : null;
  const changeTone =
    change === null ? "text-faint" : change >= 0 ? "text-pos" : "text-neg";
  return (
    <Link
      href={`/company/${encodeURIComponent(row.symbol)}`}
      className="flex items-center justify-between gap-3 border-b border-edge px-3 py-2 last:border-b-0 hover:bg-raised"
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="mono text-[13px] font-semibold tracking-[0.06em] text-fg">
          {row.symbol}
        </span>
        {row.companyName ? (
          <span className="truncate text-[11px] text-faint">{row.companyName}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <HomeGradeStrip grades={row.grades} labels={row.gradeLabels} />
        <div className="flex flex-col items-end">
          <span className="mono text-[12px] text-fg">
            {price === null ? "—" : fmtPrice(price)}
          </span>
          {change !== null ? (
            <span className={`mono text-[10px] ${changeTone}`}>
              {change >= 0 ? "+" : ""}
              {change.toFixed(2)}%
            </span>
          ) : null}
          {price !== null && row.asOf ? (
            <span className="mono text-[9px] text-faint">
              {`cached quote · ${row.asOf.slice(0, 10)}${row.priceStale ? " · stale" : ""}`}
            </span>
          ) : null}
        </div>
        <span className="mono text-[16px] leading-none text-faint">→</span>
      </div>
    </Link>
  );
}

async function HomeWatchlistPanel({ fixtureMode, dossier = false }: { fixtureMode: boolean; dossier?: boolean }) {
  let rows: WatchlistRowView[] = [];
  let loadFailed = false;
  try {
    rows = await getWatchlistView();
  } catch {
    loadFailed = true;
  }
  return (
    <Panel
      title={dossier ? "Companies under review" : "watchlist"}
      right={
        <span className="mono text-[10px] text-faint">
          {loadFailed ? "unavailable" : `${rows.length} ${rows.length === 1 ? "ticker" : "tickers"}`}
        </span>
      }
    >
      <div className="mb-2">
        <AddTicker />
      </div>
      {loadFailed ? (
        <p role="alert" className="px-1 py-3 text-[12px] text-neg">
          Could not load watchlist. Reload this page to try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="px-1 py-3 text-[12px] text-muted">
          No tickers yet. Add one above, or{" "}
          <Link
            href={fixtureMode ? "/company/DEMO" : "/company/AAPL"}
            className="text-accent hover:underline"
          >
            start with {fixtureMode ? "DEMO" : "AAPL"} →
          </Link>
        </p>
      ) : dossier ? <CoverageDesk rows={rows} /> : (
        <div className="border border-edge bg-bg">
          {rows.map((row) => (
            <HomeWatchRow key={row.symbol} row={row} />
          ))}
        </div>
      )}
    </Panel>
  );
}

/** The route a report would run on; null when the connection store cannot be read. */
function readAnalysisRoute(): { label: string; ready: boolean } | null {
  try {
    const { label, ready } = describeAnalysisRoute();
    return { label, ready };
  } catch {
    return null;
  }
}

export default async function Home() {
  const config = getConfig();
  const route = readAnalysisRoute();
  const routeText = route ? route.label : "unavailable (open Settings to check the AI connection)";
  const hasEdgarContact = hasConfiguredEdgarIdentity();

  return (
    <AppShell sidebar={<WatchlistSidebar />}>
      <div className={config.uiRedesign ? "dossier-desk" : "mx-auto flex max-w-3xl flex-col gap-3 p-4"}>
        {config.uiRedesign ? <section className="desk-intro">
          <div><div className="desk-eyebrow">Research workspace</div><h1>Coverage desk</h1>
            <p>Review your saved research, follow the evidence, and keep the next question in view.</p></div>
          <Link href="/settings" className="text-[12px] text-accent underline">Research settings</Link>
        </section> : <section className="metis-intro border-b border-edge pb-6 pt-3">
          <MetisLogo className="mb-5 h-14 w-[221px]" />
          <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-accent">Evidence. Judgment. Perspective.</p>
          <h1 className="metis-heading text-3xl leading-tight sm:text-4xl">A considered view of the business.</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">Build your investment thesis from financial statements, source evidence and explicit assumptions. Keep the reasoning, risks and unanswered questions in view.</p>
        </section>}

        {config.fixtureMode && (
          <div className="border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-warn">
            <span className="mono font-semibold uppercase tracking-[0.08em]">
              synthetic fixture mode
            </span>{" "}
            — no FMP_API_KEY configured. No current market data is fetched by
            watchlist navigation. Quotes and earnings dates use
            eligible saved data or disclosed gaps; cached quotes show their date.
            Real US filers are still served live from SEC
            EDGAR and Yahoo through live analysis once EDGAR_CONTACT is set. The
            fictional general-company ticker{" "}
            <Link href="/company/DEMO" className="font-semibold underline">
              DEMO
            </Link>{" "}
            and bank ticker <span className="mono font-semibold">DBNK</span> are
            synthetic fixtures; unsupported symbols become disclosed gaps. Add a
            key to <span className="mono">.env</span> and restart for FMP data.
          </div>
        )}

        <HomeWatchlistPanel fixtureMode={config.fixtureMode} dossier={config.uiRedesign} />

        {config.uiRedesign && <div className="desk-status">FMP: {config.hasFmpKey ? "configured" : "not configured"} · SEC contact: {hasEdgarContact ? "configured" : "not configured"} · Reports run on: <span className="mono">{routeText}</span>. <Link href="/settings" className="text-accent underline">Configure research</Link></div>}

        <details className={config.uiRedesign ? "connection-details" : "contents"} open={!config.uiRedesign}>
          <summary className={config.uiRedesign ? undefined : "hidden"}>Connections, keyless sources &amp; model details</summary>
          <div className={config.uiRedesign ? undefined : "contents"}>

        <Panel
          title="research connections"
          right={
            <Link href="/settings" className="text-accent hover:underline">
              settings →
            </Link>
          }
        >
          <div className="flex flex-col">
            <KeyRow
              name="FMP_API_KEY"
              configured={config.hasFmpKey}
              detail="primary fundamentals + market data; a configured key does not confirm subscription entitlement (restricted endpoints or symbols may return HTTP 402)"
            />
            <KeyRow
              name="FINNHUB_API_KEY"
              configured={config.hasFinnhubKey}
              detail="insider sentiment (MSPR)"
            />
            <KeyRow
              name="FRED_API_KEY"
              configured={config.hasFredKey}
              detail="macro series (keyless fredgraph.csv fallback when no key is set or the API fails)"
            />
            <KeyRow
              name="ANTHROPIC_API_KEY"
              configured={config.hasAnthropicKey}
              detail="optional paid Claude analysis + web search; ChatGPT and Gemini sign-in are available in Settings"
            />
          </div>
        </Panel>

        <Panel title="keyless sources">
          <div className="flex flex-col">
            <KeyRow
              name="SEC EDGAR"
              configured={hasEdgarContact}
              detail={hasEdgarContact
                ? "contact configured for filings, issuer verification and eligible fallback data; service availability is checked during a run"
                : "set EDGAR_CONTACT in .env to your name or organization and a reachable email, then restart to enable SEC access and eligible fallback data"}
            />
            <KeylessRow
              name="FINRA"
              detail="short interest + days to cover"
            />
          </div>
        </Panel>

        <Panel title="models">
          <div className="flex flex-col gap-1 text-[12px]">
            <div className="flex items-center justify-between">
              <span className="text-muted">Reports run on</span>
              <span className={`mono ${route && !route.ready ? "text-warn" : ""}`}>{routeText}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Claude model default (env, used only on a Claude route)</span>
              <span className="mono">{config.analysisModel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">verification</span>
              <span className="mono">deterministic (no model)</span>
            </div>
            <div className="pt-1 text-[11px] text-faint">
              Override on the{" "}
              <Link href="/settings" className="text-accent hover:underline">
                settings page
              </Link>
              .
            </div>
          </div>
        </Panel>
          </div>
        </details>
      </div>
    </AppShell>
  );
}
