/**
 * D-65 (independent audit of the NVDA report built from metis-final.db, report
 * 1, 2026-10-16). Inputs are that run's frozen values: TTM to 2026-07-26, the
 * FMP analyst-estimates response (FY2027-FY2031), H1 FY2027 revenue from the
 * 10-Q ($81.615B + $96.221B), the Q3 FY2027 outlook, the 10-Q balance sheet
 * and the quote of 2026-10-15.
 */
import { describe, expect, it } from "vitest";

import { peerSizeExclusion } from "@/pipeline/peers";
import { interestRunRate } from "@/pipeline/stageB/projections";
import { buildScenarioPaths } from "@/pipeline/stageB/scenarioPaths";
import {
  buildDcfAssumptions, consensusDispersionPct, multiplesFramework, runDcf,
  type AnalystEstimateRow, type DcfAssumptionInputs, type DcfAssumptions,
} from "@/pipeline/stageB/valuation";
import { guidanceLowCitation, guidanceRecordId } from "@/pipeline/stageC/payload";
import { summarizeSensitivity } from "@/report/scenarioPresentation";
import { buildThesisTriggers } from "@/report/thesisTriggers";
import type { ComputedMetrics } from "@/pipeline/compute";
import type { FilingDisclosures } from "@/report/schema";

const B = 1e9;
const ANNUAL = [
  { date: "2026-01-25", revenue: 215_938e6, grossProfit: 153_463e6, operatingIncome: 130_387e6, incomeBeforeTax: 141_450e6, incomeTaxExpense: 21_383e6 },
  { date: "2025-01-26", revenue: 130_497e6, grossProfit: 97_858e6, operatingIncome: 81_453e6, incomeBeforeTax: 84_026e6, incomeTaxExpense: 11_146e6 },
  { date: "2024-01-28", revenue: 60_922e6, grossProfit: 44_301e6, operatingIncome: 32_972e6, incomeBeforeTax: 33_818e6, incomeTaxExpense: 4_058e6 },
  { date: "2023-01-29", revenue: 26_974e6, grossProfit: 15_356e6, operatingIncome: 4_224e6, incomeBeforeTax: 4_181e6, incomeTaxExpense: -187e6 },
  { date: "2022-01-30", revenue: 26_914e6, grossProfit: 17_475e6, operatingIncome: 10_041e6, incomeBeforeTax: 9_941e6, incomeTaxExpense: 189e6 },
];
const TTM = { date: "2026-07-26", basis: "ttm" as const, revenue: 302_969e6, grossProfit: 226_241e6, operatingIncome: 197_579e6, incomeBeforeTax: 229_744e6, incomeTaxExpense: 36_865e6 };
/** FMP /stable/analyst-estimates for NVDA as cached by the run (revenue mean, count, low, high). */
const ESTIMATES: AnalystEstimateRow[] = [
  { date: "2027-01-25", revenueAvg: 409_796_678_872, analysts: 41, revenueLow: 371_305_703_813, revenueHigh: 423_491_553_846 },
  { date: "2028-01-25", revenueAvg: 694_610_426_694, analysts: 42, revenueLow: 519_050_799_043, revenueHigh: 751_686_685_975 },
  { date: "2029-01-25", revenueAvg: 924_393_466_487, analysts: 38, revenueLow: 613_757_362_168, revenueHigh: 1_205_103_547_368 },
  { date: "2030-01-25", revenueAvg: 1_106_491_211_008, analysts: 30, revenueLow: 868_804_692_356, revenueHigh: 1_250_727_108_555 },
  { date: "2031-01-25", revenueAvg: 1_160_995_000_000, analysts: 35, revenueLow: 911_600_466_201, revenueHigh: 1_312_335_701_314 },
];
const H1 = 81_615e6 + 96_221e6;

