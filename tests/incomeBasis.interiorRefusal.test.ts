import { expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { computeGrowth } from "@/pipeline/stageB/growth";
import { fundamentalsChartDataFromBundle } from "@/components/charts/map";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

it("withholds a margin trend across an interior unavailable year while retaining dated observations",()=>{
 const rows=[10,20,null,40,50].map((operatingIncome,i)=>({date:`${2021+i}-12-31`,revenue:100,operatingIncome}));
 const trend=computeGrowth(rows,[],{period:"annual"}).margins.operating;
 expect(trend.slopePctPtsPerYear).toBeNull();expect(trend.note).toMatch(/interior.*2023-12-31/i);
 expect(trend.series.map(p=>p.pct)).toEqual([10,20,null,40,50]);
});
it("carries an interior refusal into the score, DCF regime, chart and projection history",()=>{
 const b=completeCurrencyBundle({siblingQuarterCurrencies:["USD","USD","USD","USD"]});
 if(!b.statements.incomeAnnual.ok)throw Error("fixture");
 const rows=b.statements.incomeAnnual.value.data.rows;
 rows.forEach((r,i)=>{r.operatingIncome=r.revenue!*(0.4-i*0.1);});
 rows[1]!.fieldConflicts={operatingIncome:{usable:false,cause:"operating-basis",vendorValue:rows[1]!.operatingIncome!,secValue:null,reason:"Uncorroborated numerator"}};
 const c=runStageB(b);
 expect(c.growth.margins.operating.slopePctPtsPerYear).toBeNull();
 const signals=Object.values(c.scores.aspects).flatMap(a=>a.signals);
 expect(signals.find(s=>s?.id==="operatingMarginSlope")).toBeUndefined();
 if(c.valuation.kind!=="dcf"||!c.valuation.assumptions)throw Error("DCF expected");
 expect(c.valuation.assumptions.ebitMarginPath.basis).toMatch(/interior.*2024-12-31/);
 expect(c.valuation.assumptions.improvingMarginFade).toBeUndefined();
 expect(fundamentalsChartDataFromBundle(b,c).margins.find(p=>p.period==="2024-12-31")?.operatingPct).toBeNull();
 const projection=c.projections.series.find(s=>s.metric==="operatingMargin");
 expect(projection?.historical).toEqual([]);
 expect(projection?.disclosures.some(g=>g.field==="projections.operatingMargin.historical"&&g.reason.includes("2024"))).toBe(true);
});
