import { describe, expect, it } from "vitest";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";
import { readFileSync } from "node:fs";
import { admittedStatementRow } from "@/providers/fmp";

const at = "2026-10-19T00:00:00Z";
const end = "2026-05-29";
const point = (val: number, extra = {}) => ({ val, start: "2026-02-28", end, filed: "2026-06-15", accn: "0000796343-26-000112", form: "10-Q", fy: 2026, fp: "Q2", ...extra });
function sourced<T extends FmpBalanceSheetRow | FmpCashFlowRow>(rows: T[]): FetchResult<FmpPayload<T>> {
  return { ok: true, value: { data: { rows, raw: structuredClone(rows) }, endpoint: "fixture", source: "fmp", asOf: end, fetchedAt: at } };
}
function admit(tag: string, ps: object[], cash: FmpCashFlowRow = {}, balance: FmpBalanceSheetRow = {}, currency = "USD") {
  const facts: CompanyFacts = { cik: 796343, entityName: "ADOBE INC.", facts: { "us-gaap": { [tag]: { units: { [currency]: ps } } } } };
  const cashInput = sourced<FmpCashFlowRow>([{ cik: "796343", date: end, periodStart: "2026-02-28", reportedCurrency: "USD", ...cash }]);
  const balanceInput = sourced([{ cik: "796343", date: end, reportedCurrency: "USD", ...balance }]);
  const out = enrichFinancialFields(balanceInput, cashInput, facts, "quarter", at);
  if (!out.cashflow.ok || !out.balance.ok) throw Error("retained rows expected");
  return { cash: out.cashflow.value.data.rows[0]!, balance: out.balance.value.data.rows[0]!, out, cashInput, balanceInput };
}
const flows = [
  ["commonStockRepurchased", "PaymentsForRepurchaseOfCommonStock", 20, -20],
  ["netCashProvidedByInvestingActivities", "NetCashProvidedByUsedInInvestingActivities", -20, -20],
  ["netCashProvidedByFinancingActivities", "NetCashProvidedByUsedInFinancingActivities", -20, -20],
] as const;
describe("same-definition cash flow field admission", () => {
  it("keeps refusal dependencies closed after serialization of legacy vendor aliases",()=>{
    const raw={date:end,cashAtEndOfPeriod:2588e6,netChangeInCash:-3744e6,purchasesOfInvestments:-1125e6,salesMaturitiesOfInvestments:688e6,financialAssetCashFlow:-437e6,
      fieldConflicts:{cashAtEndOfPeriod:{usable:false as const,vendorValue:2588e6,secValue:4919e6,reason:"filed cash conflict"},purchasesOfInvestments:{usable:false as const,vendorValue:-1125e6,secValue:null,reason:"investment classification unresolved"}}};
    expect(admittedStatementRow(JSON.parse(JSON.stringify(raw)))).toMatchObject({cashAtEndOfPeriod:null,netChangeInCash:null,purchasesOfInvestments:null,salesMaturitiesOfInvestments:null,financialAssetCashFlow:null});
    expect(raw).toMatchObject({cashAtEndOfPeriod:2588e6,netChangeInCash:-3744e6,financialAssetCashFlow:-437e6});
  });
  it("refuses the retained Q2 ending cash and dependent cash movement using compatible filed cash scopes, without an invented vendor start date", () => {
    const fixture = JSON.parse(readFileSync("fixtures/company-ir/adobe-20261019/q2-cash.json", "utf8"));
    const input = sourced<FmpCashFlowRow>([fixture.vendorRow]);
    expect(fixture.vendorRow.periodStart).toBeUndefined();
    const result = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), input, fixture.companyFacts, "quarter", at);
    expect(result.cashflow).toMatchObject({ ok: true, value: { data: { rows: [{ cashAtBeginningOfPeriod: 6332e6, cashAtEndOfPeriod: null, netChangeInCash: null, fieldConflicts: {
      cashAtEndOfPeriod: { usable: false, vendorValue: 2588e6, secValue: 4919e6 },
      netChangeInCash: { usable: false, vendorValue: -3744e6, secValue: -1413e6 },
    } }] } } });
    expect(input.ok && input.value.data.rows[0]?.cashAtEndOfPeriod).toBe(2588e6);
    expect(result.cashflow.ok && result.cashflow.value.data.raw).toEqual(fixture.vendorRow ? [fixture.vendorRow] : []);
    expect(result.cashflow.ok && result.cashflow.value.data.rows[0]?.fieldConflicts?.netChangeInCash?.secEvidence?.filings).toEqual(expect.arrayContaining([
      expect.objectContaining({filed:"2026-06-15",accn:"0000796343-26-000112"}),expect.objectContaining({filed:"2026-03-25",accn:"0000796343-26-000056"}),
    ]));
  });
  it("does not authorize a Q2 cash movement comparison using only the prior-quarter dependency filing date",()=>{
    const fixture=JSON.parse(readFileSync("fixtures/company-ir/adobe-20261019/q2-cash.json","utf8"));
    fixture.vendorRow.filingDate="2026-03-25";
    const result=enrichFinancialFields(sourced<FmpBalanceSheetRow>([]),sourced<FmpCashFlowRow>([fixture.vendorRow]),fixture.companyFacts,"quarter",at);
    if(!result.cashflow.ok)throw Error("source row");
    const row=result.cashflow.value.data.rows[0]!;
    expect(row).toMatchObject({cashAtBeginningOfPeriod:6332e6,cashAtEndOfPeriod:2588e6,netChangeInCash:-3744e6});
    for(const field of ["cashAtBeginningOfPeriod","cashAtEndOfPeriod","netChangeInCash"])expect(row.fieldConflicts?.[field]).toBeUndefined();
  });
  it("keeps an existing cash refusal authoritative even when only the prior dependency filing matches the vendor date",()=>{
    const fixture=JSON.parse(readFileSync("fixtures/company-ir/adobe-20261019/q2-cash.json","utf8"));
    const old={usable:false as const,vendorValue:2588e6,secValue:null,reason:"earlier source refusal"};
    Object.assign(fixture.vendorRow,{filingDate:"2026-03-25",fieldConflicts:{cashAtEndOfPeriod:old}});
    const result=enrichFinancialFields(sourced<FmpBalanceSheetRow>([]),sourced<FmpCashFlowRow>([fixture.vendorRow]),fixture.companyFacts,"quarter",at);
    if(!result.cashflow.ok)throw Error("source row");
    const row=result.cashflow.value.data.rows[0]!;
    expect(row).toMatchObject({cashAtBeginningOfPeriod:6332e6,cashAtEndOfPeriod:null,netChangeInCash:null});
    expect(row.fieldConflicts?.cashAtEndOfPeriod).toEqual(old);
    expect(row.fieldConflicts?.netChangeInCash).toMatchObject({usable:false,secValue:null});
    expect(row.fieldConflicts?.netChangeInCash?.secEvidence).toBeUndefined();
  });
  it.each(["issuer", "currency", "interval", "filing", "future", "restricted-scope", "ambiguous"])("does not invent a cash comparison for incompatible %s evidence", change => {
    const f = JSON.parse(readFileSync("fixtures/company-ir/adobe-20261019/q2-cash.json", "utf8"));
    const row = f.vendorRow;
    if(change === "issuer")row.cik="1";
    if(change === "currency")row.reportedCurrency="EUR";
    if(change === "interval")row.periodStart="2026-03-01";
    if(change === "filing")row.filingDate="2026-06-14";
    const points=f.companyFacts.facts["us-gaap"].CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents.units.USD;
    if(change === "future")points.forEach((p:{filed:string})=>p.filed="2026-12-01");
    if(change === "restricted-scope")points.find((p:{end:string})=>p.end===end).val+=100e6;
    if(change === "ambiguous")points.push({...points.find((p:{end:string})=>p.end===end),val:5555e6});
    const result=enrichFinancialFields(sourced<FmpBalanceSheetRow>([]),sourced<FmpCashFlowRow>([row]),f.companyFacts,"quarter",at);
    expect(result.cashflow).toMatchObject({ok:true,value:{data:{rows:[{cashAtEndOfPeriod:2588e6,netChangeInCash:-3744e6}]}}});
  });
  it.each(["cashAtBeginningOfPeriod","cashAtEndOfPeriod"])("preserves a prior %s refusal and withholds dependent cash movement even without new facts", field => {
    const refusal={usable:false as const,vendorValue:100,secValue:null,reason:"preserved refusal"};
    const result=admit("UnrelatedTag",[],{cashAtBeginningOfPeriod:100,cashAtEndOfPeriod:80,netChangeInCash:-20,fieldConflicts:{[field]:refusal}});
    expect(result.cash[field]).toBeNull();expect(result.cash.netChangeInCash).toBeNull();expect(result.cash.fieldConflicts?.[field]).toEqual(refusal);
  });
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
  it("does not compare net cash movement against an FX-excluding or unknown cash definition", () => {
    expect(admit("CashAndCashEquivalentsPeriodIncreaseDecrease", [point(-516)], { netChangeInCash: -512 }).cash.fieldConflicts?.netChangeInCash).toBeUndefined();
    expect(admit("CashAndCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect", [point(-512)], { netChangeInCash: -99 }).cash.fieldConflicts?.netChangeInCash).toBeUndefined();
  });
  it("compares cash movement only when its FX-inclusive definition and both unrestricted instants agree", () => {
    const f: CompanyFacts = { cik: 796343, entityName: "ADOBE INC.", facts: { "us-gaap": {
      CashAndCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect: { units: { USD: [point(-20)] } },
      CashAndCashEquivalentsAtCarryingValue: { units: { USD: [point(80, { start: undefined }), point(100, { start: undefined, end: "2026-02-27" })] } },
    } } };
    const cash = sourced<FmpCashFlowRow>([{ cik: "796343", date: end, periodStart: "2026-02-28", reportedCurrency: "USD", cashAtBeginningOfPeriod: 100, cashAtEndOfPeriod: 80, netChangeInCash: -99 }]);
    const result = enrichFinancialFields(sourced<FmpBalanceSheetRow>([]), cash, f, "quarter", at);
    expect(result.cashflow).toMatchObject({ ok: true, value: { data: { rows: [{ netChangeInCash: null, fieldConflicts: { netChangeInCash: { usable: false, vendorValue: -99, secValue: -20 } } }] } } });
  });
});
