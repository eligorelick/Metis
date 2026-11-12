/**
 * P11 (D-218) step 1: every writer whose refusal sentence a reader still
 * matches by wording also writes a typed `cause`, and the sentence is unchanged.
 *
 * `READER_WORDING` restates, per code, the wording the reading sites in
 * tests/refusalWording.ratchet.test.ts match today. On every conflict these
 * shapes produce, the code and that wording must agree both ways: a later step
 * can then swap a reader from the wording to the code without a change in
 * outcome. The shapes are synthetic or copied from saved SEC facts (CRWV); each
 * names the writer it reaches.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { admitBalanceCash, admitDebtFields } from "@/edgar/financialEnrichment";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts, FactPoint } from "@/edgar/xbrl";
import { guardVendorShareFields } from "@/pipeline/keyless";
import { captureRunInputSnapshot, canonicalSnapshotJson } from "@/pipeline/runInputSnapshot";
import type { FmpBalanceSheetRow, FmpIncomeStatementRow, FmpStatementRow, StatementFieldConflict } from "@/providers/fmp";
import { DUAL_WRITTEN_CONFLICT_CAUSES, STATEMENT_CONFLICT_CAUSES, type StatementConflictCause } from "@/types/refusalCause";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { companyFacts, M, OBSERVED, Q2 } from "./helpers/amzn51LeaseShape";
import frozen from "./fixtures/crwv-debt-facts.json";

const LEASE_LINE = "incomplete debt carrying value: the vendor lease line ";
const SAME_PERIOD = "incomplete debt carrying value: same-period ";
const COMBINED = `${SAME_PERIOD}DebtLongtermAndShorttermCombinedAmount `;
const READER_WORDING: Record<string, (reason: string) => boolean> = {
  "vendor-sec-value-conflict": (r) => /^vendor\/SEC \S+ conflict: /.test(r),
  "vendor-share-value-conflict": (r) => r.startsWith("the vendor's ") && r.includes("; field unavailable until reconciled"),
  "debt-maturity-scope": (r) => /^(?:incomplete debt carrying value: )?debt maturity scope unresolved:/.test(r),
  "debt-component-maturity-scope": (r) => r.startsWith("incomplete debt carrying value: shortTermDebt is unavailable (debt maturity scope unresolved:"),
  "debt-noncurrent-allocation": (r) => r.startsWith("noncurrent carrying debt allocation unavailable:"),
  "debt-components-incomplete": (r) => r.startsWith("incomplete debt carrying value: current/noncurrent financing components do not establish the total;"),
  "debt-aggregate-exceeds-components": (r) => r.startsWith(SAME_PERIOD) && !r.startsWith(COMBINED),
  "debt-combined-aggregate-exceeds-components": (r) => r.startsWith(COMBINED),
  "debt-vendor-short-term-zero": (r) => r.startsWith("incomplete debt carrying value: the vendor short-term debt is 0 "),
  "debt-lease-line-refused": (r) => r.startsWith(LEASE_LINE) && !r.includes("no total operating-lease liability"),
  "debt-lease-line-no-operating-total": (r) => r.startsWith(LEASE_LINE) && r.includes("no total operating-lease liability"),
  "debt-total-minor-difference": (r) => r.startsWith("vendor total ") && r.includes("minor difference retained"),
};

const seen = new Set<StatementConflictCause>();
type Conflicted = { fieldConflicts?: Record<string, StatementFieldConflict> };
/** Code ⇔ wording on every conflict of every row. */
function expectCodesMatchWording(rows: readonly Conflicted[]): void {
  for (const row of rows) {
    for (const [field, conflict] of Object.entries(row.fieldConflicts ?? {})) {
      if (conflict.cause !== undefined) seen.add(conflict.cause);
      for (const [code, worded] of Object.entries(READER_WORDING)) {
        expect({ field, reason: conflict.reason, coded: conflict.cause === code }).toEqual({ field, reason: conflict.reason, coded: worded(conflict.reason) });
      }
    }
  }
}
const conflict = (row: Conflicted, field: string) => row.fieldConflicts?.[field];

