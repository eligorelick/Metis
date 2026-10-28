import { describe, expect, it } from "vitest";
import { ttmIncome } from "@/pipeline/compute";
import { buildStatementsFromCompanyFacts, DISCONTINUED_LABEL_TAGS, type StatementBuildOptions } from "@/edgar/statements";
import {
  describeChangePct,
  filingRepresented,
  firstReportedCopy,
  firstReportedOrder,
  movedBeyond,
  oneBasisPair,
  presentationMixed,
  representationLabelled,
  type LabelCopy,
  type LineageCopy,
} from "@/edgar/presentationLineage";

/**
 * Derived quarters on one presentation (audit 2026-10-27 FIN-511, decision C-9, OD-5). Fixtures are
 * inline companyfacts; the amounts of the BAC case are the ones the finding cites from the public SEC
 * facts (CIK 70858), and every accession number is synthetic.
 */
const SPLITS = { status: "retrieved", source: "test", events: [], coverage: [{ from: "2000-01-01", to: "2026-12-31" }] } as const;
type Filing = { filed: string; form: string; fp: string; fy: number; accn: string };
const fact = (f: Filing, start: string | undefined, end: string, val: number) => ({ ...f, ...(start ? { start } : {}), end, val });
const companyFacts = (usGaap: Record<string, unknown[]>) => ({
  cik: 99,
  entityName: "Synthetic Co",
  facts: { "us-gaap": Object.fromEntries(Object.entries(usGaap).map(([t, p]) => [t, { label: t, units: { USD: p } }])), dei: {} },
});
const build = (usGaap: Record<string, unknown[]>, opts: Partial<StatementBuildOptions> = {}) =>
  buildStatementsFromCompanyFacts(companyFacts(usGaap) as never, {
    symbol: "SYN",
    cik: "0000000099",
    annualPeriods: 4,
    quarterlyPeriods: 8,
    asOf: "2026-10-22",
    factsObservedAt: "2026-10-22T00:00:00.000Z",
    vendorSplits: SPLITS as never,
    ...opts,
  });
const M = 1_000_000;
const OPTS3 = { annualPeriods: 3, quarterlyPeriods: 8, asOf: "2026-10-15" } as const;

// ---------------------------------------------------------------------------
// The probe's synthetic issuer: continuing 80 a quarter plus a 20-a-quarter business
// discontinued and re-presented in the FY2025 10-K.
// ---------------------------------------------------------------------------
const F: Record<string, Filing> = {
  k24: { filed: "2025-02-12", form: "10-K", fp: "FY", fy: 2024, accn: "0000000009-25-000001" },
  q125: { filed: "2025-05-02", form: "10-Q", fp: "Q1", fy: 2025, accn: "0000000009-25-000002" },
  q225: { filed: "2025-08-02", form: "10-Q", fp: "Q2", fy: 2025, accn: "0000000009-25-000003" },
  q325: { filed: "2025-11-03", form: "10-Q", fp: "Q3", fy: 2025, accn: "0000000009-25-000004" },
  k25: { filed: "2026-02-12", form: "10-K", fp: "FY", fy: 2025, accn: "0000000009-26-000001" },
  q126: { filed: "2026-05-02", form: "10-Q", fp: "Q1", fy: 2026, accn: "0000000009-26-000002" },
  q226: { filed: "2026-08-03", form: "10-Q", fp: "Q2", fy: 2026, accn: "0000000009-26-000003" },
  // The 2024 10-Qs of the case where the first reporter of the nine months precedes the 10-K.
  q124: { filed: "2024-05-02", form: "10-Q", fp: "Q1", fy: 2024, accn: "0000000009-24-000001" },
  q224: { filed: "2024-08-02", form: "10-Q", fp: "Q2", fy: 2024, accn: "0000000009-24-000002" },
  q324: { filed: "2024-11-05", form: "10-Q", fp: "Q3", fy: 2024, accn: "0000000009-24-000003" },
};
const pt = (f: Filing, start: string, end: string, val: number) => fact(f, start, end, val);
const inst = (f: Filing, end: string, val: number) => fact(f, undefined, end, val);

