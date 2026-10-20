/**
 * Audit SNOW-2: a parent-common P/FCF is withheld for outside ownership only
 * when the known noncontrolling interest is material to consolidated equity.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function withNci(nci: number, noncontrollingIncome = 0) {
  const bundle = completeCurrencyBundle({ debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
    const statement = bundle.statements[key];
    if (!statement.ok) throw new Error("fixture has balances");
    for (const row of statement.value.data.rows) {
      row.minorityInterest = nci;
      row.totalEquity = (row.totalStockholdersEquity ?? 0) + nci;
    }
  }
  for (const key of ["incomeAnnual", "incomeQuarterly"] as const) {
    const statement = bundle.statements[key];
    if (!statement.ok) throw new Error("fixture has income");
    for (const row of statement.value.data.rows) (row as { netIncomeAttributableToNoncontrollingInterest?: number }).netIncomeAttributableToNoncontrollingInterest = noncontrollingIncome;
  }
  return runStageB(bundle);
}

const priceToFcf = (out: ReturnType<typeof runStageB>) => out.valuation.multiples?.multiples.find((m) => m.key === "priceToFcf")?.current ?? null;
const cashOwnershipGap = (out: ReturnType<typeof runStageB>) => out.gaps.some((gap) => gap.field === "valuation.multiples.priceToFcf.cashOwnership");

describe("NCI materiality for parent-common P/FCF (audit SNOW-2)", () => {
  it("keeps P/FCF when NCI is at most 1% of consolidated equity", () => {
    const out = withNci(3e6, 100_000); // 0.6% of 503M
    expect(cashOwnershipGap(out)).toBe(false);
    expect(priceToFcf(out)).not.toBeNull();
  });

  it("withholds P/FCF when the NCI share of earnings is material, even at a zero balance", () => {
    const out = withNci(0, 40e6); // a stake bought out before the balance date
    expect(cashOwnershipGap(out)).toBe(true);
    expect(priceToFcf(out)).toBeNull();
  });

  it("still withholds P/FCF for material NCI", () => {
    const out = withNci(7e6); // 1.4% of 507M
    expect(cashOwnershipGap(out)).toBe(true);
    expect(priceToFcf(out)).toBeNull();
  });
});

describe("METHODOLOGY states the NCI rules the code applies (audit DOC-1)", () => {
  const doc = readFileSync(path.join(process.cwd(), "docs", "METHODOLOGY.md"), "utf8").replace(/\s+/g, " ");

  it("says unknown NCI withholds rather than counting as zero, and that the bridge uses book NCI", () => {
    expect(doc).not.toMatch(/undisclosed means zero/);
    expect(doc).toContain("Minority interest is not zero-filled.");
    expect(doc).toContain("EV, the EV multiples and the DCF's per-share equity bridge are then withheld.");
    expect(doc).toContain("Minority interest enters both at its book carrying amount");
  });

  it("states the 1% materiality floor the code uses", () => {
    const valuation = readFileSync(path.join(process.cwd(), "src", "pipeline", "stageB", "valuation.ts"), "utf8");
    expect(valuation).toMatch(/IMMATERIAL_NCI_SHARE_OF_EQUITY = 0\.01;/);
    expect(doc).toContain("exceeds 1% of consolidated equity");
  });
});
