import { describe, expect, it } from "vitest";
import { corroborateOperatingIncome } from "@/edgar/revenueAdmission";
import { operatingBridgeProof } from "@/edgar/revenuePresentation";
import { operatingIncomeForNonMargins } from "@/pipeline/incomeBasis";
import type { FmpIncomeStatementRow, StatementFieldProvenance } from "@/providers/fmp";

const proof: StatementFieldProvenance = {
  source: "edgar", unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31",
  observedAt: "2026-03-01", tags: ["us-gaap/Revenues"],
  filings: [{ accn: "annual", filed: "2026-02-01", form: "10-K" }],
};
const line = (value: number, tag: string) => ({ value, proof: { ...proof, tags: [`us-gaap/${tag}`] } });
const pretaxTag = "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest";
function row(vendor: number, pretax: number): FmpIncomeStatementRow {
  return { date: proof.periodEnd, periodStart: proof.periodStart!, reportedCurrency: "USD",
    revenue: 1000, operatingIncome: vendor, incomeBeforeTax: pretax,
    fieldProvenance: { revenue: proof, incomeBeforeTax: line(pretax, pretaxTag).proof },
    filedIncomeLines: { Revenues: line(1000, "Revenues"), [pretaxTag]: line(pretax, pretaxTag) } };
}

