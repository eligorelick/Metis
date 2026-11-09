/**
 * Unit tests for the company-page display formatters in
 * src/app/company/[symbol]/format.ts (fmtNum, fmtPct, fmtSignedPct, fmtBig,
 * fmtMoney, fmtX, upsidePct): main paths plus the null/undefined/non-finite
 * sentinels ("n/a" / "n/m" / null). No network, no DB.
 */

import { describe, expect, it } from "vitest";

import {
  fmtNum,
  fmtPct,
  fmtSignedPct,
  fmtBig,
  fmtMoney,
  fmtX,
  upsidePct,
} from "@/app/company/[symbol]/format";

describe("fmtNum", () => {
  it("formats with grouping and fixed digits", () => {
    expect(fmtNum(1234.567)).toBe("1,234.57");
    expect(fmtNum(1234.567, 0)).toBe("1,235");
    expect(fmtNum(0)).toBe("0.00");
    expect(fmtNum(-1234.5)).toBe("-1,234.50");
  });

  it("sentinels: null / undefined / NaN / Infinity -> n/a", () => {
    expect(fmtNum(null)).toBe("n/a");
    expect(fmtNum(undefined)).toBe("n/a");
    expect(fmtNum(Number.NaN)).toBe("n/a");
    expect(fmtNum(Infinity)).toBe("n/a");
  });
});

describe("fmtPct / fmtSignedPct", () => {
  it("fmtPct renders unsigned percentages (negative keeps its minus)", () => {
    expect(fmtPct(12.34)).toBe("12.3%");
    expect(fmtPct(-5)).toBe("-5.0%");
    expect(fmtPct(0)).toBe("0.0%");
    expect(fmtPct(7.777, 2)).toBe("7.78%");
    expect(fmtPct(null)).toBe("n/a");
    expect(fmtPct(Number.NaN)).toBe("n/a");
  });

  it("fmtSignedPct prefixes + on non-negative values", () => {
    expect(fmtSignedPct(12.34)).toBe("+12.3%");
    expect(fmtSignedPct(0)).toBe("+0.0%");
    expect(fmtSignedPct(-5)).toBe("-5.0%");
    expect(fmtSignedPct(undefined)).toBe("n/a");
  });
});

describe("fmtBig", () => {
  it("scales T / B / M / K / raw with the documented digit counts", () => {
    expect(fmtBig(1.234e12)).toBe("1.23T");
    expect(fmtBig(45.6e9)).toBe("45.60B");
    expect(fmtBig(789e6)).toBe("789.00M");
    expect(fmtBig(12_345)).toBe("12.3K");
    // The scale is chosen on the ROUNDED mantissa (audit 2026-09-06, F65):
    // 999.99 rounds to 1.0K at one decimal, so it is printed in K rather than
    // as a raw "999.99" beside a "1.0K" neighbour.
    expect(fmtBig(999.99)).toBe("1.0K");
    expect(fmtBig(949)).toBe("949.00");
    expect(fmtBig(0)).toBe("0.00");
  });

  it("boundaries land on the larger unit exactly at the threshold, and a value that rounds up to it too", () => {
    expect(fmtBig(1e3)).toBe("1.0K");
    expect(fmtBig(1e6)).toBe("1.00M");
    expect(fmtBig(1e9)).toBe("1.00B");
    expect(fmtBig(1e12)).toBe("1.00T");
    // "1000.0K" was a rounding carry printed in the wrong unit (F65).
    expect(fmtBig(999_999)).toBe("1.00M");
    expect(fmtBig(994_999)).toBe("995.0K");
  });

  it("keeps the sign outside the scaled magnitude", () => {
    expect(fmtBig(-45.6e9)).toBe("-45.60B");
    expect(fmtBig(-12_345)).toBe("-12.3K");
  });

  it("sentinels -> n/a", () => {
    expect(fmtBig(null)).toBe("n/a");
    expect(fmtBig(undefined)).toBe("n/a");
    expect(fmtBig(Number.NaN)).toBe("n/a");
    expect(fmtBig(-Infinity)).toBe("n/a");
  });
});

describe("fmtMoney", () => {
  it("prefixes $ with grouping for USD", () => {
    expect(fmtMoney(1234.5, "USD")).toBe("$1,234.50");
    expect(fmtMoney(0.125, "USD", 3)).toBe("$0.125");
  });

  it("names any other established currency, and claims none that is not", () => {
    expect(fmtMoney(1234.5, "JPY")).toBe("1,234.50 JPY");
    expect(fmtMoney(1234.5, null)).toBe("1,234.50 (currency unknown)");
  });

  // D-62: a true minus sign leads the currency ("−$5.00"), not "$-5.00".
  it("negative values render with a leading minus sign before the currency", () => {
    expect(fmtMoney(-5, "USD")).toBe("−$5.00");
  });

  it("sentinels -> n/a", () => {
    expect(fmtMoney(null, "USD")).toBe("n/a");
    expect(fmtMoney(Number.NaN, "USD")).toBe("n/a");
  });
});

describe("fmtX", () => {
  it("renders multiples with the × suffix", () => {
    expect(fmtX(2.5)).toBe("2.5×");
    expect(fmtX(28.37, 2)).toBe("28.37×");
    expect(fmtX(-1.2)).toBe("-1.2×");
  });

  it("uses the n/m sentinel (not n/a) for missing/non-finite", () => {
    expect(fmtX(null)).toBe("n/m");
    expect(fmtX(undefined)).toBe("n/m");
    expect(fmtX(Number.NaN)).toBe("n/m");
  });
});

describe("upsidePct", () => {
  it("computes percentage upside/downside vs price", () => {
    expect(upsidePct(180, 150)).toBeCloseTo(20, 10);
    expect(upsidePct(140, 200)).toBeCloseTo(-30, 10);
    expect(upsidePct(150, 150)).toBe(0);
  });

  it("null on missing inputs, zero price, or non-finite values", () => {
    expect(upsidePct(null, 150)).toBeNull();
    expect(upsidePct(180, null)).toBeNull();
    expect(upsidePct(180, 0)).toBeNull();
    expect(upsidePct(Number.NaN, 150)).toBeNull();
    expect(upsidePct(180, Infinity)).toBeNull();
  });
});