function syntheticRevenue(): unknown[] {
  return [
    pt(F.k24!, "2024-01-01", "2024-12-31", 400), pt(F.k24!, "2023-01-01", "2023-12-31", 400),
    pt(F.q125!, "2025-01-01", "2025-03-31", 100), pt(F.q125!, "2024-01-01", "2024-03-31", 100),
    pt(F.q225!, "2025-04-01", "2025-06-30", 100), pt(F.q225!, "2025-01-01", "2025-06-30", 200),
    pt(F.q225!, "2024-04-01", "2024-06-30", 100), pt(F.q225!, "2024-01-01", "2024-06-30", 200),
    pt(F.q325!, "2025-07-01", "2025-09-30", 100), pt(F.q325!, "2025-01-01", "2025-09-30", 300),
    pt(F.q325!, "2024-07-01", "2024-09-30", 100), pt(F.q325!, "2024-01-01", "2024-09-30", 300),
    // The FY2025 10-K re-presents both years on the continuing perimeter.
    pt(F.k25!, "2025-01-01", "2025-12-31", 320), pt(F.k25!, "2024-01-01", "2024-12-31", 320),
    pt(F.q126!, "2026-01-01", "2026-03-31", 80), pt(F.q126!, "2025-01-01", "2025-03-31", 80),
    pt(F.q226!, "2026-04-01", "2026-06-30", 80), pt(F.q226!, "2026-01-01", "2026-06-30", 160),
    pt(F.q226!, "2025-04-01", "2025-06-30", 80), pt(F.q226!, "2025-01-01", "2025-06-30", 160),
  ];
}
function syntheticAssets(): unknown[] {
  return [
    inst(F.k24!, "2024-12-31", 1000), inst(F.k24!, "2023-12-31", 1000), inst(F.q125!, "2025-03-31", 1000), inst(F.q225!, "2025-06-30", 1000),
    inst(F.q325!, "2025-09-30", 1000), inst(F.k25!, "2025-12-31", 1000), inst(F.q126!, "2026-03-31", 1000), inst(F.q226!, "2026-06-30", 1000),
    inst(F.q125!, "2024-03-31", 1000), inst(F.q225!, "2024-06-30", 1000), inst(F.q325!, "2024-09-30", 1000),
  ];
}
const syntheticFacts = (): Record<string, unknown[]> => ({ Revenues: syntheticRevenue(), Assets: syntheticAssets() });

/** The 2024 10-Qs on the old basis (100 a quarter), each with its quarter-end Assets instant. */
function old2024Quarters(): { revenue: unknown[]; assets: unknown[] } {
  return {
    revenue: [
      pt(F.q124!, "2024-01-01", "2024-03-31", 100),
      pt(F.q224!, "2024-04-01", "2024-06-30", 100), pt(F.q224!, "2024-01-01", "2024-06-30", 200),
      pt(F.q324!, "2024-07-01", "2024-09-30", 100), pt(F.q324!, "2024-01-01", "2024-09-30", 300),
    ],
    assets: [inst(F.q124!, "2024-03-31", 1000), inst(F.q224!, "2024-06-30", 1000), inst(F.q324!, "2024-09-30", 1000)],
  };
}

function representedInQ2Facts(): Record<string, unknown[]> {
  const o = old2024Quarters();
  const revenue = [
    ...o.revenue,
    pt(F.k24!, "2024-01-01", "2024-12-31", 400), pt(F.k24!, "2023-01-01", "2023-12-31", 400),
    pt(F.q125!, "2025-01-01", "2025-03-31", 100), pt(F.q125!, "2024-01-01", "2024-03-31", 100),
    pt(F.q225!, "2025-04-01", "2025-06-30", 80), pt(F.q225!, "2025-01-01", "2025-06-30", 160),
    pt(F.q225!, "2024-04-01", "2024-06-30", 80), pt(F.q225!, "2024-01-01", "2024-06-30", 160),
    pt(F.q325!, "2025-07-01", "2025-09-30", 80), pt(F.q325!, "2025-01-01", "2025-09-30", 240),
    pt(F.q325!, "2024-07-01", "2024-09-30", 80), pt(F.q325!, "2024-01-01", "2024-09-30", 240),
    pt(F.k25!, "2025-01-01", "2025-12-31", 320), pt(F.k25!, "2024-01-01", "2024-12-31", 320),
  ];
  return { Revenues: revenue, Assets: [...syntheticAssets().slice(0, 8), ...o.assets] };
}

function unchangedFacts(): Record<string, unknown[]> {
  const revenue = syntheticRevenue().filter((p) => (p as { accn: string }).accn !== F.k25!.accn);
  revenue.push(pt(F.k25!, "2025-01-01", "2025-12-31", 400), pt(F.k25!, "2024-01-01", "2024-12-31", 400));
  return { Revenues: revenue, Assets: syntheticAssets() };
}

function labelledRepresentationFacts(label: "new" | "none" | "unchanged"): Record<string, unknown[]> {
  const o = old2024Quarters();
  const disc: unknown[] =
    label === "new"
      ? [pt(F.k25!, "2024-01-01", "2024-12-31", 15), pt(F.k25!, "2025-01-01", "2025-12-31", 12)]
      : label === "unchanged"
        ? [pt(F.k24!, "2024-01-01", "2024-12-31", 15), pt(F.k25!, "2024-01-01", "2024-12-31", 15), pt(F.k25!, "2025-01-01", "2025-12-31", 12)]
        : [];
  return {
    Revenues: [...syntheticRevenue(), ...o.revenue],
    Assets: [...syntheticAssets(), ...o.assets],
    ...(disc.length > 0 ? { IncomeLossFromDiscontinuedOperationsNetOfTax: disc } : {}),
  };
}

const NET_INCOME_RECLASS: unknown[] = [
  pt(F.k24!, "2024-01-01", "2024-12-31", 300),
  pt(F.q325!, "2025-01-01", "2025-09-30", 225),
  pt(F.k25!, "2025-01-01", "2025-12-31", 300), pt(F.k25!, "2024-01-01", "2024-12-31", 300),
];

