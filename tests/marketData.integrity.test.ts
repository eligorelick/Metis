import { describe, expect, it } from "vitest";
import { buildMarketData } from "@/pipeline/marketData";
import { currencyBundle } from "./helpers/currencyBundle";

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
