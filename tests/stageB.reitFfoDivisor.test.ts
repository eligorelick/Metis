/**
 * D-233 (P13, P1, P3, P10): FFO and AFFO are fiscal-year flows, so FFO and
 * AFFO per share divide by the weighted-average diluted share count of that
 * same fiscal year. The latest quarter's count is the divisor of a value per
 * share (the DCF and the excess-return model), never of a flow from another
 * period. With no count for FFO's own fiscal year the per-share figures are
 * withheld with the reason; another period's count is never substituted.
 *
 * Every Realty Income figure below is an SEC XBRL fact (CIK 726728, USD or
 * shares, stated to the thousand):
 * - Form 10-K 0000726728-26-000011, filed 2026-02-25, fiscal year
 *   2025-01-01..2025-12-31: us-gaap:NetIncomeLoss 1,058,590,000;
 *   DepreciationDepletionAndAmortization 2,524,200,000;
 *   GainLossOnSaleOfProperties 177,640,000; ImpairmentOfRealEstate
 *   471,335,000; PaymentsForCapitalImprovements 131,800,000;
 *   WeightedAverageNumberOfSharesOutstandingBasic 907,169,000;
 *   WeightedAverageNumberOfDilutedSharesOutstanding 908,334,000.
 * - Form 10-Q 0000726728-26-000059, filed 2026-11-03, quarter
 *   2026-07-01..2026-09-30: WeightedAverageNumberOfSharesOutstandingBasic
 *   944,261,000; WeightedAverageNumberOfDilutedSharesOutstanding 946,115,000.
 *
 * Hermetic: the synthetic `completeCurrencyBundle`, whose latest fiscal year
 * ends 2025-12-31 as Realty Income's does. Its newest quarter ends 2026-03-31;
 * the Realty Income case puts the filed 2026-09-30 quarter counts on that row,
 * because the rule under test is which row's count divides, not the calendar.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import type { CompanyFacts } from "@/edgar/xbrl";
import { reitValuation } from "@/pipeline/stageB/valuation";
import type { DataBundle } from "@/pipeline/types";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

type Row = Record<string, unknown>;
const rowsOf = (b: DataBundle, key: "incomeQuarterly" | "incomeAnnual" | "cashflowAnnual"): Row[] =>
  (b.statements as unknown as Record<string, { value: { data: { rows: Row[] } } }>)[key]!.value.data.rows;

/** Diluted and basic weighted counts on the latest fiscal year row and on the newest quarter row. */
function withCounts(b: DataBundle, counts: { annual: [number | null, number | null]; quarter: [number, number] }): DataBundle {
  const annual = rowsOf(b, "incomeAnnual")[0]!;
  const quarter = rowsOf(b, "incomeQuarterly")[0]!;
  [annual.weightedAverageShsOut, annual.weightedAverageShsOutDil] = counts.annual;
  [quarter.weightedAverageShsOut, quarter.weightedAverageShsOutDil] = counts.quarter;
  return b;
}

function reitOf(b: DataBundle) {
  const out = runStageB(b);
  if (out.valuation.kind !== "reit") throw new Error(`expected the REIT route, got ${out.valuation.kind}`);
  return { out, reit: out.valuation.reit, gaps: out.valuation.gaps, notes: out.valuation.notes };
}

const O_10K_2025 = { accn: "0000726728-26-000011", filed: "2026-02-25", form: "10-K", fy: 2025, fp: "FY", start: "2025-01-01", end: "2025-12-31" };
const O_FFO = 1_058_590_000 + 2_524_200_000 - 177_640_000 + 471_335_000;
const O_AFFO = O_FFO - 131_800_000;
const O_FY2025 = { basic: 907_169_000, diluted: 908_334_000 };
const O_Q3_2026 = { basic: 944_261_000, diluted: 946_115_000 };

