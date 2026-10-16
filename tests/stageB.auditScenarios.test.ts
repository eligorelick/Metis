import { describe, expect, it } from "vitest";
import { buildDcfAssumptions, convergentFadeWeights, fadePath, forecastYearPeriod, reverseDcf, runDcf, type ValuationResult } from "@/pipeline/stageB/valuation";
import { computeProjections, perturbScenarioAssumptions } from "@/pipeline/stageB/projections";
import { computeScenarioTargets } from "@/pipeline/stageB/scenarioTargets";
import { alignProjectionScenarios } from "@/pipeline/stageB/scenarioAlignment";
import { computeDcfDisplay } from "@/pipeline/stageB/fairValue";
import type { CompanyRouteResult } from "@/pipeline/stageB/sectorRouting";

const history = [1000, 1100, 1320, 1452, 1742.4].map((revenue, i) => ({
  date: `${2021 + i}-12-31`, revenue, ebit: revenue * [0.4, 0.4, 0.1, 0.4, 0.1][i],
  netIncome: revenue * [0.4, 0.4, 0.1, 0.4, 0.1][i] * 0.75, epsDiluted: 1, interestExpense: 10,
}));
const route: CompanyRouteResult = { base: "general", overlays: [], evidence: { sector: null, industry: null }, notes: [], gaps: [], asOf: { today: "2026-10-13", incomeTtm: null, incomeAnnual: null, cashflowTtm: null, cashflowAnnual: null } };
function fixture(basis: "ttm" | "annual" = "ttm") {
  const a = buildDcfAssumptions({ revenueCagr3yPct: 12, analystEstimates: null, waccPct: 9, riskFreePct: 4,
    incomeTtm: { date: "2026-06-30", basis, revenue: 2000, operatingIncome: 600, incomeBeforeTax: 560, incomeTaxExpense: 140 },
    incomeHistory: history.map(r => ({ date: r.date, revenue: r.revenue, operatingIncome: r.ebit, incomeBeforeTax: r.ebit, incomeTaxExpense: r.ebit * .25 })),
    balance: { date: "2026-06-30", basis: "quarter", totalDebt: 200, totalStockholdersEquity: 800, cashAndShortTermInvestments: 300 }, marketCap: 5000 }).assumptions!;
  const opts = { waccPct: 9, netDebt: -100, dilutedShares: 100, minorityInterest: 25, preferred: 10 };
  const dcf = runDcf(a, opts);
  const valuation: Extract<ValuationResult, { kind: "dcf" }> = { kind: "dcf", route: "general", assumptions: a, dcf, sensitivity: null, reverseDcf: null,
    multiples: { multiples: [], enterpriseValue: { value: null, excludingLeases: null, includingLeases: null, leaseLiability: null, includeLeases: false, basis: "test" }, sectorAppropriate: [], asOf: { quote: null, statements: null }, notes: [], gaps: [] }, notes: [], gaps: [] };
  return { a, opts, dcf, valuation };
}
function projections(valuation = fixture().valuation, shareCountAnnualizedPct: number | null = -5) {
  return computeProjections({ route, valuation, waccPct: 9, dilutedShares: 100, incomeHistory: history, fcfHistory: [], shareCountAnnualizedPct, currency: "USD", asOf: "2026-10-13" });
}

