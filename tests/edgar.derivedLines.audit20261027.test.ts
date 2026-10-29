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
    const b = build({ ...mcd, DepreciationAndAmortization: [], DepreciationDepletionAndAmortization: fy25(1_595 * M) }); // no DA: isolates the Depreciation floor
    expect(b.incomeAnnual.rows[0]!.depreciationAndAmortization).toBe(1_595 * M);
  });
  it("a small total within the absolute rounding allowance of a component is kept; beyond it, it is not", () => {
    const small = { ...mcd, DepreciationDepletionAndAmortization: fy25(99 * M), DepreciationAndAmortization: [], Depreciation: fy25(100 * M) }; // no DA: isolates the Depreciation floor
    expect(build(small).incomeAnnual.rows[0]!.depreciationAndAmortization).toBe(99 * M); // 1M below: within max(0.5M, 2M)
    expect(build({ ...small, DepreciationDepletionAndAmortization: fy25(97 * M) }).incomeAnnual.rows[0]!.depreciationAndAmortization).toBe(100 * M); // 3M below: Depreciation alone, a lower bound
  });
  it("a floor probe that cannot resolve writes no note and no withholding", () => {
    // Depreciation filed in another currency: unmuted, sameRowEvidence would record a mixed_unit withholding on D&A.
    const facts = companyFacts({ ...mcd, DepreciationAndAmortization: [], Depreciation: [] }) as unknown as { facts: { "us-gaap": Record<string, unknown> } };
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
  it("the skip note and the withholding carry the em-dash sentence and no replacement character", () => {
    const b = build(mcd);
    const note = b.incomeAnnual.notes.find((n) => /DepreciationDepletionAndAmortization 457000000/.test(n))!;
    expect(note).toContain("not used — below the same period's Depreciation 1600000000, so it is not the total");
    expect(note).not.toContain("�");
    const K26: Filing = { filed: "2026-09-10", form: "10-K", fp: "FY", fy: 2026, accn: "0000000099-26-000002" };
    const y = (v: number) => [fact(K26, "2025-07-27", "2026-07-25", v)];
    const w = build({ Revenues: y(60_000 * M), NetIncomeLoss: y(11_000 * M), OperatingIncomeLoss: y(15_368 * M),
      Assets: [fact(K26, undefined, "2026-07-25", 120_000 * M)],
      DepreciationDepletionAndAmortization: y(700 * M), AmortizationOfIntangibleAssets: y(916 * M) })
      .incomeAnnual.withheld.find((x) => x.field === "depreciationAndAmortization")!;
    expect(w.text).toContain("not used — below the same period's AmortizationOfIntangibleAssets 916000000");
    expect(w.text).not.toContain("�");
  });

  describe("DepreciationAndAmortization floors DepreciationDepletionAndAmortization (fix round 1)", () => {
    const Q1: Filing = { filed: "2026-05-01", form: "10-Q", fp: "Q1", fy: 2026, accn: "0000000099-26-000010" };
    const q = (v: number) => [fact(Q1, "2026-01-01", "2026-03-31", v)];
    const base = {
      Revenues: q(6_500 * M), NetIncomeLoss: q(2_000 * M), OperatingIncomeLoss: q(3_000 * M),
      Assets: [fact(Q1, undefined, "2026-03-31", 60_000 * M)],
    };
    const quarter = (extra: Record<string, unknown[]>) => build({ ...base, ...extra }).incomeQuarterly.rows.find((r) => r.date === "2026-03-31")!;
    it("MCD quarterly: a DDA of 111M beside a DA of 565M is the subset, so D&A is 565M", () => {
      const r = quarter({ DepreciationDepletionAndAmortization: q(111 * M), DepreciationAndAmortization: q(565 * M) });
      expect(r.depreciationAndAmortization).toBe(565 * M);
      expect(r.fieldProvenance?.depreciationAndAmortization?.tags).toEqual(["us-gaap/DepreciationAndAmortization"]);
      expect(r.ebitda).toBe(3_565 * M);
    });
    it("control: a DDA at or above its DA keeps DDA", () => {
      const r = quarter({ DepreciationDepletionAndAmortization: q(600 * M), DepreciationAndAmortization: q(565 * M) });
      expect(r.depreciationAndAmortization).toBe(600 * M);
    });
    it("control: a filer with only DDA keeps DDA", () => {
      expect(quarter({ DepreciationDepletionAndAmortization: q(111 * M) }).depreciationAndAmortization).toBe(111 * M);
    });
  });
});

