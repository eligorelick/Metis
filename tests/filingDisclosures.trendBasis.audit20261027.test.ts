/**
 * FIN-511-V1 (audit 2026-10-27): a quarterly growth cell divides two quarters
 * that sit on one filed presentation. The rows are BAC-shaped: Q2 and Q1
 * FY2025 were re-presented by the 10-Qs of 2026, after Q3 FY2025 was filed.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import type { DataBundle } from "@/pipeline/types";

import { completeCurrencyBundle, M } from "./helpers/currencyBundle";

const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;

type Ref = { accn: string; filed: string; form: string };
const ref = (form: string, filed: string): Ref => ({ accn: `0000000070-${filed.slice(0, 4)}-${filed.slice(5, 7)}${filed.slice(8)}`, filed, form });

interface Spec {
  date: string;
  fiscalYear: string;
  period: string;
  revenue: number | null;
  supplied: Ref | null;
  /** [first-reported value in millions, first filing, restating filing] */
  represented?: [number, Ref, Ref];
}

const Q = (form: string, filed: string) => ref(form, filed);
const SPECS: Spec[] = [
  { date: "2026-06-30", fiscalYear: "2026", period: "Q2", revenue: 31_558, supplied: Q("10-Q", "2026-07-31") },
  { date: "2026-03-31", fiscalYear: "2026", period: "Q1", revenue: 32_100, supplied: Q("10-Q", "2026-05-01") },
  { date: "2025-12-31", fiscalYear: "2025", period: "Q4", revenue: null, supplied: null },
  { date: "2025-09-30", fiscalYear: "2025", period: "Q3", revenue: 28_088, supplied: Q("10-Q", "2025-10-31") },
  { date: "2025-06-30", fiscalYear: "2025", period: "Q2", revenue: 27_443, supplied: Q("10-Q", "2026-07-31"),
    represented: [26_463, Q("10-Q", "2025-07-31"), Q("10-Q", "2026-07-31")] },
  { date: "2025-03-31", fiscalYear: "2025", period: "Q1", revenue: 28_247, supplied: Q("10-Q", "2026-05-01"),
    represented: [27_366, Q("10-Q", "2025-04-29"), Q("10-Q", "2026-05-01")] },
  { date: "2024-12-31", fiscalYear: "2024", period: "Q4", revenue: null, supplied: null },
  { date: "2024-09-30", fiscalYear: "2024", period: "Q3", revenue: 25_345, supplied: Q("10-Q", "2025-10-31") },
  { date: "2024-06-30", fiscalYear: "2024", period: "Q2", revenue: 25_377, supplied: Q("10-Q", "2025-07-31") },
  { date: "2024-03-31", fiscalYear: "2024", period: "Q1", revenue: 25_818, supplied: Q("10-Q", "2025-04-29") },
];

function row(s: Spec, edgar: boolean): Record<string, unknown> {
  const base: Record<string, unknown> = {
    date: s.date, fiscalYear: s.fiscalYear, period: s.period, reportedCurrency: "USD",
    ...(s.revenue === null ? {} : { revenue: s.revenue * M }),
  };
  if (!edgar || s.revenue === null || s.supplied === null) return base;
  const out: Record<string, unknown> = {
    ...base,
    fieldProvenance: {
      revenue: { source: "edgar", unit: "USD", periodStart: null, periodEnd: s.date, observedAt: "2026-10-22T00:00:00.000Z", tags: ["us-gaap/Revenues"], filings: [s.supplied] },
    },
  };
  if (s.represented) {
    const [first, firstFiling, restating] = s.represented;
    out.original = { revenue: { ...firstFiling, value: first * M } };
    out.restatement = [{
      date: s.date, field: "revenue", original: first * M, restated: s.revenue * M,
      changePct: Number((((s.revenue - first) / first) * 100).toFixed(4)),
      originalFiling: firstFiling, restatedFiling: restating,
    }];
  }
  return out;
}

function fixture(edgar: boolean): DataBundle {
  const bundle = completeCurrencyBundle({}) as DataBundle;
  const income = bundle.statements.incomeQuarterly;
  if (!income.ok) throw new Error("fixture");
  (income.value as { source: string }).source = edgar ? "edgar" : "fmp";
  income.value.data.rows = SPECS.map((s) => row(s, edgar)) as never;
  return { ...bundle, builtAt: "2026-10-22T00:00:00.000Z" };
}

