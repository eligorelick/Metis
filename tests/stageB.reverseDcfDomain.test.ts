import { buildThesisTriggers } from "@/report/thesisTriggers";
import { expect, it } from "vitest";
import { buildDcfAssumptions, convergentFadePath, reverseDcf, runDcf } from "@/pipeline/stageB/valuation";

function assumptions() {
  const a=buildDcfAssumptions({revenueCagr3yPct:30,revenueCagr5yPct:30,waccPct:9,riskFreePct:4,analystEstimates:null,
    incomeTtm:{date:"2026-06-30",revenue:1000,operatingIncome:100,incomeBeforeTax:90,incomeTaxExpense:18.9},
    incomeHistory:[],balance:{date:"2026-06-30",basis:"quarter",totalDebt:300,totalStockholdersEquity:700,cashAndShortTermInvestments:100},marketCap:2000,domicileCountry:"US"}).assumptions!;
  a.growthPath.value=convergentFadePath(30,2.5,10);
  a.ebitMarginPath.value=[10,12.5,15,17.5,20,20,20,20,20,20];
  a.taxRatePath.value=Array(10).fill(21);
  a.salesToCapital.value=1;
  return a;
}
const opts={waccPct:9,netDebt:0,dilutedShares:100};
it("recovers the base terminal margin at model price and a lower margin below it (FIN-501)",()=>{
  const a=assumptions(), v=runDcf(a,opts);
  expect(v.perShare).toBeGreaterThan(0);
  expect(v.yearRows[0]!.fcff).toBeLessThan(0);
  expect(reverseDcf(v.perShare,a,opts).impliedTerminalMarginPct).toBeCloseTo(20,1);
  expect(reverseDcf(v.perShare!*.97,a,opts).impliedTerminalMarginPct).toBeLessThan(20);
});
it("never publishes a growth-range bound from a negative-explicit-PV run (FIN-104)",()=>{
  const a=assumptions();
  // A lower first-year growth keeps base FCFF positive, so growth inversion runs.
  a.growthPath.value=convergentFadePath(1,2.5,10);
  a.ebitMarginPath.value=Array(10).fill(20);
  a.salesToCapital.value=.3;
  const result=reverseDcf(10000,a,opts);
  if (result.growthOutsideRange) {
    const g=result.growthOutsideRange.boundPct;
    const candidate=runDcf({...a,growthPath:{...a.growthPath,value:convergentFadePath(g,2.5,10)}},opts);
    expect(candidate.pvExplicit).toBeGreaterThanOrEqual(0);
    expect(candidate.equityValue).toBeGreaterThan(0);
  }
  expect(result.notes.join(" ")).toMatch(/domain/);
});

it("publishes the OD-11 shifted margin family with the five-year ramp",()=>{
  const a=assumptions();a.ebitMarginPath.value=[10,11,14,19,20,20,20,20,20,20];
  const r=reverseDcf(runDcf(a,opts).perShare!*.97,a,opts);
  expect(r.marginPathFamily).toBe("base-shift-to-terminal");
  const triggers=buildThesisTriggers({valuation:{kind:"dcf",assumptions:a,dcf:runDcf(a,opts),reverseDcf:r},projections:{series:[]}} as never);
  expect(triggers.find(t=>t.id === "reverse-margin")?.horizon).toMatch(/ramp.*5.*years/);
  expect(r.impliedMarginPathPct?.[1]).toBeCloseTo(11+(r.impliedTerminalMarginPct!-20)*.25,8);
  expect(r.impliedMarginPathPct?.[4]).toBeCloseTo(r.impliedTerminalMarginPct!,8);
});
