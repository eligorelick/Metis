import { describe, expect, it } from "vitest";
import { describeScoreEvidence } from "@/pipeline/stageB/scoringEvidence";
import { computeScores, type ScoringInputs } from "@/pipeline/stageB/grading";
import { runStageB } from "@/pipeline/compute";
import { metricPolicy } from "@/pipeline/stageB/sectorRouting";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function inputs(bank = false): ScoringInputs {
  const c = runStageB(completeCurrencyBundle({ bank }), { evIncludeLeases: false });
  return { route: c.route, policy: metricPolicy(c.route), growth: c.growth, ...c.returns, capital: c.capital,
    forensics: c.forensics, technicals: c.technicals, valuation: c.valuation, financialMetrics: c.financialMetrics,
    currentPrice: 100, asOf: "2026-10-14" };
}
const operand = (result: ReturnType<typeof describeScoreEvidence>, name: string) => result.operands.find(o => o.name === name)!;

describe("score evidence follows the actual metric basis", () => {
  it.each(["2025-02-29", "provider USD date", "2026-06-30T00:00:00Z"])("keeps an invalid cap date unknown without borrowing a quote date: %s", date => {
    const i = inputs();
    i.forensics.altman!.variant = "original";
    i.forensics.altman!.score = 5;
    i.forensics.altman!.asOf = { balanceSheet: "2025-12-31", incomeStatement: "2025-12-31", marketCap: date };
    i.quoteAsOf = "2026-07-02";
    const evidence = describeScoreEvidence(i, "quality", "altmanZOriginalScale");
    expect(evidence.period).toBe("Balance 2025-12-31; income 2025-12-31; market-cap observation date unavailable");
    expect(evidence.asOf).toBe("2025-12-31");
    expect(evidence.operands).toEqual([{ name: "original variant Z score before grade-scale mapping", value: 5, source: "computed.forensics.altman.score", asOf: "2025-12-31" }]);
  });
  it("names the figure a P/E own-history rank ranks", () => {
    const i = inputs();
    if (i.valuation.kind !== "dcf") throw new Error("general fixture");
    i.valuation.multiples.multiples = [{ key:"peTtm",current:26,basis:"price / epsDiluted (TTM)",peers:null,
      ownHistory:{percentileRank:50,observations:20,basis:"test",p5:null,p25:null,p50:25,p75:null,p95:null,
        rankedCurrent:{value:25,construction:"capitalization-common-income"}} }];
    const result = describeScoreEvidence(i,"valuation","peOwnHistoryRank");
    expect(result.fallbackReason).toMatch(/ranked as market cap \/ common income 25x, the construction of its history; the P\/E shown is price \/ diluted EPS/);
    expect(operand(result,"peTtm current multiple").value).toBe(26);
  });
  it("labels the share trend's weighted-average denominator and limits the stewardship interpretation", () => {
    const i = inputs();
    const result = describeScoreEvidence(i, "leadership", "shareCountTrend");
    expect(result.period).toMatch(/annualized weighted-average diluted common-share trend/i);
    expect(result.fallbackReason).toMatch(/does not measure.*outstanding.*economic dilution/i);
    const scores = computeScores(i);
    expect(scores.aspects.leadership.note).toMatch(/annualized weighted-average diluted common-share trend/i);
    expect(scores.aspects.leadership.note).not.toMatch(/net share-count change after buybacks/i);
  });
  it("does not raise the stewardship score when a report names a CFO", () => {
    const i = inputs();
    const before = computeScores(i);
    const named = Object.assign(structuredClone(i), { executives: [{ name: "Named Officer", title: "CFO" }] });
    const after = computeScores(named);
    expect(after.aspects.leadership).toEqual(before.aspects.leadership);
    expect(after.composite).toEqual(before.composite);
  });
  it("uses the acquired quote observation for price-derived score evidence", () => {
    const bundle=completeCurrencyBundle({});
    const result=runStageB(bundle,{evIncludeLeases:false});
    if (!bundle.quote.ok) throw new Error("quote fixture");
    const quoteAsOf=bundle.quote.value.asOf;
    expect(result.scores.aspects.valuation.drivers.length).toBeGreaterThan(0);
    expect(result.scores.aspects.valuation.drivers.every(driver=>driver.asOf===quoteAsOf)).toBe(true);
  });
  it("describes the financial equity return and equity hurdle, never industrial ROIC/WACC", () => {
    const i = inputs(true);
    if (i.valuation.kind !== "excess-return") throw new Error("bank fixture");
    i.valuation.excessReturn.roePathPct.value[0] = 18;
    i.valuation.excessReturn.costOfEquityPct.value = 9;
    i.valuation.excessReturn.asOf = "2026-03-31";
    i.roic.asOf = "2020-12-31";
    const result = describeScoreEvidence(i, "quality", "equityReturnVsCoeSpread");
    expect(result.family).toBe("capital-returns");
    expect(result.endDate).toBe("2026-03-31");
    expect(operand(result, "current ROTE").value).toBe(18);
    expect(operand(result, "cost of equity").value).toBe(9);
  });
  it("does not replace missing current leverage operands with favorable annual values", () => {
    const i = inputs();
    i.capital.current!.netDebt = null; i.capital.current!.ebitda = null;
    i.capital.netDebtToEbitda.netDebt = 100; i.capital.netDebtToEbitda.ebitda = 999;
    const result = describeScoreEvidence(i, "balanceSheet", "netDebtToEbitda");
    expect(operand(result, "net debt").value).toBeNull();
    expect(operand(result, "EBITDA").value).toBeNull();
  });
  it("separates a latest margin level from a multiyear operating-margin trend", () => {
    const i = inputs();
    i.growth.margins.gross.series = [{ date: "2021-12-31", pct: 10 }, { date: "2025-12-31", pct: 30 }, { date: "2026-03-31", pct: null }];
    i.growth.margins.operating.series = [{ date: "2020-12-31", pct: 10 }, { date: "2022-12-31", pct: 20 }, { date: "2025-12-31", pct: 30 }];
    const level = describeScoreEvidence(i, "moat", "grossMarginLevel");
    expect(level.startDate).toBeNull(); expect(level.endDate).toBe("2025-12-31");
    const trend = describeScoreEvidence(i, "fundamentals", "operatingMarginSlope");
    expect(trend.startDate).toBe("2020-12-31"); expect(trend.endDate).toBe("2025-12-31");
    expect(trend.windowYears).toBeCloseTo(5, 2);
  });
  it("uses each bank metric's own observation date rather than current industrial capital flows", () => {
    const i = inputs(true);
    i.financialMetrics!.metrics = [{ key: "ncoToAverageLoans", label: "net charge-offs / average loans", value: .5, unit: "%", basis: "annual credit losses", sources: ["edgar:companyfacts"], asOf: "2025-12-31", withheldReason: null, proxy: false }];
    i.capital.asOf = "2026-03-31";
    const result = describeScoreEvidence(i, "balanceSheet", "ncoToAverageLoans");
    expect(result.endDate).toBe("2025-12-31");
    expect(result.startDate).toBeNull();
    expect(result.operands[0].value).toBe(.5);
  });
  it("does not stamp an own-history rank with the analysis date or infer a five-year window from N", () => {
    const i = inputs();
    if (i.valuation.kind !== "dcf") throw new Error("general fixture");
    i.valuation.multiples.asOf.quote = "2026-07-01";
    i.valuation.multiples.multiples = [{ key: "evToEbitda", current: 20, basis: "test", peers: null,
      ownHistory: { percentileRank: 40, observations: 12, basis: "dated samples unavailable", p5: null, p25: null, p50: null, p75: null, p95: null } }];
    const result = describeScoreEvidence(i, "valuation", "peOwnHistoryRank");
    expect(result.asOf).toBe("2026-07-01");
    expect(result.startDate).toBeNull(); expect(result.endDate).toBeNull();
    expect(result.windowYears).toBeNull();
    expect(operand(result, "evToEbitda current multiple").value).toBe(20);
    expect(result.fallbackReason).toMatch(/dates.*unavailable|unavailable.*dates/i);
  });
  it("uses the years with a tagged repurchase price rather than the share-count trend window (D-61 timing)", () => {
    const i = inputs();
    i.capital.shareCount.startDate = "2015-12-31"; i.capital.shareCount.endDate = "2025-12-31";
    i.capital.buybackPriceAnalysis.years = [
      { date: "2021-12-31", repurchased: 100, avgMarketCap: null, avgPriceProxy: null, sharesProxy: null },
      { date: "2023-12-31", repurchased: 100, avgMarketCap: 1000, avgPriceProxy: 10, sharesProxy: 10, actualPricePaid: 9.5 },
      { date: "2025-12-31", repurchased: 120, avgMarketCap: 1200, avgPriceProxy: 12, sharesProxy: 10, actualPricePaid: 12.4 },
    ];
    const result = describeScoreEvidence(i, "leadership", "buybackTiming");
    expect(result.startDate).toBe("2023-12-31"); expect(result.endDate).toBe("2025-12-31");
    expect(result.windowYears).toBeCloseTo(2, 2);
    expect(operand(result, "price paid, year ending 2023-12-31").value).toBe(9.5);
    expect(operand(result, "average price, year ending 2025-12-31").value).toBe(12);
  });
  it("rejects rollover-invalid dates while preserving grade numeric values", () => {
    const i = inputs();
    i.capital.current!.asOf = "2026-02-30";
    const result = describeScoreEvidence(i, "balanceSheet", "sbcPctOfFcf");
    expect(result.asOf).toBeNull();
    const before = computeScores(inputs());
    const afterInputs = inputs(); afterInputs.asOf = "2030-01-01";
    const after = computeScores(afterInputs);
    expect(after.composite.score).toBe(before.composite.score);
    for (const key of Object.keys(before.aspects) as (keyof typeof before.aspects)[]) expect(after.aspects[key].score).toBe(before.aspects[key].score);
  });
  it("traces annual leverage and dated CAGR operands to their actual result fields", () => {
    const i = inputs();
    i.capital.current = undefined;
    const leverage = describeScoreEvidence(i, "balanceSheet", "netDebtToEbitda");
    expect(operand(leverage, "net debt").source).toBe("computed.capital.netDebtToEbitda.netDebt");
    i.growth.revenueCagrs = [{ windowYears: 5, actualYears: 5, cagrPct: 10, startDate: "2020-12-31", endDate: "2025-12-31", startValue: 100, endValue: 161.051 }];
    const growth = describeScoreEvidence(i, "fundamentals", "revenueCagr");
    expect(operand(growth, "start value")).toMatchObject({ source: "computed.growth.revenueCagrs[0].startValue", asOf: "2020-12-31", value: 100 });
    expect(operand(growth, "end value").asOf).toBe("2025-12-31");
  });
  it("does not relabel standardized cash flow as the graded vendor FCF operand", () => {
    const i = inputs();
    i.capital.current!.cashBridge.standardizedFcf = 999;
    i.capital.current!.fcfConversionBeforeSbc = 1.5;
    delete i.capital.current!.fcfBeforeSbc;
    delete i.capital.current!.netIncome;
    for (const id of ["fcfConversionBeforeSbc", "sbcPctOfFcf"]) {
      const result = describeScoreEvidence(i, "balanceSheet", id);
      expect(result.operands.some(o => o.name === "FCF before SBC" && o.value === 999)).toBe(false);
      expect(result.fallbackReason).toMatch(/not retained/);
    }
  });
  it("publishes retained current operands without changing the scored ratios", () => {
    const i = inputs();
    Object.assign(i.capital.current!, { ebit: 180, interestExpense: 18, interestCoverage: 10,
      fcfBeforeSbc: 180, netIncome: 120, fcfConversionBeforeSbc: 1.5 });
    const coverage = describeScoreEvidence(i, "balanceSheet", "interestCoverage");
    expect(operand(coverage, "EBIT").value).toBe(180);
    expect(operand(coverage, "interest expense").value).toBe(18);
    const conversion = describeScoreEvidence(i, "balanceSheet", "fcfConversionBeforeSbc");
    expect(operand(conversion, "FCF before SBC").value).toBe(180);
    expect(operand(conversion, "net income").value).toBe(120);
    expect(operand(conversion, "FCF / net income").value).toBe(1.5);
    expect(conversion.fallbackReason).toBe(i.capital.current!.fallbackReason);
    expect(describeScoreEvidence(i, "balanceSheet", "sbcPctOfFcf").operands.some(o => o.name === "FCF before SBC" && o.value === 180)).toBe(true);
  });
});
