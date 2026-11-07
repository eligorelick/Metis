import { currentValuationUseFixture } from "./helpers/valuationUse";
import { describe, expect, it } from "vitest";
import { taxCapitalSensitivity } from "@/pipeline/stageB/taxCapitalSensitivity";
import { buildDcfAssumptions, runDcf } from "@/pipeline/stageB/valuation";

const assumptions = buildDcfAssumptions({ revenueCagr3yPct: 10, revenueCagr5yPct: 10, analystEstimates: null, waccPct: 9, riskFreePct: 4,
  incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 250, incomeBeforeTax: 240, incomeTaxExpense: 50 },
  incomeHistory: [], balance: { date: "2025-12-31", basis: "annual", totalDebt: 200, totalStockholdersEquity: 800, cashAndShortTermInvestments: 200 }, marketCap: 5000 }).assumptions!;
const base = runDcf(assumptions, { waccPct: 9, netDebt: 100, dilutedShares: 100 });

describe("additive tax and marginal-capital sensitivities", () => {
  it("reproduces the base without changing it and exposes joint mechanical alternatives", () => {
    const before = JSON.stringify({ assumptions, base });
    const grid = taxCapitalSensitivity(assumptions, base, 9, currentValuationUseFixture());
    expect(grid.rows).toHaveLength(9);
    expect(grid.rows.find(r => r.taxShiftPp === 0 && r.salesToCapitalFactor === 1)?.perShare).toBeCloseTo(base.perShare!, 8);
    expect(grid.rows.find(r => r.taxShiftPp === -5 && r.salesToCapitalFactor === 1.25)?.perShare).toBeGreaterThan(base.perShare!);
    expect(grid.rows.find(r => r.taxShiftPp === 5 && r.salesToCapitalFactor === 0.75)?.perShare).toBeLessThan(base.perShare!);
    expect(JSON.stringify({ assumptions, base })).toBe(before);
    expect(grid.basis).toMatch(/mechanical.*not.*underwritten/i);
  });
  it("cannot restore a refused base or missing NCI allocation", () => {
    expect(taxCapitalSensitivity(assumptions, { ...base, perShare: null }, 9, currentValuationUseFixture()).rows).toEqual([]);
    expect(taxCapitalSensitivity(assumptions, { ...base, noncontrollingKeyWithheld: "missing" }, 9, currentValuationUseFixture()).rows).toEqual([]);
  });
  it("does not publish cells whose shifted taxes leave the permitted range", () => {
    const lowTax = { ...assumptions, taxRatePath: { value: assumptions.taxRatePath.value.map(() => 2), basis: "synthetic" } };
    const grid = taxCapitalSensitivity(lowTax, runDcf(lowTax, { waccPct: 9, netDebt: 100, dilutedShares: 100 }), 9, currentValuationUseFixture());
    expect(grid.rows.filter(r => r.taxShiftPp === -5).every(r => r.perShare === null && r.withheldReason !== null)).toBe(true);
  });
  it("refuses incomplete paths instead of emitting nonfinite values that break report assembly", () => {
    const incomplete = { ...assumptions, growthPath: { ...assumptions.growthPath, value: [10, 6, 2] } };
    const grid = taxCapitalSensitivity(incomplete, base, 9, currentValuationUseFixture());
    expect(grid.rows).toEqual([]);
    expect(grid.withheldReason).toMatch(/path.*horizon/i);
  });
});
