import { describe, expect, it } from "vitest";
import { corroborateOperatingIncome } from "@/edgar/revenueAdmission";
import { operatingIncomeForNonMargins, withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import type { FmpIncomeStatementRow, StatementFieldProvenance } from "@/providers/fmp";

const proof: StatementFieldProvenance = {source:"edgar",unit:"USD",periodStart:"2025-01-01",periodEnd:"2025-12-31",observedAt:"2026-03-01",tags:["us-gaap/Revenues"],filings:[{accn:"annual",filed:"2026-02-01",form:"10-K"}]};
const line=(value:number,tag:string)=>({value,proof:{...proof,tags:[`us-gaap/${tag}`]}});
const pensionTag="NetPeriodicDefinedBenefitsExpenseReversalOfExpenseExcludingServiceCostComponent";
function costs(vendor=200): FmpIncomeStatementRow {
 return {date:proof.periodEnd,periodStart:proof.periodStart!,reportedCurrency:"USD",revenue:1000,operatingIncome:vendor,
  incomeBeforeTax:200,fieldProvenance:{revenue:proof,incomeBeforeTax:line(200,"IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest").proof},
  filedIncomeLines:{CostsAndExpenses:line(800,"CostsAndExpenses"),InterestExpense:line(10,"InterestExpense")}};
}
describe("complete scoped operating proof",()=>{
 it("refuses partial costs when pretax completeness is missing",()=>{
  const row=costs();delete row.incomeBeforeTax;delete row.fieldProvenance!.incomeBeforeTax;
  row.filedIncomeLines!.CostsAndExpenses=line(300,"CostsAndExpenses");
  expect(corroborateOperatingIncome(row,row).operatingIncome).toBeUndefined();
 });
 it("does not add interest back without evidence that costs include it",()=>{
  const row=costs();
  expect(corroborateOperatingIncome(row,row).operatingIncome).toBeUndefined();
 });
 it("withholds a standalone provider result contradicted by complete expenses when operating scope remains unresolved",()=>{
  const row=costs(400);row.nonMarginOperatingIncome=400;
  const out=corroborateOperatingIncome(row,row);
  expect(out.operatingIncome).toBeUndefined();
  expect(operatingIncomeForNonMargins(out)).toBeNull();
  expect(out.fieldConflicts?.operatingIncome?.cause).toBe("operating-scope");
 });
 it.each(["pretax currency","pretax filing","pretax missing proof"])("requires filed completeness on the common basis: %s",mode=>{
  const row=costs();row.filedIncomeLines!.OperatingExpenses=line(790,"OperatingExpenses");
  if(mode==="pretax currency")row.fieldProvenance!.incomeBeforeTax!.unit="EUR";
  if(mode==="pretax filing")row.fieldProvenance!.incomeBeforeTax!.filings=[{accn:"other",filed:"2026-02-02",form:"10-K"}];
  if(mode==="pretax missing proof")delete row.fieldProvenance!.incomeBeforeTax;
  expect(corroborateOperatingIncome(row,row).operatingIncome).toBeUndefined();
 });
 it("replaces a contradicted tag when the independent operating subtotal and interest membership prove the replacement",()=>{
  const row=costs();row.filedIncomeLines!.OperatingExpenses=line(790,"OperatingExpenses");
  row.filedIncomeLines!.OperatingIncomeLoss=line(400,"OperatingIncomeLoss");row.nonMarginOperatingIncome=400;
  const out=corroborateOperatingIncome(row,row);
  expect(out.operatingIncome).toBe(210);expect(operatingIncomeForNonMargins(out)).toBe(210);
 });
 it.each([230,210,300])("excludes evidenced nonservice expense consistently, independent of vendor %s",vendor=>{
  const row=costs(vendor);row.filedIncomeLines!.OperatingExpenses=line(770,"OperatingExpenses");
  row.filedIncomeLines![pensionTag]=line(20,pensionTag);
  const out=corroborateOperatingIncome(row,row);
  expect(out.operatingIncome).toBe(230);expect(out.fieldProvenance?.operatingIncome?.tags).toContain(`us-gaap/${pensionTag}`);
 });
 it("accepts a derived Q4 numerator with the supporting FY/YTD lineage even beside a direct Q4 revenue",()=>{
  const row: FmpIncomeStatementRow={...costs(80),periodStart:"2025-10-01",revenue:300,fieldProvenance:{revenue:{...proof,periodStart:"2025-10-01"}},filedIncomeLines:{}};
  const sec: FmpIncomeStatementRow={...row,operatingIncome:60,fieldProvenance:{...row.fieldProvenance,operatingIncome:{...proof,periodStart:"2025-10-01",tags:["us-gaap/OperatingIncomeLoss"],derivation:"fy-minus-ytd",filings:[...proof.filings,{accn:"nine-months",filed:"2025-11-01",form:"10-Q"}]}}};
  expect(corroborateOperatingIncome(row,sec).operatingIncome).toBe(60);
 });
});
it("checks a disproved derived numerator even when revenue did not request review",()=>{
 const b=completeCurrencyBundle({debt:300,siblingQuarterCurrencies:["USD","USD","USD","USD"]});
 if(!b.statements.incomeQuarterly.ok)throw Error("fixture");
 const r=b.statements.incomeQuarterly.value.data.rows.find(r=>r.date==="2025-12-31")!;
 Object.assign(r,{cik:"42",periodStart:"2025-10-01",filingDate:"2026-02-01",operatingIncome:80*M});
 b.statements.incomeQuarterly.value.data.raw=structuredClone(b.statements.incomeQuarterly.value.data.rows);
 const fy={start:"2025-01-01",end:"2025-12-31",filed:"2026-02-01",accn:"annual",form:"10-K",fy:2025,fp:"FY"};
 const ytd={...fy,end:"2025-09-30",filed:"2025-11-01",accn:"nine-months",form:"10-Q",fp:"Q3"};
 const facts={cik:42,entityName:"Synthetic",facts:{"us-gaap":{
  Revenues:{units:{USD:[{...fy,val:1000*M},{...ytd,val:700*M},{...ytd,start:"2025-07-01",val:250*M},{...fy,start:"2025-10-01",val:300*M}]}},
  OperatingIncomeLoss:{units:{USD:[{...fy,val:200*M},{...ytd,val:160*M}]}}
 }}};
 const out=withIncomeOperatingBasis(withIssuerFacts(b,facts)).statements.incomeQuarterly;if(!out.ok)throw Error("fixture");
 expect(out.value.data.rows.find(r=>r.date==="2025-12-31")?.operatingIncome).toBe(40*M);
});
it("checks the filed insurance expense total before admitting a tagged adjusted result",()=>{
 const b=completeCurrencyBundle({});if(!b.statements.incomeAnnual.ok)throw Error("fixture");
 const row=b.statements.incomeAnnual.value.data.rows[0]!;row.cik="42";row.filingDate="2026-02-01";row.periodStart="2025-01-01";
 const point={start:"2025-01-01",end:"2025-12-31",filed:"2026-02-01",accn:"annual",form:"10-K",fy:2025,fp:"FY"};
 const facts={cik:42,entityName:"Synthetic",facts:{"us-gaap":Object.fromEntries(Object.entries({Revenues:1000,BenefitsLossesAndExpenses:800,InterestAndDebtExpense:10,OperatingIncomeLoss:400,IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest:200}).map(([tag,value])=>[tag,{units:{USD:[{...point,val:value*M}]}}]))}};
 const out=withIncomeOperatingBasis(withIssuerFacts(b,facts)).statements.incomeAnnual;if(!out.ok)throw Error("fixture");
 expect(operatingIncomeForNonMargins(out.value.data.rows[0])).toBeNull();
});
