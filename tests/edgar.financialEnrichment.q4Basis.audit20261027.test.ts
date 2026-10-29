import { describe, expect, it } from "vitest";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";

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
