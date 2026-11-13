/**
 * D-247 (P1): one definition of "this fact is the fact of that income period".
 *
 * The if-converted share increment (`IncrementalCommonSharesAttributableTo
 * ConversionOfDebtSecurities` / `...OfPreferredStock`) was admitted by two
 * readers with two private windows: the equity bridge's reader took a quarter
 * of 80 to 100 days (a year of 350 to 380) ending exactly on the divisor's end,
 * the loss-period divisor's reader a quarter of 70 to 110 days (a year of 300
 * to 400) ending within 3 days. Both now ask the P1 owner (`factCoversPeriod`,
 * src/edgar/xbrl.ts): a duration fact of the period's own length (a quarter
 * 70 to 125 days, a fiscal year 300 to 400) ending within 3 days of the row.
 *
 * Shapes covered: a 12-12-12-16 calendar's 16-week quarter (the shape the
 * owner's band exists for), the ordinary 13-week quarter (compatible control),
 * and periods that are not the row's (half-year and nine-month year-to-date
 * facts, a quarter ending a week away, a transition year). No company data.
 */
import { describe, expect, it } from "vitest";

import {
  FISCAL_YEAR_DURATION_DAYS,
  PERIOD_END_TOLERANCE_DAYS,
  QUARTER_DURATION_DAYS,
  factCoversPeriod,
  type CompanyFacts,
} from "@/edgar/xbrl";
import { convertibleInstrumentsAt } from "@/pipeline/stageB/convertibles";
import { conversionSharesFiled } from "@/pipeline/stageB/dilutedDivisor";

const DEBT_TAG = "IncrementalCommonSharesAttributableToConversionOfDebtSecurities";
const ROW_END = "2026-06-30";
const DAY_MS = 86_400_000;
const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** One duration fact of `length` days ending `offset` days from the row's end. */
function increment(length: number, offset = 0, val = 10) {
  const end = addDays(ROW_END, offset);
  return { start: addDays(end, -length), end, val, filed: "2026-07-30", form: "10-Q", accn: "0000000000-26-000001" };
}
function factsWith(point: ReturnType<typeof increment>): CompanyFacts {
  return {
    cik: 42, entityName: "Test",
    facts: { "us-gaap": {
      [DEBT_TAG]: { units: { shares: [point] } },
      // A filed convertible claim, so the bridge reader reports a missing increment as a gap.
      ConvertibleNotesPayable: { units: { USD: [{ end: ROW_END, val: 50, filed: "2026-07-30", form: "10-Q", accn: "0000000000-26-000001" }] } },
    } },
  };
}

/** The bridge's reader (convertibles.ts): the increment it admits for the divisor's period, or null. */
function bridgeReader(point: ReturnType<typeof increment>, basis: "quarter" | "annual"): number | null {
  const read = convertibleInstrumentsAt(factsWith(point), { end: ROW_END, basis }, ROW_END, "USD", "2026-08-01", { permanentPreferred: null, totalDebt: 300 });
  return read.instruments.find((i) => i.kind === "notes")?.conversionShares ?? null;
}
/** The loss-period divisor's reader (dilutedDivisor.ts). */
function divisorReader(point: ReturnType<typeof increment>, period: "quarter" | "fiscal year"): number | null {
  return conversionSharesFiled(factsWith(point), ROW_END, period);
}

