import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import { validateBundle, type ValidatableBundle } from "@/pipeline/stageA/validate";
import type { FetchResult } from "@/types/core";

const END = "2024-12-31";
const PARENT = "TemporaryEquityCarryingAmountAttributableToParent";
const TOTAL = "TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests";
const NCI = "RedeemableNoncontrollingInterestEquityCarryingAmount";
const point = (val: number, extra = {}) => ({ end: END, val, accn: "0001769628-25-000014", form: "10-Q", filed: "2025-05-15", fy: 2025, fp: "Q1", ...extra });
const concept = (val: number, extra = {}, unit = "USD") => ({ units: { [unit]: [point(val, extra)] } });
const base = () => ({
  Assets: concept(17_832_599_000), Liabilities: concept(16_524_086_000),
  StockholdersEquity: concept(-413_598_000), [PARENT]: concept(1_722_111_000),
});
function build(tags: Record<string, unknown> = base()) {
  const facts: CompanyFacts = { cik: 1769628, entityName: "CoreWeave, Inc.", facts: { "us-gaap": {
    Revenues: concept(100, { start: "2024-01-01", form: "10-K", filed: "2025-03-01", fy: 2024, fp: "FY" }), ...tags,
  } } };
  return buildStatementsFromCompanyFacts(facts, { symbol: "CRWV", cik: "0001769628", annualPeriods: 4, quarterlyPeriods: 4,
    asOf: "2026-10-17", factsObservedAt: "2026-10-17T00:00:00Z", vendorSplits: { status: "retrieved", source: "test", events: [], coverage: [{ from: "2020-01-01", to: "2026-10-17" }] } });
}
function ok<T>(data: T): FetchResult<T> {
  return { ok: true, value: { data, source: "edgar", endpoint: "test:companyfacts", asOf: END, fetchedAt: "2026-10-17T00:00:00Z" } };
}
function identity(row: Record<string, unknown>) {
  const missing = { ok: false, gap: { field: "test", reason: "unavailable", severity: "info" } } as const;
  const bundle: ValidatableBundle = { symbol: "CRWV", quote: missing,
    statements: { balanceAnnual: ok({ rows: [row] }), incomeAnnual: missing, incomeQuarterly: missing },
    institutional: { year: 2026, quarter: 2, quarterEnd: "2026-06-30", positionsSummary: missing }, edgar: { companyFacts: missing } };
  const report = validateBundle(bundle, { now: new Date("2026-10-17T00:00:00Z") });
  return { check: report.checks.find(c => c.id === `balanceSheetIdentity.${END}`)!, report };
}