describe("bank interest income", () => {
  // FIN-510-V1 (JPM sub-case): a bank's interest income is its operating total, as the vendor field carries it.
  const bankFacts = {
    Revenues: fy25(182_000 * M),
    NetIncomeLoss: fy25(57_000 * M),
    InterestExpenseOperating: fy25(97_900 * M),
    InvestmentIncomeInterest: fy25(28_032 * M),
    InterestIncomeOperating: fy25(193_341 * M),
    Assets: [fact(K25, undefined, "2025-12-31", 4_000_000 * M)],
  };
  it("a bank's interest income is total operating interest income, not securities interest", () => {
    const row = build(bankFacts, { bankRevenue: true }).incomeAnnual.rows[0]!;
    expect(row.interestIncome).toBe(193_341 * M);
    expect(row.fieldProvenance?.interestIncome?.tags).toEqual(["us-gaap/InterestIncomeOperating"]);
  });
  it("control: a non-bank that tags both keeps the non-operating figure", () => {
    expect(build(bankFacts, { bankRevenue: false }).incomeAnnual.rows[0]!.interestIncome).toBe(28_032 * M);
  });
});

describe("derived EBIT operands", () => {
  const Q1: Filing = { filed: "2026-04-30", form: "10-Q", fp: "Q1", fy: 2026, accn: "0000000099-26-000011" };
  const Q2: Filing = { filed: "2026-08-05", form: "10-Q", fp: "Q2", fy: 2026, accn: "0000000099-26-000012" };
  const PRETAX = "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest";
  const lly26 = {
    Revenues: [fact(Q1, "2026-01-01", "2026-03-31", 19_799 * M), fact(Q2, "2026-04-01", "2026-06-30", 22_974 * M)],
    NetIncomeLoss: [fact(Q1, "2026-01-01", "2026-03-31", 7_000 * M), fact(Q2, "2026-04-01", "2026-06-30", 7_500 * M)],
    [PRETAX]: [fact(Q1, "2026-01-01", "2026-03-31", 8_850 * M), fact(Q2, "2026-04-01", "2026-06-30", 9_247 * M)],
    NonoperatingIncomeExpense: [fact(Q1, "2026-01-01", "2026-03-31", -65 * M), fact(Q2, "2026-04-01", "2026-06-30", 269 * M)],
    // Quarter ends are discovered from 10-Q Assets instants: without them no quarterly row exists.
    Assets: [fact(Q1, undefined, "2026-03-31", 110_000 * M), fact(Q2, undefined, "2026-06-30", 112_000 * M)],
  };
  it("with the aggregate filed and no interest element, EBIT is pretax less the aggregate, disclosed (FIN-507)", () => {
    const q = build(lly26).incomeQuarterly;
    const row = (d: string) => q.rows.find((r) => r.date === d)!;
    expect(row("2026-06-30")).toMatchObject({ operatingIncome: 8_978 * M, ebit: 8_978 * M });
    expect(row("2026-03-31")).toMatchObject({ operatingIncome: 8_915 * M, ebit: 8_915 * M });
    const text = q.substitutions.filter((s) => s.field === "operatingIncome" && s.periods.includes("2026-06-30")).map((s) => s.text).join(" ");
    expect(text).toMatch(/no interest-expense element .* is filed for the period/);
    expect(text).toMatch(/understates EBIT by that interest/);
    expect(text).not.toMatch(/may ALREADY contain the interest expense added back/);
  });
  it("with neither interest nor the aggregate, operating income and EBIT are withheld with the missing operand named", () => {
    const pretaxOnly = Object.fromEntries(Object.entries(lly26).filter(([tag]) => tag !== "NonoperatingIncomeExpense"));
    const q = build(pretaxOnly).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2026-06-30")!.operatingIncome).toBeNull();
    expect(q.withheld).toContainEqual(expect.objectContaining({ field: "operatingIncome", text: expect.stringMatching(/interest expense .*not filed .*no NonoperatingIncomeExpense aggregate/) }));
    const ebitHeld = q.withheld.filter((w) => w.field === "ebit").map((w) => w.text).join(" ");
    // Re-pinned by B13 final review M-5 (was /operating income could not be derived/): the same text also covers a filed
    // OperatingIncomeLoss withheld for presentation, where nothing was derived.
    expect(ebitHeld).toMatch(/operating income is withheld or could not be derived for this period/);
    expect(ebitHeld).not.toMatch(/bank-style filer/);
  });
  it("control: a filed interest element beside the aggregate keeps today's derivation and caveat", () => {
    const q = build({ ...lly26, InterestExpense: [fact(Q2, "2026-04-01", "2026-06-30", 150 * M)] }).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2026-06-30")!.operatingIncome).toBe((9_247 + 150 - 269) * M);
    expect(q.substitutions.some((s) => s.field === "operatingIncome" && /may ALREADY contain/.test(s.text))).toBe(true);
  });
  // Task 3 review: an operand filed in another currency is named for what it is, and never both withheld and published.
  const buildEur = (usGaap: Record<string, unknown[]>, eurTags: string[]) => {
    const f = companyFacts(Object.fromEntries(Object.entries(usGaap).filter(([tag]) => !eurTags.includes(tag)))) as unknown as { facts: { "us-gaap": Record<string, unknown> } };
    for (const tag of eurTags) f.facts["us-gaap"][tag] = { label: tag, units: { EUR: usGaap[tag] } };
    return buildStatementsFromCompanyFacts(f as never, { symbol: "SYN", cik: "0000000099", annualPeriods: 4, quarterlyPeriods: 8, asOf: "2026-10-22", factsObservedAt: "2026-10-22T00:00:00.000Z", vendorSplits: SPLITS as never });
  };
  it("an interest element filed in another currency beside the aggregate is skipped, disclosed as such, and leaves no withholding beside the published value", () => {
    const q = buildEur({ ...lly26, InterestExpense: [fact(Q2, "2026-04-01", "2026-06-30", 150 * M)] }, ["InterestExpense"]).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2026-06-30")).toMatchObject({ operatingIncome: 8_978 * M, ebit: 8_978 * M });
    expect(q.withheld.filter((w) => w.field === "operatingIncome" && w.periods.includes("2026-06-30"))).toEqual([]);
    const text = q.substitutions.filter((s) => s.field === "operatingIncome" && s.periods.includes("2026-06-30")).map((s) => s.text).join(" ");
    expect(text).toMatch(/interest expense .*filed in another currency/);
    expect(text).not.toMatch(/no interest-expense element .* is filed for the period/);
    expect(text).toMatch(/understates EBIT by that interest/);
  });
  it("an interest element filed in another currency with no aggregate withholds with the part's own reason only", () => {
    const rest = Object.fromEntries(Object.entries(lly26).filter(([tag]) => tag !== "NonoperatingIncomeExpense"));
    const q = buildEur({ ...rest, InterestExpense: [fact(Q2, "2026-04-01", "2026-06-30", 150 * M)] }, ["InterestExpense"]).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2026-06-30")!.operatingIncome).toBeNull();
    const held = q.withheld.filter((w) => w.field === "operatingIncome" && w.periods.includes("2026-06-30")).map((w) => w.text);
    expect(held.length).toBeGreaterThan(0);
    expect(held.join(" ")).toMatch(/mixed_unit: InterestExpense uses EUR/);
  });
  it("a pretax total filed in another currency records the part's own reason, not also 'pretax income is not filed'", () => {
    const q = buildEur(lly26, [PRETAX]).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2026-06-30")!.operatingIncome).toBeNull();
    const held = q.withheld.filter((w) => w.field === "operatingIncome" && w.periods.includes("2026-06-30")).map((w) => w.text);
    expect(held.join(" ")).toMatch(/mixed_unit: /);
    expect(held.filter((t) => /pretax income is not filed/.test(t))).toEqual([]);
  });
  // FIN-507-V1 (synthetic, the probe's figures)
  const K: Filing = { form: "10-K", fp: "FY", fy: 2025, filed: "2026-02-13", accn: "0000000099-26-000001" };
  const a = (v: number) => [fact(K, "2025-01-01", "2025-12-31", v)];
  const common = {
    Revenues: a(40_000),
    NetIncomeLoss: a(3_000),
    Assets: [fact(K, undefined, "2025-12-31", 90_000)],
    InterestExpense: a(400),
    NonoperatingIncomeExpense: a(150),
    DepreciationDepletionAndAmortization: a(1_000),
  };
  it("pretax filed only as domestic + foreign still derives EBIT (FIN-507-V1)", () => {
    const b = build({ ...common, IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic: a(2_600), IncomeLossFromContinuingOperationsBeforeIncomeTaxesForeign: a(1_400) }).incomeAnnual;
    expect(b.rows[0]).toMatchObject({ incomeBeforeTax: 4_000, operatingIncome: 4_250, ebit: 4_250, ebitda: 5_250 });
    const text = b.substitutions.filter((s) => s.field === "operatingIncome").map((s) => s.text).join(" ");
    expect(text).toMatch(/IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic \+ IncomeLossFromContinuingOperationsBeforeIncomeTaxesForeign/);
    expect(text).toMatch(/taken as the full pretax total/);
    expect(b.withheld.filter((w) => /bank-style filer/.test(w.text))).toEqual([]);
  });
  it("control: with the pretax total filed, EBIT is 4,000 + 400 - 150 = 4,250 as before", () => {
    expect(build({ ...common, [PRETAX]: a(4_000) }).incomeAnnual.rows[0]).toMatchObject({ operatingIncome: 4_250, ebit: 4_250 });
  });
});

