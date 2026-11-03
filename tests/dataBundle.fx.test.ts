import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { createFmpClient } from "@/providers/fmp";
import { createEdgarClient } from "@/providers/edgar";
import { makeLimiter } from "@/providers/http";

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