describe("D-247: the P1 owner defines a quarter, a fiscal year and the end allowance once", () => {
  it("names the three numbers in the owner", () => {
    expect(QUARTER_DURATION_DAYS).toEqual([70, 125]);
    expect(FISCAL_YEAR_DURATION_DAYS).toEqual([300, 400]);
    expect(PERIOD_END_TOLERANCE_DAYS).toBe(3);
  });

  it("a duration fact covers a period only by its own length and an end within the allowance", () => {
    expect(factCoversPeriod({ start: "2026-04-01", end: "2026-06-30" }, ROW_END, "Q")).toBe(true);
    expect(factCoversPeriod({ start: "2026-04-01", end: "2026-06-30" }, ROW_END, "FY")).toBe(false);
    expect(factCoversPeriod({ start: "2025-07-01", end: "2026-06-30" }, ROW_END, "FY")).toBe(true);
    expect(factCoversPeriod({ start: "2025-07-01", end: "2026-06-30" }, ROW_END, "Q")).toBe(false);
    // An instant has no length of its own, so it never stands for a period (P1, D-56).
    expect(factCoversPeriod({ end: "2026-06-30" }, ROW_END, "Q")).toBe(false);
    expect(factCoversPeriod({ start: "not-a-date", end: "2026-06-30" }, ROW_END, "Q")).toBe(false);
    expect(factCoversPeriod({ start: "2026-04-01", end: "2026-06-30" }, "not-a-date", "Q")).toBe(false);
  });
});

describe("D-247: both conversion-share readers admit exactly the periods the owner admits", () => {
  const lengths = [69, 70, 79, 80, 84, 91, 98, 100, 101, 110, 111, 112, 119, 125, 126, 181, 272];
  const offsets = [-4, -3, -1, 0, 1, 3, 4];

  it.each(lengths.flatMap((length) => offsets.map((offset) => [length, offset] as const)))(
    "a %i-day fact ending %i days from the quarter's end",
    (length, offset) => {
      const point = increment(length, offset);
      const expected = factCoversPeriod(point, ROW_END, "Q") ? 10 : null;
      expect(expected === null).toBe(length < 70 || length > 125 || Math.abs(offset) > 3);
      expect(bridgeReader(point, "quarter")).toBe(expected);
      expect(divisorReader(point, "quarter")).toBe(expected);
    },
  );

  it.each([299, 300, 308, 349, 350, 364, 371, 380, 381, 400, 401].flatMap((length) => offsets.map((offset) => [length, offset] as const)))(
    "a %i-day fact ending %i days from the fiscal year's end",
    (length, offset) => {
      const point = increment(length, offset);
      const expected = factCoversPeriod(point, ROW_END, "FY") ? 10 : null;
      expect(expected === null).toBe(length < 300 || length > 400 || Math.abs(offset) > 3);
      expect(bridgeReader(point, "annual")).toBe(expected);
      expect(divisorReader(point, "fiscal year")).toBe(expected);
    },
  );

  it("a 16-week quarter's increment is read by both (the 12-12-12-16 calendar the owner's band holds)", () => {
    const sixteenWeeks = increment(112);
    expect(bridgeReader(sixteenWeeks, "quarter")).toBe(10);
    expect(divisorReader(sixteenWeeks, "quarter")).toBe(10);
  });

  it("the ordinary 13-week quarter is read as before (compatible control)", () => {
    const thirteenWeeks = increment(91);
    expect(bridgeReader(thirteenWeeks, "quarter")).toBe(10);
    expect(divisorReader(thirteenWeeks, "quarter")).toBe(10);
    expect(bridgeReader(thirteenWeeks, "annual")).toBeNull();
    expect(divisorReader(thirteenWeeks, "fiscal year")).toBeNull();
  });

  it("year-to-date facts and a neighbouring quarter are never the row's quarter (unrelated shapes)", () => {
    for (const point of [increment(181), increment(272), increment(91, -7), increment(91, 7)]) {
      expect(bridgeReader(point, "quarter")).toBeNull();
      expect(divisorReader(point, "quarter")).toBeNull();
    }
  });

  it("a missing increment for a filed claim is still a disclosed gap, not a zero", () => {
    const read = convertibleInstrumentsAt(factsWith(increment(181)), { end: ROW_END, basis: "quarter" }, ROW_END, "USD", "2026-08-01", { permanentPreferred: null, totalDebt: 300 });
    expect(read.instruments).toEqual([]);
    expect(read.gaps.map((g) => g.field)).toEqual(["valuation.perShare.convertibleShares"]);
  });
});
