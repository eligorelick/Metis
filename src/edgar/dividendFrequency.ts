import { factPointSchema, conceptFactsSchema, type CompanyFacts } from "./xbrl";
/** OD-5: a quarterly duration alone cannot establish a payment frequency. */
export function dividendFrequencyFromFacts(facts:CompanyFacts,asOf:string,perShare:number):"quarterly"|null {
 const ends=new Map<string,{value:number;filed:string}>();
 for(const tag of ["CommonStockDividendsPerShareDeclared","CommonStockDividendsPerShareCashPaid"]){
  const concept=conceptFactsSchema.safeParse(facts.facts["us-gaap"]?.[tag]);
  if(!concept.success)continue;
  for(const [unit,points] of Object.entries(concept.data.units)) {
   if(!/^[A-Z]{3}\/shares$/.test(unit))continue;
   for(const raw of points){
    const parsed=factPointSchema.safeParse(raw);if(!parsed.success)continue;const p=parsed.data;
    const days=(Date.parse(p.end)-Date.parse(p.start??""))/86400000+1, age=(Date.parse(asOf)-Date.parse(p.end))/86400000;
    if(!/^10-[QK](?:\/A)?$/.test(p.form??"")||days<80||days>100||age<0||age>400||p.val<=0||p.filed>asOf)continue;
    if(!ends.has(p.end)||ends.get(p.end)!.filed<p.filed)ends.set(p.end,{value:p.val,filed:p.filed});
   }
  }
 }
 const newest=[...ends].sort(([a],[b])=>b.localeCompare(a))[0];
 return ends.size>=3 && newest && Math.abs(newest[1].value-perShare)<0.005 ? "quarterly":null;
}
