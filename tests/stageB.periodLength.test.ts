import { describe, expect, it } from "vitest";
import { buildDcfAssumptions, revenueRunRate, type DcfAssumptionInputs } from "@/pipeline/stageB/valuation";
import { fiftyTwoWeekFactor, periodDays, thirteenWeekFactor, weeksOf } from "@/pipeline/stageB/fiscalCalendar";
import { interestRunRate } from "@/pipeline/stageB/projections";
import { buildScenarioPaths } from "@/pipeline/stageB/scenarioPaths";
import { runStageB, ttmIncome } from "@/pipeline/compute";
import type { FmpIncomeStatementRow } from "@/providers/fmp";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

// SEC-filed annual history and synthetic assumptions copied from dcfAnchoring's nvda fixture.
const B = 1e9;
const TTM = 302.97 * B;
/** NVDA fiscal years (revenue, operating income, pre-tax income, tax), $B, from the 10-Ks. */
const HISTORY = ([
  ["2017-01-29", 6.91, 1.934, 1.769, 0.239], ["2018-01-28", 9.714, 3.21, 3.196, 0.149],
  ["2019-01-27", 11.716, 3.804, 3.896, -0.245], ["2020-01-26", 10.918, 2.846, 2.97, 0.174],
  ["2021-01-31", 16.675, 4.532, 4.409, 0.077], ["2022-01-30", 26.914, 10.041, 9.941, 0.189],
  ["2023-01-29", 26.974, 4.224, 4.181, -0.187], ["2024-01-28", 60.922, 32.972, 33.818, 4.058],
  ["2025-01-26", 130.497, 81.453, 84.026, 11.146], ["2026-01-25", 215.938, 130.387, 141.45, 21.38],
] as const).map(([date, revenue, ebit, pretax, tax]) => ({
  date, revenue: revenue * B, operatingIncome: ebit * B, incomeBeforeTax: pretax * B, incomeTaxExpense: tax * B,
}));

function nvda(over: Partial<DcfAssumptionInputs> = {}): DcfAssumptionInputs {
  return {
    revenueCagr3yPct: 100.05,
    revenueCagr5yPct: 66.9,
    revenueLogLinear: { growthPct: 44.4, rSquared: 0.92, n: 10, startDate: "2017-01-29", endDate: "2026-01-25" },
    analystEstimates: null,
    waccPct: 13.2544,
    riskFreePct: 5.21,
    incomeTtm: { date: "2026-07-26", basis: "ttm", revenue: TTM, operatingIncome: 0.6521 * TTM, incomeBeforeTax: 100 * B, incomeTaxExpense: 16.0461 * B },
    incomeHistory: HISTORY,
    balance: { date: "2026-07-26", basis: "quarter", totalDebt: 33.366 * B, totalStockholdersEquity: TTM / 1.8 - 33.366 * B + 99.37 * B, cashAndShortTermInvestments: 99.37 * B },
    marketCap: 5.28e12,
    quarterRevenue: { latest: { date: "2026-07-26", revenue: 96.22 * B }, yearAgo: { date: "2025-07-27", revenue: 46.743 * B } },
    domicileCountry: "US",
    ...over,
  };
}

function quarters(): FmpIncomeStatementRow[] {
  return [
    ["2026-09-03", "2026-05-29", 54], ["2026-05-28", "2026-02-27", 40],
    ["2026-02-26", "2025-11-28", 30], ["2025-11-27", "2025-08-29", 20],
    ["2025-08-28", "2025-05-30", 11],
  ].map(([date, start, revenue]) => ({
    date: String(date), revenue: Number(revenue) * B, operatingIncome: Number(revenue) * B * 0.2,
    grossProfit: Number(revenue) * B * 0.4, incomeBeforeTax: Number(revenue) * B * 0.18,
    incomeTaxExpense: Number(revenue) * B * 0.04, netIncome: Number(revenue) * B * 0.14,
    interestExpense: 1.4 * B, reportedCurrency: "USD", weightedAverageShsOutDil: B,
    fieldProvenance: { revenue: { source: "edgar", unit: "USD", periodStart: String(start), periodEnd: String(date),
      observedAt: "2026-10-01T00:00:00.000Z", tags: ["RevenueFromContractWithCustomerExcludingAssessedTax"], filings: [] } },
  }));
}

