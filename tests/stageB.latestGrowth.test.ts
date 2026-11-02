import { expect, it } from "vitest";
import { computeGrowth } from "@/pipeline/stageB/growth";
it("withholds latest YoY when the newest annual revenue was refused (FIN-405)",()=>{
  const rows=[2025,2024,2023,2022,2021].map((y,i)=>({date:`${y}-12-31`,revenue:i===0?null:100/1.1**i}));
  const g=computeGrowth(rows,[],{period:"annual"});
  expect(g.asOf).toBe("2025-12-31");
  expect(g.revenueAcceleration.latestYoyPct).toBeNull();
  expect(g.revenueAcceleration.deltaPctPts).toBeNull();
  expect(g.revenueAcceleration.note).toMatch(/newest.*unavailable|endpoint/);
  expect(computeGrowth(rows.slice(1),[],{period:"annual"}).revenueAcceleration.latestYoyPct).toBeCloseTo(10,1);
});
