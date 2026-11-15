import { describe, expect, it } from "vitest";
import { computeCapital, type CapitalIncomeRow } from "@/pipeline/stageB/capital";
import { attachCurrentCapital } from "@/pipeline/stageB/currentCapital";
import { admitFiledInterestExpense } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpIncomeStatementRow } from "@/providers/fmp";

// D-282 (P12, P19): EBIT interest coverage carries a typed qualification from
// its exact operands; the value is unchanged.
const income = (operands: CapitalIncomeRow["filedCoverageOperands"], date = "2025-12-31"): CapitalIncomeRow => ({
  date, revenue: 100, operatingIncome: 30, ebit: 30, interestExpense: 1.1, netIncome: 20, ...(operands ? { filedCoverageOperands: operands } : {}),
});
const annual = (row: CapitalIncomeRow) => computeCapital([row], [], [], [], { price: null });

describe("D-282 coverage operand qualification", () => {
  it("qualifies the annual ratio by its unestablished operands and keeps the value", () => {
    const full = annual(income(["ebit", "interestExpense"]));
    expect(full.interestCoverage.value).toBeCloseTo(30 / 1.1, 10);
    expect(full.interestCoverage.unverifiedOperands).toBeUndefined();
    expect(annual(income(["ebit"])).interestCoverage).toMatchObject({ value: full.interestCoverage.value, unverifiedOperands: ["interestExpense"] });
    expect(annual(income(["interestExpense"])).interestCoverage.unverifiedOperands).toEqual(["ebit"]);
    expect(annual(income(undefined)).interestCoverage.unverifiedOperands).toEqual(["ebit", "interestExpense"]);
  });

  it("puts no qualification on a coverage that is not computed", () => {
    const row = { ...income(undefined), interestExpense: 0 };
    expect(annual(row).interestCoverage).toMatchObject({ value: null });
    expect(annual(row).interestCoverage.unverifiedOperands).toBeUndefined();
  });

  it("carries the TTM operands' qualification into the current-capital result", () => {
    const ttm = (operands: CapitalIncomeRow["filedCoverageOperands"]) => attachCurrentCapital(annual(income(["ebit", "interestExpense"], "2025-09-30")), {
      income: { ...income(operands), operatingIncome: 32, ebit: 32 },
      cashFlow: { date: "2025-12-31", operatingCashFlow: 40, capitalExpenditure: -10, netIncome: 20 },
      balance: null, currency: "USD",
    }).current!;
    expect(ttm(["ebit", "interestExpense"])).toMatchObject({ basis: "ttm", interestCoverage: 32 / 1.1 });
    expect(ttm(["ebit", "interestExpense"]).interestCoverageUnverifiedOperands).toBeUndefined();
    expect(ttm(["ebit"])).toMatchObject({ basis: "ttm", interestCoverage: 32 / 1.1, interestCoverageUnverifiedOperands: ["interestExpense"] });
  });

  it("an annual fallback current snapshot keeps the annual qualification", () => {
    const current = attachCurrentCapital(annual(income(["ebit"])), { income: null, cashFlow: null, balance: null, currency: "USD" }).current!;
    expect(current.basis).toBe("annual");
    expect(current.interestCoverageUnverifiedOperands).toEqual(["interestExpense"]);
  });

  it("records the filed evidence a retained vendor interest amount agrees with; a vendor-only amount gets none", () => {
    const observedAt = "2026-02-15T00:00:00Z";
    const point = { start: "2025-01-01", end: "2025-12-31", val: 1_100_000_000, accn: "0000000001-26-000001", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" };
    const facts = (units: Record<string, unknown[]>) => ({ cik: 1, entityName: "Issuer", facts: { "us-gaap": { InterestExpense: { label: "Interest expense", units } } } }) as unknown as CompanyFacts;
    const row = { date: "2025-12-31", periodStart: "2025-01-01", reportedCurrency: "USD", cik: "0000000001", interestExpense: 1_100_000_000 } as FmpIncomeStatementRow;
    const agreed = admitFiledInterestExpense(row, facts({ USD: [point] }), "annual", observedAt).row;
    expect(agreed.interestExpense).toBe(1_100_000_000);
    expect(agreed.fieldProvenance?.interestExpense).toBeUndefined();
    expect(agreed.interestExpenseAgreement).toMatchObject({ source: "edgar", periodEnd: "2025-12-31", unit: "USD" });
    // Control: no filed counterpart leaves the vendor amount unverified, with no evidence.
    expect(admitFiledInterestExpense(row, facts({}), "annual", observedAt).row.interestExpenseAgreement).toBeUndefined();
  });
});
