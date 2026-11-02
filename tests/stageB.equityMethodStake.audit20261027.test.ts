import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { computeDcfDisplay } from "@/pipeline/stageB/fairValue";
import { M, completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

function run(placement: "in-operating-income" | "below-operating-income" | "undetermined" | "unmeasured" | "none", zero = false, mixed = false, other = 0) {
  const bundle = completeCurrencyBundle({ debt: 300 });
  for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
    const member = bundle.statements[key];
    if (!member.ok) throw new Error("fixture balance");
    for (const row of member.value.data.rows) {
      row.longTermInvestments = placement === "none" ? 0 : (300 + other) * M;
      row.fieldProvenance = { ...row.fieldProvenance, longTermInvestments: { source: "edgar", unit: "USD", periodStart: null,
        periodEnd: String(row.date), observedAt: bundle.builtAt, tags: [other > 0 ? "us-gaap/OtherLongTermInvestments" : "us-gaap/EquityMethodInvestments"], filings: [] } };
    }
  }
  if (other > 0) withIssuerFacts(bundle, { cik: 42, entityName: "Test", facts: { "us-gaap": { EquityMethodInvestments: {
    units: { USD: ["2026-03-31", "2025-12-31"].map(end => ({ end, val: 300 * M, form: "10-Q", filed: "2026-04-30", accn: "test", fy: 2026, fp: "Q1" })) },
  } } } } as never);
  for (const key of ["incomeAnnual", "incomeQuarterly"] as const) {
    const member = bundle.statements[key];
    if (!member.ok) throw new Error("fixture income");
    member.value.data.rows.forEach((row, index) => {
      row.equityMethodIncomeLoss = key === "incomeAnnual" ? 20 * M : zero && index === 0 ? 0 : 5 * M;
      if (placement !== "none") (row as Record<string, unknown>).equityMethodIncomePlacement = {
        placement: mixed && index === 1 ? "undetermined" : zero && index === 0 && key === "incomeQuarterly" ? "immaterial"
          : placement === "unmeasured" ? "in-operating-income" : placement,
        income: placement === "unmeasured" ? null : row.equityMethodIncomeLoss, basis: "test arithmetic",
      };
    });
  }
  const result = runStageB(bundle);
  const valuation = result.valuation;
  if (valuation.kind !== "dcf" || valuation.dcf === null || valuation.assumptions === null) throw new Error("fixture DCF");
  return { valuation, dcf: valuation.dcf, assumptions: valuation.assumptions };
}

describe("FIN-401 / FIN-401-V1: a stake and its income are on the same side", () => {
  it("keeps an unmeasured inside income and its stake in operating capital", () => {
    const actual = run("unmeasured");
    const control = run("none");
    expect(actual.dcf.perShare).not.toBeNull();
    expect(actual.dcf.perShare).toBeCloseTo(control.dcf.perShare!, 9);
    expect((actual.dcf.bridge.nonOperatingComponents ?? []).filter(c => c.kind === "long-term-investments")).toHaveLength(0);
    expect(actual.assumptions.salesToCapital.basis).toMatch(/equity-method.*operating capital/i);
    expect(actual.valuation.notes.join(" ")).not.toMatch(/sit below operating income, so the FCFF path does not value them/);
  });
  it("keeps only the same-date equity-method portion operating when LTI also holds other investments", () => {
    const actual = run("unmeasured", false, false, 200);
    const components = actual.dcf.bridge.nonOperatingComponents ?? [];
    const lti = components.find(c => c.kind === "long-term-investments");
    expect(lti?.value).toBe(200 * M);
    expect(lti?.basis).toMatch(/remaining non-operating investments 200M/);
    expect(components.find(c => c.kind === "investment-tax")?.value).toBe(-42 * M);
  });
  it.each([false, true])("removes measured income from the EBIT seed and adds the stake back once (zero %s)", zero => {
    const actual = run("in-operating-income", zero);
    expect(actual.assumptions.ebitMarginPath.basis).toMatch(new RegExp(`equity-method income ${zero ? 15 : 20}M .*taken out`));
    expect(actual.dcf.bridge.nonOperatingComponents?.filter(c => c.kind === "long-term-investments")).toMatchObject([{ value: 300 * M }]);
    expect(actual.valuation.notes.join(" ")).not.toMatch(/sit below operating income, so the FCFF path does not value them/);
    const display = computeDcfDisplay(actual.valuation, "USD");
    expect(display.bridge?.equityValue).toBe(actual.dcf.equityValue);
    expect(display.bridge?.nonOperatingComponents?.filter(c => c.label.startsWith("long-term investments"))).toMatchObject([{ value: 300 * M }]);
    expect(display.assumptions.find(row => row.name.startsWith("EBIT margin"))?.basis).toContain(actual.assumptions.ebitMarginPath.basis);
  });
  it("keeps the old seed for an ambiguous or mixed window and calls the default an assumption", () => {
    const below = run("below-operating-income");
    for (const actual of [run("undetermined"), run("in-operating-income", false, true)]) {
      expect(actual.dcf.perShare).toBeCloseTo(below.dcf.perShare!, 9);
      expect(actual.valuation.notes.join(" ")).toMatch(/assumed below operating income .*Regulation S-X Rule 5-03/);
    }
  });
});