describe("B-39 keyed on the period", () => {
  const PRETAX = "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest";
  const k23: Filing = { filed: "2023-02-22", form: "10-K", fp: "FY", fy: 2022, accn: "0000000099-23-000001" };
  const k24: Filing = { filed: "2024-02-21", form: "10-K", fp: "FY", fy: 2023, accn: "0000000099-24-000001" };
  const k25b: Filing = { filed: "2025-02-19", form: "10-K", fp: "FY", fy: 2024, accn: "0000000099-25-000001" };
  const y22 = (f: Filing, v: number) => fact(f, "2022-01-01", "2022-12-31", v);
  const AS_OF_2025 = { asOf: "2025-03-01", factsObservedAt: "2025-03-01T00:00:00.000Z" };
  const lly22: Record<string, unknown[]> = {
    Revenues: [y22(k23, 28_541.4 * M), y22(k24, 28_541.4 * M), y22(k25b, 28_541.4 * M)],
    NetIncomeLoss: [y22(k23, 6_244.8 * M)],
    Assets: [fact(k23, undefined, "2022-12-31", 49_490 * M)],
    [PRETAX]: [y22(k23, 6_806.4 * M), y22(k24, 6_806.4 * M), y22(k25b, 6_806.4 * M)],
    NonoperatingIncomeExpense: [y22(k23, -320.9 * M), y22(k24, -320.9 * M), y22(k25b, -320.9 * M)],
    InterestExpense: [y22(k23, 331.6 * M), y22(k24, 331.6 * M)],
    InterestExpenseNonoperating: [y22(k25b, 331.6 * M)],
  };
  // Synthetic 2022 quarters so a Q4 2022 row is derived (FY - 9M); quarter ends come from 10-Q Assets instants.
  const withQuarters2022 = (facts: Record<string, unknown[]>, q3: Filing): Record<string, unknown[]> => {
    const q1: Filing = { filed: "2022-05-03", form: "10-Q", fp: "Q1", fy: 2022, accn: "0000000099-22-000001" };
    const q2: Filing = { filed: "2022-08-02", form: "10-Q", fp: "Q2", fy: 2022, accn: "0000000099-22-000002" };
    const quarters: [Filing, string, string][] = [[q1, "2022-01-01", "2022-03-31"], [q2, "2022-04-01", "2022-06-30"], [q3, "2022-07-01", "2022-09-30"]];
    const perQuarter: Record<string, number> = { Revenues: 7_000 * M, [PRETAX]: 1_700 * M, NonoperatingIncomeExpense: -80 * M, InterestExpense: 83 * M };
    const out: Record<string, unknown[]> = { ...facts };
    for (const [tag, v] of Object.entries(perQuarter)) {
      out[tag] = [...(out[tag] ?? []), ...quarters.map(([f, s, e]) => fact(f, s, e, v)), fact(q3, "2022-01-01", "2022-09-30", 3 * v)];
    }
    out.Assets = [...(out.Assets ?? []), ...quarters.map(([f, , e]) => fact(f, undefined, e, 49_000 * M))];
    return out;
  };
  it("interest the filer re-filed as the aggregate's child is not added back for that period (FIN-508)", () => {
    const b = build(lly22, AS_OF_2025).incomeAnnual;
    expect(b.rows.find((r) => r.date === "2022-12-31")!.operatingIncome).toBeCloseTo(7_127.3 * M, 0);
    const text = b.substitutions.filter((s) => s.field === "operatingIncome").map((s) => s.text).join(" ");
    expect(text).toMatch(/also tags this period's interest as InterestExpenseNonoperating/);
    expect(text).not.toMatch(/may ALREADY contain the interest expense added back/);
  });
  it("control: with no InterestExpenseNonoperating fact for the period, today's add-back and caveat stand", () => {
    const older = Object.fromEntries(Object.entries(lly22).filter(([tag]) => tag !== "InterestExpenseNonoperating"));
    const b = build(older, AS_OF_2025).incomeAnnual;
    expect(b.rows.find((r) => r.date === "2022-12-31")!.operatingIncome).toBeCloseTo(7_458.9 * M, 0);
    expect(b.substitutions.some((s) => s.field === "operatingIncome" && /may ALREADY contain/.test(s.text))).toBe(true);
  });
  it("control: the period check adds no 'not derived' note for a child tag filed annually only", () => {
    const q322: Filing = { filed: "2022-11-01", form: "10-Q", fp: "Q3", fy: 2022, accn: "0000000099-22-000003" };
    const b = build(withQuarters2022(lly22, q322), AS_OF_2025);
    expect(b.incomeQuarterly.rows.some((r) => r.date === "2022-12-31")).toBe(true);
    expect(b.incomeQuarterly.notes.filter((n) => /InterestExpenseNonoperating .* not derived/.test(n))).toEqual([]);
  });
});

describe("other non-operating result", () => {
  const PRETAX = "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest";
  // JNJ filed this 10-Q on 2026-10-21 (retained companyfacts). A date after the build's asOf (2026-10-22)
  // drops every fact, and with no 10-Q Assets instant no quarter end is discovered: both made the first draft build no row.
  const Q3J: Filing = { filed: "2026-10-21", form: "10-Q", fp: "Q3", fy: 2026, accn: "0000000099-26-000021" };
  const jq = (v: number) => [fact(Q3J, "2026-06-29", "2026-09-27", v)];
  const jnj = {
    Revenues: jq(24_000 * M),
    NetIncomeLoss: jq(50 * M),
    [PRETAX]: jq(34 * M),
    InterestExpenseNonoperating: jq(217 * M),
    InvestmentIncomeInterest: jq(186 * M),
    OtherNonoperatingIncomeExpense: jq(-5_780 * M),
    Assets: [fact(Q3J, undefined, "2026-09-27", 190_000 * M)],
  };
  const without = (facts: Record<string, unknown[]>, tag: string) => Object.fromEntries(Object.entries(facts).filter(([t]) => t !== tag));
  const opRow = (usGaap: Record<string, unknown[]>) => build(usGaap).incomeQuarterly;
  const opText = (q: ReturnType<typeof opRow>) => q.substitutions.filter((s) => s.field === "operatingIncome").map((s) => s.text).join(" ");

  it("a filer-tagged OtherNonoperatingIncomeExpense leaves the derived EBIT and is named (FIN-509)", () => {
    const q = opRow(jnj);
    expect(q.rows.find((r) => r.date === "2026-09-27")!.operatingIncome).toBe(5_845 * M); // 34 + 217 - 186 + 5,780
    const text = opText(q);
    expect(text).toMatch(/OtherNonoperatingIncomeExpense \(-5780000000\)/);
    expect(text).toMatch(/aggregate is not filed; its components the filer tags were subtracted instead/);
    expect(text).toMatch(/overstates EBIT by the net interest added back \(31000000\)/);
  });
  it("control: beside a filed aggregate the other line is inside it and is not subtracted twice", () => {
    // B-39: InterestExpenseNonoperating is nested in the aggregate, so EBIT = pretax - aggregate.
    const q = opRow({ ...jnj, NonoperatingIncomeExpense: jq(-5_749 * M) });
    expect(q.rows.find((r) => r.date === "2026-09-27")!.operatingIncome).toBe((34 + 5_749) * M);
  });
  it("beside a filed aggregate the disclosure lists the other line as already inside it", () => {
    const q = opRow({ ...jnj, NonoperatingIncomeExpense: jq(-5_749 * M) });
    expect(q.substitutions.some((s) => s.field === "operatingIncome" && /already contains them: .*OtherNonoperatingIncomeExpense/.test(s.text))).toBe(true);
  });
  it("control: with the aggregate filed and no interest element (Task 3), the components do not change the figure", () => {
    const noInterest = without(jnj, "InterestExpenseNonoperating");
    const q = opRow({ ...noInterest, NonoperatingIncomeExpense: jq(-5_749 * M) });
    expect(q.rows.find((r) => r.date === "2026-09-27")!.operatingIncome).toBe((34 + 5_749) * M);
  });
  it("with the other line alone, the caveat's net interest is the whole interest added back", () => {
    const noInvestment = without(jnj, "InvestmentIncomeInterest");
    const text = opText(opRow(noInvestment));
    expect(text).toMatch(/non-operating items subtracted from the derivation: OtherNonoperatingIncomeExpense \(-5780000000\)/);
    expect(text).toMatch(/overstates EBIT by the net interest added back \(217000000\)/);
    // The aggregate and the component that was subtracted leave the error band; the untagged ones stay in it.
    expect(text).toMatch(/error band — the filer tags none of InvestmentIncomeInterest, IncomeLossFromEquityMethodInvestments for this period/);
    expect(text).not.toMatch(/none of NonoperatingIncomeExpense/);
  });
  it("control: without the other line the disclosure carries no OtherNonoperatingIncomeExpense caveat", () => {
    const noOther = without(jnj, "OtherNonoperatingIncomeExpense");
    expect(opText(opRow(noOther))).not.toMatch(/net interest added back/);
  });
});
