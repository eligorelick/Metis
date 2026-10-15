import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { VendorSplitEvidence } from "@/providers/splitEvents";

interface Point { start?: string; end: string; val: number; filed: string; form: string; fp: string; accn?: string }
const annual = (val: number): Point => ({ start: "2025-01-01", end: "2025-12-31", val, filed: "2026-02-06", form: "10-K", fp: "FY" });
const q1 = (val: number): Point => ({ start: "2026-01-01", end: "2026-03-31", val, filed: "2026-04-30", form: "10-Q", fp: "Q1" });
const h1 = (val: number): Point => ({ start: "2026-01-01", end: "2026-06-30", val, filed: "2026-07-31", form: "10-Q", fp: "Q2" });
const q2 = (val: number): Point => ({ ...h1(val), start: "2026-04-01" });
const vendorSplits: VendorSplitEvidence = { status: "retrieved", source: "test:vendor", events: [], coverage: [{ from: "2020-01-01", to: "2026-10-15" }] };
const options = { symbol: "TEST", cik: "0000000001", annualPeriods: 2, quarterlyPeriods: 6, asOf: "2026-10-15", vendorSplits };
function facts(): CompanyFacts {
  const concept = (points: Point[]) => ({ label: "filed line", units: { USD: points.map((p, i) => ({ ...p,
    fy: Number(p.end.slice(0, 4)), accn: p.accn ?? `0000000001-26-${String(i).padStart(6, "0")}`,
  })) } });
  return { cik: 1, entityName: "Test", facts: { "us-gaap": {
    Revenues: concept([annual(716_924_000_000), q1(181_519_000_000), h1(382_125_000_000), q2(200_606_000_000)]),
    Assets: concept([annual(1), q1(1), h1(1)].map(point => ({ ...point, start: undefined }))),
    NetIncomeLoss: concept([annual(77_670_000_000), q1(30_255_000_000), h1(92_902_000_000), q2(62_647_000_000),
      { ...q1(118_472_000_000), start: "2025-04-01" }, { ...h1(135_281_000_000), start: "2025-07-01" }]),
    NetCashProvidedByUsedInOperatingActivities: concept([annual(139_514_000_000), q1(26_032_000_000), h1(71_419_000_000), q2(45_387_000_000),
      { ...q1(148_531_000_000), start: "2025-04-01" }, { ...h1(161_403_000_000), start: "2025-07-01" }]),
    PaymentsToAcquireProductiveAssets: concept([annual(131_819_000_000), q1(44_203_000_000), h1(98_411_000_000), q2(54_208_000_000),
      { ...h1(173_028_000_000), start: "2025-07-01" }]),
  } } };
}

