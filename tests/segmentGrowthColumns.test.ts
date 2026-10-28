import { describe, expect, it } from "vitest";
import { priorQuarterIndex, QOQ_WINDOW_DAYS, YOY_WINDOW_DAYS, type QuarterlySegmentRevenue } from "@/edgar/segmentFacts";
import { runStageB } from "@/pipeline/compute";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import type { DataBundle } from "@/pipeline/types";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const BUILT_AT = "2026-07-06T00:00:00.000Z";
const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;
const HEADING = "Segment revenue by quarter — Reportable segment";

/** Synthetic bundle whose only segment axis holds the given quarters (newest first) and rows. */
function withSegments(quarters: { start: string; end: string }[], rows: Record<string, (number | null)[]>): DataBundle {
  const bundle = completeCurrencyBundle({});
  const total = quarters.map((_, i) => Object.values(rows).reduce<number | null>((sum, v) => (sum === null || v[i] == null ? null : sum + v[i]!), 0));
  const data: QuarterlySegmentRevenue = {
    quarters,
    total,
    currency: "USD",
    notes: [],
    filings: [{ accession: "0000000000-26-000001", form: "10-Q", filingDate: "2026-05-20", concept: null }],
    axes: [{
      axis: "srt:ProductOrServiceAxis",
      axisLabel: "Reportable segment",
      currency: "USD",
      quarters,
      rows: Object.entries(rows).map(([label, values]) => ({ member: `x:${label.replace(/\W/g, "")}Member`, label, values, childOf: null })),
      total,
      priorPresentation: [],
      derivedCells: 0,
      residualCells: 0,
    }],
  };
  (bundle.edgar as unknown as Record<string, unknown>).quarterlySegments = {
    ok: true,
    value: { data, asOf: quarters[0]!.end, source: "edgar", endpoint: "fixture", fetchedAt: BUILT_AT },
  };
  return bundle;
}

function payloadOf(bundle: DataBundle) {
  return assembleContextPayload(bundle, runStageB(bundle), EMPTY_VALIDATION);
}

function segmentRow(bundle: DataBundle, label: string): string[] {
  const table = filingDisclosureTables(buildFilingDisclosures(bundle), "business").find((t) => t.heading === HEADING)!;
  return table.rows.find((r) => r[0] === label)!;
}

const contiguousQuarters = [["2026-01-26", "2026-04-26"], ["2025-10-27", "2026-01-25"], ["2025-07-28", "2025-10-26"], ["2025-04-28", "2025-07-27"], ["2025-01-27", "2025-04-27"]]
  .map(([start, end]) => ({ start: start!, end: end! }));

