import { describe, expect, it } from "vitest";
import { computeCapital } from "@/pipeline/stageB/capital";
import { attachCurrentCapital, cashFlowBridge, debtBridge } from "@/pipeline/stageB/currentCapital";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const annual = () => computeCapital([{ date: "2025-12-31", revenue: 100, operatingIncome: 40, netIncome: 30, interestExpense: 1 }], [{ date: "2025-12-31", operatingCashFlow: 50, capitalExpenditure: -10, depreciationAndAmortization: 5, stockBasedCompensation: 5 }], [{ date: "2025-12-31", totalDebt: 20, cashAndShortTermInvestments: 15 }], [], { price: null });
const income = { date: "2026-06-30", revenue: 120, operatingIncome: 30, netIncome: 20, interestExpense: 2 };
const cash = { date: "2026-06-30", operatingCashFlow: 40, capitalExpenditure: -25, depreciationAndAmortization: 6, stockBasedCompensation: 9, financeLeasePrincipalPayments: 3, issuerFreeCashFlow: 12, issuerFreeCashFlowDefinition: "Issuer cash definition includes finance-lease principal" };
// The lease total shows the operating lease inside total debt (audit 2026-10-19 CODE-1).
const balance = { date: "2026-06-30", totalDebt: 30, cashAndShortTermInvestments: 15, operatingLeaseLiability: 10, capitalLeaseObligations: 10 };

