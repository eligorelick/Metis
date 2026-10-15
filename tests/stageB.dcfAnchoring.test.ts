/**
 * D-58 — the DCF's year-one anchor, convergent fade and terminal tax, on the
 * inputs NVDA report #34 (2026-10-15) disclosed. That report's base case put
 * next-twelve-month revenue at TTM × 1.25 = $378.7B, below the latest quarter
 * × 4 ($96.22B × 4 = $384.9B), faded growth linearly from the clamped 25%, and
 * taxed terminal NOPAT at the 8.93% historical median. A Node replication of
 * the old rules on these inputs reproduces its $143.98 base value
 * (docs/audit/2026-10-15-nvda-report-34-audit.md).
 */
import { describe, expect, it } from "vitest";

import {
  buildDcfAssumptions,
  revenueRunRate,
  type DcfAssumptionInputs,
} from "@/pipeline/stageB/valuation";

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

const yearOneRevenue = (inputs: DcfAssumptionInputs): number => {
  const a = buildDcfAssumptions(inputs).assumptions!;
  return TTM * (1 + a.growthPath.value[0] / 100);
};

describe("year-one revenue anchor (D-58)", () => {
  it("never starts below the run-rate the issuer already reports, and says what anchored it", () => {
    const a = buildDcfAssumptions(nvda()).assumptions!;
    const anchor = a.revenueAnchor!;
    expect(anchor.runRate?.latestQuarterAnnualized).toBeCloseTo(384.88 * B, -7);
    // NVDA is not seasonal enough for the YoY-neutral estimate (397.2B) to
    // exceed what the quarter itself shows: the run-rate is quarter × 4.
    expect(anchor.runRate?.value).toBeCloseTo(384.88 * B, -7);
    expect(anchor.source).toBe("run-rate");
    // The run-rate carried 7.5 months at the clamped 25%: 384.88 × 1.25^0.625.
    expect(yearOneRevenue(nvda())).toBeCloseTo(442.48 * B, -8);
    expect(yearOneRevenue(nvda())).toBeGreaterThan(anchor.runRate!.value);
    expect(a.growthAnchor.pointPct).toBe(25);
    expect(anchor.basis).toMatch(/seasonally neutral run-rate 384\.88B/);
  });

  it("takes guidance, then consensus, and bounds either to [-10%, +25%] of the run-rate", () => {
    const estimates = [{ date: "2027-01-31", revenueAvg: 412 * B }, { date: "2028-01-30", revenueAvg: 692 * B }];
    // Consensus calendarized to the 12 months ending 2027-07-26 (412 × 189/365
    // + 692 × 176/364 days) is 547.9B, +42.4% on the run-rate: the house clamp
    // holds it to 1.25 × 384.88B.
    const consensus = buildDcfAssumptions(nvda({ analystEstimates: estimates })).assumptions!;
    expect(consensus.revenueAnchor).toMatchObject({ source: "consensus", yearTwoGrowthPct: null });
    expect(consensus.revenueAnchor!.clampedFrom).toBeCloseTo(547.93 * B, -8);
    expect(yearOneRevenue(nvda({ analystEstimates: estimates }))).toBeCloseTo(1.25 * 384.88 * B, -8);
    // Q3 FY2027 guidance $108.0B is the company's own next-quarter level and
    // outranks consensus; it sits inside the clamp (432B × 1.25^0.375 = 469.7B).
    const guidance = { revenue: 108 * B, periodEnd: "2026-10-25", asOf: "2026-08-26", source: "8-K EX-99.1", operatingMarginPct: 65.5 };
    const guided = buildDcfAssumptions(nvda({ analystEstimates: estimates, guidance })).assumptions!;
    expect(guided.revenueAnchor).toMatchObject({ source: "guidance", clampedFrom: null });
    expect(yearOneRevenue(nvda({ analystEstimates: estimates, guidance }))).toBeCloseTo(469.69 * B, -8);
    expect(guided.ebitMarginPath.value[0]).toBe(65.5);
    // Guidance for some other quarter is not a next-quarter level.
    expect(buildDcfAssumptions(nvda({ guidance: { ...guidance, periodEnd: "2027-01-31" } })).assumptions!.revenueAnchor!.source).toBe("run-rate");
  });

  it("does not annualize a seasonal peak quarter", () => {
    // A retailer whose holiday quarter is 35% of the year, growing 4%: × 4 would
    // put the run-rate 37% above the TTM; the YoY-neutral estimate does not.
    const ttm = 1000;
    const rr = revenueRunRate(ttm, "2026-01-31", {
      latest: { date: "2026-01-31", revenue: 350 },
      yearAgo: { date: "2025-02-01", revenue: 350 / 1.04 },
    });
    expect(rr!.latestQuarterAnnualized).toBe(1400);
    expect(rr!.value).toBeCloseTo(ttm * Math.pow(1.04, 0.375), 9);
    // Without the same quarter a year earlier there is no run-rate at all.
    expect(revenueRunRate(ttm, "2026-01-31", { latest: { date: "2026-01-31", revenue: 350 }, yearAgo: null })).toBeNull();
  });
});

