import { describe, expect, it } from "vitest";
import { ttmIncome } from "@/pipeline/compute";
import { buildStatementsFromCompanyFacts, DISCONTINUED_LABEL_TAGS, resolveFirstStepForTests, type StatementBuildOptions } from "@/edgar/statements";
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

function precisionFacts(fy24Later = 6_804.0 * M): Record<string, unknown[]> {
  const q324: Filing = { filed: "2024-11-06", form: "10-Q", fp: "Q3", fy: 2024, accn: "0000000008-24-000003" };
  const k24: Filing = { filed: "2025-02-13", form: "10-K", fp: "FY", fy: 2024, accn: "0000000008-25-000001" };
  const q325: Filing = { filed: "2025-10-29", form: "10-Q", fp: "Q3", fy: 2025, accn: "0000000008-25-000003" };
  const k25: Filing = { filed: "2026-02-12", form: "10-K", fp: "FY", fy: 2025, accn: "0000000008-26-000001" };
  return {
    Revenues: [
      pt(q324, "2024-07-01", "2024-09-30", 1_700 * M), pt(q324, "2024-01-01", "2024-09-30", 5_076.9 * M),
      pt(k24, "2024-01-01", "2024-12-31", 6_804.3 * M),
      pt(q325, "2025-07-01", "2025-09-30", 1_750 * M), pt(q325, "2025-01-01", "2025-09-30", 5_300 * M), pt(q325, "2024-01-01", "2024-09-30", 5_076.9 * M),
      pt(k25, "2025-01-01", "2025-12-31", 7_100 * M), pt(k25, "2024-01-01", "2024-12-31", fy24Later),
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

  it("a re-rounding to whole millions is not a move: the as-filed pair is derived and nothing is withheld (I2)", () => {
    const b = build(precisionFacts(), { annualPeriods: 3, quarterlyPeriods: 8 });
    expect(b.incomeQuarterly.rows.find((r) => r.date === "2024-12-31")!.revenue).toBeCloseTo(1_727.1 * M, 0); // 6,804.0 - 5,076.9
    expect(b.incomeQuarterly.rows.find((r) => r.date === "2025-12-31")!.revenue).toBe(1_800 * M);
    expect(b.incomeQuarterly.withheld.filter((w) => w.field === "revenue")).toEqual([]);
    expect(b.incomeAnnual.restatements).toEqual([]);
  });

  it("a change within 1% that is not a re-rounding switches to the first-reported pair, and the note says so (I5)", () => {
    const b = build(precisionFacts(6_830.5 * M), { annualPeriods: 3, quarterlyPeriods: 8 });
    expect(b.incomeQuarterly.rows.find((r) => r.date === "2024-12-31")!.revenue).toBe(1_727.4 * M);
    expect(b.incomeQuarterly.rows.find((r) => r.date === "2025-12-31")!.revenue).toBe(1_800 * M);
    expect(b.incomeQuarterly.withheld.filter((w) => w.field === "revenue")).toEqual([]);
    expect(b.incomeQuarterly.notes.some((n) => /2024-12-31: derived from the first-reported FY \(10-K 2025-02-13\), because 10-K 2026-02-12 re-filed it by a change within 1% \(\+0\.385\d%\)/.test(n))).toBe(true);
    expect(b.incomeQuarterly.notes.some((n) => /precision-only/.test(n))).toBe(false);
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

// ---------------------------------------------------------------------------
// Fix round 1 (task review of 87738d9): C1, I1, I2, I4, M5.
// ---------------------------------------------------------------------------
const FR = {
  q324: { filed: "2024-11-05", form: "10-Q", fp: "Q3", fy: 2024, accn: "0000000007-24-000003" } as Filing,
  k24: { filed: "2025-02-12", form: "10-K", fp: "FY", fy: 2024, accn: "0000000007-25-000001" } as Filing,
  q325: { filed: "2025-11-03", form: "10-Q", fp: "Q3", fy: 2025, accn: "0000000007-25-000004" } as Filing,
  k25: { filed: "2026-02-12", form: "10-K", fp: "FY", fy: 2025, accn: "0000000007-26-000001" } as Filing,
};
const FY24 = ["2024-01-01", "2024-12-31"] as const;
const NINE24 = ["2024-01-01", "2024-09-30"] as const;
const frAssets = (): unknown[] => [inst(FR.q324, "2024-09-30", 1000 * M), inst(FR.k24, "2024-12-31", 1000 * M)];
const frBuild = (usGaap: Record<string, unknown[]>) => build(usGaap, { annualPeriods: 3, quarterlyPeriods: 8, asOf: "2026-10-15" });
const frRow = (b: ReturnType<typeof build>, date = "2024-12-31") => b.incomeQuarterly.rows.find((r) => r.date === date);

/** ProfitLoss 400 less 300 = 100; the NCI FY copy is first reported as `first` and re-filed as `later` (9M NCI 3). */
function nciFacts(first: number, later: number | null): Record<string, unknown[]> {
  return {
    ProfitLoss: [pt(FR.k24, ...FY24, 400 * M), pt(FR.q324, ...NINE24, 300 * M)],
    NetIncomeLossAttributableToNoncontrollingInterest: [
      pt(FR.q324, ...NINE24, 3 * M),
      pt(FR.k24, ...FY24, first),
      ...(later === null ? [] : [pt(FR.k25, ...FY24, later)]),
    ],
    Assets: frAssets(),
  };
}

describe("fix round 1 C1: a presentation refusal ends the field in every chain", () => {
  it("net income is withheld with the NCI refusal quoted, never consolidated ProfitLoss (FCX/AEP shape)", () => {
    const b = frBuild(nciFacts(10 * M, 20 * M));
    expect(frRow(b)?.netIncome ?? null).toBeNull(); // 87738d9: 100 (consolidated ProfitLoss)
    expect(b.incomeQuarterly.withheld).toContainEqual(
      expect.objectContaining({ field: "netIncome", text: expect.stringMatching(/NetIncomeLossAttributableToNoncontrollingInterest.*first reported as 10000000/) }),
    );
  });

  it("control: a filer with no refusal still gets ProfitLoss less NCI", () => {
    const b = frBuild(nciFacts(10 * M, null));
    expect(frRow(b)?.netIncome).toBe(93 * M); // 100 - (10 - 3)
  });

  it("interest expense is withheld when the accrual tag is refused, never the cash stand-in", () => {
    const b = frBuild({
      InterestExpenseNonoperating: [pt(FR.q324, ...NINE24, 70 * M), pt(FR.k24, ...FY24, 100 * M), pt(FR.k25, ...FY24, 200 * M)],
      InterestPaidNet: [pt(FR.q324, ...NINE24, 65 * M), pt(FR.k24, ...FY24, 90 * M)],
      Revenues: [pt(FR.q324, ...NINE24, 700 * M), pt(FR.k24, ...FY24, 1000 * M)],
      Assets: frAssets(),
    });
    expect(frRow(b)?.interestExpense ?? null).toBeNull(); // 87738d9: 25 (InterestPaidNet)
    expect(b.incomeQuarterly.withheld).toContainEqual(
      expect.objectContaining({ field: "interestExpense", text: expect.stringMatching(/InterestExpenseNonoperating.*first reported as 100000000/) }),
    );
  });

  it("control: a filer with no accrual interest tag at all still gets the disclosed cash stand-in", () => {
    const b = frBuild({
      InterestPaidNet: [pt(FR.q324, ...NINE24, 65 * M), pt(FR.k24, ...FY24, 90 * M)],
      Revenues: [pt(FR.q324, ...NINE24, 700 * M), pt(FR.k24, ...FY24, 1000 * M)],
      Assets: frAssets(),
    });
    expect(frRow(b)?.interestExpense).toBe(25 * M);
  });
});

describe("fix round 1 I1: exceptPeriod only for an amendment minuend", () => {
  it("a 10-K that moves its own year +10% against a re-rounded nine months is withheld, not mixed", () => {
    const b = frBuild({
      Revenues: [pt(FR.q324, ...NINE24, 300 * M), pt(FR.k24, ...FY24, 400 * M), pt(FR.q325, ...NINE24, 300.2 * M), pt(FR.k25, ...FY24, 440 * M)],
      Assets: [...frAssets(), inst(FR.q325, "2025-09-30", 1000 * M)],
    });
    expect(frRow(b)?.revenue ?? null).toBeNull(); // 87738d9: 440 - 300.2 = 139.8
    expect(b.incomeQuarterly.withheld).toContainEqual(
      expect.objectContaining({ field: "revenue", text: expect.stringMatching(/presentation changed in 10-K 2026-02-12/) }),
    );
  });
});

describe("fix round 1 I2: a re-rounding to whole millions is not a move", () => {
  it("AEP NCI 4.5M -> 5.0M: not a move; net income is ProfitLoss less NCI", () => {
    const b = frBuild(nciFacts(4.5 * M, 5.0 * M));
    expect(frRow(b)?.netIncome).toBe(98 * M); // 100 - (5.0 - 3.0)
  });
  it.each([
    ["4.5M -> 5.1M", 4.5 * M, 5.1 * M],
    ["4.4M -> 5.0M (a 600K difference)", 4.4 * M, 5.0 * M],
    ["4.5M -> 4.9M (the later copy is not a whole million)", 4.5 * M, 4.9 * M],
  ])("control: %s is still a move", (_name, first, later) => {
    const b = frBuild(nciFacts(first, later));
    expect(frRow(b)?.netIncome ?? null).toBeNull();
  });
  it("AEP interest FY 1,862.8M -> 1,863.0M with the nine months filed only later: the as-filed 463.0M is served", () => {
    const b = frBuild({
      InterestExpenseNonoperating: [pt(FR.k24, ...FY24, 1862.8 * M), pt(FR.q325, ...NINE24, 1400 * M), pt(FR.k25, ...FY24, 1863.0 * M)],
      Revenues: [pt(FR.q324, ...NINE24, 700 * M), pt(FR.k24, ...FY24, 1000 * M)],
      Assets: frAssets(),
    });
    expect(frRow(b)?.interestExpense).toBe(463 * M);
  });
  it("movedBeyond: money only; a share-count unit with the same numbers is a move", () => {
    const a = (unit: string, val: number): LineageCopy => ({ end: "2024-12-31", val, accn: "a", filed: "2025-01-01", form: "10-K", unit });
    expect(movedBeyond(a("USD", 4.5 * M), a("USD", 5.0 * M), 1)).toBe(false);
    expect(movedBeyond(a("USD", 4.5 * M), a("USD", 5.0 * M), 0)).toBe(false);
    expect(movedBeyond(a("shares", 4.5 * M), a("shares", 5.0 * M), 1)).toBe(true);
    expect(movedBeyond(a("USD/shares", 4.5 * M), a("USD/shares", 5.0 * M), 1)).toBe(true);
    expect(movedBeyond(a("USD", 4.4 * M), a("USD", 5.0 * M), 1)).toBe(true);
  });
});

describe("fix round 1 I4: a refused EBIT adjustment refuses the derived EBIT", () => {
  const ebitFacts = (equity: "refused" | "absent"): Record<string, unknown[]> => ({
    IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: [pt(FR.q324, ...NINE24, 700 * M), pt(FR.k24, ...FY24, 1000 * M)],
    InterestExpense: [pt(FR.q324, ...NINE24, 35 * M), pt(FR.k24, ...FY24, 50 * M)],
    ...(equity === "refused"
      ? { IncomeLossFromEquityMethodInvestments: [pt(FR.q324, ...NINE24, 500 * M), pt(FR.k24, ...FY24, 726 * M), pt(FR.k25, ...FY24, 657 * M)] }
      : {}),
    Revenues: [pt(FR.q324, ...NINE24, 700 * M), pt(FR.k24, ...FY24, 1000 * M)],
    Assets: frAssets(),
  });
  it("BRK shape: EBIT is withheld and the reason names the equity-method refusal", () => {
    const b = frBuild(ebitFacts("refused"));
    expect(frRow(b)?.operatingIncome ?? null).toBeNull();
    expect(b.incomeQuarterly.withheld).toContainEqual(
      expect.objectContaining({ field: "operatingIncome", text: expect.stringMatching(/IncomeLossFromEquityMethodInvestments.*withheld.*first reported as 726000000/) }),
    );
    expect(frRow(b)?.ebit ?? null).toBeNull();
  });
  it("control: an adjustment that is simply not filed keeps today's behaviour and text", () => {
    const b = frBuild(ebitFacts("absent"));
    expect(frRow(b)?.operatingIncome).toBe(315 * M); // (1000 - 700) + (50 - 35)
    expect(b.incomeQuarterly.substitutions.some((s) => s.field === "operatingIncome" && /tags none of/.test(s.text))).toBe(true);
  });
});

describe("fix round 1 M5: a refused floor tag does not silently disable the floor", () => {
  it("MCD shape: Depreciation refused for the quarter still floors by its as-filed value, so the subset DDA is not published", () => {
    const b = frBuild({
      DepreciationDepletionAndAmortization: [pt(FR.q324, ...NINE24, 340 * M), pt(FR.k24, ...FY24, 457 * M)],
      Depreciation: [pt(FR.q324, ...NINE24, 1200 * M), pt(FR.k24, ...FY24, 1600 * M), pt(FR.k25, ...FY24, 1800 * M)],
      Revenues: [pt(FR.q324, ...NINE24, 700 * M), pt(FR.k24, ...FY24, 1000 * M)],
      Assets: frAssets(),
    });
    expect(frRow(b)?.depreciationAndAmortization ?? null).toBeNull(); // 87738d9: 117
    // Fix round 2 (F3): the floor is decided from filed copies in one filing: DDA FY 457 is below Depreciation 1,600 in the
    // same 10-K (it was the as-filed Depreciation quarter 600 in round 1). The DDA tag is never published.
    expect(b.incomeQuarterly.notes.some((n) => /DepreciationDepletionAndAmortization 117000000 not used — its filed 2024-01-01\.\.2024-12-31 457000000 is below Depreciation 1600000000 in the same filing \(10-K 2025-02-12/.test(n))).toBe(true);
    expect(b.incomeQuarterly.withheld).toContainEqual(
      expect.objectContaining({ field: "depreciationAndAmortization", text: expect.stringMatching(/Depreciation 2024-12-31:.*first reported as 1600000000/) }),
    );
  });
  it("control: a floor tag that is not filed at all keeps today's behaviour (no floor)", () => {
    const b = frBuild({
      DepreciationDepletionAndAmortization: [pt(FR.q324, ...NINE24, 340 * M), pt(FR.k24, ...FY24, 457 * M)],
      Revenues: [pt(FR.q324, ...NINE24, 700 * M), pt(FR.k24, ...FY24, 1000 * M)],
      Assets: frAssets(),
    });
    expect(frRow(b)?.depreciationAndAmortization).toBe(117 * M);
  });
});

// ---------------------------------------------------------------------------
// Fix round 2 (scoped re-review of 58dfdce): F1, F2, F3, F4, F5.
// ---------------------------------------------------------------------------
const PRETAX = "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest";
/** Pretax 300/400, aggregate 30/40 (optional), InterestExpense 60/80 with the FY re-filed as 88 (+10%, unlabelled). */
function ebitInterestFacts(opts: { aggregate: boolean; refiled: boolean; cash?: boolean; nesting?: "none" | "refused" }): Record<string, unknown[]> {
  return {
    [PRETAX]: [pt(FR.q324, ...NINE24, 300 * M), pt(FR.k24, ...FY24, 400 * M)],
    ...(opts.aggregate ? { NonoperatingIncomeExpense: [pt(FR.q324, ...NINE24, 30 * M), pt(FR.k24, ...FY24, 40 * M)] } : {}),
    InterestExpense: [pt(FR.q324, ...NINE24, 60 * M), pt(FR.k24, ...FY24, 80 * M), ...(opts.refiled ? [pt(FR.k25, ...FY24, 88 * M)] : [])],
    ...(opts.cash === true ? { InterestPaidNet: [pt(FR.q324, ...NINE24, 65 * M), pt(FR.k24, ...FY24, 90 * M)] } : {}),
    ...(opts.nesting === "refused"
      ? { InterestExpenseNonoperating: [pt(FR.q324, ...NINE24, 60 * M), pt(FR.k24, ...FY24, 80 * M), pt(FR.k25, ...FY24, 88 * M)] }
      : {}),
    Revenues: [pt(FR.q324, ...NINE24, 700 * M), pt(FR.k24, ...FY24, 1000 * M)],
    Assets: frAssets(),
  };
}

describe("fix round 2 F1: a refused optional EBIT part is not read as not filed", () => {
  it("control: interest that is not re-filed derives EBIT 110 beside the aggregate", () => {
    const b = frBuild(ebitInterestFacts({ aggregate: true, refiled: false }));
    expect(frRow(b)?.operatingIncome).toBe(110 * M); // 100 + 20 - 10
  });
  it.each([
    ["aggregate filed", { aggregate: true, refiled: true }],
    ["aggregate and InterestPaidNet filed", { aggregate: true, refiled: true, cash: true }],
    ["no aggregate", { aggregate: false, refiled: true }],
  ])("%s: EBIT is withheld and the reason names the interest refusal", (_name, opts) => {
    const b = frBuild(ebitInterestFacts(opts));
    expect(frRow(b)?.operatingIncome ?? null).toBeNull(); // 58dfdce: 90 with a false "not filed" disclosure
    expect(frRow(b)?.ebit ?? null).toBeNull();
    const w = b.incomeQuarterly.withheld.find((x) => x.field === "operatingIncome");
    expect(w?.text).toMatch(/interest expense for the period is withheld \(.*InterestExpense 2024-12-31:.*first reported as 80000000/);
    expect(w?.text).not.toMatch(/not filed/);
    expect(b.incomeQuarterly.substitutions.some((s) => s.field === "operatingIncome" && /not filed/.test(s.text))).toBe(false);
  });
  it("control: interest that is simply not filed keeps the FIN-507 behaviour and text", () => {
    const facts = ebitInterestFacts({ aggregate: true, refiled: false });
    delete facts.InterestExpense;
    const b = frBuild(facts);
    expect(frRow(b)?.operatingIncome).toBe(90 * M); // 100 - 10
    expect(b.incomeQuarterly.substitutions.some((s) => s.field === "operatingIncome" && /no interest-expense element/.test(s.text))).toBe(true);
  });
});

describe("fix round 2 F2: the nesting probe keeps its evidence when the nesting tag is refused", () => {
  it("InterestExpenseNonoperating filed but refused: the interest is still not added back (EBIT 90)", () => {
    const b = frBuild(ebitInterestFacts({ aggregate: true, refiled: false, nesting: "refused" }));
    expect(frRow(b)?.operatingIncome).toBe(90 * M); // 58dfdce: 110
    expect(b.incomeQuarterly.substitutions.some((s) => s.field === "operatingIncome" && /also tags this period's interest as InterestExpenseNonoperating/.test(s.text))).toBe(true);
  });
});

describe("fix round 2 F3: a withheld floor tag is decided from same-filing copies", () => {
  const dda = (fy: number, nine: number) => [pt(FR.q324, ...NINE24, nine * M), pt(FR.k24, ...FY24, fy * M)];
  it("PEP shape: DDA at or above the refused DA in every filing that carries both is served (1,042)", () => {
    const b = frBuild({
      DepreciationDepletionAndAmortization: [...dda(3160, 2118), pt(FR.q325, ...NINE24, 2118 * M)],
      DepreciationAndAmortization: [pt(FR.k24, ...FY24, 3086 * M), pt(FR.q325, ...NINE24, 2067 * M), pt(FR.k25, ...FY24, 3160 * M)],
      Revenues: [pt(FR.q324, ...NINE24, 700 * M), pt(FR.k24, ...FY24, 1000 * M)],
      Assets: frAssets(),
    });
    expect(frRow(b)?.depreciationAndAmortization).toBe(1042 * M); // 58dfdce: withheld; 56d52a9: the mixed 1,093
  });
  it("PEP Q4 2025 shape: DA's year stands alone and its nine months are superseded after the 10-K; DDA is still served (1,136)", () => {
    const q326: Filing = { filed: "2026-10-08", form: "10-Q", fp: "Q3", fy: 2026, accn: "0000000007-26-000009" };
    const FY25 = ["2025-01-01", "2025-12-31"] as const;
    const NINE25 = ["2025-01-01", "2025-09-30"] as const;
    const b = build(
      {
        DepreciationDepletionAndAmortization: [pt(FR.q325, ...NINE25, 2315 * M), pt(q326, ...NINE25, 2315 * M), pt(FR.k25, ...FY25, 3451 * M), pt(FR.k24, ...FY24, 3160 * M)],
        // FY2024 is re-scoped in the 10-K (3,086 -> 3,160), so that 10-K re-presented earlier periods; the nine months in the
        // 10-Q before it are on the old basis (2,259), and only a later 10-Q carries 2,315.
        DepreciationAndAmortization: [pt(FR.k24, ...FY24, 3086 * M), pt(FR.k25, ...FY24, 3160 * M), pt(FR.q325, ...NINE25, 2259 * M), pt(q326, ...NINE25, 2315 * M), pt(FR.k25, ...FY25, 3451 * M)],
        Revenues: [pt(FR.q325, ...NINE25, 700 * M), pt(FR.k25, ...FY25, 1000 * M)],
        Assets: [inst(FR.q325, "2025-09-30", 1000 * M), inst(FR.k25, "2025-12-31", 1000 * M)],
      },
      { annualPeriods: 3, quarterlyPeriods: 8, asOf: "2026-10-15" },
    );
    expect(frRow(b, "2025-12-31")?.depreciationAndAmortization).toBe(1136 * M); // 58dfdce: withheld (as-filed DA quarter 1,192)
  });
  it("no-common-filing control: the as-filed magnitude of the refused floor decides", () => {
    const kA: Filing = { filed: "2025-03-01", form: "10-K/A", fp: "FY", fy: 2024, accn: "0000000007-25-000009" };
    const b = frBuild({
      DepreciationDepletionAndAmortization: [pt(FR.q324, ...NINE24, 340 * M), pt(kA, ...FY24, 457 * M)],
      Depreciation: [pt(FR.q325, ...NINE24, 1200 * M), pt(FR.k24, ...FY24, 1600 * M), pt(FR.k25, ...FY24, 1800 * M)],
      Revenues: [pt(FR.q324, ...NINE24, 700 * M), pt(FR.k24, ...FY24, 1000 * M)],
      Assets: frAssets(),
    });
    expect(frRow(b)?.depreciationAndAmortization ?? null).toBeNull();
    expect(b.incomeQuarterly.notes.some((n) => /DepreciationDepletionAndAmortization 117000000 not used — below the same period's Depreciation 600000000/.test(n))).toBe(true);
  });
});

describe("fix round 2 F4: no gross-profit fill beside its own withholding", () => {
  it("GrossProfit withheld for presentation is not filled as revenue less cost", () => {
    const b = frBuild({
      GrossProfit: [pt(FR.q324, ...NINE24, 1200 * M), pt(FR.k24, ...FY24, 1600 * M), pt(FR.k25, ...FY24, 1800 * M)],
      Revenues: [pt(FR.q324, ...NINE24, 3000 * M), pt(FR.k24, ...FY24, 4000 * M)],
      CostOfRevenue: [pt(FR.q324, ...NINE24, 1800 * M), pt(FR.k24, ...FY24, 2400 * M)],
      Assets: frAssets(),
    });
    expect(frRow(b)?.grossProfit ?? null).toBeNull(); // 58dfdce: 400
    expect(b.incomeQuarterly.withheld.some((w) => w.field === "grossProfit")).toBe(true);
  });
});

describe("fix round 2 F5: a withheld anchor row omission says why", () => {
  it("the omitted cash-flow row names the withheld operating cash flow, not a missing fact", () => {
    const b = frBuild({
      NetCashProvidedByUsedInOperatingActivities: [pt(FR.q324, ...NINE24, 700 * M), pt(FR.k24, ...FY24, 1000 * M), pt(FR.k25, ...FY24, 1200 * M)],
      Assets: frAssets(),
    });
    expect(b.cashflowQuarterly.rows.find((r) => r.date === "2024-12-31")).toBeUndefined();
    expect(b.cashflowQuarterly.notes.some((n) => /2024-12-31: operatingCashFlow is withheld for presentation \(.*first reported as 1000000000.*\); row omitted/.test(n))).toBe(true);
    expect(b.cashflowQuarterly.notes.some((n) => /2024-12-31: no operatingCashFlow fact resolved/.test(n))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B13 final review (whole-branch review of d6f4300): I-1, M-3, M-4, M-5, M-6.
// ---------------------------------------------------------------------------
const FV = {
  k24: { filed: "2025-02-12", form: "10-K", fp: "FY", fy: 2024, accn: "0000000006-25-000001" } as Filing,
  q125: { filed: "2025-05-01", form: "10-Q", fp: "Q1", fy: 2025, accn: "0000000006-25-000011" } as Filing,
  q225: { filed: "2025-08-01", form: "10-Q", fp: "Q2", fy: 2025, accn: "0000000006-25-000012" } as Filing,
  q325: { filed: "2025-10-30", form: "10-Q", fp: "Q3", fy: 2025, accn: "0000000006-25-000013" } as Filing,
  k25: { filed: "2026-02-12", form: "10-K", fp: "FY", fy: 2025, accn: "0000000006-26-000001" } as Filing,
};
const FV_QUARTERS: [Filing, string, string][] = [[FV.q125, "2025-01-01", "2025-03-31"], [FV.q225, "2025-04-01", "2025-06-30"], [FV.q325, "2025-07-01", "2025-09-30"]];
/**
 * A flow of `q` a quarter in 2025. FY2024 is first reported as `fy24` and re-filed by the FY2025 10-K as `fy24Refiled`:
 * a re-filing beyond 1% means that 10-K re-presented the concept and the Q3 10-Q did not, so rule (b) withholds Q4 2025.
 */
const fvFlow = (q: number, fy24: number, fy24Refiled = fy24): unknown[] => [
  pt(FV.k24, ...FY24, fy24), pt(FV.k25, ...FY24, fy24Refiled), pt(FV.k25, "2025-01-01", "2025-12-31", 4 * q),
  ...FV_QUARTERS.map(([f, s, e]) => pt(f, s, e, q)),
  pt(FV.q225, "2025-01-01", "2025-06-30", 2 * q), pt(FV.q325, "2025-01-01", "2025-09-30", 3 * q),
];
/** No OperatingIncomeLoss; pretax 150 a quarter and (with `aggregate`) NonoperatingIncomeExpense -20, both clean. */
const unusedOperandFacts = (extra: Record<string, unknown[]>, aggregate = true, pretaxTag = PRETAX): Record<string, unknown[]> => ({
  Revenues: fvFlow(1_000 * M, 3_800 * M),
  NetIncomeLoss: fvFlow(100 * M, 380 * M),
  [pretaxTag]: fvFlow(150 * M, 560 * M),
  ...(aggregate ? { NonoperatingIncomeExpense: fvFlow(-20 * M, -80 * M) } : {}),
  Assets: [...FV_QUARTERS.map(([f, , e]) => inst(f, e, 9_000 * M)), inst(FV.k25, "2025-12-31", 9_000 * M), inst(FV.k24, "2024-12-31", 9_000 * M)],
  ...extra,
});
/** Builds with every tag in USD except those listed in `eur`. */
const fvBuild = (usGaap: Record<string, unknown[]>, eur: readonly string[] = []) =>
  buildStatementsFromCompanyFacts(
    {
      cik: 99,
      entityName: "Synthetic Co",
      facts: { "us-gaap": Object.fromEntries(Object.entries(usGaap).map(([t, p]) => [t, { label: t, units: eur.includes(t) ? { EUR: p } : { USD: p } }])), dei: {} },
    } as never,
    { symbol: "SYN", cik: "0000000099", annualPeriods: 4, quarterlyPeriods: 8, asOf: "2026-03-01", factsObservedAt: "2026-03-01T00:00:00.000Z", vendorSplits: SPLITS as never },
  );
const Q4_25 = "2025-12-31";
const FV_QUARTER_ENDS = ["2025-03-31", "2025-06-30", "2025-09-30", Q4_25];
const fvRow = (b: ReturnType<typeof fvBuild>) => b.incomeQuarterly.rows.find((r) => r.date === Q4_25);
const ebitWithheld = (b: ReturnType<typeof fvBuild>, period = Q4_25) =>
  b.incomeQuarterly.withheld.filter((w) => (w.field === "operatingIncome" || w.field === "ebit") && w.periods.includes(period));
const ebitText = (b: ReturnType<typeof fvBuild>) =>
  b.incomeQuarterly.substitutions.filter((s) => s.field === "operatingIncome" && s.periods.includes(Q4_25)).map((s) => s.text).join(" ");
const EQUITY_METHOD = "IncomeLossFromEquityMethodInvestments";
const PRETAX_BEFORE_EQUITY = "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments";

describe("B13 final review I-1: an operand the derived EBIT does not use never withholds it", () => {
  it("a re-presented OtherNonoperatingIncomeExpense inside a served aggregate: EBIT 170M, published", () => {
    const b = fvBuild(unusedOperandFacts({ InterestExpenseNonoperating: fvFlow(5 * M, 20 * M), OtherNonoperatingIncomeExpense: fvFlow(-8 * M, -32 * M, -40 * M) }));
    expect(fvRow(b)).toMatchObject({ operatingIncome: 170 * M, ebit: 170 * M }); // d6f4300: null, "OtherNonoperatingIncomeExpense for the period is withheld"
    expect(ebitWithheld(b)).toEqual([]);
    expect(ebitText(b)).toMatch(/already contains them: [^;]*OtherNonoperatingIncomeExpense/);
    expect(ebitText(b)).not.toMatch(/tags none of [^;]*OtherNonoperatingIncomeExpense/);
  });
  it("a re-presented InvestmentIncomeInterest inside a served aggregate: EBIT 170M, published", () => {
    const b = fvBuild(unusedOperandFacts({ InterestExpenseNonoperating: fvFlow(5 * M, 20 * M), InvestmentIncomeInterest: fvFlow(6 * M, 24 * M, 30 * M) }));
    expect(fvRow(b)).toMatchObject({ operatingIncome: 170 * M, ebit: 170 * M }); // d6f4300: null
    expect(ebitWithheld(b)).toEqual([]);
    expect(ebitText(b)).toMatch(/already contains them: [^;]*InvestmentIncomeInterest/);
  });
  it("a re-presented InterestExpenseNonoperating, the only interest element, beside a served aggregate: EBIT 170M", () => {
    const b = fvBuild(unusedOperandFacts({ InterestExpenseNonoperating: fvFlow(5 * M, 20 * M, 25 * M) }));
    expect(fvRow(b)).toMatchObject({ operatingIncome: 170 * M, ebit: 170 * M }); // d6f4300: null, "interest expense for the period is withheld"
    expect(ebitWithheld(b)).toEqual([]);
    expect(ebitText(b)).toMatch(/interest expense \(InterestExpenseNonoperating\) is not added back/);
  });
  it("a re-presented InterestExpense whose period the filer also tags as InterestExpenseNonoperating: the FIN-508 probe drops it (EBIT 90)", () => {
    const b = frBuild(ebitInterestFacts({ aggregate: true, refiled: true, nesting: "refused" }));
    expect(frRow(b)?.operatingIncome).toBe(90 * M); // d6f4300: null (F1); pretax 100 less the aggregate 10
    expect(ebitWithheld(b, "2024-12-31")).toEqual([]);
    expect(b.incomeQuarterly.substitutions.some((s) => s.field === "operatingIncome" && /also tags this period's interest as InterestExpenseNonoperating/.test(s.text))).toBe(true);
  });
  it("a re-presented equity-method result beside a pretax element measured before it is not subtracted, so it does not withhold", () => {
    const b = fvBuild(unusedOperandFacts({ InterestExpenseNonoperating: fvFlow(5 * M, 20 * M), [EQUITY_METHOD]: fvFlow(30 * M, 120 * M, 140 * M) }, true, PRETAX_BEFORE_EQUITY));
    expect(fvRow(b)).toMatchObject({ operatingIncome: 170 * M, ebit: 170 * M }); // d6f4300: null
    expect(ebitWithheld(b)).toEqual([]);
    expect(ebitText(b)).toMatch(/NOT subtracted because the pretax element that served is measured before them: IncomeLossFromEquityMethodInvestments/);
  });
  it("control: with no aggregate, a re-presented OtherNonoperatingIncomeExpense that would be subtracted still withholds the EBIT (I4)", () => {
    const b = fvBuild(unusedOperandFacts({ InterestExpenseNonoperating: fvFlow(5 * M, 20 * M), OtherNonoperatingIncomeExpense: fvFlow(-8 * M, -32 * M, -40 * M) }, false));
    expect(fvRow(b)?.operatingIncome ?? null).toBeNull();
    expect(b.incomeQuarterly.withheld).toContainEqual(
      expect.objectContaining({ field: "operatingIncome", text: expect.stringMatching(/^operatingIncome not derived: OtherNonoperatingIncomeExpense for the period is withheld \(OtherNonoperatingIncomeExpense 2025-12-31: /) }),
    );
  });
  it("control: beside a served aggregate, a re-presented equity-method result that IS subtracted still withholds the EBIT (I4)", () => {
    const b = fvBuild(unusedOperandFacts({ InterestExpenseNonoperating: fvFlow(5 * M, 20 * M), [EQUITY_METHOD]: fvFlow(30 * M, 120 * M, 140 * M) }));
    expect(fvRow(b)?.operatingIncome ?? null).toBeNull();
    expect(b.incomeQuarterly.withheld).toContainEqual(
      expect.objectContaining({ field: "operatingIncome", text: expect.stringMatching(/^operatingIncome not derived: IncomeLossFromEquityMethodInvestments for the period is withheld \(/) }),
    );
  });
  it("control: a re-presented InterestExpense with no nesting beside the aggregate still withholds the EBIT (F1)", () => {
    const b = frBuild(ebitInterestFacts({ aggregate: true, refiled: true }));
    expect(frRow(b)?.operatingIncome ?? null).toBeNull();
    expect(b.incomeQuarterly.withheld.find((w) => w.field === "operatingIncome")?.text).toMatch(/^operatingIncome not derived: interest expense for the period is withheld \(InterestExpense 2024-12-31: /);
  });
});

describe("B13 final review M-3: no operand mismatch is a withholding beside a published derived EBIT", () => {
  it("beside a served aggregate, an other line filed in another currency writes no withholding; EBIT 170M", () => {
    const b = fvBuild(unusedOperandFacts({ InterestExpenseNonoperating: fvFlow(5 * M, 20 * M), OtherNonoperatingIncomeExpense: fvFlow(-8 * M, -32 * M) }), ["OtherNonoperatingIncomeExpense"]);
    expect(fvRow(b)).toMatchObject({ operatingIncome: 170 * M, ebit: 170 * M });
    // d6f4300: a "mixed_unit: OtherNonoperatingIncomeExpense uses EUR ... withheld" entry on all four quarters.
    expect(FV_QUARTER_ENDS.flatMap((p) => ebitWithheld(b, p))).toEqual([]);
    expect(ebitText(b)).toMatch(/already contains them: [^;]*OtherNonoperatingIncomeExpense/);
  });
  it("with no aggregate, a component filed in another currency is not subtracted: main's EBIT (155M) and an error band naming it and why", () => {
    const b = fvBuild(unusedOperandFacts({ InterestExpenseNonoperating: fvFlow(5 * M, 20 * M), OtherNonoperatingIncomeExpense: fvFlow(-8 * M, -32 * M) }, false), ["OtherNonoperatingIncomeExpense"]);
    expect(fvRow(b)).toMatchObject({ operatingIncome: 155 * M, ebit: 155 * M }); // pretax 150 + interest 5, as main
    expect(FV_QUARTER_ENDS.flatMap((p) => ebitWithheld(b, p))).toEqual([]); // d6f4300: mixed_unit on four quarters
    expect(ebitText(b)).toMatch(/error band — OtherNonoperatingIncomeExpense is filed in another currency than the row's reporting currency \(no conversion is made\), so it is not subtracted and stays inside the figure/);
    expect(ebitText(b)).not.toMatch(/tags none of [^;]*OtherNonoperatingIncomeExpense/);
  });
  it("with no aggregate, a component in another currency beside a subtracted one: the stand-in sentence and the error band name each", () => {
    const b = fvBuild(
      unusedOperandFacts({ InterestExpenseNonoperating: fvFlow(5 * M, 20 * M), InvestmentIncomeInterest: fvFlow(6 * M, 24 * M), OtherNonoperatingIncomeExpense: fvFlow(-8 * M, -32 * M) }, false),
      ["OtherNonoperatingIncomeExpense"],
    );
    expect(fvRow(b)).toMatchObject({ operatingIncome: 149 * M, ebit: 149 * M }); // 150 + 5 - 6
    expect(FV_QUARTER_ENDS.flatMap((p) => ebitWithheld(b, p))).toEqual([]); // d6f4300: mixed_unit on four quarters
    expect(ebitText(b)).toMatch(/the NonoperatingIncomeExpense aggregate is not filed; its components the filer tags were subtracted instead \(InvestmentIncomeInterest \(6000000\)\)/);
    expect(ebitText(b)).toMatch(/error band — OtherNonoperatingIncomeExpense is filed in another currency than the row's reporting currency \(no conversion is made\), so it is not subtracted/);
  });
  it("an aggregate filed in another currency is not used: the components the filer tags stand in for it, and the disclosure says why", () => {
    const b = fvBuild(unusedOperandFacts({ InterestExpenseNonoperating: fvFlow(5 * M, 20 * M), OtherNonoperatingIncomeExpense: fvFlow(-8 * M, -32 * M) }), ["NonoperatingIncomeExpense"]);
    expect(fvRow(b)).toMatchObject({ operatingIncome: 163 * M, ebit: 163 * M }); // 150 + 5 + 8: the aggregate is not used, so the interest is added back
    expect(FV_QUARTER_ENDS.flatMap((p) => ebitWithheld(b, p))).toEqual([]); // d6f4300: a mixed_unit withholding for the aggregate
    expect(ebitText(b)).toMatch(
      /the NonoperatingIncomeExpense aggregate is filed in another currency than the row's reporting currency \(no conversion is made\), so it is not used; its components the filer tags were subtracted instead \(OtherNonoperatingIncomeExpense \(-8000000\)\)/,
    );
    expect(ebitText(b)).not.toMatch(/error band — NonoperatingIncomeExpense/);
  });
});

describe("B13 final review M-6: a refused D&A candidate the floor would skip does not end the D&A field", () => {
  type Pair = readonly [nine: number, fy: number];
  /** Filings that carry the floor tags only, so no filing carries a floor tag and DDA together. */
  const FLOOR_ONLY = {
    q324: { filed: "2024-11-05", form: "10-Q", fp: "Q3", fy: 2024, accn: "0000000007-24-000013" } as Filing,
    k24: { filed: "2025-02-12", form: "10-K", fp: "FY", fy: 2024, accn: "0000000007-25-000011" } as Filing,
  };
  const daFacts = (
    dda: readonly [number, number, number],
    { da = [1650, 2199] as Pair, depreciation = [1200, 1600] as Pair | null, daRefiled = false, floorsApart = false } = {},
  ): Record<string, unknown[]> => {
    const [q, k] = floorsApart ? [FLOOR_ONLY.q324, FLOOR_ONLY.k24] : [FR.q324, FR.k24];
    return {
      // DDA's FY2024 is re-filed by the FY2025 10-K beyond 1% with no label, so its Q4 2024 is withheld (C-9).
      DepreciationDepletionAndAmortization: [pt(FR.q324, ...NINE24, dda[0] * M), pt(FR.k24, ...FY24, dda[1] * M), pt(FR.k25, ...FY24, dda[2] * M)],
      ...(depreciation === null ? {} : { Depreciation: [pt(q, ...NINE24, depreciation[0] * M), pt(k, ...FY24, depreciation[1] * M)] }),
      DepreciationAndAmortization: [pt(q, ...NINE24, da[0] * M), pt(k, ...FY24, da[1] * M), ...(daRefiled ? [pt(FR.k25, ...FY24, da[1] * M)] : [])],
      Revenues: [pt(FR.q324, ...NINE24, 700 * M), pt(FR.k24, ...FY24, 1000 * M)],
      Assets: frAssets(),
    };
  };
  const daWithheld = (b: ReturnType<typeof frBuild>) => b.incomeQuarterly.withheld.filter((w) => w.field === "depreciationAndAmortization");
  it("MCD shape: a refused DDA below Depreciation in the filings that carry both is skipped, and D&A is the total DepreciationAndAmortization", () => {
    const b = frBuild(daFacts([340, 457, 500]));
    expect(frRow(b)?.depreciationAndAmortization).toBe(549 * M); // d6f4300: null (the DDA refusal ended the field)
    expect(daWithheld(b)).toEqual([]);
    // Re-pinned for B13 final re-review N-1: the filings that carry both tags decide, not the mixed quarter (668c294:
    // "DepreciationDepletionAndAmortization 160000000 not used — below the same period's Depreciation 400000000").
    expect(b.incomeQuarterly.notes.some((n) => /DepreciationDepletionAndAmortization 160000000 not used — its filed 2024-01-01\.\.2024-12-31 457000000 is below DepreciationAndAmortization 2199000000 in the same filing \(10-K 2025-02-12, 0000000007-25-000001\), so it is not the total \(its quarter is withheld for presentation, so the filings that carry both tags decide/.test(n))).toBe(true);
  });
  it("control: a refused combined tag at or above every floor in the filings that carry both still ends the step (C1)", () => {
    // Re-pinned for B13 final re-review N-1: DepreciationAndAmortization is now below DDA (1,250 and 1,700 against 1,300 and
    // 1,800), as the control's title says. 668c294's fixture (1,650 and 2,199) put DDA below it in both filings, which the
    // same-filing verdict reads as a sub-line: that shape is pinned on its own below.
    const b = frBuild(daFacts([1300, 1800, 1900], { da: [1250, 1700] }));
    expect(frRow(b)?.depreciationAndAmortization ?? null).toBeNull();
    expect(daWithheld(b)).toContainEqual(
      expect.objectContaining({ field: "depreciationAndAmortization", text: expect.stringMatching(/DepreciationDepletionAndAmortization 2024-12-31:.*first reported as 1800000000/) }),
    );
  });
  it("HD shape (N-1): a refused DDA that is the larger tag in every filing carrying both is not skipped on its mixed quarter, so D&A is withheld", () => {
    // HD's Q4 FY2022 in millions: DDA FY 2,975 first reported and re-filed at 2,796 (the 2025 10-K split 179 of amortization
    // out, unlabelled), nine months 2,216; DepreciationAndAmortization 2,455 and 1,830 in every filing. The mixed quarter
    // (580) sits below the narrower synonym's quarter (625), the one-basis quarter (759) above it.
    const b = frBuild(daFacts([2216, 2975, 2796], { da: [1830, 2455], depreciation: null, daRefiled: true }));
    expect(frRow(b)?.depreciationAndAmortization ?? null).toBeNull(); // 668c294: 625M from DepreciationAndAmortization
    expect(daWithheld(b)).toContainEqual(
      expect.objectContaining({ field: "depreciationAndAmortization", text: expect.stringMatching(/DepreciationDepletionAndAmortization 2024-12-31:.*first reported as 2975000000/) }),
    );
    expect(b.incomeQuarterly.notes.some((n) => /not the total/.test(n))).toBe(false);
  });
  it("a refused DDA at or above Depreciation but below DepreciationAndAmortization in the filings that carry both is a sub-line: skipped", () => {
    // 668c294's control fixture. Its mixed quarter (600) is above both floors' quarters (400, 549), but DDA is below
    // DepreciationAndAmortization in both filings (1,800 against 2,199; 1,300 against 1,650), as an unrefused DDA would be skipped.
    const b = frBuild(daFacts([1300, 1800, 1900]));
    expect(frRow(b)?.depreciationAndAmortization).toBe(549 * M); // 668c294: null
    expect(daWithheld(b)).toEqual([]);
    // The FY2024 row skips DDA by the same floor (1,900 against 2,199), so the quarter and its year use one tag.
    expect(b.incomeAnnual.rows.find((r) => r.date === "2024-12-31")?.depreciationAndAmortization).toBe(2199 * M);
  });
  it("with no filing carrying both tags, the as-filed quarter decides: below a floor, the candidate is skipped", () => {
    const b = frBuild(daFacts([340, 457, 500], { floorsApart: true }));
    expect(frRow(b)?.depreciationAndAmortization).toBe(549 * M);
    expect(daWithheld(b)).toEqual([]);
    expect(b.incomeQuarterly.notes.some((n) => /DepreciationDepletionAndAmortization 160000000 not used — below the same period's Depreciation 400000000, so it is not the total \(its quarter is withheld for presentation and no filing carries both tags, so its as-filed value is compared\)/.test(n))).toBe(true);
  });
  it("with no filing carrying both tags, the as-filed quarter decides: at or above every floor, the refusal ends the step (C1)", () => {
    const b = frBuild(daFacts([1300, 1800, 1900], { floorsApart: true }));
    expect(frRow(b)?.depreciationAndAmortization ?? null).toBeNull();
    expect(daWithheld(b)).toContainEqual(
      expect.objectContaining({ field: "depreciationAndAmortization", text: expect.stringMatching(/DepreciationDepletionAndAmortization 2024-12-31:.*first reported as 1800000000/) }),
    );
  });
});

describe("B13 final review M-4: a presentation refusal ends its synonym step even inside notes.quietly", () => {
  const tags = ["InterestExpense", "InterestExpenseNonoperating"];
  it("muted: the refused synonym ends the step, so the narrower one does not serve", () => {
    expect(resolveFirstStepForTests(tags, ["InterestExpense"], { InterestExpenseNonoperating: 5 }, true)).toBeNull(); // d6f4300: 5
  });
  it("control: unmuted, the refused synonym ends the step as before", () => {
    expect(resolveFirstStepForTests(tags, ["InterestExpense"], { InterestExpenseNonoperating: 5 }, false)).toBeNull();
  });
  it("control: with no refusal the first filed synonym serves, muted or not", () => {
    expect(resolveFirstStepForTests(tags, [], { InterestExpenseNonoperating: 5 }, true)).toBe(5);
    expect(resolveFirstStepForTests(tags, [], { InterestExpenseNonoperating: 5 }, false)).toBe(5);
  });
});

describe("B13 final review M-5: the general-route ebit withholding covers a withheld filed operating income", () => {
  it("a filed OperatingIncomeLoss withheld for presentation: the ebit withholding says withheld or not derived", () => {
    const q = build(reclassifiedOperatingIncomeFacts(), { ...OPTS3 }).incomeQuarterly;
    const ebit = q.withheld.filter((w) => w.field === "ebit" && w.periods.includes("2025-12-31")).map((w) => w.text);
    // d6f4300: "operating income could not be derived for this period", where nothing was derived.
    expect(ebit).toEqual([
      "ebit WITHHELD: operating income is withheld or could not be derived for this period (see the operatingIncome withholding); pretax income plus interest expense alone is not EBIT",
    ]);
  });
});
