import {expect,it} from "vitest";
import {loadTask28Fixture} from "./helpers/task28Report";
import {keyDataRows} from "@/report/presentation";
it.each([[3.6,"annual","1.67%"],[0.5,"monthly","2.78%"],[1,"special","withheld"],[0.26,null,"withheld"]] as const)("RPT-201 %s %s",(amount,frequency,value)=>{
 const r=loadTask28Fixture(); r.marketData={version:"1",currency:"USD",estimateCurrency:"USD",estimateCurrencyBasis:null,quote:{price:216,marketCap:null,yearHigh:null,yearLow:null,volume:null,priceAvg50:null,priceAvg200:null,asOf:"2026-10-27"},shares:null,enterpriseValue:null,estimates:[],estimatesAsOf:null,priceTarget:null,gradeCounts:null,shortInterest:null};
 r.filingDisclosures={version:"1",currency:"USD",latestPeriod:null,quarterlyTrend:[],guidance:[],guidanceChecks:[],issuerFcf:[],capitalReturn:null,segments:[],notes:[]} as unknown as NonNullable<typeof r.filingDisclosures>;
 r.filingDisclosures!.currency="USD";
 r.filingDisclosures!.capitalReturn={...r.filingDisclosures!.capitalReturn!,dividendPerShare:amount,dividendFrequency:frequency};
 expect(keyDataRows(r).find(x=>x.label==="Dividend yield")!.value).toBe(value);
});
