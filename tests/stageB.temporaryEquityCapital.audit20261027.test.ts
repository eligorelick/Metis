/**
 * Audit 2026-10-27 FIN-119-V1: invested capital (ROIC, the DCF's sales-to-capital
 * and the filed A-2 history) is debt + consolidated equity - cash. A claim carried
 * in temporary (mezzanine) equity is financing capital exactly like permanent
 * preferred (decisions D-next, OD-1): when the issuer raises X and holds it as
 * cash, the caption must not move ROIC, sales-to-capital or the DCF enterprise
 * value. Seed: FIN-119-V1.probe.ts (logic only; synthetic fixture, no snapshot read).
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { computeRoic, type ReturnsBalanceRow } from "@/pipeline/stageB/returns";
import { buildDcfAssumptions, type DcfAssumptionInputs } from "@/pipeline/stageB/valuation";

import { M, completeCurrencyBundle } from "./helpers/currencyBundle";

const X = 200 * M;

type Variant = "base" | "permanent" | "redeemablePreferred" | "redeemableNci";

/** The issuer raises X, holds it as cash, and carries it under the variant's caption on every balance row. */
function run(variant: Variant) {
  const bundle = completeCurrencyBundle({ debt: 300 });
  if (variant !== "base") {
    for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
      const member = bundle.statements[key];
      if (!member.ok) throw new Error("fixture has balances");
      for (const row of member.value.data.rows) {
        for (const f of ["cashAndCashEquivalents", "cashAndShortTermInvestments", "totalAssets"] as const) row[f] = (row[f] ?? 0) + X;
        row.netDebt = (row.netDebt ?? 0) - X;
        if (variant === "permanent") {
          row.preferredStock = (row.preferredStock ?? 0) + X;
          row.totalStockholdersEquity = (row.totalStockholdersEquity ?? 0) + X;
          row.totalEquity = (row.totalEquity ?? 0) + X;
        } else {
          Object.assign(row, variant === "redeemablePreferred"
            ? { temporaryEquityAttributableToParent: X }
            : { temporaryEquityAttributableToNoncontrollingInterest: X });
        }
      }
    }
  }
  const out = runStageB(bundle);
  if (out.valuation.kind !== "dcf" || out.valuation.dcf === null || out.valuation.assumptions === null) throw new Error("expected the DCF route");
  return {
    s2c: out.valuation.assumptions.salesToCapital.value,
    s2cBasis: out.valuation.assumptions.salesToCapital.basis,
    roic: out.returns.roic.latestRoicPct,
    roicNotes: out.returns.roic.series.flatMap((y) => y.notes),
    ev: out.valuation.dcf.enterpriseValue,
  };
}

describe("FIN-119-V1: invested capital does not depend on the caption of the same financing", () => {
  const base = run("base");
  const permanent = run("permanent");
  const preferred = run("redeemablePreferred");
  const nci = run("redeemableNci");

  it("control: permanent preferred moves nothing", () => {
    expect(base.s2c).not.toBeNull();
    expect(base.roic).not.toBeNull();
    expect(permanent.s2c).toBeCloseTo(base.s2c, 9);
    expect(permanent.roic as number).toBeCloseTo(base.roic as number, 9);
    expect(permanent.ev).toBeCloseTo(base.ev, 0);
  });

  it("sales-to-capital does not depend on the caption of the same financing", () => {
    expect(preferred.s2c).toBeCloseTo(permanent.s2c, 9);
    expect(nci.s2c).toBeCloseTo(permanent.s2c, 9);
    expect(preferred.s2cBasis).toMatch(/temporaryEquity 200M/); // the basis names the claim
  });

  it("ROIC does not depend on the caption of the same financing", () => {
    expect(preferred.roic as number).toBeCloseTo(permanent.roic as number, 9);
    expect(nci.roic as number).toBeCloseTo(permanent.roic as number, 9);
    expect(preferred.roicNotes.join("\n")).toMatch(/temporary equity/);
  });

  it("DCF EV does not depend on the caption", () => {
    expect(preferred.ev).toBeCloseTo(permanent.ev, 0);
    expect(nci.ev).toBeCloseTo(permanent.ev, 0);
  });
});