describe("capital grading snapshot", () => {
  it("uses complete current TTM flows and same-period balance without replacing annual history", () => {
    const old = annual();
    const result = attachCurrentCapital(old, { income, cashFlow: cash, balance, currency: "USD" });
    expect(result.current).toMatchObject({ basis: "ttm", asOf: "2026-06-30", periodStart: "2025-07-01", interestCoverage: 15, fcfConversionBeforeSbc: 0.75, sbcPctOfFcf: 60 });
    expect(result.current?.netDebtToEbitda).toBeCloseTo(15/36);
    expect(result.fcf.series).toEqual(old.fcf.series);
  });

  it("explicitly falls back when the complete current flow window is unavailable", () => {
    const result = attachCurrentCapital(annual(), { income, cashFlow: null, balance, currency: "USD" });
    expect(result.current?.basis).toBe("annual");
    expect(result.current?.fallbackReason).toMatch(/complete.*TTM/i);
    expect(result.current?.asOf).toBe("2025-12-31");
  });

  it("does not fall back a missing current metric to a favorable annual value", () => {
    const result = attachCurrentCapital(annual(), { income: { ...income, interestExpense: null }, cashFlow: cash, balance, currency: "USD" });
    expect(result.current?.basis).toBe("ttm");
    expect(result.current?.interestCoverage).toBeNull();
  });

  it("reconciles standardized, issuer and economic FCF plus operating-lease debt", () => {
    const result = attachCurrentCapital(annual(), { income, cashFlow: cash, balance, currency: "USD" });
    expect(result.current?.cashBridge).toMatchObject({ standardizedFcf: 15, financeLeasePrincipalPayments: 3, issuerFcf: 12, afterSbcStandardizedFcf: 6, afterSbcIssuerFcf: 3 });
    expect(result.current?.debtBridge).toMatchObject({ totalDebtIncludingLeases: 30, operatingLeases: 10, cashAndShortTermInvestments: 15, netDebtIncludingLeases: 15, netDebtExcludingOperatingLeases: 5 });
  });

  it("keeps a leap-day rolling window to twelve calendar months", () => {
    const end = "2028-02-29";
    const result = attachCurrentCapital(annual(), { income: { ...income, date:end }, cashFlow:{...cash,date:end}, balance:{...balance,date:end}, currency:"USD" });
    expect(result.current?.periodStart).toBe("2027-03-01");
  });

  it("preserves the financial-sector suppression through current TTM orchestration", () => {
    const result = runStageB(completeCurrencyBundle({bank:true,debt:300,siblingQuarterCurrencies:["USD","USD","USD","USD"]}), {evIncludeLeases:false});
    expect(result.capital.fcf.latestFcfBeforeSbc).toBeNull();
    expect(result.capital.current).toMatchObject({netDebtToEbitda:null,interestCoverage:null,fcfConversionBeforeSbc:null,sbcPctOfFcf:null});
    expect(result.capital.current?.cashBridge.standardizedFcf).toBeNull();
    expect(result.capital.current?.debtBridge.netDebtIncludingLeases).toBeNull();
  });

  it("does not relabel older annual cash/debt components with the income-statement year", () => {
    const oldCash = {...cash,date:"2024-12-31"}, oldBalance = {...balance,date:"2024-12-31"};
    const latestIncome = {...income,date:"2025-12-31"};
    const mixed = computeCapital([latestIncome], [oldCash], [oldBalance], [], {price:null});
    const result = attachCurrentCapital(mixed,{income:null,cashFlow:null,balance:null,currency:"USD",annualCashFlow:oldCash,annualBalance:oldBalance});
    expect(result.current?.asOf).toBe("2025-12-31");
    expect(result.current?.cashBridge.standardizedFcf).toBeNull();
    expect(result.current?.debtBridge.totalDebtIncludingLeases).toBeNull();
    expect(result.current).toMatchObject({fcfConversionBeforeSbc:null,sbcPctOfFcf:null,netDebtToEbitda:null});
    expect(result.fcf.series).toEqual(mixed.fcf.series);
  });

  it("grades the same standardized FCF convention that its bridge discloses", () => {
    const result = attachCurrentCapital(annual(),{income,cashFlow:{...cash,freeCashFlow:12},balance,currency:"USD"});
    expect(result.current?.cashBridge.standardizedFcf).toBe(15);
    expect(result.current?.fcfConversionBeforeSbc).toBe(0.75);
    expect(result.current?.sbcPctOfFcf).toBe(60);
    expect(result.current?.cashBridge.issuerFcf).toBe(12);
  });

  it.each(["2026-02-30", "2026-02-29", "2026-13-01", "2026-6-30", "2026-06-30T00:00:00Z", ""])("rejects invalid/noncanonical current period %j", date => {
    const result = attachCurrentCapital(annual(), {income:{...income,date},cashFlow:{...cash,date},balance:{...balance,date},currency:"USD"});
    expect(result.current).toMatchObject({basis:"annual",asOf:"2025-12-31",periodStart:"2025-01-01"});
    expect(result.current?.fallbackReason).toMatch(/TTM/);
  });

  it("does not manufacture a rolling start from an invalid legacy annual date", () => {
    const result = attachCurrentCapital({...annual(),asOf:"2026-02-30"},{income:null,cashFlow:null,balance:null,currency:"USD"});
    expect(result.current?.periodStart).toBeNull();
  });

  it.each([null,"2026-03-31","2026-07-06","2026-02-30"])("withholds leverage from absent, stale, future or invalid balance date %j", date => {
    const end = date === "2026-02-30" ? "2026-03-01" : income.date;
    const result = attachCurrentCapital(annual(),{income:{...income,date:end},cashFlow:{...cash,date:end},balance:date ? {...balance,date} : null,currency:"USD"});
    expect(result.current).toMatchObject({basis:"ttm",netDebt:null,netDebtToEbitda:null,interestCoverage:15});
    expect(result.current?.debtBridge.netDebtIncludingLeases).toBeNull();
  });

  it.each(["2026-06-25","2026-07-05"])("retains an explicitly tolerated five-day balance offset %s", date => {
    const result = attachCurrentCapital(annual(),{income,cashFlow:cash,balance:{...balance,date},currency:"USD"});
    expect(result.current?.netDebt).toBe(15);
    expect(result.current?.netDebtToEbitda).toBeCloseTo(15/36);
  });

  it.each([
    {income:null,cashFlow:cash,currency:"USD"},
    {income,cashFlow:{...cash,date:"2026-03-31"},currency:"USD"},
    {income,cashFlow:cash,currency:null},
    {income:{...income,date:"2025-06-30"},cashFlow:{...cash,date:"2025-06-30"},currency:"USD"},
  ])("uses annual fallback for incomplete, mismatched, unknown-currency or older windows", flows => {
    const old = annual();
    const result = attachCurrentCapital(old,{...flows,balance,annualCashFlow:{...cash,date:"2025-12-31"},annualBalance:{...balance,date:"2025-12-31"}});
    expect(result.current).toMatchObject({basis:"annual",asOf:"2025-12-31",periodStart:"2025-01-01"});
    expect(result.current?.cashBridge.standardizedFcf).toBe(15);
    expect(result.current?.fallbackReason).toBeTruthy();
    expect(result.fcf).toEqual(old.fcf);
  });

  it.each(["bank","insurer","reit-mortgage"] as const)("suppresses industrial current and annual metrics for %s", route => {
    const sectorAnnual = computeCapital([income],[cash],[balance],[],{price:null},{route});
    for (const flow of [cash,null]) {
      const result = attachCurrentCapital(sectorAnnual,{income:flow ? income : null,cashFlow:flow,balance,currency:"USD",annualCashFlow:cash,annualBalance:balance,route});
      expect(result.current).toMatchObject({industrialMetricsApplicable:false,netDebt:null,netDebtToEbitda:null,ebitda:null,ebit:null,interestExpense:null,interestCoverage:null,fcfBeforeSbc:null,netIncome:null,fcfConversionBeforeSbc:null,sbcPctOfFcf:null});
      expect(result.current?.cashBridge.standardizedFcf).toBeNull();
      expect(result.current?.debtBridge.totalDebtIncludingLeases).toBeNull();
      expect(result.current?.cashBridge.definition).toMatch(/not applicable/);
    }
  });

  it("retains vendor and issuer FCF separately from the standardized ratio operands", () => {
    const result = attachCurrentCapital(annual(),{income,cashFlow:{...cash,freeCashFlow:800,issuerFreeCashFlow:12},balance,currency:"USD"});
    expect(result.current).toMatchObject({fcfBeforeSbc:15,netIncome:20,fcfConversionBeforeSbc:0.75,sbcPctOfFcf:60});
    expect(result.current?.cashBridge).toMatchObject({standardizedFcf:15,leaseAdjustedFcf:12,issuerFcf:12,afterSbcStandardizedFcf:6,afterSbcIssuerFcf:3});
  });

  it.each([null,Number.NaN,Number.POSITIVE_INFINITY])("does not turn missing/nonfinite OCF or capex %s into vendor FCF", unavailable => {
    for (const missing of [{operatingCashFlow:unavailable},{capitalExpenditure:unavailable}]) {
      const result = attachCurrentCapital(annual(),{income,cashFlow:{...cash,...missing,freeCashFlow:800},balance,currency:"USD"});
      expect(result.current).toMatchObject({fcfBeforeSbc:null,fcfConversionBeforeSbc:null,sbcPctOfFcf:null});
      expect(result.current?.cashBridge).toMatchObject({standardizedFcf:null,afterSbcStandardizedFcf:null,issuerFcf:12});
    }
  });

  it("preserves negative operating cash flow and negative SBC credits without taking magnitudes", () => {
    const result = attachCurrentCapital(annual(),{income,cashFlow:{...cash,operatingCashFlow:-10,stockBasedCompensation:-2},balance,currency:"USD"});
    expect(result.current).toMatchObject({fcfBeforeSbc:-35,fcfConversionBeforeSbc:-1.75,sbcPctOfFcf:null});
    expect(result.current?.cashBridge).toMatchObject({standardizedFcf:-35,leaseAdjustedFcf:-38,afterSbcStandardizedFcf:-33,afterSbcIssuerFcf:14,stockBasedCompensation:-2});
  });

  it("retains true zeros, while missing SBC/principal leave their adjustments unavailable", () => {
    expect(cashFlowBridge({...cash,operatingCashFlow:0,capitalExpenditure:0,stockBasedCompensation:0,financeLeasePrincipalPayments:0})).toMatchObject({standardizedFcf:0,leaseAdjustedFcf:0,afterSbcStandardizedFcf:0});
    expect(cashFlowBridge({...cash,stockBasedCompensation:null,financeLeasePrincipalPayments:null})).toMatchObject({standardizedFcf:15,leaseAdjustedFcf:null,afterSbcStandardizedFcf:null,afterSbcIssuerFcf:null});
    expect(cashFlowBridge({...cash,stockBasedCompensation:-2})).toMatchObject({afterSbcStandardizedFcf:17});
  });

  it.each([-3,Number.NaN,Number.POSITIVE_INFINITY])("does not add an invalid finance-lease principal %s back to FCF", principal => {
    expect(cashFlowBridge({...cash,financeLeasePrincipalPayments:principal})).toMatchObject({standardizedFcf:15,financeLeasePrincipalPayments:null,leaseAdjustedFcf:null});
  });

  it("withholds conversion when income is zero or negative, retaining the raw loss", () => {
    for (const netIncome of [0,-5]) {
      const result = attachCurrentCapital(annual(),{income:{...income,netIncome},cashFlow:cash,balance,currency:"USD"});
      expect(result.current).toMatchObject({netIncome,fcfBeforeSbc:15,fcfConversionBeforeSbc:null});
    }
  });

  it("keeps unknown liquidity unknown and resolves component cash without a vendor net-debt shortcut", () => {
    expect(debtBridge({date:balance.date,totalDebt:30,cashAndCashEquivalents:10,netDebt:1})).toMatchObject({cashAndShortTermInvestments:null,netDebtIncludingLeases:null});
    expect(debtBridge({date:balance.date,totalDebt:30,cashAndCashEquivalents:10,shortTermInvestments:5,netDebt:1,operatingLeaseLiability:2,financeLeaseLiability:4,capitalLeaseObligations:6})).toMatchObject({cashAndShortTermInvestments:15,netDebtIncludingLeases:15,netDebtExcludingOperatingLeases:13,financeLeases:4});
  });

  it.each([
    {cashAndCashEquivalents:20,shortTermInvestments:5,cashAndShortTermInvestments:15},
    {cashAndCashEquivalents:10,shortTermInvestments:20,cashAndShortTermInvestments:15},
  ])("fails closed on contradictory cash totals in both leverage and the disclosure bridge", conflicting => {
    const result = attachCurrentCapital(annual(),{income,cashFlow:cash,balance:{...balance,...conflicting,netDebt:1},currency:"USD"});
    expect(result.current).toMatchObject({netDebt:null,netDebtToEbitda:null});
    expect(result.current?.debtBridge).toMatchObject({netDebtIncludingLeases:null,netDebtExcludingOperatingLeases:null});
  });
});

