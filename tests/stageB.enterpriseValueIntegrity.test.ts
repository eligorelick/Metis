import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { multiplesFramework, type QuarterlyFundamentalsRow } from "@/pipeline/stageB/valuation";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";

function balanceFixture(fields: Record<string, number | null>, reit = false) {
  const bundle = completeCurrencyBundle({
    debt: 100,
    reit,
    siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"],
  });
  for (const member of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
    if (!member.ok) throw new Error("Expected fixture balance rows");
    for (const row of member.value.data.rows) Object.assign(row, fields);
  }
  return bundle;
}

function calculate(fields: Record<string, number | null>, includeLeases = false) {
  const result = runStageB(balanceFixture(fields), { evIncludeLeases: includeLeases });
  if (result.valuation.kind !== "dcf") throw new Error("Expected industrial valuation route");
  return { ...result, valuation: result.valuation };
}

const validCash = { totalDebt: 100 * M, cashAndCashEquivalents: 50 * M,
  shortTermInvestments: 20 * M, cashAndShortTermInvestments: 70 * M };

describe("enterprise-value integrity through Stage B", () => {
  it("withholds EV multiples when combined cash contradicts its components", () => {
    const result = calculate({ ...validCash, cashAndShortTermInvestments: 0 });
    expect(result.capital.current?.netDebt).toBeNull();
    expect(result.valuation.multiples.enterpriseValue.value).toBeNull();
    expect(result.valuation.multiples.multiples.filter(row => row.key.startsWith("evTo"))
      .every(row => row.current === null)).toBe(true);
    expect(result.valuation.multiples.gaps.some(gap => /cash|netDebt/i.test(gap.reason))).toBe(true);
  });

  it("does not lower EV using an invalid negative debt balance", () => {
    const result = calculate({ ...validCash, totalDebt: -100 * M });
    expect(result.valuation.multiples.enterpriseValue.value).toBeNull();
  });

  it.each([
    { name: "consistent cash components", fields: validCash, ev: 10030 * M },
    { name: "component-only cash", fields: { ...validCash, cashAndShortTermInvestments: null }, ev: 10030 * M },
    { name: "genuine zero balances", fields: { totalDebt: 0, cashAndCashEquivalents: 0, shortTermInvestments: 0, cashAndShortTermInvestments: 0 }, ev: 10000 * M },
    // Net cash from more cash, not less debt: 15 of interest on 20 of debt
    // would imply 75% and withhold the debt (audit 2026-10-19, O-2).
    { name: "valid net cash", fields: { ...validCash, cashAndCashEquivalents: 120 * M, shortTermInvestments: 30 * M, cashAndShortTermInvestments: 150 * M }, ev: 9950 * M },
  ])("preserves $name", ({ fields, ev }) => {
    const result = calculate(fields);
    expect(result.valuation.multiples.enterpriseValue.value).toBe(ev);
  });

  it.each([
    { name: "operating lease exceeds total debt", operating: 100 * M, total: 100 * M, finance: null },
    { name: "total leases exceed total debt", operating: 20 * M, total: 100 * M, finance: null },
    { name: "operating lease exceeds total leases", operating: 60 * M, total: 50 * M, finance: null },
    { name: "negative operating lease", operating: -20 * M, total: 30 * M, finance: null },
    { name: "negative total leases", operating: null, total: -30 * M, finance: null },
    { name: "negative finance lease", operating: 20 * M, total: 30 * M, finance: -10 * M },
    { name: "lease slices together exceed debt without a lease total", operating: 60 * M, total: null, finance: 30 * M },
    { name: "lease slices do not reconcile to the lease total", operating: 20 * M, total: 30 * M, finance: 20 * M },
  ])("withholds adjusted bridges when $name", ({ operating, total, finance }) => {
    const result = calculate({ totalDebt: 80 * M, cashAndCashEquivalents: 10 * M,
      shortTermInvestments: 0, cashAndShortTermInvestments: 10 * M,
      operatingLeaseLiability: operating, capitalLeaseObligations: total, financeLeaseLiability: finance });
    expect(result.capital.netDebtToEbitda.netDebt).toBeNull();
    expect(result.capital.netDebtToEbitda.value).toBeNull();
    expect(result.capital.current?.netDebt).toBeNull();
    expect(result.capital.current?.netDebtToEbitda).toBeNull();
    expect(result.capital.current?.debtBridge.netDebtExcludingOperatingLeases).toBeNull();
    expect(result.valuation.multiples.enterpriseValue.value).toBeNull();
    expect(result.valuation.dcf?.perShare ?? null).toBeNull();
    expect(result.returns.roic.latestRoicPct).toBeNull();
    expect(result.returns.roic.series.filter(row => row.date >= "2024-12-31")
      .every(row => row.investedCapitalAvg === null)).toBe(true);
  });

  it("withholds the REIT enterprise value and cap rate when its lease composition is impossible", () => {
    const result = runStageB(balanceFixture({ totalDebt: 80 * M, cashAndCashEquivalents: 10 * M,
      shortTermInvestments: 0, cashAndShortTermInvestments: 10 * M,
      operatingLeaseLiability: 100 * M, capitalLeaseObligations: 100 * M,
      financeLeaseLiability: 0 }, true), { evIncludeLeases: false });
    if (result.valuation.kind !== "reit") throw new Error("Expected equity REIT valuation");
    expect(result.valuation.multiples.enterpriseValue.value).toBeNull();
    expect(result.valuation.reit.enterpriseValue).toBeNull();
    expect(result.valuation.reit.impliedCapRatePct).toBeNull();
    expect(result.valuation.reit.pToFfo).toBe(50);
    expect(result.valuation.gaps.some(gap => gap.field === "valuation.netDebt")).toBe(true);
  });

  it.each([0, 1])("does not replace an invalid WACC debt balance at annual index %s with the other year", invalidIndex => {
    const bundle = balanceFixture({ ...validCash, operatingLeaseLiability: 20 * M,
      capitalLeaseObligations: 30 * M, financeLeaseLiability: 10 * M });
    if (!bundle.statements.balanceAnnual.ok) throw new Error("Expected annual balance rows");
    bundle.statements.balanceAnnual.value.data.rows[invalidIndex]!.operatingLeaseLiability = 120 * M;
    const result = runStageB(bundle, { evIncludeLeases: false });
    expect(result.returns.wacc.waccPct).toBeNull();
    expect(result.returns.wacc.weightDebt).toBeNull();
    expect(result.returns.wacc.debtBasis).toMatch(/lease|composition/i);
  });

  it("preserves explicitly disclosed zero lease balances in the current EV bridge", () => {
    const result = calculate({ ...validCash, capitalLeaseObligations: 0,
      operatingLeaseLiability: 0, financeLeaseLiability: 0 });
    expect(result.valuation.multiples.enterpriseValue).toMatchObject({
      value: 10030 * M, leaseLiability: 0, totalLeaseLiability: 0, financeLeaseLiability: 0,
    });
    expect(result.valuation.multiples.gaps.some(gap => gap.field === "valuation.multiples.enterpriseValue.leases")).toBe(false);
  });

  it.each([
    { capitalLeaseObligations: -30 * M, operatingLeaseLiability: null, financeLeaseLiability: null },
    { capitalLeaseObligations: 30 * M, operatingLeaseLiability: -20 * M, financeLeaseLiability: null },
    { capitalLeaseObligations: 30 * M, operatingLeaseLiability: 20 * M, financeLeaseLiability: -10 * M },
  ])("does not display an invalid negative lease as a positive liability", fields => {
    const result = calculate({ ...validCash, ...fields });
    const bridge = result.valuation.multiples.enterpriseValue;
    if ((fields.capitalLeaseObligations ?? 0) < 0) expect(bridge.totalLeaseLiability).toBeNull();
    if ((fields.operatingLeaseLiability ?? 0) < 0) expect(bridge.leaseLiability).toBeNull();
    expect(bridge.financeLeaseLiability).toBeNull();
  });

  it.each([
    { include: false, ev: 10050 * M, bridge: 50 * M },
    { include: true, ev: 10070 * M, bridge: 70 * M },
  ])("preserves reconciled lease economics with includeLeases=$include", ({ include, ev, bridge }) => {
    const result = calculate({ totalDebt: 80 * M, cashAndCashEquivalents: 10 * M,
      shortTermInvestments: 0, cashAndShortTermInvestments: 10 * M,
      operatingLeaseLiability: 20 * M, capitalLeaseObligations: 30 * M }, include);
    expect(result.valuation.multiples.enterpriseValue.value).toBe(ev);
    expect(result.valuation.dcf).not.toBeNull();
    expect(result.valuation.dcf!.enterpriseValue - result.valuation.dcf!.equityValue!).toBeCloseTo(bridge, 4);
  });
});

