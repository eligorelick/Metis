import { describe, expect, it } from "vitest";
import { buildDcfAssumptions, type AnalystEstimateRow, type DcfAssumptionInputs, type DcfAssumptions, type DcfGuidance } from "@/pipeline/stageB/valuation";
import { fiscalYearRule } from "@/pipeline/stageB/fiscalCalendar";
import { nextPeriodRevenueGuidance } from "@/pipeline/filingDisclosures";
import { runStageB } from "@/pipeline/compute";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

// Synthetic seasonal/flat scenarios from FIN-101; source probe was read, never run.
const B = 1e9;

type Shape = { fy25: [number, number, number, number]; q26: [number, number, number]; q4Guide: number };

function scenario(shape: Shape) {
  const [a, b, c, d] = shape.fy25.map((x) => x * B) as [number, number, number, number];
  const fy25 = a + b + c + d;
  const [q1, q2, q3] = shape.q26.map((x) => x * B) as [number, number, number];
  const ttmRev = d + q1 + q2 + q3;
  const ytd = q1 + q2 + q3;
  const guideMid = shape.q4Guide * B;
  const fy26 = ytd + guideMid; // consensus holds Q4'26 exactly at the guide midpoint
  const fy27 = fy26 * 1.1;
  const estimates: AnalystEstimateRow[] = [
    { date: "2026-12-31", revenueAvg: fy26, analysts: 45, revenueLow: fy26 * 0.99, revenueHigh: fy26 * 1.01 },
    { date: "2027-12-31", revenueAvg: fy27, analysts: 45, revenueLow: fy27 * 0.96, revenueHigh: fy27 * 1.04 },
    { date: "2028-12-31", revenueAvg: fy27 * 1.09, analysts: 40, revenueLow: fy27 * 1.04, revenueHigh: fy27 * 1.14 },
  ];
  const ttm = { date: "2026-09-30", basis: "ttm" as const, revenue: ttmRev, grossProfit: 0.5 * ttmRev, operatingIncome: 0.12 * ttmRev, incomeBeforeTax: 0.125 * ttmRev, incomeTaxExpense: 0.02 * ttmRev };
  const history = [
    { date: "2025-12-31", revenue: fy25, grossProfit: 0.5 * fy25, operatingIncome: 0.11 * fy25, incomeBeforeTax: 0.115 * fy25, incomeTaxExpense: 0.02 * fy25 },
    { date: "2024-12-31", revenue: fy25 / 1.12, grossProfit: 0.49 * fy25 / 1.12, operatingIncome: 0.1 * fy25 / 1.12, incomeBeforeTax: 0.1 * fy25 / 1.12, incomeTaxExpense: 0.015 * fy25 / 1.12 },
    { date: "2023-12-31", revenue: fy25 / 1.25, grossProfit: 0.47 * fy25 / 1.25, operatingIncome: 0.065 * fy25 / 1.25, incomeBeforeTax: 0.065 * fy25 / 1.25, incomeTaxExpense: 0.012 * fy25 / 1.25 },
    { date: "2022-12-31", revenue: fy25 / 1.4, grossProfit: 0.44 * fy25 / 1.4, operatingIncome: 0.03 * fy25 / 1.4, incomeBeforeTax: 0.02 * fy25 / 1.4, incomeTaxExpense: 0.004 * fy25 / 1.4 },
    { date: "2021-12-31", revenue: fy25 / 1.53, grossProfit: 0.42 * fy25 / 1.53, operatingIncome: 0.053 * fy25 / 1.53, incomeBeforeTax: 0.08 * fy25 / 1.53, incomeTaxExpense: 0.01 * fy25 / 1.53 },
  ];
  const inputs: DcfAssumptionInputs = {
    revenueCagr3yPct: 11.8, revenueCagr5yPct: 11.0, analystEstimates: estimates, waccPct: 10.5, riskFreePct: 4.5,
    incomeTtm: ttm, incomeHistory: history, domicileCountry: "US", marketCap: 2.4e12,
    balance: { date: "2026-09-30", basis: "quarter", totalDebt: 60 * B, totalStockholdersEquity: 380 * B, cashAndShortTermInvestments: 90 * B },
    quarterRevenue: {
      latest: { date: "2026-09-30", revenue: q3 },
      yearAgo: { date: "2025-09-30", revenue: c },
      guidedYearAgo: { date: "2025-12-31", revenue: d },
    },
    fiscalYearToDate: { priorFiscalYearEnd: "2025-12-31", through: "2026-09-30", revenue: ytd, quarters: 3 },
    revenueSeasonality: {
      fiscalYearEnd: "2025-12-31",
      quarters: [
        { date: "2025-03-31", revenue: a }, { date: "2025-06-30", revenue: b },
        { date: "2025-09-30", revenue: c }, { date: "2025-12-31", revenue: d },
      ],
    },
  } as DcfAssumptionInputs;
  const guide = { revenue: guideMid, revenueLow: guideMid * 0.98, revenueHigh: guideMid * 1.02, periodEnd: "2026-12-31", asOf: "2026-10-30", source: "sec:8-K EX-99.1 synthetic" };
  return { inputs, guide, ttmRev, q1, q2, q3, d };
}

