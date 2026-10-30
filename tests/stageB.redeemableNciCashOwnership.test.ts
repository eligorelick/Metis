/**
 * FIN-119 (replay regression): a redeemable NCI is the same claim as book NCI, so the
 * P/FCF cash-ownership guard gives it the same materiality floor (SNOW-2: combined NCI and
 * NCI income each at most 1% of total equity). Redeemable preferred and a refused operand
 * have no floor, exactly as permanent preferred has none.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const M = 1_000_000;

function build(opts: { bookNci?: number | null; nciIncome?: number | null; redeemableNci?: number; redeemablePreferred?: number; refused?: boolean }) {
  const bundle = completeCurrencyBundle({ debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  const redeemable = (opts.redeemableNci ?? 0) + (opts.redeemablePreferred ?? 0);
  for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
    const statement = bundle.statements[key];
    if (!statement.ok) throw new Error("fixture has balances");
    for (const row of statement.value.data.rows) {
      const fields = row as Record<string, unknown>;
      if (opts.bookNci !== undefined) {
        fields.minorityInterest = opts.bookNci;
        row.totalEquity = (row.totalStockholdersEquity ?? 0) + (opts.bookNci ?? 0);
      }
      if (opts.redeemableNci !== undefined) fields.temporaryEquityAttributableToNoncontrollingInterest = opts.redeemableNci;
      if (opts.redeemablePreferred !== undefined) fields.temporaryEquityAttributableToParent = opts.redeemablePreferred;
      if (opts.refused) {
        fields.temporaryEquity = 1 * M;
        fields.fieldConflicts = { temporaryEquity: { vendorValue: 1 * M, secValue: 0.9 * M, usable: false, reason: "two filings disagree" } };
      }
      row.totalLiabilities = (row.totalLiabilities ?? 0) - redeemable;
    }
  }
  for (const key of ["incomeAnnual", "incomeQuarterly"] as const) {
    const statement = bundle.statements[key];
    if (!statement.ok) throw new Error("fixture has income");
    for (const row of statement.value.data.rows) {
      const income = row as { netIncomeAttributableToNoncontrollingInterest?: number | null };
      if (opts.nciIncome === null) delete income.netIncomeAttributableToNoncontrollingInterest;
      else if (opts.nciIncome !== undefined) income.netIncomeAttributableToNoncontrollingInterest = opts.nciIncome;
    }
  }
  return runStageB(bundle);
}

const priceToFcf = (out: ReturnType<typeof runStageB>) => out.valuation.multiples?.multiples.find((m) => m.key === "priceToFcf")?.current ?? null;
const cashOwnershipGap = (out: ReturnType<typeof runStageB>) => out.gaps.some((gap) => gap.field === "valuation.multiples.priceToFcf.cashOwnership");

// The fixture's consolidated equity is about 503M, so the 1% floor is about 5M.
describe("redeemable NCI takes the book-NCI materiality floor in the P/FCF cash-ownership guard", () => {
  it("publishes P/FCF for a TSLA-shaped row: book NCI and a smaller redeemable NCI together under 1% of equity", () => {
    const out = build({ bookNci: 3 * M, redeemableNci: 1 * M, nciIncome: 100_000 });
    expect(cashOwnershipGap(out)).toBe(false);
    expect(priceToFcf(out)).not.toBeNull();
  });

  it("withholds P/FCF when the combined NCI is above the floor", () => {
    const out = build({ bookNci: 3 * M, redeemableNci: 4 * M, nciIncome: 100_000 });
    expect(cashOwnershipGap(out)).toBe(true);
    expect(priceToFcf(out)).toBeNull();
  });

  it("withholds P/FCF when the NCI income is unknown or material beside a small redeemable NCI", () => {
    expect(cashOwnershipGap(build({ bookNci: 3 * M, redeemableNci: 1 * M, nciIncome: null }))).toBe(true);
    expect(cashOwnershipGap(build({ bookNci: 3 * M, redeemableNci: 1 * M, nciIncome: 40 * M }))).toBe(true);
  });

  // Fix round 1, M-7 (re-pinned): a null book NCI is no claim at main, so the floor applies to the redeemable NCI alone.
  it("beside a null book NCI the floor applies to the redeemable NCI alone", () => {
    expect(cashOwnershipGap(build({ bookNci: null, redeemableNci: 1 * M, nciIncome: 100_000 }))).toBe(false);
    expect(cashOwnershipGap(build({ bookNci: null, redeemableNci: 30 * M, nciIncome: 100_000 }))).toBe(true);
    expect(cashOwnershipGap(build({ bookNci: null, redeemableNci: 1 * M, nciIncome: null }))).toBe(true);
  });

  it("withholds P/FCF for redeemable preferred of any size, with no floor", () => {
    const out = build({ bookNci: 0, redeemablePreferred: 1, nciIncome: 0 });
    expect(cashOwnershipGap(out)).toBe(true);
    expect(priceToFcf(out)).toBeNull();
  });

  it("withholds P/FCF for a refused temporary-equity operand", () => {
    const out = build({ bookNci: 3 * M, nciIncome: 100_000, refused: true });
    expect(cashOwnershipGap(out)).toBe(true);
  });

  it("control: with no redeemable NCI, book NCI under the floor publishes and over the floor withholds, as at main", () => {
    expect(cashOwnershipGap(build({ bookNci: 3 * M, redeemableNci: 0, nciIncome: 100_000 }))).toBe(false);
    expect(cashOwnershipGap(build({ bookNci: 3 * M, nciIncome: 100_000 }))).toBe(false);
    expect(cashOwnershipGap(build({ bookNci: 30 * M, redeemableNci: 0, nciIncome: 100_000 }))).toBe(true);
    expect(cashOwnershipGap(build({ bookNci: 30 * M, nciIncome: 100_000 }))).toBe(true);
  });
});
