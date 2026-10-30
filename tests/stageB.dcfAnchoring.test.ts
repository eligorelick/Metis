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
  calendarizeConsensusWindow,
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
    // 2026-10-29 D-136: the guidance fallback requires the same fiscal quarter a year earlier.
    quarterRevenue: { latest: { date: "2026-07-26", revenue: 96.22 * B }, yearAgo: { date: "2025-07-27", revenue: 46.743 * B }, guidedYearAgo: { date: "2025-10-26", revenue: 57.006 * B } },
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

  // Re-pinned for D-60: consensus levels lead when consistent with guidance, guidance carries at its own pace, and the guard widens to the evidenced pace.
  it("takes consensus levels when consistent with guidance, else guidance at its guided pace, bounded by the evidenced pace", () => {
    const estimates = [{ date: "2027-01-31", revenueAvg: 412 * B }, { date: "2028-01-30", revenueAvg: 692 * B }];
    // Consensus calendarized to the 12 months ending 2027-07-26 (412 × 189/365
    // + 692 × 176/364 days) is 547.9B, +42.4% on the run-rate: inside the
    // guard, which widens to the latest quarter's +105.85% year-over-year growth.
    const consensus = buildDcfAssumptions(nvda({ analystEstimates: estimates })).assumptions!;
    expect(consensus.revenueAnchor).toMatchObject({ source: "consensus", yearTwoGrowthPct: null, clampedFrom: null });
    expect(yearOneRevenue(nvda({ analystEstimates: estimates }))).toBeCloseTo(547.93 * B, -8);
    // D-136: consensus exceeds the 353.96B twelve-month floor, so it sets year one.
    const guidance = { revenue: 108 * B, periodEnd: "2026-10-25", asOf: "2026-08-26", source: "8-K EX-99.1", operatingMarginPct: 65.5 };
    const both = buildDcfAssumptions(nvda({ analystEstimates: estimates, guidance })).assumptions!;
    expect(both.revenueAnchor).toMatchObject({ source: "consensus", clampedFrom: null });
    expect(both.revenueAnchor!.evidence!.guidedRunRate).toBeCloseTo(451.689 * B, -7);
    expect(both.revenueAnchor!.evidence!.consensusYearOne).toEqual(expect.any(Number));
    expect(both.ebitMarginPath.value[0]).toBe(65.5);
    // 2026-10-29 D-136: without eight older quarters, TTM carries at guided YoY.
    const guided = buildDcfAssumptions(nvda({ guidance })).assumptions!;
    expect(guided.revenueAnchor).toMatchObject({ source: "guidance", clampedFrom: null });
    expect(guided.revenueAnchor!.evidence!.guidedPacePct).toBeCloseTo(58.72, 2);
    expect(yearOneRevenue(nvda({ guidance }))).toBeCloseTo(573.988 * B, -8);
    expect(guided.growthAnchor.basis).toMatch(/does not set year one/);
    // A consensus below the twelve-month floor contradicts the outlook.
    const stale = [{ date: "2027-01-31", revenueAvg: 250 * B }, { date: "2028-01-30", revenueAvg: 350 * B }];
    const contradicted = buildDcfAssumptions(nvda({ analystEstimates: stale, guidance })).assumptions!;
    expect(contradicted.revenueAnchor!.source).toBe("guidance");
    expect(contradicted.revenueAnchor!.basis).toMatch(/below the twelve-month floor the guidance implies/);
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
    // Re-pinned for D-60 (consensus no longer clamped to 1.25 × run-rate): year
    // one is +80.9%; a linear fade from it would still be +57% in year four.
    // The gap to terminal decays on a 3-year half-life instead.
    expect(g[0]).toBeCloseTo(80.85, 1);
    expect(g.slice(2).every((x) => x < 50)).toBe(true);
    expect(g[3]).toBeCloseTo(36.1, 0);
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

/**
 * AMZN audit 2026-10-20, finding 2: consensus was missing because FMP's rate
 * limit refused it, yet the record the report cited said only "no usable
 * analyst revenue estimates", at info severity. The record now names the cause
 * and marks the valuation degraded.
 */
describe("analyst estimates refused by a rate limit", () => {
  const refusal = "FMP quota/rate limit (HTTP 429): Limit Reach. Live requests paused until 2026-10-20T06:58:38.292Z. still refused after waiting 60 s (bound 90 s).";

  it("names the rate limit in the analyst-growth record and raises it to a warning", () => {
    const { gaps, notes } = buildDcfAssumptions(nvda({ analystEstimatesRefusal: refusal }));
    const entry = gaps.find((g) => g.field === "valuation.dcf.analystGrowth");
    expect(entry?.severity).toBe("warn");
    expect(entry?.reason).toMatch(/rate limit \(HTTP 429\)/);
    expect(entry?.reason).toMatch(/valuation is degraded/);
    expect(notes.some((n) => /degraded/.test(n) && /HTTP 429/.test(n))).toBe(true);
  });

  it("keeps the informational record when estimates are simply uncovered", () => {
    const entry = buildDcfAssumptions(nvda()).gaps.find((g) => g.field === "valuation.dcf.analystGrowth");
    expect(entry?.severity).toBe("info");
    expect(entry?.reason).not.toMatch(/rate limit/);
  });
});

/**
 * AMZN audit 2026-10-20, finding 3: year one carried the guided quarter at its
 * SEQUENTIAL pace — Q3 2026 guidance $199.5B over Q2's $200.6B, annualized,
 * −2.2% a year — though Amazon guided +9% to +12% over Q3 2025. Q3 is below Q2
 * every year (the season), so the sequential pace understated the outlook.
 * Year one now carries at the guided year-over-year pace. Inputs from Amazon's
 * 10-Q/10-K quarters and its 2026-07-30 release ($B).
 */
describe("guided quarter carried at its year-over-year pace", () => {
  const amzn = (quarterRevenue: DcfAssumptionInputs["quarterRevenue"]) => nvda({
    incomeTtm: { date: "2026-06-30", basis: "ttm", revenue: 775.7 * B, operatingIncome: 0.11 * 775.7 * B, incomeBeforeTax: 90 * B, incomeTaxExpense: 15 * B },
    balance: { date: "2026-06-30", basis: "quarter", totalDebt: 60 * B, totalStockholdersEquity: 380 * B, cashAndShortTermInvestments: 90 * B },
    marketCap: 2.4e12,
    quarterRevenue,
    guidance: { revenue: 199.5 * B, revenueLow: 197 * B, revenueHigh: 202 * B, periodEnd: "2026-09-30", asOf: "2026-07-30", source: "8-K EX-99.1" },
  });
  const latest = { date: "2026-06-30", revenue: 200.6 * B };
  const yearAgo = { date: "2025-06-30", revenue: 167.7 * B };
  const yearOne = (inputs: DcfAssumptionInputs) => 775.7 * B * (1 + buildDcfAssumptions(inputs).assumptions!.growthPath.value[0] / 100);

  it("carries the TTM at the guided quarter's growth over the same quarter a year earlier", () => {
    const inputs = amzn({ latest, yearAgo, guidedYearAgo: { date: "2025-09-30", revenue: 180.2 * B } });
    const anchor = buildDcfAssumptions(inputs).assumptions!.revenueAnchor!;
    expect(anchor.source).toBe("guidance");
    // 2026-10-29 D-136: 775.7B TTM × (199.5 / 180.2) = 858.78B; no seasonal window.
    expect(anchor.evidence!.guidedYoyPct).toBeCloseTo(10.71, 2);
    expect(anchor.evidence!.guidedPacePct).toBeCloseTo(-2.18, 2);
    expect(yearOne(inputs)).toBeCloseTo(858.78 * B, -9);
    expect(anchor.basis).toMatch(/guided year-over-year pace 10\.71%/);
  });

  it("does not take a level from guidance without a year-ago quarter", () => {
    expect(buildDcfAssumptions(amzn({ latest, yearAgo })).assumptions!.revenueAnchor!.source).toBe("run-rate");
    // A row 457 days before the guided quarter is not its year-ago quarter.
    expect(buildDcfAssumptions(amzn({ latest, yearAgo, guidedYearAgo: { date: "2025-06-30", revenue: 167.7 * B } })).assumptions!.revenueAnchor!.source).toBe("run-rate");
  });
});

// AMZN audit 2026-10-20 (finding 4): a declining margin faded down to its
// history while an improving one was held flat at today's level for ten
// years. The improving fade is bounded by the efficiency the issuer has
// already shown (today's gross margin less its leanest operating-expense
// ratio) and by half its dated trend carried over the fade years.
describe("improving margins fade up toward a bounded target", () => {
  /** Margin 5→9% over FY2021-25 (slope +1pp/yr); FY2023 ran the leanest opex ratio, 43 − 7 = 36%. */
  const improving = ([
    ["2021-12-31", 100, 45, 5], ["2022-12-31", 110, 46, 6], ["2023-12-31", 120, 43, 7],
    ["2024-12-31", 130, 48, 8], ["2025-12-31", 140, 49, 9],
  ] as const).map(([date, revenue, grossPct, marginPct]) => ({
    date, revenue: revenue * B, grossProfit: (grossPct / 100) * revenue * B, operatingIncome: (marginPct / 100) * revenue * B,
    incomeBeforeTax: (marginPct / 100) * revenue * B, incomeTaxExpense: (marginPct / 500) * revenue * B,
  }));
  const ttmRevenue = 150 * B;
  const inputs = (over: Partial<DcfAssumptionInputs> = {}): DcfAssumptionInputs => nvda({
    incomeTtm: { date: "2026-06-30", basis: "ttm", revenue: ttmRevenue, grossProfit: 0.5 * ttmRevenue, operatingIncome: 0.11 * ttmRevenue, incomeBeforeTax: 0.11 * ttmRevenue, incomeTaxExpense: 0.022 * ttmRevenue },
    incomeHistory: improving,
    quarterRevenue: { latest: { date: "2026-06-30", revenue: 38 * B }, yearAgo: { date: "2025-06-30", revenue: 35 * B } },
    ...over,
  });

  it("fades to the lower of the demonstrated-efficiency ceiling and half the trend, never below today", () => {
    const a = buildDcfAssumptions(inputs()).assumptions!;
    // Ceiling: gross 50% (TTM) − leanest opex 36% (FY2023) = 14%; half the
    // 1pp/yr trend over five years is 11 + 2.5 = 13.5%, which binds.
    expect(a.ebitMarginPath.value[0]).toBeCloseTo(11, 6);
    expect(a.ebitMarginPath.value[4]).toBeCloseTo(13.5, 2);
    expect(a.ebitMarginPath.value[9]).toBeCloseTo(13.5, 2);
    expect(a.ebitMarginPath.basis).toMatch(/fade current 11% .* -> 13\.5% by year 5 under improving/);
    expect(a.ebitMarginPath.basis).toMatch(/half the dated trend/);
    expect(a.improvingMarginFade).toEqual({ currentPct: 11, targetPct: expect.closeTo(13.5, 2) });
  });

  it("stops at the gross-margin-less-leanest-opex ceiling when the trend would carry past it", () => {
    // TTM gross margin 48%: ceiling 48 − 36 (FY2023) = 12%, below the 13.5% trend bound.
    const a = buildDcfAssumptions(inputs({
      incomeTtm: { date: "2026-06-30", basis: "ttm", revenue: ttmRevenue, grossProfit: 0.48 * ttmRevenue, operatingIncome: 0.11 * ttmRevenue, incomeBeforeTax: 0.11 * ttmRevenue, incomeTaxExpense: 0.022 * ttmRevenue },
    })).assumptions!;
    expect(a.scenarioMarginCeiling!.pct).toBeCloseTo(12, 6);
    expect(a.ebitMarginPath.value[4]).toBeCloseTo(12, 6);
    expect(a.ebitMarginPath.basis).toMatch(/gross margin less the leanest operating-expense ratio/);
  });

  it("holds the margin flat when no gross margin is filed to bound the target", () => {
    const noGross = improving.map((row) => ({ ...row, grossProfit: null }));
    const a = buildDcfAssumptions(inputs({
      incomeHistory: noGross,
      incomeTtm: { date: "2026-06-30", basis: "ttm", revenue: ttmRevenue, operatingIncome: 0.11 * ttmRevenue, incomeBeforeTax: 0.11 * ttmRevenue, incomeTaxExpense: 0.022 * ttmRevenue },
    })).assumptions!;
    expect(a.ebitMarginPath.value.every((m) => Math.abs(m - 11) < 1e-9)).toBe(true);
    expect(a.improvingMarginFade).toBeUndefined();
  });
});

/*
 * AMZN audit 2026-10-20 finding 19: calendarizing consensus spread each fiscal
 * year evenly over its days, so a window holding a seasonal issuer's light first
 * half took half its year (AMZN: +3.7% on year one). When the last complete
 * fiscal year has four reported quarters, each fiscal year's months now take
 * that year's quarterly shape.
 */
describe("consensus calendarization by the issuer's quarterly shape", () => {
  // A calendar-year issuer whose fourth quarter is 40% of the year.
  const seasonality = { fiscalYearEnd: "2025-12-31", quarters: [
    { date: "2025-03-31", revenue: 100 }, { date: "2025-06-30", revenue: 100 },
    { date: "2025-09-30", revenue: 100 }, { date: "2025-12-31", revenue: 200 },
  ] };
  const estimates = [{ date: "2026-12-31", revenueAvg: 550 }, { date: "2027-12-31", revenueAvg: 600 }, { date: "2028-12-31", revenueAvg: 660 }];
  const reported = { priorFiscalYearEnd: "2025-12-31", through: "2026-06-30", revenue: 220, quarters: 2 };
  const seasonal = (over: Partial<DcfAssumptionInputs> = {}): DcfAssumptionInputs => ({
    revenueCagr3yPct: 10, analystEstimates: estimates, waccPct: 9, riskFreePct: 4,
    incomeTtm: { date: "2026-06-30", basis: "ttm", revenue: 520, operatingIncome: 104, incomeBeforeTax: 100, incomeTaxExpense: 21 },
    incomeHistory: [2021, 2022, 2023, 2024, 2025].map((y, i) => ({ date: `${y}-12-31`, revenue: 380 + 30 * i, operatingIncome: 0.2 * (380 + 30 * i), incomeBeforeTax: 0.19 * (380 + 30 * i), incomeTaxExpense: 0.04 * (380 + 30 * i) })),
    balance: { date: "2026-06-30", basis: "quarter", totalDebt: 100, totalStockholdersEquity: 300, cashAndShortTermInvestments: 50 },
    marketCap: 2000, fiscalYearToDate: reported, revenueSeasonality: seasonality,
    ...over,
  });

  it("weights each fiscal year's months by the last complete year's quarterly shape", () => {
    // Year one: FY2026's remainder 550 − 220 (all of July–December) plus
    // FY2027's first half at Q1 + Q2 = 40% of 600 = 570, where an even spread
    // gave 330 + 600 × 181/365 = 627.53.
    const w1 = { startDate: "2026-07-01", endDate: "2027-06-30" };
    expect(calendarizeConsensusWindow(estimates, w1, reported, seasonality).value).toBeCloseTo(570, 9);
    expect(calendarizeConsensusWindow(estimates, w1, reported).value).toBeCloseTo(330 + 600 * 181 / 365, 9);
    // Year two: 60% of FY2027 and 40% of FY2028.
    const w2 = { startDate: "2027-07-01", endDate: "2028-06-30" };
    expect(calendarizeConsensusWindow(estimates, w2, null, seasonality).value).toBeCloseTo(0.6 * 600 + 0.4 * 660, 9);
  });

  it("sets year one on the shaped consensus and says which basis it used", () => {
    const a = buildDcfAssumptions(seasonal()).assumptions!;
    expect(a.revenueAnchor!.source).toBe("consensus");
    expect(520 * (1 + a.growthPath.value[0] / 100)).toBeCloseTo(570, 6);
    expect(a.revenueAnchor!.basis).toContain("fiscal-year estimates spread by the quarterly shape of the fiscal year ending 2025-12-31 (20%, 20%, 20% and 40% of its reported revenue, each quarter's share over its three months)");
  });

  it("keeps the even spread, and says so, without four reported quarters for the last complete year", () => {
    for (const over of [{ revenueSeasonality: null }, { revenueSeasonality: { ...seasonality, quarters: seasonality.quarters.slice(1) } }]) {
      const a = buildDcfAssumptions(seasonal(over)).assumptions!;
      expect(520 * (1 + a.growthPath.value[0] / 100)).toBeCloseTo(330 + 600 * 181 / 365, 6);
      expect(a.revenueAnchor!.basis).toContain("fiscal-year estimates weighted by day overlap, each fiscal year spread evenly over its days because the last complete fiscal year has no four reported quarterly revenues to shape it");
    }
  });
});