// AMZN audit 2026-10-20, finding 20 (b): net debt/EBITDA used lease-inclusive
// net debt (AMZN $119.33B, 0.7x) while enterprise value and the DCF bridge
// remove the operating-lease liability ($23.01B). EBITDA is already after
// operating-lease cost, so the ratio now takes the enterprise value's basis.
describe("net debt/EBITDA on the enterprise value's lease basis", () => {
  it("removes the operating-lease liability when enterprise value does, and keeps it when EV keeps it", () => {
    const excluded = attachCurrentCapital(annual(), { income, cashFlow: cash, balance, currency: "USD", evIncludeLeases: false });
    expect(excluded.current).toMatchObject({ netDebt: 5, ebitda: 36 });
    expect(excluded.current?.netDebtToEbitda).toBeCloseTo(5 / 36, 12);
    // The bridge still shows both bases.
    expect(excluded.current?.debtBridge).toMatchObject({ netDebtIncludingLeases: 15, netDebtExcludingOperatingLeases: 5 });
    const included = attachCurrentCapital(annual(), { income, cashFlow: cash, balance, currency: "USD", evIncludeLeases: true });
    expect(included.current?.netDebtToEbitda).toBeCloseTo(15 / 36, 12);
  });

  it("says which basis the annual ratio used", () => {
    const opts = { evIncludeLeases: false };
    const capital = computeCapital([{ ...income, date: "2026-06-30" }], [cash], [balance], [], { price: null }, opts);
    expect(capital.netDebtToEbitda.netDebt).toBe(5);
    expect(capital.netDebtToEbitda.note).toMatch(/^net debt excludes the operating-lease liability 10, as enterprise value does/);
    // An operating lease that total debt is not shown to hold is not removed.
    const unproven = computeCapital([{ ...income, date: "2026-06-30" }], [cash], [{ date: "2026-06-30", totalDebt: 30, cashAndShortTermInvestments: 15, operatingLeaseLiability: 10 }], [], { price: null }, opts);
    expect(unproven.netDebtToEbitda.netDebt).toBe(15);
  });

  it("matches the DCF bridge's net debt in a full Stage B run", () => {
    const bundle = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    for (const result of [bundle.statements.incomeQuarterly, bundle.statements.incomeAnnual]) {
      if (!result.ok) throw new Error("Missing income fixture");
      for (const row of result.value.data.rows) row.interestExpense = 10e6;
    }
    for (const result of [bundle.statements.balanceQuarterly, bundle.statements.balanceAnnual]) {
      if (!result.ok) throw new Error("Missing balance fixture");
      for (const row of result.value.data.rows) Object.assign(row, { totalDebt: 310e6, capitalLeaseObligations: 40e6, operatingLeaseLiability: 40e6 });
    }
    const out = runStageB(bundle, { evIncludeLeases: false });
    if (out.valuation.kind !== "dcf" || out.valuation.dcf === null) throw new Error("expected a DCF");
    expect(out.capital.current?.netDebt).toBeCloseTo(out.valuation.dcf.bridge.netDebt as number, 0);
    expect(out.capital.current?.debtBridge.netDebtExcludingOperatingLeases).toBeCloseTo(out.capital.current?.netDebt as number, 0);
  });
});
