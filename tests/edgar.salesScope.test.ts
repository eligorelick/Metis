import { describe, expect, it } from "vitest";
import { admitRevenue, admitRevenueGrossProfit, operatingRevenuePolicy } from "@/edgar/revenueAdmission";
import type { FmpIncomeStatementRow, StatementFieldProvenance } from "@/providers/fmp";
const M=1e6;
const proof:StatementFieldProvenance={source:"edgar",unit:"USD",periodStart:"2025-01-01",periodEnd:"2025-12-31",observedAt:"2026-03-01",tags:["us-gaap/Revenues"],filings:[{accn:"annual",filed:"2026-02-01",form:"10-K"}]};
const line=(value:number,tag:string)=>({value:value*M,proof:{...proof,tags:[`us-gaap/${tag}`]}});
const row=(revenue:number):FmpIncomeStatementRow=>({date:proof.periodEnd,periodStart:proof.periodStart!,period:"FY",fiscalYear:"2025",cik:"42",reportedCurrency:"USD",filingDate:"2026-02-01",revenue:revenue*M});
const facts={cik:42,entityName:"Synthetic",facts:{"us-gaap":{}}};
describe("evidenced sales scope",()=>{
 it.each([2000,2002,2050])("does not let an old unsupported anomaly refuse a later total (vendor %s)",vendor=>{
  const old={...row(900),filedIncomeLines:{SalesRevenueNet:line(900,"SalesRevenueNet"),Revenues:line(1000,"Revenues")}};
  const policy=operatingRevenuePolicy([old]);
  const r=row(vendor),sec={...row(2000),fieldProvenance:{revenue:proof},filedIncomeLines:{Revenues:line(2000,"Revenues")}};
  const out=admitRevenue(r,sec,[],{rows:[r],raw:[r]},facts,"annual",policy);
  expect(out.row.revenue).toBe(2000*M);
 });
 it.each([1100,1101])("refuses an unsupported broader total even when vendor %s agrees",vendor=>{
  const r=row(vendor),sec={...row(1100),fieldProvenance:{revenue:proof},filedIncomeLines:{Revenues:line(1100,"Revenues")}};
  const out=admitRevenue(r,sec,[],{rows:[r],raw:[r]},facts,"annual",{sales:true,salesTags:["SalesRevenueNet"]});
  expect(out.row.revenue).toBeUndefined();expect(out.row.fieldConflicts?.revenue?.usable).toBe(false);
 });
 it.each([1000,1001])("admits an independently tied total in a sales series regardless of vendor rounding (%s)",vendor=>{
  const r=row(vendor),sec={...row(1000),fieldProvenance:{revenue:proof},filedIncomeLines:{Revenues:line(1000,"Revenues"),GrossProfit:line(400,"GrossProfit"),CostOfRevenue:line(600,"CostOfRevenue")}};
  const out=admitRevenue(r,sec,[],{rows:[r],raw:[r]},facts,"annual",{sales:true,salesTags:["SalesRevenueNet"]});
  expect(out.row.revenue).toBe(vendor*M);expect(out.row.fieldConflicts?.revenue?.usable).toBe(true);
 });
 it("does not manufacture filed gross profit from a retained vendor classification",()=>{
  const r={...row(1000),grossProfit:400*M,fieldProvenance:{revenue:proof}};
  const out=admitRevenueGrossProfit(r,{...row(1000),fieldProvenance:{revenue:proof}},[r]);
  expect(out.grossProfit).toBeUndefined();expect(out.fieldConflicts?.grossProfit?.usable).toBe(false);
 });
 it("emits no unchanged-row revenue gap or claim about a nonexistent broader total",()=>{
  const r=row(1000),sec={...r,fieldProvenance:{revenue:proof},filedIncomeLines:{Revenues:line(1000,"Revenues")}};
  const out=admitRevenue(r,sec,[],{rows:[r],raw:[r]},facts,"annual");
  expect(out.gaps).toEqual([]);expect(out.row.fieldConflicts?.revenue?.reason).not.toMatch(/broader total/);
 });
});