/** Realty Income's fiscal 2025 FFO operands as filed, on a confirmed issuer. */
function realtyIncome(): DataBundle {
  const b = completeCurrencyBundle({ reit: true, debt: 300, symbol: "O" });
  const usd = (val: number) => ({ units: { USD: [{ ...O_10K_2025, val }] } });
  const facts = { cik: 726728, entityName: "Realty Income Corp", facts: { "us-gaap": {
    NetIncomeLoss: usd(1_058_590_000),
    DepreciationDepletionAndAmortization: usd(2_524_200_000),
    GainLossOnSaleOfProperties: usd(177_640_000),
    ImpairmentOfRealEstate: usd(471_335_000),
    PaymentsForCapitalImprovements: usd(131_800_000),
  } } } as unknown as CompanyFacts;
  return withIssuerFacts(withCounts(b, {
    annual: [O_FY2025.basic, O_FY2025.diluted], quarter: [O_Q3_2026.basic, O_Q3_2026.diluted],
  }), facts);
}

describe("D-233: FFO and AFFO per share divide by the count of FFO's own fiscal year", () => {
  it("root cause: a fiscal-year FFO is not divided by the latest quarter's count", () => {
    // Fixture FFO = net income 150 M + D&A 50 M = 200 M for fiscal 2025; AFFO = 200 M - capex 40 M = 160 M.
    const { reit } = reitOf(withCounts(completeCurrencyBundle({ reit: true, debt: 300 }), {
      annual: [99 * M, 100 * M], quarter: [103 * M, 104 * M],
    }));
    expect(reit.asOf).toBe("2025-12-31");
    expect(reit.ffoPerShare).toBe((200 * M) / (100 * M));
    expect(reit.affoPerShare).toBe((160 * M) / (100 * M));
    expect(reit.ffoPerShare).not.toBeCloseTo((200 * M) / (104 * M), 6);
    expect(reit.notes.some((n) => /fiscal year ending 2025-12-31 \(100000000 shares\)/.test(n))).toBe(true);
  });

  it("Realty Income: fiscal 2025 FFO and AFFO over the filed fiscal 2025 diluted count 908,334,000", () => {
    const { reit, gaps } = reitOf(realtyIncome());
    expect(O_FFO).toBe(3_876_485_000);
    expect(O_AFFO).toBe(3_744_685_000);
    expect(reit.ffoPerShare).toBe(O_FFO / O_FY2025.diluted);
    expect(reit.affoPerShare).toBe(O_AFFO / O_FY2025.diluted);
    expect(reit.ffoPerShare).toBeCloseTo(4.267687, 6);
    expect(reit.affoPerShare).toBeCloseTo(4.122586, 6);
    // The value before D-233: the same FFO over the quarter 2026-07-01..2026-09-30 count.
    expect(reit.ffoPerShare).not.toBeCloseTo(O_FFO / O_Q3_2026.diluted, 6);
    expect(reit.notes.some((n) => /fiscal year ending 2025-12-31 \(908334000 shares\)/.test(n))).toBe(true);
    expect(gaps.some((g) => g.field === "valuation.reit.perShareDivisor")).toBe(false);
  });

  it("control: with the same count on both rows every value is what it was", () => {
    const { reit, gaps } = reitOf(completeCurrencyBundle({ reit: true, debt: 300 }));
    expect(reit.ffoPerShare).toBe(2);
    expect(reit.affoPerShare).toBe(1.6);
    expect(reit.pToFfo).toBe(50);
    expect(gaps.some((g) => g.field === "valuation.reit.perShareDivisor")).toBe(false);
  });

  it("control: P/FFO and P/AFFO price on the market cap and do not move with the divisor", () => {
    const same = reitOf(completeCurrencyBundle({ reit: true, debt: 300 })).reit;
    const moved = reitOf(withCounts(completeCurrencyBundle({ reit: true, debt: 300 }), {
      annual: [99 * M, 100 * M], quarter: [103 * M, 104 * M],
    })).reit;
    expect(moved.pToFfo).toBe(same.pToFfo);
    expect(moved.pToAffo).toBe(same.pToAffo);
  });

  it("no fiscal-year count: the per-share figures are withheld with the reason, never divided by the quarter's count", () => {
    const { reit, gaps } = reitOf(withCounts(completeCurrencyBundle({ reit: true, debt: 300 }), {
      annual: [null, null], quarter: [103 * M, 104 * M],
    }));
    expect(reit.ffoPerShare).toBeNull();
    expect(reit.affoPerShare).toBeNull();
    // P/FFO needs no share count and stands.
    expect(reit.pToFfo).toBe(50);
    const gap = gaps.find((g) => g.field === "valuation.reit.perShareDivisor");
    expect(gap?.severity).toBe("warn");
    expect(gap?.reason).toMatch(/fiscal year ending 2025-12-31/);
    expect(gap?.reason).toMatch(/no weighted-average diluted share count/);
  });

  it("a loss fiscal year takes its own basic count plus the newest profitable period's award dilution (FIN-404)", () => {
    const b = withCounts(completeCurrencyBundle({ reit: true, debt: 300 }), { annual: [98.5 * M, 98.5 * M], quarter: [99 * M, 100 * M] });
    for (const r of rowsOf(b, "incomeQuarterly")) r.weightedAverageShsOut = 99 * M;
    const annual = rowsOf(b, "incomeAnnual")[0]!;
    annual.netIncome = -40 * M;
    annual.epsDiluted = -0.41;
    const { reit, gaps, notes } = reitOf(b);
    // FFO = -40 M + D&A 50 M = 10 M, over 98.5 M basic + 1 M award dilution of the newest profitable quarter.
    expect(reit.ffoPerShare).toBe((10 * M) / (99.5 * M));
    const gap = gaps.find((g) => g.field === "valuation.perShare.lossPeriodDivisor");
    expect(gap?.reason).toMatch(/^The 2025-12-31 period is a loss/);
    expect(notes.some((n) => n === gap?.reason)).toBe(true);
  });

  it("unrelated shape: a value per share (the DCF) still divides by the latest quarter's count", () => {
    const out = runStageB(withCounts(completeCurrencyBundle({ debt: 300 }), { annual: [99 * M, 100 * M], quarter: [103 * M, 104 * M] }));
    if (out.valuation.kind !== "dcf") throw new Error(`expected the DCF route, got ${out.valuation.kind}`);
    expect(out.valuation.dcf?.bridge.dilutedShares).toBe(104 * M);
  });

  it("unrelated shape: a bank's excess-return value per share still divides by the latest quarter's count", () => {
    const out = runStageB(withCounts(completeCurrencyBundle({ bank: true }), { annual: [99 * M, 100 * M], quarter: [103 * M, 104 * M] }));
    if (out.valuation.kind !== "excess-return") throw new Error(`expected the excess-return route, got ${out.valuation.kind}`);
    expect(out.valuation.excessReturn.scenarioEvidence?.dilutedShares).toBe(104 * M);
  });
});

