import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts, lowerBoundDAndACaveat, type StatementBuildOptions } from "@/edgar/statements";

/**
 * Derived operating lines from filed tags (audit 2026-10-27, batch B13). Fixtures are inline
 * companyfacts with the filed amounts the findings cite; accession numbers are synthetic.
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
const K25: Filing = { filed: "2026-02-24", form: "10-K", fp: "FY", fy: 2025, accn: "0000000099-26-000001" };
const fy25 = (val: number) => [fact(K25, "2025-01-01", "2025-12-31", val)];

describe("component floors", () => {
  const mcd = {
    Revenues: fy25(26_000 * M),
    NetIncomeLoss: fy25(8_563 * M),
    OperatingIncomeLoss: fy25(12_393 * M),
    NetCashProvidedByUsedInOperatingActivities: fy25(10_000 * M),
    PaymentsToAcquirePropertyPlantAndEquipment: fy25(3_365 * M),
    Assets: [fact(K25, undefined, "2025-12-31", 60_000 * M)],
    DepreciationDepletionAndAmortization: fy25(457 * M),
    DepreciationAndAmortization: fy25(2_199 * M),
    Depreciation: fy25(1_600 * M),
  };

  it("a combined D&A below the same period's Depreciation is not the total (FIN-510)", () => {
    const b = build(mcd);
    const inc = b.incomeAnnual.rows[0]!,
      cf = b.cashflowAnnual.rows[0]!;
    expect(inc.depreciationAndAmortization).toBe(2_199 * M);
    expect(inc.fieldProvenance?.depreciationAndAmortization?.tags).toEqual(["us-gaap/DepreciationAndAmortization"]);
    expect(inc.ebitda).toBe(14_592 * M);
    expect(cf.depreciationAndAmortization).toBe(2_199 * M);
    expect(b.incomeAnnual.notes.some((n) => /DepreciationDepletionAndAmortization 457000000 .*below .*Depreciation 1600000000/.test(n))).toBe(true);
    expect(b.incomeAnnual.withheld.filter((w) => w.field === "depreciationAndAmortization")).toEqual([]);
  });
  it("control: a combined D&A at or above its components keeps the first synonym", () => {
    const b = build({ ...mcd, DepreciationDepletionAndAmortization: fy25(3_000 * M) });
    expect(b.incomeAnnual.rows[0]!.depreciationAndAmortization).toBe(3_000 * M);
  });
  it("a total within rounding of a component is kept (0.5% house tolerance)", () => {
    const b = build({ ...mcd, DepreciationDepletionAndAmortization: fy25(1_595 * M) });
    expect(b.incomeAnnual.rows[0]!.depreciationAndAmortization).toBe(1_595 * M);
  });
  it("a small total within the absolute rounding allowance of a component is kept; beyond it, it is not", () => {
    const small = { ...mcd, DepreciationDepletionAndAmortization: fy25(99 * M), DepreciationAndAmortization: fy25(150 * M), Depreciation: fy25(100 * M) };
    expect(build(small).incomeAnnual.rows[0]!.depreciationAndAmortization).toBe(99 * M); // 1M below: within max(0.5M, 2M)
    expect(build({ ...small, DepreciationDepletionAndAmortization: fy25(97 * M) }).incomeAnnual.rows[0]!.depreciationAndAmortization).toBe(150 * M); // 3M below
  });
  it("a floor probe that cannot resolve writes no note and no withholding", () => {
    // Depreciation filed in another currency: unmuted, sameRowEvidence would record a mixed_unit withholding on D&A.
    const facts = companyFacts({ ...mcd, Depreciation: [] }) as unknown as { facts: { "us-gaap": Record<string, unknown> } };
    facts.facts["us-gaap"].Depreciation = { label: "Depreciation", units: { EUR: fy25(1_500 * M) } };
    const b = buildStatementsFromCompanyFacts(facts as never, {
      symbol: "SYN",
      cik: "0000000099",
      annualPeriods: 4,
      quarterlyPeriods: 8,
      asOf: "2026-10-22",
      factsObservedAt: "2026-10-22T00:00:00.000Z",
      vendorSplits: SPLITS as never,
    });
    expect(b.incomeAnnual.rows[0]!.depreciationAndAmortization).toBe(457 * M); // no same-currency floor: the first synonym stands, as at HEAD
    expect(b.incomeAnnual.withheld.filter((w) => w.field === "depreciationAndAmortization")).toEqual([]);
    expect(b.incomeAnnual.notes.filter((n) => /^depreciationAndAmortization .*(mixed_unit|period_mismatch)/.test(n))).toEqual([]);
  });
  it("a floor skip followed by the component composition is a lower bound, not a withholding", () => {
    const rest = Object.fromEntries(Object.entries(mcd).filter(([tag]) => tag !== "DepreciationAndAmortization"));
    const b = build({ ...rest, AmortizationOfIntangibleAssets: fy25(300 * M) });
    expect(b.incomeAnnual.rows[0]!.depreciationAndAmortization).toBe(1_900 * M);
    expect(b.incomeAnnual.withheld.filter((w) => w.field === "depreciationAndAmortization")).toEqual([]);
    expect(lowerBoundDAndACaveat(b.incomeAnnual.rows)).toMatch(/2025-12-31/);
  });
  it("with every combined synonym below a component and no Depreciation, D&A is withheld with the reason (CSCO shape)", () => {
    const K26: Filing = { filed: "2026-09-10", form: "10-K", fp: "FY", fy: 2026, accn: "0000000099-26-000002" };
    const y = (v: number) => [fact(K26, "2025-07-27", "2026-07-25", v)];
    const b = build({
      Revenues: y(60_000 * M),
      NetIncomeLoss: y(11_000 * M),
      OperatingIncomeLoss: y(15_368 * M),
      Assets: [fact(K26, undefined, "2026-07-25", 120_000 * M)],
      DepreciationDepletionAndAmortization: y(700 * M),
      AmortizationOfIntangibleAssets: y(916 * M),
    });
    expect(b.incomeAnnual.rows[0]!.depreciationAndAmortization).toBeNull();
    expect(b.incomeAnnual.rows[0]!.ebitda).toBeNull();
    expect(b.incomeAnnual.withheld).toContainEqual(
      expect.objectContaining({
        field: "depreciationAndAmortization",
        periods: ["2026-07-25"],
        text: expect.stringMatching(/700000000 .*below .*AmortizationOfIntangibleAssets 916000000/),
      }),
    );
  });
  it("annual R&D below the same period's R&D excluding acquired IPR&D is not the total (FIN-510-V1)", () => {
    const K: Filing = { filed: "2026-02-11", form: "10-K", fp: "FY", fy: 2025, accn: "0000000099-26-000003" };
    const y = (start: string, end: string, v: number) => [fact(K, start, end, v)];
    const b = build({
      Revenues: [...y("2024-12-30", "2025-12-28", 94_000 * M), ...y("2022-01-03", "2023-01-01", 79_990 * M)],
      NetIncomeLoss: [...y("2024-12-30", "2025-12-28", 26_804 * M), ...y("2022-01-03", "2023-01-01", 17_941 * M)],
      ResearchAndDevelopmentExpense: [...y("2024-12-30", "2025-12-28", 109 * M), ...y("2022-01-03", "2023-01-01", 0)],
      ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost: [
        ...y("2024-12-30", "2025-12-28", 14_665 * M),
        ...y("2022-01-03", "2023-01-01", 14_135 * M),
      ],
    });
    const rd = Object.fromEntries(b.incomeAnnual.rows.map((r) => [r.date, r.researchAndDevelopmentExpenses]));
    expect(rd).toMatchObject({ "2025-12-28": 14_665 * M, "2023-01-01": 14_135 * M });
  });
  it("control: a filer that tags only ResearchAndDevelopmentExpense keeps it", () => {
    expect(
      build({ Revenues: fy25(40_000 * M), NetIncomeLoss: fy25(3_000 * M), ResearchAndDevelopmentExpense: fy25(5_000 * M) }).incomeAnnual.rows[0]!
        .researchAndDevelopmentExpenses,
    ).toBe(5_000 * M);
  });
});
