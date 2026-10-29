import { describe, expect, it } from "vitest";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";
import { derivedRoundingAllowance, roundingUnit, vendorAgreesWithDerived } from "@/edgar/vendorAgreement";

/**
 * Audit 2026-10-27 FIN-511-V2 (decision C-9, OD-5): the vendor-enrichment derivation of a fiscal-year-end
 * quarter pairs its operands through the statement builder's `oneBasisPair`, so a vendor quarter is never
 * compared with, or filled from, a figure that nets two presentations or a superseded copy. Seeded from
 * tmp/audit-2026-10-27/probes/FIN-511-V2.probe.ts, with its fs reads and writes dropped. Cases (a), (b) and
 * (d) are synthetic; (c) re-expresses the probe's AEP case as synthetic facts with AEP's filed amounts
 * (companyfacts CIK 4904). Every accession number is synthetic, and the vendor values are assumed, as the
 * probe assumed them: no provider data.
 */
type Filing = { filed: string; form: string; fp: string; fy: number; accn: string };
const F: Record<string, Filing> = {
  q324: { filed: "2024-11-01", form: "10-Q", fp: "Q3", fy: 2024, accn: "0000000009-24-000004" },
  k24: { filed: "2025-02-12", form: "10-K", fp: "FY", fy: 2024, accn: "0000000009-25-000001" },
  q325: { filed: "2025-11-03", form: "10-Q", fp: "Q3", fy: 2025, accn: "0000000009-25-000004" },
  k25: { filed: "2026-02-12", form: "10-K", fp: "FY", fy: 2025, accn: "0000000009-26-000001" },
};
const pt = (f: Filing, start: string, end: string, val: number) => ({ ...f, start, end, val });
const recast = (a: number, b: number, c: number, d: number, e: number, fy24new: number) => [
  pt(F.q324!, "2024-01-01", "2024-09-30", a), pt(F.k24!, "2024-01-01", "2024-12-31", b), pt(F.k24!, "2023-01-01", "2023-12-31", c),
  pt(F.q325!, "2025-01-01", "2025-09-30", d), pt(F.q325!, "2024-01-01", "2024-09-30", a),
  pt(F.k25!, "2025-01-01", "2025-12-31", e), pt(F.k25!, "2024-01-01", "2024-12-31", fy24new),
];
const src = (rows: unknown[]) => ({ ok: true as const, value: { data: { rows, raw: null }, asOf: "2024-12-31", source: "fmp" as const, endpoint: "probe", fetchedAt: "2026-10-27T00:00:00.000Z" } });
const M = 1_000_000;

type Facts = { cik: number; entityName: string; facts: { "us-gaap": Record<string, { label: string; units: Record<string, unknown[]> }> } };
const recastFacts = (tag: string, points: unknown[]): Facts => ({ cik: 9, entityName: "Probe Co", facts: { "us-gaap": { [tag]: { label: tag, units: { USD: points } } } } });
/** A discontinued-operations line for FY2024 that only the re-filing 10-K carries (new there): C-9's label. */
const withDiscontinuedLabel = (facts: Facts): Facts => ({
  ...facts,
  facts: { "us-gaap": { ...facts.facts["us-gaap"], IncomeLossFromDiscontinuedOperationsNetOfTax: { label: "Discontinued", units: { USD: [pt(F.k25!, "2024-01-01", "2024-12-31", 4)] } } } },
});
const vendorQ4 = (fields: Record<string, unknown>) => ({ date: "2024-12-31", period: "Q4", fiscalYear: "2024", reportedCurrency: "USD", ...fields });

