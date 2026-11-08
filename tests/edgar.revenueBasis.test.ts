import { fundamentalsChartDataFromBundle } from "@/components/charts/map";
import type { DataBundle } from "@/pipeline/types";
import { describe, expect, it } from "vitest";
import { enrichIncomeClassification } from "@/edgar/incomeClassification";
import { withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import { runStageB } from "@/pipeline/compute";
import { getConcept, type CompanyFacts } from "@/edgar/xbrl";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import type { FmpIncomeStatementRow, StatementFieldProvenance } from "@/providers/fmp";
import { admitRevenueGrossProfit, corroborateOperatingIncome, operatingRevenuePolicy, replayIncomeObservations } from "@/edgar/revenueAdmission";
import { parseOperatingRevenueBridge } from "@/edgar/currentReports";

const at = "2026-07-06T00:00:00Z";
function bundle() {
  const b = completeCurrencyBundle({ debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  const concepts: Record<string, { units: { USD: Record<string, unknown>[] } }> = {};
  for (const [name, annual] of [["incomeAnnual", true], ["incomeQuarterly", false]] as const) {
    const input = b.statements[name]; if (!input.ok) throw Error("fixture");
    for (const row of input.value.data.rows) {
      row.cik = "42";
      row.incomeBeforeTax=row.revenue!*0.1+row.operatingIncome!-row.interestExpense!;
      const end = row.date!, year = end.slice(0,4), month = Number(end.slice(5,7));
      const start = annual ? `${year}-01-01` : `${year}-${String(month-2).padStart(2,"0")}-01`;
      row.periodStart = start;
      row.filingDate = new Date(Date.parse(end)+32*86400000).toISOString().slice(0,10);
      const header = {start,end,filed:row.filingDate,accn:`${name}-${end}`,form:annual||month===12?"10-K":"10-Q",fy:Number(year),fp:annual?"FY":`Q${month/3}`};
      for (const [tag,val] of Object.entries({Revenues:row.revenue!*1.1,RevenueFromContractWithCustomerExcludingAssessedTax:row.revenue!,SalesRevenueNet:row.revenue!,GrossProfit:row.revenue!*0.4,CostOfRevenue:row.revenue!*0.6,CostsAndExpenses:row.revenue!-row.operatingIncome!+row.interestExpense!,InterestExpense:row.interestExpense!,OperatingExpenses:row.revenue!-row.operatingIncome!,IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest:row.revenue!*0.1+row.operatingIncome!-row.interestExpense!})) {
        (concepts[tag] ??= {units:{USD:[]}}).units.USD.push({...header,val});
      }
    }
    input.value.data.raw = structuredClone(input.value.data.rows);
  }
  return withIssuerFacts(b,{cik:42,entityName:"Synthetic",facts:{"us-gaap":concepts}} as CompanyFacts);
}
function annual(extra: Record<string, number>, vendor = 1000) {
  const b=bundle(), input=b.statements.incomeAnnual; if(!input.ok)throw Error("fixture");
  const row = input.value.data.rows[0]!; input.value.data.rows=[{...row,revenue:vendor*M}]; input.value.data.raw=structuredClone(input.value.data.rows);
  const f:CompanyFacts={cik:42,entityName:"Synthetic",facts:{"us-gaap":Object.fromEntries(Object.entries(extra).map(([tag,val])=>[tag,{units:{USD:[{start:"2025-01-01",end:"2025-12-31",val:val*M,accn:"filed",filed:row.filingDate!,form:"10-K",fy:2025,fp:"FY"}]}}]))}};
  return {input,f};
}
const first=(b:ReturnType<typeof bundle>,name:"incomeAnnual"|"incomeQuarterly")=>{const m=withIncomeOperatingBasis(b).statements[name];if(!m.ok)throw Error("fixture");return m.value.data.rows[0]!;};

describe("primary statements corroborating broadly named operating revenue", () => {
 const primaryStatement = (proof: StatementFieldProvenance, revenue: number) => ({
  periodEnd: proof.periodEnd, months: 12, revenue, totalIncome: revenue, operatingIncome: revenue * 0.2, pretax: revenue * 0.2,
  components: [{ label: "Revenues", role: "sales", value: revenue }], roundingResidual: 0, scale: M,
  proof: { ...proof, calculation: "complete-operating-reconciliation" as const,
   documents: proof.filings.map(f => ({ accession: f.accn, filed: f.filed, form: f.form, url: "https://www.sec.gov/Archives/edgar/data/42/annual.htm" })) },
 });
 it.each(["same", "currency", "duration", "filing", "amount", "sales-only bridge", "other document", "net-zero other income"])("inherits only a matching filed revenue concept (%s)", mode => {
  const proof = { source: "edgar" as const, unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31", observedAt: at,
   tags: ["us-gaap/Revenues"], filings: [{ accn: "annual", filed: "2026-02-01", form: "10-K" }] };
  const primary = { value: 1000 * M, role: "operating-sales" as const, proof };
  const revenue = { value: (mode === "amount" ? 1100 : 1000) * M, proof: { ...proof,
   unit: mode === "currency" ? "EUR" : "USD", periodStart: mode === "duration" ? "2025-04-01" : proof.periodStart,
   filings: mode === "filing" ? [{ accn: "other", filed: "2026-03-01", form: "10-K" }] : proof.filings } };
  const bound = primaryStatement(proof, 1000 * M);
  if (mode === "other document") bound.proof.documents[0]!.accession = "unrelated-filing";
  if (mode === "net-zero other income") bound.components.push({ label: "Total revenue and other income", role: "income-total", value: 1000 * M });
  const policy = operatingRevenuePolicy([{ ...(mode === "sales-only bridge" ? {} : { primaryIncomeProof: bound }), filedIncomeLines: { "primary-sales": primary, Revenues: revenue } }]);
  expect(policy.salesTags.includes("Revenues")).toBe(mode === "same");
 });

 it("does not promote a broad concept contradicted by another retained sales presentation", () => {
  const proof = { source: "edgar" as const, unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31", observedAt: at,
   tags: ["us-gaap/Revenues"], filings: [{ accn: "annual", filed: "2026-02-01", form: "10-K" }] };
  const row = (sales: number) => ({ primaryIncomeProof: primaryStatement(proof, sales * M), filedIncomeLines: {
   "primary-sales": { value: sales * M, role: "operating-sales" as const, proof }, Revenues: { value: 1000 * M, proof },
  } });
  expect(operatingRevenuePolicy([row(1000), row(900)]).salesTags).not.toContain("Revenues");
 });

 it("retains annual history and scoring when a quarterly primary statement confirms the Revenues concept", () => {
  const b = bundle(); if (!b.edgar.companyFacts.ok) throw Error("fixture");
  const concepts = b.edgar.companyFacts.value.data.facts["us-gaap"]!;
  const sales = structuredClone(concepts.SalesRevenueNet) as { units: { USD: Record<string, unknown>[] } };
  concepts.Revenues = sales;
  for (const tag of ["SalesRevenueNet", "RevenueFromContractWithCustomerExcludingAssessedTax", "GrossProfit", "CostsAndExpenses", "OperatingExpenses", "InterestExpense"]) delete concepts[tag];
  concepts.SellingGeneralAndAdministrativeExpense = { units: { USD: sales.units.USD.map(p => ({ ...p, val: Number(p.val) * 0.2 })) } };
  concepts.OtherNonoperatingIncomeExpense = { units: { USD: sales.units.USD.map(p => ({ ...p, val: 10 * M })) } };
  concepts.IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest = {
   units: { USD: sales.units.USD.map(p => ({ ...p, val: Number(p.val) * 0.2 + 10 * M })) },
  };
  const text = "CONSOLIDATED STATEMENTS OF OPERATIONS (in millions of USD) Three Months Ended March 31, 2026 2025 Revenues $300 $280 Cost of sales 180 168 Selling, general and administrative expense 60 56 Other (income) expense (10) (8) Income before income taxes 70 64";
  b.edgar.tenQNotes = { ok: true, value: { source: "edgar", endpoint: "synthetic", fetchedAt: at, asOf: "2026-03-31", data: {
   sectionName: "tenQNotes", text, statementsText: text, chars: text.length, method: "header-regex", accession: "incomeQuarterly-2026-03-31",
   filingDate: "2026-05-02", reportDate: "2026-03-31", form: "10-Q", documentUrl: "https://www.sec.gov/Archives/edgar/data/42/quarter.htm",
  } } };
  const before = JSON.stringify(b);
  expect(first(b, "incomeQuarterly").primaryIncomeProof?.revenue).toBe(300 * M);
  const row = first(b, "incomeAnnual");
  expect(row.revenue).toBe(1000 * M);
  expect(row.fieldConflicts?.revenue?.usable).toBe(true);
  const computed = runStageB(b);
  expect(computed.scores.aspects.fundamentals.signals?.map(s => s.id)).toContain("revenueCagr");
  expect(computed.gaps.some(g => g.field === "eligibility.annual.revenue")).toBe(false);
  expect(JSON.stringify(b)).toBe(before);
 });
 it("does not turn a net-zero sales/other-income release bridge into an annual operating concept", () => {
  const b = bundle(); if (!b.edgar.companyFacts.ok) throw Error("fixture");
  const concepts = b.edgar.companyFacts.value.data.facts["us-gaap"]!;
  const revenue = concepts.Revenues as { units: { USD: Record<string, unknown>[] } };
  for (const p of revenue.units.USD) if (String(p.accn).startsWith("incomeQuarterly")) p.val = Number(p.val) / 1.1;
  for (const tag of Object.keys(concepts)) if (tag !== "Revenues" && !tag.startsWith("IncomeLossFromContinuingOperationsBefore")) delete concepts[tag];
  const text = "Consolidated statement (Amounts in millions of USD) Three Months Ended March 31, 2026 2025 Sales and other operating revenue 300 280 Income from equity affiliates 20 10 Other income (20) (10) Total revenues and other income 300 280";
  b.edgar.tenQNotes = { ok: true, value: { source: "edgar", endpoint: "synthetic", fetchedAt: at, asOf: "2026-03-31", data: {
   sectionName: "tenQNotes", text, statementsText: text, chars: text.length, method: "header-regex", accession: "unrelated-filing",
   filingDate: "2026-05-01", reportDate: "2026-03-31", form: "8-K", documentUrl: "https://www.sec.gov/Archives/edgar/data/42/release.htm",
  } } };
  const row = first(b, "incomeAnnual");
  expect(row.revenue).toBeNull();
  expect(row.fieldConflicts?.revenue?.usable).toBe(false);
 });
});

describe("one corroborated revenue basis",()=>{
 it.each([
  ["millions of U.S. dollars", 900], ["millions of USD", 900], ["millions of US$", 900],
  ["millions of dollars", 1000], ["millions of $", 1000],
  ["millions of Canadian dollars", 1000], ["millions of AUD", 1000], ["millions of euros", 1000],
  ["millions", 1000],
 ] as const)("binds retained sales to compatible currency evidence: %s",(unit,expected)=>{
  const b=completeCurrencyBundle({}),filed="2026-02-01";
  withIssuerFacts(b,{cik:42,entityName:"Synthetic",facts:{"us-gaap":{Revenues:{units:{USD:[{
   start:"2025-01-01",end:"2025-12-31",val:1000*M,accn:"annual",filed,form:"10-K",fy:2025,fp:"FY",
  }]}}}}});
  if(!b.statements.incomeAnnual.ok)throw Error("fixture");
  Object.assign(b.statements.incomeAnnual.value.data.rows[0]!,{cik:"42",filingDate:filed,periodStart:"2025-01-01",revenue:1000*M});
  const text=`Consolidated income statement (Amounts in ${unit}) Twelve Months Ended December 31, 2025 2024 Revenues and other income Sales and other operating revenue 900 800 Income from equity affiliates 80 70 Other income 20 30 Total revenues and other income 1000 900`;
  b.edgar.tenKNotes={ok:true,value:{source:"edgar",endpoint:"retained fixture",asOf:filed,fetchedAt:b.builtAt,
   data:{sectionName:"tenKNotes",text,statementsText:text,chars:text.length,method:"header-regex",accession:"annual",form:"10-K",filingDate:filed,reportDate:"2025-12-31",documentUrl:"https://www.sec.gov/Archives/edgar/data/42/annual.htm"}}};
  const before=JSON.stringify(b),row=first(b,"incomeAnnual");
  expect(row.revenue).toBe(expected*M);
  if(expected===900)expect(row.filedIncomeLines?.["operating-sales"]?.proof.unit).toBe("USD");
  else expect(row.filedIncomeLines?.["operating-sales"]).toBeUndefined();
  expect(JSON.stringify(b)).toBe(before);
 });
 it("reads a complete dated sales/affiliate/other-income bridge and rejects an unexplained total",()=>{
  const text="Consolidated income statement (Amounts in millions of U.S. dollars) Three Months Ended June 30, Six Months Ended June 30, 2026 2025 2026 2025 Revenues and other income Sales and other operating revenue 900 800 1800 1600 Income from equity affiliates 40 30 80 60 Other income (loss) 10 ( 20 ) 20 ( 40 ) Total revenues and other income 950 810 1900 1620 Costs and other deductions";
  expect(parseOperatingRevenueBridge(text).slice(0,2)).toMatchObject([{periodEnd:"2026-06-30",months:3,sales:900*M,total:950*M},{periodEnd:"2025-06-30",months:3,sales:800*M,total:810*M}]);
  expect(parseOperatingRevenueBridge(text.replace("950 810", "999 810"))).toEqual([]);
 });
 it("does not read a segment table as consolidated sales",()=>{
  const text="Consolidated income statement (in millions of USD) Three Months Ended June 30, 2026 2025 Upstream segment Sales 900 800 Income from equity affiliates 40 30 Other income 10 20 Total revenues and other income 950 850";
  expect(parseOperatingRevenueBridge(text)).toEqual([]);
 });
 it("keeps a filed sales line across reported, trailing and DCF revenue instead of inserting other income",()=>{
  const b=bundle(); expect(first(b,"incomeAnnual").revenue).toBe(1000*M); expect(first(b,"incomeQuarterly").revenue).toBe(300*M);
  const c=runStageB(b); if(c.valuation.kind!=="dcf"||!c.valuation.assumptions)throw Error("DCF expected");
  expect(c.valuation.assumptions.startRevenue.value).toBe(1200*M);
  expect(c.growth.margins.operating.series.every(p=>p.pct===20)).toBe(true);
 });
 it("corrects a disproved operating numerator for margins and coverage using filed sales less complete expenses ex interest",()=>{
  const b=bundle();if(!b.statements.incomeQuarterly.ok)throw Error("fixture");
  b.statements.incomeQuarterly.value.data.rows[0]!.operatingIncome=90*M;
  (b.statements.incomeQuarterly.value.data.raw as FmpIncomeStatementRow[])[0]!.operatingIncome=90*M;
  const row=first(b,"incomeQuarterly");expect(row.operatingIncome).toBe(60*M);expect(row.fieldConflicts?.operatingIncome?.vendorValue).toBe(90*M);
  const once=withIncomeOperatingBasis(b);const twice=withIncomeOperatingBasis(once);
  expect(twice.statements.incomeQuarterly).toEqual(once.statements.incomeQuarterly);
  const c=runStageB(b);expect(c.capital.current?.ebit).toBe(240*M);
 });
 it("uses the annual operating basis when every trailing numerator is missing",()=>{
  const b=bundle();if(!b.statements.incomeQuarterly.ok||!b.edgar.companyFacts.ok)throw Error("fixture");
  for(const row of b.statements.incomeQuarterly.value.data.rows.slice(0,4)){row.operatingIncome=undefined;row.fieldConflicts={operatingIncome:{usable:false,vendorValue:60*M,secValue:null,reason:"Independent refusal"}};}
  const c=runStageB(b);if(c.valuation.kind!=="dcf"||!c.valuation.assumptions)throw Error("annual DCF expected");expect(c.valuation.assumptions.startRevenue.value).toBe(1000*M);expect(c.valuation.assumptions.asOf.statements).toBe("2025-12-31");
 });
 it.each<Record<string,number>>([{Revenues:50},{SalesRevenueNet:600},{SalesRevenueGoodsNet:500,SalesRevenueServicesNet:300}])("does not promote a partial total over a larger corroborated line: %j",partial=>{
  const {input,f}=annual({...partial,RevenueFromContractWithCustomerExcludingAssessedTax:1000});
  const result=enrichIncomeClassification(input,f,"annual",at).income;expect(result.ok&&result.value.data.rows[0]!.revenue).toBe(1000*M);
  const summary=getConcept(f,"revenue",{period:{durationHint:"FY",end:"2025-12-31"}});expect(summary.ok&&summary.value.data.value).toBe(1000*M);
 });
 it("uses a closer later recast instead of returning to a distant original",()=>{
  const {input,f}=annual({Revenues:56000},30000);const tag=f.facts["us-gaap"]!.Revenues as {units:{USD:Record<string,unknown>[]}};
  tag.units.USD.push({...tag.units.USD[0]!,val:30020*M,filed:"2026-05-01",accn:"recast"});
  const result=enrichIncomeClassification(input,f,"annual",at).income;expect(result.ok&&result.value.data.rows[0]!.revenue).toBe(30020*M);
 });
 it.each([45000,56000])("keeps the latest same-scope recast when vendor revenue is %s", vendor=>{
  const {input,f}=annual({Revenues:56000,OperatingIncomeLoss:6000},vendor);
  for(const [tag,value] of [["Revenues",30000],["OperatingIncomeLoss",4000]] as const){
   const c=f.facts["us-gaap"]![tag] as {units:{USD:Record<string,unknown>[]}};
   c.units.USD.push({...c.units.USD[0]!,val:value*M,filed:"2026-05-01",accn:"recast"});
  }
  const out=enrichIncomeClassification(input,f,"annual",at).income;if(!out.ok)throw Error("fixture");
  expect(out.value.data.rows[0]!.revenue).toBe(30000*M);
  expect(out.value.data.rows[0]!.fieldProvenance?.revenue?.filings[0]?.accn).toBe("recast");
 });
 it("does not restore a superseded provider perimeter over the frozen recast",()=>{
  const {input,f}=annual({Revenues:56000},56000);if(!input.ok)throw Error("fixture");
  const c=f.facts["us-gaap"]!.Revenues as {units:{USD:Record<string,unknown>[]}};
  c.units.USD.push({...c.units.USD[0]!,val:30000*M,filed:"2026-05-01",accn:"recast"});
  const row=input.value.data.rows[0]!;row.source="edgar";row.revenue=30000*M;
  row.fieldProvenance={revenue:{source:"edgar",unit:"USD",periodStart:"2025-01-01",periodEnd:row.date!,observedAt:at,tags:["us-gaap/Revenues"],filings:[{accn:"recast",filed:"2026-05-01",form:"10-K"}]}};
  expect(replayIncomeObservations(input.value.data,42,f,at.slice(0,10)).rows[0]!.revenue).toBe(30000*M);
 });
 it("cannot seed a margin from an uncorroborated distant pair",()=>{
  const b=bundle();if(!b.statements.incomeQuarterly.ok||!b.edgar.companyFacts.ok)throw Error("fixture");
  const row=b.statements.incomeQuarterly.value.data.rows[0]!;row.revenue=30*M;(b.statements.incomeQuarterly.value.data.raw as FmpIncomeStatementRow[])[0]!.revenue=30*M;
  const r=first(b,"incomeQuarterly");expect(r.revenue).toBe(300*M);expect(r.operatingIncome).toBe(60*M);
 });
});


describe("operating bridge scope", () => {
 const proof = {source:"edgar" as const,unit:"USD",periodStart:"2025-01-01",periodEnd:"2025-12-31",observedAt:at,tags:["us-gaap/Revenues"],filings:[{accn:"one",filed:"2026-02-01",form:"10-K"}]};
 const line=(value:number,tag:string)=>({value,proof:{...proof,tags:[`us-gaap/${tag}`]}});
 it("prefers an explicit operating result over costs that also contain nonoperating items",()=>{
  const row={revenue:1000*M,operatingIncome:200*M,fieldProvenance:{revenue:proof},filedIncomeLines:{CostsAndExpenses:line(900*M,"CostsAndExpenses"),InterestExpense:line(50*M,"InterestExpense")}};
  const sec={...row,operatingIncome:200*M,fieldProvenance:{...row.fieldProvenance,operatingIncome:{...proof,tags:["us-gaap/OperatingIncomeLoss"]}}};
  expect(corroborateOperatingIncome(row,sec).operatingIncome).toBe(200*M);
 });
 it("corroborates a provider adjustment explained by filed nonservice pension expense",()=>{
  const row={revenue:900*M,operatingIncome:130*M,fieldProvenance:{revenue:proof},filedIncomeLines:{Revenues:line(950*M,"Revenues"),CostsAndExpenses:line(800*M,"CostsAndExpenses"),InterestExpense:line(20*M,"InterestExpense"),OperatingExpenses:line(770*M,"OperatingExpenses"),NetPeriodicDefinedBenefitsExpenseReversalOfExpenseExcludingServiceCostComponent:line(10*M,"NetPeriodicDefinedBenefitsExpenseReversalOfExpenseExcludingServiceCostComponent")}};
  expect(corroborateOperatingIncome(row,{...row,revenue:950*M,incomeBeforeTax:150*M,fieldProvenance:{...row.fieldProvenance,incomeBeforeTax:line(150*M,"IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest").proof}}).operatingIncome).toBe(130*M);
 });
 it("does not treat an incomplete derived EBIT as proof that a provider's nonoperating adjustment is wrong",()=>{
  const row={revenue:1000*M,operatingIncome:200*M,nonMarginOperatingIncome:200*M,fieldProvenance:{revenue:proof},fieldConflicts:{revenue:{usable:true,resolution:"filed-family" as const,vendorValue:990*M,secValue:1000*M,reason:"Reconciled revenue"}}};
  const out=corroborateOperatingIncome(row,{...row,operatingIncome:230*M,fieldProvenance:{revenue:proof,operatingIncome:{...proof,tags:["us-gaap/InterestExpenseNonoperating","us-gaap/OtherNonoperatingIncomeExpense"]}}});
  expect(out.operatingIncome).toBeUndefined();expect(out.nonMarginOperatingIncome).toBe(200*M);
 });
});


it("does not infer discrete sales quarters from a matching aggregate window", () => {
 const b=bundle();if(!b.edgar.companyFacts.ok||!b.statements.incomeQuarterly.ok)throw Error("fixture");
 const concepts=b.edgar.companyFacts.value.data.facts["us-gaap"]!;
 for(const tag of ["SalesRevenueNet","RevenueFromContractWithCustomerExcludingAssessedTax"]){
  const c=concepts[tag] as {units:{USD:{end:string}[]}};
  c.units.USD=c.units.USD.filter(p=>p.end<"2025-01-01"||p.end>"2025-09-30");
 }
 (concepts.Revenues as {units:{USD:unknown[]}}).units.USD.push({start:"2025-01-01",end:"2025-09-30",val:924*M,filed:"2025-11-01",accn:"ytd",form:"10-Q",fy:2025,fp:"Q3"});
 b.edgar.currentReports={ok:true,value:{source:"edgar",fetchedAt:at,asOf:"2025-09-30",endpoint:"retained",data:{releases:[{accession:"release",filingDate:"2025-11-01",form:"8-K",commentaryUrl:"https://www.sec.gov/Archives/edgar/data/42/release/table.htm",commentaryNarrative:"Consolidated statement (Amounts in millions) Three Months Ended September 30, Nine Months Ended September 30, 2025 2024 2025 2024 Sales and other operating revenue 300 240 840 720 Income from equity affiliates 20 15 60 45 Other income 10 9 24 27 Total revenues and other income 330 264 924 792"}]}}} as unknown as NonNullable<DataBundle["edgar"]["currentReports"]>;
 const rows=(v:DataBundle)=>{const r=withIncomeOperatingBasis(v).statements.incomeQuarterly;if(!r.ok)throw Error("fixture");return r.value.data.rows;};
 expect(rows(b).find(r=>r.date==="2025-06-30")?.revenue).toBeNull();
 const shifted=structuredClone(b);if(!shifted.statements.incomeQuarterly.ok)throw Error("fixture");
 for(const r of shifted.statements.incomeQuarterly.value.data.raw as FmpIncomeStatementRow[]){if(r.date==="2025-03-31")r.revenue!-=10*M;if(r.date==="2025-06-30")r.revenue!+=10*M;}
 expect(rows(shifted).find(r=>r.date==="2025-06-30")?.revenue).toBeNull();
 const wrong=structuredClone(b);(wrong.statements.incomeQuarterly.ok ? wrong.statements.incomeQuarterly.value.data.raw as FmpIncomeStatementRow[] : []).find(r=>r.date==="2025-03-31")!.revenue=200*M;
 expect(rows(wrong).find(r=>r.date==="2025-06-30")?.revenue).toBeNull();
 const wrongIssuer=structuredClone(b);if(!wrongIssuer.statements.incomeQuarterly.ok)throw Error("fixture");
 (wrongIssuer.statements.incomeQuarterly.value.data.raw as FmpIncomeStatementRow[])[3]!.cik="99";
 expect(rows(wrongIssuer).find(r=>r.date==="2025-06-30")?.revenue).toBeNull();
 const offset=structuredClone(b);if(!offset.statements.incomeQuarterly.ok)throw Error("fixture");
 for(const r of offset.statements.incomeQuarterly.value.data.raw as FmpIncomeStatementRow[]){if(r.date==="2025-03-31")r.revenue=30*M;if(r.date==="2025-06-30")r.revenue=510*M;}
 expect(rows(offset).find(r=>r.date==="2025-06-30")?.revenue).toBeNull();
});

it("keeps a rounded corroboration on the latest compatible filing rather than changing the operating filing basis",()=>{
 const {input,f}=annual({Revenues:1000.0003},1000.0003);const c=f.facts["us-gaap"]!.Revenues as {units:{USD:Record<string,unknown>[]}};
 c.units.USD.push({...c.units.USD[0]!,val:1000*M,filed:"2026-05-01",accn:"later"});
 const out=enrichIncomeClassification(input,f,"annual",at).income;if(!out.ok)throw Error("fixture");
 expect(out.value.data.rows[0]!.revenue).toBe(1000.0003*M);
 expect(out.value.data.rows[0]!.fieldProvenance!.revenue!.filings[0]!.filed).toBe("2026-05-01");
});

it("keeps the company's sales basis when one period has no provider revenue",()=>{
 const b=bundle();if(!b.statements.incomeQuarterly.ok)throw Error("fixture");
 b.statements.incomeQuarterly.value.data.rows[0]!.revenue=undefined;
 (b.statements.incomeQuarterly.value.data.raw as FmpIncomeStatementRow[])[0]!.revenue=undefined;
 expect(first(b,"incomeQuarterly").revenue).toBe(300*M);
});

it.each(["matching","currency","date","duplicate","independent refusal"])("replays a prior SEC substitution only from its exact retained provider row (%s)", mode=>{
 const b=bundle();if(!b.statements.incomeAnnual.ok)throw Error("fixture");
 const p=b.statements.incomeAnnual.value.data,row=p.rows[0]!;row.source="edgar";row.revenue=1100*M;row.operatingIncome=230*M;
 row.netIncomeAvailableToCommon=75*M;row.fieldProvenance={netIncomeAvailableToCommon:{source:"edgar",unit:"USD",periodStart:"2025-01-01",periodEnd:"2025-12-31",observedAt:at,tags:["us-gaap/NetIncomeLossAvailableToCommonStockholdersBasic"],filings:[{accn:"common",filed:row.filingDate!,form:"10-K"}]}};
 if(mode==="currency")(p.raw as FmpIncomeStatementRow[])[0]!.reportedCurrency="EUR";
 if(mode==="date")(p.raw as FmpIncomeStatementRow[])[0]!.date="2025-12-30";
 if(mode==="duplicate")(p.raw as FmpIncomeStatementRow[]).push({...((p.raw as FmpIncomeStatementRow[])[0]!)});
 if(mode==="independent refusal"){row.operatingIncome=undefined;row.fieldConflicts={operatingIncome:{usable:false,vendorValue:230*M,secValue:null,reason:"Independent refusal"}};}
 const out=replayIncomeObservations(p,42).rows[0]!;
 expect(out.netIncomeAvailableToCommon).toBe(75*M);
 if(mode==="matching"||mode==="independent refusal")expect(out.operatingBasisReview).toBe(true);
 expect(out.revenue).toBe((mode==="matching"||mode==="independent refusal"?1000:1100)*M);
 expect(out.operatingIncome).toBe(mode==="independent refusal"?undefined:(mode==="matching"?200:230)*M);
});

it("does not choose an unproved sales subtotal merely because it is closer to an erroneous provider figure",()=>{
 const {input,f}=annual({Revenues:1000,SalesRevenueNet:600},300);
 const out=enrichIncomeClassification(input,f,"annual",at).income;
 expect(out.ok&&out.value.data.rows[0]!.revenue).toBe(1000*M);
});

it("charts the same admitted revenue as the calculation rather than a prior broad replacement",()=>{
 const b=bundle();if(!b.statements.incomeAnnual.ok)throw Error("fixture");
 b.statements.incomeAnnual.value.data.rows[0]!.source="edgar";b.statements.incomeAnnual.value.data.rows[0]!.revenue=1100*M;
 const c=runStageB(b);expect(fundamentalsChartDataFromBundle(b,c).revenue.find(r=>r.period==="2025-12-31")?.revenue).toBe(1000*M);
});

it("does not use cash interest as corroboration of an operating-income margin",()=>{
 const b=bundle();if(!b.edgar.companyFacts.ok||!b.statements.incomeQuarterly.ok)throw Error("fixture");
 const facts=b.edgar.companyFacts.value.data.facts["us-gaap"]!;facts.InterestPaidNet=facts.InterestExpense;delete facts.InterestExpense;
 b.statements.incomeQuarterly.value.data.rows[0]!.operatingIncome=90*M;
 (b.statements.incomeQuarterly.value.data.raw as FmpIncomeStatementRow[])[0]!.operatingIncome=90*M;
 const row=first(b,"incomeQuarterly");expect(row.operatingIncome).toBeUndefined();expect(row.nonMarginOperatingIncome).toBe(90*M);
});

it("reclassifies a prior whole-statement substitution from its retained provider pair before either acquisition order",()=>{
 const {input,f}=annual({Revenues:1100,SalesRevenueNet:1000});if(!input.ok)throw Error("fixture");
 const row=input.value.data.rows[0]!;row.source="edgar";row.revenue=1100*M;row.grossProfit=undefined;
 const out=enrichIncomeClassification(input,f,"annual",at).income;if(!out.ok)throw Error("fixture");
 expect(out.value.data.rows[0]!.revenue).toBe(1000*M);expect(out.value.data.rows[0]!.grossProfit).toBeUndefined();
});


it.each(["10-K","20-F"])("uses the latest core recast even when an intervening value is closer to the provider (%s)",form=>{
 const {input,f}=annual({Revenues:56000},30000);const c=f.facts["us-gaap"]!.Revenues as {units:{USD:Record<string,unknown>[]}};
 c.units.USD.push({...c.units.USD[0]!,val:30020*M,filed:"2026-03-01",accn:"intervening",form},{...c.units.USD[0]!,val:30200*M,filed:"2026-05-01",accn:"latest",form},{...c.units.USD[0]!,val:30000*M,filed:"2026-04-01",accn:"release-only",form:"8-K"});
 const out=enrichIncomeClassification(input,f,"annual",at).income;if(!out.ok)throw Error("fixture");expect(out.value.data.rows[0]!.revenue).toBe(30200*M);
});

it("restores only operating observations and keeps independently filed earnings and share counts",()=>{
 const b=bundle();if(!b.statements.incomeAnnual.ok)throw Error("fixture");const p=b.statements.incomeAnnual.value.data,r=p.rows[0]!;
 r.source="edgar";r.netIncome=123*M;r.epsDiluted=1.23;r.weightedAverageShsOutDil=77*M;
 const out=replayIncomeObservations(p,42).rows[0]!;expect(out.netIncome).toBe(123*M);expect(out.epsDiluted).toBe(1.23);expect(out.weightedAverageShsOutDil).toBe(77*M);
});

it.each([false,true])("retains the independently filed row without corroboration available at the snapshot (%s)",future=>{
 const b=bundle();if(!b.statements.incomeAnnual.ok||!b.edgar.companyFacts.ok)throw Error("fixture");const p=b.statements.incomeAnnual.value.data,r=p.rows[0]!;r.source="edgar";r.revenue=1100*M;
 const facts=b.edgar.companyFacts.value.data;for(const tag of ["Revenues","SalesRevenueNet","RevenueFromContractWithCustomerExcludingAssessedTax"]){const c=facts.facts["us-gaap"]![tag] as {units:{USD:{val:number}[]}};c.units.USD.forEach(p=>p.val=1100*M);}
 if(future){const c=facts.facts["us-gaap"]!.Revenues as {units:{USD:Record<string,unknown>[]}};c.units.USD.push({...c.units.USD[0]!,val:1000*M,filed:"2027-01-01",accn:"future"});}
 expect(replayIncomeObservations(p,42,facts,at.slice(0,10)).rows[0]!.revenue).toBe(1100*M);
});

it("does not revive a refused filed numerator as a standalone fallback",()=>{
 const p={source:"edgar" as const,unit:"USD",periodStart:"2025-01-01",periodEnd:"2025-12-31",observedAt:at,tags:["us-gaap/Revenues"],filings:[{accn:"one",filed:"2026-02-01",form:"10-K"}]};
 const row={revenue:1000*M,operatingIncome:200*M,nonMarginOperatingIncome:200*M,fieldProvenance:{revenue:p}};
 const sec={operatingIncome:999*M,fieldProvenance:{operatingIncome:{...p,tags:["us-gaap/OperatingIncomeLoss"],filings:[{accn:"other",filed:"2026-03-01",form:"10-K"}]}},fieldConflicts:{operatingIncome:{usable:false,vendorValue:999*M,secValue:null,reason:"Independent refusal"}}};
 expect(corroborateOperatingIncome(row,sec).nonMarginOperatingIncome).toBe(200*M);
});

it.each(["valid","refused","currency","period"])("preserves a previously common filed numerator when a rounded recast changes only revenue's filing (%s)",mode=>{
 const {input,f}=annual({Revenues:10000.3,OperatingIncomeLoss:2000},12000);if(!input.ok)throw Error("fixture");
 const r=input.value.data.rows[0]!;r.source="edgar";r.revenue=10000*M;r.operatingIncome=2000*M;
 const p={source:"edgar" as const,unit:"USD",periodStart:"2025-01-01",periodEnd:"2025-12-31",observedAt:at,tags:["us-gaap/Revenues"],filings:[{accn:"latest",filed:"2026-05-01",form:"10-K"}]};
 r.fieldProvenance={revenue:p,operatingIncome:{...p,unit:mode==="currency"?"EUR":"USD",periodStart:mode==="period"?"2025-02-01":"2025-01-01",tags:["us-gaap/OperatingIncomeLoss"]}};
 if(mode==="refused")r.fieldConflicts={operatingIncome:{usable:false,vendorValue:2000*M,secValue:null,reason:"Independent refusal"}};
 for(const tag of ["Revenues","OperatingIncomeLoss"]){const c=f.facts["us-gaap"]![tag] as {units:{USD:Record<string,unknown>[]}};c.units.USD.push({...c.units.USD[0]!,val:(tag==="Revenues"?10000:2000)*M,filed:"2026-05-01",accn:"latest"});}
 const out=enrichIncomeClassification(input,f,"annual",at).income;if(!out.ok)throw Error("fixture");
 expect(out.value.data.rows[0]!.nonMarginOperatingIncome).toBeUndefined();
 if(mode==="valid")expect(out.value.data.rows[0]!.operatingIncome).toBe(2000*M);
});

it("reviews a restored operating observation even when its amount is unchanged",()=>{
 const b=bundle();if(!b.statements.incomeAnnual.ok)throw Error("fixture");const p=b.statements.incomeAnnual.value.data;p.rows[0]!.source="edgar";
 expect(replayIncomeObservations(p,42).rows[0]!.operatingBasisReview).toBe(true);
});

it.each(["valid","currency","period","amount","unadmitted"])("uses only admitted corroborations of the one revenue line for a filed operating result (%s)",mode=>{
 const old={source:"edgar" as const,unit:"USD",periodStart:"2025-01-01",periodEnd:"2025-12-31",observedAt:at,tags:["us-gaap/Revenues"],filings:[{accn:"old",filed:"2026-02-01",form:"10-K"}]};
 const recent={...old,filings:[{accn:"new",filed:"2026-05-01",form:"10-K"}]};
 const row={revenue:1000*M,operatingIncome:300*M,nonMarginOperatingIncome:300*M,fieldProvenance:{revenue:recent},filedIncomeLines:{corroboration:{value:(mode==="amount"?900:1000)*M,role:mode==="unadmitted"?undefined:"admitted-revenue" as const,proof:{...old,unit:mode==="currency"?"EUR":"USD",periodEnd:mode==="period"?"2024-12-31":"2025-12-31"}}}};
 const sec={operatingIncome:200*M,fieldProvenance:{operatingIncome:{...old,tags:["us-gaap/OperatingIncomeLoss"]}}};
 const out=corroborateOperatingIncome(row,sec);expect(out.operatingIncome).toBe(mode==="valid"?200*M:undefined);
});

it("keeps a checked numerator when the admitted revenue also has a newer corroborating filing",()=>{
 const b=bundle();if(!b.edgar.companyFacts.ok||!b.statements.incomeAnnual.ok)throw Error("fixture");
 const facts=b.edgar.companyFacts.value.data,concepts=facts.facts["us-gaap"]!;
 const sales=concepts.SalesRevenueNet as {units:{USD:Record<string,unknown>[]}};
 const original=sales.units.USD.find(p=>p.end==="2025-12-31")!;
 concepts.OperatingIncomeLoss={units:{USD:[{...original,val:200*M}]}};
 sales.units.USD.push({...original,filed:"2026-05-01",accn:"later-sales"});
 const replay=first(b,"incomeAnnual");
 const acquired=enrichIncomeClassification(b.statements.incomeAnnual,facts,"annual",at).income;
 if(!acquired.ok)throw Error("fixture");
 const fresh=first({...b,statements:{...b.statements,incomeAnnual:acquired}},"incomeAnnual");
 expect(replay.operatingIncome).toBe(200*M);expect(fresh.operatingIncome).toBe(200*M);
 expect(fresh.nonMarginOperatingIncome).toBeUndefined();
});

it.each(["valid","other revenue","other currency","refused"])("keeps a filed gross-profit pair on an admitted older revenue corroboration (%s)",mode=>{
 const {input,f}=annual({Revenues:mode==="other revenue"?900:1000,GrossProfit:400,CostOfRevenue:600});if(!input.ok)throw Error("fixture");
 if(mode==="refused")input.value.data.rows[0]!.fieldConflicts={grossProfit:{usable:false,vendorValue:400*M,secValue:null,reason:"Independent refusal"}};
 const concepts=f.facts["us-gaap"]!;
 for(const [tag,value] of [["Revenues",1000],["GrossProfit",410],["CostOfRevenue",590]] as const){
  const c=concepts[tag] as {units:Record<string,Record<string,unknown>[]>};
  const old=c.units.USD![0]!;if(tag==="GrossProfit"&&mode==="other currency"){c.units.EUR=c.units.USD!;c.units.USD=[];}
  c.units.USD!.push({...old,val:value*M,filed:"2026-05-01",accn:"recast"});
 }
 const out=enrichIncomeClassification(input,f,"annual",at).income;if(!out.ok)throw Error("fixture");
 expect(out.value.data.rows[0]!.grossProfit??null).toBe(mode==="valid"?400*M:null);
});

it("does not use an independently refused filed gross profit as an alternate corroboration",()=>{
 const p={source:"edgar" as const,unit:"USD",periodStart:"2025-01-01",periodEnd:"2025-12-31",observedAt:at,tags:["us-gaap/Revenues"],filings:[{accn:"old",filed:"2026-02-01",form:"10-K"}]};
 const recent={...p,filings:[{accn:"new",filed:"2026-05-01",form:"10-K"}]};
 const row={revenue:1000*M,grossProfit:400*M,fieldProvenance:{revenue:recent},filedIncomeLines:{old:{value:1000*M,role:"admitted-revenue" as const,proof:p}}};
 const sec={grossProfit:410*M,fieldProvenance:{grossProfit:{...recent,tags:["us-gaap/GrossProfit"]}}};
 const refused={grossProfit:400*M,fieldProvenance:{grossProfit:{...p,tags:["us-gaap/GrossProfit"]}},fieldConflicts:{grossProfit:{usable:false,vendorValue:400*M,secValue:null,reason:"Independent refusal"}}};
 expect(admitRevenueGrossProfit(row,sec,[],[refused]).grossProfit).toBeUndefined();
});
