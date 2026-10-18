import { describe, expect, it } from "vitest";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload, StatementFieldProvenance } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";

const END = "2024-12-31", OBSERVED = "2026-10-17T00:00:00Z";
const TAG = "TemporaryEquityCarryingAmountAttributableToParent";
const point = (val: number, extra = {}) => ({ val, end: END, filed: "2025-05-15", form: "10-Q", fp: "Q1", fy: 2025, accn: "0001769628-25-000014", ...extra });
const concept = (val: number, extra = {}, unit = "USD") => ({ units: { [unit]: [point(val, extra)] } });
const row = (): FmpBalanceSheetRow => ({ cik: "0001769628", symbol: "CRWV", date: END, reportedCurrency: "USD",
  totalAssets: 17_832_599_000, totalLiabilities: 16_524_086_000, totalStockholdersEquity: -413_598_000 });
const facts = (): CompanyFacts => ({ cik: 1769628, entityName: "CoreWeave, Inc.", facts: { "us-gaap": {
  Revenues: concept(100, { start: "2024-01-01", form: "10-K", fp: "FY", fy: 2024, filed: "2025-03-01" }),
  Assets: concept(17_832_599_000), Liabilities: concept(16_524_086_000), StockholdersEquity: concept(-413_598_000), [TAG]: concept(1_722_111_000),
} } });
const sourced = <T extends FmpBalanceSheetRow | FmpCashFlowRow>(rows: T[]): FetchResult<FmpPayload<T>> => ({ ok: true, value: {
  data: { rows, raw: rows }, source: "fmp", endpoint: "test:vendor", asOf: END, fetchedAt: OBSERVED,
} });
function enrich(vendor = row(), input = facts()) {
  const original = sourced([vendor]);
  const result = enrichFinancialFields(original, sourced<FmpCashFlowRow>([]), input, "annual", OBSERVED);
  if (!result.balance.ok) throw new Error("fixture balance unavailable");
  return { ...result, row: result.balance.value.data.rows[0]!, original };
}

