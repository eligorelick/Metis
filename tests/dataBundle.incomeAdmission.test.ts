import { describe, expect, it } from "vitest";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { createFmpClient } from "@/providers/fmp";
import { createEdgarClient } from "@/providers/edgar";
import { makeLimiter } from "@/providers/http";

describe("production income-classification acquisition wiring", () => {
  it("retains raw vendor fields and exposes exact same-scope classification refusals", async () => {
    const now = () => new Date("2026-10-19T00:00:00Z");
    const point = (val: number, instant = false) => ({ val, start: instant ? undefined : "2026-02-28", end: "2026-05-29", form: "10-Q", filed: "2026-06-15", accn: "0000796343-26-000112", fp: "Q2", fy: 2026 });
    const facts = { cik: 796343, entityName: "ADOBE INC.", facts: { "us-gaap": Object.fromEntries(Object.entries({ Assets: 10000, Revenues: 6618, CostOfRevenue: 715, GrossProfit: 5903, OperatingIncomeLoss: 2000 }).map(([tag, val]) => [tag, { units: { USD: [point(val, tag === "Assets")] } }])) } };
    const unavailable = async () => new Response("unavailable", { status: 404 });
    const original = { date: "2026-05-29", periodStart: "2026-02-28", cik: "796343", reportedCurrency: "USD", revenue: 6618, costOfRevenue: 815, grossProfit: 5803, operatingIncome: 2000 };
    const bundle = await buildDataBundle("ADBE", { now, keyless: false, companyIr: false,
      fmp: createFmpClient({ apiKey: "fixture", now, limiter: makeLimiter(10000, 10000), fetchImpl: (async input => {
        const url = new URL(String(input)); const endpoint = url.pathname.replace(/^.*\/stable\//, "");
        const rows = endpoint === "profile" ? [{ symbol: "ADBE", cik: "796343", companyName: "Adobe Inc." }]
          : endpoint === "income-statement" && url.searchParams.get("period") === "quarter" ? [original] : [];
        return new Response(JSON.stringify(rows), { status: 200 });
      }) as typeof fetch }),
      edgar: createEdgarClient({ maxRps: 10000, transport: { async fetchText(url) {
        const body = url.includes("company_tickers.json") ? { "0": { ticker: "ADBE", cik_str: 796343, title: "ADOBE INC." } }
          : url.includes("submissions/") ? { cik: "0000796343", name: "ADOBE INC.", tickers: ["ADBE"], exchanges: ["Nasdaq"], filings: { files: [], recent: { form: [], accessionNumber: [], filingDate: [], reportDate: [], primaryDocument: [] } } } : facts;
        return { status: 200, body: JSON.stringify(body), fetchedAt: now().toISOString(), fromCache: false, stale: false };
      } } }),
      fred: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 }, finnhub: { fetchImpl: unavailable, retryDelaysMs: [] }, finra: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
    });
    expect(bundle.statements.incomeQuarterly).toMatchObject({ ok: true, value: { source: "fmp", data: { rows: [{ grossProfit: null, costOfRevenue: null, operatingIncome: 2000, fieldConflicts: { grossProfit: { usable: false, vendorValue: 5803, secValue: 5903 } } }], raw: [original] } } });
    expect(bundle.gaps.some(gap => gap.field === "statements.income.2026-05-29.grossProfit")).toBe(true);
    expect(original.grossProfit).toBe(5803);
  });
});
