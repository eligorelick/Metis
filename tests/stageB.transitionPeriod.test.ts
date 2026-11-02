import { expect, it } from "vitest";
import * as growth from "@/pipeline/stageB/growth";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

it("withholds newest and mid-history stubs from growth flow uses (FIN-111)",()=>{
  const row=(date:string,revenue:number)=>({date,revenue,epsDiluted:revenue/100,grossProfit:revenue*.4});
  const rows=[row("2024-12-31",73.2),row("2024-06-30",133.1),row("2023-06-30",121),row("2022-06-30",110),row("2021-06-30",100)];
  const g=growth.computeGrowth(rows,[],{period:"annual"});
  expect(g.asOf).toBe("2024-06-30");
  expect(g.revenueAcceleration.latestYoyPct).toBeCloseTo(10,1);
  expect(g.revenueLogLinear.growthPct).toBeCloseTo(10,0);
  expect(g.margins.gross.series.at(-1)?.date).toBe("2024-12-31");
  expect(g.gaps.some(g=>g.field==="growth.incomeStatement.transitionPeriod")).toBe(true);
  const mid=growth.computeGrowth([row("2024-12-31",140),row("2023-12-31",64),...rows.slice(2)],[],{period:"annual"});
  expect(mid.revenueCagrs.every(c=>c.cagrPct===null || c.cagrPct<20)).toBe(true);
  expect(mid.epsDilutedCagrs.every(c=>c.cagrPct===null || c.cagrPct<20)).toBe(true);
});
it("uses filed duration first and preserves the 356/357-day boundary and full-year controls",()=>{
  const filed=(date:string,periodStart:string)=>({date,fieldProvenance:{revenue:{periodStart}}});
  expect(growth.withoutTransitionPeriods([filed("2025-11-30","2025-01-01")]).withheld).toEqual([{date:"2025-11-30",days:334}]);
  expect(growth.withoutTransitionPeriods([filed("2025-12-22","2025-01-01")]).withheld).toEqual([{date:"2025-12-22",days:356}]);
  expect(growth.withoutTransitionPeriods([filed("2025-12-23","2025-01-01")]).withheld).toEqual([]);
  expect(growth.withoutTransitionPeriods([{date:"2025-12-22"},{date:"2024-12-31"}]).withheld[0]?.days).toBe(356);
  expect(growth.withoutTransitionPeriods(["2026-01-25","2025-01-26","2024-01-28","2023-01-29"].map(date=>({date}))).withheld).toEqual([]);
});
it("keeps transition rows out of ROIC and projection histories through the orchestrator",()=>{
  const b=completeCurrencyBundle({});
  if (!b.statements.incomeAnnual.ok) throw Error("fixture");
  b.statements.incomeAnnual.value.data.rows[0]!.fieldProvenance={revenue:{source:"edgar",periodStart:"2025-07-01",periodEnd:"2025-12-31",unit:"USD",tags:[],filings:[]}};
  const c=runStageB(b);
  expect(c.returns.roic.series.some(y=>y.date==="2025-12-31")).toBe(false);
  expect(JSON.stringify(c.projections)).not.toContain('"period":"FY2025"');
});
