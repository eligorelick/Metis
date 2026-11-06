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
  // primary-derived EBIT can still score coverage with its unverified scope disclosed.
  row.interestExpense = 1 * M;
  row.operatingIncome = undefined;
  for (const statement of [bundle.statements.incomeQuarterly]) if (statement.ok) {
    for (const q of statement.value.data.rows) { q.operatingIncome = undefined; q.interestExpense = 0.1 * M; }
  }
  return { bundle, facts };
}

describe("primary-derived annual operating-income coverage fallback", () => {
  it("uses the retained fiscal-year derivation for synthetic coverage and discloses unverified scope", () => {
    const { bundle } = fixture();
    const computed = runStageB(bundle), wacc = computed.returns.wacc;
    expect(wacc.costOfDebtMethod).toBe("synthetic");
    expect(wacc.waccPct).not.toBeNull();
    expect(wacc.interestCoverageRatio).toBe(200);
    expect(wacc.notes.join(" ")).toMatch(/FY 2025-12-31.*derived from filed pretax\/nonoperating operands.*unverified consolidated operating scope/);
    expect(wacc.notes.join(" ")).not.toContain("filed operating income for standalone interest coverage");
    expect(wacc.operatingIncomeEvidence).toMatchObject({ status: "unverified-derivation", asOf: "2025-12-31", usedInDiscountRate: true });
    expect(computed.scores.qualification?.aspects.valuation.reasons.some(reason => reason.code === "selected-operating-scope-unverified")).toBe(true);
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
  function succession(mode = "valid") {
    const { bundle, facts } = fixture();
    facts.facts["us-gaap"]!.EarningsPerShareBasic = { units: { "USD/shares": [{ start: "2025-01-01", end: "2025-12-31", val: 1.5,
      filed: "2026-02-01", form: "10-K", accn: "0000000042-26-000001", fy: 2025, fp: "FY" }] } };
    const own = structuredClone(facts); own.cik = 99;
    if (mode === "future-evidence") for (const concept of Object.values(own.facts["us-gaap"]!)) {
      const units = (concept as { units: Record<string, Record<string, unknown>[]> }).units;
      for (const ps of Object.values(units)) for (const p of ps) p.filed = "2027-01-01";
    }
    if (mode === "own-annual") own.facts["us-gaap"]!.Assets = { units: { USD: [{ end: "2025-12-31", val: 2000 * M,
      filed: "2026-02-01", form: "10-K", accn: "0000000099-26-000001", fy: 2025, fp: "FY" }] } };
    if (mode === "discontinuous") (own.facts["us-gaap"]!.EarningsPerShareBasic as { units: { "USD/shares": { val: number }[] } }).units["USD/shares"][0]!.val = 3;
    if (!bundle.edgar.cik.ok || !bundle.edgar.companyFacts.ok) throw new Error("fixture");
    bundle.edgar.cik.value.data.cik = 99; bundle.edgar.cik.value.data.cik10 = "0000000099";
    bundle.edgar.companyFacts.value.data = own;
    bundle.edgar.predecessor = { facts, cik10: mode === "wrong-issuer" ? "0000000077" : mode === "malformed-issuer" ? "4.2e1" : "0000000042", name: "Synthetic predecessor", endpoint: "fixture predecessor",
      fetchedAt: mode === "future" ? "2027-01-01T00:00:00Z" : mode === "missing-acquisition" ? "" : bundle.builtAt,
      via: { accession: "0000000099-26-000001", form: "10-Q", filed: mode === "future-link" ? "2027-01-01" : "2026-05-01", successorFormAccession: "0000000099-26-000000" } };
    return bundle;
  }
  it("completes the matching predecessor FY key only with established successor continuity", () => {
    const out = withIncomeOperatingBasis(succession()).statements.incomeAnnual;
    if (!out.ok) throw new Error("fixture");
    expect(out.value.data.rows[0]?.netIncomeAttributableToNoncontrollingInterest).toBe(-2 * M);
    expect(out.value.data.rows[0]?.netIncomeConsolidated).toBe(148 * M);
    expect(out.value.data.rows[0]?.fieldProvenance?.netIncomeAttributableToNoncontrollingInterest?.filings[0]?.accn).toBe("0000000042-26-000001");
  });
  for (const mode of ["discontinuous", "wrong-issuer", "malformed-issuer", "future", "future-link", "future-evidence", "own-annual", "missing-acquisition"]) {
    it(`does not use ${mode} predecessor evidence for the annual key`, () => {
      const out = withIncomeOperatingBasis(succession(mode)).statements.incomeAnnual;
      if (!out.ok) throw new Error("fixture");
      expect(out.value.data.rows[0]?.netIncomeAttributableToNoncontrollingInterest).toBeUndefined();
    });
  }
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
  it("does not read nonredeemable NCI income as total NCI income", () => {
    // Beside redeemable NCI it is only part of outside owners' earnings (PR #86 review).
    const { bundle, facts } = fixture("NetIncomeLossAttributableToNonredeemableNoncontrollingInterest");
    const built = buildStatementsFromCompanyFacts(facts, { symbol: bundle.symbol, cik: "42", asOf: bundle.builtAt.slice(0, 10), annualPeriods: 1, quarterlyPeriods: 0,
      vendorSplits: { status: "unavailable", source: "fixture", reason: "additive amounts" } });
    expect(built.incomeAnnual.rows[0]?.netIncomeAttributableToNoncontrollingInterest ?? null).toBeNull();
  });
  for (const tag of ["MinorityInterestInNetIncomeLossOfConsolidatedEntities"]) {
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