const build = (inputs: DcfAssumptionInputs): DcfAssumptions => {
  const r = buildDcfAssumptions(inputs);
  expect(r.assumptions).not.toBeNull();
  return r.assumptions as DcfAssumptions;
};


// Seasonal (Q4 = 29.8% of FY2025) and flat (each quarter 25%) issuers, both guiding Q4'26 about +10% YoY.
const SEASONAL: Shape = { fy25: [155.7, 167.7, 180.2, 213.4], q26: [171.3, 184.5, 198.2], q4Guide: 234.7 };
const FLAT: Shape = { fy25: [179.25, 179.25, 179.25, 179.25], q26: [188, 193, 198], q4Guide: 197.2 };


const HISTORY = ([
  ["2017-01-29", 6.91, 1.934, 1.769, 0.239], ["2018-01-28", 9.714, 3.21, 3.196, 0.149],
  ["2019-01-27", 11.716, 3.804, 3.896, -0.245], ["2020-01-26", 10.918, 2.846, 2.97, 0.174],
  ["2021-01-31", 16.675, 4.532, 4.409, 0.077], ["2022-01-30", 26.914, 10.041, 9.941, 0.189],
  ["2023-01-29", 26.974, 4.224, 4.181, -0.187], ["2024-01-28", 60.922, 32.972, 33.818, 4.058],
  ["2025-01-26", 130.497, 81.453, 84.026, 11.146], ["2026-01-25", 215.938, 130.387, 141.45, 21.38],
] as const).map(([date, revenue, ebit, pretax, tax]) => ({
  date, revenue: revenue * B, operatingIncome: ebit * B, incomeBeforeTax: pretax * B, incomeTaxExpense: tax * B,
}));

const plus = (date: string, days: number) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
function nextReport(guide: Partial<DcfGuidance>, ya = { date: "2026-01-25", revenue: 68.127 * B, days: 91 }): DcfAssumptionInputs {
  const revenue = (68.127 + 81.615 + 96.221 + 108) * B;
  return {
    ...scenario(SEASONAL).inputs, analystEstimates: null, incomeHistory: HISTORY,
    revenueCagr3yPct: 100.05, revenueCagr5yPct: 66.9,
    revenueLogLinear: { growthPct: 44.4, rSquared: 0.92, n: 10, startDate: "2017-01-29", endDate: "2026-01-25" },
    waccPct: 13.2544, riskFreePct: 5.21,
    incomeTtm: { date: "2026-10-25", basis: "ttm", revenue, operatingIncome: 0.6521 * revenue, incomeBeforeTax: .66 * revenue, incomeTaxExpense: .66 * revenue * .16 },
    balance: { date: "2026-10-25", basis: "quarter", totalDebt: 33.366 * B, totalStockholdersEquity: revenue / 1.8 - 33.366 * B + 99.37 * B, cashAndShortTermInvestments: 99.37 * B },
    quarterRevenue: { latest: { date: "2026-10-25", revenue: 108 * B, days: 91 }, yearAgo: { date: "2025-10-26", revenue: 57.006 * B, days: 91 }, guidedYearAgo: ya },
    guidance: { revenue: 108 * B, periodEnd: "2027-01-31", periodStart: "2026-10-26", asOf: "2026-11-19", source: "synthetic release", ...guide },
  };
}

