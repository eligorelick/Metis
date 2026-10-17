import { describe, expect, it } from "vitest";
import { buildDcfAssumptions, runDcf, type DcfAssumptionInputs, type ValuationResult } from "@/pipeline/stageB/valuation";
import { computeDcfDisplay } from "@/pipeline/stageB/fairValue";
import { loadTask28Fixture } from "./helpers/task28Report";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";

function assumptions(rawRatio: number, investments = 0) {
  const input: DcfAssumptionInputs = {
    revenueCagr3yPct: 8, revenueCagr5yPct: 8, analystEstimates: null, waccPct: 9, riskFreePct: 4,
    incomeTtm: { date: "2025-12-31", revenue: rawRatio * 1000, operatingIncome: rawRatio * 200, incomeBeforeTax: rawRatio * 180, incomeTaxExpense: rawRatio * 36 },
    incomeHistory: [{ date: "2025-12-31", revenue: rawRatio * 1000, operatingIncome: rawRatio * 200 }],
    balance: { date: "2025-12-31", basis: "annual", totalDebt: 200, totalEquity: 1000 + investments, totalStockholdersEquity: 1000 + investments, cashAndShortTermInvestments: 200, longTermInvestments: investments },
    marketCap: 5000,
  };
  const result = buildDcfAssumptions(input);
  if (!result.assumptions) throw Error("valid fixture");
  return result.assumptions;
}

describe("sales-to-capital policy disclosure", () => {
  it.each([[15.2575, 5, "upper cap"], [.1, .5, "lower floor"]] as const)("distinguishes raw %s from the applied %s %s", (raw, used, bound) => {
    const a = assumptions(raw);
    expect(a.salesToCapital.value).toBe(used);
    expect(a.salesToCapital.basis).toContain(`raw ratio ${raw.toFixed(4)}x`);
    expect(a.salesToCapital.basis).toContain(`model input used ${used.toFixed(4)}x`);
    expect(a.salesToCapital.basis).toContain(bound);
    expect(a.salesToCapital.basis).toContain("[0.5, 5]");
    expect(a.salesToCapital.basis).toMatch(/house.*guard.*mis.scaled/i);
    expect(a.salesToCapital.basis).toMatch(/not.*observed.*economic/i);
    const dcf = runDcf(a, { waccPct: 9, netDebt: 0, dilutedShares: 100 });
    expect(dcf.yearRows[0]!.reinvestment).toBeCloseTo((dcf.yearRows[0]!.revenue - a.startRevenue.value) / used, 10);
  });

  it("keeps the ordinary unclamped formula and the operating-investment deduction", () => {
    const a = assumptions(2.5, 200);
    expect(a.salesToCapital.value).toBe(2.5);
    expect(a.salesToCapital.basis).toContain("operating invested capital");
    expect(a.salesToCapital.basis).toContain("longTermInvestments");
    expect(a.salesToCapital.basis).not.toMatch(/upper cap|lower floor/);
  });

  it("carries the used-versus-raw policy into the displayed assumption and both report exports", () => {
    const a = assumptions(15.2575, 200);
    const valuation: ValuationResult = { kind: "dcf", route: "general", assumptions: a, dcf: null, sensitivity: null, reverseDcf: null,
      multiples: { multiples: [], enterpriseValue: { value: null, excludingLeases: null, includingLeases: null, leaseLiability: null, includeLeases: false, basis: "fixture" }, sectorAppropriate: [], asOf: { quote: null, statements: null }, notes: [], gaps: [] }, notes: [], gaps: [] };
    const display = computeDcfDisplay(valuation);
    const row = display.assumptions.find(r => r.name === "sales-to-capital")!;
    expect(row.value).toBe("5.00");
    expect(row.basis).toContain("raw ratio 15.2575x");
    const report = loadTask28Fixture();
    report.valuation.dcf = { ...report.valuation.dcf, ...display };
    for (const surface of [reportToMarkdown(report), reportToPrintBody(report)]) {
      expect(surface).toContain("raw ratio 15.3×");
      expect(surface).toContain("model input used 5.00×");
      expect(surface).toContain("revenue 15257.5 / operating invested capital 1000");
      expect(surface).toContain("upper cap");
    }
  });
});