/** AEP's filed operating cash flow (CIK 4904): FY2024 re-filed 6,804.3M -> 6,804.0M; the nine months 2024 never re-filed. */
const AEP: Record<string, Filing> = {
  q324: { filed: "2024-11-06", form: "10-Q", fp: "Q3", fy: 2024, accn: "0000000049-24-000003" },
  k24: { filed: "2025-02-13", form: "10-K", fp: "FY", fy: 2024, accn: "0000000049-25-000001" },
  q325: { filed: "2025-10-29", form: "10-Q", fp: "Q3", fy: 2025, accn: "0000000049-25-000003" },
  k25: { filed: "2026-02-12", form: "10-K", fp: "FY", fy: 2025, accn: "0000000049-26-000001" },
};
const aepFacts = (): Facts => ({
  cik: 4904,
  entityName: "AEP-shaped Co",
  facts: { "us-gaap": { NetCashProvidedByUsedInOperatingActivities: { label: "CFO", units: { USD: [
    pt(AEP.q324!, "2024-01-01", "2024-09-30", 5_076.9 * M),
    pt(AEP.k24!, "2024-01-01", "2024-12-31", 6_804.3 * M),
    pt(AEP.q325!, "2024-01-01", "2024-09-30", 5_076.9 * M),
    pt(AEP.k25!, "2025-01-01", "2025-12-31", 7_000 * M),
    pt(AEP.k25!, "2024-01-01", "2024-12-31", 6_804.0 * M),
  ] } } } },
});

/** Short-term investment flows, each derived as FY (10-K, whole millions) less nine months (10-Q, to 0.1M). */
const investmentFacts = (): Facts => ({
  cik: 9, entityName: "Probe Co", facts: { "us-gaap": Object.fromEntries(([
    ["PaymentsToAcquireShortTermInvestments", 1_000 * M, 700.1 * M],
    ["ProceedsFromSaleOfShortTermInvestments", 500 * M, 350.2 * M],
    ["ProceedsFromMaturitiesPrepaymentsAndCallsOfShorttermInvestments", 300 * M, 200.3 * M],
  ] as const).map(([tag, fy, nine]) => [tag, { label: tag, units: { USD: [pt(F.q324!, "2024-01-01", "2024-09-30", nine), pt(F.k24!, "2024-01-01", "2024-12-31", fy)] } }])) },
});

type Row = Record<string, unknown> & { fieldConflicts?: Record<string, unknown>; fieldProvenance?: Record<string, { derivation?: string; filings: { accn: string }[] }> };
type Gap = { field: string; reason: string };
/** The vendor row carries the issuer of the facts it is set against, as the probe's rows did (CIK 9, or AEP's 4904). */
function enrichOut(facts: Facts, vendor: Record<string, unknown>): { row: Row; gaps: Gap[] } {
  const row = { cik: String(facts.cik).padStart(10, "0"), ...vendor };
  const out = enrichFinancialFields(src([]) as never, src([row]) as never, facts as never, "quarter", "2026-10-27T00:00:00.000Z");
  if (!out.cashflow.ok) throw new Error("cash-flow payload refused");
  return { row: out.cashflow.value.data.rows[0] as unknown as Row, gaps: out.gaps };
}
const enrich = (facts: Facts, vendor: Record<string, unknown>): Row => enrichOut(facts, vendor).row;

