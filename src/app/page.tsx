import Link from "next/link";
import { getConfig } from "@/config/env";
import { describeAnalysisRoute } from "@/ai/connections";
import { hasConfiguredEdgarIdentity } from "@/providers/edgar";
import { AppShell } from "@/components/shell";
import { Badge, Panel } from "@/components/ui";
import { WatchlistSidebar } from "@/components/watchlist/Sidebar";
import { getWatchlistView, type WatchlistRowView } from "@/watchlist/watchlist";
import { AddTicker } from "@/components/watchlist/AddTicker";
import { CoverageDesk } from "@/components/watchlist/CoverageDesk";

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

async function HomeWatchlistPanel({ fixtureMode }: { fixtureMode: boolean }) {
  let rows: WatchlistRowView[] = [];
  let loadFailed = false;
  try {
    rows = await getWatchlistView();
  } catch {
    loadFailed = true;
  }
  return (
    <Panel
      title="Companies under review"
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
      ) : <CoverageDesk rows={rows} />}
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
      <div className="dossier-desk">
        <section className="desk-intro">
          <div><div className="desk-eyebrow">Research workspace</div><h1>Coverage desk</h1>
            <p>Review your saved research, follow the evidence, and keep the next question in view.</p></div>
          <Link href="/settings" className="text-[12px] text-accent underline">Research settings</Link>
        </section>

        <Link href="/report/sample" className="self-start border border-accent bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:underline">
          View sample report
        </Link>

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

        <HomeWatchlistPanel fixtureMode={config.fixtureMode} />

        <div className="desk-status">FMP: {config.hasFmpKey ? "configured" : "not configured"} · SEC contact: {hasEdgarContact ? "configured" : "not configured"} · Reports run on: <span className="mono">{routeText}</span>. <Link href="/settings" className="text-accent underline">Configure research</Link></div>

        <details className="connection-details">
          <summary>Connections, keyless sources &amp; model details</summary>
          <div>

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
              detail="optional paid Claude analysis + web search; ChatGPT sign-in is available in Settings"
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