function inputs(over: Partial<DcfAssumptionInputs> = {}): DcfAssumptionInputs {
  return {
    revenueCagr3yPct: 100.05, revenueCagr5yPct: 66.9, analystEstimates: ESTIMATES, waccPct: 13.2142, riskFreePct: 5.19,
    incomeTtm: TTM, incomeHistory: ANNUAL, domicileCountry: "US", marketCap: 5_235_243e6,
    balance: { date: "2026-07-26", basis: "quarter", totalDebt: 38_860e6, totalStockholdersEquity: 228_984e6, cashAndShortTermInvestments: 99_369e6, longTermInvestments: 51_157e6 },
    quarterRevenue: { latest: { date: "2026-07-26", revenue: 96_221e6 }, yearAgo: { date: "2025-07-27", revenue: 46_743e6 } },
    guidance: { revenue: 108e9, revenueLow: 105.84e9, periodEnd: "2026-10-25", asOf: "2026-08-26", source: "sec:8-K EX-99.1 0001045810-26-000073", grossMarginLowPct: 73.5 },
    fiscalYearToDate: { priorFiscalYearEnd: "2026-01-25", through: "2026-07-26", revenue: H1, quarters: 2 },
    ...over,
  };
}
const build = (over: Partial<DcfAssumptionInputs> = {}): DcfAssumptions => buildDcfAssumptions(inputs(over)).assumptions as DcfAssumptions;

describe("D-65 consensus beyond year two (P0) and the reported half (P2-2)", () => {
  it("anchors every covered, gated consensus year, then fades; year one takes the fiscal year's consensus less H1", () => {
    const a = build();
    const anchor = a.revenueAnchor!;
    // FY2027's remainder (consensus − H1, all 183 unreported days inside the
    // window) plus FY2028's 182 of 365 days.
    const yearOne = (ESTIMATES[0].revenueAvg! - H1) + ESTIMATES[1].revenueAvg! * 182 / 365;
    expect(anchor.yearOneRevenue).toBeCloseTo(yearOne, -3);
    expect(anchor.consensusYears).toEqual([1, 2, 3, 4]);
    const path = anchor.consensusPath!;
    // Years 2-4 follow the calendarized consensus levels exactly.
    let level = anchor.yearOneRevenue;
    for (let k = 1; k < 4; k++) {
      level *= 1 + a.growthPath.value[k] / 100;
      expect(level / (path[k].consensus as number)).toBeCloseTo(1, 9);
    }
    // FY2032 has no estimate, so year five is the fade's: not anchored, and stated.
    expect(path[4]).toMatchObject({ consensus: null, anchored: false });
    expect(anchor.basis).toMatch(/year five is not anchored: .*not covered/);
    expect(a.growthPath.basis).toMatch(/consensus anchors years 1–4/);
    expect(a.growthPath.value.at(-1)).toBeCloseTo(2.5, 9);
    // FY2029's range spans 64% of its mean, but with 38 analysts the expected
    // range is d2(38) = 4.213 + 0.6 × (4.322 − 4.213) standard deviations, so
    // the implied σ is 15% of the mean: inside the 25% gate.
    expect(consensusDispersionPct(ESTIMATES[2])).toBeCloseTo((1_205_103_547_368 - 613_757_362_168) / ((4.213 + 0.6 * 0.109) * 924_393_466_487) * 100, 9);
  });

  it("ends the anchored stretch at a thin or divided estimate", () => {
    const thin = ESTIMATES.map((row, i) => (i === 2 ? { ...row, analysts: 2 } : row));
    expect(build({ analystEstimates: thin }).revenueAnchor!.consensusYears).toEqual([1]);
    // A low of $50B against a $1.11T mean from 30 analysts: implied σ 26.5% of the level.
    const divided = ESTIMATES.map((row, i) => (i === 3 ? { ...row, revenueLow: 50e9 } : row));
    const a = build({ analystEstimates: divided });
    expect(a.revenueAnchor!.consensusYears).toEqual([1, 2]);
    expect(a.revenueAnchor!.consensusPath![2].status).toMatch(/implied analyst dispersion .* above the 25% limit/);
  });
});

