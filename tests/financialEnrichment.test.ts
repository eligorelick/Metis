import { describe, expect, it } from "vitest";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";

const observedAt = "2026-10-13T12:00:00.000Z";
const point = (val: number, extra: Record<string, unknown> = {}) => ({ end: "2026-06-30", val, accn: "0000000001-26-000002", filed: "2026-07-30", form: "10-Q", fy: 2026, fp: "Q2", ...extra });
function facts(tags: Record<string, ReturnType<typeof point>[]>, currency = "USD"): CompanyFacts {
  return { cik: 1, entityName: "Example", facts: { "us-gaap": Object.fromEntries(Object.entries(tags).map(([tag, points]) => [tag, { units: { [currency]: points } }])) } };
}
function sourced<T extends FmpBalanceSheetRow | FmpCashFlowRow>(rows: T[]): FetchResult<FmpPayload<T>> {
  return { ok: true, value: { data: { rows, raw: rows }, source: "fmp", asOf: "2026-06-30", endpoint: "fmp:statements", fetchedAt: observedAt } };
}
const leases = () => facts({ OperatingLeaseLiability: [point(30)], FinanceLeaseLiability: [point(7)], FinanceLeasePrincipalPayments: [point(5, { start: "2026-01-01" }), point(2, { start: "2026-01-01", end: "2026-03-31", filed: "2026-04-30", accn: "0000000001-26-000001", fp: "Q1" })] });

describe("SEC field enrichment of existing vendor statements", () => {
  it("fills lease slices in a partial vendor row and retains vendor row and raw evidence", () => {
    const balance = sourced([{ date: "2026-06-30", reportedCurrency: "USD", totalAssets: 500, totalDebt: 80 }]);
    const out = enrichFinancialFields(balance, sourced<FmpCashFlowRow>([]), leases(), "quarter", observedAt);
    expect(out.balance.ok && out.balance.value.data.rows[0]).toMatchObject({ totalAssets: 500, totalDebt: 80, operatingLeaseLiability: 30, financeLeaseLiability: 7, fieldProvenance: { operatingLeaseLiability: { source: "edgar", unit: "USD", periodEnd: "2026-06-30", observedAt, tags: ["us-gaap/OperatingLeaseLiability"], filings: [{ filed: "2026-07-30", accn: "0000000001-26-000002" }] } } });
    expect(balance.ok && balance.value.data.rows[0]).not.toHaveProperty("operatingLeaseLiability");
    expect(out.balance.ok && out.balance.value.source).toBe("fmp");
    expect(out.balance.ok && out.balance.value.data.raw).toBe(balance.ok && balance.value.data.raw);
  });
  it("derives quarterly principal from same-lineage YTD rather than using six-month principal", () => {
    const out = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced([{ date: "2026-06-30", period: "Q2", reportedCurrency: "USD", freeCashFlow: 40 }]), leases(), "quarter", observedAt);
    expect(out.cashflow.ok && out.cashflow.value.data.rows[0]).toMatchObject({ freeCashFlow: 40, financeLeasePrincipalPayments: 3, fieldProvenance: { financeLeasePrincipalPayments: { periodStart: "2026-04-01", periodEnd: "2026-06-30", derivation: "ytd-difference" } } });
  });
  it.each(["EUR", null])("refuses to blend USD facts with vendor currency %s", (reportedCurrency) => {
    const out = enrichFinancialFields(sourced([{ date: "2026-06-30", reportedCurrency }]), sourced<FmpCashFlowRow>([]), leases(), "quarter", observedAt);
    expect(out.balance.ok && out.balance.value.data.rows[0]).not.toHaveProperty("operatingLeaseLiability");
    expect(out.gaps.some((g) => /currency/i.test(g.reason))).toBe(true);
  });
  it("preserves conflicting vendor value and flags that field unavailable for reconciled consumption", () => {
    const out = enrichFinancialFields(sourced([{ date: "2026-06-30", reportedCurrency: "USD", operatingLeaseLiability: 99 }]), sourced<FmpCashFlowRow>([]), leases(), "quarter", observedAt);
    expect(out.balance.ok && out.balance.value.data.rows[0]).toMatchObject({ operatingLeaseLiability: 99, fieldConflicts: { operatingLeaseLiability: { vendorValue: 99, secValue: 30, usable: false } } });
    expect(out.gaps.some((g) => /conflict/i.test(g.reason))).toBe(true);
  });
  it("does not derive principal using later restated operands or facts not yet published", () => {
    const f = facts({ FinanceLeasePrincipalPayments: [point(5, { start: "2026-01-01" }), point(1, { start: "2026-01-01", end: "2026-03-31", filed: "2026-08-30" })], OperatingLeaseLiability: [point(30, { filed: "2026-10-14" })] });
    const out = enrichFinancialFields(sourced([{ date: "2026-06-30", reportedCurrency: "USD" }]), sourced([{ date: "2026-06-30", reportedCurrency: "USD" }]), f, "quarter", observedAt);
    expect(out.balance.ok && out.balance.value.data.rows[0]).not.toHaveProperty("operatingLeaseLiability");
    expect(out.cashflow.ok && out.cashflow.value.data.rows[0]).not.toHaveProperty("financeLeasePrincipalPayments");
  });
  it("rejects incomplete split liabilities rather than calling one component the total", () => {
    const out = enrichFinancialFields(sourced([{ date: "2026-06-30", reportedCurrency: "USD" }]), sourced<FmpCashFlowRow>([]), facts({ OperatingLeaseLiabilityCurrent: [point(3)] }), "quarter", observedAt);
    expect(out.balance.ok && out.balance.value.data.rows[0]).not.toHaveProperty("operatingLeaseLiability");
  });
  it("rejects a duration that conflicts with the vendor's explicit period start", () => {
    const out = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced([{ date: "2026-06-30", periodStart: "2026-04-02", reportedCurrency: "USD" }]), facts({ FinanceLeasePrincipalPayments: [point(3, { start: "2026-04-01" })] }), "quarter", observedAt);
    expect(out.cashflow.ok && out.cashflow.value.data.rows[0]).not.toHaveProperty("financeLeasePrincipalPayments");
    expect(out.gaps.some((g) => /period/i.test(g.reason))).toBe(true);
  });
  it("does not substitute a quarterly principal fact for a full fiscal-year amount", () => {
    const out = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), sourced([{ date: "2026-06-30", reportedCurrency: "USD" }]), facts({ FinanceLeasePrincipalPayments: [point(3, { start: "2026-04-01" })] }), "annual", observedAt);
    expect(out.cashflow.ok && out.cashflow.value.data.rows[0]).not.toHaveProperty("financeLeasePrincipalPayments");
  });
  it("does not enrich a future period even when its filing is stamped before analysis", () => {
    const out = enrichFinancialFields(sourced([{ date: "2026-12-31", reportedCurrency: "USD" }]), sourced<FmpCashFlowRow>([]), facts({ OperatingLeaseLiability: [point(30, { end: "2026-12-31" })] }), "quarter", observedAt);
    expect(out.balance.ok && out.balance.value.data.rows[0]).not.toHaveProperty("operatingLeaseLiability");
  });
});