describe("segment growth is computed only against the quarter the label names (AI-406)", () => {
  it("finds the adjacent and year-ago columns by date, including 14-week and 53-week calendars", () => {
    expect(priorQuarterIndex(["2026-04-26", "2025-04-27"], QOQ_WINDOW_DAYS)).toBeNull();
    expect(priorQuarterIndex(["2026-04-26", "2025-04-27"], YOY_WINDOW_DAYS)).toBe(1);
    const contiguous = ["2026-04-26", "2026-01-25", "2025-10-26", "2025-07-27", "2025-04-27"];
    expect(priorQuarterIndex(contiguous, QOQ_WINDOW_DAYS)).toBe(1);
    expect(priorQuarterIndex(contiguous, YOY_WINDOW_DAYS)).toBe(4);
    expect(priorQuarterIndex(["2026-01-03", "2025-09-27"], QOQ_WINDOW_DAYS)).toBe(1); // 98 days: a 14-week quarter
    expect(priorQuarterIndex(["2026-01-03", "2024-12-28"], YOY_WINDOW_DAYS)).toBe(1); // 371 days: a 53-week year
    // Controls: empty input, a single column, and a 348-day gap that no quarterly calendar produces.
    expect(priorQuarterIndex([], QOQ_WINDOW_DAYS)).toBeNull();
    expect(priorQuarterIndex(["2026-04-26"], YOY_WINDOW_DAYS)).toBeNull();
    expect(priorQuarterIndex(["2026-04-26", "2025-05-13"], YOY_WINDOW_DAYS)).toBeNull();
  });

  it("works on a fiscal calendar that differs from the calendar year (June quarter ends)", () => {
    const ends = ["2026-06-27", "2026-03-28", "2025-12-27", "2025-09-27", "2025-06-28"];
    expect(priorQuarterIndex(ends, QOQ_WINDOW_DAYS)).toBe(1);
    expect(priorQuarterIndex(ends, YOY_WINDOW_DAYS)).toBe(4);
  });

  it("never registers or prints a year-over-year change as quarter over quarter", () => {
    const bundle = withSegments([{ start: "2026-01-26", end: "2026-04-26" }, { start: "2025-01-27", end: "2025-04-27" }],
      { "Segment A": [75_246e6, 39_112e6], "Segment B": [10_000e6, 9_000e6] });
    const payload = payloadOf(bundle);
    const labels = (payload.quarterlyTrend?.figures ?? []).map((f) => f.label);
    expect(labels.some((l) => /revenue growth quarter over quarter/.test(l) && l.startsWith("Reportable segment:"))).toBe(false);
    expect(payload.quarterlyTrend!.figures.find((f) => f.label === "Reportable segment: Segment A revenue growth year over year, quarter ended 2026-04-26"))
      .toMatchObject({ value: 92.39, unit: "%" });
    // Control: the dated revenue rows (segmentRevenueSection, which keeps segmentColumns) still show both quarters.
    expect(payload.segmentRevenue!.figures.map((f) => f.label)).toEqual(expect.arrayContaining([
      "Reportable segment: Segment A revenue, quarter ended 2026-04-26", "Reportable segment: Segment A revenue, quarter ended 2025-04-27"]));
    expect(segmentRow(bundle, "Segment A").slice(3, 5)).toEqual(["—", "+92.4%"]); // QoQ dash, YoY
  });

  it("keeps quarter-over-quarter growth for contiguous quarters (control)", () => {
    const bundle = withSegments(contiguousQuarters, { "Segment A": [75_246e6, 70_000e6, 60_000e6, 50_000e6, 39_112e6], "Segment B": [10_000e6, 9_800e6, 9_500e6, 9_200e6, 9_000e6] });
    const labels = payloadOf(bundle).quarterlyTrend!.figures.map((f) => f.label);
    expect(labels).toContain("Reportable segment: Segment A revenue growth quarter over quarter, quarter ended 2026-04-26");
    expect(labels).toContain("Reportable segment: Segment A revenue growth year over year, quarter ended 2026-04-26");
    expect(segmentRow(bundle, "Segment A").slice(6, 8)).toEqual(["+7.5%", "+92.4%"]);
  });

  it("withholds year over year when the year-ago quarter is missing and keeps quarter over quarter", () => {
    const bundle = withSegments(contiguousQuarters.slice(0, 4), { "Segment A": [75_246e6, 70_000e6, 60_000e6, 50_000e6] });
    const labels = payloadOf(bundle).quarterlyTrend!.figures.map((f) => f.label);
    expect(labels).toContain("Reportable segment: Segment A revenue growth quarter over quarter, quarter ended 2026-04-26");
    expect(labels.some((l) => /Segment A revenue growth year over year/.test(l))).toBe(false);
    expect(segmentRow(bundle, "Segment A").slice(5, 7)).toEqual(["+7.5%", "—"]);
  });

  it("treats a 14-week quarter as adjacent and a 53-week year as the year-ago quarter", () => {
    const q = [{ start: "2025-09-28", end: "2026-01-03" }, { start: "2025-06-29", end: "2025-09-27" }, { start: "2025-03-30", end: "2025-06-28" },
      { start: "2024-12-29", end: "2025-03-29" }, { start: "2024-09-29", end: "2024-12-28" }];
    const figures = payloadOf(withSegments(q, { "Segment A": [120e6, 100e6, 95e6, 90e6, 80e6] })).quarterlyTrend!.figures;
    expect(figures.find((f) => f.label.includes("growth quarter over quarter, quarter ended 2026-01-03"))).toMatchObject({ value: 20 });
    expect(figures.find((f) => f.label.includes("growth year over year, quarter ended 2026-01-03"))).toMatchObject({ value: 50 });
  });
});
