import { discoverStockSplits } from "@/edgar/splits";
import { it,expect } from "vitest";
import { indicatedDividendYield } from "@/pipeline/shareUnits";
import { fiscalCashDividendPayout } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { foreignBundle } from "./helpers/foreignBundle";
const declaration={amount:1,currency:"USD",frequency:"quarterly",declarationAsOf:"2026-06-01",source:"8-K synthetic dividend",shareUnit:"ordinary" as const};
it("computes indicated quarterly yield from a declared ordinary dividend and dated quote",()=>{
 const b=completeCurrencyBundle({}); if(!b.profile.ok || !b.quote.ok) throw Error("fixture");
 b.profile.value.data.rows[0]!.isAdr=false; b.quote.value.data.rows[0]!.price=100; b.quote.value.data.rows[0]!.timestamp=Date.parse("2026-07-05T12:00:00Z")/1000;
 b.edgar.shareBasis={basisDay:"2026-07-05",splits:discoverStockSplits({cik:42,entityName:"Synthetic",facts:{}},{asOf:"2026-07-05",vendor:{status:"retrieved",source:"fixture",events:[],coverage:[{from:"2020-01-01",to:"2026-07-05"}]}})};
 const result=indicatedDividendYield(b,declaration); expect(result.value).toBe(4); expect(result.annualizedPerQuotedShare).toBe(4);
 expect(indicatedDividendYield(b,{...declaration,frequency:null}).value).toBeNull();
});
it("keeps a non-payer unavailable even with a positive quote",()=>{
 const b=completeCurrencyBundle({});
 for(const fetch of [b.statements.cashflowAnnual,b.statements.cashflowQuarterly]) if(fetch.ok) for(const row of fetch.value.data.rows) {row.commonDividendsPaid=0;row.netDividendsPaid=0;}
 const r=indicatedDividendYield(b,{...declaration,amount:null});
 expect(r.value).toBeNull(); expect(r.reason).toMatch(/declared dividend/); expect(r.price).toBeGreaterThan(0);
});
it("converts a proven ADS ordinary-share dividend, and refuses missing ratio or declared share unit",()=>{
 const b=foreignBundle("USD",5);
 if(!b.edgar.companyFacts.ok) throw Error("fixture");
 b.edgar.shareBasis={basisDay:"2026-07-02",splits:discoverStockSplits(b.edgar.companyFacts.value.data,{asOf:"2026-07-02",vendor:{status:"retrieved",source:"fixture",events:[],coverage:[{from:"2020-01-01",to:"2026-07-02"}]}})};
 const r=indicatedDividendYield(b,{...declaration,declarationAsOf:"2026-03-01"});
 expect(r.ordinarySharesPerQuotedUnit).toBe(5); expect(r.annualizedPerQuotedShare).toBe(20);
 expect(indicatedDividendYield(b,{...declaration,shareUnit:null}).value).toBeNull();
 if(!b.edgar.companyFacts.ok) throw Error("fixture"); b.edgar.companyFacts.value.data.facts={};
 expect(indicatedDividendYield(b,declaration).value).toBeNull();
});
const proof=(tag:string)=>({source:"edgar" as const,unit:"USD",periodStart:"2025-01-01",periodEnd:"2025-12-31",observedAt:"2026-02-01",tags:[tag],filings:[{accn:"synthetic",filed:"2026-02-01",form:"10-K"}]});
it("computes annual cash payout only for admitted common income in the exact same filed window",()=>{
 const dividend={date:"2025-12-31",netIncome:100,commonDividendsPaid:-25,fieldProvenance:{commonDividendsPaid:proof("us-gaap/PaymentsOfDividendsCommonStock")}};
 const income={date:"2025-12-31",fieldProvenance:{netIncome:proof("us-gaap/NetIncomeLoss")}};
 expect(fiscalCashDividendPayout([dividend],[income],"2026-07-01")[0]).toMatchObject({value:25,dividends:25,commonIncome:100,start:"2025-01-01",end:"2025-12-31"});
 expect(fiscalCashDividendPayout([{...dividend,netIncome:undefined}],[income],"2026-07-01")[0]!.value).toBeNull();
 expect(fiscalCashDividendPayout([dividend],[{...income,fieldProvenance:{netIncome:{...proof("net"),periodStart:"2025-04-01"}}}],"2026-07-01")[0]!.value).toBeNull();
 expect(fiscalCashDividendPayout([{...dividend,commonDividendsPaid:0}],[income],"2026-07-01")[0]!.value).toBe(0);
});

import { buildEarningsReleaseRecord,CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
it("shows the indicated yield, quote and source on the shared capital-return table",()=>{
 const b=completeCurrencyBundle({});if(!b.profile.ok || !b.quote.ok) throw Error("fixture");
 b.profile.value.data.rows[0]!.isAdr=false;b.quote.value.data.rows[0]!.price=100;b.quote.value.data.rows[0]!.timestamp=Date.parse("2026-07-05T12:00:00Z")/1000;
 b.edgar.shareBasis={basisDay:"2026-07-05",splits:discoverStockSplits({cik:42,entityName:"Synthetic",facts:{}},{asOf:"2026-07-05",vendor:{status:"retrieved",source:"fixture",events:[],coverage:[{from:"2020-01-01",to:"2026-07-05"}]}})};
 if(b.statements.incomeQuarterly.ok) b.statements.incomeQuarterly.value.data.rows[0]!.reportedCurrency="USD";
 const r=buildEarningsReleaseRecord({filing:{accessionNumber:"dividend-source",filingDate:"2026-06-01"},releaseUrl:"https://www.sec.gov/dividend",commentaryUrl:null,commentaryText:null,releaseText:"Example Reports Financial Results for First Quarter 2026. Quarter ended March 31, 2026. Net income was $20 million. The board declared a quarterly cash dividend of $1.00 per share.",includeNarrative:true});
 b.edgar.currentReports={ok:true,value:{source:"edgar",endpoint:"fixture",asOf:"2026-06-01",fetchedAt:b.builtAt,data:{version:CURRENT_REPORTS_VERSION,releases:[r],events:[],notes:[]}}};
 const d=buildFilingDisclosures(b)!;expect(d.dividends?.indicated.reason).toBeNull();expect(d.dividends?.indicated.value).toBe(4);
 const table=filingDisclosureTables(d,"fundamentals").find(t=>t.heading.includes("capital return"))!;
 expect(JSON.stringify(table)).toContain("4.00%");expect(JSON.stringify(table)).toContain("dividend-source");expect(JSON.stringify(table)).toContain("Dividend-yield quote");expect(JSON.stringify(table)).toContain("2026-07-05");
});

import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
it("registers a sourced fiscal-year dividend calculation as computed and keeps its period",()=>{
 const b=completeCurrencyBundle({});const c=runStageB(b);
 c.capital.cashDividendPayout=fiscalCashDividendPayout([{date:"2025-12-31",netIncome:100,commonDividendsPaid:-25,fieldProvenance:{commonDividendsPaid:proof("us-gaap/PaymentsOfDividendsCommonStock")}}],[{date:"2025-12-31",fieldProvenance:{netIncome:proof("us-gaap/NetIncomeLoss")}}],"2026-07-01");
 const payload=assembleContextPayload(b,c,{checks:[],flags:[],gaps:[]});
 expect(payload.provenanceRegistry?.find(r=>r.label?.includes("fiscal-year common cash dividend payout ratio"))).toMatchObject({kind:"computed",value:25,periodContext:{kind:"duration",start:"2025-01-01",end:"2025-12-31"}});
});