function reclassifiedOperatingIncomeFacts(): Record<string, unknown[]> {
  return {
    ...syntheticFacts(),
    OperatingIncomeLoss: [
      pt(F.k24!, "2024-01-01", "2024-12-31", 400),
      pt(F.q325!, "2025-01-01", "2025-09-30", 300), pt(F.q325!, "2024-01-01", "2024-09-30", 300),
      pt(F.k25!, "2025-01-01", "2025-12-31", 360), pt(F.k25!, "2024-01-01", "2024-12-31", 360),
    ],
    IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: [
      pt(F.k24!, "2024-01-01", "2024-12-31", 500),
      pt(F.q325!, "2025-01-01", "2025-09-30", 375),
      pt(F.k25!, "2025-01-01", "2025-12-31", 500), pt(F.k25!, "2024-01-01", "2024-12-31", 500),
    ],
    InterestExpense: [pt(F.k24!, "2024-01-01", "2024-12-31", 40), pt(F.q325!, "2025-01-01", "2025-09-30", 30), pt(F.k25!, "2025-01-01", "2025-12-31", 40)],
    NetIncomeLoss: NET_INCOME_RECLASS,
  };
}

function representedPretaxFacts(): Record<string, unknown[]> {
  return {
    ...syntheticFacts(),
    // An exact copy of the Revenues points, so the pretax tag is re-presented in the same filings.
    IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: syntheticRevenue(),
    InterestExpense: [pt(F.k24!, "2024-01-01", "2024-12-31", 40), pt(F.q325!, "2025-01-01", "2025-09-30", 30), pt(F.k25!, "2025-01-01", "2025-12-31", 40)],
    NetIncomeLoss: NET_INCOME_RECLASS,
  };
}

function syntheticFactsWithSubsetTag(): Record<string, unknown[]> {
  return {
    ...syntheticFacts(),
    // Never re-presented: 60 a quarter, so FY2025 240 less nine months 180 would be 60.
    RevenueFromContractWithCustomerExcludingAssessedTax: [
      pt(F.q125!, "2025-01-01", "2025-03-31", 60), pt(F.q225!, "2025-04-01", "2025-06-30", 60), pt(F.q325!, "2025-07-01", "2025-09-30", 60),
      pt(F.q325!, "2025-01-01", "2025-09-30", 180),
      pt(F.k24!, "2024-01-01", "2024-12-31", 240), pt(F.k25!, "2025-01-01", "2025-12-31", 240),
    ],
  };
}

function precisionFacts(): Record<string, unknown[]> {
  const q324: Filing = { filed: "2024-11-06", form: "10-Q", fp: "Q3", fy: 2024, accn: "0000000008-24-000003" };
  const k24: Filing = { filed: "2025-02-13", form: "10-K", fp: "FY", fy: 2024, accn: "0000000008-25-000001" };
  const q325: Filing = { filed: "2025-10-29", form: "10-Q", fp: "Q3", fy: 2025, accn: "0000000008-25-000003" };
  const k25: Filing = { filed: "2026-02-12", form: "10-K", fp: "FY", fy: 2025, accn: "0000000008-26-000001" };
  return {
    Revenues: [
      pt(q324, "2024-07-01", "2024-09-30", 1_700 * M), pt(q324, "2024-01-01", "2024-09-30", 5_076.9 * M),
      pt(k24, "2024-01-01", "2024-12-31", 6_804.3 * M),
      pt(q325, "2025-07-01", "2025-09-30", 1_750 * M), pt(q325, "2025-01-01", "2025-09-30", 5_300 * M), pt(q325, "2024-01-01", "2024-09-30", 5_076.9 * M),
      pt(k25, "2025-01-01", "2025-12-31", 7_100 * M), pt(k25, "2024-01-01", "2024-12-31", 6_804.0 * M),
    ],
    Assets: [inst(q324, "2024-09-30", 1000), inst(k24, "2024-12-31", 1000), inst(q325, "2025-09-30", 1000), inst(k25, "2025-12-31", 1000)],
  };
}

function amendedFacts(): Record<string, unknown[]> {
  const kA: Filing = { filed: "2025-03-20", form: "10-K/A", fp: "FY", fy: 2024, accn: "0000000009-25-000009" };
  const o = old2024Quarters();
  return {
    Revenues: [
      ...o.revenue,
      pt(F.k24!, "2024-01-01", "2024-12-31", 400), pt(F.k24!, "2023-01-01", "2023-12-31", 400),
      pt(kA, "2024-01-01", "2024-12-31", 410), pt(kA, "2023-01-01", "2023-12-31", 400),
    ],
    Assets: [...o.assets, inst(F.k24!, "2024-12-31", 1000), inst(F.k24!, "2023-12-31", 1000)],
  };
}

