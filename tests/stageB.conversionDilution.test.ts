import { describe, expect, it } from "vitest";
import { computeCapital } from "@/pipeline/stageB/capital";
import { runStageB } from "@/pipeline/compute";
import type { CompanyFacts } from "@/edgar/xbrl";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const at="2026-07-06T00:00:00Z";
const point=(val:number,extra:Record<string,unknown>={})=>({start:"2025-01-01",end:"2025-12-31",val,form:"10-K",filed:"2026-02-01",accn:"0000000001-26-000001",fy:2025,fp:"FY",...extra});
function facts(tags:Record<string,ReturnType<typeof point>[]>, unitOverride?:string):CompanyFacts{
 return {cik:1,entityName:"Example",facts:{"us-gaap":Object.fromEntries(Object.entries(tags).map(([tag,points])=>[tag,{units:{[unitOverride??(/Shares/.test(tag)?"shares":"USD")]:points}}]))}};
}
const income=[{date:"2025-12-31",weightedAverageShsOutDil:166.25},{date:"2024-12-31",weightedAverageShsOutDil:100}];
const calculate=(companyFacts:CompanyFacts,asOf=at)=>computeCapital(income,[],[],[],{price:null},{companyFacts,asOf,reportedCurrency:"USD"});
describe("N3 conversion is not a dilution signal",()=>{
 it.each(["StockIssuedDuringPeriodSharesConversionOfConvertibleSecurities","ConversionOfStockSharesConverted"])("withholds the spanning annual trend for filed %s",tag=>{
  const out=calculate(facts({[tag]:[point(60)]}));
  expect(out.shareCount).toMatchObject({annualizedPct:null,trendPct:null,direction:null,startShares:100,endShares:166.25,note:expect.stringMatching(/conversion.*not.*dilution/i)});
  expect(out.gaps.some(g=>g.field==="capital.shareCountTrend.conversion"&&/0000000001-26-000001/.test(g.reason))).toBe(true);
 });
 it("withholds a filed IPO with a same-filing two-class participating allocation",()=>{
  const out=calculate(facts({ProceedsFromIssuanceInitialPublicOffering:[point(100e6)],UndistributedEarningsLossAllocatedToParticipatingSecuritiesBasic:[point(20e6)]}));
  expect(out.shareCount.annualizedPct).toBeNull();
  expect(out.shareCount.note).toMatch(/IPO.*participating/);
 });
 it.each(["ordinary issuance","IPO alone","later filing","outside span","other form","other unit","different filing","no cutoff"])("keeps genuine dilution measurable: %s",reason=>{
  const tag=reason==="ordinary issuance"?"StockIssuedDuringPeriodSharesNewIssues":reason==="IPO alone"?"ProceedsFromIssuanceInitialPublicOffering":"ConversionOfStockSharesConverted";
  let f=facts({[tag]:[point(60,reason==="later filing"?{filed:"2027-02-01"}:reason==="outside span"?{start:"2022-01-01",end:"2022-12-31"}:reason==="other form"?{form:"S-1"}:{})]},reason==="other unit"?"USD":undefined);
  if(reason==="different filing")f=facts({ProceedsFromIssuanceInitialPublicOffering:[point(100e6)],UndistributedEarningsLossAllocatedToParticipatingSecuritiesBasic:[point(20e6,{accn:"0000000001-26-000002"})]});
  const out=calculate(f,reason==="no cutoff"?"":at);
  expect(out.shareCount.annualizedPct).toBeCloseTo(66.25);
  expect(out.shareCount.direction).toBe("dilution");
 });
 it("wires admitted filed conversion evidence into Stage B scoring",()=>{
  const b=completeCurrencyBundle({});
  if(b.statements.incomeAnnual.ok)b.statements.incomeAnnual.value.data.rows.forEach((r,i)=>{r.weightedAverageShsOutDil=i===0?166.25:100;});
  expect(runStageB(b).scores.aspects.leadership.drivers.some(d=>d.source.includes("shareCount"))).toBe(true);
  b.edgar.registrant={...b.edgar.registrant!,cik10:"0000000001",tickers:[b.symbol]};
  b.edgar.cik={ok:true,value:{data:{cik:1,cik10:"0000000001",ticker:b.symbol,title:"Example"},source:"edgar",asOf:at.slice(0,10),fetchedAt:at,endpoint:"retained"}};
  b.edgar.companyFacts={ok:true,value:{data:facts({ConversionOfStockSharesConverted:[point(60)]}),source:"edgar",asOf:at.slice(0,10),fetchedAt:at,endpoint:"retained"}};
  const out=runStageB(b);
  expect(out.capital.shareCount.annualizedPct).toBeNull();
  expect(out.scores.aspects.leadership.drivers.some(d=>d.source.includes("shareCount"))).toBe(false);
 });
});

describe("L7 no award attribution across a filed conversion", () => {
 const awards = (companyFacts: CompanyFacts, asOf = at) => computeCapital([
  { date: "2025-12-31", weightedAverageShsOut: 100, weightedAverageShsOutDil: 125 },
  { date: "2024-12-31", weightedAverageShsOut: 90, weightedAverageShsOutDil: 100 },
 ], [], [], [], { price: null }, { companyFacts, asOf, reportedCurrency: "USD" });
 it.each(["conversion", "participating-ipo"])("withholds the award fact for %s while retaining source counts", mode => {
  const f = mode === "conversion" ? facts({ ConversionOfStockSharesConverted: [point(60)] }) :
   facts({ ProceedsFromIssuanceInitialPublicOffering: [point(100e6)], UndistributedEarningsLossAllocatedToParticipatingSecuritiesBasic: [point(20e6)] });
  const out = awards(f);
  expect(out.dilution).toMatchObject({ basicShares: 100, dilutedShares: 125, overhangPct: null, asOf: "2025-12-31" });
  expect(out.dilution.note).toMatch(/unavailable.*conversion.*awards/i);
  expect(out.notes.join(" ")).not.toContain("Dilution from outstanding awards:");
  expect(out.gaps.find(g => g.field === "capital.dilution.conversion")).toMatchObject({ severity: "info", reason: expect.stringContaining("0000000001-26-000001") });
 });
 it.each(["ordinary issuance", "IPO alone", "prior fiscal year", "later filing", "other form", "other unit", "no cutoff"])("retains award evidence for %s", mode => {
  const tag = mode === "ordinary issuance" ? "StockIssuedDuringPeriodSharesNewIssues" : mode === "IPO alone" ? "ProceedsFromIssuanceInitialPublicOffering" : "ConversionOfStockSharesConverted";
  const f = facts({ [tag]: [point(60, mode === "prior fiscal year" ? { start: "2024-01-01", end: "2024-12-31" } : mode === "later filing" ? { filed: "2027-02-01" } : mode === "other form" ? { form: "S-1" } : {})] }, mode === "other unit" ? "USD" : undefined);
  expect(awards(f, mode === "no cutoff" ? "" : at).dilution.overhangPct).toBe(25);
 });
});

it("L7 does not stretch the fiscal-year award window across missing annual rows", () => {
 const out = computeCapital([
  { date: "2025-12-31", weightedAverageShsOut: 100, weightedAverageShsOutDil: 125 },
  { date: "2023-12-31", weightedAverageShsOut: 90, weightedAverageShsOutDil: 100 },
 ], [], [], [], { price: null }, { companyFacts: facts({ ConversionOfStockSharesConverted: [point(60, { start: "2024-01-01", end: "2024-12-31" })] }), asOf: at, reportedCurrency: "USD" });
 expect(out.dilution.overhangPct).toBe(25);
});