describe("FIN-119-V1: ROIC refusals and unknown claims", () => {
  const income = ["2025-12-31", "2024-12-31", "2023-12-31"].map((date) => ({ date, operatingIncome: 50 * M, incomeBeforeTax: 45 * M, incomeTaxExpense: 9 * M }));
  const balance = (date: string, extra: Partial<ReturnsBalanceRow> = {}): ReturnsBalanceRow =>
    ({ date, totalDebt: 200 * M, totalEquity: 500 * M, cashAndShortTermInvestments: 100 * M, cashAndCashEquivalents: 60 * M, ...extra });
  const balances = (latest: Partial<ReturnsBalanceRow> = {}) => [balance("2025-12-31", latest), balance("2024-12-31"), balance("2023-12-31")];
  const refusedTemporary: Partial<ReturnsBalanceRow> = {
    temporaryEquityAttributableToParent: 5 * M,
    fieldConflicts: { temporaryEquityAttributableToParent: { usable: false, reason: "test refusal" } },
  };
  const roicGap = (result: ReturnType<typeof computeRoic>) => result.gaps.find((g) => g.field === "returns.roic");

  it("a refused temporary-equity operand withholds that year's ROIC", () => {
    const result = computeRoic(income, balances(refusedTemporary));
    expect(result.latestRoicPct).toBeNull();
    expect(result.series.at(-1)!.notes.join("\n")).toMatch(/2025-12-31: .*temporary-equity operand refused.*ROIC withheld/);
    expect(roicGap(result)).toMatchObject({ reason: expect.stringMatching(/^ROIC withheld for 1 fiscal year whose debt or capital input was refused: 2025-12-31: temporary-equity operand refused/) });
    // Control: the same series without the refusal computes.
    expect(computeRoic(income, balances()).latestRoicPct).not.toBeNull();
  });

  it("a temporary-equity claim that could not be established keeps ROIC and says so", () => {
    const base = computeRoic(income, balances());
    const unknown = computeRoic(income, balances(), { temporaryEquityUnknownDates: ["2025-12-31"] });
    expect(unknown.latestRoicPct).toBe(base.latestRoicPct);
    expect(unknown.notes.filter((n) => /redeemable claim .* could not be established/.test(n))).toHaveLength(1);
    expect(unknown.notes.find((n) => /could not be established/.test(n))).toContain("2025-12-31");
    // A date that is not a balance date of the series gives no note.
    const elsewhere = computeRoic(income, balances(), { temporaryEquityUnknownDates: ["2026-03-31"] });
    expect(elsewhere.notes.some((n) => /could not be established/.test(n))).toBe(false);
    expect(base.notes.some((n) => /could not be established/.test(n))).toBe(false);
  });

  it("a refused temporary-equity year keeps the ROIC gap at its non-critical severity", () => {
    // The WACC is withheld on that same 2025-12-31 balance by a debt refusal of its own.
    const waccRefusal = { date: "2025-12-31" };
    const result = computeRoic(income, balances(refusedTemporary), { waccRefusal });
    expect(roicGap(result)).toMatchObject({ severity: "warn", reason: expect.stringMatching(/2025-12-31: temporary-equity operand refused/) });
    // Control: the same latest year refused for its total debt on the WACC's balance is critical, as at main.
    const refusedDebt = { totalDebt: null, fieldConflicts: { totalDebt: { usable: false, reason: "incomplete debt carrying value: test refusal" } } };
    expect(roicGap(computeRoic(income, balances(refusedDebt), { waccRefusal }))?.severity).toBe("critical");
  });
});

