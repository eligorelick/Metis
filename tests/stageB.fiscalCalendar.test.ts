import { describe, expect, it } from "vitest";
import { fiscalYearRule, fiscalYearEndFor, snapToFiscalYearEnd } from "@/pipeline/stageB/fiscalCalendar";
import { calendarizeConsensusWindow, buildDcfAssumptions, type DcfAssumptionInputs } from "@/pipeline/stageB/valuation";

const B = 1e9;
const TTM = 302.97 * B;
/** NVDA fiscal years (revenue, operating income, pre-tax income, tax), $B, from the 10-Ks. */
const HISTORY = ([
  ["2017-01-29", 6.91, 1.934, 1.769, 0.239], ["2018-01-28", 9.714, 3.21, 3.196, 0.149],
  ["2019-01-27", 11.716, 3.804, 3.896, -0.245], ["2020-01-26", 10.918, 2.846, 2.97, 0.174],
  ["2021-01-31", 16.675, 4.532, 4.409, 0.077], ["2022-01-30", 26.914, 10.041, 9.941, 0.189],
  ["2023-01-29", 26.974, 4.224, 4.181, -0.187], ["2024-01-28", 60.922, 32.972, 33.818, 4.058],
  ["2025-01-26", 130.497, 81.453, 84.026, 11.146], ["2026-01-25", 215.938, 130.387, 141.45, 21.38],
] as const).map(([date, revenue, ebit, pretax, tax]) => ({
  date, revenue: revenue * B, operatingIncome: ebit * B, incomeBeforeTax: pretax * B, incomeTaxExpense: tax * B,
}));

function nvda(over: Partial<DcfAssumptionInputs> = {}): DcfAssumptionInputs {
  return {
    revenueCagr3yPct: 100.05,
    revenueCagr5yPct: 66.9,
    revenueLogLinear: { growthPct: 44.4, rSquared: 0.92, n: 10, startDate: "2017-01-29", endDate: "2026-01-25" },
    analystEstimates: null,
    waccPct: 13.2544,
    riskFreePct: 5.21,
    incomeTtm: { date: "2026-07-26", basis: "ttm", revenue: TTM, operatingIncome: 0.6521 * TTM, incomeBeforeTax: 100 * B, incomeTaxExpense: 16.0461 * B },
    incomeHistory: HISTORY,
    balance: { date: "2026-07-26", basis: "quarter", totalDebt: 33.366 * B, totalStockholdersEquity: TTM / 1.8 - 33.366 * B + 99.37 * B, cashAndShortTermInvestments: 99.37 * B },
    marketCap: 5.28e12,
    quarterRevenue: { latest: { date: "2026-07-26", revenue: 96.22 * B }, yearAgo: { date: "2025-07-27", revenue: 46.743 * B } },
    domicileCountry: "US",
    ...over,
  };
}