describe("quarterly cash-flow fiscal windows", () => {
  // Reproduces AMZN's standard facts: 10-Q cash flow includes quarter, YTD and TTM.
  it("does not mistake a quarterly filing's rolling twelve-month income for a fiscal year", () => {
    const built = buildStatementsFromCompanyFacts(facts(), options);
    expect(built.cashflowQuarterly.rows.slice(0, 2)).toMatchObject([
      { date: "2026-06-30", period: "Q2", operatingCashFlow: 45_387_000_000, capitalExpenditure: -54_208_000_000, freeCashFlow: -8_821_000_000 },
      { date: "2026-03-31", period: "Q1", operatingCashFlow: 26_032_000_000, capitalExpenditure: -44_203_000_000 },
    ]);
    const quarter = built.cashflowQuarterly.rows[0]!;
    expect(quarter.fieldProvenance?.operatingCashFlow).toMatchObject({ periodStart: "2026-04-01", periodEnd: "2026-06-30", derivation: "ytd-difference" });
    expect(quarter.fieldProvenance?.operatingCashFlow.filings).toHaveLength(2);
    expect(built.cashflowAnnual.rows[0]).toMatchObject({ date: "2025-12-31", operatingCashFlow: 139_514_000_000 });
    expect(built.cashflowAnnual.rows.some(row => row.date === "2026-06-30")).toBe(false);
  });

  it("uses the same fiscal window for a signed equity-method YTD result", () => {
    const input = facts();
    input.facts["us-gaap"]!.IncomeLossFromEquityMethodInvestments = {
      label: "Equity-method investment activity, as filed", units: { USD: [q1(-19_000_000), h1(-30_000_000)].map((point, i) => ({ ...point, fy: 2026, accn: `0000000001-26-${String(i).padStart(6, "0")}` })) },
    };
    const quarter = buildStatementsFromCompanyFacts(input, options).incomeQuarterly.rows[0]!;
    expect(quarter).toMatchObject({ date: "2026-06-30", equityMethodIncomeLoss: -11_000_000 });
    expect(quarter.fieldProvenance?.equityMethodIncomeLoss).toMatchObject({ periodStart: "2026-04-01", derivation: "ytd-difference" });
  });

  it("keeps an annual window whose newest comparative copy was filed on a 10-Q", () => {
    const input = facts();
    const concepts = input.facts["us-gaap"]!;
    for (const tag of ["Revenues", "NetIncomeLoss"]) {
      const concept = concepts[tag] as { units: { USD: Record<string, unknown>[] } };
      const original = concept.units.USD.find(point => point.start === "2025-01-01" && point.end === "2025-12-31")!;
      concept.units.USD.push({ ...original, filed: "2026-07-31", form: "10-Q", fp: "Q2", accn: "0000000001-26-000099" });
    }
    const thirdQuarter = { end: "2025-09-30", filed: "2025-10-31", form: "10-Q", fp: "Q3", fy: 2025, accn: "0000000001-25-000009" };
    (concepts.Assets as { units: { USD: unknown[] } }).units.USD.push({ ...thirdQuarter, val: 1 });
    (concepts.NetCashProvidedByUsedInOperatingActivities as { units: { USD: unknown[] } }).units.USD.push({ ...thirdQuarter, start: "2025-01-01", val: 100_000_000_000 });
    const built = buildStatementsFromCompanyFacts(input, options);
    expect(built.cashflowQuarterly.rows.slice(0, 2).map(row => row.operatingCashFlow)).toEqual([45_387_000_000, 26_032_000_000]);
    expect(built.cashflowQuarterly.rows.find(row => row.date === "2025-12-31")).toMatchObject({ period: "Q4", operatingCashFlow: 39_514_000_000 });
  });

  it.each([
    { weeks: 52, annualEnd: "2025-08-30", start: "2025-08-31", q1End: "2025-11-29", q2Start: "2025-11-30", h1End: "2026-02-28", ttmQ1Start: "2024-12-01", ttmH1Start: "2025-03-02" },
    { weeks: 53, annualEnd: "2025-09-06", start: "2025-09-07", q1End: "2025-12-06", q2Start: "2025-12-07", h1End: "2026-03-07", ttmQ1Start: "2024-12-08", ttmH1Start: "2025-03-09" },
  ])("preserves a noncalendar $weeks-week year beside quarterly rolling income", calendar => {
    const input = facts();
    const dates: Record<string, string> = {
      "2025-01-01": "2024-09-01", "2025-12-31": calendar.annualEnd,
      "2026-01-01": calendar.start, "2026-03-31": calendar.q1End,
      "2026-04-01": calendar.q2Start, "2026-06-30": calendar.h1End,
      "2025-04-01": calendar.ttmQ1Start, "2025-07-01": calendar.ttmH1Start,
      "2026-02-06": "2025-11-06", "2026-04-30": "2026-01-06", "2026-07-31": "2026-04-06",
    };
    for (const concept of Object.values(input.facts["us-gaap"]!)) {
      const points = (concept as { units: { USD: Point[] } }).units.USD;
      for (const point of points) {
        if (point.start) point.start = dates[point.start] ?? point.start;
        point.end = dates[point.end] ?? point.end;
        point.filed = dates[point.filed] ?? point.filed;
      }
    }
    const built = buildStatementsFromCompanyFacts(input, options);
    expect(built.cashflowAnnual.rows[0]).toMatchObject({ date: calendar.annualEnd, fiscalYear: "2025", operatingCashFlow: 139_514_000_000 });
    expect(built.cashflowQuarterly.rows.slice(0, 2)).toMatchObject([
      { date: calendar.h1End, period: "Q2", fiscalYear: "2026", operatingCashFlow: 45_387_000_000 },
      { date: calendar.q1End, period: "Q1", fiscalYear: "2026", operatingCashFlow: 26_032_000_000 },
    ]);
    expect(built.cashflowQuarterly.rows[0]?.fieldProvenance?.operatingCashFlow.periodStart).toBe(calendar.q2Start);
  });
});
