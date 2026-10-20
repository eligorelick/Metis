/**
 * AMZN audit 2026-10-20, finding 2: a burst of FMP HTTP 429s took the analyst
 * consensus and the vendor balance sheet out of the run, and nothing asked
 * again. The valuation-critical members now wait out the pause once, inside a
 * fixed bound; a member still refused is named in one bundle entry that says
 * the valuation is degraded.
 */
import { afterEach, describe, expect, it } from "vitest";

import { buildDataBundle } from "@/pipeline/dataBundle";
import { createEdgarClient, type EdgarTransport, type EdgarTransportResponse } from "@/providers/edgar";
import { createFmpClient, FMP_RATE_LIMIT_WAIT_BUDGET_MS, resetFmpPlanLimits, type FmpClient } from "@/providers/fmp";
import type { FinraConfig } from "@/providers/finra";
import type { FinnhubConfig } from "@/providers/finnhub";
import type { FredConfig } from "@/providers/fred";
import { makeLimiter } from "@/providers/http";

const NOW = new Date("2026-07-06T00:00:00.000Z");
type ConfigFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const CRITICAL = ["analyst-estimates", "income-statement", "balance-sheet-statement", "cash-flow-statement"];

/** FMP answers 429 ("Limit Reach", no Retry-After) until `limitedUntil`, then serves the critical endpoints. */
function rateLimitedFmp(limitedUntilMs: number): { client: FmpClient; slept: number[] } {
  let clock = NOW.getTime();
  const slept: number[] = [];
  const fetchImpl: typeof fetch = (input) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(raw);
    const endpoint = /\/stable\/(.+)$/.exec(url.pathname)?.[1] ?? url.pathname;
    if (clock < limitedUntilMs) {
      return Promise.resolve(jsonResponse({ "Error Message": "Limit Reach . Please upgrade your plan" }, 429));
    }
    if (endpoint === "analyst-estimates") {
      return Promise.resolve(jsonResponse([{ symbol: "EXMP", date: "2026-12-31", revenueAvg: 1_000 }]));
    }
    if (CRITICAL.includes(endpoint)) {
      return Promise.resolve(jsonResponse([{ symbol: "EXMP", date: "2025-12-31", reportedCurrency: "USD", revenue: 900 }]));
    }
    return Promise.resolve(jsonResponse({ "Error Message": "not available in rate-limit test" }, 401));
  };
  return {
    slept,
    client: createFmpClient({
      apiKey: "RATE-LIMIT-BUNDLE-KEY",
      fetchImpl,
      limiter: makeLimiter(1_000_000, 1_000_000),
      now: () => new Date(clock),
      sleep: async (ms) => { slept.push(ms); clock += ms; },
      timeoutMs: 5_000,
    }),
  };
}

function noNetworkEdgar(): EdgarTransport {
  return {
    fetchText(): Promise<EdgarTransportResponse> {
      return Promise.resolve({ status: 404, body: "not available", fetchedAt: NOW.toISOString(), fromCache: false, stale: false });
    },
  };
}

function noNetworkConfigs(): { fred: FredConfig; finnhub: FinnhubConfig; finra: FinraConfig } {
  const text: ConfigFetch = () => Promise.resolve(new Response("not available", { status: 404 }));
  const json: ConfigFetch = () => Promise.resolve(jsonResponse({ error: "not available" }, 404));
  return {
    fred: { fetchImpl: text, retryDelaysMs: [], minRequestIntervalMs: 0 },
    finnhub: { apiKey: "TEST-KEY", fetchImpl: json, retryDelaysMs: [] },
    finra: { fetchImpl: json, retryDelaysMs: [], minRequestIntervalMs: 0 },
  };
}

afterEach(() => resetFmpPlanLimits());

describe("buildDataBundle under an FMP rate limit", () => {
  it("waits out a short pause and recovers the analyst estimates and statements", async () => {
    const { client, slept } = rateLimitedFmp(NOW.getTime() + 30_000);
    const bundle = await buildDataBundle("EXMP", {
      now: () => NOW, eodYears: 0, fmp: client, edgar: createEdgarClient({ transport: noNetworkEdgar() }), ...noNetworkConfigs(),
    });
    expect(bundle.analystEstimates.ok).toBe(true);
    expect(bundle.statements.balanceQuarterly.ok).toBe(true);
    expect(bundle.statements.balanceAnnual.ok).toBe(true);
    expect(Math.max(...slept)).toBeLessThanOrEqual(FMP_RATE_LIMIT_WAIT_BUDGET_MS);
    expect(bundle.gaps.find((g) => g.field === "fmp.rateLimit")).toBeUndefined();
  });

  it("names the members still refused after the bound and marks the valuation degraded", async () => {
    const { client } = rateLimitedFmp(Number.POSITIVE_INFINITY);
    const bundle = await buildDataBundle("EXMP", {
      now: () => NOW, eodYears: 0, fmp: client, edgar: createEdgarClient({ transport: noNetworkEdgar() }), ...noNetworkConfigs(),
    });
    expect(bundle.analystEstimates.ok).toBe(false);
    if (!bundle.analystEstimates.ok) expect(bundle.analystEstimates.gap.reason).toMatch(/still refused after waiting \d+ s \(bound 90 s\)/);
    const entry = bundle.gaps.find((g) => g.field === "fmp.rateLimit");
    expect(entry).toMatchObject({ severity: "warn" });
    expect(entry?.reason).toMatch(/HTTP 429/);
    expect(entry?.reason).toMatch(/analyst estimates/);
    expect(entry?.reason).toMatch(/balance sheet/);
    expect(entry?.reason).toMatch(/valuation is degraded/);
  });
});