describe("filed fiscal-year calendar (FIN-301-V3)", () => {
it("sorts and deduplicates strict dates, and requires three chained ends", () => {
  const ends = ["2024-01-28", "2026-01-25", "2025-01-26", "2026-01-25"];
  const before = [...ends];
  expect(fiscalYearRule(ends)).toEqual({ kind: "last-weekday", weekday: 0, month: 1 });
  expect(ends).toEqual(before);
  for (const e of [[], ["2026-01-25"], ["2026-01-25", "2025-01-26"], [...ends, "2023-02-30"], [...ends, "2023-01-29T00:00:00Z"]]) expect(fiscalYearRule(e)).toBeNull();
});
it("snaps only within the tolerance, including across a calendar-year boundary", () => {
  const rule = { kind: "nearest-weekday" as const, weekday: 6 as const, month: 12 };
  expect(snapToFiscalYearEnd(rule, "2025-12-31")).toBe("2026-01-03");
  expect(snapToFiscalYearEnd(rule, "2026-01-13")).toBe("2026-01-03");
  expect(snapToFiscalYearEnd(rule, "2026-01-14")).toBe("2026-01-14");
  expect(snapToFiscalYearEnd(rule, "2025-12-31", 2)).toBe("2025-12-31");
  expect(snapToFiscalYearEnd(null, "2025-12-31")).toBe("2025-12-31");
  expect(snapToFiscalYearEnd(rule, "2026-02-30")).toBe("2026-02-30");
});
it("names approximate provider boundaries when weekday ends do not establish one rule", () => {
  const base = nvda({ analystEstimates: [
    { date: "2027-01-25", revenueAvg: 409.8e9, analysts: 50, revenueLow: 400e9, revenueHigh: 420e9 },
    { date: "2028-01-25", revenueAvg: 600e9, analysts: 45, revenueLow: 570e9, revenueHigh: 630e9 },
  ] });
  const history = base.incomeHistory.slice(0, 3).map((row, i) => ({...row, date: ["2024-12-28", "2023-12-30", "2022-12-31"][i]}));
  const a = buildDcfAssumptions({ ...base, incomeHistory: history, fiscalCalendar: null }).assumptions!;
  expect(a.revenueAnchor!.basis).toContain("fiscal-year boundaries are the provider's dates, approximate by up to a week");
  const calendar = buildDcfAssumptions(base).assumptions!;
  expect(calendar.revenueAnchor!.basis).not.toContain("approximate by up to a week");
});
it("detects NVDA's last-Sunday-of-January rule and its 53-week FY2027", () => {
  const rule = fiscalYearRule(["2026-01-25", "2025-01-26", "2024-01-28", "2023-01-29"]);
  expect(rule).toEqual({ kind: "last-weekday", weekday: 0, month: 1 });
  expect(fiscalYearEndFor(rule!, 2027)).toBe("2027-01-31");
  expect(fiscalYearEndFor(rule!, 2028)).toBe("2028-01-30");
});
it("detects MU's Thursday-nearest-August-31 rule", () => {
  const rule = fiscalYearRule(["2026-09-03", "2025-08-28", "2024-08-29", "2023-08-31"]);
  expect(rule).toEqual({ kind: "nearest-weekday", weekday: 4, month: 8 });
  expect(fiscalYearEndFor(rule!, 2027)).toBe("2027-09-02");
});
it("finds no rule for a calendar year end or across a fiscal-year change", () => {
  expect(fiscalYearRule(["2025-12-31", "2024-12-31", "2023-12-31"])).toBeNull();
  expect(fiscalYearRule(["2025-12-28", "2024-06-30", "2023-07-02", "2022-07-03"])).toBeNull();
});
it("finds no rule when both kinds fit every end (ambiguous)", () => {
  // Saturdays within the last three days of December: last-Saturday and nearest-Saturday both fit,
  // and the two rules disagree on the next year (2025-12-27 against 2026-01-03).
  expect(fiscalYearRule(["2024-12-28", "2023-12-30", "2022-12-31"])).toBeNull();
  // control: one older end that only the nearest rule fits settles it
  expect(fiscalYearRule(["2024-12-28", "2023-12-30", "2022-12-31", "2022-01-01"])).toEqual({ kind: "nearest-weekday", weekday: 6, month: 12 });
});
it("reads Apple-shaped last-Saturday-of-September ends (the payload golden fixture's calendar)", () => {
  const rule = fiscalYearRule(["2025-09-27", "2024-09-28", "2023-09-30", "2022-09-24", "2021-09-25"]);
  expect(rule).toEqual({ kind: "last-weekday", weekday: 6, month: 9 });
  expect(snapToFiscalYearEnd(rule, "2026-09-30")).toBe("2026-09-26");
  expect(snapToFiscalYearEnd(rule, "2027-09-30")).toBe("2027-09-25");
  expect(snapToFiscalYearEnd(rule, "2027-12-31")).toBe("2027-12-31"); // control: outside the 10-day tolerance
});
it("moves a vendor anniversary date to the 53-week year end, so no day is counted twice", () => {
  const rule = fiscalYearRule(["2026-01-25", "2025-01-26", "2024-01-28"]);
  const rows = [
    { date: "2027-01-25", revenueAvg: 409.8e9, analysts: 50, revenueLow: 400e9, revenueHigh: 420e9 },
    { date: "2028-01-25", revenueAvg: 600e9, analysts: 45, revenueLow: 570e9, revenueHigh: 630e9 },
  ];
  const window = { startDate: "2026-07-27", endDate: "2027-07-26" };
  const reported = { priorFiscalYearEnd: "2026-01-25", through: "2026-07-26", revenue: 177.84e9, quarters: 2 };
  const snapped = calendarizeConsensusWindow(rows, window, reported, null, rule);
  const vendor = calendarizeConsensusWindow(rows, window, reported, null, null); // control: HEAD behaviour
  expect(snapped.fiscalYears.map((f) => [f.date, f.days])).toEqual([["2027-01-31", 189], ["2028-01-30", 176]]);
  expect(snapped.value).toBeCloseTo(522.0699e9, -5);
  expect(vendor.value).toBeCloseTo(531.1381e9, -5);
});

it.each([false, true])("uses the filed 53-week first year without YTD, including a missing predecessor (%s)", (missingPredecessor) => {
  const rule = fiscalYearRule(["2026-01-25", "2025-01-26", "2024-01-28"]);
  const rows = [
    ...(missingPredecessor ? [{ date: "2025-01-25", revenueAvg: 364 * B }] : []),
    { date: "2027-01-25", revenueAvg: 371 * B },
    { date: "2028-01-25", revenueAvg: 364 * B },
  ];
  const window = { startDate: "2026-07-27", endDate: "2027-07-26" };
  // Filed years are 2026-01-26..2027-01-31 (371 days), then 364 days.
  // Both estimates therefore represent $1B/day, including the first row.
  const actual = calendarizeConsensusWindow(rows, window, null, null, rule);
  expect(actual.value).toBeCloseTo(365 * B, -3);
  expect(actual.fiscalYears.map((fy) => [fy.date, fy.days])).toEqual([["2027-01-31", 189], ["2028-01-30", 176]]);
  if (!missingPredecessor) {
    const vendor = calendarizeConsensusWindow(rows, window, null, null, null);
    expect(vendor.value).toBeCloseTo((371 * 183 + 364 * 182) / 365 * B, -3);
  }
});

it("uses a 364-day first fiscal year rather than a calendar anniversary without YTD", () => {
  const rule = fiscalYearRule(["2026-01-25", "2025-01-26", "2024-01-28"]);
  const actual = calendarizeConsensusWindow([
    { date: "2028-01-25", revenueAvg: 364 * B },
    { date: "2029-01-25", revenueAvg: 364 * B },
  ], { startDate: "2027-07-26", endDate: "2028-07-25" }, null, null, rule);
  expect(actual.value).toBeCloseTo(366 * B, -3); // The requested window includes leap day.
});

it("finds the first fiscal year's preceding boundary when December's rule ends in January", () => {
  const rule = { kind: "nearest-weekday" as const, weekday: 6 as const, month: 12 };
  const actual = calendarizeConsensusWindow([
    { date: "2025-12-31", revenueAvg: 371 * B },
    { date: "2026-12-31", revenueAvg: 364 * B },
  ], { startDate: "2025-07-01", endDate: "2026-06-30" }, null, null, rule);
  expect(actual.value).toBeCloseTo(365 * B, -3);
  expect(actual.fiscalYears.map((fy) => fy.date)).toEqual(["2026-01-03", "2027-01-02"]);
});

it("keeps the calendar-anniversary start when an estimate is outside the rule's admission window", () => {
  const rule = fiscalYearRule(["2026-01-25", "2025-01-26", "2024-01-28"]);
  const rows = [{ date: "2027-03-31", revenueAvg: 365 * B }];
  const window = { startDate: "2026-04-01", endDate: "2027-03-31" };
  const actual = calendarizeConsensusWindow(rows, window, null, null, rule);
  expect(actual).toEqual(calendarizeConsensusWindow(rows, window, null, null, null));
  expect(actual.value).toBe(365 * B);
});

});
