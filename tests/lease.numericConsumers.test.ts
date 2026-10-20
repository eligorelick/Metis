import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { computeRoic } from "@/pipeline/stageB/returns";
import { buildDcfAssumptions, multiplesFramework, valueCompany } from "@/pipeline/stageB/valuation";
import { leaseDebtScopeRefusal, restoreLeaseFinancingProvenance } from "@/pipeline/stageB/leaseScope";
import type { CompanyFacts } from "@/edgar/xbrl";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function operands(date: string, kind: "Operating" | "Finance", complete = false) {
  const provenance = (tags: string[]) => ({ source: "edgar" as const, unit: "USD", periodStart: null, periodEnd: date, observedAt: "2026-10-16T00:00:00Z",
    tags, filings: [{ accn: "0000000001-26-000001", filed: "2026-08-01", form: "10-Q" }] });
  return { date, totalDebt: 310e6, shortTermDebt: 60e6, longTermDebt: 240e6, capitalLeaseObligations: 10e6,
    operatingLeaseLiability: kind === "Operating" ? 10e6 : 0, financeLeaseLiability: kind === "Finance" ? 10e6 : 0,
    fieldProvenance: { shortTermDebt: provenance(["us-gaap/LongTermDebtCurrent"]), longTermDebt: provenance(["us-gaap/LongTermDebtNoncurrent"]),
      capitalLeaseObligations: provenance([`us-gaap/${kind}LeaseLiability${complete ? "" : "Noncurrent"}`]) } };
}
function scenario(kind: "Operating" | "Finance", complete = false) {
  const bundle = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  for (const result of [bundle.statements.incomeQuarterly, bundle.statements.incomeAnnual]) {
    if (!result.ok) throw new Error("Missing income fixture");
    for (const row of result.value.data.rows) row.interestExpense = 10e6;
  }
  for (const result of [bundle.statements.balanceQuarterly, bundle.statements.balanceAnnual]) {
    if (!result.ok) throw new Error("Missing balance fixture");
    for (const row of result.value.data.rows) Object.assign(row, operands(row.date!, kind, complete));
  }
  return bundle;
}
describe("lease scope is an admission rule for numeric consumers", () => {
  it.each(["missing", "date", "currency", "source", "accession", "disjoint-accessions", "tag", "value", "finance", "negative", "nonfinite"])("refuses cancellation without complete financing proof (%s)", mode => {
    const row = operands("2026-06-30", "Operating");
    if (mode === "missing") delete (row.fieldProvenance as Record<string, unknown>).shortTermDebt;
    if (mode === "date") row.fieldProvenance.shortTermDebt.periodEnd = "2025-12-31";
    if (mode === "currency") row.fieldProvenance.shortTermDebt.unit = "EUR";
    if (mode === "source") Object.assign(row.fieldProvenance.shortTermDebt, { source: "vendor" });
    if (mode === "accession") row.fieldProvenance.shortTermDebt.filings[0]!.accn = "other";
    if (mode === "disjoint-accessions") {
      row.fieldProvenance.shortTermDebt.filings = ["A", "B"].map(accn => ({ accn, filed: "2026-08-01", form: "10-Q" }));
      row.fieldProvenance.longTermDebt.filings[0]!.accn = "A";
      row.fieldProvenance.capitalLeaseObligations.filings[0]!.accn = "B";
    }
    if (mode === "tag") row.fieldProvenance.shortTermDebt.tags = ["us-gaap/LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths"];
    if (mode === "value") row.totalDebt += 20;
    if (mode === "finance") row.financeLeaseLiability = 2;
    if (mode === "negative") row.shortTermDebt = -1;
    if (mode === "nonfinite") row.longTermDebt = NaN;
    expect(leaseDebtScopeRefusal(row, false)).toMatch(/unavailable/);
  });
  it.each(["same-filing", "unsourced", "unreconciled"])("keeps a complete finance lease in debt beside a partial operating maturity only when it is proven (%s)", mode => {
    const row = operands("2026-06-30", "Operating");
    const tagged = (tags: string[]) => ({ ...row.fieldProvenance.longTermDebt, tags });
    Object.assign(row, { financeLeaseLiability: 5e6, capitalLeaseObligations: 15e6, totalDebt: 315e6 + (mode === "unreconciled" ? 5e6 : 0) });
    Object.assign(row.fieldProvenance, { operatingLeaseLiability: tagged(["us-gaap/OperatingLeaseLiabilityNoncurrent"]),
      ...(mode === "unsourced" ? {} : { financeLeaseLiability: tagged(["us-gaap/FinanceLeaseLiability"]) }) });
    if (mode === "same-filing") expect(leaseDebtScopeRefusal(row, false)).toBeNull();
    else expect(leaseDebtScopeRefusal(row, false)).toMatch(/unavailable/);
    expect(leaseDebtScopeRefusal(row, true)).toMatch(/unavailable/);
  });
  it.each(["valid", "future", "stale", "currency", "accession", "value", "existing", "unscoped", "ambiguous"])("restores only unchanged financing provenance from exact admitted primary facts (%s)", mode => {
    const row = { ...operands("2026-06-30", "Operating"), reportedCurrency: "USD" };
    row.shortTermDebt = 0; row.totalDebt = row.longTermDebt + row.operatingLeaseLiability;
    if (mode !== "existing") delete (row.fieldProvenance as Record<string, unknown>).shortTermDebt;
    if (mode === "unscoped") row.fieldProvenance.capitalLeaseObligations.tags = ["us-gaap/OperatingLeaseLiability"];
    const point = { val: mode === "value" ? 1 : 0, end: mode === "stale" ? "2026-03-31" : row.date, filed: mode === "future" ? "2027-01-01" : "2026-08-01",
      accn: mode === "accession" ? "other" : "0000000001-26-000001", form: "10-Q", fy: 2026, fp: "Q2" };
    const facts = { cik: 1, entityName: "Issuer", facts: { "us-gaap": { LongTermDebtCurrent: { units: { [mode === "currency" ? "EUR" : "USD"]: mode === "ambiguous" ? [point, { ...point, val: 1 }] : [point] } } } } } as CompanyFacts;
    const restored = restoreLeaseFinancingProvenance(row, facts, "2026-10-16T00:00:00Z");
    if (mode === "valid") {
      expect(restored.fieldProvenance.shortTermDebt?.tags).toEqual(["us-gaap/LongTermDebtCurrent"]);
      expect(leaseDebtScopeRefusal(restored, false)).toBeNull();
      expect(row.fieldProvenance.shortTermDebt).toBeUndefined();
    } else expect(restored).toBe(row);
  });
  it.each([false, true])("withholds finance-incomplete EV, WACC and leverage (include operating leases %s)", include => {
    const result = runStageB(scenario("Finance"), { evIncludeLeases: include });
    expect(result.valuation.multiples?.enterpriseValue.value).toBeNull();
    expect(result.returns.wacc.waccPct).toBeNull();
    expect(result.capital.current?.netDebtToEbitda).toBeNull();
  });
  it("admits proven operating-portion cancellation only on the excluded basis", () => {
    const excluded = runStageB(scenario("Operating"), { evIncludeLeases: false });
    const included = runStageB(scenario("Operating"), { evIncludeLeases: true });
    expect(excluded.valuation.multiples?.enterpriseValue.value).not.toBeNull();
    expect(excluded.valuation.multiples?.enterpriseValue.includingLeases).toBeNull();
    expect(excluded.returns.wacc.waccPct).not.toBeNull();
    expect(included.valuation.multiples?.enterpriseValue.value).toBeNull();
    expect(included.returns.wacc.waccPct).toBeNull();
  });
  it.each(["Operating", "Finance"] as const)("does not revive unsafe current %s debt from complete older annual rows", kind => {
    const bundle = scenario(kind, true);
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("Missing balance fixture");
    const current = bundle.statements.balanceQuarterly.value.data.rows[0]!;
    Object.assign(current, operands(current.date!, kind));
    const result = runStageB(bundle, { evIncludeLeases: true });
    expect(result.returns.wacc.waccPct).toBeNull();
    expect(result.valuation.multiples?.enterpriseValue.value).toBeNull();
  });
  it.each(["Operating", "Finance"] as const)("preserves complete %s totals for both selected EV/WACC policies", kind => {
    for (const include of [false, true]) {
      const result = runStageB(scenario(kind, true), { evIncludeLeases: include });
      expect(result.valuation.multiples?.enterpriseValue.value).not.toBeNull();
      expect(result.returns.wacc.waccPct).not.toBeNull();
      expect(result.capital.current?.netDebtToEbitda).not.toBeNull();
    }
  });
  it("does not treat known incomplete prior capital as genuinely missing and use current-only ROIC", () => {
    const income = [2025, 2024].map(year => ({ date: `${year}-12-31`, revenue: 1000e6, operatingIncome: 200e6, incomeBeforeTax: 180e6, incomeTaxExpense: 36e6 }));
    const balance = income.map((row, index) => ({ ...operands(row.date, "Finance", index === 0), totalStockholdersEquity: 1000e6, cashAndShortTermInvestments: 50e6 }));
    expect(computeRoic(income, balance).latestRoicPct).toBeNull();
  });
  it("blocks a pure valuation caller's unsafe bridge even with a separate complete-looking S2c balance", () => {
    const balance = { ...operands("2025-12-31", "Finance"), totalStockholdersEquity: 700e6, cashAndShortTermInvestments: 150e6,
      goodwill: 0, intangibleAssets: 0, minorityInterest: 0, preferredStock: 0 };
    const result = valueCompany({ base: "general", overlays: [], evidence: { sector: null, industry: null } }, {
      currentPrice: 100, waccPct: 9, netDebt: 160e6, dilutedShares: 100e6, minorityInterest: 0, preferred: 0, excessReturn: null, reit: null,
      leaseLiability: 10e6, operatingLeaseLiability: 0,
      multiples: { quote: { price: 100, marketCap: 8000e6, currency: "USD" }, reportedCurrency: "USD", incomeTtm: null, cashFlowTtm: null, balance },
      dcfInputs: { revenueCagr3yPct: 8, revenueCagr5yPct: 8, analystEstimates: null, waccPct: 9, riskFreePct: 4, marketCap: 8000e6,
        incomeTtm: { date: "2025-12-31", revenue: 1000e6, operatingIncome: 250e6, incomeBeforeTax: 240e6, incomeTaxExpense: 48e6 },
        incomeHistory: [{ date: "2025-12-31", revenue: 1000e6, operatingIncome: 250e6 }],
        balance: { date: "2025-12-31", basis: "annual", totalDebt: 310e6, totalStockholdersEquity: 700e6, cashAndShortTermInvestments: 150e6 } } });
    if (result.kind !== "dcf") throw new Error("Expected general DCF route");
    expect(result.dcf?.perShare ?? null).toBeNull();
    expect(result.gaps.some(g => g.field === "valuation.dcf.netDebt.leaseScope")).toBe(true);
  });
  it("withholds raw-statement EV history when that window's financing leases are incomplete", () => {
    const quarters = Array.from({ length: 12 }, (_, index) => {
      const date = `${2025 - Math.floor(index / 4)}-${["12-31", "09-30", "06-30", "03-31"][index % 4]}`;
      return { ...operands(date, "Finance"), revenue: 100e6, operatingIncome: 20e6, depreciationAndAmortization: 2e6,
        netIncome: 10e6, operatingCashFlow: 15e6, capitalExpenditure: -5e6, totalStockholdersEquity: 700e6, cashAndShortTermInvestments: 50e6, preferredStock: 0, minorityInterest: 0 };
    });
    const result = multiplesFramework("general", { quote: { price: 100, marketCap: 8000e6, currency: "USD" }, reportedCurrency: "USD", incomeTtm: null, cashFlowTtm: null,
      balance: null, quarterlyFundamentals: quarters, enterpriseValuesHistory: quarters.map(row => ({ date: row.date, marketCapitalization: 8000e6, enterpriseValue: 8260e6 })) });
    expect(result.multiples.find(m => m.key === "evToSales")?.ownHistory).toBeNull();
  });
  it.each([{ complete: false, marketHistory: true }, { complete: false, marketHistory: false }, { complete: true, marketHistory: true }])("cannot restore rejected lease-scope windows through vendor EV history (%j)", ({ complete, marketHistory }) => {
    const quarters = Array.from({ length: 12 }, (_, index) => {
      const date = `${2025 - Math.floor(index / 4)}-${["12-31", "09-30", "06-30", "03-31"][index % 4]}`;
      return { ...operands(date, "Finance", complete), revenue: 100e6, operatingIncome: 20e6, depreciationAndAmortization: 2e6,
        netIncome: 10e6, operatingCashFlow: 15e6, capitalExpenditure: -5e6, totalStockholdersEquity: 700e6, cashAndShortTermInvestments: 50e6, preferredStock: 0, minorityInterest: 0 };
    });
    const result = multiplesFramework("general", { quote: { price: 100, marketCap: 8000e6, currency: "USD" }, reportedCurrency: "USD",
      incomeTtm: { date: "2027-06-30", revenue: 400e6, operatingIncome: 80e6, depreciationAndAmortization: 8e6, netIncome: 40e6, epsDiluted: 1 }, cashFlowTtm: null,
      balance: { date: "2027-06-30", totalDebt: 300e6, cashAndShortTermInvestments: 50e6, totalStockholdersEquity: 700e6, goodwill: 0, intangibleAssets: 0, minorityInterest: 0, preferredStock: 0 },
      quarterlyFundamentals: quarters,
      enterpriseValuesHistory: marketHistory ? quarters.map(row => ({ date: row.date, marketCapitalization: 8000e6, enterpriseValue: 8260e6 })) : [],
      keyMetricsHistory: quarters.map((row, index) => ({ date: row.date, evToSales: 10 + index, evToEBITDA: 20 + index, priceToBookRatio: 1 + index })) });
    const multiple = result.multiples.find(m => m.key === "evToSales");
    expect(multiple?.current).not.toBeNull();
    if (complete) expect(multiple?.ownHistory).not.toBeNull();
    else {
      expect(multiple?.ownHistory).toBeNull();
      expect(result.multiples.find(m => m.key === "evToEbitda")?.ownHistory).toBeNull();
      expect(result.multiples.find(m => m.key === "priceToBook")?.ownHistory).not.toBeNull();
      expect(result.gaps.find(g => g.field === "valuation.multiples.ownHistory.evLeaseScope")?.reason).toMatch(/financ|Finance/);
      expect(result.gaps.some(g => /while the current enterprise value removes one/.test(g.reason))).toBe(false);
    }
  });
  it.each(["Operating", "Finance"] as const)("withholds unsafe %s ROIC but preserves complete totals", kind => {
    const income = [2025, 2024].map(year => ({ date: `${year}-12-31`, revenue: 1000e6, operatingIncome: 200e6, incomeBeforeTax: 180e6, incomeTaxExpense: 36e6 }));
    const balances = (complete: boolean) => income.map(row => ({ ...operands(row.date, kind, complete), totalStockholdersEquity: 1000e6, cashAndShortTermInvestments: 50e6 }));
    expect(computeRoic(income, balances(false), { includeOperatingLeases: true }).latestRoicPct).toBeNull();
    expect(computeRoic(income, balances(false), { includeOperatingLeases: false }).latestRoicPct === null).toBe(kind === "Finance");
    expect(computeRoic(income, balances(true), { includeOperatingLeases: true }).latestRoicPct).not.toBeNull();
  });
  // Audit 2026-10-19 FCX-1: only a missing finance maturity withholds the
  // DCF; a proven operating portion moves invested capital to the excluded basis.
  it.each(["Finance"] as const)("withholds the raw lease-inclusive S2c input for incomplete %s leases", kind => {
    const result = buildDcfAssumptions({ revenueCagr3yPct: 8, revenueCagr5yPct: 8, analystEstimates: null, waccPct: 10, riskFreePct: 4, marketCap: 20e9,
      incomeTtm: { date: "2026-03-31", revenue: 1000e6, operatingIncome: 200e6, incomeBeforeTax: 180e6, incomeTaxExpense: 36e6 },
      incomeHistory: [2023, 2024, 2025].map(y => ({ date: `${y}-12-31`, revenue: 900e6, operatingIncome: 180e6, incomeBeforeTax: 160e6, incomeTaxExpense: 32e6 })),
      balance: { ...operands("2026-03-31", kind), basis: "quarter", totalStockholdersEquity: 1000e6, cashAndShortTermInvestments: 50e6 } });
    expect(result.assumptions).toBeNull();
    expect(result.gaps.find(gap => gap.field === "valuation.dcf.salesToCapital")?.reason).toMatch(/lease.*unverified|unverified.*lease/i);
  });
});

// AMZN audit 2026-10-20 (finding 5): a P/E on earnings that non-operating
// gains inflated is flagged, so the grade does not rank it and the report
// caveats it.
describe("P/E on gain-inflated earnings", () => {
  const run = (incomeBeforeTax: number) => multiplesFramework("general", { quote: { price: 100, marketCap: 8000e6, currency: "USD" }, reportedCurrency: "USD",
    incomeTtm: { date: "2027-06-30", revenue: 400e6, operatingIncome: 80e6, incomeBeforeTax, depreciationAndAmortization: 8e6, netIncome: 40e6, epsDiluted: 1 }, cashFlowTtm: null,
    balance: null, quarterlyFundamentals: [] });
  it("flags the P/E when non-operating income exceeds 25% of pre-tax income", () => {
    const flagged = run(150e6).multiples.find((m) => m.key === "peTtm");
    expect(flagged?.gainInflatedEarnings?.nonOperatingSharePct).toBeCloseTo(46.67, 2);
    expect(flagged?.gainInflatedEarnings?.basis).toMatch(/non-operating income .* 46\.67% of pre-tax income/);
    expect(run(100e6).multiples.find((m) => m.key === "peTtm")?.gainInflatedEarnings).toBeUndefined();
  });
});