/** Bank of America's FY2024 revenue re-filed at +3.90% in the FY2025 10-K, with the amounts the finding cites. */
function bacFacts(): Record<string, unknown[]> {
  const f = (filed: string, form: string, fp: string, fy: number, n: number): Filing => ({ filed, form, fp, fy, accn: `0000070858-${String(fy).slice(2)}-${String(n).padStart(6, "0")}` });
  const q124 = f("2024-04-30", "10-Q", "Q1", 2024, 1), q224 = f("2024-07-30", "10-Q", "Q2", 2024, 2), q324 = f("2024-10-29", "10-Q", "Q3", 2024, 3);
  const k24 = f("2025-02-25", "10-K", "FY", 2024, 4);
  const q125 = f("2025-04-30", "10-Q", "Q1", 2025, 1), q225 = f("2025-07-31", "10-Q", "Q2", 2025, 2), q325 = f("2025-10-31", "10-Q", "Q3", 2025, 3);
  const k25 = f("2026-02-25", "10-K", "FY", 2025, 4);
  const rev = (...rows: [Filing, string, string, number][]) => rows.map(([fl, s, e, v]) => pt(fl, s, e, v * M));
  return {
    Revenues: rev(
      [q124, "2024-01-01", "2024-03-31", 25_818], [q224, "2024-04-01", "2024-06-30", 25_377], [q324, "2024-07-01", "2024-09-30", 25_345], [q324, "2024-01-01", "2024-09-30", 76_540],
      [k24, "2024-01-01", "2024-12-31", 101_887],
      [q125, "2025-01-01", "2025-03-31", 27_366], [q125, "2024-01-01", "2024-03-31", 25_818],
      [q225, "2025-04-01", "2025-06-30", 26_463], [q225, "2024-04-01", "2024-06-30", 25_377],
      [q325, "2025-07-01", "2025-09-30", 28_088], [q325, "2025-01-01", "2025-09-30", 81_917], [q325, "2024-07-01", "2024-09-30", 25_345], [q325, "2024-01-01", "2024-09-30", 76_540],
      [k25, "2025-01-01", "2025-12-31", 113_097], [k25, "2024-01-01", "2024-12-31", 105_856],
    ),
    NetIncomeLoss: rev(
      [q324, "2024-01-01", "2024-09-30", 20_000], [k24, "2024-01-01", "2024-12-31", 27_000],
      [q325, "2025-01-01", "2025-09-30", 22_000], [k25, "2025-01-01", "2025-12-31", 30_000], [k25, "2024-01-01", "2024-12-31", 27_000],
    ),
    Assets: [
      inst(q124, "2024-03-31", 1000), inst(q224, "2024-06-30", 1000), inst(q324, "2024-09-30", 1000), inst(k24, "2024-12-31", 1000),
      inst(q125, "2025-03-31", 1000), inst(q225, "2025-06-30", 1000), inst(q325, "2025-09-30", 1000), inst(k25, "2025-12-31", 1000),
    ],
  };
}

/** The HEAD lineage fixture of tests/edgar.statements.test.ts with the later nine-month copy as a parameter. */
function subtrahendRefiledFacts(later: number, label: boolean): Record<string, unknown[]> {
  const k: Filing = { filed: "2026-02-13", form: "10-K", fp: "FY", fy: 2025, accn: "0000000000-26-000001" };
  const q3: Filing = { filed: "2025-10-30", form: "10-Q", fp: "Q3", fy: 2025, accn: "0000000000-25-000003" };
  const q3b: Filing = { filed: "2026-05-01", form: "10-Q", fp: "Q3", fy: 2025, accn: "0000000000-26-000009" };
  return {
    Revenues: [pt(k, "2025-01-01", "2025-12-31", 400), pt(q3, "2025-01-01", "2025-09-30", 300), pt(q3b, "2025-01-01", "2025-09-30", later)],
    NetIncomeLoss: [pt(k, "2025-01-01", "2025-12-31", 100)],
    Assets: [inst(k, "2025-12-31", 900), inst(q3, "2025-09-30", 880)],
    ...(label ? { IncomeLossFromDiscontinuedOperationsNetOfTax: [pt(q3b, "2025-01-01", "2025-09-30", 5)] } : {}),
  };
}