describe("D-65 valuation date (P2-3) and non-operating investments (P2-1)", () => {
  it("rolls the value forward to the quote date and adds back the long-term investments sales-to-capital removed", () => {
    const atStatement = build();
    const atQuote = build({ valuationDate: "2026-10-15" });
    expect(atStatement.valuationDate).toBeUndefined();
    expect(atQuote.valuationDate?.elapsedYears).toBeCloseTo(81 / 365.25, 12);
    expect(atQuote.nonOperatingInvestments).toEqual({ value: 51_157e6, balanceDate: "2026-07-26" });
    const opts = { waccPct: 13.2142, netDebt: -23_220e6, dilutedShares: 24_285e6 };
    const ratio = runDcf(atQuote, opts).enterpriseValue / runDcf(atStatement, opts).enterpriseValue;
    expect(ratio).toBeCloseTo(Math.pow(1.132142, 81 / 365.25), 12);
  });
});

describe("D-65 enterprise values (P1)", () => {
  it("nets the D-60 net cash in the multiples' EV, the same figure the key-data box shows", () => {
    const r = multiplesFramework("general", {
      quote: { price: 217.23, marketCap: 5_235_243e6, currency: "USD" }, reportedCurrency: "USD",
      incomeTtm: { date: "2026-07-26", revenue: 302_969e6, operatingIncome: 197_579e6, depreciationAndAmortization: 3_200e6, netIncome: 190_000e6, epsDiluted: 7.9 },
      cashFlowTtm: { date: "2026-07-26", operatingCashFlow: 134_360e6, capitalExpenditure: -7_350e6, depreciationAndAmortization: 3_200e6 },
      balance: { date: "2026-07-26", basis: "quarter", totalDebt: 38_860e6, cashAndCashEquivalents: 22_443e6, shortTermInvestments: 76_926e6,
        cashAndShortTermInvestments: 99_369e6, marketableEquitySecurities: 42_783e6, totalStockholdersEquity: 228_984e6, goodwill: 21_125e6,
        intangibleAssets: 2_998e6, minorityInterest: 0, preferredStock: 0, capitalLeaseObligations: 5_494e6, operatingLeaseLiability: 5_494e6 },
    });
    // 5,235.243 + (38.860 − 99.369 + 42.783) − 5.494 = 5,212.023B, not the 5,169.24B that netted the equity stakes as cash.
    expect(r.enterpriseValue.value).toBeCloseTo(5_212_023e6, -3);
    expect(r.enterpriseValue.basis).toMatch(/excluding 42783000000 of marketable equity securities/);
  });
});

describe("D-65 robustness (P1) and scenario margins (P2-4)", () => {
  it("bases the price conclusion on both grids and names the growth × margin cells that cross", () => {
    const wacc = [11, 12, 13].flatMap((w) => [2, 2.5, 3].map((g) => ({ waccPct: w, gTermPct: g, perShare: 240 + w })));
    const gm = { growthShiftsPp: [-20, -10, 0], marginShiftsPp: [-10, -5, 0], perShare: [[159.54, 174.83, 190.12], [199.39, 218.68, 237.96], [247.98, 272.15, 296.32]] };
    const s = summarizeSensitivity(wacc, 217.23, gm);
    expect(s.status).toBe("sensitive");
    expect(s.conclusion).toMatch(/all 9 WACC × terminal-growth cells stay above the current price; 4 of 9 valid year-one growth × margin cells sit at or below it \(growth −20pp at margin −10pp to 0pp; growth −10pp at margin −10pp\)/);
    expect(summarizeSensitivity(wacc, 217.23).status).toBe("robust-above");
  });

  it("shows the margin shift a scenario keeps after the cap", () => {
    const a = build();
    const shared = buildScenarioPaths(a, { waccPct: 13.2142, netDebt: -23_220e6, dilutedShares: 24_285e6 }, { sigmaGrowth: 25, sigmaMargin: 12.05, growthMarginCorrelation: 0.84 });
    const bull = shared.scenarioAssumptions.scenarios.find((s) => s.name === "bull")!;
    // The cap (TTM gross margin less the leanest opex ratio) equals the base
    // year-one margin, and never pulls below it, so +10.12pp requested leaves 0.
    expect(bull.marginDeltaPp).toBeCloseTo(10.122, 3);
    expect(bull.effectiveMarginDeltaPp).toBeCloseTo(0, 9);
    expect(shared.scenarioAssumptions.scenarios.find((s) => s.name === "bear")!.effectiveMarginDeltaPp).toBeUndefined();
  });
});

