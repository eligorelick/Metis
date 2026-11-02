import { expect, it } from "vitest";
import { computeRoic } from "@/pipeline/stageB/returns";
import { terminalRoic } from "@/pipeline/stageB/valuation";

it("counts an operating loss as a terminal hurdle miss while preserving reported ROIC (FIN-102)",()=>{
  const income=[2025,2024,2023,2022,2021].map(y=>({date:`${y}-12-31`,operatingIncome:y===2023?-10:170,incomeBeforeTax:y===2023?-20:160,incomeTaxExpense:y===2023?0:33.6}));
  const balance=[2025,2024,2023,2022,2021,2020].map(y=>({date:`${y}-12-31`,totalDebt:300,totalStockholdersEquity:600,cashAndShortTermInvestments:100}));
  const r=computeRoic(income,balance,{domicileCountry:"US"});
  expect(r.series.find(y=>y.date==="2023-12-31")?.roicPct).toBeNull();
  expect(terminalRoic(9,r.series.map(y=>({...y,roicPct:y.terminalEvidenceRoicPct??y.roicPct}))).roicTermPct).toBe(9);
  expect(terminalRoic(9,r.series.map(y=>({...y,roicPct:y.terminalEvidenceRoicPct??y.roicPct}))).note).toMatch(/2023-12-31.*operating loss/);
  const adjusted=computeRoic(income,balance,{domicileCountry:"US",unusualByYear:new Map([["2023-12-31",-180]])});
  expect(terminalRoic(9,adjusted.series.map(y=>({...y,roicPct:y.terminalEvidenceRoicPct??y.roicPct}))).roicTermPct).toBeGreaterThan(9);
});