describe("FIN-511: a derived quarter nets two figures on one presentation, or is withheld naming both filings", () => {
  it("synthetic: a Q4 netting a re-presented FY against old-basis nine months is withheld, naming both filings", () => {
    const b = build(syntheticFacts(), { ...OPTS3 });
    const q = b.incomeQuarterly;
    expect(b.incomeAnnual.restatements.some((r) => r.date === "2024-12-31" && r.field === "revenue" && r.original === 400 && r.restated === 320)).toBe(true); // control
    expect(q.rows.find((r) => r.date === "2025-12-31")?.revenue ?? null).toBeNull();
    expect(q.withheld).toContainEqual(
      expect.objectContaining({
        field: "revenue",
        periods: expect.arrayContaining(["2025-12-31"]),
        text: expect.stringMatching(/presentation changed in 10-K 2026-02-12 \(0000000009-26-000001\).*10-Q of 2025-11-03/),
      }),
    );
    expect(ttmIncome(q.rows, [])?.revenue ?? null).toBeNull(); // falls back to the annual statement
  });

  it("BAC shape: a material re-filing the 10-K does not label withholds the prior-year Q4 naming both 10-Ks; the current-year Q4 is withheld (C-9)", () => {
    const q = build(bacFacts(), { annualPeriods: 3, quarterlyPeriods: 12 }).incomeQuarterly;
    // neither the mixed 29,316M nor the first-reported pair 25,347M, which ASC 250 supersedes if the change corrects an error
    expect(q.rows.find((r) => r.date === "2024-12-31")?.revenue ?? null).toBeNull();
    expect(q.withheld).toContainEqual(
      expect.objectContaining({
        field: "revenue",
        periods: expect.arrayContaining(["2024-12-31"]),
        text: expect.stringMatching(/first reported as 101887000000 in 10-K 2025-02-25 .*re-filed as 105856000000 \(\+3\.90%\) in 10-K 2026-02-25 .*labels no re-presentation/),
      }),
    );
    expect(q.rows.find((r) => r.date === "2025-12-31")?.revenue ?? null).toBeNull();
    expect(q.withheld.some((w) => w.field === "revenue" && w.periods.includes("2025-12-31"))).toBe(true);
    // The three-month quarters, tagged as such, are untouched.
    expect(q.rows.find((r) => r.date === "2025-09-30")?.revenue).toBe(28_088 * M);
  });

  it("C-9: a re-presentation the re-filing labels with a discontinued-operations line keeps the first-reported pair", () => {
    const q = build(labelledRepresentationFacts("new"), { ...OPTS3 }).incomeQuarterly;
    const q424 = q.rows.find((r) => r.date === "2024-12-31")!;
    expect(q424.revenue).toBe(100); // FY2024 400 (10-K 2025-02-12) - 9M 2024 300 (10-Q 2024-11-05)
    expect(q424.fieldProvenance?.revenue?.filings.map((f) => f.filed)).toEqual(["2025-02-12", "2024-11-05"]);
    expect(q.notes.some((n) => /2024-12-31: derived from the first-reported FY \(10-K 2025-02-12\).*as a re-presentation it labels with a discontinued-operations line/.test(n))).toBe(true);
    expect(q.rows.find((r) => r.date === "2025-12-31")?.revenue ?? null).toBeNull(); // (b): new-basis FY2025 against the old-basis 9M 2025
  });

  it("C-9 control: the same re-filing with no discontinued-operations line, or with one unchanged since first reported, is withheld naming both filings", () => {
    for (const label of ["none", "unchanged"] as const) {
      const q = build(labelledRepresentationFacts(label), { ...OPTS3 }).incomeQuarterly;
      expect(q.rows.find((r) => r.date === "2024-12-31")?.revenue ?? null).toBeNull();
      expect(q.withheld).toContainEqual(
        expect.objectContaining({
          field: "revenue",
          periods: expect.arrayContaining(["2024-12-31"]),
          text: expect.stringMatching(/first reported as 400 in 10-K 2025-02-12 .*re-filed as 320 \(-20\.00%\) in 10-K 2026-02-12 .*labels no re-presentation/),
        }),
      );
    }
  });

  it("a re-presentation first filed in a 10-Q leaves the FY - YTD pair on one basis", () => {
    const q = build(representedInQ2Facts(), { ...OPTS3 }).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2025-12-31")!.revenue).toBe(80); // 320 - 240, both filings re-presented
    expect(q.rows.find((r) => r.date === "2024-12-31")!.revenue).toBe(80); // 320 - 240: FY2024 and 9M 2024 moved together
    expect(q.withheld.filter((w) => w.field === "revenue" && (w.periods.includes("2025-12-31") || w.periods.includes("2024-12-31")))).toEqual([]);
  });

  it("a precision-only re-filing switches to the first-reported pair and withholds nothing", () => {
    const b = build(precisionFacts(), { annualPeriods: 3, quarterlyPeriods: 8 });
    expect(b.incomeQuarterly.rows.find((r) => r.date === "2024-12-31")!.revenue).toBe(1_727.4 * M);
    expect(b.incomeQuarterly.rows.find((r) => r.date === "2025-12-31")!.revenue).toBe(1_800 * M);
    expect(b.incomeQuarterly.withheld.filter((w) => w.field === "revenue")).toEqual([]);
    expect(b.incomeAnnual.restatements).toEqual([]); // 0.004% < 1%
    expect(b.incomeQuarterly.notes.some((n) => /2024-12-31: derived from the first-reported FY \(10-K 2025-02-13\), because 10-K 2026-02-12 re-filed it by a precision-only change of -0\.0044%/.test(n))).toBe(true);
  });

  it("an amended 10-K keeps its corrected FY as the minuend", () => {
    const b = build(amendedFacts(), { annualPeriods: 2, quarterlyPeriods: 4, asOf: "2025-06-01", factsObservedAt: "2025-06-01T00:00:00.000Z" });
    const row = b.incomeQuarterly.rows.find((r) => r.date === "2024-12-31")!;
    expect(row.revenue).toBe(110); // 10-K/A 410 - 9M 300, as at HEAD
    expect(row.fieldProvenance?.revenue?.filings.map((f) => f.form)).toContain("10-K/A");
  });

  it("a filed operating income withheld for presentation is not re-derived from pretax income", () => {
    const q = build(reclassifiedOperatingIncomeFacts(), { ...OPTS3 }).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2025-12-31")!.operatingIncome).toBeNull(); // HEAD: 360 - 300 = 60
    expect(q.withheld).toContainEqual(
      expect.objectContaining({ field: "operatingIncome", periods: expect.arrayContaining(["2025-12-31"]), text: expect.stringMatching(/presentation changed in 10-K 2026-02-12/) }),
    );
    expect(q.substitutions.filter((s) => s.field === "operatingIncome" && s.periods.includes("2025-12-31"))).toEqual([]);
  });

  it("a derived EBIT whose pretax part is withheld for presentation quotes that reason", () => {
    const q = build(representedPretaxFacts(), { ...OPTS3 }).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2025-12-31")!.operatingIncome).toBeNull(); // HEAD: pretax 20 + interest 10 = 30
    expect(q.withheld).toContainEqual(
      expect.objectContaining({ field: "operatingIncome", text: expect.stringMatching(/pretax income for the period is withheld \(.*presentation changed in 10-K 2026-02-12/) }),
    );
  });

  it("a presentation refusal is not bypassed by a narrower revenue synonym", () => {
    const b = build(syntheticFactsWithSubsetTag(), { ...OPTS3 });
    expect(b.incomeQuarterly.rows.find((r) => r.date === "2025-12-31")?.revenue ?? null).toBeNull(); // not 240 - 180 = 60
  });

  it("C-9, subtrahend side: nine months re-filed by more than 1% after the 10-K, with no label, withhold the quarter naming both 10-Qs", () => {
    const q = build(subtrahendRefiledFacts(280, false), { annualPeriods: 2, quarterlyPeriods: 4, asOf: "2026-10-15" }).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2025-12-31")?.revenue ?? null).toBeNull(); // HEAD: 400 - 300 = 100
    expect(q.withheld).toContainEqual(
      expect.objectContaining({
        field: "revenue",
        periods: expect.arrayContaining(["2025-12-31"]),
        text: expect.stringMatching(/2025-01-01\.\.2025-09-30 netted as 300 \(10-Q 2025-10-30.*re-filed as 280 \(-6\.67%\) in 10-Q 2026-05-01 .*after the 10-K of 2026-02-13/),
      }),
    );
  });

  it("C-9, subtrahend side, controls: a re-rounding, or a re-filing that labels the nine months, keeps the quarter as first reported", () => {
    for (const [later, label] of [[299, false], [280, true]] as const) {
      const q = build(subtrahendRefiledFacts(later, label), { annualPeriods: 2, quarterlyPeriods: 4, asOf: "2026-10-15" }).incomeQuarterly;
      expect(q.rows.find((r) => r.date === "2025-12-31")!.revenue).toBe(100); // 400 - 300: the later copy is never netted (D-13)
      expect(q.withheld.filter((w) => w.field === "revenue" && w.periods.includes("2025-12-31"))).toEqual([]);
    }
  });

  it("control: a 10-K that re-files the prior year unchanged derives Q4 exactly as before", () => {
    const q = build(unchangedFacts(), { annualPeriods: 3, quarterlyPeriods: 8 }).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2025-12-31")!.revenue).toBe(100);
    expect(q.rows.find((r) => r.date === "2025-12-31")!.derivation).toBe("fy-minus-ytd");
  });

  it("an FY less three quarters is checked on one presentation too, and a missing first-reported subtrahend withholds", () => {
    // No nine-month fact anywhere: the fallback FY - (Q1+Q2+Q3) runs, with the same pairing rule.
    const revenue = syntheticRevenue().filter((p) => (p as { start?: string; end: string }).start !== "2025-01-01" || (p as { end: string }).end !== "2025-09-30");
    const q = build({ Revenues: revenue, Assets: syntheticAssets() }, { ...OPTS3 }).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2025-12-31")?.revenue ?? null).toBeNull();
    expect(q.withheld).toContainEqual(expect.objectContaining({ field: "revenue", text: expect.stringMatching(/presentation changed in 10-K 2026-02-12/) }));
  });

  it("a year-to-date difference is derived on one presentation as well", () => {
    // Q3 2025 as a YTD difference: nine months 300 less six months 200 (no three-month fact for Q3).
    // Only the filings up to the Q3 10-Q: a later 10-Q re-presenting the six months would (rightly) withhold it.
    const upToQ3 = new Set([F.k24!.accn, F.q125!.accn, F.q225!.accn, F.q325!.accn]);
    const revenue = syntheticRevenue().filter((p) => upToQ3.has((p as { accn: string }).accn) && (p as { start?: string }).start !== "2025-07-01");
    const q = build({ Revenues: revenue, Assets: syntheticAssets() }, { ...OPTS3 }).incomeQuarterly;
    const row = q.rows.find((r) => r.date === "2025-09-30")!;
    expect(row.revenue).toBe(100);
    expect(row.derivation).toBe("ytd-difference");
  });

  it("DISCONTINUED_LABEL_TAGS holds the discontinued-operations elements the builder parses", () => {
    expect([...DISCONTINUED_LABEL_TAGS]).toContain("IncomeLossFromDiscontinuedOperationsNetOfTax");
    expect(DISCONTINUED_LABEL_TAGS.length).toBeGreaterThan(3);
  });
});

describe("presentationLineage helpers", () => {
  const c = (filed: string, accn: string, val: number, extra: Partial<LineageCopy> = {}): LineageCopy => ({
    start: "2025-01-01", end: "2025-12-31", val, accn, filed, form: "10-K", ...extra,
  });

  it("orders copies earliest filed first, an original before an amendment on a tie, then the lower accession", () => {
    expect(firstReportedOrder(c("2025-01-01", "b", 1), c("2025-02-01", "a", 1))).toBeLessThan(0);
    expect(firstReportedOrder(c("2025-02-01", "a", 1), c("2025-01-01", "b", 1))).toBeGreaterThan(0);
    expect(firstReportedOrder(c("2025-01-01", "b", 1, { form: "10-K/A" }), c("2025-01-01", "z", 1))).toBeGreaterThan(0);
    expect(firstReportedOrder(c("2025-01-01", "z", 1), c("2025-01-01", "b", 1, { form: "10-K/A" }))).toBeLessThan(0);
    expect(firstReportedOrder(c("2025-01-01", "a", 1), c("2025-01-01", "b", 1))).toBeLessThan(0);
    expect(firstReportedOrder(c("2025-01-01", "b", 1), c("2025-01-01", "a", 1))).toBeGreaterThan(0);
    expect(firstReportedOrder(c("2025-01-01", "a", 1), c("2025-01-01", "a", 1))).toBe(0);
  });

  it("finds a period's first-reported copy, and the copy itself when it stands alone", () => {
    const early = c("2025-01-01", "a", 10);
    const late = c("2026-01-01", "b", 12);
    const other = c("2025-03-01", "c", 5, { start: "2024-01-01", end: "2024-12-31" });
    expect(firstReportedCopy([late, early, other], late)).toBe(early);
    expect(firstReportedCopy([other], late)).toBe(late);
  });

  it("measures a move against the first-reported value, including from zero", () => {
    expect(movedBeyond(c("2025-01-01", "a", 100), c("2026-01-01", "b", 101), 1)).toBe(false);
    expect(movedBeyond(c("2025-01-01", "a", 100), c("2026-01-01", "b", 101.5), 1)).toBe(true);
    expect(movedBeyond(c("2025-01-01", "a", 0), c("2026-01-01", "b", 1), 1)).toBe(true);
    expect(movedBeyond(c("2025-01-01", "a", 0), c("2026-01-01", "b", 0), 1)).toBe(false);
  });

  it("formats a change, or says there is none from a zero original", () => {
    expect(describeChangePct(3.8955)).toBe("+3.90%");
    expect(describeChangePct(-20)).toBe("-20.00%");
    expect(describeChangePct(null)).toMatch(/from zero/);
  });

  it("says a filing re-presented only for an earlier period it did not first report, and not for the period under derivation when excepted", () => {
    const y24a = c("2025-02-01", "k24", 400, { start: "2024-01-01", end: "2024-12-31" });
    const y24b = c("2026-02-01", "k25", 320, { start: "2024-01-01", end: "2024-12-31" });
    const y25 = c("2026-02-01", "k25", 330);
    expect(filingRepresented([y24a, y24b, y25], "k25", 1)).toBe(true);
    expect(filingRepresented([y24a, y24b, y25], "k24", 1)).toBe(false);
    expect(filingRepresented([y24a, y24b, y25], "k25", 1, y24b)).toBe(false);
  });

  it("does not count a filing that only repeats a recast an earlier filing made", () => {
    const first = c("2024-02-01", "k23", 400, { start: "2023-01-01", end: "2023-12-31" });
    const recast = c("2025-02-01", "k24", 320, { start: "2023-01-01", end: "2023-12-31" });
    const repeat = c("2026-02-01", "k25", 320, { start: "2023-01-01", end: "2023-12-31" });
    expect(filingRepresented([first, recast, repeat], "k24", 1)).toBe(true);
    expect(filingRepresented([first, recast, repeat], "k25", 1)).toBe(false); // the recast was k24's, not k25's
  });

  it("labels a re-presentation only by a new or moved, non-zero discontinued-operations copy of the same period in the same filing", () => {
    const refiled = c("2026-02-01", "k25", 320);
    const label = (tag: string, accn: string, filed: string, val: number, extra: Partial<LabelCopy> = {}): LabelCopy => ({ ...c(filed, accn, val), tag, unit: "USD", ...extra });
    expect(representationLabelled([label("D", "k25", "2026-02-01", 15)], refiled, 1)).toBe(true); // new in the re-filing
    expect(representationLabelled([label("D", "k24", "2025-02-01", 15), label("D", "k25", "2026-02-01", 15)], refiled, 1)).toBe(false); // unchanged
    expect(representationLabelled([label("D", "k24", "2025-02-01", 15), label("D", "k25", "2026-02-01", 18)], refiled, 1)).toBe(true); // moved
    expect(representationLabelled([label("D", "k25", "2026-02-01", 0)], refiled, 1)).toBe(false); // zero
    expect(representationLabelled([label("D", "k25", "2026-02-01", 15, { start: "2024-01-01", end: "2024-12-31" })], refiled, 1)).toBe(false); // other period
    expect(representationLabelled([label("D", "k99", "2026-02-01", 15)], refiled, 1)).toBe(false); // other filing
    // A different tag's earlier copy does not make this tag's copy "unchanged".
    expect(representationLabelled([label("E", "k24", "2025-02-01", 15), label("D", "k25", "2026-02-01", 15)], refiled, 1)).toBe(true);
  });

  it("explains a mixed pair only when the minuend's filing re-presented and a subtrahend's did not", () => {
    const y24a = c("2025-02-01", "k24", 400, { start: "2024-01-01", end: "2024-12-31" });
    const y24b = c("2026-02-01", "k25", 320, { start: "2024-01-01", end: "2024-12-31" });
    const fy25 = c("2026-02-01", "k25", 320);
    const nine = c("2025-11-01", "q3", 300, { end: "2025-09-30", form: "10-Q" });
    const copies = [y24a, y24b, fy25, nine];
    expect(presentationMixed(copies, fy25, [nine], 1)).toMatch(/^presentation changed in 10-K 2026-02-01 \(k25\).*10-Q of 2025-11-01 \(q3\)/);
    expect(presentationMixed([y24a, fy25, nine], fy25, [nine], 1)).toBeNull();
    expect(presentationMixed(copies, fy25, [y24b], 1)).toBeNull();
  });

  describe("oneBasisPair", () => {
    const never = () => false;
    const y = (filed: string, accn: string, val: number, form = "10-K"): LineageCopy => c(filed, accn, val, { form });
    const nine = (filed: string, accn: string, val: number): LineageCopy => c(filed, accn, val, { end: "2025-09-30", form: "10-Q" });

    it("returns none when the winner stands alone and its lineage has no subtrahend", () => {
      const w = y("2026-02-01", "k", 400);
      expect(oneBasisPair([w], w, () => null, 1, never)).toEqual({ kind: "none" });
    });

    it("keeps the as-filed pair for a winner that stands alone", () => {
      const w = y("2026-02-01", "k", 400);
      const s = nine("2025-11-01", "q", 300);
      expect(oneBasisPair([w, s], w, () => [s], 1, never)).toMatchObject({ kind: "pair", basis: "as-filed", refiledBy: null, refiledAs: null, minuend: w });
    });

    it("withholds a re-filed minuend when its first-reported copy has no subtrahend on or before it", () => {
      const first = y("2025-02-01", "k1", 400);
      const w = y("2026-02-01", "k2", 400.5);
      const s = nine("2025-11-01", "q", 300);
      const out = oneBasisPair([first, w, s], w, (m) => (m === w ? [s] : null), 1, never);
      expect(out).toEqual({ kind: "withheld", reason: expect.stringMatching(/re-filed with a different value in 10-K 2026-02-01 \(k2\) while its subtrahend was not; the first-reported copy \(10-K 2025-02-01, k1\) has no subtrahend filed on or before it/) });
    });

    it("withholds when the first-reported pair itself nets two presentations", () => {
      const prior = y("2024-02-01", "k0", 100);
      const priorRe = y("2025-02-01", "k1", 70); // the first-reported filing re-presented the prior year
      const first = y("2025-02-01", "k1", 400);
      const w = y("2026-02-01", "k2", 400.5);
      const s = nine("2024-11-01", "q", 300); // filed before k1, old basis
      const copies = [{ ...prior, start: "2023-01-01", end: "2023-12-31" }, { ...priorRe, start: "2023-01-01", end: "2023-12-31" }, first, w, s];
      const out = oneBasisPair(copies, w, (m) => [s].filter(() => m.filed >= "2024-11-01"), 1, never);
      expect(out).toEqual({ kind: "withheld", reason: expect.stringMatching(/presentation changed in 10-K 2025-02-01 \(k1\)/) });
    });

    it("never nets a later subtrahend copy, but withholds when it supersedes the one netted", () => {
      const w = y("2026-02-13", "k", 400);
      const s = nine("2025-10-30", "q1", 300);
      const later = { ...nine("2026-05-01", "q2", 280), form: "10-Q" };
      expect(oneBasisPair([w, s, later], w, () => [s], 1, never)).toEqual({ kind: "withheld", reason: expect.stringMatching(/netted as 300.*re-filed as 280 \(-6\.67%\) in 10-Q 2026-05-01/) });
      expect(oneBasisPair([w, s, later], w, () => [s], 1, (m) => m === later)).toMatchObject({ kind: "pair", subtrahends: [s] });
      // A quarter-length subtrahend is named a quarter.
      const qtr = { ...s, start: "2025-07-01" };
      const qLater = { ...later, start: "2025-07-01" };
      expect(oneBasisPair([w, qtr, qLater], w, () => [qtr], 1, never)).toEqual({ kind: "withheld", reason: expect.stringMatching(/^quarter 2025-07-01\.\.2025-09-30 netted as 300/) });
    });

    it("words a from-zero move without a percentage", () => {
      const first = y("2025-02-01", "k1", 0);
      const w = y("2026-02-01", "k2", 50);
      const s = nine("2025-11-01", "q", 300);
      expect(oneBasisPair([first, w, s], w, () => [s], 1, never)).toEqual({ kind: "withheld", reason: expect.stringMatching(/first reported as 0 .*\(from zero/) });
    });
  });
});
