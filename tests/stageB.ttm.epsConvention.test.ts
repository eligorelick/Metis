import { describe, expect, it } from "vitest";
import { ttmIncome } from "@/pipeline/compute";
import { multiplesFramework, type MultiplesIncomeTtm } from "@/pipeline/stageB/valuation";
import type { FmpIncomeStatementRow } from "@/providers/fmp";
import type { ManifestEntry } from "@/types/core";

const dates = ["2025-12-31", "2025-09-30", "2025-06-30", "2025-03-31"];
const convention = "sum-quarterly-diluted-eps";

/** Synthetic issuer observations, not a reconstruction of a statutory EPS numerator. */
function quarters(): FmpIncomeStatementRow[] {
  return dates.map((date, index) => ({
    date,
    reportedCurrency: "USD",
    revenue: 100,
    netIncome: 100,
    epsDiluted: index < 2 ? 1 : 2,
    // A midyear issuance doubles shares; each quarter still earns 100.
    weightedAverageShsOutDil: index < 2 ? 100 : 50,
  }));
}

function pe(incomeTtm: MultiplesIncomeTtm, price = 60) {
  return multiplesFramework("general", {
    quote: { price, marketCap: 6000, currency: "USD" },
    reportedCurrency: "USD", incomeTtm, cashFlowTtm: null, balance: null,
  }).multiples.find(row => row.key === "peTtm")!;
}

