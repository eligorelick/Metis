import { describe, expect, it } from "vitest";
import { computeCapital, type CapitalCashFlowRow, type CapitalIncomeRow } from "@/pipeline/stageB/capital";
import { EOD_YEARS } from "@/pipeline/dataBundle";

const DAY = 86_400_000;
function partialWindow() {
  const now = Date.parse("2026-10-27T15:00:00Z");
  const from = new Date(now - Math.round(EOD_YEARS * 365.25) * DAY).toISOString().slice(0, 10);
  const years = [2025, 2024, 2023, 2022, 2021].map(y => `${y}-12-31`);
  const income: CapitalIncomeRow[] = years.map(date => ({ date, revenue: 200, netIncome: 100, weightedAverageShsOut: 100, weightedAverageShsOutDil: 100 }));
  const cash: CapitalCashFlowRow[] = years.map(date => ({ date, netIncome: 100, operatingCashFlow: 110, capitalExpenditure: -30, commonStockRepurchased: date === "2021-12-31" ? -150 : -200 }));
  const caps: { date: string; marketCap: number }[] = [];
  for (let t = Date.parse(from); t < now; t += DAY) {
    if ([0, 6].includes(new Date(t).getUTCDay())) continue;
    const start = Date.parse("2021-01-01"), end = Date.parse("2021-12-31");
    const price = t >= end ? 20 : 10 + 10 * (t - start) / (end - start);
    caps.push({ date: new Date(t).toISOString().slice(0, 10), marketCap: price * 100 });
  }
  const executions = years.map(periodEnd => ({ periodEnd, shares: 10, value: periodEnd === "2021-12-31" ? 150 : 200,
    sharesTag: "StockRepurchasedDuringPeriodShares", valueTag: "StockRepurchasedDuringPeriodValue" }));
  return { from, result: computeCapital(income, cash, [], caps, { price: 20 }, { reportedCurrency: "USD", quoteCurrency: "USD", repurchaseExecutions: executions }) };
}
function startAt(date: string, quoteCurrency = "USD", isAdr = false) {
  return computeCapital(
    [{ date: "2023-12-31", weightedAverageShsOut: 100, weightedAverageShsOutDil: 100 }],
    [{ date: "2023-12-31", commonStockRepurchased: -200 }, { date: "2022-12-31", commonStockRepurchased: 0 }], [],
    [{ date, marketCap: 2000 }, { date: "2023-06-30", marketCap: 2000 }, { date: "2023-12-29", marketCap: 2000 }],
    { price: 20 }, { reportedCurrency: "USD", quoteCurrency, isAdr,
      repurchaseExecutions: [{ periodEnd: "2023-12-31", shares: 10, value: 200, sharesTag: "test-shares", valueTag: "test-cost" }] },
  );
}

describe("FIN-117: a fiscal buyback average needs its full history window", () => {
  it("leaves the oldest partial year unpriced and measures zero timing at 84.2% coverage", () => {
    const { from, result: r } = partialWindow();
    expect(from).toBe("2021-10-27");
    const first = r.buybackPriceAnalysis.years.find(y => y.date === "2021-12-31")!;
    expect(first.avgPriceProxy).toBeNull();
    expect(first.avgMarketCap).toBeNull();
    expect(first.note).toMatch(/market-cap history starts 2021-10-27, inside the fiscal window/);
    expect(r.buybackPriceAnalysis.timingPct).toBeCloseTo(0, 10);
    expect(r.buybackPriceAnalysis.timingCoveragePct).toBeCloseTo(800 / 950 * 100, 10);
    expect(r.notes.join(" ")).toMatch(/no year-average price for 2021-12-31/);
  });
  it("control: subsequent fully covered years keep the same average price", () => {
    for (const year of partialWindow().result.buybackPriceAnalysis.years.filter(y => y.date !== "2021-12-31")) {
      expect(year.avgPriceProxy).toBe(20);
      expect(year.avgMarketCap).toBe(2000);
      expect(year.paidVsYearAveragePct).toBe(0);
    }
  });
  it("admits the first trading day after a holiday-straddled year end", () => {
    expect(startAt("2023-01-03").buybackPriceAnalysis.years[0]!.avgPriceProxy).toBe(20);
  });
  it("admits exactly seven days after the opening boundary", () => {
    expect(startAt("2023-01-07").buybackPriceAnalysis.years[0]!.avgPriceProxy).toBe(20);
  });
  it("refuses eight days after the opening boundary and names the omitted year", () => {
    const r = startAt("2023-01-08");
    expect(r.buybackPriceAnalysis.years[0]!.avgPriceProxy).toBeNull();
    expect(r.buybackPriceAnalysis.timingPct).toBeNull();
    expect(r.notes.join(" ")).toMatch(/no year-average price for 2023-12-31/);
  });
  it.each([["CAD", false], ["USD", true]] as const)("keeps currency/ADR refusal ahead of a partial window (%s, %s)", (currency, adr) => {
    const row = startAt("2023-06-01", currency, adr).buybackPriceAnalysis.years[0]!;
    expect(row.avgPriceProxy).toBeNull();
    expect(row.note).toMatch(/^price proxy suppressed:/);
  });
});