const vendor = (over: Partial<FmpBalanceSheetRow> = {}): FmpBalanceSheetRow => ({ date: Q2, reportedCurrency: "USD", longTermDebt: 100 * M,
  shortTermDebt: 0, capitalLeaseObligations: 18 * M, totalDebt: 118 * M, cashAndCashEquivalents: 10 * M, ...over });
const admit = (tags: Record<string, number>, row: FmpBalanceSheetRow) => {
  const out = admitDebtFields(row, companyFacts({ [Q2]: tags }), "USD", OBSERVED).row;
  expectCodesMatchWording([out]);
  return out;
};
const MATURITY_TAG = "LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths";
const REMAINDER_TAG = "LongTermDebtMaturitiesRepaymentsOfPrincipalRemainderOfFiscalYear";
const edgar = (tag: string) => ({ source: "edgar" as const, unit: "USD", periodStart: null, periodEnd: Q2, observedAt: OBSERVED, tags: [`us-gaap/${tag}`], filings: [] });

describe("admitDebtFields writes each debt refusal's code beside its unchanged sentence", () => {
  it("lease line: the filing establishes no total operating-lease liability", () => {
    const out = admit({ LongTermDebtNoncurrent: 100, OperatingLeaseLiabilityNoncurrent: 18 }, vendor());
    expect(conflict(out, "totalDebt")).toMatchObject({ usable: false, cause: "debt-lease-line-no-operating-total", reason:
      "incomplete debt carrying value: the vendor lease line 18M USD is the 10-Q 0000000042-26-000026 filing's noncurrent lease liabilities " +
      "(OperatingLeaseLiabilityNoncurrent 18M; no finance lease is filed) at 2026-06-30, but the filing establishes no total operating-lease liability " +
      "(neither OperatingLeaseLiability nor its current and noncurrent portions); the row is not completed from that filing, so total debt and net debt are withheld" });
    expect(conflict(out, "netDebt")).toMatchObject({ cause: "debt-lease-line-no-operating-total", reason: conflict(out, "totalDebt")!.reason });
  });

  it("lease line: any other refusal of the completion", () => {
    const out = admit({ LongTermDebtNoncurrent: 100, LongTermDebtCurrent: 4, OperatingLeaseLiability: 20, OperatingLeaseLiabilityCurrent: 2, OperatingLeaseLiabilityNoncurrent: 18 },
      vendor({ operatingLeaseLiability: 25 * M }));
    expect(conflict(out, "totalDebt")).toMatchObject({ cause: "debt-lease-line-refused" });
    expect(conflict(out, "totalDebt")!.reason).toMatch(/^incomplete debt carrying value: the vendor lease line 18M USD .*, but the row's operatingLeaseLiability 25M does not reconcile with the filed 20M; the row is not completed from that filing, so total debt and net debt are withheld$/);
  });

  it("a vendor short-term debt of 0 beside filed current debt", () => {
    const out = admit({ LongTermDebtNoncurrent: 100, LongTermDebtCurrent: 4 }, vendor({ longTermDebt: 90 * M, capitalLeaseObligations: 0, totalDebt: 90 * M }));
    expect(conflict(out, "totalDebt")).toMatchObject({ cause: "debt-vendor-short-term-zero", reason:
      "incomplete debt carrying value: the vendor short-term debt is 0 but the same-period filing tags current debt (LongTermDebtCurrent 4M); total debt and net debt are withheld rather than published without it" });
  });

  it("a principal aggregate above components that do not establish the total", () => {
    const out = admit({ DebtInstrumentCarryingAmount: 300 }, vendor({ shortTermDebt: undefined, capitalLeaseObligations: 0, totalDebt: 100 * M }));
    expect(conflict(out, "totalDebt")).toMatchObject({ cause: "debt-components-incomplete", reason:
      "incomplete debt carrying value: current/noncurrent financing components do not establish the total; same-period DebtInstrumentCarryingAmount 300000000 " +
      "exceeds the resolved financing components 100000000. The aggregate may be gross principal and is not substituted for carrying debt; total debt and net debt are withheld until reconciled." });
  });

  it.each([["LongTermDebt", "debt-aggregate-exceeds-components"], ["DebtLongtermAndShorttermCombinedAmount", "debt-combined-aggregate-exceeds-components"]] as const)(
    "a tagged %s total above the composed components", (tag, code) => {
      const out = admit({ [tag]: 300 }, vendor({ shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: 104 * M }));
      expect(conflict(out, "totalDebt")).toMatchObject({ cause: code, reason:
        `incomplete debt carrying value: same-period ${tag} 300000000 exceeds the composed current and noncurrent financing debt and finance leases 104000000; ` +
        "a debt component no chain read is missing, so total debt and net debt are withheld rather than published as a partial sum" });
    });

  it("a fiscal maturity bucket: the bucket, the split it leaves, and the total", () => {
    const split = admit({ LongTermDebt: 104, [MATURITY_TAG]: 4, [REMAINDER_TAG]: 2 }, vendor({ shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: 104 * M,
      fieldProvenance: { shortTermDebt: edgar(MATURITY_TAG), longTermDebt: edgar("LongTermDebt") } }));
    expect(conflict(split, "shortTermDebt")).toMatchObject({ cause: "debt-maturity-scope", reason:
      `debt maturity scope unresolved: ${MATURITY_TAG} 4000000 is accompanied by remainder-of-fiscal-year principal 2000000; the first fiscal maturity bucket is not established as current balance-sheet carrying debt.` });
    expect(conflict(split, "longTermDebt")).toMatchObject({ cause: "debt-noncurrent-allocation", reason:
      "noncurrent carrying debt allocation unavailable: LongTermDebt includes current maturities, but the fiscal maturity bucket was rejected as current carrying debt" });
    const total = admit({ LongTermDebtNoncurrent: 100, [MATURITY_TAG]: 4, [REMAINDER_TAG]: 2 }, vendor({ shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: 104 * M,
      fieldProvenance: { shortTermDebt: edgar(MATURITY_TAG), longTermDebt: edgar("LongTermDebtNoncurrent") } }));
    expect(conflict(total, "totalDebt")).toMatchObject({ cause: "debt-maturity-scope", reason: `incomplete debt carrying value: ${conflict(total, "shortTermDebt")!.reason}` });
  });

  it("a total withheld because its maturity-scoped short-term component was refused takes the component's code, not its sentence", () => {
    const shortRefusal = { usable: false, vendorValue: 4 * M, secValue: null, reason: "debt maturity scope unresolved: x" } as const;
    const coded = admit({ LongTermDebtNoncurrent: 100 }, vendor({ shortTermDebt: undefined, capitalLeaseObligations: 0, totalDebt: undefined,
      fieldConflicts: { shortTermDebt: { ...shortRefusal, cause: "debt-maturity-scope" } } }));
    expect(conflict(coded, "totalDebt")).toMatchObject({ cause: "debt-component-maturity-scope",
      reason: "incomplete debt carrying value: shortTermDebt is unavailable (debt maturity scope unresolved: x)" });
    // A legacy component with the same sentence but no code stays unknown: the total is not coded from its wording.
    const legacy = admitDebtFields(vendor({ shortTermDebt: undefined, capitalLeaseObligations: 0, totalDebt: undefined,
      fieldConflicts: { shortTermDebt: shortRefusal } }), companyFacts({ [Q2]: { LongTermDebtNoncurrent: 100 } }), "USD", OBSERVED).row;
    expect(conflict(legacy, "totalDebt")).toMatchObject({ reason: conflict(coded, "totalDebt")!.reason });
    expect(conflict(legacy, "totalDebt")?.cause).toBeUndefined();
  });

  it.each([[0, "a filed-total completion"], [23, "the older noncurrent-only lease completion"]])(
    "a minor vendor-total difference retained by %s", (lease) => {
      const tags = { LongTermDebtNoncurrent: 100, LongTermDebtCurrent: 4, OperatingLeaseLiabilityCurrent: 2, OperatingLeaseLiabilityNoncurrent: 18,
        FinanceLeaseLiabilityCurrent: 1, FinanceLeaseLiabilityNoncurrent: 5 };
      const out = admit(tags, vendor({ shortTermDebt: 4 * M, capitalLeaseObligations: lease * M, totalDebt: (lease ? 126.365 : 103.48) * M }));
      expect(conflict(out, "totalDebt")).toMatchObject({ usable: true, resolution: "filed-family", cause: "debt-total-minor-difference" });
      expect(conflict(out, "totalDebt")!.reason).toBe(lease
        ? "vendor total 126.365M versus component sum 127M (0.500000% difference; 0.5% minor-difference limit); minor difference retained as a qualification, not filed equality; reconciled components used with no balancing plug; completed debt 130M USD"
        : "vendor total 103.48M versus component sum 104M (0.500000% difference; 0.5% minor-difference limit); minor difference retained as a qualification, not filed equality; reconciled components used with no balancing plug; completed debt 130M USD");
    });
});

describe("the SEC statement builder writes each debt withholding's code beside its unchanged sentence", () => {
  const AT = "2026-06-30";
  const MATURITIES = [MATURITY_TAG, REMAINDER_TAG];
  const build = (add: Record<string, number> = {}, remove: string[] = []) => {
    const facts = structuredClone(frozen.facts) as CompanyFacts;
    const gaap = facts.facts["us-gaap"]!;
    const filed = (gaap.Assets as { units: { USD: FactPoint[] } }).units.USD.find((p) => p.end === AT)!;
    for (const tag of remove) {
      const concept = gaap[tag] as { units: { USD: FactPoint[] } } | undefined;
      if (concept) concept.units.USD = concept.units.USD.filter((p) => p.end !== AT);
    }
    for (const [tag, val] of Object.entries(add)) ((gaap[tag] ??= { units: { USD: [] } }) as { units: { USD: FactPoint[] } }).units.USD.push({ ...filed, val });
    const out = buildStatementsFromCompanyFacts(facts, {
      symbol: "CRWV", cik: "0001769628", asOf: frozen.asOf, factsObservedAt: "2026-10-16T09:33:42.064Z", annualPeriods: 2, quarterlyPeriods: 4,
      vendorSplits: { status: "retrieved", source: "test:vendor", events: [], coverage: [{ from: "2020-01-01", to: frozen.asOf }] },
    });
    expectCodesMatchWording([...out.balanceQuarterly.rows, ...out.balanceAnnual.rows] as Conflicted[]);
    return out.balanceQuarterly.rows.find((row) => row.date === AT)! as Conflicted;
  };

  it("CRWV's saved fiscal maturity bucket, and the total it leaves incomplete", () => {
    const row = build();
    expect(conflict(row, "shortTermDebt")).toMatchObject({ cause: "debt-maturity-scope", reason:
      `debt maturity scope unresolved: ${MATURITY_TAG} 6184000000 is accompanied by remainder-of-fiscal-year principal 4413000000; the first fiscal maturity bucket is not established as current balance-sheet carrying debt.` });
    for (const field of ["totalDebt", "netDebt"]) {
      expect(conflict(row, field)).toMatchObject({ cause: "debt-maturity-scope", reason: `incomplete debt carrying value: ${conflict(row, "shortTermDebt")!.reason}` });
    }
  });

  it("the LongTermDebt split the refused bucket leaves", () => {
    expect(conflict(build({ LongTermDebt: 30e9 }), "longTermDebt")).toMatchObject({ cause: "debt-noncurrent-allocation", reason:
      "noncurrent carrying debt allocation unavailable: LongTermDebt includes current maturities, but the fiscal maturity bucket was rejected as current carrying debt" });
  });

  it("the inclusive debt-and-lease total beside a current line with no separating fact", () => {
    const row = build({ DebtCurrent: 1e9, LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities: 30e9 }, [...MATURITIES, "DebtInstrumentCarryingAmount"]);
    expect(conflict(row, "longTermDebt")).toMatchObject({ cause: "debt-noncurrent-allocation", reason:
      "noncurrent carrying debt allocation unavailable: LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities includes current maturities, which DebtCurrent also carries, and no current-maturities fact separates them" });
  });

  it("components that do not establish the total, and a tagged total above them", () => {
    expect(conflict(build({ LongTermDebtNoncurrent: 10e9 }, MATURITIES), "totalDebt")).toMatchObject({ cause: "debt-components-incomplete" });
    expect(conflict(build({ LongTermDebtCurrent: 1e9, LongTermDebtNoncurrent: 10e9, DebtLongtermAndShorttermCombinedAmount: 30e9 },
      [...MATURITIES, "DebtInstrumentCarryingAmount"]), "totalDebt")).toMatchObject({ cause: "debt-combined-aggregate-exceeds-components" });
    expect(conflict(build({ LongTermDebtCurrent: 1e9, LongTermDebtNoncurrent: 10e9, LongTermDebtAndCapitalLeaseObligations: 30e9 },
      [...MATURITIES, "DebtInstrumentCarryingAmount"]), "totalDebt")).toMatchObject({ cause: "debt-aggregate-exceeds-components",
      reason: expect.stringMatching(/^incomplete debt carrying value: same-period LongTermDebtAndCapitalLeaseObligations 30000000000 exceeds the composed current and noncurrent financing debt/) });
  });
});

describe("vendor/SEC value conflicts carry their code on the field and its dependents", () => {
  it("a vendor cash balance that disagrees with the filed one", () => {
    const point = { end: "2025-12-31", filed: "2026-02-01", form: "10-K", accn: "0000000001-26-000001", val: 500 * M, fy: 2025, fp: "FY" };
    const facts: CompanyFacts = { cik: 1, entityName: "Synthetic", facts: { "us-gaap": { CashAndCashEquivalentsAtCarryingValue: { units: { USD: [point] } } } } };
    const row: FmpStatementRow = { cik: "1", date: point.end, filingDate: point.filed, reportedCurrency: "USD", cashAndCashEquivalents: 400 * M,
      cashAndShortTermInvestments: 450 * M, netDebt: -400 * M };
    const out = admitBalanceCash(row, facts, "annual", "2026-06-01T00:00:00Z").row;
    expectCodesMatchWording([out]);
    expect(conflict(out, "cashAndCashEquivalents")).toMatchObject({ usable: false, cause: "vendor-sec-value-conflict", reason:
      "vendor/SEC cashAndCashEquivalents conflict: exact instant through 2025-12-31 USD; vendor 400M, filed 500M; field unavailable until reconciled" });
    for (const dependent of ["cashAndShortTermInvestments", "netDebt"]) {
      expect(conflict(out, dependent)).toMatchObject({ cause: "vendor-sec-value-conflict", reason: conflict(out, "cashAndCashEquivalents")!.reason });
    }
  });
});

describe("guardVendorShareFields codes only its disagreement sentence", () => {
  const AS_OF = "2026-11-01";
  const CIK = "0001579878";
  const tags = { eps: "EarningsPerShareBasic", epsDiluted: "EarningsPerShareDiluted", weightedAverageShsOut: "WeightedAverageNumberOfSharesOutstandingBasic",
    weightedAverageShsOutDil: "WeightedAverageNumberOfDilutedSharesOutstanding", revenue: "Revenues", netIncome: "NetIncomeLoss" } as const;
  const filedRow: FmpIncomeStatementRow = { date: "2025-03-31", period: "Q1", fiscalYear: "2025", cik: CIK, symbol: "FIG", reportedCurrency: "USD", revenue: 228_199_000,
    netIncome: -200e6, eps: -2, epsDiluted: -2, weightedAverageShsOut: 100e6, weightedAverageShsOutDil: 100e6 };
  const facts = (): CompanyFacts => {
    const concepts: Record<string, { units: Record<string, FactPoint[]> }> = {};
    for (const [field, tag] of Object.entries(tags)) {
      const value = filedRow[field];
      if (typeof value !== "number") continue;
      const unit = field.startsWith("eps") ? "USD/shares" : field.startsWith("weighted") ? "shares" : "USD";
      ((concepts[tag] ??= { units: {} }).units[unit] ??= []).push({ start: "2025-01-01", end: "2025-03-31", val: value, filed: "2026-05-14", accn: "0001628280-26-250331", form: "10-Q", fy: 2025, fp: "Q1" });
    }
    concepts.Assets = { units: { USD: [{ end: "2025-03-31", val: 2e9, filed: "2026-05-14", accn: "0001628280-26-250331", form: "10-Q", fy: 2025, fp: "Q1" }] } };
    return { cik: 1579878, entityName: "Figma, Inc.", facts: { "us-gaap": concepts, dei: {} } };
  };

  it("a vendor EPS that differs from the filer's exact-interval EPS", () => {
    const companyFacts = facts();
    const primary = buildStatementsFromCompanyFacts(companyFacts, { symbol: "FIG", cik: CIK, asOf: AS_OF, factsObservedAt: `${AS_OF}T22:38:31.000Z`, annualPeriods: 10, quarterlyPeriods: 24,
      vendorSplits: { status: "retrieved", source: "fixture:split-history", events: [], coverage: [{ from: "2020-01-01", to: AS_OF }] } });
    const out = guardVendorShareFields([{ ...filedRow, epsDiluted: -1.8, weightedAverageShsOutDil: 111e6 }], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter" });
    const row = out.rows[0] as Conflicted;
    expectCodesMatchWording([row]);
    expect(conflict(row, "epsDiluted")).toMatchObject({ usable: false, cause: "vendor-share-value-conflict", reason:
      `the vendor's epsDiluted for 2025-03-31 (-1.8) differs from the filer's (-2) on the ${AS_OF} basis; exact 2025-01-01 through 2025-03-31 USD/shares; field unavailable until reconciled` });
  });
});

describe("the code list", () => {
  it("is one list, and every dual-written code is reached above", () => {
    expect(new Set(STATEMENT_CONFLICT_CAUSES).size).toBe(STATEMENT_CONFLICT_CAUSES.length);
    expect(Object.keys(READER_WORDING).sort()).toEqual([...DUAL_WRITTEN_CONFLICT_CAUSES].sort());
    expect([...seen].filter((code) => DUAL_WRITTEN_CONFLICT_CAUSES.has(code)).sort()).toEqual([...DUAL_WRITTEN_CONFLICT_CAUSES].sort());
  });

  it("keeps step-1 codes out of a run input snapshot and keeps the codes readers already use", () => {
    const bundle = completeCurrencyBundle({});
    if (!bundle.statements.balanceAnnual.ok) throw Error("fixture");
    const rows = bundle.statements.balanceAnnual.value.data.rows as FmpStatementRow[];
    const plain = structuredClone(bundle);
    // D-220: debt-maturity-scope is now read, so a code still read by nothing stands in for the step-1 codes.
    // D-221: debt-total-minor-difference is now read too; vendor-sec-value-conflict is still read by nothing.
    rows[0]!.fieldConflicts = { totalDebt: { usable: false, vendorValue: 1, secValue: null, reason: "kept sentence", cause: "vendor-sec-value-conflict" },
      revenue: { usable: false, vendorValue: 1, secValue: null, reason: "kept sentence", cause: "revenue-scope" } };
    (plain.statements.balanceAnnual.ok ? plain.statements.balanceAnnual.value.data.rows[0] as FmpStatementRow : null)!.fieldConflicts = {
      totalDebt: { usable: false, vendorValue: 1, secValue: null, reason: "kept sentence" },
      revenue: { usable: false, vendorValue: 1, secValue: null, reason: "kept sentence", cause: "revenue-scope" } };
    const snapshot = captureRunInputSnapshot(bundle, { evIncludeLeases: false });
    const stored = snapshot.content.bundle.statements.balanceAnnual;
    const conflicts = stored.ok ? (stored.value.data.rows[0] as FmpStatementRow).fieldConflicts : undefined;
    expect(conflicts?.totalDebt).toEqual({ usable: false, vendorValue: 1, secValue: null, reason: "kept sentence" });
    expect(conflicts?.revenue?.cause).toBe("revenue-scope");
    expect(snapshot.hash).toBe(captureRunInputSnapshot(plain, { evIncludeLeases: false }).hash);
    expect(canonicalSnapshotJson(snapshot.content.bundle)).not.toContain("vendor-sec-value-conflict");
    // The live bundle is not mutated.
    expect(rows[0]!.fieldConflicts?.totalDebt?.cause).toBe("vendor-sec-value-conflict");
  });
});