describe("temporary equity is a separate balance-sheet identity category", () => {
  // SEC CRWV 2025 Q1 balance sheet, 2024 comparative (in thousands, scaled to USD):
  // https://www.sec.gov/Archives/edgar/data/1769628/000176962825000014/crwv-20250331.htm
  it("reconciles the disclosed CRWV mezzanine balance without changing permanent equity", () => {
    const row = build().balanceAnnual.rows[0]!;
    expect(row.temporaryEquityAttributableToParent).toBe(1_722_111_000);
    expect(row.temporaryEquity).toBeNull();
    expect(row.temporaryEquityAttributableToNoncontrollingInterest).toBeNull();
    expect(row.totalStockholdersEquity).toBe(-413_598_000);
    expect(row.preferredStock).toBeNull();
    expect(row.fieldProvenance?.temporaryEquityAttributableToParent).toMatchObject({ unit: "USD", periodStart: null, periodEnd: END, tags: [`us-gaap/${PARENT}`] });
    const { check, report } = identity(row);
    expect(check.status).toBe("pass");
    expect(check.deltaPct).toBe(0);
    expect(check.detail).toMatch(/temporary equity 1722111000.*parent/i);
    expect(report.gaps.some(g => g.field === `validation.balanceSheetIdentity.${END}`)).toBe(false);
  });

  it("does not infer missing temporary equity from the residual", () => {
    const tags = base(); delete (tags as Record<string, unknown>)[PARENT];
    const row = build(tags).balanceAnnual.rows[0]!;
    expect(row.temporaryEquityAttributableToParent).toBeNull();
    expect(identity(row).check.status).toBe("fail");
    expect(identity(row).check.deltaPct).toBeCloseTo(1_722_111_000 / 17_832_599_000 * 100, 10);
  });

  it("still flags a real mismatch after including temporary equity", () => {
    const row = build({ ...base(), [PARENT]: concept(1_000_000_000) }).balanceAnnual.rows[0]!;
    expect(identity(row).check.status).toBe("fail");
  });

  it("uses a consolidated temporary total once, without its parent/NCI pieces or permanent preferred", () => {
    const row = build({ Assets: concept(100), Liabilities: concept(60), StockholdersEquity: concept(10),
      [TOTAL]: concept(30), [PARENT]: concept(20), [NCI]: concept(10), PreferredStockValue: concept(4) }).balanceAnnual.rows[0]!;
    expect(row.temporaryEquity).toBe(30);
    expect(row.temporaryEquityAttributableToParent).toBe(20);
    expect(row.temporaryEquityAttributableToNoncontrollingInterest).toBe(10);
    expect(row.preferredStock).toBe(4);
    expect(identity(row).check).toMatchObject({ status: "pass", deltaPct: 0 });
  });

  it("adds disjoint parent and redeemable NCI balances, separately from permanent NCI", () => {
    const row = build({ Assets: concept(100), Liabilities: concept(50), StockholdersEquity: concept(10),
      NonredeemableNoncontrollingInterest: concept(5), [PARENT]: concept(20), [NCI]: concept(15) }).balanceAnnual.rows[0]!;
    expect(row.totalEquity).toBe(15);
    expect(identity(row).check).toMatchObject({ status: "pass", deltaPct: 0 });
  });

  it("discloses an unresolved NCI scope when the observed parent component leaves a residual", () => {
    const row = build({ Assets: concept(100), Liabilities: concept(50), StockholdersEquity: concept(10), [PARENT]: concept(20) }).balanceAnnual.rows[0]!;
    expect(identity(row).check.status).toBe("fail");
    expect(identity(row).check.detail).toContain("redeemable NCI undisclosed");
    expect(identity(row).report.gaps[0]?.reason).toContain("scope remains unresolved");
  });

  it("does not claim a clean pass when a consolidated total contradicts its complete allocation", () => {
    const row = build({ Assets: concept(100), Liabilities: concept(60), StockholdersEquity: concept(10),
      [TOTAL]: concept(30), [PARENT]: concept(20), [NCI]: concept(15) }).balanceAnnual.rows[0]!;
    const { check, report } = identity(row);
    expect(check.status).toBe("warn");
    expect(check.deltaPct).toBe(0);
    expect(check.detail).toMatch(/temporary.*allocation.*conflict/i);
    expect(report.gaps.some(g => /allocation.*conflict/i.test(g.reason))).toBe(true);
  });

  it("uses observed redeemable NCI without claiming parent temporary equity is zero", () => {
    const row = build({ Assets: concept(100), Liabilities: concept(50), StockholdersEquity: concept(10), [NCI]: concept(40) }).balanceAnnual.rows[0]!;
    expect(identity(row).check).toMatchObject({ status: "pass", deltaPct: 0 });
    expect(identity(row).check.detail).toContain("parent temporary equity undisclosed");
  });

  it.each([0, -10])("preserves a filed signed or zero temporary carrying value (%s)", value => {
    const row = build({ Assets: concept(100), Liabilities: concept(90 - value), StockholdersEquity: concept(10), [PARENT]: concept(value) }).balanceAnnual.rows[0]!;
    expect(row.temporaryEquityAttributableToParent).toBe(value);
    expect(identity(row).check).toMatchObject({ status: "pass", deltaPct: 0 });
    expect(identity(row).check.detail).toContain(`temporary equity ${value}`);
  });

  it("does not absorb disclosed mezzanine equity into inferred liabilities", () => {
    const tags: Record<string, unknown> = { ...base(), StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: concept(-413_598_000) };
    delete tags.Liabilities;
    const row = build(tags).balanceAnnual.rows[0]!;
    expect(row.totalLiabilities).toBeNull();
    expect(identity(row).check.status).toBe("skipped");
  });

  it.each([concept(Number.NaN), concept(30, {}, "shares"), concept(30, { end: "2024-12-30" })])("does not plug missing liabilities when temporary evidence is unusable", temporary => {
    const row = build({ Assets: concept(100), StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: concept(10),
      [PARENT]: temporary }).balanceAnnual.rows[0]!;
    expect(row.totalLiabilities).toBeNull();
    expect(identity(row).check.status).toBe("skipped");
    expect(row.fieldConflicts?.totalLiabilities?.reason).toMatch(/liabilit.*unavailable|liabilit.*not.*filed/i);
  });

  it("retains the legacy liability estimate without passing an identity that is circular", () => {
    const row = build({ Assets: concept(100), StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: concept(10) }).balanceAnnual.rows[0]!;
    expect(row.totalLiabilities).toBe(90);
    expect(row.identityDerivedFields).toEqual(["totalLiabilities"]);
    expect(identity(row).check.status).toBe("skipped");
    expect(identity(row).check.detail).toMatch(/derived.*identity|circular/i);
  });

  it.each([[30, 40], [40, 30]])("refuses conflicting same-filing temporary values in either input order (%j)", (first, second) => {
    const built = build({ Assets: concept(100), Liabilities: concept(60), StockholdersEquity: concept(10),
      [PARENT]: { units: { USD: [point(first), point(second)] } } });
    const row = built.balanceAnnual.rows[0]!;
    expect(row.temporaryEquityAttributableToParent).toBeNull();
    expect(row.fieldConflicts?.temporaryEquityAttributableToParent?.reason).toMatch(/conflict/i);
    expect(identity(row).check.status).toBe("fail");
  });

  it("allows a later clean filing to resolve an earlier same-version conflict", () => {
    const row = build({ Assets: concept(100), Liabilities: concept(60), StockholdersEquity: concept(10),
      [PARENT]: { units: { USD: [point(20), point(40), point(30, { accn: "0001769628-25-000015", filed: "2025-08-15" })] } } }).balanceAnnual.rows[0]!;
    expect(row.temporaryEquityAttributableToParent).toBe(30);
    expect(identity(row).check.status).toBe("pass");
  });

  it("does not let rejected foreign-currency or future conflicts contaminate compatible filed evidence", () => {
    const row = build({ Assets: concept(100), Liabilities: concept(60), StockholdersEquity: concept(10),
      [PARENT]: { units: { USD: [point(30), point(20, { filed: "2027-01-01" }), point(40, { filed: "2027-01-01" })], EUR: [point(20), point(40)] } } }).balanceAnnual.rows[0]!;
    expect(row.temporaryEquityAttributableToParent).toBe(30);
    expect(identity(row).check.status).toBe("pass");
  });

  it.each([
    { temporaryEquity: Number.NaN, temporaryEquityAttributableToParent: 30 },
    { temporaryEquity: 30, temporaryEquityAttributableToParent: Number.POSITIVE_INFINITY, temporaryEquityAttributableToNoncontrollingInterest: 10 },
  ])("warns about nonfinite normalized temporary allocations without using them as operands", allocation => {
    const { check, report } = identity({ date: END, totalAssets: 100, totalLiabilities: 60, totalEquity: 10, ...allocation });
    expect(check.status).toBe("warn");
    expect(report.gaps.some(g => /invalid.*temporary|temporary.*nonfinite/i.test(g.reason))).toBe(true);
  });

  it("does not pass an identity using an explicitly refused temporary category", () => {
    const { check } = identity({ date: END, totalAssets: 100, totalLiabilities: 60, totalEquity: 10,
      temporaryEquityAttributableToParent: 30, fieldConflicts: { temporaryEquityAttributableToParent: {
        vendorValue: 30, secValue: 40, usable: false, reason: "vendor/SEC category conflict",
      } } });
    expect(check.status).toBe("skipped");
    expect(check.detail).toContain("vendor/SEC category conflict");
  });

  it("warns when all disclosed temporary operands are invalid even if permanent operands balance", () => {
    const { check } = identity({ date: END, totalAssets: 100, totalLiabilities: 60, totalEquity: 40, temporaryEquity: Number.NaN });
    expect(check.status).toBe("warn");
    expect(check.detail).toMatch(/invalid.*temporary/i);
  });

  it.each([
    ["share unit", concept(1_722_111_000, {}, "shares")],
    ["foreign currency", concept(1_722_111_000, {}, "EUR")],
    ["wrong period", concept(1_722_111_000, { end: "2024-12-30" })],
    ["duration", concept(1_722_111_000, { start: "2024-01-01" })],
    ["future filing", concept(1_722_111_000, { filed: "2027-01-01" })],
    ["invalid date", concept(1_722_111_000, { end: "2024-02-30" })],
    ["non-core form", concept(1_722_111_000, { form: "8-K" })],
    ["nonfinite value", concept(Number.NaN)],
  ])("refuses incompatible temporary equity: %s", (_label, input) => {
    const row = build({ ...base(), [PARENT]: input }).balanceAnnual.rows[0]!;
    expect(row.temporaryEquityAttributableToParent).toBeNull();
    expect(identity(row).check.status).toBe("fail");
  });

  it("never searches another issuer namespace for a matching residual", () => {
    const tags = base(); delete (tags as Record<string, unknown>)[PARENT];
    const row = build({ ...tags, "otherIssuer:TemporaryEquityCarryingAmountAttributableToParent": concept(1_722_111_000) }).balanceAnnual.rows[0]!;
    expect(row.temporaryEquityAttributableToParent).toBeNull();
    expect(identity(row).check.status).toBe("fail");
  });
});
