/**
 * D-60 (NVDA report #34 audit P0-5, P0-9, P2-0, P2-8, P2-9). Inputs are the
 * frozen NVDA run of 2026-10-15: TTM to 2026-07-26 from the 10-Q quarters,
 * fiscal years 2022-2026 from the 10-Ks, and the 10-Q's investments note
 * (cash $22.443B + marketable debt $34.143B + publicly-held equity $42.783B =
 * cash and short-term investments $99.369B).
 */
import { describe, expect, it } from "vitest";

import { riskFreePct, type ComputedMetrics } from "@/pipeline/compute";
import type { DataBundle } from "@/pipeline/types";
import { marketableEquityInCash } from "@/pipeline/stageB/marketableEquity";
import { resolveNetDebt } from "@/pipeline/stageB/netDebt";
import { computeProjections } from "@/pipeline/stageB/projections";
import { computeWacc, waccDisclosure } from "@/pipeline/stageB/returns";
import { perturbScenarioAssumptions } from "@/pipeline/stageB/scenarioPaths";
import type { CompanyRouteResult } from "@/pipeline/stageB/sectorRouting";
import { buildDcfAssumptions, growthMarginGrid, runDcf, sensitivityGrid, type DcfAssumptions, type ValuationResult } from "@/pipeline/stageB/valuation";
import { applyScenarioPresentation, buildScenarioPresentation } from "@/report/scenarioPresentation";
import type { Valuation } from "@/report/schema";

const ANNUAL = [
  { date: "2026-01-25", revenue: 215_938e6, grossProfit: 153_463e6, operatingIncome: 130_387e6, incomeBeforeTax: 141_450e6, incomeTaxExpense: 21_383e6 },
  { date: "2025-01-26", revenue: 130_497e6, grossProfit: 97_858e6, operatingIncome: 81_453e6, incomeBeforeTax: 84_026e6, incomeTaxExpense: 11_146e6 },
  { date: "2024-01-28", revenue: 60_922e6, grossProfit: 44_301e6, operatingIncome: 32_972e6, incomeBeforeTax: 33_818e6, incomeTaxExpense: 4_058e6 },
  { date: "2023-01-29", revenue: 26_974e6, grossProfit: 15_356e6, operatingIncome: 4_224e6, incomeBeforeTax: 4_181e6, incomeTaxExpense: -187e6 },
  { date: "2022-01-30", revenue: 26_914e6, grossProfit: 17_475e6, operatingIncome: 10_041e6, incomeBeforeTax: 9_941e6, incomeTaxExpense: 189e6 },
];
const TTM = { date: "2026-07-26", basis: "ttm" as const, revenue: 302_969e6, grossProfit: 226_241e6, operatingIncome: 197_579e6, incomeBeforeTax: 229_744e6, incomeTaxExpense: 36_865e6 };

function nvdaAssumptions(): DcfAssumptions {
  const built = buildDcfAssumptions({
    revenueCagr3yPct: 100.05, revenueCagr5yPct: 66.9, analystEstimates: null, waccPct: 13.25, riskFreePct: 5.19,
    incomeTtm: TTM, incomeHistory: ANNUAL, domicileCountry: "US", marketCap: 5.27e12,
    balance: { date: "2026-07-26", basis: "quarter", totalDebt: 38_860e6, totalStockholdersEquity: 228_984e6, cashAndShortTermInvestments: 99_369e6 },
  });
  expect(built.assumptions).not.toBeNull();
  return built.assumptions as DcfAssumptions;
}

const usd = (end: string, val: number) => ({ end, val, accn: "0001045810-26-000075", fy: 2027, fp: "Q2", form: "10-Q", filed: "2026-08-26" });
const NVDA_FACTS = { cik: 1045810, entityName: "NVIDIA CORP", facts: { "us-gaap": {
  EquitySecuritiesFvNi: { units: { USD: [usd("2026-07-26", 42_783e6)] } },
  DebtSecuritiesCurrent: { units: { USD: [usd("2026-07-26", 34_143e6)] } },
} } };
const NVDA_BALANCE = { date: "2026-07-26", reportedCurrency: "USD", cashAndCashEquivalents: 22_443e6, shortTermInvestments: 76_926e6, cashAndShortTermInvestments: 99_369e6 };

