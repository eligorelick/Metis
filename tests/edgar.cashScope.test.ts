import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";

const combinedTag = "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents";
const restrictedTag = "RestrictedCashAndCashEquivalentsAtCarryingValue";
function build(extra: Record<string, { value: number; filing?: string }>) {
  const points: Record<string, { value: number; filing?: string }> = { Assets: { value: 2000 }, LongTermDebtNoncurrent: { value: 300 }, ShortTermInvestments: { value: 50 }, ...extra };
  const facts = { cik: 1, entityName: "Ordinary issuer", facts: { "us-gaap": Object.fromEntries(Object.entries(points).map(([tag, amount]) =>
    [tag, { units: { USD: [{ val: amount.value, end: "2025-12-31", filed: "2026-02-01", form: "10-K", fp: "FY", fy: 2025,
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
  it("derives unrestricted cash once from the same-filing combined and restricted balances", () => {
    const row = build({ [combinedTag]: { value: 900 }, [restrictedTag]: { value: 200 } }).balanceAnnual.rows[0]!;
    expect(row).toMatchObject({ cashAndCashEquivalents: 700, cashAndShortTermInvestments: 750, netDebt: -400,
      cashAndCashEquivalentsIncludingRestricted: 900, restrictedCashAndCashEquivalents: 200 });
    expect(row.fieldProvenance?.cashAndCashEquivalents?.tags).toEqual([`us-gaap/${combinedTag}`, `us-gaap/${restrictedTag}`]);
  });
  it("retains directly tagged unrestricted cash without subtracting restrictions a second time", () => {
    const row = build({ CashAndCashEquivalentsAtCarryingValue: { value: 700 }, [combinedTag]: { value: 900 }, [restrictedTag]: { value: 200 } }).balanceAnnual.rows[0]!;
    expect(row).toMatchObject({ cashAndCashEquivalents: 700, cashAndShortTermInvestments: 750, netDebt: -400 });
  });
  it("retains an independently tagged cash-and-short-term-investment balance", () => {
    const row = build({ [combinedTag]: { value: 900 }, CashCashEquivalentsAndShortTermInvestments: { value: 750 } }).balanceAnnual.rows[0]!;
    expect(row.cashAndCashEquivalents).toBeNull();
    expect(row.cashAndShortTermInvestments).toBe(750);
  });
  it("refuses a negative restricted balance instead of adding it to available cash", () => {
    const row = build({ [combinedTag]: { value: 900 }, [restrictedTag]: { value: -200 } }).balanceAnnual.rows[0]!;
    expect(row.cashAndCashEquivalents).toBeNull();
    expect(row.netDebt).toBeNull();
  });
  it.each([{ value: 100 }, { value: 900, filing: "0000000001-26-000002" }])("withholds a negative or cross-filing inferred unrestricted balance", combined => {
    const row = build({ [combinedTag]: combined, [restrictedTag]: { value: 200 } }).balanceAnnual.rows[0]!;
    expect(row.cashAndCashEquivalents).toBeNull();
    expect(row.cashAndShortTermInvestments).toBeNull();
    expect(row.netDebt).toBeNull();
  });
});
