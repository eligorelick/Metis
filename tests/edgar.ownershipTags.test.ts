import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";

const consolidatedTag = "NetIncomeLossIncludingPortionAttributableToNonredeemableNoncontrollingInterest";
const nciTag = "NonredeemableNoncontrollingInterest";
const options = { symbol: "TEST", cik: "0000000001", asOf: "2026-10-16", annualPeriods: 2, quarterlyPeriods: 4,
  vendorSplits: { status: "retrieved" as const, source: "test", events: [], coverage: [{ from: "2020-01-01", to: "2026-10-16" }] } };
function facts(primary = false, parentEquity = true): CompanyFacts {
  const concept = (value: number, instant = false) => ({ units: { USD: [
    { val: value, ...(instant ? {} : { start: "2025-01-01" }), end: "2025-12-31", filed: "2026-02-01", form: "10-K", fp: "FY", fy: 2025, accn: "0000000001-26-000001" },
    { val: value, ...(instant ? {} : { start: "2026-04-01" }), end: "2026-06-30", filed: "2026-08-06", form: "10-Q", fp: "Q2", fy: 2026, accn: "0000000001-26-000053" },
  ] } });
  return { cik: 1, entityName: "Ordinary issuer", facts: { "us-gaap": {
    Revenues: concept(5000), Assets: concept(2000, true), NetIncomeLoss: concept(878),
    [consolidatedTag]: concept(primary ? 999 : 875), ...(primary ? { ProfitLoss: concept(875) } : {}),
    NetIncomeLossAttributableToNoncontrollingInterest: concept(-3), IncomeTaxExpenseBenefit: concept(152),
    IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: concept(1027),
    NetCashProvidedByUsedInOperatingActivities: concept(1000), [nciTag]: concept(1262, true),
    StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: concept(2471, true),
    ...(parentEquity ? { StockholdersEquity: concept(1209, true) } : {}),
  } } } as unknown as CompanyFacts;
}

describe("standard consolidated earnings and nonredeemable NCI aliases", () => {
  it.each([false, true])("uses consolidated earnings before parent earnings in income and CFS (primary present: %s)", primary => {
    const built = buildStatementsFromCompanyFacts(facts(primary), options);
    const income = built.incomeQuarterly.rows.find(row => row.date === "2026-06-30")!;
    const cash = built.cashflowQuarterly.rows.find(row => row.date === "2026-06-30")!;
    const balance = built.balanceQuarterly.rows.find(row => row.date === "2026-06-30")!;
    expect(income).toMatchObject({ netIncome: 878, netIncomeConsolidated: 875, netIncomeAttributableToNoncontrollingInterest: -3 });
    expect(income.fieldProvenance?.netIncomeConsolidated).toMatchObject({ tags: [`us-gaap/${primary ? "ProfitLoss" : consolidatedTag}`], periodStart: "2026-04-01", periodEnd: "2026-06-30" });
    expect(cash.netIncome).toBe(875);
    expect(balance.minorityInterest).toBe(1262);
    expect(balance.fieldProvenance?.minorityInterest?.tags).toEqual([`us-gaap/${nciTag}`]);
  });
  it("subtracts the NCI alias from consolidated equity when the parent-equity tag is absent", () => {
    const built = buildStatementsFromCompanyFacts(facts(false, false), options);
    expect(built.balanceQuarterly.rows.find(row => row.date === "2026-06-30")).toMatchObject({ totalStockholdersEquity: 1209, totalEquity: 2471, minorityInterest: 1262 });
  });
});
