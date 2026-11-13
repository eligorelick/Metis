/**
 * D-248 (P5, P10): one test of "is the split between the parent's holders and
 * outside (noncontrolling) holders unresolved on this balance?".
 *
 * Two copies answered it: the DCF bridge-row choice and the DCF gate's input
 * in src/pipeline/compute.ts, and the multiples, own-history, cash-ownership
 * and DCF gates in src/pipeline/stageB/valuation.ts. They used two different
 * floating-point allowances, so they disagreed about whether consolidated and
 * parent equity "differ". Both now read `noncontrollingOwnershipUnresolved`
 * in the P5 owner (src/pipeline/stageB/ownership.ts) and its one allowance.
 *
 * Shapes covered: the reviewed disagreement (a five-unit difference on ten
 * billion), its mirror (a sub-unit difference on a smaller balance), the
 * compatible control (equal figures, and a filed NCI), and unrelated shapes
 * (a consolidated total with no parent line; a parent line alone).
 */
import { describe, expect, it } from "vitest";

import { dcfBridgeRow, runStageB } from "@/pipeline/compute";
import { EQUITY_SAME_AMOUNT_ALLOWANCE, noncontrollingOwnershipUnresolved, sameEquityAmount } from "@/pipeline/stageB/ownership";
import { currencyBundle } from "./helpers/currencyBundle";

const BIG = 10_000_000_000;

describe("D-248: the ownership owner's one predicate and one allowance", () => {
  it("names the allowance: one currency unit, or one part in ten billion of consolidated equity", () => {
    expect(EQUITY_SAME_AMOUNT_ALLOWANCE).toEqual({ absolute: 1, relative: 1e-10 });
    expect(sameEquityAmount(BIG, BIG)).toBe(true);
    expect(sameEquityAmount(BIG, BIG - 1)).toBe(true);
    expect(sameEquityAmount(BIG, BIG - 5)).toBe(false);
    expect(sameEquityAmount(500_000_000, 499_999_999.4)).toBe(true);
    expect(sameEquityAmount(500_000_000, 499_999_998)).toBe(false);
    // Not a materiality allowance: one reporting unit of a filer stating thousands is a difference.
    expect(sameEquityAmount(BIG, BIG - 1_000)).toBe(false);
  });

  it.each([
    // [case, balance, unresolved]
    ["NCI is filed (a number, including zero): the split is known", { totalEquity: 130, totalStockholdersEquity: 100, minorityInterest: 30 }, false],
    ["NCI filed as zero beside a consolidated-only basis", { totalEquity: 130, minorityInterest: 0, equityOwnershipBasis: "consolidated" as const }, false],
    ["consolidated total with no parent line and no NCI", { totalEquity: 130 }, true],
    ["consolidated-only basis, whatever numbers survive", { totalEquity: 130, totalStockholdersEquity: 130, equityOwnershipBasis: "consolidated" as const }, true],
    ["consolidated-only basis with the stand-in in the parent field only", { totalStockholdersEquity: 130, equityOwnershipBasis: "consolidated" as const }, true],
    ["consolidated-only basis with no surviving number", { equityOwnershipBasis: "consolidated" as const }, true],
    ["parent line alone: nothing shows outside holders", { totalStockholdersEquity: 100 }, false],
    ["no equity at all", {}, false],
    ["consolidated equals parent: no outside holders", { totalEquity: 130, totalStockholdersEquity: 130, equityOwnershipBasis: "parent" as const }, false],
    ["consolidated differs from parent and NCI is not filed", { totalEquity: 130, totalStockholdersEquity: 100 }, true],
    ["the reviewed disagreement: ten billion against five units less", { totalEquity: BIG, totalStockholdersEquity: BIG - 5 }, true],
    ["its mirror: a sub-unit difference is not a filed difference", { totalEquity: 500_000_000, totalStockholdersEquity: 499_999_999.4 }, false],
  ] as const)("%s", (_name, balance, unresolved) => {
    expect(noncontrollingOwnershipUnresolved(balance)).toBe(unresolved);
  });

  it("a missing balance is not unresolved, and a non-finite figure is a missing one", () => {
    expect(noncontrollingOwnershipUnresolved(null)).toBe(false);
    expect(noncontrollingOwnershipUnresolved(undefined)).toBe(false);
    expect(noncontrollingOwnershipUnresolved({ totalEquity: Number.NaN, totalStockholdersEquity: 100 })).toBe(false);
    expect(noncontrollingOwnershipUnresolved({ totalEquity: 130, totalStockholdersEquity: 100, minorityInterest: Number.NaN })).toBe(true);
  });
});

/** The compute.ts site: the DCF bridge-row choice refuses an anchor whose ownership is unresolved. */
function bridgeRowRefusal(equity: { totalEquity?: number; totalStockholdersEquity?: number; minorityInterest?: number }): string | null {
  const row = { date: "2025-12-31", totalDebt: 100, cashAndShortTermInvestments: 50, ...equity };
  const out = dcfBridgeRow("2025-12-31", "annual", [], [row], { row, basis: "annual" });
  return out.cause === "anchor-refused" ? out.detail : null;
}

/** The valuation.ts sites: the multiples' EV gate and the DCF gate on the same balance. */
function valuationGates(equity: { totalEquity: number; totalStockholdersEquity: number | undefined; minorityInterest: number | undefined }) {
  const bundle = currencyBundle();
  for (const result of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
    if (result.ok) for (const row of result.value.data.rows) Object.assign(row, equity);
  }
  const gaps = runStageB(bundle).valuation.gaps.map((g) => g.field);
  return {
    multiples: gaps.includes("valuation.multiples.enterpriseValue.noncontrollingOwnership"),
    dcf: gaps.includes("valuation.dcf.noncontrollingOwnership"),
  };
}

describe("D-248: compute.ts and valuation.ts give one answer for one balance", () => {
  it.each([
    ["the reviewed disagreement (compute said resolved, valuation said unknown)", { totalEquity: BIG, totalStockholdersEquity: BIG - 5, minorityInterest: undefined }, true],
    ["its mirror (compute said unresolved, valuation said resolved)", { totalEquity: 500_000_000, totalStockholdersEquity: 499_999_999.4, minorityInterest: undefined }, false],
    ["compatible control: equal consolidated and parent equity", { totalEquity: BIG, totalStockholdersEquity: BIG, minorityInterest: undefined }, false],
    ["compatible control: a real difference with no NCI filed", { totalEquity: 130_000_000, totalStockholdersEquity: 100_000_000, minorityInterest: undefined }, true],
    ["unrelated shape: the difference is the filed NCI", { totalEquity: 130_000_000, totalStockholdersEquity: 100_000_000, minorityInterest: 30_000_000 }, false],
    ["unrelated shape: a consolidated total with no parent line", { totalEquity: 130_000_000, totalStockholdersEquity: undefined, minorityInterest: undefined }, true],
  ] as const)("%s", (_name, equity, unresolved) => {
    expect(bridgeRowRefusal(equity) === "noncontrolling ownership unresolved" || bridgeRowRefusal(equity) === "consolidated equity with no filed parent/NCI split").toBe(unresolved);
    expect(valuationGates(equity)).toEqual({ multiples: unresolved, dcf: unresolved });
  });
});
