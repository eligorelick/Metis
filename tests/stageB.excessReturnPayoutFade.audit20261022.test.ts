/**
 * Audit 2026-10-22 C-10 follow-through (owner decision, D-102): the excess-return
 * payout converges to the payout the continuing value assumes.
 *
 * The continuing value grows residual income at g, which needs book to grow at
 * g: retention g / ROE_T, so payout 1 − g / ROE_T (Damodaran's stable-growth
 * consistency). Holding the three-year average for the whole horizon (PGR 13%)
 * compounded book 6.5x at above-cost returns before the carry applied. The
 * payout now fades linearly from the three-year average in year 1 to that
 * steady state in year N, clamped to 0-100%.
 *
 * Expected values are an independent hand calculation of the model:
 * ROE_t and payout_t on linear paths, excess (ROE_t − CoE) x BV_{t-1}
 * discounted at the cost of equity, BV_t = BV_{t-1}(1 + ROE_t(1 − payout_t)),
 * and CV = carry x BV_N / (CoE − g) discounted N years.
 *
 * Pure and offline.
 */

import { describe, expect, it } from "vitest";

import { excessReturnModel, type DcfRoicYear } from "@/pipeline/stageB/valuation";
import { describeFinancialValuation } from "@/pipeline/stageB/valuationAssumptions";

// Five fiscal years at 18% against a 10% cost of equity: the 4-of-5 rule
// carries half the 8pp median spread, 4pp, so ROE_T = 14%.
const history: DcfRoicYear[] = [2021, 2022, 2023, 2024, 2025].map((y) => ({ date: `${y}-12-31`, roicPct: 18, waccPct: 10 }));

const CARRIED = {
  bookValue: 1_000,
  currentRoePct: 20,
  costOfEquityPct: 10,
  years: 10,
  payoutRatioPct: 20,
  dilutedShares: 100,
  riskFreePct: 4,
  roeHistory: history,
} as const;

describe("C-10 follow-through: the payout fades to the steady state the continuing value assumes", () => {
  it("fades the payout from the three-year average to 1 − g / ROE_T and values the hand-checked case", () => {
    const r = excessReturnModel(CARRIED);
    const a = r.financialAssumptions!;
    expect(a.terminalRoePct).toBeCloseTo(14, 12);
    expect(a.terminalGrowthPct).toBeCloseTo(2.5, 12);
    // Steady state 1 − 2.5 / 14 = 82.142857...%.
    expect(a.steadyStatePayoutPct).toBeCloseTo(82.14285714285714, 10);
    expect(a.payoutPathPct).toHaveLength(10);
    expect(a.payoutPathPct![0]).toBeCloseTo(20, 12);
    expect(a.payoutPathPct![1]).toBeCloseTo(26.904761904761905, 10);
    expect(a.payoutPathPct![9]).toBeCloseTo(82.14285714285714, 10);
    // Hand check: book 1,160 after year 1, 2,284.45 at year 10; value 2,147.59.
    expect(r.bookValuePath[1]).toBeCloseTo(1160, 9);
    expect(r.bookValuePath[10]).toBeCloseTo(2284.4511913679316, 8);
    expect(a.continuingValuePv).toBeCloseTo(469.73590765930896, 8);
    expect(r.equityValue).toBeCloseTo(2147.5876193125946, 8);
    expect(r.perShare).toBeCloseTo(21.475876193125946, 10);
    // Year N's book growth is g: ROE_T x (1 − steady-state payout) = 2.5%.
    expect(r.bookValuePath[10] / r.bookValuePath[9] - 1).toBeCloseTo(0.025, 12);
  });

  it("fades to the cost of equity's steady state when nothing is carried", () => {
    // ROE_T = CoE 10%, g = the 2.5% cap (no risk-free rate): payout 1 − 2.5/10 = 75%.
    const r = excessReturnModel({ bookValue: 1_000, currentRoePct: 15, costOfEquityPct: 10, years: 10, payoutRatioPct: 50, dilutedShares: 100 });
    expect(r.financialAssumptions!.steadyStatePayoutPct).toBeCloseTo(75, 12);
    expect(r.financialAssumptions!.payoutPathPct![9]).toBeCloseTo(75, 12);
    expect(r.equityValue).toBeCloseTo(1208.6211743646027, 8);
  });

  it("clamps the steady state to 0-100%: no payout when the terminal return cannot fund g", () => {
    // A caller terminal ROE of 2% is below g = 2.5%: 1 − 2.5/2 < 0, clamped to 0.
    const low = excessReturnModel({ ...CARRIED, roeHistory: null, analystImpliedRoePct: 2 });
    expect(low.financialAssumptions!.steadyStatePayoutPct).toBe(0);
    expect(low.financialAssumptions!.payoutPathPct![9]).toBe(0);
    const negative = excessReturnModel({ ...CARRIED, roeHistory: null, analystImpliedRoePct: -1 });
    expect(negative.financialAssumptions!.steadyStatePayoutPct).toBe(0);
  });

  it("uses the same payout path in the fiscal-year start, the grid and the reverse solve", () => {
    const r = excessReturnModel({
      ...CARRIED,
      currentRoeBasis: "ttm-common-roe",
      startAlternative: { roePct: 20, basis: "fiscal-year-common-roe", asOf: "2025-12-31", bookValue: 1_000 },
      marketCap: 2147.5876193125946,
    });
    // Same start and book: the fiscal-year alternative equals the headline.
    expect(r.startAlternative!.equityValue).toBeCloseTo(r.equityValue!, 8);
    // The grid's centre cell is the headline.
    expect(r.startCoeGrid!.perShare[1]![1]).toBeCloseTo(r.perShare!, 8);
    // A market cap equal to the value solves back to the 20% start.
    expect(r.reverseSolve.impliedCurrentRoePct).toBeCloseTo(20, 4);
    // A grid column at a lower cost of equity fades to its own steady state:
    // CoE 9% + 4pp = 13%, payout 1 − 2.5/13. Hand value of that cell's equity:
    const ss = (1 - 2.5 / 13) * 100;
    let bv = 1_000;
    let pv = 0;
    for (let t = 1; t <= 10; t++) {
      const f = (t - 1) / 9;
      const roe = 20 + (13 - 20) * f;
      const p = 20 + (ss - 20) * f;
      pv += ((roe - 9) / 100) * bv / Math.pow(1.09, t);
      bv *= 1 + (roe / 100) * (1 - p / 100);
    }
    const cell = (1_000 + pv + (0.04 * bv) / (0.09 - 0.025) / Math.pow(1.09, 10)) / 100;
    expect(r.startCoeGrid!.perShare[1]![0]).toBeCloseTo(cell, 8);
  });

  it("discloses the payout path in the valuation note, the payout basis and the grid", () => {
    const r = excessReturnModel(CARRIED);
    const text = describeFinancialValuation(r.financialAssumptions);
    expect(text).toMatch(/payout fades linearly from 20% in year 1 to 82\.14% in year 10/);
    expect(text).toMatch(/1 − g \/ terminal ROE = 1 − 2\.5% \/ 14%/);
    expect(r.payoutRatioPct.basis).toMatch(/fades linearly to the steady-state 82\.14% by year 10/);
    expect(r.startCoeGrid!.notes.join("; ")).not.toMatch(/throughout/);
    expect(r.startCoeGrid!.notes.join("; ")).toMatch(/payout fades from 20% to each cell's steady state/);
  });
});