describe("D-60 scenarios (P0-5)", () => {
  it("mean-reverts both shocks to the base path and caps margins at gross margin less the leanest opex ratio", () => {
    const a = nvdaAssumptions();
    const ceiling = a.scenarioMarginCeiling;
    // TTM gross margin 74.67% less the TTM opex ratio 9.46%, the leanest on record.
    expect(ceiling?.grossMarginPct).toBeCloseTo((226_241 / 302_969) * 100, 6);
    expect(ceiling?.minOpexRatioPct).toBeCloseTo(((226_241 - 197_579) / 302_969) * 100, 6);
    expect(ceiling?.pct).toBeCloseTo((197_579 / 302_969) * 100, 6);
    const base = a.growthPath.value;
    const baseMargin = a.ebitMarginPath.value;
    for (const sign of [1, -1]) {
      const shocked = perturbScenarioAssumptions(a, sign * 25, sign * 10.12);
      const dg = shocked.growthPath.value.map((g, i) => g - base[i]);
      expect(dg[0]).toBeCloseTo(sign * 25, 9);
      for (let i = 1; i < dg.length; i++) expect(Math.abs(dg[i])).toBeLessThan(Math.abs(dg[i - 1]));
      expect(dg.at(-1)).toBeCloseTo(0, 9);
      expect(shocked.ebitMarginPath.value.at(-1)).toBeCloseTo(baseMargin.at(-1)!, 9);
      shocked.ebitMarginPath.value.forEach((m, i) => expect(m).toBeLessThanOrEqual(Math.max(baseMargin[i], ceiling!.pct) + 1e-9));
    }
    // Terminal discounting convention is stated where the reader sees the assumptions (P2-8).
    expect(a.midYear.basis).toMatch(/terminal value.*N − 0\.5/i);
  });

  it("attaches no weight to price targets and labels the projection FCF history after SBC", () => {
    const a = nvdaAssumptions();
    const dcf = runDcf(a, { waccPct: 13.25, netDebt: -23_220e6, dilutedShares: 24_285e6 });
    const valuation = { kind: "dcf", route: "general", assumptions: a, dcf, sensitivity: null, reverseDcf: null,
      multiples: {} as never, notes: [], gaps: [] } as ValuationResult;
    const income = ANNUAL.map((r) => ({ date: r.date, revenue: r.revenue, ebit: r.operatingIncome, netIncome: r.incomeBeforeTax * 0.85,
      epsDiluted: 1, interestExpense: r.date === "2026-01-25" ? 259e6 : null }));
    const projections = computeProjections({ route: {} as CompanyRouteResult, valuation, waccPct: 13.25, dilutedShares: 24_285e6,
      incomeHistory: income, fcfHistory: [{ date: "2026-01-25", fcf: 90_290e6 }], shareCountAnnualizedPct: -0.47, currency: "USD", asOf: "2026-10-15" });
    expect(projections.series.find((s) => s.metric === "fcf")?.assumptions.join(" ")).toMatch(/after stock-based compensation/i);
    // P0-D: operating EPS taxed at the DCF's own year-one rate, not a historical NI/EBIT median.
    const row = dcf.yearRows[0];
    expect(projections.series.find((s) => s.metric === "epsDiluted")?.base[0].value.value)
      .toBeCloseTo(Math.round(((row.ebit - 259e6) * (1 - row.taxRatePct / 100)) / 24_285e6 * 100) / 100, 2);
    const computed = { projections, valuation, scenarioTargets: { status: "unavailable" } } as unknown as ComputedMetrics;
    const narrative = { scenarios: (["bull", "base", "bear"] as const).map((name) => ({ name, probability: 1 / 3, assumptions: [], whatWouldHaveToBeTrue: [], priceTarget: null, horizon: "n/a" })) } as unknown as Valuation;
    expect(applyScenarioPresentation(narrative, computed).scenarios.map((s) => s.probability)).toEqual([null, null, null]);
    expect(buildScenarioPresentation(computed).weightBasis).toMatch(/no weight/i);
  });
});