function growing(values: number[], guide: number, windowSize = 9) {
  const rows = values.map((revenue, k) => ({ date: plus("2026-09-27", (k - 11) * 91), revenue: revenue * B, days: 91 }));
  const ttm = rows.slice(-4).reduce((sum, row) => sum + row.revenue, 0);
  const i = scenario(SEASONAL).inputs;
  const input: DcfAssumptionInputs = {
    ...i, analystEstimates: null, incomeTtm: { ...i.incomeTtm!, date: rows[11].date, revenue: ttm },
    quarterRevenue: { latest: rows[11], yearAgo: rows[7], guidedYearAgo: rows[8], guidedYearAgoWindow: rows.slice(0, 9).reverse().slice(0, windowSize) },
    guidance: { revenue: guide * B, periodStart: plus(rows[11].date, 1), periodEnd: plus(rows[11].date, 91), asOf: plus(rows[11].date, 30), source: "synthetic release" },
  };
  return { input, ttmTimesYoy: ttm * guide / values[8], anchor: build(input).revenueAnchor! };
}

function withRelease(base: string, guidedQuarter: string, amount = "$300 - $320 million") {
  const bundle = completeCurrencyBundle({ estimates: false });
  bundle.builtAt = plus(base, 45) + "T00:00:00.000Z";
  const releaseUrl = "https://www.sec.gov/Archives/edgar/data/1/000000000126000010/release.htm";
  const humanDate = new Date(base).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const record = buildEarningsReleaseRecord({ filing: { accessionNumber: "0000000001-26-000010", filingDate: plus(base, 30) }, releaseUrl, commentaryUrl: null,
    releaseText: `Company Reports Financial Results. Quarter ended ${humanDate}. Business Outlook Metric ${guidedQuarter.replace("FY", "")} Revenue ${amount}. Quarterly Dividend`, commentaryText: null, includeNarrative: true });
  expect(record.reported.periodEnd).toBe(base);
  expect(record.guidance?.items.some(i => i.metric === "revenue")).toBe(true);
  if (bundle.statements.incomeAnnual.ok) bundle.statements.incomeAnnual.value.data.rows.forEach((row, i) => { row.date = ["2026-01-25", "2025-01-26", "2024-01-28", "2023-01-29"][i] ?? row.date; });
  if (bundle.statements.incomeQuarterly.ok) bundle.statements.incomeQuarterly.value.data.rows.unshift({ date: base, revenue: 300e6, reportedCurrency: "USD" });
  bundle.edgar.currentReports = { ok: true, value: { source: "edgar", endpoint: releaseUrl, fetchedAt: bundle.builtAt, asOf: record.filingDate,
    data: { version: CURRENT_REPORTS_VERSION, releases: [record], events: [], notes: [] } } };
  return bundle;
}