describe("TTM diluted EPS quarter-sum convention", () => {
  it("also exposes the quarter-sum difference after a major midyear repurchase", () => {
    const rows = quarters().map((row, index) => ({ ...row, epsDiluted: index < 2 ? 2 : 1, weightedAverageShsOutDil: index < 2 ? 50 : 100 }));
    const result = ttmIncome(rows)!;
    expect(result.epsDiluted).toBe(6);
    expect(result.epsDiluted).not.toBeCloseTo(400 / 75, 8);
    expect(result.epsDilutedBasis).toBe(convention);
  });
  it("labels the sum and preserves its difference from earnings / average shares after a midyear issuance", () => {
    const result = ttmIncome(quarters())!;
    expect(result.epsDiluted).toBe(6);
    expect(result.epsDilutedBasis).toBe(convention);
    // Equal-quarter illustration only: an actual statutory period uses its own
    // time weighting and numerator adjustments, not this simple average.
    const simpleSharesRatio = 400 / 75;
    expect(result.epsDiluted).not.toBeCloseTo(simpleSharesRatio, 8);
  });

  it("does not infer an EPS numerator from net income or depend on provider share counts", () => {
    const rows = quarters().map(row => ({ ...row, netIncome: -999, weightedAverageShsOutDil: undefined }));
    expect(ttmIncome(rows)?.epsDiluted).toBe(6);
  });

  it("retains reported loss-quarter EPS without inventing a full-period anti-dilution calculation", () => {
    const rows = quarters();
    // A synthetic loss quarter reports its basic 50-share denominator; the
    // profitable quarters report 100 diluted shares. Excluded instruments and
    // continuing-operation control numbers are not available to reconstruct EPS.
    rows.forEach((row, index) => {
      row.netIncome = index === 3 ? -100 : 100;
      row.weightedAverageShsOutDil = index === 3 ? 50 : 100;
      row.epsDiluted = index === 3 ? -2 : 1;
    });
    const result = ttmIncome(rows)!;
    expect(result.epsDiluted).toBe(1);
    expect(result.epsDilutedBasis).toBe(convention);
    expect(result.epsDiluted).not.toBeCloseTo(200 / 87.5, 8);
  });

  it("scales exactly when all four observations are consistently adjusted for a 2-for-1 split", () => {
    const original = quarters();
    const adjusted = original.map(row => ({
      ...row, epsDiluted: row.epsDiluted! / 2,
      weightedAverageShsOutDil: row.weightedAverageShsOutDil! * 2,
    }));
    expect(ttmIncome(adjusted)?.epsDiluted).toBe(ttmIncome(original)!.epsDiluted! / 2);
    expect(ttmIncome(adjusted)?.netIncome).toBe(ttmIncome(original)?.netIncome);
    // Adjust quoted price and per-share EPS together: the P/E attractiveness
    // comparison is invariant, with economic market capitalization unchanged.
    expect(pe(ttmIncome(adjusted)!, 30).current).toBe(pe(ttmIncome(original)!, 60).current);
    // This proves consistent-input scaling; it does not detect mixed split bases.
  });

  it("keeps a complete reported zero EPS sum and its convention", () => {
    const result = ttmIncome(quarters().map(row => ({ ...row, epsDiluted: 0 })))!;
    expect(result.epsDiluted).toBe(0);
    expect(result.epsDilutedBasis).toBe(convention);
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY])("suppresses an incomplete EPS sum (%s) without reconstructing it", value => {
    const rows = quarters();
    rows[1].epsDiluted = value;
    const gaps: ManifestEntry[] = [];
    const result = ttmIncome(rows, gaps)!;
    expect(result.revenue).toBe(400);
    expect(result.epsDiluted).toBeNull();
    expect(result.epsDilutedBasis).toBeNull();
    expect(gaps.some(gap => gap.field === "compute.ttmIncome.epsDiluted")).toBe(true);
  });

  it("does not create a basis when all quarterly EPS is absent", () => {
    const result = ttmIncome(quarters().map(row => ({ ...row, epsDiluted: undefined })))!;
    expect(result.epsDiluted).toBeNull();
    expect(result.epsDilutedBasis).toBeNull();
  });

  it("withholds the entire window when currency or period continuity is unestablished", () => {
    const missingCurrency = quarters();
    delete missingCurrency[1].reportedCurrency;
    expect(ttmIncome(missingCurrency)).toBeNull();
    const missingQuarter = quarters();
    missingQuarter[3].date = "2024-12-31";
    expect(ttmIncome(missingQuarter)).toBeNull();
  });

  it("carries the convention beside a computed price/EPS multiple without a data-gap penalty", () => {
    const income = { ...ttmIncome(quarters())!, basis: "ttm" as const };
    const result = pe(income);
    expect(result.current).toBe(10);
    expect(result.basis).toMatch(/sum of four reported quarterly diluted EPS/i);
    expect(result.basis).toMatch(/annual or year-to-date.*not reconstructed/i);
    expect(result.basis).toMatch(/split.*not independently verified/i);
    const output = multiplesFramework("general", {
      quote: { price: 60, marketCap: 6000, currency: "USD" },
      reportedCurrency: "USD", incomeTtm: income, cashFlowTtm: null, balance: null,
    });
    expect(output.gaps.some(gap => /epsDiluted.*convention/.test(gap.field))).toBe(false);
    const withoutBasis = { ...income, epsDilutedBasis: undefined };
    const legacy = multiplesFramework("general", {
      quote: { price: 60, marketCap: 6000, currency: "USD" },
      reportedCurrency: "USD", incomeTtm: withoutBasis, cashFlowTtm: null, balance: null,
    });
    expect(output.gaps).toEqual(legacy.gaps);
  });

  it("does not describe an annual EPS observation as a quarterly sum", () => {
    const result = pe({ date: "2025-12-31", basis: "annual", revenue: 400,
      operatingIncome: 80, depreciationAndAmortization: 5, netIncome: 100, epsDiluted: 4 });
    expect(result.current).toBe(15);
    expect(result.basis).not.toMatch(/sum of four reported quarterly diluted EPS/i);
  });

  it("does not attach a used-EPS convention to the common-income fallback when EPS is nonpositive", () => {
    const income = { ...ttmIncome(quarters())!, basis: "ttm" as const, epsDiluted: -1 };
    const result = pe(income);
    expect(result.current).toBe(15); // 6000 / 400, not 60 / negative EPS.
    expect(result.basis).not.toMatch(/sum of four reported quarterly diluted EPS/i);
  });
});