describe("report audit valuation regressions", () => {
  it("inverts a fading forward path at the identical year-one anchor", () => {
    const { a, opts } = fixture();
    a.growthPath.value = fadePath(12, 2.5, 10);
    const price = runDcf(a, opts).perShare!;
    const reverse = reverseDcf(price, a, opts);
    expect(reverse.method).toBe("growth");
    expect(reverse.impliedRevenueGrowthPct).toBeCloseTo(12, 2);
    expect(reverse.baseRevenueGrowthPct).toBe(12);
    expect(reverse.impliedGrowthPathPct?.at(-1)).toBe(2.5);
  });
  it("zero shock preserves a valid 55% margin and 65% growth exactly", () => {
    const { a } = fixture();
    a.ebitMarginPath.value = Array(10).fill(55);
    a.growthPath.value[0] = 65;
    expect(perturbScenarioAssumptions(a, 0, 0)).toEqual(a);
    expect(perturbScenarioAssumptions(a, 1, 2).ebitMarginPath.value[0]).toBe(57);
  });
  it("retains the June rolling anchor and exact annual window", () => {
    const p = projections();
    expect(p.series[0].base[0].period).toBe("12M ending 2027-06-30");
    expect(fixture().dcf.yearRows[0].period).toEqual({ basis: "rolling-12-month", startDate: "2026-07-01", endDate: "2027-06-30", label: "12M ending 2027-06-30" });
    expect(projections(fixture("annual").valuation).series[0].base[0].period).toBe("FY2027 ending 2027-06-30");
  });
  it("uses the same countercyclical scenario identity in targets and projected revenue", () => {
    const { valuation, a } = fixture();
    // Re-pinned for D-60: decaying shocks need a margin-dominated history (growth σ ≈ 1.2pp, margin σ 12pp, corr ≈ −1) to invert.
    const countercyclical = ([[1000, 30], [1100, 15], [1188, 45], [1300.86, 20], [1398.42, 50]] as const).map(([revenue, m], i) => ({
      date: `${2021 + i}-12-31`, revenue, ebit: revenue * m / 100, netIncome: revenue * m / 100 * 0.75, epsDiluted: 1 }));
    const t = computeScenarioTargets({ route, valuation, waccPct: 9, incomeHistory: countercyclical, currentPrice: 100, currency: "USD", asOf: "2026-10-13" });
    const bull = t.targets.find(t => t.name === "bull")!;
    expect(bull.growthDeltaPp).toBeLessThan(0);
    const p = computeProjections({ route, valuation, waccPct: 9, dilutedShares: 100, incomeHistory: countercyclical, fcfHistory: [], shareCountAnnualizedPct: -5, currency: "USD", asOf: "2026-10-13" });
    const revenue = p.series.find(s => s.metric === "revenue")!;
    expect(revenue.bull[0].value.value).toBeCloseTo(2000 * (1 + (a.growthPath.value[0] + bull.growthDeltaPp) / 100), 2);
    expect(p.scenarioAssumptions).toEqual(t.scenarioAssumptions);
    // D-60: the decaying shock is the main construction, so no alternative is listed.
    expect(t.scenarioAssumptions?.alternatives).toEqual([]);
    // The main-branch compatibility adapter must not invert the already-shared
    // labels again, including the flat-share and unfunded-share-trend paths.
    expect(alignProjectionScenarios(p, t)).toBe(p);
  });
  it("refuses unfunded share shrinkage and provides flat-share and historical-trend EPS", () => {
    const eps = projections().series.find(s => s.metric === "epsDiluted")!;
    const firstEbit = fixture().dcf.yearRows[0].ebit;
    expect(eps.base[0].value.value).toBeCloseTo((firstEbit - 10) * .75 / 100, 2);
    expect(eps.flatShare?.base[0].value.value).toBe(eps.base[0].value.value);
    expect(eps.shareTrend?.base[0].value.value).toBeCloseTo((firstEbit - 10) * .75 / 95, 2);
    expect(eps.capitalReturn?.appliedShareCountAnnualizedPct).toBe(0);
    expect(projections(undefined, null).series.some(s => s.metric === "epsDiluted")).toBe(true);
  });
  it("exports the numeric equity bridge, tax rates and all annual cash-flow rows", () => {
    const { valuation, dcf } = fixture();
    const display = computeDcfDisplay(valuation);
    expect(display.bridge?.equityValue).toBeCloseTo(dcf.enterpriseValue + 100 - 25 - 10, 10);
    expect(display.forecastRows).toHaveLength(10);
    expect(display.forecastRows?.[0].fcff).toBe(dcf.yearRows[0].fcff);
    expect(display.assumptions.some(r => r.name.includes("tax"))).toBe(true);
  });
  it("records an unbracketed search as unavailable instead of an inferred outside-range growth", () => {
    const { a, opts } = fixture();
    const result = reverseDcf(1e12, a, opts);
    expect(result.method).toBe("none");
    expect(result.impliedRevenueGrowthPct).toBeNull();
    expect(result.gaps.some(g => g.field === "valuation.reverseDcf.growthBracket")).toBe(true);
  });
  it("recovers a different market-implied anchor on the same convergent-shift path family (D-58)", () => {
    const { a, opts } = fixture();
    // The family is the base path with year one moved to g and every later
    // year moved by (g − base) × its convergent fade weight.
    const w = convergentFadeWeights(10);
    const shifted = a.growthPath.value.map((g, i) => g + (18.25 - 12) * w[i]);
    const price = runDcf({ ...a, growthPath: { value: shifted, basis: "sensitivity" } }, opts).perShare!;
    const result = reverseDcf(price, a, opts);
    expect(result.impliedRevenueGrowthPct).toBeCloseTo(18.25, 2);
    expect(result.baseRevenueGrowthPct).toBe(12);
  });
  it("preserves exact leap-day anniversary windows without inventing a fiscal basis", () => {
    expect(forecastYearPeriod("2024-02-29", 1, "rolling-12-month")).toEqual({ basis: "rolling-12-month", startDate: "2024-03-01", endDate: "2025-02-28", label: "12M ending 2025-02-28" });
    expect(forecastYearPeriod("2024-02-30", 1, "fiscal-year")).toBeNull();
  });
  it("rejects forecast dates outside four-digit ISO years and preserves early-year anniversaries", () => {
    expect(forecastYearPeriod("9999-12-31", 1, "rolling-12-month")).toBeNull();
    expect(forecastYearPeriod("0000-12-31", 0, "rolling-12-month")).toBeNull();
    expect(forecastYearPeriod("2024-12-31", 1.5, "rolling-12-month")).toBeNull();
    expect(forecastYearPeriod("0099-12-31", 1, "rolling-12-month")).toEqual({ basis: "rolling-12-month", startDate: "0100-01-01", endDate: "0100-12-31", label: "12M ending 0100-12-31" });
  });
  it("retains positive dilution while exposing a constant-share EPS comparison", () => {
    const eps = projections(undefined, 5).series.find(s => s.metric === "epsDiluted")!;
    expect(eps.base[0].value.value).toBeCloseTo((fixture().dcf.yearRows[0].ebit - 10) * .75 / 105, 2);
    expect(eps.flatShare?.base[0].value.value).toBeCloseTo((fixture().dcf.yearRows[0].ebit - 10) * .75 / 100, 2);
    expect(eps.capitalReturn?.policy).toBe("dilution-trend");
  });
});