describe("convergent fade (D-58)", () => {
  it("lets a high year-one anchor decay instead of holding growth above 50% for years", () => {
    const estimates = [{ date: "2027-01-31", revenueAvg: 412 * B }, { date: "2028-01-30", revenueAvg: 692 * B }];
    const g = buildDcfAssumptions(nvda({ analystEstimates: estimates })).assumptions!.growthPath.value;
    // Year one is +58.8%; a linear fade from it would still be +46% in year
    // four. The gap to terminal halves every three years instead.
    expect(g[0]).toBeCloseTo(58.79, 1);
    expect(g.slice(1).every((x) => x < 50)).toBe(true);
    expect(g[3]).toBeCloseTo(26.6, 0);
    for (let i = 1; i < g.length; i++) expect(g[i]).toBeLessThan(g[i - 1]);
    expect(g[9]).toBe(2.5);
  });

  it("anchors year two on consensus when the estimates cover it", () => {
    const estimates = [
      { date: "2027-01-31", revenueAvg: 412 * B },
      { date: "2028-01-30", revenueAvg: 692 * B },
      { date: "2029-01-28", revenueAvg: 850 * B },
    ];
    const a = buildDcfAssumptions(nvda({ analystEstimates: estimates })).assumptions!;
    // 12M to 2028-07-26 (692 × 188/364 + 850 × 178/364) over 12M to 2027-07-26,
    // each 52-week fiscal year starting the day after the one before.
    expect(a.revenueAnchor!.yearTwoGrowthPct).toBeCloseTo(41.09, 2);
    expect(a.growthPath.value[1]).toBe(a.revenueAnchor!.yearTwoGrowthPct);
    expect(a.growthPath.basis).toMatch(/year two 41\.09% on consensus/);
  });
});

describe("terminal tax rate (D-58)", () => {
  it("floors a below-statutory history at max(statutory marginal, 15%) and keeps a higher history", () => {
    const us = buildDcfAssumptions(nvda()).assumptions!.taxRatePath;
    expect(us.value[0]).toBeCloseTo(16.05, 2);
    expect(us.value[9]).toBe(21);
    expect(us.basis).toMatch(/company historical median 8\.9\d% floored at 21%/);
    const elsewhere = buildDcfAssumptions(nvda({ domicileCountry: "IE" })).assumptions!.taxRatePath;
    expect(elsewhere.value[9]).toBe(15);
    expect(elsewhere.basis).toMatch(/no sourced statutory rate for domicile IE/);
    // A company already taxed above the floor keeps its own history.
    const taxed = HISTORY.map((r) => ({ ...r, incomeTaxExpense: (r.incomeBeforeTax as number) * 0.26 }));
    expect(buildDcfAssumptions(nvda({ incomeHistory: taxed })).assumptions!.taxRatePath.value[9]).toBeCloseTo(26, 9);
  });
});