describe("temporary equity enrichment of compatible successful vendor balances", () => {
  function zeroFixture(secParent = 10) {
    const input = facts();
    Object.assign(input.facts["us-gaap"], { Assets: concept(100), Liabilities: concept(60), StockholdersEquity: concept(secParent),
      StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: concept(secParent + 5),
      NonredeemableNoncontrollingInterest: concept(5), [TAG]: concept(35 - secParent) });
    const vendor: FmpBalanceSheetRow = { ...row(), totalAssets: 100, totalLiabilities: 60, totalStockholdersEquity: 0, totalEquity: secParent + 5, minorityInterest: 5 };
    const evidence: StatementFieldProvenance = { source: "edgar", unit: "USD", periodStart: null, periodEnd: END, observedAt: OBSERVED,
      tags: ["us-gaap/StockholdersEquity"], filings: [{ accn: "0001769628-25-000014", filed: "2025-05-15", form: "10-Q" }] };
    return { input, vendor, evidence };
  }

  it("refuses a sourced parent-equity zero that conflicts with the SEC parent amount", () => {
    const { input, vendor, evidence } = zeroFixture();
    const out = enrich({ ...vendor, fieldProvenance: { totalStockholdersEquity: evidence } }, input);
    expect(out.row.totalStockholdersEquity).toBe(0);
    expect(out.row.temporaryEquityAttributableToParent).toBeUndefined();
    expect(out.gaps.some(g => g.severity === "warn" && /permanent-equity.*conflict/i.test(g.reason))).toBe(true);
  });

  it("permits an exact sourced parent-equity zero alongside matching nonzero consolidated anchors", () => {
    const { input, vendor, evidence } = zeroFixture(0);
    const out = enrich({ ...vendor, fieldProvenance: { totalStockholdersEquity: evidence } }, input);
    expect(out.row.temporaryEquityAttributableToParent).toBe(35);
    expect(out.row.totalStockholdersEquity).toBe(0);
  });

  it("preserves ordinary unsourced FMP zero-placeholder behavior", () => {
    const { input, vendor } = zeroFixture();
    expect(enrich(vendor, input).row.temporaryEquityAttributableToParent).toBe(25);
  });

  it.each([
    ["different unit", { unit: "EUR" }],
    ["different period", { periodEnd: "2024-12-30" }],
    ["duration context", { periodStart: "2024-01-01" }],
    ["future observation", { observedAt: "2027-01-01T00:00:00Z" }],
    ["future filing", { filings: [{ accn: "0001769628-27-000001", filed: "2027-01-01", form: "10-K" }] }],
    ["filing before balance period", { filings: [{ accn: "0001769628-24-000001", filed: "2024-12-30", form: "10-K" }] }],
  ] satisfies [string, Partial<StatementFieldProvenance>][])("refuses known sourced-zero evidence with %s rather than treating it as a placeholder", (_label, override) => {
    const { input, vendor, evidence } = zeroFixture(0);
    const out = enrich({ ...vendor, fieldProvenance: { totalStockholdersEquity: { ...evidence, ...override } } }, input);
    expect(out.row.temporaryEquityAttributableToParent).toBeUndefined();
    expect(out.gaps.some(g => g.severity === "warn" && /temporary/i.test(g.reason))).toBe(true);
  });

  it("also refuses a nonzero operand with known incompatible field context", () => {
    const { input, vendor, evidence } = zeroFixture();
    const out = enrich({ ...vendor, totalStockholdersEquity: 10, fieldProvenance: { totalStockholdersEquity: { ...evidence, unit: "EUR" } } }, input);
    expect(out.row.temporaryEquityAttributableToParent).toBeUndefined();
  });

  it("allows compatible independently filed operand evidence when its values agree", () => {
    const { input, vendor, evidence } = zeroFixture(0);
    const out = enrich({ ...vendor, fieldProvenance: { totalStockholdersEquity: { ...evidence,
      filings: [{ accn: "0001769628-25-000010", filed: "2025-03-01", form: "10-K" }] } } }, input);
    expect(out.row.temporaryEquityAttributableToParent).toBe(35);
  });

  it("normalizes the acquisition UTC day when admitting an independently filed operand", () => {
    const { input, vendor, evidence } = zeroFixture(0);
    const out = enrich({ ...vendor, fieldProvenance: { totalStockholdersEquity: { ...evidence,
      observedAt: "2026-10-16T23:00:00-02:00", filings: [{ accn: "0001769628-26-000001", filed: "2026-10-17", form: "10-K" }] } } }, input);
    expect(out.row.temporaryEquityAttributableToParent).toBe(35);
    expect(out.row.fieldProvenance?.totalStockholdersEquity?.observedAt).toBe("2026-10-16T23:00:00-02:00");
  });

  it.each(["2026-10-17T00:00:01Z", "2026-10-18T00:00:01+14:00"])("accepts normalizer acquisition later on the same UTC day without altering %s", acquiredAt => {
    const { input } = zeroFixture(0);
    const normalized = buildStatementsFromCompanyFacts(input, { symbol: "CRWV", cik: "0001769628", annualPeriods: 1, quarterlyPeriods: 0,
      asOf: OBSERVED.slice(0, 10), factsObservedAt: acquiredAt,
      vendorSplits: { status: "unavailable", source: "test", reason: "no share operands used" } }).balanceAnnual.rows[0]!;
    expect(normalized.fieldProvenance?.totalStockholdersEquity?.observedAt).toBe(acquiredAt);
    const out = enrich(normalized, input);
    expect(out.row.temporaryEquityAttributableToParent).toBe(35);
    expect(out.row.fieldProvenance?.totalStockholdersEquity?.observedAt).toBe(acquiredAt);
    expect(out.gaps.some(g => g.severity === "warn" && /temporary-equity SEC enrichment withheld/i.test(g.reason))).toBe(false);
  });

  it.each(["2026-10-18T00:00:00Z", "2026-10-17T23:00:00-02:00", "invalid-observation"])("refuses normalizer acquisition on a future UTC day or invalid timestamp (%s)", acquiredAt => {
    const { input } = zeroFixture(0);
    const normalized = buildStatementsFromCompanyFacts(input, { symbol: "CRWV", cik: "0001769628", annualPeriods: 1, quarterlyPeriods: 0,
      asOf: OBSERVED.slice(0, 10), factsObservedAt: acquiredAt,
      vendorSplits: { status: "unavailable", source: "test", reason: "no share operands used" } }).balanceAnnual.rows[0]!;
    const out = enrich(normalized, input);
    expect(out.row.fieldProvenance?.totalStockholdersEquity?.observedAt).toBe(acquiredAt);
    expect(out.gaps.some(g => g.severity === "warn" && /temporary-equity SEC enrichment withheld/i.test(g.reason))).toBe(true);
  });

  it("adds the disclosed CRWV category only after matching SEC assets, liabilities and permanent equity", () => {
    const out = enrich();
    expect(out.row.temporaryEquityAttributableToParent).toBe(1_722_111_000);
    expect(out.row.totalStockholdersEquity).toBe(-413_598_000);
    expect(out.row.fieldProvenance?.temporaryEquityAttributableToParent).toMatchObject({ source: "edgar", unit: "USD", periodEnd: END, tags: [`us-gaap/${TAG}`] });
    expect(out.original.ok && out.original.value.data.rows[0]?.temporaryEquityAttributableToParent).toBeUndefined();
    expect(out.balance.ok && out.balance.value.data.raw).toBe(out.original.ok && out.original.value.data.raw);
  });
  it.each([
    ["different issuer", { cik: "0000000001" }], ["unknown issuer", { cik: null }],
    ["different period", { date: "2023-12-31" }], ["different currency", { reportedCurrency: "EUR" }],
    ["unknown currency", { reportedCurrency: null }], ["conflicting assets", { totalAssets: 18_000_000_000 }],
    ["conflicting liabilities", { totalLiabilities: 16_000_000_000 }], ["conflicting equity", { totalStockholdersEquity: -400_000_000 }],
    ["unknown assets", { totalAssets: undefined }], ["conflicting consolidated scope", { totalEquity: 100 }],
  ] satisfies [string, Partial<FmpBalanceSheetRow>][])("refuses a %s join", (_label, override) => {
    const out = enrich({ ...row(), ...override });
    expect(out.row.temporaryEquityAttributableToParent).toBeUndefined();
    expect(out.gaps.some(g => /temporary|currency/i.test(g.reason))).toBe(true);
  });
  it("preserves a conflicting vendor amount and explicitly refuses its reconciled use", () => {
    const out = enrich({ ...row(), temporaryEquityAttributableToParent: 123 });
    expect(out.row.temporaryEquityAttributableToParent).toBe(123);
    expect(out.row.fieldConflicts?.temporaryEquityAttributableToParent).toMatchObject({ vendorValue: 123, secValue: 1_722_111_000, usable: false });
  });
  it.each([
    concept(1_722_111_000, { accn: "0001769628-25-000015" }),
    concept(1_722_111_000, { filed: "2027-01-01" }),
    { units: { USD: [point(1_722_111_000), point(2_000_000_000)] } },
  ])("does not join incompatible or conflicting SEC filing versions", temporary => {
    const input = facts(); input.facts["us-gaap"][TAG] = temporary;
    const out = enrich(row(), input);
    expect(out.row.temporaryEquityAttributableToParent).toBeUndefined();
    expect(out.gaps.some(g => /temporary/i.test(g.reason))).toBe(true);
  });
});
