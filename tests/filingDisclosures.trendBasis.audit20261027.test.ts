/**
 * FIN-511-V1 (audit 2026-10-27): a quarterly growth cell divides two quarters
 * that sit on one filed presentation. The rows are BAC-shaped: Q2 and Q1
 * FY2025 were re-presented by the 10-Qs of 2026, after Q3 FY2025 was filed.
 */
import { describe, expect, it } from "vitest";

import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
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
    expect(t("2025-09-30").revenueGrowthNotes?.join(" ")).toMatch(/first-reported revenue \$26\.46B \(10-Q 2025-07-31\).*2026-07-31/);
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

// ---------------------------------------------------------------------------
// Fix round 1: M1 (untested branches), I1 (a presentation first filed in the printed quarter's own filing).
// ---------------------------------------------------------------------------

type R = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function handBundle(rows: R[]): DataBundle {
  const bundle = completeCurrencyBundle({}) as DataBundle;
  (bundle.statements.incomeQuarterly as R).value.source = "edgar";
  (bundle.statements.incomeQuarterly as R).value.data.rows = rows;
  return { ...bundle, builtAt: "2026-10-22T00:00:00.000Z" };
}
const prov = (date: string, f: Ref) => ({ revenue: { source: "edgar", unit: "USD", periodStart: null, periodEnd: date, observedAt: "2026-10-22T00:00:00.000Z", tags: ["us-gaap/Revenues"], filings: [f] } });
/** Q3 FY2025 (10-Q 2025-10-31) against a Q2 FY2025 re-presented in the 10-Q of 2026-07-31, with the given first-reported copy. */
function reprRows(firstFiled: string, firstValue: number): R[] {
  return [
    { date: "2025-09-30", fiscalYear: "2025", period: "Q3", reportedCurrency: "USD", revenue: 28_088 * M, fieldProvenance: prov("2025-09-30", ref("10-Q", "2025-10-31")) },
    { date: "2025-06-30", fiscalYear: "2025", period: "Q2", reportedCurrency: "USD", revenue: 27_443 * M, fieldProvenance: prov("2025-06-30", ref("10-Q", "2026-07-31")),
      original: { revenue: { ...ref("10-Q", firstFiled), value: firstValue * M } },
      restatement: [{ date: "2025-06-30", field: "revenue", original: firstValue * M, restated: 27_443 * M, changePct: 3.7, originalFiling: ref("10-Q", firstFiled), restatedFiling: ref("10-Q", "2026-07-31") }] },
  ];
}
const q3 = (b: DataBundle) => trend(b, "2025-09-30");

