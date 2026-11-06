import { expect, it } from "vitest";
import { buildDcfAssumptions } from "@/pipeline/stageB/valuation";

it("does not publish a known incompatible pre-transaction annual base as a matched current valuation",()=>{
  const reason="A later consolidated comparative proves a changed operating perimeter; this annual base has not been recast.";
  const out=buildDcfAssumptions({revenueCagr3yPct:5,revenueCagr5yPct:5,analystEstimates:null,waccPct:9,riskFreePct:4,
    valuationDate:"2026-10-30",incomeTtm:{date:"2025-12-31",basis:"annual",revenue:1000,operatingIncome:200,incomeBeforeTax:190,incomeTaxExpense:40,operatingPerimeterRefusal:reason},
    incomeHistory:[2025,2024,2023].map(y=>({date:`${y}-12-31`,revenue:1000,operatingIncome:200,incomeBeforeTax:190,incomeTaxExpense:40})),
    balance:{date:"2026-09-30",basis:"quarter",totalDebt:100,totalStockholdersEquity:500,cashAndShortTermInvestments:0},marketCap:2000});
  expect(out.assumptions).toBeNull();
  expect(out.gaps.some(g=>g.reason===reason)).toBe(true);
});
