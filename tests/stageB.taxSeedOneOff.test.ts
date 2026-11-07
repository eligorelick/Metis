import { describe, expect, it } from "vitest";
import { buildDcfAssumptions, type DcfAssumptionInputs } from "@/pipeline/stageB/valuation";

const history = [[700,182,175,37],[760,198,190,40],[830,216,207,44],[900,234,225,47],[960,250,240,50]].map(([revenue,operatingIncome,incomeBeforeTax,incomeTaxExpense],i)=>({date:`${2021+i}-12-31`,revenue:revenue!,operatingIncome:operatingIncome!,incomeBeforeTax,incomeTaxExpense}));
function build(charge:number, tax=52.5, historyTax=true) {
  const inputs: DcfAssumptionInputs = {revenueCagr3yPct:10,revenueCagr5yPct:10,analystEstimates:null,waccPct:9,riskFreePct:4,
    incomeTtm:{date:"2026-06-30",basis:"ttm",revenue:1000,operatingIncome:260-charge,incomeBeforeTax:250-charge,incomeTaxExpense:tax},
    incomeHistory:history.map(r=>({...r,incomeTaxExpense:historyTax?r.incomeTaxExpense:null})),
    unusualOperatingItems:charge===0?null:{value:-charge,components:[{tag:"GoodwillImpairmentLoss",value:-charge}],withheld:[],basis:"filed charge"},
    balance:{date:"2026-06-30",basis:"quarter",totalDebt:200,totalStockholdersEquity:800,cashAndShortTermInvestments:300},marketCap:5000,domicileCountry:"US"};
  return buildDcfAssumptions(inputs).assumptions!;
}
describe("DCF tax seed without admitted one-offs (FIN-502)",()=>{
  it("identifies a negative observed rate as an excluded tax benefit",()=>{
    expect(build(0,-10).taxRatePath.basis).toMatch(/observed.*-4%.*tax benefit.*excluded/i);
    expect(build(0,-10).taxRatePath.basis).not.toMatch(/not computable/);
  });
  it("uses the company median inside the no-tax-effect and marginal-effect range",()=>{
    expect(build(100).taxRatePath.value[0]).toBeCloseTo(21.0526315789,8);
    expect(build(100).taxRatePath.basis).toMatch(/re-read without tagged one-off/);
  });
  it("keeps a deductible charge at the nearer end and uses marginal effect without history",()=>{
    expect(build(100,31.5).taxRatePath.value[0]).toBeCloseTo(21,8);
    expect(build(100,52.5,false).taxRatePath.value[0]).toBeCloseTo(29.4,8);
  });
  it("preserves the negative-tax fallback and unchanged no-one-off rate",()=>{
    expect(build(.1,-10).taxRatePath.value).toEqual(build(0,-10).taxRatePath.value);
    expect(build(0).taxRatePath.value[0]).toBe(21);
  });
});
