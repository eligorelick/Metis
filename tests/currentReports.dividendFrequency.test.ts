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

it("RPT-201 rejects invalid units, concepts, points, forms, ages and future observations", () => {
 const f = facts();
 const c = f.facts["us-gaap"].CommonStockDividendsPerShareDeclared;
 expect(dividendFrequencyFromFacts({ ...f, facts: {} }, "2026-10-27", 0.26)).toBeNull();
 expect(dividendFrequencyFromFacts({ ...f, facts: {"us-gaap": { CommonStockDividendsPerShareDeclared: {} }} }, "2026-10-27", 0.26)).toBeNull();
 for (const patch of [{form:"8-K"}, {start:"2025-01-01"}, {end:"2027-01-01"}, {end:"2024-01-01"}, {filed:"2027-01-01"}, {val:"bad"}]) {
  const points = c.units["USD/shares"].map(p => ({...p, ...patch}));
  expect(dividendFrequencyFromFacts({...f, facts:{"us-gaap":{ CommonStockDividendsPerShareDeclared:{ units:{"USD/shares":points} }}}} as never,"2026-10-27",0.26)).toBeNull();
 }
 expect(dividendFrequencyFromFacts({...f, facts:{"us-gaap":{ CommonStockDividendsPerShareDeclared:{ units:{USD:c.units["USD/shares"]} }}}},"2026-10-27",0.26)).toBeNull();
 const duplicate = structuredClone(f);
 duplicate.facts["us-gaap"].CommonStockDividendsPerShareDeclared.units["USD/shares"].push({...c.units["USD/shares"][2]!, filed:"2026-10-01",val:0.3});
 expect(dividendFrequencyFromFacts(duplicate,"2026-10-27",0.3)).toBe("quarterly");
});

// PR #83 review: an increase stated with its payment and record dates keeps them.
it("keeps the payment and record dates of a dividend increase", () => {
 const facts = parseCapitalReturn("The Board increased its quarterly cash dividend from $0.10 per share to $0.12 per share, to be paid on November 12, 2026 to stockholders of record on November 5, 2026.");
 expect(facts.dividendChange).toEqual({ from: 0.1, to: 0.12, symbol: "$" });
 expect(facts.dividendPerShare).toMatchObject({ value: 0.12, frequency: "quarterly", payDate: "2026-11-12", recordDate: "2026-11-05" });
});