describe("D-65 EPS interest (P2-8), triggers and peers", () => {
  it("deducts interest at the latest quarter's effective rate on the closing debt", () => {
    // Q2 FY2027: $227M of interest on debt (ex operating leases) of $8.47B opening and $33.366B closing.
    const r = interestRunRate({ date: "2026-07-26", interestExpense: 227e6 }, { date: "2026-07-26", debt: 33_366e6 }, { date: "2026-04-26", debt: 8_470e6 });
    expect(r?.value).toBeCloseTo((227e6 / ((33_366e6 + 8_470e6) / 2)) * 4 * 33_366e6, 0);
    expect(r!.value / B).toBeGreaterThan(1.4);
    expect(interestRunRate({ date: "2026-07-26", interestExpense: 227e6 }, null, null)?.value).toBe(908e6);
  });

  it("cites the registered guidance record for the guided-quarter checkpoints", () => {
    const rows = [
      { period: "Q3 FY2027", metric: "revenue", basis: "unspecified", unit: "currency", low: 105.84e9, mid: 108e9, high: 110.16e9, form: "plus-minus" },
      { period: "Q3 FY2027", metric: "gross-margin", basis: "gaap", unit: "%", low: 73.5, mid: 74, high: 74.5, form: "plus-minus" },
    ] as NonNullable<FilingDisclosures["guidance"]>["rows"];
    const cite = guidanceLowCitation({ guidance: { rows } } as unknown as FilingDisclosures);
    const a = build();
    const dcf = runDcf(a, { waccPct: 13.2142, netDebt: -23_220e6, dilutedShares: 24_285e6 });
    const computed = { valuation: { kind: "dcf", assumptions: a, dcf, reverseDcf: null }, projections: { series: [{ metric: "revenue", unit: "USD" }] } } as unknown as Pick<ComputedMetrics, "valuation" | "projections">;
    const triggers = buildThesisTriggers(computed, cite);
    expect(triggers.find((t) => t.id === "guided-quarter-revenue")?.threshold.source).toBe("payload.issuer-filings.q3-fy2027-revenue-guidance-low");
    expect(triggers.find((t) => t.id === "guided-quarter-gross-margin")?.threshold.source).toBe(guidanceRecordId(rows[1], "low"));
    expect(guidanceRecordId(rows[1], "low")).toBe("payload.issuer-filings.q3-fy2027-gross-margin-gaap-guidance-low");
  });

  it("keeps micro-caps out of a mega-cap's peers", () => {
    const nvda = 5_235_243e6;
    const caps: Record<string, number> = { AMD: 917_826e6, ARM: 261_435e6, AVGO: 1_643_704e6, CBRS: 32_206e6, CRWV: 38_379e6, INTC: 504_136e6, MOVE: 265e6, MRVL: 211_270e6, QCOM: 190_503e6, XLAB: 29e6 };
    const excluded = Object.entries(caps).filter(([, cap]) => peerSizeExclusion(nvda, cap) !== null).map(([s]) => s);
    expect(excluded).toEqual(["CBRS", "CRWV", "MOVE", "XLAB"]);
    expect(peerSizeExclusion(nvda, 29e6)).toMatch(/180,526× smaller than the subject's 5.24T/);
  });
});
