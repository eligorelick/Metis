import { describe, expect, it } from "vitest";
import { computeRoic, type ReturnsBalanceRow } from "@/pipeline/stageB/returns";
import { computeAccruals, classifyAccrualBand, type ForensicsIncomeRow } from "@/pipeline/stageB/forensics";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import { cashFlowBridge } from "@/pipeline/stageB/currentCapital";

const income = [{ date: "2025-12-31", operatingIncome: 1871, incomeBeforeTax: 1591, incomeTaxExpense: 290 }];
const balance = (date: string, parent: number, nci: number, cash = 0): ReturnsBalanceRow => ({
  date, totalDebt: 1000, totalStockholdersEquity: parent, minorityInterest: nci,
  cashAndShortTermInvestments: cash,
} as ReturnsBalanceRow);

describe("consolidated operating returns", () => {
  it("matches consolidated NOPAT to beginning and ending capital including NCI", () => {
    const result = computeRoic([...income, { ...income[0], date: "2024-12-31" }], [balance("2025-12-31", 1526, 1262), balance("2024-12-31", 1526, 1243)]);
    expect(result.series.at(-1)?.investedCapitalAvg).toBe(3778.5);
    expect(result.latestRoicPct).toBeCloseTo(1871 * (1 - 290 / 1591) / 3778.5 * 100, 8);
  });
  it("uses already consolidated equity once and supports negative parent capital", () => {
    const row = { ...balance("2025-12-31", 1209, 1262, 7127), totalDebt: 5459, totalEquity: 2471 };
    const result = computeRoic(income, [row]);
    expect(result.series[0].investedCapitalAvg).toBe(803);
    expect(result.latestRoicPct).not.toBeNull();
  });
  it("preserves ordinary issuer results and withholds nonpositive consolidated capital", () => {
    expect(computeRoic(income, [balance("2025-12-31", 1526, 0)]).series[0].investedCapitalAvg).toBe(2526);
    expect(computeRoic(income, [balance("2025-12-31", -1100, 0)]).latestRoicPct).toBeNull();
  });
});

describe("earnings ownership scope", () => {
  it("does not call large negative operating accruals positive earnings-inflation risk", () => {
    expect(classifyAccrualBand(-0.8)).toBe("unremarkable");
    expect(classifyAccrualBand(0.8)).toBe("red");
  });
  it("labels the SBC deduction as the cash-flow add-back proxy, retaining consolidated FCF", () => {
    const bridge = cashFlowBridge({ date: "2025-12-31", operatingCashFlow: 1000, capitalExpenditure: -100, stockBasedCompensation: 40 });
    expect(bridge.afterSbcStandardizedFcf).toBe(860);
    expect(bridge.definition).toMatch(/expensed or amortized/);
    expect(bridge.definition).toMatch(/consolidated/);
  });
  it("uses explicitly consolidated earnings with consolidated cash flows for accruals", () => {
    const current = { income: { date: "2026-06-30", netIncome: 878, netIncomeConsolidated: 875 } as ForensicsIncomeRow,
      cashFlow: { date: "2026-06-30", netIncome: 878, netCashProvidedByOperatingActivities: 1000 },
      balance: { date: "2026-06-30", totalAssets: 2000 } };
    const result = computeAccruals(current, { balance: { date: "2025-06-30", totalAssets: 2000 } });
    expect(result.operatingAccruals).toBe(-125);
  });

  it("preserves parent and consolidated filed earnings without an equity-method plug", () => {
    const fy = (val: number, instant = false) => ({ units: { USD: [{ val, end: "2025-12-31",
      ...(instant ? {} : { start: "2025-01-01" }), filed: "2026-02-01", form: "10-K", fp: "FY", fy: 2025, accn: "0000000001-26-000001" }] } });
    const facts = { cik: 1, entityName: "Ordinary issuer", facts: { "us-gaap": {
      Revenues: fy(5000), Assets: fy(2000, true), NetIncomeLoss: fy(878), ProfitLoss: fy(875),
      NetIncomeLossAttributableToNoncontrollingInterest: fy(-3), IncomeTaxExpenseBenefit: fy(152),
      IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: fy(1027),
      NetCashProvidedByUsedInOperatingActivities: fy(1000),
    } } } as unknown as CompanyFacts;
    const result = buildStatementsFromCompanyFacts(facts, { symbol: "TEST", cik: "0000000001", asOf: "2026-10-16", annualPeriods: 2, quarterlyPeriods: 4,
      vendorSplits: { status: "retrieved", source: "test", events: [], coverage: [{ from: "2020-01-01", to: "2026-10-16" }] } });
    expect(result.incomeAnnual.rows[0]).toMatchObject({ netIncome: 878, netIncomeConsolidated: 875,
      netIncomeAttributableToNoncontrollingInterest: -3, incomeBeforeTax: 1027, incomeTaxExpense: 152 });
    expect(result.cashflowAnnual.rows[0].netIncome).toBe(875);
    expect(result.incomeAnnual.rows[0].equityMethodIncomeLoss).toBeNull();
  });
});

describe("lease liability completeness", () => {
  it.each(["Operating", "Finance"].flatMap(prefix => ["Current", "Noncurrent"].map(part => ({ prefix, part }))))("does not publish a $prefix $part-only lease component as the full liability or complete debt", ({ prefix, part }) => {
    const point = (val: number) => ({ val, end: "2025-12-31", filed: "2026-02-01", form: "10-K", fp: "FY", fy: 2025, accn: "0000000001-26-000001" });
    const facts = { cik: 1, entityName: "Ordinary issuer", facts: { "us-gaap": Object.fromEntries(Object.entries({
      Assets: 2000, LongTermDebtNoncurrent: 100, [`${prefix}LeaseLiability${part}`]: 30,
    }).map(([tag, val]) => [tag, { units: { USD: [point(val)] } }])) } } as unknown as CompanyFacts;
    const result = buildStatementsFromCompanyFacts(facts, { symbol: "TEST", cik: "0000000001", asOf: "2026-10-16", annualPeriods: 2, quarterlyPeriods: 4,
      vendorSplits: { status: "retrieved", source: "test", events: [], coverage: [{ from: "2020-01-01", to: "2026-10-16" }] } });
    expect(result.balanceAnnual.rows[0].capitalLeaseObligations).toBeNull();
    expect(result.balanceAnnual.rows[0].totalDebt).toBeNull();
    expect(result.balanceAnnual.withheld).toContainEqual(expect.objectContaining({ field: "totalDebt", text: expect.stringMatching(/lease.*incomplete/i) }));
  });
  it("retains a complete tagged finance total even when only its current portion is also tagged", () => {
    const point = (val: number) => ({ val, end: "2025-12-31", filed: "2026-02-01", form: "10-K", fp: "FY", fy: 2025, accn: "0000000001-26-000001" });
    const facts = { cik: 1, entityName: "Ordinary issuer", facts: { "us-gaap": Object.fromEntries(Object.entries({
      Assets: 2000, LongTermDebtNoncurrent: 100, CapitalLeaseObligations: 50, FinanceLeaseLiabilityCurrent: 10,
    }).map(([tag, val]) => [tag, { units: { USD: [point(val)] } }])) } } as unknown as CompanyFacts;
    const result = buildStatementsFromCompanyFacts(facts, { symbol: "TEST", cik: "0000000001", asOf: "2026-10-16", annualPeriods: 2, quarterlyPeriods: 4,
      vendorSplits: { status: "retrieved", source: "test", events: [], coverage: [{ from: "2020-01-01", to: "2026-10-16" }] } });
    expect(result.balanceAnnual.rows[0].totalDebt).toBe(150);
  });
});
