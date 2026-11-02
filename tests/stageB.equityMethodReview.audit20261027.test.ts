import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { M, completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

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

describe("FIN-401 review: an income subtraction requires a located stake", () => {
  it.each([null, 0, 300 * M])("R-2: keeps measured inside income when the located stake is zero (LTI %s)", lti => {
    const bundle = stakeBundle();
    for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
      const member = bundle.statements[key];
      if (!member.ok) throw new Error("fixture balance");
      for (const row of member.value.data.rows) {
        row.longTermInvestments = lti;
        row.fieldProvenance!.longTermInvestments!.tags = ["us-gaap/LongTermInvestments"];
      }
    }
    for (const key of ["incomeAnnual", "incomeQuarterly"] as const) {
      const member = bundle.statements[key];
      if (!member.ok) throw new Error("fixture income");
      for (const row of member.value.data.rows) row.equityMethodIncomePlacement = {
        placement: "in-operating-income", income: key === "incomeAnnual" ? 20 * M : 5 * M, basis: "measured inside income",
      };
    }
    const control = structuredClone(bundle);
    for (const key of ["incomeAnnual", "incomeQuarterly"] as const) {
      const member = control.statements[key];
      if (!member.ok) throw new Error("fixture income");
      for (const row of member.value.data.rows) delete row.equityMethodIncomePlacement;
    }
    const actual = value(bundle);
    expect(actual.assumptions.ebitMarginPath.value).toEqual(Array(10).fill(20));
    expect(actual.dcf.perShare).toBeCloseTo(value(control).dcf.perShare!, 9);
    expect(actual.assumptions.ebitMarginPath.basis).toMatch(/income stays in EBIT.*stake could not be located/i);
    expect(actual.assumptions.ebitMarginPath.basis).not.toMatch(/taken out.*added back/);
    if (lti === null || lti === 0) expect(actual.dcf.bridge.nonOperatingComponents ?? []).not.toContainEqual(expect.objectContaining({ kind: "long-term-investments" }));
  });

  it("R-2: an older annual stake cannot establish the current quarter's located value", () => {
    const bundle = stakeBundle();
    for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
      const member = bundle.statements[key];
      if (!member.ok) throw new Error("fixture balance");
      for (const row of member.value.data.rows) {
        row.reportedCurrency = "USD";
        row.longTermInvestments = key === "balanceAnnual" ? 1048 * M : 1117 * M;
        row.fieldProvenance!.longTermInvestments!.tags = ["us-gaap/LongTermInvestments"];
      }
    }
    for (const key of ["incomeAnnual", "incomeQuarterly"] as const) {
      const member = bundle.statements[key];
      if (!member.ok) throw new Error("fixture income");
      for (const row of member.value.data.rows) row.equityMethodIncomePlacement = {
        placement: "in-operating-income", income: key === "incomeAnnual" ? 20 * M : 5 * M, basis: "measured inside income",
      };
    }
    withIssuerFacts(bundle, { cik: 42, entityName: "Test", facts: { "us-gaap": {
      EquityMethodInvestments: { units: { USD: [{ end: "2025-12-31", val: 997 * M, form: "10-K", filed: "2026-01-30", accn: "prior-year" }] } },
    } } });
    const actual = value(bundle);
    expect(actual.assumptions.salesToCapital.basis).toMatch(/quarter balance as of 2026-03-31/);
    expect(actual.assumptions.ebitMarginPath.value).toEqual(Array(10).fill(20));
    expect(actual.assumptions.ebitMarginPath.basis).toMatch(/stake could not be located/);
    expect(actual.dcf.bridge.nonOperatingComponents?.find(c => c.kind === "long-term-investments")?.value).toBe(1117 * M);
  });

  it("R-4: calls an unlocated unmeasured stake undetermined while retaining the LTI bridge", () => {
    const bundle = stakeBundle();
    for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
      const member = bundle.statements[key];
      if (!member.ok) throw new Error("fixture balance");
      for (const row of member.value.data.rows) row.fieldProvenance!.longTermInvestments!.tags = ["us-gaap/LongTermInvestments"];
    }
    const actual = value(bundle);
    const components = actual.dcf.bridge.nonOperatingComponents ?? [];
    expect(components.find(c => c.kind === "long-term-investments")?.value).toBe(300 * M);
    expect(components.find(c => c.kind === "investment-tax")?.value).toBe(-63 * M);
    expect(actual.valuation.notes.join(" ")).toMatch(/placement is undetermined.*stake could not be located/i);
    expect(actual.valuation.notes.join(" ")).not.toMatch(/equity-method portion 0M stays in operating capital|its stake stays in operating capital and is not added back/);
    expect(actual.assumptions.ebitMarginPath.value?.[0]).toBe(20);
    expect(actual.assumptions.ebitMarginPath.basis).toMatch(/income stays in EBIT.*stake could not be located/i);
  });
});

describe("FIN-401 review: absence of placement evidence preserves the prior note", () => {
  it("R-5: does not label a window with no placements as undetermined", () => {
    const bundle = stakeBundle();
    for (const key of ["incomeAnnual", "incomeQuarterly"] as const) {
      const member = bundle.statements[key];
      if (!member.ok) throw new Error("fixture income");
      for (const row of member.value.data.rows) delete row.equityMethodIncomePlacement;
    }
    const actual = value(bundle);
    const note = actual.valuation.notes.find(n => /DCF equity bridge adds long-term investments/.test(n));
    expect(note).toMatch(/their gains and losses sit below operating income, so the FCFF path does not value them/);
    expect(note).not.toMatch(/placement is undetermined|Regulation S-X Rule 5-03/);

    // An explicitly undetermined placement keeps its disclosed assumption and the same figures.
    for (const key of ["incomeAnnual", "incomeQuarterly"] as const) {
      const member = bundle.statements[key];
      if (!member.ok) throw new Error("fixture income");
      for (const row of member.value.data.rows) row.equityMethodIncomePlacement = {
        placement: "undetermined", income: 5 * M, basis: "ambiguous filed arithmetic",
      };
    }
    const control = value(bundle);
    expect(control.valuation.notes.join(" ")).toMatch(/assumed below operating income .*Regulation S-X Rule 5-03; placement is undetermined/);
    expect(actual.dcf).toEqual(control.dcf);
    expect(actual.result.scores).toEqual(control.result.scores);
  });
});