describe("guidance on a seasonal and period-comparable basis", () => {
  it("states the issuer's ex-item effect without moving the revenue level", () => {
    const s = scenario(SEASONAL);
    const plain = build({ ...s.inputs, guidance: s.guide }).revenueAnchor!;
    const qualified = build({ ...s.inputs, guidance: { ...s.guide, qualifiers: ["Excluding the annual event, year-over-year growth would be nearly 400 basis points higher."] } }).revenueAnchor!;
    expect(qualified.yearOneRevenue).toBe(plain.yearOneRevenue);
    expect(qualified.evidence!.guidedYoyIssuerEffectPp).toBe(4);
    expect(qualified.basis).toMatch(/the issuer states that, excluding an item it names, the guided quarter's year-over-year growth would be about 4\.00pp higher/);
    expect(qualified.basis).toContain("this issuer-stated effect is disclosed only and does not adjust any modeled revenue level");
    expect(qualified.basis).not.toContain("year one uses the reported guidance");
  });
  it.each([
    { mode: "guidance-led", source: "guidance" },
    { mode: "consensus-led", source: "consensus" },
    { mode: "guard-refused", source: "run-rate" },
    { mode: "missing-year-ago", source: "run-rate" },
  ] as const)("discloses an issuer effect without misattributing the $mode anchor", ({ mode, source }) => {
    const s = scenario(SEASONAL);
    const guide: DcfGuidance = { ...s.guide, currency: "USD", fiscalYear: 2026,
      ...(mode === "guard-refused" ? { annualRevenueComparison: {
        low: 100e9, high: 200e9, fiscalYear: 2026, currency: "USD", periodLabel: "FY2026",
        source: s.guide.source, asOf: s.guide.asOf,
      } } : {}),
    };
    const input: DcfAssumptionInputs = { ...s.inputs, guidance: guide,
      analystEstimates: mode === "consensus-led" ? s.inputs.analystEstimates : null,
      quarterRevenue: mode === "missing-year-ago" ? { ...s.inputs.quarterRevenue!, guidedYearAgo: null } : s.inputs.quarterRevenue,
    };
    const plain = build(input);
    const qualified = build({ ...input, guidance: { ...guide,
      qualifiers: ["Excluding the annual event, year-over-year growth would be nearly 400 basis points higher."],
    } });
    expect(plain.revenueAnchor!.source).toBe(source);
    expect(qualified.revenueAnchor!.source).toBe(source);
    expect(qualified.revenueAnchor!.evidence!.guidedYoyIssuerEffectPp).toBe(4);
    expect(qualified.revenueAnchor!.basis).not.toContain("year one uses the reported guidance");
    expect(qualified.revenueAnchor!.basis).toContain("this issuer-stated effect is disclosed only and does not adjust any modeled revenue level");
    if (mode === "guard-refused") expect(qualified.revenueAnchor!.basis).toContain("annualization withheld");
    if (mode === "missing-year-ago") expect(qualified.revenueAnchor!.basis).toContain("no same fiscal quarter a year earlier");
    // The anchor basis is also copied verbatim to one note. Assert that duplication
    // explicitly, then compare all other notes and every non-prose assumption exactly.
    const withoutDisclosure = (a: DcfAssumptions) => {
      const anchorNote = `Year-one revenue anchor: ${a.revenueAnchor!.basis}`;
      expect(a.notes.filter(note => note === anchorNote)).toHaveLength(1);
      return JSON.parse(JSON.stringify({ ...a, notes: a.notes.map(note => note === anchorNote ? "anchor disclosure" : note) },
        (key, value) => key === "basis" || key === "guidedYoyIssuerEffectPp" ? undefined : value));
    };
    expect(withoutDisclosure(qualified)).toEqual(withoutDisclosure(plain));
  });
  it("keeps consensus holding a peak quarter at its midpoint (FIN-101 a)", () => {
    const s = scenario(SEASONAL);
    const a = build({ ...s.inputs, guidance: s.guide }).revenueAnchor!;
    expect(a.source).toBe("consensus");
    expect(a.evidence!.guidedFloor).toBeCloseTo(784.006e9, -6);
    expect(a.basis).toMatch(/at or above the twelve-month floor the guidance implies/);
  });
  it("gives consecutive releases at the same pace similar growth (FIN-101 b)", () => {
    const s = scenario(SEASONAL);
    const oct = build({ ...s.inputs, analystEstimates: null, guidance: s.guide });
    const ttm = s.q1 + s.q2 + s.q3 + s.guide.revenue;
    const jan = build({ ...s.inputs, analystEstimates: null, incomeTtm: { ...s.inputs.incomeTtm!, date: "2026-12-31", revenue: ttm },
      quarterRevenue: { latest: { date: "2026-12-31", revenue: s.guide.revenue }, yearAgo: { date: "2025-12-31", revenue: s.d }, guidedYearAgo: { date: "2026-03-31", revenue: s.q1 } },
      guidance: { ...s.guide, revenue: s.q1 * 1.1, periodEnd: "2027-03-31", asOf: "2027-01-30" } });
    expect(oct.revenueAnchor!.source).toBe("guidance");
    expect(jan.revenueAnchor!.source).toBe("guidance");
    expect(oct.growthPath.value[0]).toBeCloseTo(9.98, 2);
    expect(jan.growthPath.value[0]).toBeCloseTo(10, 2);
    expect(oct.revenueAnchor!.evidence!.guidedRunRate).toBeCloseTo(814.415e9, -6);
  });
  it("keeps consensus for a flat season (FIN-101 c)", () => {
    const s = scenario(FLAT);
    expect(build({ ...s.inputs, guidance: s.guide }).revenueAnchor!.source).toBe("consensus");
  });
  it("does not set a level without the guided year-ago quarter (FIN-101-V2)", () => {
    const s = scenario(SEASONAL);
    const a = build({ ...s.inputs, analystEstimates: null, guidance: s.guide, quarterRevenue: { ...s.inputs.quarterRevenue!, guidedYearAgo: null } }).revenueAnchor!;
    expect(a.source).toBe("run-rate");
    expect(a.basis).toMatch(/guidance .* not used for year one: no same fiscal quarter a year earlier/);
    expect(a.evidence!.guidedRunRate).toBeNull();
    expect(a.evidence!.guidedPacePct).not.toBeNull();
  });
  it("compares guided quarters on a 13-week basis in both directions (FIN-301-V1)", () => {
    const a = build(nextReport({ revenue: 108e9 / 91 * 98 })).revenueAnchor!;
    expect(a.evidence!.guidedYoyPct).toBeCloseTo(58.53, 2);
    expect(a.yearOneRevenue).toBeCloseTo(561.13e9, -7);
    const reverse = build(nextReport({ revenue: 68.127e9 * 1.2, periodEnd: "2027-01-24" }, { date: "2026-01-25", revenue: 68.127e9 / 91 * 98, days: 98 })).revenueAnchor!;
    expect(reverse.evidence!.guidedYoyPct).toBeCloseTo(20, 6);
  });
  it("puts sequential evidence on a 13-week basis without using it for a level (FIN-301-V2)", () => {
    for (const [g, gd, latest, ld] of [[108e9 / 91 * 98, 98, 108e9, 91], [54.229e9 / 98 * 91, 91, 54.229e9, 98]]) {
      const i = nextReport({ revenue: g, periodEnd: plus("2026-10-25", gd) });
      i.quarterRevenue = { ...i.quarterRevenue!, latest: { date: "2026-10-25", revenue: latest, days: ld }, guidedYearAgo: null };
      expect(build(i).revenueAnchor!.evidence!.guidedPacePct).toBeCloseTo(0, 6);
    }
  });
  it("carries an annual base at the guided year-over-year pace", () => {
    const i = scenario(SEASONAL).inputs;
    const a = build({ ...i, analystEstimates: null, incomeTtm: { ...i.incomeTtm!, date: "2025-12-31", basis: "annual", revenue: 1000e9 },
      quarterRevenue: { latest: { date: "2025-12-31", revenue: 280e9 }, yearAgo: null, guidedYearAgo: { date: "2025-03-31", revenue: 250e9, days: 90 } },
      guidance: { revenue: 270e9, periodStart: "2026-01-01", periodEnd: "2026-03-31", asOf: "2026-02-01", source: "synthetic release" } }).revenueAnchor!;
    expect(a.source).toBe("guidance");
    expect(a.yearOneRevenue).toBeCloseTo(1080e9, -3);
    expect(a.runRate).toBeNull();
  });
  it("dates Q4 by the fiscal rule and Q1 at 13 weeks even on a calendar month end", () => {
    expect(nextPeriodRevenueGuidance(withRelease("2026-10-25", "Q4 FY2027"))).toMatchObject({ periodEnd: "2027-01-31", periodEndBasis: "fiscal-year-end-rule" });
    expect(nextPeriodRevenueGuidance(withRelease("2027-01-31", "Q1 FY2028"))).toMatchObject({ periodEnd: "2027-05-02", periodEndBasis: "13-week-quarter" });
    const s = scenario(SEASONAL);
    const a = build({ ...s.inputs, analystEstimates: null, fiscalCalendar: fiscalYearRule(["2026-01-25", "2025-01-26", "2024-01-28"]),
      incomeTtm: { ...s.inputs.incomeTtm!, date: "2026-04-26" },
      quarterRevenue: { ...s.inputs.quarterRevenue!, guidedYearAgo: { date: "2025-07-27", revenue: s.guide.revenue / 1.1 } },
      guidance: { ...s.guide, periodStart: "2026-04-27", periodEnd: "2026-07-26", asOf: "2026-05-25", periodEndBasis: "13-week-quarter" } }).revenueAnchor!;
    expect(a.basis).toMatch(/length assumed to be 13 weeks: the fiscal year ending 2027-01-31 has 53 weeks/);
  });
  it("deseasonalizes growth-adjusted share and keeps the guided level (R1)", () => {
    const a = growing(Array.from({ length: 12 }, (_, k) => 100 * 1.05 ** k), 100 * 1.05 ** 12).anchor;
    expect(a.evidence!.guidedSeasonalFactor).toBeCloseTo(1, 12);
    expect(a.yearOneRevenue).toBeCloseTo(4 * 179.5856e9 * Math.pow(1.05 ** 4, .375), -6);
  });
  it("takes a peak-quarter guide out of a stable season (R1)", () => {
    const { anchor: a, ttmTimesYoy } = growing(Array.from({ length: 12 }, (_, k) => 100 * 1.05 ** k * (k % 4 === 0 ? 1.15 : 1)), 100 * 1.05 ** 12 * 1.15);
    expect(a.evidence!.guidedSeasonalFactor).toBeGreaterThan(1.10);
    expect(a.yearOneRevenue / ttmTimesYoy).toBeCloseTo(1, 2);
  });
  it("does not import last year's acceleration for a decelerating grower (R1)", () => {
    const { anchor: a, ttmTimesYoy } = growing([20, 21, 22.5, 24.5, 27, 30, 34, 40, 48, 57.36, 68.72, 81.02], 90.99);
    const rho = (152 / 95) ** .25;
    const s = (48 / 152) / (rho ** 3 / (1 + rho + rho ** 2 + rho ** 3));
    expect(a.evidence!.guidedSeasonalFactor).toBeCloseTo(1.0682, 4);
    expect(a.yearOneRevenue).toBeLessThan(.95 * ttmTimesYoy);
    expect(a.yearOneRevenue / ttmTimesYoy).toBeCloseTo(.8956, 4);
    expect(a.yearOneRevenue).toBeCloseTo(4 * 90.99e9 / s * (90.99 / 48) ** .375, -6);
  });
  it("falls back below eight quarters and for a broken year-ago window", () => {
    const values = Array.from({ length: 12 }, (_, k) => 100 * 1.05 ** k);
    const { anchor: a, input, ttmTimesYoy } = growing(values, 100 * 1.05 ** 12, 7);
    expect(a.evidence!.guidedSeasonalFactor).toBeNull();
    expect(a.yearOneRevenue).toBeCloseTo(ttmTimesYoy, -6);
    const full = growing(values, 100 * 1.05 ** 12).input;
    full.quarterRevenue!.guidedYearAgoWindow![2].date = "2020-01-01";
    expect(build(full).revenueAnchor!.evidence!.guidedSeasonalFactor).toBeNull();
    input.quarterRevenue!.guidedYearAgo!.date = "2026-05-01";
    expect(build(input).revenueAnchor!.source).toBe("run-rate");
  });
  it("averages up to three yearly factors after scaling every quarter to 13 weeks", () => {
    const s = scenario(SEASONAL);
    const values = [120, 90, 90, 100, 80, 110, 110, 100, 160, 80, 80, 80, 100, 100, 100, 100];
    const window = values.map((revenue, index) => ({ date: plus("2025-12-31", -91 * index), revenue: revenue * B, days: 91 }));
    // Equal 400B trailing years: factors 1.2, 0.8 and 1.6 average to 1.2.
    // The filed 14-week observation below has the same revenue per week.
    window[2].revenue *= 14 / 13;
    window[2].days = 98;
    const a = build({ ...s.inputs, analystEstimates: null, guidance: s.guide,
      quarterRevenue: { ...s.inputs.quarterRevenue!, guidedYearAgo: window[0], guidedYearAgoWindow: window } }).revenueAnchor!;
    expect(a.evidence!.guidedSeasonalFactor).toBeCloseTo(1.2, 12);
    expect(a.basis).toContain("mean of 3 yearly factors");
  });
  it("uses all three filed NVDA factors, not the one-factor pre-flight illustration", () => {
    // Saved census revenues, newest first from Q3 FY2026; all these quarters are 13 weeks.
    const revenue = [57.006, 46.743, 44.062, 39.331, 35.082, 30.040, 26.044, 22.103, 18.120, 13.507, 7.192, 6.051, 5.931, 6.704, 8.288, 7.643];
    const dates = ["2025-10-26", "2025-07-27", "2025-04-27", "2025-01-26", "2024-10-27", "2024-07-28", "2024-04-28", "2024-01-28", "2023-10-29", "2023-07-30", "2023-04-30", "2023-01-29", "2022-10-30", "2022-07-31", "2022-05-01", "2022-01-30"];
    const window = revenue.map((r, i) => ({ date: dates[i], revenue: r * B, days: 91 }));
    const base = scenario(SEASONAL).inputs;
    const a = build({ ...base, analystEstimates: null, incomeTtm: { ...base.incomeTtm!, date: "2026-07-26", revenue: 302.969e9 },
      quarterRevenue: { latest: { date: "2026-07-26", revenue: 96.221e9, days: 91 }, yearAgo: { date: "2025-07-27", revenue: 46.743e9, days: 91 }, guidedYearAgo: window[0], guidedYearAgoWindow: window },
      guidance: { revenue: 108e9, periodStart: "2026-07-27", periodEnd: "2026-10-25", asOf: "2026-08-26", source: "saved SEC revenue fixture" } }).revenueAnchor!;
    expect(a.evidence!.guidedSeasonalFactor).toBeCloseTo((1.0193048814079904 + .9050296941259413 + 1.3745956935570887) / 3, 12);
    expect(a.yearOneRevenue).toBeCloseTo(499224120900.57806, -3);
    // With Task 2's corrected consensus window, the level is 3.31% below it;
    // main's 548.97B was 4.29% above its 526.40B window. No threshold retuning.
    expect(Math.abs(a.yearOneRevenue / 516335229025.02045 - 1)).toBeLessThan(Math.abs(548968521166.424 / 526398989999.08923 - 1));
  });
  it("wires the guided year-ago quarter on an annual base (compute wiring)", () => {
    const bundle = withRelease("2025-12-31", "Q1 2026");
    bundle.builtAt = "2026-07-06T00:00:00.000Z"; // fixture's dated ERP observation must precede the analysis
    if (!bundle.statements.incomeQuarterly.ok || !bundle.statements.incomeAnnual.ok) throw new Error("missing fixture rows");
    bundle.statements.incomeAnnual.value.data.rows[0].date = "2025-12-31";
    bundle.statements.incomeQuarterly.value.data.rows = bundle.statements.incomeQuarterly.value.data.rows.filter((row, index, rows) => String(row.date) <= "2025-12-31" && row.date !== "2025-09-30" && index === rows.findIndex(r => r.date === row.date));
    const c = runStageB(bundle);
    if (c.valuation.kind !== "dcf") throw new Error("expected annual DCF");
    expect(c.valuation.assumptions, JSON.stringify(c.valuation.gaps)).not.toBeNull();
    expect(c.valuation.assumptions!.forecastPeriod?.basis).toBe("fiscal-year");
    expect(c.valuation.assumptions!.revenueAnchor!.source).toBe("guidance");
    expect(c.valuation.assumptions!.revenueAnchor!.evidence!.guidedYoyPct).not.toBeNull();
    expect(c.valuation.assumptions!.revenueAnchor!.evidence!.guidedYoyPct).toBeCloseTo((310 / 240 - 1) * 100, 8);
  });
  it("supplies enough quarters ending at the guided year-ago quarter (compute wiring)", () => {
    const bundle = withRelease("2026-09-27", "Q4 2026", "$180 - $190 million");
    if (!bundle.statements.incomeQuarterly.ok || !bundle.statements.balanceQuarterly.ok) throw new Error("missing fixture rows");
    const baseRow = bundle.statements.incomeQuarterly.value.data.rows[1];
    bundle.statements.incomeQuarterly.value.data.rows = Array.from({ length: 11 }, (_, n) => {
      const date = plus("2026-09-27", -91 * n);
      return { ...baseRow, date, revenue: 100e6 * 1.05 ** (11 - n), fieldProvenance: { revenue: { source: "edgar", unit: "USD", periodStart: plus(date, -90), periodEnd: date, observedAt: bundle.builtAt, tags: ["Revenues"], filings: [] } } };
    });
    bundle.statements.balanceQuarterly.value.data.rows[0].date = "2026-09-27";
    const c = runStageB(bundle);
    if (c.valuation.kind !== "dcf") throw new Error("expected DCF");
    expect(c.valuation.assumptions!.revenueAnchor!.source).toBe("guidance");
    expect(c.valuation.assumptions!.revenueAnchor!.evidence!.guidedSeasonalFactor).not.toBeNull();
    expect(c.valuation.assumptions!.revenueAnchor!.evidence!.guidedSeasonalFactor).toBeGreaterThan(0);
    bundle.statements.incomeQuarterly.value.data.rows = bundle.statements.incomeQuarterly.value.data.rows.slice(0, 7);
    const seven = runStageB(bundle);
    if (seven.valuation.kind !== "dcf") throw new Error("expected DCF");
    expect(seven.valuation.assumptions!.revenueAnchor!.source).toBe("guidance");
    expect(seven.valuation.assumptions!.revenueAnchor!.evidence!.guidedSeasonalFactor).toBeNull();
  });
});