describe("D-233: the REIT block", () => {
  const base = { ffoApprox: 400, affoApprox: 300, sharePrice: 10, marketCap: 1_000, shares: 100 };

  it("names the period of the count it divides by", () => {
    const r = reitValuation({ ...base, sharesPeriodEnd: "2025-12-31" });
    expect(r.ffoPerShare).toBe(4);
    expect(r.notes.some((n) => /FFO and AFFO per share divide by the weighted-average diluted share count of FFO's own period, the fiscal year ending 2025-12-31 \(100 shares\)/.test(n))).toBe(true);
  });

  it("withholds both per-share figures with a warn gap when no same-period count is established", () => {
    const r = reitValuation({ ...base, shares: null, sharesPeriodEnd: "2025-12-31", sharesWithheldReason: "the fiscal year ending 2025-12-31 carries no weighted-average diluted share count" });
    expect(r.ffoPerShare).toBeNull();
    expect(r.affoPerShare).toBeNull();
    expect(r.pToFfo).toBe(2.5);
    expect(r.gaps.find((g) => g.field === "valuation.reit.perShareDivisor")).toMatchObject({ severity: "warn" });
  });

  it("control: a caller that states no period gets the value and no period note", () => {
    const r = reitValuation(base);
    expect(r.ffoPerShare).toBe(4);
    expect(r.notes.some((n) => /per share divide by/.test(n))).toBe(false);
    expect(r.gaps.some((g) => g.field === "valuation.reit.perShareDivisor")).toBe(false);
  });
});
