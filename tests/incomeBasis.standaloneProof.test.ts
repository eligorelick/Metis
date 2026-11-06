import { expect, it } from "vitest";
import { withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import { enrichDataOnlyReport } from "@/pipeline/stageC/dataOnlyReport";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { loadTask28Fixture } from "./helpers/task28Report";

it.each(["all-unverified", "oldest-unverified", "all-filed", "unselected-older", "unused-unverified"] as const)(
 "tracks the selected TTM WACC operating evidence: %s", mode=>{
  const b=completeCurrencyBundle({debt:300,siblingQuarterCurrencies:["USD","USD","USD","USD"]});
  if(!b.statements.incomeQuarterly.ok||!b.statements.incomeAnnual.ok||!b.quote.ok)throw Error("fixture");
  b.quote.value.data.rows[0]!.timestamp=Date.parse("2026-07-05T20:00:00Z")/1000;
  for(const row of b.statements.incomeAnnual.value.data.rows)row.interestExpense=0;
  b.statements.incomeQuarterly.value.data.rows.forEach((row,index)=>{
   row.interestExpense=(mode==="unused-unverified"?5:0.1)*M;
   const derived=mode==="all-unverified"||mode==="unused-unverified"||mode==="oldest-unverified"&&index===3||mode==="unselected-older"&&index>=4;
   const proof={source:"edgar" as const,unit:"USD",periodStart:`${row.date!.slice(0,4)}-${String(Number(row.date!.slice(5,7))-2).padStart(2,"0")}-01`,periodEnd:row.date!,observedAt:b.builtAt,
    tags:["us-gaap/Revenues"],filings:[{accn:`0000000042-26-${String(index+1).padStart(6,"0")}`,filed:b.builtAt.slice(0,10),form:"10-Q"}]};
   row.fieldProvenance={revenue:proof,operatingIncome:{...proof,tags:derived?
    ["us-gaap/IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest","us-gaap/InterestExpense"]:["us-gaap/OperatingIncomeLoss"]}};
  });
  const before=JSON.stringify(b),c=runStageB(b),evidence=c.returns.wacc.operatingIncomeEvidence;
  const qualifies=mode==="all-unverified"||mode==="oldest-unverified";
  if(mode==="unused-unverified")expect(c.returns.wacc.costOfDebtMethod).not.toBe("synthetic");
  else {
   expect(c.returns.wacc.costOfDebtMethod).toBe("synthetic");
   expect(c.returns.wacc.interestCoverageRatio).toBe(600);
   expect(evidence?.status).toBe(qualifies?"unverified-derivation":"filed-or-reconciled");
   expect(evidence?.asOf).toBe("2026-03-31");
   expect(evidence?.observations?.map(point=>point.asOf)).toEqual(["2026-03-31","2025-12-31","2025-09-30","2025-06-30"]);
  }
  for(const aspect of ["quality","valuation"] as const)expect(c.scores.qualification?.aspects[aspect].reasons.some(r=>r.code==="selected-operating-scope-unverified")).toBe(qualifies);
  expect(JSON.stringify(b)).toBe(before);
 });

function fixture(mode:"cash"|"ambiguous"|"unverified") {
  const b=completeCurrencyBundle({debt:300});
  if(!b.statements.incomeAnnual.ok) throw Error("fixture");
  const r=b.statements.incomeAnnual.value.data.rows[0]!;
  Object.assign(r,{cik:"42",filingDate:"2026-02-01",operatingIncome:400*M,incomeBeforeTax:200*M});
  if(mode==="unverified") r.operatingIncome=undefined;
  if(b.statements.incomeQuarterly.ok) for(const q of b.statements.incomeQuarterly.value.data.rows) {
    q.operatingIncome=undefined;
    q.fieldConflicts={operatingIncome:{usable:false,vendorValue:null,secValue:null,reason:"Synthetic unavailable quarterly numerator"}};
  }
  const values={Revenues:1000,IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest:200,
    OtherNonoperatingIncomeExpense:10,InvestmentIncomeInterest:20,
    ...(mode==="cash"?{InterestPaid:30}:mode==="ambiguous"?{InterestExpenseDebt:30,InterestAndDebtExpense:10}:{InterestExpense:30})};
  return withIssuerFacts(b,{cik:42,entityName:"Synthetic",facts:{"us-gaap":Object.fromEntries(Object.entries(values).map(([tag,val])=>[tag,{units:{USD:[{start:"2025-01-01",end:"2025-12-31",val:val*M,accn:"annual",filed:"2026-02-01",form:"10-K",fy:2025,fp:"FY"}]}}]))}});
}
it.each(["cash","ambiguous"] as const)("does not store a %s-interest shortcut as a standalone WACC operating proof", mode=>{
  const out=withIncomeOperatingBasis(fixture(mode)).statements.incomeAnnual;
  if(!out.ok) throw Error("fixture");
  expect(out.value.data.rows[0]!.waccOperatingIncome).toBeUndefined();
});
it("qualifies a retained unverified derivation instead of calling it directly filed operating income",()=>{
  const b=fixture("unverified"), admitted=withIncomeOperatingBasis(b).statements.incomeAnnual;
  if(!admitted.ok) throw Error("fixture");
  expect(admitted.value.data.rows[0]!.waccOperatingIncome).toBe(200*M);
  const c=runStageB(b), text=JSON.stringify(c);
  expect(text).toMatch(/derived.*unverified consolidated operating scope/i);
  expect(text).not.toContain("filed operating income for standalone interest coverage");
});

it("qualifies the actual annual derivation selected for a synthetic WACC without revoking its permitted number",()=>{
  const b=fixture("unverified");
  for(const input of [b.statements.balanceAnnual,b.statements.balanceQuarterly]) {
    if(!input.ok) throw Error("fixture balances");
    for(const row of input.value.data.rows) row.totalDebt=1_000_000*M;
  }
  const c=runStageB(b);
  expect(c.returns.wacc.costOfDebtMethod).toBe("synthetic");
  expect(c.returns.wacc.waccPct).not.toBeNull();
  expect(c.returns.wacc.operatingIncomeEvidence).toEqual({status:"unverified-derivation",asOf:"2025-12-31",
    field:"statements.income.2025-12-31.waccOperatingIncome",usedInDiscountRate:true});
  for(const aspect of ["quality","valuation"] as const) expect(c.scores.qualification?.aspects[aspect].reasons.some(r=>r.code==="selected-operating-scope-unverified")).toBe(true);
});

it("retains the signed net-interest fact through extraction and corrects a cash-derived shortcut",()=>{
  const b=fixture("cash");
  if(!b.edgar.companyFacts.ok || !b.statements.incomeAnnual.ok) throw Error("fixture");
  const facts=b.edgar.companyFacts.value.data.facts["us-gaap"]!;
  for(const [tag,val] of Object.entries({GrossProfit:600,CostOfRevenue:400,SellingGeneralAndAdministrativeExpense:300,
    InterestIncomeExpenseNonoperatingNet:5,OtherNonoperatingIncomeExpense:5,
    IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest:310})) {
    facts[tag]={units:{USD:[{start:"2025-01-01",end:"2025-12-31",val:val*M,accn:"annual",filed:"2026-02-01",form:"10-K",fy:2025,fp:"FY"}]}};
  }
  b.statements.incomeAnnual.value.data.rows[0]!.incomeBeforeTax=310*M;
  const out=withIncomeOperatingBasis(b).statements.incomeAnnual;
  if(!out.ok) throw Error("fixture");
  expect(out.value.data.rows[0]!.filedIncomeLines?.InterestIncomeExpenseNonoperatingNet?.value).toBe(5*M);
  expect(out.value.data.rows[0]!.operatingIncome).toBe(300*M);
  expect(out.value.data.rows[0]!.fieldProvenance?.operatingIncome?.calculation).toBe("complete-operating-reconciliation");
});

it("carries unverified operating-source qualifications through the actual data-only and export consumers",()=>{
  const b=fixture("unverified"),c=runStageB(b);
  const report=enrichDataOnlyReport(loadTask28Fixture(),{bundle:b,computed:c,reason:"Synthetic source qualification"});
  const payload=assembleContextPayload(b,c,{checks:[],flags:[],gaps:[]});
  for(const text of [JSON.stringify(payload),JSON.stringify(report),reportToMarkdown(report),reportToPrintBody(report)]) {
    expect(text).toContain("unverified consolidated operating scope");
    expect(text).toContain("us-gaap/OtherNonoperatingIncomeExpense");
  }
});

it("does not relabel an unverified annual operating derivation as filed income on a mixed coverage basis",()=>{
  const b=fixture("unverified");
  if(!b.statements.incomeAnnual.ok) throw Error("fixture");
  b.statements.incomeAnnual.value.data.rows[0]!.interestExpense=undefined;
  for(const input of [b.statements.balanceQuarterly,b.statements.cashflowQuarterly]) {
    if(input.ok) for(const row of input.value.data.rows) row.reportedCurrency="USD";
  }
  const text=JSON.stringify(runStageB(b));
  expect(text).toContain("WACC coverage ratio pairs TTM interest expense with FY 2025-12-31");
  expect(text).not.toContain("filed operating income for standalone interest coverage");
});