describe("FIN-511-V2: the vendor-enrichment derivation pairs one presentation (C-9)", () => {
  it("(a) a vendor Q4 CFO on the original pair is kept, not refused against a never-filed mixed figure", () => {
    const row = enrich(recastFacts("NetCashProvidedByUsedInOperatingActivities", recast(300, 400, 380, 330, 450, 360)), vendorQ4({ operatingCashFlow: 100, netCashProvidedByOperatingActivities: 100, capitalExpenditure: -10, freeCashFlow: 90 }));
    expect(row).toMatchObject({ operatingCashFlow: 100, freeCashFlow: 90 });
    expect(row.fieldConflicts?.operatingCashFlow).toBeUndefined();
  });
  it("(b) a vendor-missing finance-lease principal is not filled from a mixed pair (36 - 30) nor from a first-reported copy an unlabelled 10% re-filing superseded (C-9)", () => {
    const out = enrichOut(recastFacts("FinanceLeasePrincipalPayments", recast(30, 40, 38, 33, 45, 36)), vendorQ4({ operatingCashFlow: 100 }));
    expect(out.row.financeLeasePrincipalPayments ?? null).toBeNull(); // HEAD writes 6
    expect(out.gaps.some((g) => /financeLeasePrincipalPayments enriched from SEC/.test(g.reason))).toBe(false);
  });
  it("(d) the same re-filing, labelled by a discontinued-operations line in the re-filing 10-K, fills it from the first-reported pair (40 - 30)", () => {
    const row = enrich(withDiscontinuedLabel(recastFacts("FinanceLeasePrincipalPayments", recast(30, 40, 38, 33, 45, 36))), vendorQ4({ operatingCashFlow: 100 }));
    expect(row.financeLeasePrincipalPayments).toBe(10);
  });
  it("control: a genuine disagreement still withholds, and says the SEC value is derived", () => {
    const out = enrichOut(aepFacts(), vendorQ4({ operatingCashFlow: 1_900 * M, netCashProvidedByOperatingActivities: 1_900 * M }));
    expect(out.row.operatingCashFlow).toBeNull();
    // Controller ruling (2026-10-29): a whole-million re-rounding is no move (FIN-511 I2), so the pair is the as-filed
    // 6,804.0M - 5,076.9M, the quarter the statement builder publishes too; the plan's 1,727.4M predates that rule.
    expect(out.gaps.map((g) => g.reason).join(" ")).toMatch(/derived 1,727\.1M USD .*less the prior year to date/);
  });

  it("(d) the fill's note says the value is derived and names both filings, not an exact filed period", () => {
    const { row, gaps } = enrichOut(withDiscontinuedLabel(recastFacts("FinanceLeasePrincipalPayments", recast(30, 40, 38, 33, 45, 36))), vendorQ4({ operatingCashFlow: 100 }));
    expect(row.fieldProvenance?.financeLeasePrincipalPayments).toMatchObject({ derivation: "ytd-difference", filings: [{ accn: F.k24!.accn }, { accn: F.q324!.accn }] });
    const note = gaps.find((g) => /financeLeasePrincipalPayments enriched from SEC/.test(g.reason))!.reason;
    expect(note).toContain(
      "derived for 2024-10-01 through 2024-12-31 (fiscal year or year to date less the prior year to date, " +
        "from the 10-K of 2025-02-12 (0000000009-25-000001) and the 10-Q of 2024-11-01 (0000000009-24-000004))",
    );
    expect(note).not.toMatch(/exact quarter period/);
  });
  // The FY2024 copy of the 2026 10-K removed: the FY is filed once, so the pair is the one HEAD nets.
  const filedOnce = () => recastFacts("NetCashProvidedByUsedInOperatingActivities",
    recast(300 * M, 400 * M, 380 * M, 330 * M, 450 * M, 360 * M).filter((p) => !(p.accn === F.k25!.accn && p.start === "2024-01-01")));
  it("control: an FY filed once is netted against its nine months as before (400M - 300M), and a vendor 100M agrees", () => {
    const row = enrich(filedOnce(), vendorQ4({ operatingCashFlow: 100 * M, netCashProvidedByOperatingActivities: 100 * M, freeCashFlow: 90 * M }));
    expect(row).toMatchObject({ operatingCashFlow: 100 * M, freeCashFlow: 90 * M });
    expect(row.fieldConflicts?.operatingCashFlow).toBeUndefined();
    const out = enrichOut(filedOnce(), vendorQ4({ operatingCashFlow: 130 * M, netCashProvidedByOperatingActivities: 130 * M }));
    expect(out.row.operatingCashFlow).toBeNull();
    expect(out.row.fieldConflicts?.operatingCashFlow).toMatchObject({ secValue: 100 * M, usable: false });
  });
  it("the conflict reason for a derived quarter names the derivation and both filings", () => {
    const out = enrichOut(filedOnce(), vendorQ4({ operatingCashFlow: 130 * M, netCashProvidedByOperatingActivities: 130 * M }));
    expect(out.gaps.map((g) => g.reason).join(" ")).toContain(
      "derived 100M USD for 2024-10-01 through 2024-12-31 (fiscal year or year to date less the prior year to date, " +
        "from the 10-K of 2025-02-12 (0000000009-25-000001) and the 10-Q of 2024-11-01 (0000000009-24-000004))",
    );
  });
});