describe("D-60 net cash (P0-9)", () => {
  it("keeps publicly-held equity out of cash and carries it as a separately disclosed non-operating asset", () => {
    const equity = marketableEquityInCash(NVDA_FACTS, NVDA_BALANCE, "2026-10-15T23:19:49.399Z");
    expect(equity?.value).toBe(42_783e6);
    expect(equity?.tags).toContain("us-gaap/EquitySecuritiesFvNi");
    // A combined field the facts do not reconcile to is not split.
    expect(marketableEquityInCash(NVDA_FACTS, { ...NVDA_BALANCE, cashAndShortTermInvestments: 98_000e6, shortTermInvestments: 75_557e6 }, "2026-10-15")).toBeNull();
    const net = resolveNetDebt({ totalDebt: 38_860e6, ...NVDA_BALANCE, marketableEquitySecurities: equity!.value });
    expect(net.value).toBe(38_860e6 - 56_586e6);
    expect(net.nonOperatingEquitySecurities).toBe(42_783e6);
    const dcf = runDcf(nvdaAssumptions(), { waccPct: 13.25, netDebt: net.value! - 5_494e6, dilutedShares: 24_285e6, nonOperatingAssets: 42_783e6 });
    expect(dcf.equityValue).toBeCloseTo(dcf.enterpriseValue - (net.value! - 5_494e6) + 42_783e6, 0);
    expect(dcf.bridge.nonOperatingAssets).toBe(42_783e6);
  });
});

describe("D-60 discount rate (P2-0)", () => {
  it("prefers FRED DGS10, discloses the beta regression and ERP vintage, and widens the WACC axis to ±200bp", () => {
    const bundle = {
      treasury: { ok: true, value: { data: { rows: [{ date: "2026-10-13", year10: 5.21 }] } } },
      macro: { core: { DGS10: { ok: true, value: { data: [{ date: "2026-10-13", value: 5.21 }, { date: "2026-10-14", value: 5.19 }] } } } },
    } as unknown as DataBundle;
    expect(riskFreePct(bundle)).toEqual({ pct: 5.19, asOf: "2026-10-14", seriesId: "fred:DGS10" });

    const wacc = computeWacc({ beta: 2.217, riskFreePct: 5.19, erpPct: 4.46, erpAsOf: "2026-10-15", interestExpenseTtm: 463e6,
      totalDebtAvg: 20_000e6, marketCap: 5.27e12, effectiveTaxRate: 0.16, ebitTtm: 197_579e6, analysisDate: "2026-10-15",
      riskFreeSeriesId: "fred:DGS10", betaSource: "FMP profile beta",
      betaRegression: { beta: 2.19, months: 60, windowStart: "2021-09-30", windowEnd: "2026-09-30", rSquared: 0.41, standardError: 0.31, basis: "close", benchmark: "SPY" } });
    const summary = waccDisclosure(wacc).summary;
    expect(summary).toMatch(/60 monthly returns/);
    expect(summary).toMatch(/2021-09-30 to 2026-09-30/);
    expect(summary).toMatch(/R² 0\.41/);
    expect(summary).toMatch(/vintage/);

    const grid = sensitivityGrid(nvdaAssumptions(), { waccPct: 13.25, netDebt: -23_220e6, dilutedShares: 24_285e6 });
    expect(grid.waccPcts).toEqual([11.25, 12.25, 13.25, 14.25, 15.25]);
    // The growth × margin grid withholds margins above gross margin less the leanest opex ratio.
    const gm = growthMarginGrid(nvdaAssumptions(), { waccPct: 13.25, netDebt: -23_220e6, dilutedShares: 24_285e6 });
    expect(gm.perShare.map((row) => row.map((cell) => cell === null))).toEqual(Array(5).fill([false, false, false, true, true]));
    expect(gm.perShare[4][2]!).toBeGreaterThan(gm.perShare[2][2]!);
  });
});
