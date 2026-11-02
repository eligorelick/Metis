import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { M, completeCurrencyBundle } from "./helpers/currencyBundle";

function stakeBundle() {
  const bundle = completeCurrencyBundle({ debt: 300 });
  for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
    const member = bundle.statements[key];
    if (!member.ok) throw new Error("fixture balance");
    for (const row of member.value.data.rows) {
      row.longTermInvestments = 300 * M;
      row.fieldProvenance = { ...row.fieldProvenance, longTermInvestments: {
        source: "edgar", unit: "USD", periodStart: null, periodEnd: String(row.date),
        observedAt: bundle.builtAt, tags: ["us-gaap/EquityMethodInvestments"], filings: [],
      } };
    }
  }
  for (const key of ["incomeAnnual", "incomeQuarterly"] as const) {
    const member = bundle.statements[key];
    if (!member.ok) throw new Error("fixture income");
    for (const row of member.value.data.rows) row.equityMethodIncomePlacement = {
      placement: "in-operating-income", income: null, basis: "unmeasured inside income",
    };
  }
  return bundle;
}

function value(bundle: ReturnType<typeof stakeBundle>) {
  const result = runStageB(bundle);
  const valuation = result.valuation;
  if (valuation.kind !== "dcf" || valuation.dcf === null || valuation.assumptions === null) throw new Error("fixture DCF");
  return { result, valuation, dcf: valuation.dcf, assumptions: valuation.assumptions };
}

describe("FIN-401 review: the window's operating treatment governs every period", () => {
  it("R-1/R-3: keeps five XOM-shaped margin and capital years on one basis", () => {
    const bundle = stakeBundle();
    const annual = bundle.statements.incomeAnnual;
    const balances = bundle.statements.balanceAnnual;
    const quarters = bundle.statements.balanceQuarterly;
    if (!annual.ok || !balances.ok || !quarters.ok) throw new Error("fixture history");
    annual.value.data.rows.push({ ...annual.value.data.rows[3]!, date: "2021-12-31", fiscalYear: "2021", revenue: 600 * M, operatingIncome: 120 * M });
    const template = balances.value.data.rows[0]!;
    balances.value.data.rows = annual.value.data.rows.map((row, index) => {
      // Three older years subtract tagged affiliate income; the two newest years stopped tagging it.
      if (index >= 2) {
        row.operatingIncome = Number(row.revenue) * 0.18;
        row.equityMethodIncomePlacement = { placement: "below-operating-income", income: Number(row.revenue) * 0.02, basis: "derivation subtracted measured income" };
      }
      const equity = Number(row.revenue) / 0.2 - 300 * M + 100 * M;
      return { ...template, date: row.date, totalStockholdersEquity: equity, totalEquity: equity, cashAndShortTermInvestments: 100 * M };
    });
    for (const row of quarters.value.data.rows) {
      row.reportedCurrency = "USD";
      row.totalStockholdersEquity = row.totalEquity = 12_000 * M - 300 * M + 120 * M;
    }
    const actual = value(bundle);
    // All five margins are 20% including the affiliate, and every year's revenue/capital is 0.2x.
    expect.soft(actual.assumptions.ebitMarginPath.value).toEqual(Array(10).fill(20));
    expect.soft(actual.assumptions.ebitMarginPath.basis).toMatch(/stable dated-margin regime \(5y median 20%/);
    expect.soft(actual.assumptions.salesToCapital.value).toBeCloseTo(0.2, 12);
    expect(actual.assumptions.salesToCapital.basis).toMatch(/median 0\.2000x over 5 fiscal years/);
    expect(actual.dcf.bridge.nonOperatingComponents ?? []).not.toContainEqual(expect.objectContaining({ kind: "long-term-investments" }));
  });

  it("R-6: restores each measured below-income quarter in a mixed operating seed", () => {
    const bundle = stakeBundle();
    const quarters = bundle.statements.incomeQuarterly;
    if (!quarters.ok) throw new Error("fixture quarters");
    for (const row of quarters.value.data.rows.slice(1, 4)) {
      row.operatingIncome = 55 * M;
      row.equityMethodIncomePlacement = { placement: "below-operating-income", income: 5 * M, basis: "derivation subtracted measured income" };
    }
    const actual = value(bundle);
    expect(actual.assumptions.ebitMarginPath.value?.[0]).toBeCloseTo(20, 12);
    expect(actual.assumptions.salesToCapital.basis).toMatch(/equity-method.*operating capital/i);
    expect(actual.dcf.bridge.nonOperatingComponents ?? []).not.toContainEqual(expect.objectContaining({ kind: "long-term-investments" }));
  });

  it("R-6 control: leaves measured inside quarters in EBIT under the operating treatment", () => {
    const bundle = stakeBundle();
    const quarters = bundle.statements.incomeQuarterly;
    if (!quarters.ok) throw new Error("fixture quarters");
    for (const row of quarters.value.data.rows.slice(1, 4)) row.equityMethodIncomePlacement = {
      placement: "in-operating-income", income: 5 * M, basis: "filed subtotal includes measured income",
    };
    const actual = value(bundle);
    expect(actual.assumptions.ebitMarginPath.value?.[0]).toBeCloseTo(20, 12);
    expect(actual.dcf.bridge.nonOperatingComponents ?? []).not.toContainEqual(expect.objectContaining({ kind: "long-term-investments" }));
  });
});