describe("week counts (FIN-301)", () => {
  it("reads 12-, 14-, 16- and 17-week quarters and leaves calendar quarters alone", () => {
    for (const [days, factor] of [[98, 13 / 14], [84, 13 / 12], [112, 13 / 16], [119, 13 / 17]]) expect(thirteenWeekFactor(days)).toBe(factor);
    for (const d of [89, 90, 91, 92, null]) expect(thirteenWeekFactor(d)).toBe(1);
    for (const d of [85, 87, 93, 96, 97, 99]) { expect(weeksOf(d)).toBeNull(); expect(thirteenWeekFactor(d)).toBe(1); }
    expect(weeksOf(98)).toBe(14);
    expect(fiftyTwoWeekFactor(371)).toBe(52 / 53);
    for (const d of [364, 365, 366, 370, 372, null]) expect(fiftyTwoWeekFactor(d)).toBe(1);
    expect(periodDays("2026-05-29", "2026-09-03")).toBe(98);
  });
  it("rejects impossible dates and nonpositive or nonfinite lengths", () => {
    for (const start of [null, undefined, "2026-02-30", "2026-2-01", "2026-09-04", "2026-05-29T00:00:00Z"]) expect(periodDays(start, "2026-09-03")).toBeNull();
    expect(periodDays("2026-01-01", "2026-02-30")).toBeNull();
    expect(periodDays("2024-02-29", "2024-02-29")).toBe(1);
    for (const d of [0, -7, NaN, Infinity, 98.5]) expect(weeksOf(d)).toBeNull();
  });
  it("annualises a 14-week latest quarter on a 13-week basis (MU FY2026 Q4)", () => {
    const rr = revenueRunRate(133.19e9, "2026-09-03", { latest: { date: "2026-09-03", revenue: 54.229e9, days: 98 }, yearAgo: { date: "2025-08-28", revenue: 11.315e9, days: 91 } })!;
    expect(rr.latestQuarterAnnualized).toBeCloseTo(201.422e9, -6);
    expect(rr.yoyPct).toBeCloseTo(345.03, 2);
    expect(rr.value).toBeCloseTo(201.422e9, -6);
    expect(rr.latestQuarterWeeks).toBe(14);
    expect(rr.lengthNote).toMatch(/14-week quarter ending 2026-09-03 on a 13-week basis \(× 13\/14\)/);
  });
  it("annualises a 12-week quarter to 52 weeks (12-12-12-16 calendar)", () => {
    const rr = revenueRunRate(268.78e9, "2026-05-10", { latest: { date: "2026-05-10", revenue: 63.21e9, days: 84 }, yearAgo: { date: "2025-05-11", revenue: 58.5e9, days: 84 } })!;
    expect(rr.latestQuarterAnnualized).toBeCloseTo(273.91e9, -6);
    expect(rr.value).toBeCloseTo(273.91e9, -6);
    expect(rr.yoyPct).toBeCloseTo(8.0513, 3);
  });
  it("keeps the year-over-year of two 16-week quarters", () => {
    const rr = revenueRunRate(270e9, "2025-08-31", { latest: { date: "2025-08-31", revenue: 86e9, days: 112 }, yearAgo: { date: "2024-09-01", revenue: 80e9, days: 112 } })!;
    expect(rr.yoyPct).toBeCloseTo(7.5, 9);
    expect(rr.latestQuarterAnnualized).toBeCloseTo(279.5e9, -3);
  });
  it("reads a 14-week first quarter from its filed start", () => {
    const rr = revenueRunRate(400e9, "2025-09-27", { latest: { date: "2025-09-27", revenue: 107.7e9, days: 98 }, yearAgo: { date: "2024-09-28", revenue: 92e9, days: 91 } })!;
    expect(rr.yoyPct).toBeCloseTo((107.7 * 13 / 14 / 92 - 1) * 100, 6);
  });
  it("reads an unestablished length as 13 weeks and says so", () => {
    const rr = revenueRunRate(1000, "2026-01-31", { latest: { date: "2026-01-31", revenue: 350 }, yearAgo: { date: "2025-02-01", revenue: 350 / 1.04 } })!;
    expect(rr.latestQuarterAnnualized).toBe(1400);
    expect(rr.lengthNote).toMatch(/length not established; read as 13 weeks/);
    const established = revenueRunRate(1000, "2026-01-31", { latest: { date: "2026-01-31", revenue: 350, days: 97 }, yearAgo: { date: "2025-02-01", revenue: 350 / 1.04, days: 91 } })!;
    expect(established.latestQuarterAnnualized).toBe(1400);
    expect(established.lengthNote).toBeNull();
  });
  it("puts a 53-week TTM on a 52-week basis as the DCF start revenue, margins unchanged", () => {
    const base = nvda();
    const a53 = buildDcfAssumptions({ ...base, incomeTtm: { ...base.incomeTtm!, days: 371 } }).assumptions!;
    const a52 = buildDcfAssumptions({ ...base, incomeTtm: { ...base.incomeTtm!, days: 364 } }).assumptions!;
    expect(a53.startRevenue.value).toBeCloseTo(302.97e9 * 52 / 53, -3);
    expect(a53.startRevenue.basis).toMatch(/53-week .* on a 52-week basis \(× 52\/53\)/);
    expect(a52.startRevenue.value).toBe(302.97e9);
    expect(a53.ebitMarginPath.value[0]).toBeCloseTo(a52.ebitMarginPath.value[0], 9);
    expect(a53.taxRatePath.value).toEqual(a52.taxRatePath.value);
    // Task 29 / owner ruling: capital efficiency stays on the filed revenue.
    expect(a53.salesToCapital).toEqual(a52.salesToCapital);
  });
  it("scales a tagged one-off with the 53-week base and leaves the input unchanged", () => {
    const base = nvda({ unusualOperatingItems: { value: -10e9, components: [{ tag: "AssetImpairmentCharges", value: -10e9 }], withheld: [], basis: "synthetic filed charge" } });
    const before = JSON.stringify(base);
    const a = buildDcfAssumptions({ ...base, incomeTtm: { ...base.incomeTtm!, days: 371 } }).assumptions!;
    const b = buildDcfAssumptions(base).assumptions!;
    expect(a.startRevenue.value).toBeCloseTo(302.97e9 * 52 / 53, -3);
    expect(a.ebitMarginPath.value).toEqual(b.ebitMarginPath.value);
    expect(JSON.stringify(base)).toBe(before);
  });
  it.each([0, -699e6, 699e6])("keeps filed margin ratios and scenario shocks exactly when scaling a 53-week base (one-off %s)", (oneOff) => {
    // KO's four filed quarters ending 2026-04-03 total these flows. Scaling
    // numerator and denominator first changed its capped bull shock by 1e-14pp.
    // Task 29's must-not-move list requires exact preservation, not a tolerance.
    const base = nvda({
      incomeTtm: { date: "2026-04-03", basis: "ttm", revenue: 49_284e6,
        operatingIncome: 14_462e6, grossProfit: 30_430e6,
        incomeBeforeTax: 16_552e6, incomeTaxExpense: 2_784e6 },
      quarterRevenue: null,
      unusualOperatingItems: { value: oneOff, components: [], withheld: [], basis: "synthetic tagged item" },
    });
    const filed = buildDcfAssumptions(base).assumptions!;
    const scaled = buildDcfAssumptions({ ...base, incomeTtm: { ...base.incomeTtm!, days: 371 } }).assumptions!;
    const options = { waccPct: 9, netDebt: 0, dilutedShares: 1e9 };
    const dispersion = { sigmaGrowth: 10.31287524719382, sigmaMargin: 2.879, growthMarginCorrelation: 0.2359325629433722 };
    expect(buildScenarioPaths(scaled, options, dispersion).scenarioAssumptions)
      .toEqual(buildScenarioPaths(filed, options, dispersion).scenarioAssumptions);
    expect(scaled.ebitMarginPath).toEqual(filed.ebitMarginPath);
    expect(scaled.taxRatePath).toEqual(filed.taxRatePath);
    expect(scaled.startRevenue.value).toBe(49_284e6 * (52 / 53));
  });
  it("carries quarter lengths and the TTM window from the filed starts (compute wiring)", () => {
    const bundle = completeCurrencyBundle({ estimates: false });
    bundle.builtAt = "2026-10-01T00:00:00.000Z";
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("fixture missing income");
    bundle.statements.incomeQuarterly.value.data.rows = quarters();
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture missing balance");
    bundle.statements.balanceQuarterly.value.data.rows[0].date = "2026-09-03";
    const computed = runStageB(bundle);
    expect(computed.valuation.kind).toBe("dcf");
    if (computed.valuation.kind !== "dcf") throw new Error("fixture must reach DCF");
    const anchor = computed.valuation.assumptions!.revenueAnchor!;
    expect(anchor.runRate!.latestQuarterWeeks).toBe(14);
    expect(anchor.runRate!.latestQuarterAnnualized).toBeCloseTo(4 * 54e9 * 13 / 14, -3);
    expect(anchor.runRate!.yoyPct).toBeCloseTo((54 * 13 / 14 / 11 - 1) * 100, 6);
    expect(ttmIncome(quarters())).toMatchObject({ periodStart: "2025-08-29", periodStartBasis: "filed", days: 371 });
  });
  it("uses the prior quarter end only when the filed window start is absent", () => {
    const rows = quarters().map(r => ({ ...r, fieldProvenance: undefined }));
    expect(ttmIncome(rows)).toMatchObject({ periodStart: "2025-08-29", periodStartBasis: "prior-quarter-end", days: 371 });
    expect(ttmIncome(rows.slice(0, 4))).toMatchObject({ periodStart: null, periodStartBasis: null, days: null });
  });
  it("leaves the oldest quarter's inferred start unknown across a missing-quarter gap", () => {
    const rows = quarters().map(r => ({ ...r, fieldProvenance: undefined }));
    rows[4].date = "2025-05-29"; // August is absent; May does not start the November quarter.
    const trailing = ttmIncome(rows);
    expect(trailing).not.toBeNull(); // The latest four quarters themselves are contiguous.
    expect(trailing).toMatchObject({ periodStart: null, periodStartBasis: null, days: null });
    expect(trailing!.revenue).toBe(144 * B);
  });
  it.each([false, true])("keeps flat year-ago revenue flat with adjacent predecessor present=%s", (adjacent) => {
    const bundle = completeCurrencyBundle({ estimates: false });
    bundle.builtAt = "2026-10-01T00:00:00.000Z";
    if (!bundle.statements.incomeQuarterly.ok || !bundle.statements.balanceQuarterly.ok) throw new Error("fixture");
    const dates = ["2026-07-26", "2026-04-26", "2026-01-25", "2025-10-26", "2025-07-27",
      ...(adjacent ? ["2025-04-27"] : []), "2025-01-26"];
    bundle.statements.incomeQuarterly.value.data.rows = dates.map(date => ({
      ...quarters()[0], date, revenue: 100 * B, operatingIncome: 20 * B,
      grossProfit: 40 * B, incomeBeforeTax: 18 * B, incomeTaxExpense: 4 * B,
      netIncome: 14 * B, fieldProvenance: undefined,
    }));
    bundle.statements.balanceQuarterly.value.data.rows[0].date = dates[0];
    expect(ttmIncome(bundle.statements.incomeQuarterly.value.data.rows)).toMatchObject({ days: 364, revenue: 400 * B });
    const c = runStageB(bundle);
    expect(c.valuation.kind).toBe("dcf");
    if (c.valuation.kind !== "dcf") throw new Error("fixture must reach DCF");
    const rr = c.valuation.assumptions!.revenueAnchor!.runRate!;
    expect(rr).not.toBeNull();
    expect(rr.latestQuarterAnnualized).toBe(400 * B);
    expect(rr.yoyPct).toBe(0); // A January-to-July gap is not a 26-week July quarter.
    expect(rr.lengthNote).toBe(adjacent ? null : "the quarter ending 2025-07-27: length not established; read as 13 weeks");
  });
  it("retains the separate 53-week annual fallback from successive annual ends", () => {
    const bundle = completeCurrencyBundle({ estimates: false });
    bundle.builtAt = "2026-10-01T00:00:00.000Z";
    if (!bundle.statements.incomeAnnual.ok || !bundle.statements.incomeQuarterly.ok) throw new Error("fixture");
    bundle.statements.incomeQuarterly.value.data.rows = [];
    const rows = bundle.statements.incomeAnnual.value.data.rows;
    rows[0] = { ...rows[0], date: "2026-01-31", revenue: 530e6, fieldProvenance: undefined };
    rows[1] = { ...rows[1], date: "2025-01-25", fieldProvenance: undefined };
    const c = runStageB(bundle);
    expect(c.valuation.kind).toBe("dcf");
    if (c.valuation.kind !== "dcf") throw new Error("fixture must reach DCF");
    expect(c.valuation.assumptions!.startRevenue.value).toBe(520e6);
    expect(c.valuation.assumptions!.startRevenue.basis).toMatch(/53-week .*52-week/);
  });
  it("annualises a 14-week quarter's interest on a 13-week basis (interestRunRate)", () => {
    expect(interestRunRate({ date: "2026-09-03", interestExpense: 1.4e9, days: 98 }, null, null)!.value).toBeCloseTo(5.2e9, 0);
    const withDebt = interestRunRate({ date: "2026-09-03", interestExpense: 1.4e9, days: 98 }, { date: "2026-09-03", debt: 40e9 }, { date: "2026-05-28", debt: 30e9 })!;
    expect(withDebt.value).toBeCloseTo(5.942857142857143e9, 0);
    expect(withDebt.basis).toMatch(/14-week quarter ending 2026-09-03 on a 13-week basis \(× 13\/14\)/);
    expect(interestRunRate({ date: "2026-06-30", interestExpense: 1e9, days: 91 }, null, null)!.value).toBe(4e9);
    expect(interestRunRate({ date: "2026-06-30", interestExpense: 1e9 }, null, null)!.value).toBe(4e9);
  });
});