const edgarBundle = fixture(true);
const fmpBundle = fixture(false);
const trend = (b: DataBundle, d: string) => buildFilingDisclosures(b)!.quarterlyTrend.find((r) => r.periodEnd === d)!;
const t = (d: string) => trend(edgarBundle, d);

describe("quarterly growth on one presentation (FIN-511-V1)", () => {
  it("a QoQ against a later-re-presented quarter uses that quarter's first-reported copy", () => {
    expect(t("2025-09-30").revenueQoqPct).toBeCloseTo(6.1406, 3);
    expect(t("2025-09-30").revenueGrowthNotes?.join(" ")).toMatch(/first-reported revenue 26463000000 \(10-Q 2025-07-31\).*2026-07-31/);
  });
  it("a YoY whose own quarter was re-presented, with no re-presented comparison, is a dash with a note", () => {
    expect(t("2025-06-30").revenueYoyPct).toBeNull();
    expect(t("2025-03-31").revenueYoyPct).toBeNull();
    expect(t("2025-03-31").revenueQoqPct).toBeNull();
    expect(t("2025-06-30").revenueGrowthNotes?.join(" ")).toMatch(/YoY not shown: 2025-06-30 was re-presented in 10-Q 2026-07-31/);
  });
  it("controls: cells on one presentation are unchanged", () => {
    expect(t("2026-06-30").revenueYoyPct).toBeCloseTo(14.9948, 3);
    expect(t("2025-06-30").revenueQoqPct).toBeCloseTo(-2.8463, 3);
    expect(t("2025-09-30").revenueYoyPct).toBeCloseTo(10.8226, 3);
    expect(t("2026-03-31").revenueQoqPct).toBeNull();
    expect(t("2026-06-30").revenueGrowthNotes).toBeUndefined();
  });
  it("the classic table prints the one-basis cell and the dash, and the note once", () => {
    const table = filingDisclosureTables(buildFilingDisclosures(edgarBundle)! as never, "fundamentals").find((x) => x.heading.startsWith("Quarterly trend"))!;
    expect(table.rows.find((r) => r[0] === "2025-09-30")!.slice(3, 5)).toEqual(["+10.8%", "+6.1%"]);
    expect(table.rows.find((r) => r[0] === "2025-06-30")![3]).toBe("—");
    expect((table.note!.match(/YoY not shown: 2025-06-30/g) ?? []).length).toBe(1);
  });
  it("the payload registers the one-basis figure and no figure for a dashed cell", () => {
    const payload = assembleContextPayload(edgarBundle, runStageB(edgarBundle), EMPTY_VALIDATION);
    const fig = (l: string) => payload.quarterlyTrend!.figures.find((f) => f.label === l);
    expect(fig("revenue growth quarter over quarter, quarter ended 2025-09-30")?.value).toBeCloseTo(6.1406, 3);
    expect(fig("revenue growth year over year, quarter ended 2025-06-30")).toBeUndefined();
    expect(payload.quarterlyTrend!.notes.join(" ")).toMatch(/YoY not shown: 2025-06-30/);
  });
  it("control: FMP-route rows without provenance or flags compute growth as before", () => {
    expect(trend(fmpBundle, "2025-06-30").revenueYoyPct).toBeCloseTo(8.1412, 3);
    expect(trend(fmpBundle, "2025-09-30").revenueQoqPct).toBeCloseTo(2.3503, 3);
    expect(trend(fmpBundle, "2025-06-30").revenueGrowthNotes).toBeUndefined();
  });
  it("a malformed restatement or original falls back to today's arithmetic", () => {
    const b = fixture(true);
    const inc = b.statements.incomeQuarterly;
    if (!inc.ok) throw new Error("fixture");
    const rows = inc.value.data.rows as unknown as Record<string, unknown>[];
    const q2 = rows.find((r) => r.date === "2025-06-30")!;
    q2.original = { revenue: { value: "x", filed: 1 } };
    q2.restatement = [{ field: "revenue", restatedFiling: { filed: 5 } }];
    expect(trend(b, "2025-09-30").revenueQoqPct).toBeCloseTo(2.3503, 3);
  });
});
