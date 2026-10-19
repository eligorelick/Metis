import { describe, expect, it } from "vitest";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";

const at = "2026-10-19T00:00:00Z";
const end = "2026-05-29";
const point = (val: number, extra = {}) => ({ val, start: "2026-02-28", end, filed: "2026-06-15", accn: "0000796343-26-000112", form: "10-Q", fy: 2026, fp: "Q2", ...extra });
function sourced<T extends FmpBalanceSheetRow | FmpCashFlowRow>(rows: T[]): FetchResult<FmpPayload<T>> {
  return { ok: true, value: { data: { rows, raw: structuredClone(rows) }, endpoint: "fixture", source: "fmp", asOf: end, fetchedAt: at } };
}
function admit(tag: string, ps: object[], cash: FmpCashFlowRow = {}, balance: FmpBalanceSheetRow = {}, currency = "USD") {
  const facts: CompanyFacts = { cik: 796343, entityName: "ADOBE INC.", facts: { "us-gaap": { [tag]: { units: { [currency]: ps } } } } };
  const cashInput = sourced([{ cik: "796343", date: end, periodStart: "2026-02-28", reportedCurrency: "USD", ...cash }]);
  const balanceInput = sourced([{ cik: "796343", date: end, reportedCurrency: "USD", ...balance }]);
  const out = enrichFinancialFields(balanceInput, cashInput, facts, "quarter", at);
  if (!out.cashflow.ok || !out.balance.ok) throw Error("retained rows expected");
  return { cash: out.cashflow.value.data.rows[0]!, balance: out.balance.value.data.rows[0]!, out, cashInput, balanceInput };
}
const flows = [
  ["commonStockRepurchased", "PaymentsForRepurchaseOfCommonStock", 20, -20],
  ["netCashProvidedByInvestingActivities", "NetCashProvidedByUsedInInvestingActivities", -20, -20],
  ["netCashProvidedByFinancingActivities", "NetCashProvidedByUsedInFinancingActivities", -20, -20],
  ["netChangeInCash", "CashAndCashEquivalentsPeriodIncreaseDecrease", -20, -20],
] as const;
describe("same-definition cash flow field admission", () => {
  it.each(flows)("withholds contradicted %s, preserving raw observations", (field, tag, sec, expected) => {
    const input = { [field]: -99, netIncome: 100, stockBasedCompensation: 5, capitalExpenditure: -3 };
    const result = admit(tag, [point(sec)], input);
    expect(result.cash[field]).toBeNull();
    expect(result.cash.fieldConflicts?.[field]).toMatchObject({ usable: false, vendorValue: -99, secValue: expected, secEvidence: { periodStart: "2026-02-28", periodEnd: end } });
    expect(result.cashInput.ok && result.cashInput.value.data.rows[0]?.[field]).toBe(-99);
    expect(result.out.cashflow.ok && result.out.cashflow.value.data.raw).toEqual(result.cashInput.ok && result.cashInput.value.data.raw);
    expect(result.cash).toMatchObject({ netIncome: 100, stockBasedCompensation: 5, capitalExpenditure: -3 });
  });
  it.each([0, 20])("accepts signed cash repurchases %i with matching field definition", amount => {
    expect(admit("PaymentsForRepurchaseOfCommonStock", [point(amount)], { commonStockRepurchased: -amount }).cash.fieldConflicts?.commonStockRepurchased).toBeUndefined();
  });
  it.each(["issuer", "currency", "interval", "future", "filing"])("does not manufacture a comparison for incompatible %s", change => {
    const result = admit("PaymentsForRepurchaseOfCommonStock", [point(20, change === "future" ? { filed: "2026-12-01" } : {})], {
      commonStockRepurchased: -99, ...(change === "issuer" ? { cik: "1" } : {}), ...(change === "interval" ? { periodStart: "2026-03-01" } : {}), ...(change === "filing" ? { filingDate: "2026-06-14" } : {}),
    }, {}, change === "currency" ? "EUR" : "USD");
    expect(result.cash.commonStockRepurchased).toBe(-99);
    expect(result.cash.fieldConflicts?.commonStockRepurchased).toBeUndefined();
  });
  it("preserves existing refusal and never treats equity movement or award taxes as cash repurchases", () => {
    const old = { usable: false as const, vendorValue: -99, secValue: null, reason: "Original refusal" };
    expect(admit("PaymentsForRepurchaseOfCommonStock", [point(20)], { commonStockRepurchased: -99, fieldConflicts: { commonStockRepurchased: old } }).cash.fieldConflicts?.commonStockRepurchased).toEqual(old);
    for (const tag of ["TreasuryStockValueAcquiredCostMethod", "PaymentsRelatedToTaxWithholdingForShareBasedCompensation"]) {
      expect(admit(tag, [point(20)], { commonStockRepurchased: -99 }).cash.fieldConflicts?.commonStockRepurchased).toBeUndefined();
    }
  });
  it("keeps the public SIX-MONTH YTD cash controls separate from standalone Q2", () => {
    // Adobe 2026-05-29 10-Q p8, SIX MONTHS; USD millions. This is NOT a quarter.
    expect(5123 - 1240 - 4399 + 4).toBe(-512);
    const result = admit("PaymentsForRepurchaseOfCommonStock", [point(4589, { start: "2025-11-29" })], { commonStockRepurchased: -99 });
    expect(result.cash.fieldConflicts?.commonStockRepurchased).toBeUndefined();
  });
  it("derives standalone repurchases only from compatible cumulative operands", () => {
    const result = admit("PaymentsForRepurchaseOfCommonStock", [point(50, { start: "2025-11-29" }), point(30, { start: "2025-11-29", end: "2026-02-27", filed: "2026-03-15", accn: "prior" })], { commonStockRepurchased: -99 });
    expect(result.cash.fieldConflicts?.commonStockRepurchased).toMatchObject({ secValue: -20, secEvidence: { derivation: "ytd-difference", periodStart: "2026-02-28" } });
  });
  it("refuses cash and dependent liquidity/net-debt fallbacks without changing investments", () => {
    const result = admit("CashAndCashEquivalentsAtCarryingValue", [point(4919, { start: undefined })], {}, { cashAndCashEquivalents: 999, cashAndShortTermInvestments: 1000, shortTermInvestments: 1, netDebt: 10 });
    expect(result.balance).toMatchObject({ cashAndCashEquivalents: null, cashAndShortTermInvestments: null, netDebt: null, shortTermInvestments: 1 });
    expect(result.balance.fieldConflicts?.cashAndCashEquivalents?.secValue).toBe(4919);
    expect(result.balanceInput.ok && result.balanceInput.value.data.rows[0]?.cashAndCashEquivalents).toBe(999);
  });
  it("does not equate cash plus restricted cash with unrestricted balance-sheet cash", () => {
    expect(admit("CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", [point(4919, { start: undefined })], {}, { cashAndCashEquivalents: 999 }).balance.fieldConflicts?.cashAndCashEquivalents).toBeUndefined();
  });
});
