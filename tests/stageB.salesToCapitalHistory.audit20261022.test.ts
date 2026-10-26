/**
 * Audit 2026-10-22 A-2: the house sales-to-capital floor of 0.5 overrode the
 * issuer's own capital intensity. A regulated utility turns over its capital
 * about a quarter of a time a year (DUK 0.22, NEE 0.16, SO 0.27 from
 * companyfacts), so forecast reinvestment at 0.5 was half what the business
 * has needed, and DUK's DCF doubled to $71.92.
 *
 * The owner's rule: the 0.5 floor applies only when the issuer's own history,
 * at least three fiscal years of filed revenue and invested capital, does not
 * establish a lower ratio; the basis says which.
 */
import { describe, expect, it } from "vitest";

import { buildDcfAssumptions, runDcf, type DcfAssumptionInputs, type DcfBalanceRow } from "@/pipeline/stageB/valuation";

const YEARS = ["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"];
// Invested capital 4000 = debt 3000 + equity 1200 - cash 200.
const capitalRow = (date: string, debt = 3000): DcfBalanceRow => ({
  date, basis: "annual", totalDebt: debt, totalEquity: 1200, totalStockholdersEquity: 1200, cashAndShortTermInvestments: 200, longTermInvestments: 0,
});

function assumptions(history: DcfBalanceRow[] | undefined, years = YEARS) {
  const input: DcfAssumptionInputs = {
    revenueCagr3yPct: 3, revenueCagr5yPct: 3, analystEstimates: null, waccPct: 7, riskFreePct: 4,
    incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 250, incomeBeforeTax: 180, incomeTaxExpense: 36 },
    incomeHistory: years.map((date) => ({ date, revenue: 1000, operatingIncome: 250 })),
    balance: capitalRow("2025-12-31"),
    capitalHistory: history,
    marketCap: 5000,
  };
  const result = buildDcfAssumptions(input);
  if (!result.assumptions) throw Error("valid fixture");
  return { a: result.assumptions, notes: result.notes };
}

describe("A-2: sales-to-capital floor yields to the issuer's own history", () => {
  it("reinvests at the issuer's ratio when five filed years establish 0.25", () => {
    const { a, notes } = assumptions(YEARS.map((d) => capitalRow(d)));
    expect(a.salesToCapital.value).toBeCloseTo(0.25, 12);
    expect(a.salesToCapital.basis).toMatch(/house floor 0\.5 does not apply/);
    expect(a.salesToCapital.basis).toMatch(/median 0\.2500x over 5 fiscal years/);
    expect(a.salesToCapital.basis).toContain("FY2021-12-31 0.2500x");
    expect(notes.join(" ")).not.toMatch(/sales-to-capital clamped/);
    const dcf = runDcf(a, { waccPct: 7, netDebt: 0, dilutedShares: 100 });
    expect(dcf.yearRows[0]!.reinvestment).toBeCloseTo((dcf.yearRows[0]!.revenue - a.startRevenue.value) / 0.25, 9);
  });

  it("floors at the established ratio, not 0.5, when the current year sits below it", () => {
    // History 0.4 (capital 2500); the current balance 4000 gives 0.25.
    const { a, notes } = assumptions(YEARS.slice(1).map((d) => capitalRow(d, 1500)).concat([]), YEARS);
    expect(a.salesToCapital.value).toBeCloseTo(0.4, 12);
    expect(a.salesToCapital.basis).toMatch(/lower floor 0\.4000x.*issuer's own filed history/);
    // The clamp is noted as the house floor's is, naming the floor it applied.
    expect(notes.join(" ")).toMatch(/sales-to-capital clamped 0\.25 -> 0\.4 \(the issuer's filed-history floor/);
  });

  it("keeps the 0.5 house floor with fewer than three filed years, and says why", () => {
    const { a, notes } = assumptions(YEARS.slice(0, 2).map((d) => capitalRow(d)));
    expect(a.salesToCapital.value).toBe(0.5);
    expect(a.salesToCapital.basis).toMatch(/lower floor 0\.5000x/);
    expect(a.salesToCapital.basis).toMatch(/2 fiscal years? of filed revenue and invested capital; three are required/);
    expect(notes.join(" ")).toMatch(/sales-to-capital clamped/);
    expect(assumptions(undefined).a.salesToCapital.value).toBe(0.5);
  });

  it("keeps the 0.5 house floor when the history establishes a ratio at or above it", () => {
    // Capital 1600: history ratio 0.625.
    const { a } = assumptions(YEARS.slice(1).map((d) => capitalRow(d, 600)), YEARS);
    expect(a.salesToCapital.value).toBe(0.5);
    expect(a.salesToCapital.basis).toMatch(/history establishes 0\.6250x, not below the house floor/);
  });

  it("does not let an implausibly low history replace the floor (a scale error repeats every year)", () => {
    // Capital 99,000: history 0.0101, below the 0.1 plausibility bound.
    const { a } = assumptions(YEARS.map((d) => capitalRow(d, 98_000)));
    expect(a.salesToCapital.value).toBe(0.5);
    expect(a.salesToCapital.basis).toMatch(/median 0\.0101x is below 0\.1, the lowest ratio read as the issuer's own/);
  });

  it("counts only years with revenue on the same fiscal date and positive invested capital", () => {
    const rows = [capitalRow("2024-12-31"), capitalRow("2023-12-31"), capitalRow("2022-06-30"), capitalRow("2021-12-31", -2000)];
    const { a } = assumptions(rows);
    expect(a.salesToCapital.value).toBe(0.5);
    expect(a.salesToCapital.basis).toMatch(/2 fiscal years of filed revenue/);
  });
});
