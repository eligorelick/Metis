import { expect, it } from "vitest";
import { computeWacc } from "@/pipeline/stageB/returns";
const common={beta:1,riskFreePct:4,erpPct:4.5,marketCap:100e9,effectiveTaxRate:.21,ebitTtm:10e9,totalAssets:200e9};
it("admits the debt leg using the same latest debt that supplies its weight (FIN-116)",()=>{
  const r=computeWacc({...common,totalDebtAvg:0,totalDebtLatest:10e9,interestExpenseTtm:null});
  expect(r.waccPct===null || (r.weightDebt??0)>0).toBe(true);
  expect(r.gaps.some(g=>g.severity==="critical")).toBe(true);
});
it("does not demand a debt cost after the weighted balance is fully repaid",()=>{
  const r=computeWacc({...common,totalDebtAvg:5e9,totalDebtLatest:0,interestExpenseTtm:0});
  expect(r.waccPct).not.toBeNull();
  expect(r.weightDebt).toBe(0);
  expect(r.gaps.some(g=>g.severity==="critical")).toBe(false);
});
