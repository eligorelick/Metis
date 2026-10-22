import { describe, expect, it } from "vitest";
import { buildMarketData } from "@/pipeline/marketData";
import { currencyBundle } from "./helpers/currencyBundle";
import { MarketDataSchema, type Report } from "@/report/schema";
import { consensusTables } from "@/report/presentation";

function marketData(counts: Record<string, unknown>) {
  const bundle = currencyBundle();
  bundle.gradesConsensus = { ok: true, value: { source: "fmp", endpoint: "grades-consensus", asOf: "2026-07-01", fetchedAt: bundle.builtAt, data: { rows: [counts], raw: {} } } };
  return buildMarketData(bundle);
}

describe("analyst grade count completeness", () => {
  const complete = { strongBuy: 8, buy: 5, hold: 2, sell: 0, strongSell: 0 };
  it("retains explicitly reported zero buckets and the complete distribution", () => {
    expect(marketData(complete)?.gradeCounts).toMatchObject({ strongPositive: 8, positive: 5, neutral: 2, negative: 0, strongNegative: 0 });
  });
  it("retains an explicitly reported empty distribution", () => {
    expect(marketData({ strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 })?.gradeCounts).toMatchObject({ strongPositive: 0, positive: 0, neutral: 0, negative: 0, strongNegative: 0 });
  });
  it.each(Object.keys(complete))("withholds a distribution missing %s instead of inventing a zero", (key) => {
    const counts: Record<string, unknown> = { ...complete };
    delete counts[key];
    expect(marketData(counts)?.gradeCounts).toBeNull();
  });
  it.each([null, NaN, Infinity, -1, 1.5])("withholds a distribution containing an invalid count %s", (invalid) => {
    expect(marketData({ ...complete, hold: invalid })?.gradeCounts).toBeNull();
  });
});

describe("float measurement compatibility", () => {
  function fromShares(row: Record<string, unknown>) {
    const bundle = currencyBundle();
    bundle.sharesFloat = { ok: true, value: { source: "edgar", endpoint: "shares-float", asOf: "2026-07-27", fetchedAt: bundle.builtAt, data: { rows: [row], raw: {} } } };
    return MarketDataSchema.parse(buildMarketData(bundle));
  }
  it("retains the historical float date but withholds its cross-date percentage", () => {
    const md = fromShares({ date: "2026-07-27", outstandingShares: 1.05e9, floatShares: 1.099397582e9, freeFloat: 104.7045, publicFloatAsOf: "2025-03-28", publicFloatPriceBasis: "measurement date" });
    expect(md.shares).toMatchObject({ outstanding: 1.05e9, float: 1.099397582e9, freeFloatPct: null, asOf: "2026-07-27", floatAsOf: "2025-03-28" });
  });
  it("withholds an impossible provider percentage", () => {
    expect(fromShares({ date: "2026-07-27", outstandingShares: 100, floatShares: 110, freeFloat: 110 }).shares?.freeFloatPct).toBeNull();
  });
  it("withholds a bounded percentage when the known measurement dates differ", () => {
    expect(fromShares({ date: "2026-07-27", outstandingShares: 100, floatShares: 90, freeFloat: 90, publicFloatAsOf: "2025-03-28" }).shares?.freeFloatPct).toBeNull();
  });
  it("retains a bounded same-date provider percentage", () => {
    expect(fromShares({ date: "2026-07-27", outstandingShares: 100, floatShares: 90, freeFloat: 90 }).shares).toMatchObject({ outstanding: 100, float: 90, freeFloatPct: 90, floatAsOf: "2026-07-27" });
  });
  it("does not date a latest-quote float conversion as a historical measurement", () => {
    expect(fromShares({ date: "2026-07-27", outstandingShares: 100, floatShares: 90, freeFloat: 90, publicFloatAsOf: "2025-03-28", publicFloatPriceBasis: "latest quote" }).shares).toMatchObject({ freeFloatPct: null, floatAsOf: null });
  });
  it("labels the historical float date and does not use it for current short-interest percentage", () => {
    const md = fromShares({ date: "2026-07-27", outstandingShares: 1.05e9, floatShares: 1.099397582e9, freeFloat: 104.7045, publicFloatAsOf: "2025-03-28", publicFloatPriceBasis: "measurement date" });
    md.shortInterest = { shares: 1e7, daysToCover: 2, averageDailyVolume: 5e6, settlementDate: "2026-07-15", changePct: null };
    const tables = consensusTables({ marketData: md } as Report);
    const text = JSON.stringify(tables);
    expect(text).toContain("2025-03-28");
    expect(text).not.toContain("of float");
    expect(text).not.toContain("104.7");
  });
});

// Audit 2026-10-22 B-19: Yahoo's chart has no market cap, so a cap on a Yahoo
// quote is the keyless price × filed share count.
describe("quoted market cap origin", () => {
  function withQuote(source: string) {
    const bundle = currencyBundle();
    bundle.quote = { ok: true, value: { source, endpoint: "quote", asOf: "2026-07-01", fetchedAt: bundle.builtAt, data: { rows: [{ symbol: "TEST", price: 10, marketCap: 1e9 }], raw: {} } } } as typeof bundle.quote;
    return MarketDataSchema.parse(buildMarketData(bundle)).quote;
  }
  it("marks a Yahoo quote's market cap as computed and a vendor's as provided", () => {
    expect(withQuote("yahoo")?.marketCapOrigin).toBe("computed");
    expect(withQuote("fmp")?.marketCapOrigin).toBe("provider");
  });
});