/**
 * Controller ruling 2026-10-29 (FIN-511-V2, revising A-11 for derived values): a vendor figure against a derived SEC
 * value agrees within max(A-11's allowance, the sum over the operands of half each operand's rounding unit), the
 * rounding unit being the largest power of ten, at most a million, that divides the operand exactly.
 */
describe("FIN-511-V2 ruling: a derived SEC value is compared within its operands' stated precision", () => {
  it("(c) a precision-only re-filing (AEP shape) raises no conflict against the original-pair vendor CFO", () => {
    const row = enrich(aepFacts(), vendorQ4({ operatingCashFlow: 1_727.4 * M, netCashProvidedByOperatingActivities: 1_727.4 * M }));
    expect(row.operatingCashFlow).toBe(1_727.4 * M);
  });
  it("control: a vendor beyond the operands' rounding (1,728.0M against the derived 1,727.1M, allowance 0.55M) still conflicts", () => {
    const out = enrichOut(aepFacts(), vendorQ4({ operatingCashFlow: 1_728 * M, netCashProvidedByOperatingActivities: 1_728 * M }));
    expect(out.row.operatingCashFlow).toBeNull();
    expect(out.row.fieldConflicts?.operatingCashFlow).toMatchObject({ secValue: 1_727_100_000, usable: false });
  });
  it("control: a directly filed quarter keeps A-11 alone (filed 1,727.1M against vendor 1,727.4M conflicts)", () => {
    const direct = { cik: 4904, entityName: "AEP-shaped Co", facts: { "us-gaap": { NetCashProvidedByUsedInOperatingActivities: { label: "CFO", units: { USD: [
      pt(AEP.k25!, "2024-10-01", "2024-12-31", 1_727_100_000),
    ] } } } } };
    const out = enrichOut(direct, vendorQ4({ operatingCashFlow: 1_727.4 * M, netCashProvidedByOperatingActivities: 1_727.4 * M }));
    expect(out.row.operatingCashFlow).toBeNull();
    expect(out.row.fieldConflicts?.operatingCashFlow).toMatchObject({ secValue: 1_727_100_000, usable: false });
  });
  it("the rounding unit: the largest power of ten up to a million dividing the value exactly", () => {
    expect(roundingUnit(6_804_000_000)).toBe(1_000_000);
    expect(roundingUnit(5_076_900_000)).toBe(100_000);
    expect(roundingUnit(1_234_567)).toBe(1);
    expect(roundingUnit(-5_000_000)).toBe(1_000_000);
    expect(roundingUnit(0)).toBe(1); // a zero shows no precision: the smallest unit, so it never widens the allowance
    expect(roundingUnit(1.5)).toBe(0); // not a whole number: no rounding unit, no allowance
    expect(derivedRoundingAllowance([6_804_000_000, 5_076_900_000])).toBe(550_000);
    expect(vendorAgreesWithDerived(1_727_400_000, 1_727_100_000, [6_804_000_000, 5_076_900_000])).toBe(true);
    expect(vendorAgreesWithDerived(1_727_700_000, 1_727_100_000, [6_804_000_000, 5_076_900_000])).toBe(false);
    // Never narrower than A-11: 0.01% of 100,000M is 10M, above the operands' 1M.
    expect(vendorAgreesWithDerived(100_010_000_000, 100_000_000_000, [400_000_000_000, 300_000_000_000])).toBe(true);
  });

  it("a derived sum is compared within every operand's rounding (sales 149.8M + maturities 99.7M, four operands, 1.1M)", () => {
    const row = enrich(investmentFacts(), vendorQ4({ purchasesOfInvestments: -299.9 * M, salesMaturitiesOfInvestments: 250.5 * M }));
    expect(row).toMatchObject({ purchasesOfInvestments: -299.9 * M, salesMaturitiesOfInvestments: 250.5 * M });
    expect(row.fieldConflicts?.salesMaturitiesOfInvestments).toBeUndefined();
  });
  it("control: beyond the four operands' 1.1M the investment buckets are still refused", () => {
    const row = enrich(investmentFacts(), vendorQ4({ purchasesOfInvestments: -299.9 * M, salesMaturitiesOfInvestments: 250.7 * M }));
    expect(row).toMatchObject({ purchasesOfInvestments: null, salesMaturitiesOfInvestments: null });
  });
});