describe("FIN-119-V1: the DCF's sales-to-capital and its filed history", () => {
  const dates = ["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31"];
  // Flat revenue 1000, so each year's ratio is 1000 / its invested capital.
  const history = dates.map((date) => ({ date, revenue: 1000, operatingIncome: 200, incomeBeforeTax: 180, incomeTaxExpense: 36 }));
  const row = (date: string, equity: number, extra: Record<string, unknown> = {}) =>
    ({ date, basis: "annual" as const, totalDebt: 0, totalStockholdersEquity: equity, cashAndShortTermInvestments: 0, ...extra });
  const inputs = (balance: ReturnType<typeof row>, capitalHistory: ReturnType<typeof row>[]): DcfAssumptionInputs => ({
    revenueCagr3yPct: 10, revenueCagr5yPct: 10, analystEstimates: null, waccPct: 9, riskFreePct: 4.48,
    incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 200, incomeBeforeTax: 180, incomeTaxExpense: 36 },
    incomeHistory: history, balance, capitalHistory, marketCap: 5000,
  });
  const refused = { temporaryEquityAttributableToParent: 5, fieldConflicts: { temporaryEquityAttributableToParent: { usable: false, reason: "test refusal" } } };

  it("adds the claim to the current invested capital and names it", () => {
    const base = buildDcfAssumptions(inputs(row("2025-12-31", 700), []));
    const withClaim = buildDcfAssumptions(inputs(row("2025-12-31", 700, { temporaryEquityAttributableToNoncontrollingInterest: 100 }), []));
    // Invested capital 700 -> 800: sales-to-capital 1000 / 700 -> 1000 / 800, both inside the house range.
    expect(base.assumptions!.salesToCapital.value).toBeCloseTo(1000 / 700, 9);
    expect(withClaim.assumptions!.salesToCapital.value).toBeCloseTo(1000 / 800, 9);
    expect(withClaim.assumptions!.salesToCapital.basis).toMatch(/\+ temporaryEquity 100 \[/);
    expect(base.assumptions!.salesToCapital.basis).not.toMatch(/temporaryEquity/);
  });

  it("a refused operand on the current balance withholds the DCF with a critical gap", () => {
    const built = buildDcfAssumptions(inputs(row("2025-12-31", 700, refused), []));
    expect(built.assumptions).toBeNull();
    // Controller ruling, Task 3, 2026-10-29: a temporary-equity refusal is never critical (the claim exists, only its amount is disputed).
    expect(built.gaps).toContainEqual(expect.objectContaining({ field: "valuation.dcf.salesToCapital", severity: "warn", reason: expect.stringMatching(/temporary-equity operand refused.*2025-12-31.*cannot be built without the claim's amount/) }));
    // Control: missing equity keeps its critical severity, as at main.
    const missing = buildDcfAssumptions(inputs(row("2025-12-31", 700, { totalStockholdersEquity: null }), []));
    expect(missing.assumptions).toBeNull();
    expect(missing.gaps).toContainEqual(expect.objectContaining({ field: "valuation.dcf.salesToCapital", severity: "critical" }));
  });

  it("a refused bridge-row operand adds no critical gap to the run", () => {
    const criticals = (refuse: boolean) => {
      const bundle = completeCurrencyBundle({ debt: 300 });
      for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
        const member = bundle.statements[key];
        if (!member.ok) throw new Error("fixture has balances");
        if (refuse) for (const r of member.value.data.rows) Object.assign(r, { temporaryEquity: 5 * M, fieldConflicts: { temporaryEquity: { usable: false, reason: "two filings disagree" } } });
      }
      return runStageB(bundle).gaps.filter((g) => g.severity === "critical").length;
    };
    expect(criticals(true)).toBe(criticals(false));
  });

  it("the filed history takes each year's claim, and a refused year is left out with a note", () => {
    // The current balance is capital-heavy (raw 0.25x), so the issuer's own history (0.4x over 2500) sets the lower floor.
    const current = row("2025-12-31", 4000);
    const basisOf = (history: ReturnType<typeof row>[]) => String(buildDcfAssumptions(inputs(current, history)).assumptions!.salesToCapital.basis);
    const plain = dates.map((d) => row(d, 2500));
    expect(basisOf(plain)).toMatch(/FY2025-12-31 0\.4000x, FY2024-12-31 0\.4000x, FY2023-12-31 0\.4000x, FY2022-12-31 0\.4000x/);
    // 2024 carries 500 of redeemable NCI: its capital is 3000, ratio 0.3333x.
    const claimed = dates.map((d) => row(d, 2500, d === "2024-12-31" ? { temporaryEquityAttributableToNoncontrollingInterest: 500 } : {}));
    expect(basisOf(claimed)).toMatch(/FY2024-12-31 0\.3333x/);
    // 2024 refused: it is skipped, three years still establish the ratio, and the basis names the year.
    const skipped = dates.map((d) => row(d, 2500, d === "2024-12-31" ? refused : {}));
    expect(basisOf(skipped)).toMatch(/FY2024-12-31 left out: a temporary-equity operand was refused/);
    expect(basisOf(skipped)).not.toMatch(/FY2024-12-31 0\./);
    expect(basisOf(skipped)).toMatch(/median 0\.4000x over 3 fiscal years/);
  });
});
