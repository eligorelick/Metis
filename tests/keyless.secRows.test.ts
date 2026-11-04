import { describe, expect, it } from "vitest";
import { applyKeylessFallbacks, type KeylessInputs } from "@/pipeline/keyless";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { YahooClient } from "@/providers/yahoo";
import { runStageB, ttmIncome } from "@/pipeline/compute";

const at = "2026-07-06T00:00:00.000Z";
const sourced = <T>(data:T) => ({ok:true as const,value:{data,source:"edgar" as const,endpoint:"retained",asOf:"2026-06-30",fetchedAt:at}});
function inputs(scope:"annual"|"quarter" = "annual"): KeylessInputs {
  const b=completeCurrencyBundle({});
  const end=scope==="annual"?"2025-12-31":"2025-09-30", start=scope==="annual"?"2025-01-01":"2025-07-01";
  const p=(val:number,instant=false)=>({val,start:instant?undefined:start,end,accn:"0000000001-26-000001",filed:"2026-02-01",form:scope==="annual"?"10-K":"10-Q",fy:2025,fp:scope==="annual"?"FY":"Q3"});
  const facts:CompanyFacts={cik:1,entityName:"Example",facts:{"us-gaap":Object.fromEntries(Object.entries({Assets:900e6,Revenues:506865000,CostsAndExpenses:389338000,OperatingIncomeLoss:117527000,NetIncomeLoss:100e6,EarningsPerShareDiluted:0.34,WeightedAverageNumberOfDilutedSharesOutstanding:294117647,NetCashProvidedByUsedInOperatingActivities:50e6,PaymentsToAcquirePropertyPlantAndEquipment:5e6}).map(([tag,v])=>[tag,{units:{[tag.includes("PerShare")?"USD/shares":tag.includes("Shares")?"shares":"USD"]:[p(v,tag==="Assets")]}}]))}};
  const row={date:end,periodStart:start,period:scope==="annual"?"FY":"Q3",fiscalYear:"2025",cik:"1",reportedCurrency:"USD",revenue:457211000,costAndExpenses:291046000,operatingIncome:166165000,epsDiluted:0.21,weightedAverageShsOutDil:588235294,vendorOnly:123};
  const income={ok:true as const,value:{...b.statements.incomeAnnual.ok&&b.statements.incomeAnnual.value,data:{rows:[row],raw:[row]}}};
  const cashflow={ok:true as const,value:{...income.value,data:{rows:[{...row,operatingCashFlow:10e6,netCashProvidedByOperatingActivities:10e6,capitalExpenditure:-8e6,freeCashFlow:2e6}],raw:[]}}};
  const failed=async()=>({ok:false as const,gap:{field:"offline",reason:"offline",severity:"info" as const}});
  return {symbol:b.symbol,today:at.slice(0,10),eodFrom:"2020-01-01",sectorEtfSymbol:null,fmpKeyless:false,statementSource:"auto",edgarConfirmedIssuer:true,annualPeriods:10,quarterlyPeriods:24,now:()=>new Date(at),resolveSectorEtf:()=>null,
    fmp:{...b.statements,[scope==="annual"?"incomeAnnual":"incomeQuarterly"]:income,[scope==="annual"?"cashflowAnnual":"cashflowQuarterly"]:cashflow,profile:b.profile,quote:b.quote,eodPrices:b.eodPrices,spy:b.benchmarkPrices.spy,sectorEtf:b.benchmarkPrices.sectorEtf,enterpriseValues:b.enterpriseValues,marketCapHistory:b.marketCapHistory,sharesFloat:b.sharesFloat},
    edgar:{cik:sourced({cik:1,cik10:"0000000001",ticker:b.symbol,title:"Example"}),registrant:{cik10:"0000000001",name:"Example",tickers:[b.symbol],exchanges:["NYSE"],sic:"3571",sicDescription:"Computers",stateOfIncorporation:"DE",fiscalYearEnd:"1231",forms:["10-K","10-Q"]},companyFacts:sourced(facts)},
    yahoo:{dailyHistory:failed,meta:failed,quote:failed,splitHistory:async()=>sourced({status:"retrieved",source:"retained splits",events:[],coverage:[{from:"2020-01-01",to:"2026-07-06"}]})} as unknown as YahooClient};
}
describe("N3 whole filed statement rows",()=>{
  it("withholds an unreconciled parent total without calling a contract-revenue note the consolidated total", async () => {
    const i = inputs("quarter");
    if (!i.edgar.companyFacts.ok) throw Error("fixture");
    const f = i.edgar.companyFacts.value.data.facts["us-gaap"]!;
    f.RevenueFromContractWithCustomerIncludingAssessedTax = f.Revenues;
    delete f.Revenues;
    delete f.CostsAndExpenses;
    const out = await applyKeylessFallbacks(i);
    expect(out.members.incomeQuarterly.ok && out.members.incomeQuarterly.value.data.rows[0]!.revenue).toBeNull();
    expect(out.gaps.find(g => g.field === "statements.income.2025-09-30.revenue")?.reason)
      .toMatch(/contract.revenue.*not established as consolidated/i);
  });
  it.each(["annual","quarter"] as const)("switches a reconciled %s row including its EPS, without vendor-only fields",async scope=>{
    const i=inputs(scope), original=structuredClone(i.fmp);
    const out=await applyKeylessFallbacks(i), member=scope==="annual"?"incomeAnnual":"incomeQuarterly";
    const row=out.members[member];
    expect(row.ok&&row.value.data.rows[0]).toMatchObject({revenue:506865000,operatingIncome:117527000,epsDiluted:0.34,source:"edgar",sourceFetchedAt:at});
    expect(row.ok&&row.value.data.rows[0]).not.toHaveProperty("vendorOnly");
    expect(out.gaps.some(g=>g.field===`statements.sourceSwitch.${member}.2025-${scope==="annual"?"12-31":"09-30"}`&&/457211000.*506865000.*0000000001-26-000001/.test(g.reason))).toBe(true);
    expect(i.fmp).toEqual(original);
  });
  it("switches the entire quarterly cash-flow row on a filed CFO conflict",async()=>{
    const out=await applyKeylessFallbacks(inputs("quarter"));
    expect(out.members.cashflowQuarterly).toMatchObject({ok:true,value:{data:{rows:[{operatingCashFlow:50e6,capitalExpenditure:-5e6,freeCashFlow:45e6,source:"edgar"}]}}});
  });
  it("switches when only the vendor CFO alias conflicts with the filed quarter",async()=>{
    const i=inputs("quarter");
    if(!i.fmp.cashflowQuarterly.ok)throw Error("fixture");
    i.fmp.cashflowQuarterly.value.data.rows[0]!.operatingCashFlow=50e6;
    const out=await applyKeylessFallbacks(i);
    expect(out.members.cashflowQuarterly).toMatchObject({ok:true,value:{data:{rows:[{operatingCashFlow:50e6,source:"edgar",capitalExpenditure:-5e6}]}}});
    expect(out.gaps.find(g=>g.field.startsWith("statements.sourceSwitch.cashflowQuarterly"))?.reason).toMatch(/netCashProvidedByOperatingActivities.*10000000/);
  });
  it("keeps runway withheld when the switched SEC row has no canonical capex",async()=>{
    const i=inputs("quarter");
    if(!i.edgar.companyFacts.ok||!i.fmp.cashflowQuarterly.ok)throw Error("fixture");
    delete i.edgar.companyFacts.value.data.facts["us-gaap"]!.PaymentsToAcquirePropertyPlantAndEquipment;
    i.fmp.cashflowQuarterly.value.data.rows.push({date:"2025-06-30",reportedCurrency:"USD",operatingCashFlow:-10e6,capitalExpenditure:-1e6});
    const out=await applyKeylessFallbacks(i);
    const b=completeCurrencyBundle({burning:true});
    b.statements.cashflowQuarterly=out.members.cashflowQuarterly;
    const result=runStageB(b);
    expect(result.runway?.runwayQuarters).toBeNull();
    expect(result.runway?.gaps.some(g=>g.field==="runway.cashInvestmentScope")).toBe(true);
    expect(out.members.cashflowQuarterly.ok&&out.members.cashflowQuarterly.value.data.rows[0]!.capitalExpenditure).toBeNull();
  });
  it("does not switch a CFO quarter whose earlier YTD operand was only filed after its minuend",async()=>{
    const i=inputs("quarter");
    if(!i.edgar.companyFacts.ok)throw Error("fixture");
    const f=i.edgar.companyFacts.value.data;
    (f.facts["us-gaap"]!.Assets as {units:{USD:unknown[]}}).units.USD.push({val:800e6,end:"2025-06-30",form:"10-Q",filed:"2025-08-01",accn:"0000000001-25-000002",fy:2025,fp:"Q2"});
    (f.facts["us-gaap"]!.Revenues as {units:{USD:unknown[]}}).units.USD.push({val:700e6,start:"2025-01-01",end:"2025-09-30",form:"10-Q",filed:"2025-11-01",accn:"0000000001-25-000003",fy:2025,fp:"Q3"});
    f.facts["us-gaap"]!.NetCashProvidedByUsedInOperatingActivities={units:{USD:[
      {val:50e6,start:"2025-01-01",end:"2025-09-30",form:"10-Q",filed:"2025-11-01",accn:"0000000001-25-000003",fy:2025,fp:"Q3"},
      {val:20e6,start:"2025-01-01",end:"2025-06-30",form:"10-Q",filed:"2026-02-01",accn:"0000000001-26-000002",fy:2026,fp:"Q2"},
    ]}};
    const out=await applyKeylessFallbacks(i);
    expect(out.members.cashflowQuarterly.ok&&out.members.cashflowQuarterly.value.data.rows[0]!.operatingCashFlow).toBe(10e6);
    expect(out.gaps.some(g=>g.field.startsWith("statements.sourceSwitch.cashflowQuarterly"))).toBe(false);
  });
  it("admits the issuer's directly filed gross-profit less operating-expenses path",async()=>{
    const i=inputs();
    if(!i.edgar.companyFacts.ok)throw Error("fixture");
    const f=i.edgar.companyFacts.value.data.facts["us-gaap"]!;
    const p=(val:number)=>({val,start:"2025-01-01",end:"2025-12-31",form:"10-K",filed:"2026-02-01",accn:"0000000001-26-000001",fy:2025,fp:"FY"});
    delete f.CostsAndExpenses;
    f.GrossProfit={units:{USD:[p(160e6)]}}; f.OperatingExpenses={units:{USD:[p(42473000)]}};
    const out=await applyKeylessFallbacks(i);
    expect(out.members.incomeAnnual.ok&&out.members.incomeAnnual.value.data.rows[0]).toMatchObject({source:"edgar",operatingIncome:117527000,grossProfit:160e6,operatingExpenses:42473000});
  });
  it.each([true,false])("respects derived CFO operand rounding (within allowance=%s)",async within=>{
    const i=inputs("quarter");
    if(!i.edgar.companyFacts.ok||!i.fmp.cashflowQuarterly.ok)throw Error("fixture");
    const f=i.edgar.companyFacts.value.data;
    (f.facts["us-gaap"]!.Assets as {units:{USD:unknown[]}}).units.USD.push({val:800e6,end:"2025-06-30",form:"10-Q",filed:"2025-08-01",accn:"0000000001-25-000002",fy:2025,fp:"Q2"});
    (f.facts["us-gaap"]!.Revenues as {units:{USD:unknown[]}}).units.USD.push({val:700e6,start:"2025-01-01",end:"2025-09-30",form:"10-Q",filed:"2025-11-01",accn:"0000000001-25-000003",fy:2025,fp:"Q3"});
    f.facts["us-gaap"]!.NetCashProvidedByUsedInOperatingActivities={units:{USD:[
      {val:150e6,start:"2025-01-01",end:"2025-09-30",form:"10-Q",filed:"2025-11-01",accn:"0000000001-25-000003",fy:2025,fp:"Q3"},
      {val:100e6,start:"2025-01-01",end:"2025-06-30",form:"10-Q",filed:"2025-08-01",accn:"0000000001-25-000002",fy:2025,fp:"Q2"},
    ]}};
    const row=i.fmp.cashflowQuarterly.value.data.rows[0]!;
    row.operatingCashFlow=within?50.4e6:52e6;row.netCashProvidedByOperatingActivities=row.operatingCashFlow;
    const out=await applyKeylessFallbacks(i);
    expect(out.members.cashflowQuarterly.ok&&out.members.cashflowQuarterly.value.data.rows[0]!.source).toBe(within?undefined:"edgar");
  });
  it("sums SEC EPS for a switched quarter and discloses a mixed whole-row TTM window",async()=>{
    const i=inputs("quarter");
    if(!i.fmp.incomeQuarterly.ok)throw Error("fixture");
    i.fmp.incomeQuarterly.value.data.rows.push(...["2025-06-30","2025-03-31","2024-12-31"].map(date=>({date,reportedCurrency:"USD",revenue:100e6,epsDiluted:0.1})));
    const out=await applyKeylessFallbacks(i);
    if(!out.members.incomeQuarterly.ok)throw Error("fixture");
    expect(ttmIncome(out.members.incomeQuarterly.value.data.rows)?.epsDiluted).toBeCloseTo(0.64);
    expect(out.gaps.some(g=>g.field==="statements.sourceSwitch.ttm.incomeQuarterly"&&/2025-09-30 edgar/.test(g.reason))).toBe(true);
  });
  it.each(["unreconciled","currency","period","issuer","fmp","bank"])("keeps the original row when %s prevents admission",async reason=>{
    const i=inputs();
    if(!i.edgar.companyFacts.ok||!i.fmp.incomeAnnual.ok)throw Error("fixture");
    if(reason==="unreconciled")(i.edgar.companyFacts.value.data.facts["us-gaap"]!.CostsAndExpenses as {units:{USD:{val:number}[]}}).units.USD[0]!.val=100e6;
    if(reason==="currency")i.fmp.incomeAnnual.value.data.rows[0]!.reportedCurrency="EUR";
    if(reason==="period")i.fmp.incomeAnnual.value.data.rows[0]!.periodStart="2025-02-01";
    if(reason==="issuer")i.edgarConfirmedIssuer=false;
    if(reason==="fmp")i.statementSource="fmp";
    if(reason==="bank")i.edgar.registrant!.sic="6021";
    const out=await applyKeylessFallbacks(i);
    expect(out.members.incomeAnnual.ok&&out.members.incomeAnnual.value.data.rows[0]!.revenue).toBe(457211000);
    expect(out.gaps.some(g=>g.field.startsWith("statements.sourceSwitch.incomeAnnual"))).toBe(false);
  });
});
