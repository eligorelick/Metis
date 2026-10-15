/**
 * Currency integrity in Stage B.
 *
 *  - A trailing window whose quarters carry no currency label may still be
 *    ESTABLISHED from trustworthy evidence: the balance-sheet and cash-flow
 *    rows of the SAME FILING (a shared SEC acceptance timestamp). Never from
 *    the annual statement, nor from rows that merely share a date. Without
 *    that evidence the window is no sum at all and every consumer uses the
 *    annual statement (see tests/currency.quarterEvidence.test.ts).
 *  - A calculated per-share value is stated in the currency the model actually
 *    ran in — the statements' — never the listing currency by default.
 */
import { describe, expect, it } from "vitest";

import { runStageB, statementCurrencies } from "@/pipeline/compute";

import { M, currencyBundle } from "./helpers/currencyBundle";

const UNLABELLED = [null, null, null, null] as const;

function recentIpo(options: Parameters<typeof currencyBundle>[0] = {}) {
  const bundle = currencyBundle(options);
  for (const key of ["incomeAnnual", "balanceAnnual", "cashflowAnnual"] as const) {
    const member = bundle.statements[key];
    if (member.ok) member.value.data.rows = [];
  }
  for (const key of ["incomeQuarterly", "balanceQuarterly", "cashflowQuarterly"] as const) {
    const member = bundle.statements[key];
    if (member.ok) member.value.data.rows = member.value.data.rows.slice(0, 1);
  }
  return bundle;
}

describe("recent IPO statement currency", () => {
  it("uses the first reported quarter's currency without requiring annual or TTM history", () => {
    const bundle = recentIpo({ profileCurrency: "JPY", siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    expect(statementCurrencies(bundle)).toMatchObject({ trading: "JPY", annual: null, model: "USD", ttmIncomeUsable: false });
    const computed = runStageB(bundle);
    expect(computed.capital.current?.currency).toBe("USD");
    expect(computed.gaps.some((g) => g.field === "compute.balanceQuarterly.currency")).toBe(false);
    expect(computed.gaps.some((g) => g.field === "compute.incomeQuarterly.currency")).toBe(false);
    expect(computed.capital.current?.basis).toBe("annual");
    expect(computed.fairValue.perShare).toBeNull();
  });

  it("can establish the first quarter from a statement of the same filing", () => {
    const bundle = recentIpo({ quarterCurrencies: UNLABELLED, siblingQuarterCurrencies: ["EUR", "EUR", "EUR", "EUR"], filingLinks: "shared" });
    expect(statementCurrencies(bundle).model).toBe("EUR");
  });

  it("keeps the model currency unknown when the quarter has no filing evidence", () => {
    const bundle = recentIpo({ quarterCurrencies: UNLABELLED, siblingQuarterCurrencies: UNLABELLED });
    expect(statementCurrencies(bundle).model).toBeNull();
    expect(runStageB(bundle).capital.current?.currency).toBeNull();
  });

  it("rejects conflicting currencies in the same filing", () => {
    const bundle = recentIpo({ siblingQuarterCurrencies: ["EUR", "EUR", "EUR", "EUR"], filingLinks: "shared" });
    expect(statementCurrencies(bundle).model).toBeNull();
    expect(runStageB(bundle).capital.current?.currency).toBeNull();
  });
});

function dcfOf(computed: ReturnType<typeof runStageB>) {
  if (computed.valuation.kind !== "dcf") throw new Error(`expected the DCF route, got ${computed.valuation.kind}`);
  return computed.valuation;
}

function perShareUnit(computed: ReturnType<typeof runStageB>): string | null {
  return computed.fairValue.perShare?.unit ?? null;
}

describe("TTM window currency evidence", () => {
  it("control: four USD-labelled quarters anchor the DCF on TTM revenue, in USD", () => {
    const computed = runStageB(currencyBundle());
    expect(dcfOf(computed).assumptions?.startRevenue.value).toBe(1200 * M);
    expect(dcfOf(computed).assumptions?.startRevenue.basis).toMatch(/^TTM revenue/);
    expect(perShareUnit(computed)).toBe("USD/share");
    expect(computed.gaps.some((g) => g.field === "compute.ttmIncome.currency")).toBe(false);
  });

  it("establishes an unlabelled window from the same filing's balance-sheet and cash-flow rows", () => {
    const computed = runStageB(
      currencyBundle({ quarterCurrencies: UNLABELLED, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"], filingLinks: "shared" }),
    );
    expect(dcfOf(computed).assumptions?.startRevenue.basis).toMatch(/^TTM revenue/);
    // The pre-revenue threshold is in USD, so its decision needs a proven currency.
    expect(computed.route.gaps.some((g) => g.field === "route.overlays.preRevenue.currency")).toBe(false);
    expect(computed.gaps.some((g) => g.field === "compute.ttmIncome.currency")).toBe(false);
  });

  it("withholds the TTM from currency-dependent calculations when nothing establishes its currency", () => {
    // Annual rows are USD, but that says nothing about the quarters.
    const computed = runStageB(currencyBundle({ quarterCurrencies: UNLABELLED, siblingQuarterCurrencies: UNLABELLED }));
    const gap = computed.gaps.find((g) => g.field === "compute.ttmIncome.currency");
    expect(gap?.reason).toMatch(/could not be established/);
    expect(gap?.reason).toMatch(/annual/);
    expect(dcfOf(computed).assumptions?.startRevenue.value).toBe(1000 * M);
    expect(dcfOf(computed).assumptions?.startRevenue.basis).toMatch(/^latest annual FY 2025-12-31 revenue/);
    // Not a sum at all: routing reads the annual statement too. (Until
    // 2026-09-29 routing still read the unestablished window.)
    expect(computed.route.asOf.incomeTtm).toBeNull();
    // The model ran on the annual USD statements.
    expect(perShareUnit(computed)).toBe("USD/share");
  });

  it("withholds a TTM window labelled in a different currency from the annual statement", () => {
    const computed = runStageB(currencyBundle({ quarterCurrencies: ["TWD", "TWD", "TWD", "TWD"] }));
    expect(computed.gaps.find((g) => g.field === "compute.ttmIncome.currency")?.reason).toMatch(/TWD/);
    expect(dcfOf(computed).assumptions?.startRevenue.basis).toMatch(/^latest annual FY/);
  });
});

describe("model currency of calculated per-share values", () => {
  it("does not borrow the listing currency when the statements carry none", () => {
    // No statement row establishes a currency, so nothing that combines
    // statements or years is computed — and nothing is stated in the
    // listing's USD. (Until 2026-09-30 the DCF ran and was labelled
    // "per share (currency unknown)".)
    const computed = runStageB(
      currencyBundle({ debt: 0, profileCurrency: "USD", annualCurrency: null, quarterCurrencies: UNLABELLED }),
    );
    expect(computed.fairValue.perShare).toBeNull();
    expect(computed.gaps.find((g) => g.field === "compute.incomeAnnual.currency")?.reason).toMatch(/not established/);
    for (const series of computed.projections.series) {
      if (series.metric === "revenue" || series.metric === "fcf") expect(series.unit).not.toMatch(/USD/);
    }
  });

  it("states an explicit non-USD model currency", () => {
    const computed = runStageB(currencyBundle({ profileCurrency: "JPY", annualCurrency: "JPY" }));
    expect(perShareUnit(computed)).toBe("JPY/share");
  });

  it("states the statements' currency when the listing currency is unknown", () => {
    const computed = runStageB(currencyBundle({ debt: 0, profileCurrency: null, annualCurrency: "EUR" }));
    expect(perShareUnit(computed)).toBe("EUR/share");
  });
});
