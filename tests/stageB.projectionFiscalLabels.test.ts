import { expect, it } from "vitest";
import { computeProjections } from "@/pipeline/stageB/projections";
import { runStageB } from "@/pipeline/compute";
import { projectionCellPoint, projectionPeriodRows } from "@/report/surfaceManifest";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

it("preserves every actual at January collisions and uses the filed fiscal year (FIN-127)",()=>{
  const c=runStageB(completeCurrencyBundle({}));
  const dates=["2022-01-02","2023-01-01","2023-12-31","2024-12-29","2025-12-28"];
  const base={route:c.route,valuation:c.valuation,waccPct:c.returns.wacc.waccPct,dilutedShares:100e6,shareCountAnnualizedPct:null,currency:"USD",asOf:"2026-07-06"};
  const p=computeProjections({...base,incomeHistory:dates.map((date,i)=>({date,revenue:100+i*10,ebit:20,epsDiluted:1,netIncome:15})),fcfHistory:dates.map(date=>({date,fcf:10}))});
  for(const s of p.series) {
    expect(new Set(s.historical.map(p=>p.period)).size).toBe(s.historical.length);
    expect(projectionPeriodRows(s).filter(row=>projectionCellPoint(row,"historical",s.unit)!==null).length).toBe(s.historical.length);
  }
  const retail=computeProjections({...base,incomeHistory:["2022-01-30","2023-01-29","2024-01-28","2025-02-02","2026-02-01"].map((date,i)=>({date,fiscalYear:String(2021+i),revenue:100+i*10,ebit:20,epsDiluted:1,netIncome:15})),fcfHistory:[{date:"2026-02-01",fcf:10}]});
  expect(retail.series.find(s=>s.metric==="revenue")!.historical.at(-1)!.period).toBe("FY2025");
  expect(retail.series.find(s=>s.metric==="fcf")!.historical.at(-1)!.period).toBe("FY2025");
});
