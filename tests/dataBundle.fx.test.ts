import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { createFmpClient } from "@/providers/fmp";
import { createEdgarClient } from "@/providers/edgar";
import { makeLimiter } from "@/providers/http";
import { foreignBundle } from "./helpers/foreignBundle";
import { resolveForeignValuation } from "@/pipeline/foreignCurrency";
import { runStageB } from "@/pipeline/compute";
import type { FmpClient } from "@/providers/fmp";
import type { EdgarClient } from "@/providers/edgar";
import type { YahooClient } from "@/providers/yahoo";

it.each([
  { currency: "CAD", ratio: 1, isAdr: false, series: "DEXCAUS", rate: 1.4 },
  { currency: "GBP", ratio: 4, isAdr: true, series: "DEXUSUK", rate: 1.3 },
])("fresh offline acquisition and frozen replay agree on the $currency bank basis", async ({ currency, ratio, isAdr, series, rate }) => {
  const seed = foreignBundle(currency, ratio);
  if (!seed.profile.ok || !seed.valuationFx?.ok) throw Error("fixture");
  Object.assign(seed.profile.value.data.rows[0]!, { sector: "Financial Services", industry: "Banks - Diversified", isAdr });
  seed.valuationFx.value.endpoint = `fredgraph.csv?id=${series}`;
  seed.valuationFx.value.data[0]!.value = rate;
  const absent = { ok: false as const, gap: { field: "offline", reason: "offline fixture unavailable", severity: "warn" as const } };
  const fmp = new Proxy({}, { get: (_target, name) => {
    if (name === "fixtureMode") return true;
    if (name === "retryRateLimited") return (call: () => unknown) => call();
    return async (_symbol?: string, period?: string) => {
      if (name === "incomeStatement") return structuredClone(period === "annual" ? seed.statements.incomeAnnual : seed.statements.incomeQuarterly);
      if (name === "balanceSheet") return structuredClone(period === "annual" ? seed.statements.balanceAnnual : seed.statements.balanceQuarterly);
      if (name === "cashFlow") return structuredClone(period === "annual" ? seed.statements.cashflowAnnual : seed.statements.cashflowQuarterly);
      const values: Record<string, unknown> = { profile: seed.profile, quote: seed.quote, sharesFloat: seed.sharesFloat,
        treasuryRates: seed.treasury, marketRiskPremium: seed.marketRiskPremium,
        historicalPriceEodFull: seed.eodPrices };
      return structuredClone(values[String(name)] ?? absent);
    };
  } }) as FmpClient;
  const edgar = new Proxy({}, { get: (_target, name) => async () => structuredClone(
    name === "tickerToCik" ? seed.edgar.cik : name === "companyFacts" ? seed.edgar.companyFacts : absent) }) as EdgarClient;
  const yahoo = new Proxy({}, { get: () => async () => absent }) as YahooClient;
  const unavailable = async () => new Response("offline", { status: 404 });
  const fresh = await buildDataBundle(seed.symbol, { fmp, edgar, yahoo, keyless: false, companyIr: false, filingDisclosures: false,
    now: () => new Date(seed.builtAt),
    fredFetch: async id => id === series ? structuredClone(seed.valuationFx!) : seed.macro.core[id] ?? absent,
    finra: { fetchImpl: unavailable, minRequestIntervalMs: 0, retryDelaysMs: [] },
    finnhub: { fetchImpl: unavailable, retryDelaysMs: [] },
  });
  const expected = resolveForeignValuation(seed, currency), acquired = resolveForeignValuation(fresh, currency);
  expect(acquired.basis?.ratio, acquired.reason ?? "").toBe(expected.basis?.ratio);
  expect(acquired.basis?.fx).toEqual(expected.basis?.fx);
  const c = runStageB(fresh), replay = runStageB(JSON.parse(JSON.stringify(fresh)));
  expect(c.valuation.kind).toBe("excess-return");
  expect(c.valuation.gaps.some(g => g.field === "valuation.excessReturn.currency")).toBe(false);
  expect(c.returns.wacc.waccPct).toBeNull();
  expect(c.returns.wacc.costOfEquityPct).not.toBeNull();
  expect(replay.fairValue).toEqual(c.fairValue);
  expect(replay.scenarioTargets).toEqual(c.scenarioTargets);
  expect(replay.scores.composite).toEqual(c.scores.composite);
});

it("retains dated FRED FX observations in Stage A and the source manifest", async () => {
  const now = () => new Date("2026-11-03T01:00:00Z");
  const unavailable = async () => new Response("unavailable", { status: 404 });
  const bundle = await buildDataBundle("FXTEST", { now, keyless: false, companyIr: false,
    fmp: createFmpClient({ apiKey: "test", now, limiter: makeLimiter(10000, 10000), fetchImpl: async input => {
      const url = new URL(String(input));
      const endpoint = url.pathname.replace(/^.*\/stable\//, "");
      return new Response(JSON.stringify(endpoint === "profile" ? [{ symbol: "FXTEST", currency: "USD", isAdr: true }]
        : endpoint === "quote" ? [{ symbol: "FXTEST", price: 100, timestamp: Date.parse("2026-11-02T21:00:00Z") / 1000 }]
          : endpoint === "income-statement" ? [{ date: "2025-12-31", reportedCurrency: "TWD", revenue: 100 }] : []));
    } }),
    edgar: createEdgarClient({ transport: { fetchText: async () => ({ status: 404, body: "missing", fetchedAt: now().toISOString(), fromCache: false, stale: false }) }, maxRps: 10000 }),
    fred: { fetchImpl: async input => String(input).includes("id=DEXTAUS") ? new Response(readFileSync("fixtures/fx/DEXTAUS.csv", "utf8")) : unavailable(), minRequestIntervalMs: 0, retryDelaysMs: [] },
    finra: { fetchImpl: unavailable, minRequestIntervalMs: 0, retryDelaysMs: [] },
    finnhub: { fetchImpl: unavailable, retryDelaysMs: [] },
  });
  expect(bundle.valuationFx, JSON.stringify({ fx: bundle.valuationFx, quote: bundle.quote, income: bundle.statements.incomeAnnual })).toMatchObject({ ok: true });
  expect(bundle.sourceManifest.valuationFx).toMatchObject({ provider: "fred", asOf: "2026-10-30" });
});
