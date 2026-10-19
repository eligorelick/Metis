import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";

const combinedTag = "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents";
const restrictedTag = "RestrictedCashAndCashEquivalentsAtCarryingValue";
const noncurrentTag = "RestrictedCashAndCashEquivalentsNoncurrent";
interface Amount { value: number; filing?: string; end?: string; filed?: string; unit?: string; start?: string }
function build(extra: Record<string, Amount>) {
  const points: Record<string, Amount> = { Assets: { value: 2000 }, LongTermDebtNoncurrent: { value: 300 }, ShortTermInvestments: { value: 50 }, ...extra };
  const facts = { cik: 1, entityName: "Ordinary issuer", facts: { "us-gaap": Object.fromEntries(Object.entries(points).map(([tag, amount]) =>
    [tag, { units: { [amount.unit ?? "USD"]: [{ val: amount.value, end: amount.end ?? "2025-12-31", filed: amount.filed ?? "2026-02-01", form: "10-K", fp: "FY", fy: 2025,
      ...(amount.start === undefined ? {} : { start: amount.start }),
      accn: amount.filing ?? "0000000001-26-000001" }] } }])) } } as unknown as CompanyFacts;
  return buildStatementsFromCompanyFacts(facts, { symbol: "TEST", cik: "0000000001", asOf: "2026-10-16", annualPeriods: 1, quarterlyPeriods: 0,
    vendorSplits: { status: "retrieved", source: "test", events: [], coverage: [{ from: "2020-01-01", to: "2026-10-16" }] } });
}

describe("restricted versus unrestricted cash scope", () => {
  it("does not use a restricted-plus-unrestricted total as unrestricted cash when the allocation is unknown", () => {
    const row = build({ [combinedTag]: { value: 900 } }).balanceAnnual.rows[0]!;
    expect(row.cashAndCashEquivalents).toBeNull();
    expect(row.cashAndShortTermInvestments).toBeNull();
    expect(row.netDebt).toBeNull();
  });
  it("derives unrestricted cash once only with both current and noncurrent restricted balances", () => {
    const row = build({ [combinedTag]: { value: 900 }, [restrictedTag]: { value: 200 }, [noncurrentTag]: { value: 0 } }).balanceAnnual.rows[0]!;
    expect(row).toMatchObject({ cashAndCashEquivalents: 700, cashAndShortTermInvestments: 750, netDebt: -400,
      cashAndCashEquivalentsIncludingRestricted: 900, restrictedCashAndCashEquivalents: 200 });
    expect(row.fieldProvenance?.cashAndCashEquivalents?.tags).toEqual([`us-gaap/${combinedTag}`, `us-gaap/${restrictedTag}`, `us-gaap/${noncurrentTag}`]);
  });
  it("subtracts the complete current and noncurrent restriction amount in the missing-narrow-cash case", () => {
    const row = build({ [combinedTag]: { value: 6904 }, [restrictedTag]: { value: 873 }, [noncurrentTag]: { value: 507 } }).balanceAnnual.rows[0]!;
    expect(row.cashAndCashEquivalents).toBe(5524);
    expect(row.cashAndShortTermInvestments).toBe(5574);
    expect(row.netDebt).toBe(-5224);
  });
  it.each([restrictedTag, noncurrentTag])("does not presume a missing restricted component is zero (%s)", missing => {
    const inputs: Record<string, Amount> = { [combinedTag]: { value: 6904 }, [restrictedTag]: { value: 873 }, [noncurrentTag]: { value: 507 } };
    delete inputs[missing];
    const built = build(inputs);
    const row = built.balanceAnnual.rows[0]!;
    expect(row.cashAndCashEquivalents).toBeNull();
    expect(row.cashAndShortTermInvestments).toBeNull();
    expect(row.netDebt).toBeNull();
    expect(row.fieldConflicts?.cashAndCashEquivalents?.reason).toMatch(/current.*noncurrent|complete.*restriction/i);
  });
  it.each([
    ["different accession", { value: 507, filing: "0000000001-26-000002" }],
    ["different filing day", { value: 507, filed: "2026-02-02" }],
    ["different period", { value: 507, end: "2025-12-30" }],
    ["foreign currency", { value: 507, unit: "EUR" }],
    ["share unit", { value: 507, unit: "shares" }],
    ["duration", { value: 507, start: "2025-01-01" }],
    ["future filing", { value: 507, filed: "2027-01-01" }],
    ["invalid date", { value: 507, end: "2025-02-30" }],
    ["nonfinite", { value: Number.NaN }],
    ["negative", { value: -507 }],
    ["excessive restrictions", { value: 7000 }],
  ] satisfies [string, Amount][])("withholds the unrestricted-cash bridge for %s noncurrent evidence", (_label, amount) => {
    const row = build({ [combinedTag]: { value: 6904 }, [restrictedTag]: { value: 873 }, [noncurrentTag]: amount }).balanceAnnual.rows[0]!;
    expect(row.cashAndCashEquivalents).toBeNull();
    expect(row.cashAndShortTermInvestments).toBeNull();
    expect(row.netDebt).toBeNull();
  });
  it("retains directly tagged unrestricted cash without subtracting restrictions a second time", () => {
    const row = build({ CashAndCashEquivalentsAtCarryingValue: { value: 700 }, [combinedTag]: { value: 950 }, [restrictedTag]: { value: 200 }, [noncurrentTag]: { value: 50 } }).balanceAnnual.rows[0]!;
    expect(row).toMatchObject({ cashAndCashEquivalents: 700, cashAndShortTermInvestments: 750, netDebt: -400 });
  });
  it("retains an independently tagged cash-and-short-term-investment balance", () => {
    const row = build({ [combinedTag]: { value: 900 }, CashCashEquivalentsAndShortTermInvestments: { value: 750 } }).balanceAnnual.rows[0]!;
    expect(row.cashAndCashEquivalents).toBeNull();
    expect(row.cashAndShortTermInvestments).toBe(750);
  });
  it("refuses a negative restricted balance instead of adding it to available cash", () => {
    const row = build({ [combinedTag]: { value: 900 }, [restrictedTag]: { value: -200 }, [noncurrentTag]: { value: 0 } }).balanceAnnual.rows[0]!;
    expect(row.cashAndCashEquivalents).toBeNull();
    expect(row.netDebt).toBeNull();
  });
  it.each([{ value: 100 }, { value: 900, filing: "0000000001-26-000002" }])("withholds a negative or cross-filing inferred unrestricted balance", combined => {
    const row = build({ [combinedTag]: combined, [restrictedTag]: { value: 200 }, [noncurrentTag]: { value: 0 } }).balanceAnnual.rows[0]!;
    expect(row.cashAndCashEquivalents).toBeNull();
    expect(row.cashAndShortTermInvestments).toBeNull();
    expect(row.netDebt).toBeNull();
  });
});