describe("complete primary operating proof", () => {
  it.each([[280, 300], [230, 250], [229, null]])("proves restructuring membership by exact pretax reconciliation (%s, D-260)", (pretax, expected) => {
    const r = row(300, pretax!);
    Object.assign(r.filedIncomeLines!, { CostOfRevenue: line(400, "CostOfRevenue"),
      SellingGeneralAndAdministrativeExpense: line(300, "SellingGeneralAndAdministrativeExpense"),
      InterestExpense: line(20, "InterestExpense"),
      RestructuringSettlementAndImpairmentProvisions: line(50, "RestructuringSettlementAndImpairmentProvisions") });
    const result = operatingBridgeProof(line(1000, "Revenues"), line(pretax!, pretaxTag), r.filedIncomeLines!);
    expect(result.status).toBe(expected === null ? "unavailable" : "complete");
    if (result.status === "complete") {
      expect(result.line.value).toBe(expected);
      expect(result.line.proof.tags.includes("us-gaap/RestructuringSettlementAndImpairmentProvisions")).toBe(expected === 250);
    }
  });
  it("includes acquired research and special charges in a disjoint filed operating bridge (P1, D-260)", () => {
    const r = row(300, 180);
    Object.assign(r.filedIncomeLines!, {
      CostOfRevenue: line(400, "CostOfRevenue"),
      SellingGeneralAndAdministrativeExpense: line(200, "SellingGeneralAndAdministrativeExpense"),
      ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost: line(100, "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"),
      ResearchAndDevelopmentAssetAcquiredOtherThanThroughBusinessCombinationWrittenOff: line(80, "ResearchAndDevelopmentAssetAcquiredOtherThanThroughBusinessCombinationWrittenOff"),
      RestructuringSettlementAndImpairmentProvisions: line(20, "RestructuringSettlementAndImpairmentProvisions"),
      NonoperatingIncomeExpense: line(-20, "NonoperatingIncomeExpense"),
    });
    const out = corroborateOperatingIncome(r, r);
    expect(out.operatingIncome).toBe(200);
    expect(out.fieldProvenance?.operatingIncome?.calculation).toBe("complete-operating-reconciliation");
    expect(out.fieldProvenance?.operatingIncome?.tags).toContain("us-gaap/ResearchAndDevelopmentAssetAcquiredOtherThanThroughBusinessCombinationWrittenOff");
  });

  it("does not double-count acquired research inside a filed total research amount (D-260)", () => {
    const r = row(300, 180);
    Object.assign(r.filedIncomeLines!, { CostOfRevenue: line(400, "CostOfRevenue"),
      SellingGeneralAndAdministrativeExpense: line(200, "SellingGeneralAndAdministrativeExpense"),
      ResearchAndDevelopmentExpense: line(180, "ResearchAndDevelopmentExpense"),
      ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost: line(100, "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"),
      ResearchAndDevelopmentAssetAcquiredOtherThanThroughBusinessCombinationWrittenOff: line(80, "ResearchAndDevelopmentAssetAcquiredOtherThanThroughBusinessCombinationWrittenOff"),
      RestructuringSettlementAndImpairmentProvisions: line(20, "RestructuringSettlementAndImpairmentProvisions"),
      NonoperatingIncomeExpense: line(-20, "NonoperatingIncomeExpense") });
    expect(corroborateOperatingIncome(r, r).operatingIncome).toBe(200);
  });

  it("corrects an incompatible operating tag from a complete disjoint itemized statement before any consumer uses it", () => {
    const r = row(500, 290);
    r.fieldProvenance!.operatingIncome = line(500, "OperatingIncomeLoss").proof;
    Object.assign(r.filedIncomeLines!, { CostOfRevenue: line(400, "CostOfRevenue"), GrossProfit: line(600, "GrossProfit"),
      SellingGeneralAndAdministrativeExpense: line(300, "SellingGeneralAndAdministrativeExpense"),
      InterestExpense: line(10, "InterestExpense"), OperatingIncomeLoss: line(500, "OperatingIncomeLoss") });
    const out = corroborateOperatingIncome(r, r);
    expect(out.operatingIncome).toBe(300);
    expect(operatingIncomeForNonMargins(out)).toBe(300);
    expect(out.fieldConflicts?.operatingIncome?.vendorValue).toBe(500);
  });

  it("recognizes interest membership in disjoint components without demanding a second operating-expense subtotal", () => {
    const r = row(210, 200);
    Object.assign(r.filedIncomeLines!, { CostsAndExpenses: line(800, "CostsAndExpenses"), CostOfRevenue: line(600, "CostOfRevenue"),
      SellingGeneralAndAdministrativeExpense: line(190, "SellingGeneralAndAdministrativeExpense"), InterestExpense: line(10, "InterestExpense") });
    expect(corroborateOperatingIncome(r, r).operatingIncome).toBe(210);
  });

  it.each([250, 400])("uses a complete operating/nonoperating reconciliation independently of provider %s", vendor => {
    const r = row(vendor, 200);
    r.nonMarginOperatingIncome = vendor;
    r.waccOperatingIncome = 400;
    Object.assign(r.filedIncomeLines!, { OperatingExpenses: line(750, "OperatingExpenses"), NonoperatingIncomeExpense: line(-50, "NonoperatingIncomeExpense") });
    const out = corroborateOperatingIncome(r, r);
    expect(out.operatingIncome).toBe(250);
    expect(operatingIncomeForNonMargins(out)).toBe(250);
    expect(out.waccOperatingIncome).not.toBe(400);
  });

  it("uses signed net nonoperating interest once in a complete gross-profit bridge, excluding its gross-income child and cash-paid shortcut",()=>{
    const r=row(400,310);
    Object.assign(r.filedIncomeLines!,{GrossProfit:line(600,"GrossProfit"),SellingGeneralAndAdministrativeExpense:line(300,"SellingGeneralAndAdministrativeExpense"),
      InterestIncomeExpenseNonoperatingNet:line(5,"InterestIncomeExpenseNonoperatingNet"),InvestmentIncomeInterest:line(28,"InvestmentIncomeInterest"),
      InterestPaidNet:line(33,"InterestPaidNet"),OtherNonoperatingIncomeExpense:line(5,"OtherNonoperatingIncomeExpense")});
    const out=corroborateOperatingIncome(r,r);
    expect(out.operatingIncome).toBe(300);
    expect(operatingIncomeForNonMargins(out)).toBe(300);
    expect(out.fieldProvenance?.operatingIncome?.tags).toContain("us-gaap/InterestIncomeExpenseNonoperatingNet");
    expect(out.fieldProvenance?.operatingIncome?.tags).not.toContain("us-gaap/InvestmentIncomeInterest");
    expect(out.fieldProvenance?.operatingIncome?.tags).not.toContain("us-gaap/InterestPaidNet");
  });

  it("does not require a provider numerator when the complete independent bridge establishes it",()=>{
    const r=row(400,200); r.operatingIncome=undefined;
    Object.assign(r.filedIncomeLines!,{OperatingExpenses:line(750,"OperatingExpenses"),NonoperatingIncomeExpense:line(-50,"NonoperatingIncomeExpense")});
    expect(corroborateOperatingIncome(r,r).operatingIncome).toBe(250);
  });

  it.each(["missing pretax", "mixed filing", "mixed currency", "overlapping expenses"])("does not invent complete proof from %s", defect => {
    const r = row(400, 200);
    Object.assign(r.filedIncomeLines!, { OperatingExpenses: line(750, "OperatingExpenses"), NonoperatingIncomeExpense: line(-50, "NonoperatingIncomeExpense") });
    if (defect === "missing pretax") { delete r.incomeBeforeTax; delete r.fieldProvenance!.incomeBeforeTax; delete r.filedIncomeLines![pretaxTag]; }
    if (defect === "mixed filing") r.filedIncomeLines!.NonoperatingIncomeExpense!.proof.filings = [{ accn: "other", filed: "2026-02-02", form: "10-K" }];
    if (defect === "mixed currency") r.filedIncomeLines!.NonoperatingIncomeExpense!.proof.unit = "EUR";
    if (defect === "overlapping expenses") {
      delete r.filedIncomeLines!.OperatingExpenses;
      Object.assign(r.filedIncomeLines!, { CostOfRevenue: line(400, "CostOfRevenue"), CostOfGoodsAndServicesSold: line(350, "CostOfGoodsAndServicesSold") });
    }
    expect(corroborateOperatingIncome(r, r).operatingIncome).toBeUndefined();
  });
});
