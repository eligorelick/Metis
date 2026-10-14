import { describe, expect, it } from "vitest";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { createEdgarClient, type EdgarTransport } from "@/providers/edgar";
import { createFmpClient } from "@/providers/fmp";
import { makeLimiter } from "@/providers/http";

describe("bundle authoritative source wiring", () => {
  it.each(["sec", "ir"] as const)("uses authoritative %s event and enriches existing vendor rows when paid press feed is unavailable", async (route) => {
    const now = () => new Date("2026-10-13T12:00:00.000Z");
    const fmpFetch = (async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
      const endpoint = url.pathname.replace(/^.*\/stable\//, "");
      if (endpoint === "news/press-releases") return new Response("subscription required", { status: 402 });
      const rows = endpoint === "profile" ? [{ symbol: "EXM", companyName: "Example", cik: "1", website: "https://example.com" }]
        : endpoint === "earnings" ? [{ date: "2026-10-29", epsActual: null }]
        : endpoint === "balance-sheet-statement" ? [{ date: "2026-06-30", reportedCurrency: "USD", totalAssets: 500 }]
        : [];
      return new Response(JSON.stringify(rows), { status: 200 });
    }) as typeof fetch;
    const transport: EdgarTransport = { async fetchText(url) {
      const body = url.includes("company_tickers.json") ? JSON.stringify({ "0": { cik_str: 1, ticker: "EXM", title: "Example" } })
        : url.includes("submissions/") ? JSON.stringify({ cik: "0000000001", name: "Example", tickers: ["EXM"], exchanges: ["NYSE"], filings: { files: [], recent: route === "sec" ? { accessionNumber: ["0000000001-26-000003"], filingDate: ["2026-09-24"], reportDate: ["2026-09-24"], form: ["8-K"], primaryDocument: ["event.htm"], items: ["8.01"] } : { accessionNumber: [], filingDate: [], reportDate: [], form: [], primaryDocument: [] } } })
        : url.includes("companyfacts/") ? JSON.stringify({ cik: 1, entityName: "Example", facts: { "us-gaap": { OperatingLeaseLiability: { units: { USD: [{ end: "2026-06-30", val: 30, accn: "0000000001-26-000002", filed: "2026-07-30", form: "10-Q" }] } } } } })
        : "<html><body>Example announced it will release third quarter 2026 financial results on October 28, 2026 after market close.</body></html>";
      return { status: 200, body, fetchedAt: now().toISOString(), fromCache: false, stale: false };
    } };
    const unavailable = async () => new Response("unavailable", { status: 404 });
    const bundle = await buildDataBundle("EXM", { now, keyless: false,
      fmp: createFmpClient({ apiKey: "test", fetchImpl: fmpFetch, limiter: makeLimiter(10000, 10000), now }),
      edgar: createEdgarClient({ transport, maxRps: 10000 }),
      fred: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
      finnhub: { fetchImpl: unavailable, retryDelaysMs: [] },
      finra: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
      companyIr: { now, lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: (async (url) => new Response(String(url) === "https://example.com/" ? '<a href="https://investors.example.com/announcement">Investor Relations</a>' : '<html><head><meta property="article:published_time" content="2026-09-24"></head><body>Example will release third quarter 2026 financial results on October 28, 2026.</body></html>', { headers: { "content-type": "text/html" } })) as typeof fetch },
    });
    expect(bundle.earningsCalendarNext).toMatchObject({ ok: true, value: { source: route === "sec" ? "edgar" : "computed", data: { date: "2026-10-28", confirmation: "company_confirmed" } } });
    expect(bundle.statements.balanceQuarterly.ok && bundle.statements.balanceQuarterly.value.data.rows[0]).toMatchObject({ totalAssets: 500, operatingLeaseLiability: 30 });
  });
});