describe("historical enterprise-value integrity", () => {
  it.each([
    { currentOperating: 20, historicalOperating: 0, median: 10.3 },
    { currentOperating: 0, historicalOperating: 20, median: 10.1 },
  ])("keeps an explicit zero lease on the same current/history basis: $currentOperating / $historicalOperating", ({ currentOperating, historicalOperating, median }) => {
    const dates = Array.from({ length: 12 }, (_, index) =>
      `${2025 - Math.floor(index / 4)}-${["12-31", "09-30", "06-30", "03-31"][index % 4]}`);
    const result = multiplesFramework("general", {
      quote: { price: 100, marketCap: 1000, currency: "USD" }, reportedCurrency: "USD",
      incomeTtm: { date: dates[0], revenue: 100, operatingIncome: 20,
        depreciationAndAmortization: 4, netIncome: 16, epsDiluted: 4 },
      cashFlowTtm: { date: dates[0], operatingCashFlow: 24, capitalExpenditure: -4, depreciationAndAmortization: 4 },
      balance: { date: dates[0], totalDebt: 100, cashAndShortTermInvestments: 70,
        totalStockholdersEquity: 100, goodwill: 0, intangibleAssets: 0, minorityInterest: 0,
        preferredStock: 0, operatingLeaseLiability: currentOperating },
      quarterlyFundamentals: dates.map(date => ({ date, revenue: 25, operatingIncome: 5,
        depreciationAndAmortization: 1, netIncome: 4, operatingCashFlow: 6, capitalExpenditure: -1,
        totalStockholdersEquity: 100, totalDebt: 100, cashAndShortTermInvestments: 70,
        preferredStock: 0, minorityInterest: 0, operatingLeaseLiability: historicalOperating })),
      enterpriseValuesHistory: dates.map(date => ({ date, marketCapitalization: 1000, enterpriseValue: 1100 })),
    });
    const history = result.multiples.find(row => row.key === "evToSales")?.ownHistory;
    expect(history?.observations).toBe(9);
    expect(history?.p50).toBeCloseTo(median, 9);
    expect(result.gaps.some(gap => gap.field === "valuation.multiples.ownHistory.evLeaseBasis")).toBe(false);
  });

  it("rejects contradictory cash in EV history without discarding valid equity history", () => {
    const dates = Array.from({ length: 12 }, (_, index) =>
      `${2025 - Math.floor(index / 4)}-${["12-31", "09-30", "06-30", "03-31"][index % 4]}`);
    const quarters: QuarterlyFundamentalsRow[] = dates.map(date => ({ date,
      revenue: 25, operatingIncome: 5, depreciationAndAmortization: 1,
      netIncome: 4, operatingCashFlow: 6, capitalExpenditure: -1,
      totalStockholdersEquity: 100, totalDebt: 100,
      cashAndShortTermInvestments: 0, cashAndCashEquivalents: 50,
      shortTermInvestments: 20, preferredStock: 0, minorityInterest: 0,
    }));
    const result = multiplesFramework("general", {
      quote: { price: 100, marketCap: 1000, currency: "USD" }, reportedCurrency: "USD",
      incomeTtm: { date: dates[0], revenue: 100, operatingIncome: 20,
        depreciationAndAmortization: 4, netIncome: 16, epsDiluted: 4 },
      cashFlowTtm: { date: dates[0], operatingCashFlow: 24, capitalExpenditure: -4, depreciationAndAmortization: 4 },
      balance: { date: dates[0], totalDebt: 100, cashAndShortTermInvestments: 70,
        totalStockholdersEquity: 100, goodwill: 0, intangibleAssets: 0, minorityInterest: 0, preferredStock: 0 },
      quarterlyFundamentals: quarters,
      enterpriseValuesHistory: dates.map(date => ({ date, marketCapitalization: 1000, enterpriseValue: 1100 })),
    });
    expect(result.multiples.find(row => row.key === "evToSales")?.ownHistory).toBeNull();
    expect(result.multiples.find(row => row.key === "priceToBook")?.ownHistory?.observations).toBeGreaterThanOrEqual(8);
  });
});