describe("growth basis: the first-reported copy paths (M1)", () => {
  it("a first-reported copy filed after the printed quarter's filing gives a dash and a not-shown note", () => {
    const row = q3(handBundle(reprRows("2025-11-05", 26_463)));
    expect(row.revenueQoqPct).toBeNull();
    expect(row.revenueGrowthNotes?.join(" ")).toMatch(/QoQ not shown: 2025-06-30 was re-presented in 10-Q 2026-07-31 and has no copy on 2025-09-30's presentation/);
  });
  it("a first-reported copy of zero gives a dash whose note says the cell is not shown", () => {
    const row = q3(handBundle(reprRows("2025-07-31", 0)));
    expect(row.revenueQoqPct).toBeNull();
    expect(row.revenueGrowthNotes?.join(" ")).toMatch(/QoQ not shown: 2025-06-30's first-reported revenue \(10-Q 2025-07-31\) is not positive, and the 10-Q of 2026-07-31 re-presented it\./);
    expect(row.revenueGrowthNotes?.join(" ")).not.toMatch(/uses/);
  });
});

const F = (filed: string, form: string, fp: string, fy: number) => ({ filed, form, fp, fy, accn: `0000000099-${filed.slice(2, 4)}-${filed.slice(5, 7)}${filed.slice(8)}` });
const SPLITS = { status: "retrieved", source: "test", events: [], coverage: [{ from: "2000-01-01", to: "2026-12-31" }] };
const pt = (f: ReturnType<typeof F>, start: string | undefined, end: string, val: number) => ({ ...f, ...(start ? { start } : {}), end, val });
function builtTrend(usGaap: Record<string, unknown[]>) {
  const facts = { cik: 99, entityName: "Synthetic Co", facts: { "us-gaap": Object.fromEntries(Object.entries(usGaap).map(([k, v]) => [k, { label: k, units: { USD: v } }])), dei: {} } };
  const built = buildStatementsFromCompanyFacts(facts as never, { symbol: "SYN", cik: "0000000099", annualPeriods: 4, quarterlyPeriods: 8, asOf: "2026-10-22",
    factsObservedAt: "2026-10-22T00:00:00.000Z", vendorSplits: SPLITS as never });
  const rows = built.incomeQuarterly.rows as unknown as R[];
  return { rows, trend: buildFilingDisclosures(handBundle(JSON.parse(JSON.stringify(rows))))!.quarterlyTrend };
}
const cell = (rows: { periodEnd: string }[], d: string) => rows.find((r) => r.periodEnd === d) as ReturnType<typeof trend>;

describe("growth basis: a presentation first filed in the printed quarter's own 10-Q (I1)", () => {
  const q125 = F("2025-05-01", "10-Q", "Q1", 2025), q225 = F("2025-08-01", "10-Q", "Q2", 2025), q325 = F("2025-11-01", "10-Q", "Q3", 2025);
  const k25 = F("2026-02-20", "10-K", "FY", 2025), q126 = F("2026-05-01", "10-Q", "Q1", 2026), q226 = F("2026-07-31", "10-Q", "Q2", 2026);
  const assets = [pt(q125, undefined, "2025-03-31", 1), pt(q225, undefined, "2025-06-30", 1), pt(q325, undefined, "2025-09-30", 1), pt(k25, undefined, "2025-12-31", 1), pt(q126, undefined, "2026-03-31", 1), pt(q226, undefined, "2026-06-30", 1)];
  const base2025 = [
    pt(q125, "2025-01-01", "2025-03-31", 100), pt(q225, "2025-04-01", "2025-06-30", 100), pt(q225, "2025-01-01", "2025-06-30", 200),
    pt(q325, "2025-07-01", "2025-09-30", 100), pt(q325, "2025-01-01", "2025-09-30", 300), pt(k25, "2025-01-01", "2025-12-31", 400),
  ];

  it("S4: the first post-event 10-Q re-presents Q2 2025 and Q1 2026 stays on the old basis, so Q2 2026 QoQ is not shown", () => {
    const { rows, trend: tr } = builtTrend({
      Revenues: [...base2025, pt(q126, "2026-01-01", "2026-03-31", 110), pt(q126, "2025-01-01", "2025-03-31", 100),
        pt(q226, "2026-04-01", "2026-06-30", 90), pt(q226, "2026-01-01", "2026-06-30", 178), pt(q226, "2025-04-01", "2025-06-30", 80), pt(q226, "2025-01-01", "2025-06-30", 160)],
      Assets: assets,
    });
    expect(rows.find((r) => r.date === "2026-06-30")!.revenuePresentation).toMatchObject({ form: "10-Q", filed: "2026-07-31", represented: true });
    expect(rows.find((r) => r.date === "2026-03-31")!.revenuePresentation).toMatchObject({ form: "10-Q", filed: "2026-05-01", represented: false });
    const q2 = cell(tr, "2026-06-30");
    expect(q2.revenueQoqPct).toBeNull();
    expect(q2.revenueGrowthNotes?.join(" ")).toContain(
      "QoQ not shown: the 10-Q of 2026-07-31 that supplies 2026-06-30 re-presented earlier periods' revenue and the 10-Q of 2026-05-01 that supplies 2026-03-31 did not, so the two quarters are on different presentations.");
    expect(q2.revenueYoyPct).toBeCloseTo(12.5, 3);
  });
  it("control (BAC shape): the change began in the earlier 10-Q, so both quarters re-presented and the QoQ keeps its rate", () => {
    const { rows, trend: tr } = builtTrend({
      Revenues: [...base2025, pt(q126, "2026-01-01", "2026-03-31", 88), pt(q126, "2025-01-01", "2025-03-31", 80),
        pt(q226, "2026-04-01", "2026-06-30", 90), pt(q226, "2026-01-01", "2026-06-30", 178), pt(q226, "2025-04-01", "2025-06-30", 80), pt(q226, "2025-01-01", "2025-06-30", 160)],
      Assets: assets,
    });
    expect(rows.find((r) => r.date === "2026-03-31")!.revenuePresentation.represented).toBe(true);
    expect(cell(tr, "2026-06-30").revenueQoqPct).toBeCloseTo((90 / 88 - 1) * 100, 2);
    expect(cell(tr, "2026-06-30").revenueGrowthNotes).toBeUndefined();
  });
  it("control (AMT shape): a 10-K that only repeats a recast an earlier 10-K made does not count as re-presenting", () => {
    const k23 = F("2024-02-20", "10-K", "FY", 2023), k24 = F("2025-02-25", "10-K", "FY", 2024), k25b = F("2026-02-24", "10-K", "FY", 2025);
    const q324 = F("2024-11-01", "10-Q", "Q3", 2024), q125b = F("2025-05-01", "10-Q", "Q1", 2025), q225b = F("2025-08-01", "10-Q", "Q2", 2025), q325b = F("2025-11-01", "10-Q", "Q3", 2025);
    const { rows, trend: tr } = builtTrend({
      Revenues: [
        pt(k23, "2023-01-01", "2023-12-31", 1000), pt(k24, "2023-01-01", "2023-12-31", 800), pt(k25b, "2023-01-01", "2023-12-31", 800),
        pt(k24, "2024-01-01", "2024-12-31", 900), pt(k25b, "2024-01-01", "2024-12-31", 900),
        pt(q125b, "2025-01-01", "2025-03-31", 100), pt(q225b, "2025-04-01", "2025-06-30", 100), pt(q225b, "2025-01-01", "2025-06-30", 200),
        pt(q325b, "2025-07-01", "2025-09-30", 100), pt(q325b, "2025-01-01", "2025-09-30", 300), pt(k25b, "2025-01-01", "2025-12-31", 420),
      ],
      Assets: [pt(q324, undefined, "2024-09-30", 1), pt(k24, undefined, "2024-12-31", 1), pt(q125b, undefined, "2025-03-31", 1), pt(q225b, undefined, "2025-06-30", 1), pt(q325b, undefined, "2025-09-30", 1), pt(k25b, undefined, "2025-12-31", 1)],
    });
    const q4 = rows.find((r) => r.date === "2025-12-31")!;
    expect(q4.revenue).toBe(120);
    expect(q4.revenuePresentation).toMatchObject({ form: "10-K", filed: "2026-02-24", represented: false });
    expect(cell(tr, "2025-12-31").revenueQoqPct).toBeCloseTo(20, 3);
    expect(cell(tr, "2025-12-31").revenueGrowthNotes).toBeUndefined();
  });
  it("control: rows without the marker, or with a malformed one, keep plain arithmetic; a well-formed one fires", () => {
    const rows = (marker: unknown): R[] => [
      { date: "2026-06-30", fiscalYear: "2026", period: "Q2", reportedCurrency: "USD", revenue: 90 * M, fieldProvenance: prov("2026-06-30", ref("10-Q", "2026-07-31")), ...(marker === undefined ? {} : { revenuePresentation: { accn: "a", form: "10-Q", filed: "2026-07-31", represented: true } }) },
      { date: "2026-03-31", fiscalYear: "2026", period: "Q1", reportedCurrency: "USD", revenue: 110 * M, fieldProvenance: prov("2026-03-31", ref("10-Q", "2026-05-01")), ...(marker === undefined ? {} : { revenuePresentation: marker }) },
    ];
    for (const marker of [undefined, { accn: "b", form: "10-Q", filed: 20260501, represented: false }, { form: "10-Q", filed: "2026-05-01", represented: "no" }, "x"]) {
      const row = trend(handBundle(rows(marker)), "2026-06-30");
      expect(row.revenueQoqPct).toBeCloseTo((90 / 110 - 1) * 100, 2);
      expect(row.revenueGrowthNotes).toBeUndefined();
    }
    const flagged = trend(handBundle(rows({ accn: "b", form: "10-Q", filed: "2026-05-01", represented: false })), "2026-06-30");
    expect(flagged.revenueQoqPct).toBeNull();
  });
});

// Task 9b (B13): the table's "one presentation" sentence appears only where the presentation check ran.
describe("quarterly trend note: the one-presentation sentence needs the presentation check (Task 9b)", () => {
  const SENTENCE = "where the filings show a re-presentation, each growth cell divides two quarters on one presentation or is not shown, with a note";
  const PRE_TASK_9 = "From the quarterly statement rows. YoY compares with the quarter ending about a year earlier, QoQ with the preceding quarter. FCF here is operating cash flow less capital expenditure; the issuer's own definition is shown separately when its release states it.";
  const noteOf = (b: DataBundle): string => filingDisclosureTables(buildFilingDisclosures(b)! as never, "fundamentals").find((x) => x.heading.startsWith("Quarterly trend"))!.note!;

  function sealed(): DataBundle {
    const b = fixture(true);
    const inc = b.statements.incomeQuarterly;
    if (!inc.ok) throw new Error("fixture");
    inc.value.data.rows = SPECS.map((s) => ({
      ...row(s, true),
      ...(s.supplied === null || s.revenue === null ? {} : { revenuePresentation: { accn: s.supplied.accn, form: s.supplied.form, filed: s.supplied.filed, represented: s.represented !== undefined } }),
    })) as never;
    return b;
  }

  it("SEC-built quarterly rows carry the flag, and the table note has the sentence", () => {
    const built = buildFilingDisclosures(sealed())!;
    expect(built.quarterlyTrendPresentationChecked).toBe(true);
    expect(noteOf(sealed())).toContain(`quarter; ${SENTENCE}. FCF here`);
  });

  it("FMP-shaped rows omit the flag, and the note is the pre-Task-9 text", () => {
    for (const b of [fmpBundle, edgarBundle]) {
      const built = buildFilingDisclosures(b)!;
      expect("quarterlyTrendPresentationChecked" in built).toBe(false);
      expect(noteOf(b)).not.toContain("re-presentation");
      expect(noteOf(b).split("\n")[0]!.startsWith(PRE_TASK_9)).toBe(true);
    }
  });

  it("a stored legacy filing disclosure (no flag) renders the pre-Task-9 note", () => {
    const stored = JSON.parse(JSON.stringify(buildFilingDisclosures(sealed())!)) as Record<string, unknown>;
    delete stored.quarterlyTrendPresentationChecked;
    const note = filingDisclosureTables(stored as never, "fundamentals").find((x) => x.heading.startsWith("Quarterly trend"))!.note!;
    expect(note).not.toContain("re-presentation");
  });
});
