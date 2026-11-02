import { expect, it } from "vitest";
import { computeWacc, waccDisclosure } from "@/pipeline/stageB/returns";
it.each([["IE",5.01],["CH",4.23],["US",4.46]] as const)("labels the selected %s ERP row without changing its value (FIN-114)",(country,pct)=>{
  const r=computeWacc({beta:1,riskFreePct:4,erpPct:pct,erpCountry:country,totalDebtAvg:0,interestExpenseTtm:0,marketCap:1000,effectiveTaxRate:.21});
  expect(waccDisclosure(r).erp.pct).toBe(pct);
  expect(waccDisclosure(r).erp.source).toContain(`${country} totalEquityRiskPremium`);
});
