import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import { runStageB } from "@/pipeline/compute";
import type { CompanyFacts } from "@/edgar/xbrl";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const M = 1e6;
function fixture(nciTag = "NetIncomeLossAttributableToNoncontrollingInterest") {
  const bundle = completeCurrencyBundle({ debt: 300 });
  const annual = bundle.statements.incomeAnnual;
  if (!annual.ok) throw new Error("fixture");
  const row = annual.value.data.rows[0]!;
  row.cik = "0000000042";
  row.filingDate = "2026-02-01";
  const tags = { Revenues: 1000, IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: 190,
    NonoperatingIncomeExpense: -10, InterestExpenseNonOperating: 1,
    NetIncomeLoss: 150, ProfitLoss: 148, [nciTag]: -2 };
  const facts: CompanyFacts = { cik: 42, entityName: "Synthetic", facts: { "us-gaap": Object.fromEntries(Object.entries(tags).map(([tag, value]) => [tag,
    { units: { USD: [{ val: value * M, start: "2025-01-01", end: "2025-12-31", filed: "2026-02-01", accn: "0000000042-26-000001", form: "10-K", fy: 2025, fp: "FY" }] } }])) } };
  bundle.edgar.cik = { ok: true, value: { source: "edgar", endpoint: "fixture", fetchedAt: bundle.builtAt, asOf: "2026-02-01",
    data: { cik: 42, cik10: "0000000042", ticker: bundle.symbol, title: "Synthetic" } } };
  bundle.edgar.companyFacts = { ok: true, value: { source: "edgar", endpoint: "fixture", fetchedAt: bundle.builtAt, asOf: "2026-02-01", data: facts } };
  const revenue = { source: "edgar" as const, unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31", observedAt: bundle.builtAt,
    filings: [{ accn: "0000000042-26-000001", filed: "2026-02-01", form: "10-K" }], tags: ["us-gaap/Revenues"] };
  row.fieldProvenance = { revenue };
  // No same-source operating-income numerator for a margin; its standalone
  // filed EBIT can still score interest coverage without inventing a margin.
  row.interestExpense = 1 * M;
  row.operatingIncome = undefined;
  for (const statement of [bundle.statements.incomeQuarterly]) if (statement.ok) {
    for (const q of statement.value.data.rows) { q.operatingIncome = undefined; q.interestExpense = 0.1 * M; }
  }
  return { bundle, facts };
}

describe("filed annual operating-income coverage fallback", () => {
  it("uses the latest filed fiscal-year EBIT for synthetic coverage and discloses it", () => {
    const { bundle } = fixture();
    const wacc = runStageB(bundle).returns.wacc;
    expect(wacc.costOfDebtMethod).toBe("synthetic");
    expect(wacc.waccPct).not.toBeNull();
    expect(wacc.interestCoverageRatio).toBe(200);
    expect(wacc.notes.join(" ")).toMatch(/FY 2025-12-31.*filed.*operating income/);
  });
  it("does not turn a refused EBIT or another issuer's figure into coverage", () => {
    for (const otherIssuer of [false, true]) {
      const { bundle } = fixture();
      const annual = bundle.statements.incomeAnnual;
      if (!annual.ok) throw new Error("fixture");
      if (otherIssuer) annual.value.data.rows[0]!.cik = "99";
      else annual.value.data.rows[0]!.fieldConflicts = { operatingIncome: { usable: false, vendorValue: 200 * M, secValue: null, reason: "presentation unresolved" } };
      expect(runStageB(bundle).returns.wacc.waccPct).toBeNull();
    }
  });
});

describe("NCI income synonyms in the existing ordered resolution", () => {
  it("recovers the annual key without rebuilding an already-valued issuer's quarterly ownership history", () => {
    const { bundle, facts } = fixture();
    if (!bundle.statements.incomeAnnual.ok || !bundle.statements.incomeQuarterly.ok) throw new Error("fixture");
    Object.assign(bundle.statements.incomeAnnual.value.data.rows[0]!, { netIncomeAttributableToNoncontrollingInterest: -2 * M, netIncomeConsolidated: 148 * M });
    const q = bundle.statements.incomeQuarterly.value.data.rows[0]!;
    const point = { start: "2026-01-01", end: q.date!, filed: "2026-05-01", accn: "0000000042-26-000002", form: "10-Q", fy: 2026, fp: "Q1" };
    for (const [tag, val] of [["Revenues", 300], ["ProfitLoss", 44], ["NetIncomeLossAttributableToNoncontrollingInterest", -1]] as const) {
      const concept = facts.facts["us-gaap"]![tag] as { units: { USD: unknown[] } };
      concept.units.USD.push({ ...point, val: val * M });
    }
    const out = withIncomeOperatingBasis(bundle).statements.incomeQuarterly;
    if (!out.ok) throw new Error("fixture");
    expect(out.value.data.rows[0]?.netIncomeAttributableToNoncontrollingInterest).toBeUndefined();
  });
  for (const tag of ["MinorityInterestInNetIncomeLossOfConsolidatedEntities", "NetIncomeLossAttributableToNonredeemableNoncontrollingInterest"]) {
    it(`reads and admits ${tag} on the same fiscal-year row`, () => {
      const { bundle, facts } = fixture(tag);
      const built = buildStatementsFromCompanyFacts(facts, { symbol: bundle.symbol, cik: "42", asOf: bundle.builtAt.slice(0, 10), annualPeriods: 1, quarterlyPeriods: 0,
        vendorSplits: { status: "unavailable", source: "fixture", reason: "additive amounts" } });
      expect(built.incomeAnnual.rows[0]?.netIncomeAttributableToNoncontrollingInterest).toBe(-2 * M);
      const out = withIncomeOperatingBasis(bundle).statements.incomeAnnual;
      if (!out.ok) throw new Error("fixture");
      expect(out.value.data.rows[0]?.netIncomeAttributableToNoncontrollingInterest).toBe(-2 * M);
      expect(out.value.data.rows[0]?.fieldProvenance?.netIncomeAttributableToNoncontrollingInterest?.tags).toContain(`us-gaap/${tag}`);
      expect(out.value.data.rows[0]?.netIncomeConsolidated).toBe(148 * M);
    });
  }
});
