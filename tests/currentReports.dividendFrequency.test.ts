import {expect,it} from "vitest";
import {parseCapitalReturn} from "@/edgar/currentReports";
it.each([
 ["The Board declared a special cash dividend of $1.00 per share and a regular quarterly cash dividend of $0.35 per share.",0.35,"quarterly"],
 ["The Board will propose a cash dividend of $3.60 per share, payable in four equal quarterly installments.",3.6,"annual"],
 ["The Board declared a monthly cash dividend of $0.50 per share.",0.5,"monthly"],
 ["The Board declared a cash dividend of $0.26 per share.",0.26,null],
 ["The Board declared a special dividend of $1.00 per share. The dividend of $1.00 per share is payable on November 30, 2026.",1,"special"],
])("RPT-201 %s",(s,value,frequency)=>expect(parseCapitalReturn(s).dividendPerShare).toMatchObject({value,frequency}));

import {dividendFrequencyFromFacts} from "@/edgar/dividendFrequency";
const facts=(n=3,value=0.26)=>({cik:1,entityName:"Example",facts:{"us-gaap":{CommonStockDividendsPerShareDeclared:{units:{"USD/shares":["2026-03-31","2026-06-30","2026-09-30"].slice(0,n).map(end=>({start:new Date(Date.parse(end)-90*86400000).toISOString().slice(0,10),end,val:value,form:"10-Q",filed:end,accn:end}))}}}}});
it("requires three positive quarterly facts and a matching latest per-share amount",()=>{
 expect(dividendFrequencyFromFacts(facts(),"2026-10-27",0.26)).toBe("quarterly");
 expect(dividendFrequencyFromFacts(facts(2),"2026-10-27",0.26)).toBeNull();
 expect(dividendFrequencyFromFacts(facts(3,0.7905),"2026-10-27",0.2635)).toBeNull();
 expect(dividendFrequencyFromFacts(facts(3,0),"2026-10-27",0.5)).toBeNull();
});
