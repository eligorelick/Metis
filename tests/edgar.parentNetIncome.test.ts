/**
 * Audit 2026-10-22 B-18. FCX files no NetIncomeLoss in its 10-K/10-Q facts;
 * it tags consolidated ProfitLoss, the noncontrolling interests' share and the
 * amount available to common. The netIncome chain fell to ProfitLoss, so net
 * income, net margin and DuPont ROE carried the NCI share (FY2025 4,152M
 * against 2,204M to the parent; ROE 22.8% against about 12%). The parent figure
 * is now derived by the taxonomy's own calculation, and Stage B reads it as
 * parent income, so it never deducts the NCI share a second time.
 */
import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import { buildSyntheticRouteBundle, runResearchRoutePanel } from "./helpers/researchRoutePanel";
import { M } from "./helpers/currencyBundle";

const options = { symbol: "TEST", cik: "0000000001", asOf: "2026-10-16", annualPeriods: 2, quarterlyPeriods: 4,
  vendorSplits: { status: "retrieved" as const, source: "test", events: [], coverage: [{ from: "2020-01-01", to: "2026-10-16" }] } };

function facts(withNci: boolean, withParent = false): CompanyFacts {
  const concept = (annual: number, quarter: number, instant = false) => ({ units: { USD: [
    { val: annual, ...(instant ? {} : { start: "2025-01-01" }), end: "2025-12-31", filed: "2026-02-01", form: "10-K", fp: "FY", fy: 2025, accn: "0000000001-26-000001" },
    { val: quarter, ...(instant ? {} : { start: "2026-04-01" }), end: "2026-06-30", filed: "2026-08-06", form: "10-Q", fp: "Q2", fy: 2026, accn: "0000000001-26-000053" },
  ] } });
  return { cik: 1, entityName: "Mining issuer", facts: { "us-gaap": {
    Revenues: concept(25_900, 7_000), Assets: concept(56_000, 57_000, true),
    ProfitLoss: concept(4_152, 1_000),
    ...(withNci ? { NetIncomeLossAttributableToNoncontrollingInterest: concept(1_948, 400) } : {}),
    ...(withParent ? { NetIncomeLoss: concept(2_204, 600) } : {}),
    NetIncomeLossAvailableToCommonStockholdersBasic: concept(2_204, 600),
    NetCashProvidedByUsedInOperatingActivities: concept(7_700, 2_000),
    StockholdersEquity: concept(18_000, 18_500, true),
  } } } as unknown as CompanyFacts;
}

describe("net income attributable to the parent when NetIncomeLoss is not filed (B-18)", () => {
  it("derives the parent figure as ProfitLoss less NCI income, keeps consolidated profit in its own field, and discloses the derivation", () => {
    const built = buildStatementsFromCompanyFacts(facts(true), options);
    const fy = built.incomeAnnual.rows.find(row => row.date === "2025-12-31")!;
    const q2 = built.incomeQuarterly.rows.find(row => row.date === "2026-06-30")!;
    expect(fy).toMatchObject({ netIncome: 2_204, netIncomeConsolidated: 4_152, netIncomeAttributableToNoncontrollingInterest: 1_948 });
    expect(q2).toMatchObject({ netIncome: 600, netIncomeConsolidated: 1_000 });
    expect(fy.fieldProvenance?.netIncome?.tags).toEqual(["us-gaap/ProfitLoss", "us-gaap/NetIncomeLossAttributableToNoncontrollingInterest"]);
    const substitution = built.incomeAnnual.substitutions.find(s => s.field === "netIncome");
    expect(substitution?.text).toMatch(/no NetIncomeLoss element is filed for the period; net income attributable to the parent is derived as consolidated profit \(ProfitLoss\) less net income attributable to noncontrolling interests/);
    // The cash-flow statement still starts from consolidated profit.
    expect(built.cashflowAnnual.rows.find(row => row.date === "2025-12-31")?.netIncome).toBe(4_152);
  });

  it("still takes NetIncomeLoss first, with no derivation note", () => {
    const built = buildStatementsFromCompanyFacts(facts(true, true), options);
    const fy = built.incomeAnnual.rows.find(row => row.date === "2025-12-31")!;
    expect(fy.netIncome).toBe(2_204);
    expect(fy.fieldProvenance?.netIncome?.tags).toEqual(["us-gaap/NetIncomeLoss"]);
    expect(built.incomeAnnual.substitutions.some(s => s.field === "netIncome")).toBe(false);
  });

  it("falls to consolidated ProfitLoss, as before, when no NCI income is tagged for the period", () => {
    const built = buildStatementsFromCompanyFacts(facts(false), options);
    const fy = built.incomeAnnual.rows.find(row => row.date === "2025-12-31")!;
    expect(fy.netIncome).toBe(4_152);
    expect(fy.fieldProvenance?.netIncome?.tags).toEqual(["us-gaap/ProfitLoss"]);
  });
});

describe("Stage B reads the derived figure as parent income (B-18)", () => {
  const derivedTags = ["us-gaap/ProfitLoss", "us-gaap/NetIncomeLossAttributableToNoncontrollingInterest"];
  function bundleWith(tagsFor: (index: number) => string[]) {
    const bundle = buildSyntheticRouteBundle("bank");
    for (const member of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (!member.ok) throw new Error("synthetic balances required");
      for (const row of member.value.data.rows) { row.preferredStock = 0; row.minorityInterest = 300 * M; }
    }
    for (const member of [bundle.statements.cashflowAnnual, bundle.statements.cashflowQuarterly]) {
      if (!member.ok) throw new Error("synthetic cash required");
      for (const row of member.value.data.rows) row.preferredDividendsPaid = 0;
    }
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("synthetic income required");
    const rows = bundle.statements.incomeQuarterly.value.data.rows;
    for (const [index, row] of rows.entries()) {
      delete row.epsDiluted;
      delete row.netIncomeAvailableToCommon;
      delete row.netIncomeOwnershipBasis;
      row.netIncomeAttributableToNoncontrollingInterest = 5 * M;
      const end = String(row.date);
      const date = new Date(`${end}T00:00:00Z`);
      row.fieldProvenance = { netIncome: { source: "edgar", unit: "USD", periodEnd: end, observedAt: bundle.builtAt, filings: [],
        periodStart: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 2, 1)).toISOString().slice(0, 10), tags: tagsFor(index) } };
    }
    return bundle;
  }
  const peTtm = (bundle: ReturnType<typeof bundleWith>) =>
    runResearchRoutePanel(bundle).computed.valuation.multiples?.multiples.find(row => row.key === "peTtm")?.current;

  it("does not deduct the NCI share a second time", () => {
    expect(peTtm(bundleWith(() => derivedTags))).toBeCloseTo(10_000 / 180, 10);
  });

  it("treats derived and NetIncomeLoss quarters as one ownership basis, so the TTM is not refused as mixed", () => {
    expect(peTtm(bundleWith(index => index < 2 ? derivedTags : ["us-gaap/NetIncomeLoss"]))).toBeCloseTo(10_000 / 180, 10);
  });

  it("still reads ProfitLoss alone as consolidated and deducts the NCI share", () => {
    expect(peTtm(bundleWith(() => ["us-gaap/ProfitLoss"]))).not.toBeCloseTo(10_000 / 180, 6);
  });
});