/** Controller ruling 2026-10-29 (FIN-511-V2): the cash-flow and investment conflict reasons, like the CFO reason, call a derived SEC value derived. */
describe("FIN-511-V2 ruling: the cash-flow and investment conflict reasons say a derived value is derived", () => {
  const FROM = "(fiscal year or year to date less the prior year to date, from the 10-K of 2025-02-12 (0000000009-25-000001) and the 10-Q of 2024-11-01 (0000000009-24-000004))";
  const reasons = (gaps: Gap[]) => gaps.map((g) => g.reason).join(" | ");
  const buybacks = () => recastFacts("PaymentsForRepurchaseOfCommonStock", [pt(F.q324!, "2024-01-01", "2024-09-30", 300.1 * M), pt(F.k24!, "2024-01-01", "2024-12-31", 400 * M)]);
  it("admitCashFields: a derived buyback conflict reads derived, with the period and both filings", () => {
    const out = enrichOut(buybacks(), vendorQ4({ commonStockRepurchased: -120 * M }));
    expect(out.row.commonStockRepurchased).toBeNull();
    expect(reasons(out.gaps)).toContain(
      `vendor/SEC commonStockRepurchased conflict: derived -99.9M USD for 2024-10-01 through 2024-12-31 ${FROM}; raw vendor -120M; field unavailable until reconciled`,
    );
    expect(reasons(out.gaps)).not.toMatch(/commonStockRepurchased conflict: exact/);
  });
  it("admitCashFields: a derived buyback within its operands' rounding (0.55M) agrees", () => {
    const row = enrich(buybacks(), vendorQ4({ commonStockRepurchased: -100.3 * M }));
    expect(row.commonStockRepurchased).toBe(-100.3 * M);
    expect(row.fieldConflicts?.commonStockRepurchased).toBeUndefined();
  });
  it("admitCashFields: a cash movement derived from the year less nine months reads derived, naming the movement's two filings", () => {
    const movementTag = "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect";
    const cash = () => [{ ...F.q324!, end: "2024-09-30", val: 130 * M }, { ...F.k24!, end: "2024-12-31", val: 150 * M }];
    const facts: Facts = { cik: 9, entityName: "Probe Co", facts: { "us-gaap": {
      [movementTag]: { label: "movement", units: { USD: [pt(F.q324!, "2024-01-01", "2024-09-30", 30 * M), pt(F.k24!, "2024-01-01", "2024-12-31", 50 * M)] } },
      CashAndCashEquivalentsAtCarryingValue: { label: "cash", units: { USD: cash() } },
      CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: { label: "total cash", units: { USD: cash() } },
    } } };
    const out = enrichOut(facts, vendorQ4({ netChangeInCash: 25 * M }));
    expect(out.row.netChangeInCash).toBeNull();
    expect(out.row.fieldConflicts?.netChangeInCash).toMatchObject({ secValue: 20 * M, usable: false });
    expect(reasons(out.gaps)).toContain(
      `vendor/SEC netChangeInCash conflict: derived 20M USD for 2024-10-01 through 2024-12-31 ${FROM}; raw vendor 25M; field unavailable until reconciled`,
    );
  });
  it("admitInvestmentFlows: a derived classification conflict reads derived, with the period and both filings", () => {
    const out = enrichOut(investmentFacts(), vendorQ4({ purchasesOfInvestments: -299.9 * M, salesMaturitiesOfInvestments: 250.7 * M }));
    expect(reasons(out.gaps)).toContain(
      `financial-investment classification unreconciled at 2024-12-31: derived -299.9M short-term purchases and 249.5M sales/maturities USD ` +
        `for 2024-10-01 through 2024-12-31 ${FROM} differ from generic vendor buckets.`,
    );
    expect(reasons(out.gaps)).not.toMatch(/same-period filed short-term purchases/);
  });
});
