/**
 * Audit 2026-10-22 B-43 and B-34: two cash chains that withheld net debt and
 * invested capital although the filing establishes the figure.
 *
 * B-43 (Chevron since Q3 2024): the balance-sheet cash line moved to a custom
 * tag, so cash comes only from the combined restricted-plus-unrestricted total
 * less the restrictions, which Chevron tags `RestrictedCashCurrent` and
 * `RestrictedCashNoncurrent`. Neither was read.
 *
 * B-34 (Cisco FY2026): the 10-K tags `CashCashEquivalentsAndShortTermInvestments`
 * as the total of its fair-valued investment schedule, 14,297, which leaves
 * out bank-deposit cash; the balance sheet's cash 7,218 and short-term
 * investments 8,700 sum to 15,918. The combined field won, and net debt was
 * refused for the conflict.
 */
import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import { resolveNetDebt } from "@/pipeline/stageB/netDebt";

const combinedTag = "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents";
interface Amount { value: number; filing?: string }
function build(extra: Record<string, Amount>) {
  const points: Record<string, Amount> = { Assets: { value: 200_000 }, LongTermDebtNoncurrent: { value: 300 }, ...extra };
  const facts = { cik: 1, entityName: "Ordinary issuer", facts: { "us-gaap": Object.fromEntries(Object.entries(points).map(([tag, amount]) =>
    [tag, { units: { USD: [{ val: amount.value, end: "2025-12-31", filed: "2026-02-01", form: "10-K", fp: "FY", fy: 2025,
      accn: amount.filing ?? "0000000001-26-000001" }] } }])) } } as unknown as CompanyFacts;
  return buildStatementsFromCompanyFacts(facts, { symbol: "TEST", cik: "0000000001", asOf: "2026-10-16", annualPeriods: 1, quarterlyPeriods: 0,
    vendorSplits: { status: "retrieved", source: "test", events: [], coverage: [{ from: "2020-01-01", to: "2026-10-16" }] } });
}

describe("restrictions tagged as restricted cash (audit 2026-10-22 B-43)", () => {
  it("derives unrestricted cash from the combined total less RestrictedCashCurrent and RestrictedCashNoncurrent", () => {
    const row = build({ [combinedTag]: { value: 7_285 }, RestrictedCashCurrent: { value: 174 }, RestrictedCashNoncurrent: { value: 818 } }).balanceAnnual.rows[0]!;
    expect(row).toMatchObject({ cashAndCashEquivalents: 6_293, cashAndShortTermInvestments: 6_293, netDebt: 300 - 6_293 });
    expect(row.fieldProvenance?.cashAndCashEquivalents?.tags).toEqual([`us-gaap/${combinedTag}`, "us-gaap/RestrictedCashCurrent", "us-gaap/RestrictedCashNoncurrent"]);
  });

  it("still requires both restriction sides", () => {
    const row = build({ [combinedTag]: { value: 7_285 }, RestrictedCashCurrent: { value: 174 } }).balanceAnnual.rows[0]!;
    expect(row.cashAndCashEquivalents).toBeNull();
    expect(row.netDebt).toBeNull();
  });

  it("still requires one filing", () => {
    const row = build({ [combinedTag]: { value: 7_285 }, RestrictedCashCurrent: { value: 174 }, RestrictedCashNoncurrent: { value: 818, filing: "0000000001-26-000002" } }).balanceAnnual.rows[0]!;
    expect(row.cashAndCashEquivalents).toBeNull();
    expect(row.netDebt).toBeNull();
  });
});

describe("a combined cash total narrower than its own components (audit 2026-10-22 B-34)", () => {
  const cisco = { CashAndCashEquivalentsAtCarryingValue: { value: 7_218 }, ShortTermInvestments: { value: 8_700 } };

  it("uses the same filing's cash plus short-term investments, and says why", () => {
    const built = build({ ...cisco, CashCashEquivalentsAndShortTermInvestments: { value: 14_297 } });
    const row = built.balanceAnnual.rows[0]!;
    expect(row.cashAndShortTermInvestments).toBe(15_918);
    // The house net debt (Stage B) nets cash and short-term investments; it refused the conflict.
    expect(resolveNetDebt(row)).toMatchObject({ value: 300 - 15_918, cashBasis: "combined-field" });
    expect(row.fieldProvenance?.cashAndShortTermInvestments?.tags).toEqual(["us-gaap/CashAndCashEquivalentsAtCarryingValue", "us-gaap/ShortTermInvestments"]);
    const text = built.balanceAnnual.substitutions.find(s => s.field === "cashAndShortTermInvestments")?.text;
    expect(text).toMatch(/CashCashEquivalentsAndShortTermInvestments \(14,297\) is below/);
  });

  it("keeps the combined total when it comes from another filing", () => {
    const row = build({ ...cisco, CashCashEquivalentsAndShortTermInvestments: { value: 14_297, filing: "0000000001-26-000002" } }).balanceAnnual.rows[0]!;
    expect(row.cashAndShortTermInvestments).toBe(14_297);
  });

  it("keeps the combined total when it is above the components, which cannot say what they miss", () => {
    const row = build({ ...cisco, CashCashEquivalentsAndShortTermInvestments: { value: 17_000 } }).balanceAnnual.rows[0]!;
    expect(row.cashAndShortTermInvestments).toBe(17_000);
  });
});
