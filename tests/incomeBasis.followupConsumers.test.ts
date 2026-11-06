import { expect, it, vi } from "vitest";
import * as projections from "@/pipeline/stageB/projections";
import * as valuation from "@/pipeline/stageB/valuation";
import { runStageB } from "@/pipeline/compute";
import { validateBundle } from "@/pipeline/stageA/validate";
import { computeGrowth, missingAnnualIntervals, type GrowthIncomeRow } from "@/pipeline/stageB/growth";
import { fundamentalsChartDataFromBundle } from "@/components/charts/map";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { enrichDataOnlyReport } from "@/pipeline/stageC/dataOnlyReport";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import { loadTask28Fixture } from "./helpers/task28Report";

it.each([false,true])("propagates the specific gross-profit refusal and its improving-forecast consequence through real consumers (retained refusal %s)", retained => {
  const b = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD","USD","USD","USD"] });
  const revenue: object[] = [], operating: object[] = [];
  for (const [name, annual] of [["incomeAnnual",true],["incomeQuarterly",false]] as const) {
    const input=b.statements[name]; if(!input.ok) throw Error("fixture");
    input.value.data.rows.forEach((r,i)=>{
      r.cik="42"; r.operatingIncome=r.revenue!*(annual ? .4-i*.08 : .4);
      if(retained) r.fieldConflicts={grossProfit:{usable:false,vendorValue:r.grossProfit ?? null,secValue:null,
        reason:"Gross profit withheld: the filed operating-revenue presentation has no compatible full gross-profit or cost basis."}};
      const year=r.date!.slice(0,4), month=Number(r.date!.slice(5,7));
      const p={start:annual?`${year}-01-01`:`${year}-${String(month-2).padStart(2,"0")}-01`,end:r.date,
        filed:"2026-05-01",accn:`${name}-${r.date}`,form:annual?"10-K":"10-Q",fy:Number(year),fp:annual?"FY":`Q${month/3}`};
      revenue.push({...p,val:r.revenue}); operating.push({...p,val:r.operatingIncome});
    });
  }
  withIssuerFacts(b,{cik:42,entityName:"Synthetic",facts:{"us-gaap":{Revenues:{units:{USD:revenue}},OperatingIncomeLoss:{units:{USD:operating}}}}});
  const c=runStageB(b), reason="Gross profit withheld: the filed operating-revenue presentation has no compatible full gross-profit or cost basis.";
  expect(c.gaps.some(g=>g.reason===reason)).toBe(true);
  if(c.valuation.kind!=="dcf" || !c.valuation.assumptions) throw Error("DCF expected");
  expect(c.valuation.assumptions.ebitMarginPath.basis).toMatch(/improving/);
  expect(c.valuation.assumptions.ebitMarginPath.basis).toMatch(/supported gross.profit ceiling.*unavailable/i);
  expect(new Set(c.valuation.assumptions.ebitMarginPath.value).size).toBe(1);
  const payload=assembleContextPayload(b,c,validateBundle(b,{now:new Date(b.builtAt)}));
  const report=enrichDataOnlyReport(loadTask28Fixture(),{bundle:b,computed:c,reason:"Synthetic proof propagation"});
  for(const text of [JSON.stringify(payload),JSON.stringify(report),reportToMarkdown(report),reportToPrintBody(report)]) {
    expect(text).toContain(reason);
    expect(text).toMatch(/supported gross.profit ceiling.*unavailable/i);
  }
});

it("recognizes a wholly absent fiscal slot, qualifies history and inserts a chart interval without inventing a filing date",()=>{
  const b=completeCurrencyBundle({siblingQuarterCurrencies:["USD","USD","USD","USD"]});
  if(!b.statements.incomeAnnual.ok) throw Error("fixture");
  b.statements.incomeAnnual.value.data.rows=b.statements.incomeAnnual.value.data.rows.filter(r=>r.fiscalYear!=="2023");
  for(const [i,r] of b.statements.incomeAnnual.value.data.rows.entries()) {
    r.periodStart=`${r.date!.slice(0,4)}-01-01`; r.operatingIncome=r.revenue!*(.4-i*.1);
  }
  const c=runStageB(b);
  expect(c.growth.margins.operating.slopePctPtsPerYear).toBeNull();
  expect(c.growth.margins.operating.note).toMatch(/absent.*FY 2023/i);
  if(c.valuation.kind!=="dcf"||!c.valuation.assumptions) throw Error("DCF expected");
  expect(c.valuation.assumptions.ebitMarginPath.basis).toMatch(/absent.*FY 2023/i);
  const chart=fundamentalsChartDataFromBundle(b,c).margins;
  expect(chart.some(p=>p.period.includes("FY 2023") && p.period.includes("missing") && p.operatingPct===null)).toBe(true);
  expect(chart.some(p=>p.period==="2023-12-31")).toBe(false);
  expect(c.projections.series.find(s=>s.metric==="operatingMargin")?.historical ?? []).toEqual([]);
});

it.each(["labels only","transition","changed fiscal end","52/53 consecutive"])("does not fabricate a missing annual slot from %s", mode=>{
  let rows=[2021,2023,2024].map((y,i)=>({date:`${y}-12-31`,fiscalYear:String(y),period:"FY",periodStart:`${y}-01-01`,revenue:100,operatingIncome:10+i*10}));
  if(mode==="labels only") rows=rows.map(r=>({...r,periodStart:""}));
  if(mode==="transition") rows[1]!.periodStart="2023-07-01";
  if(mode==="changed fiscal end") Object.assign(rows[1]!,{date:"2023-06-30",periodStart:"2022-07-01"});
  if(mode==="52/53 consecutive") rows=[{date:"2022-01-01",periodStart:"2021-01-03",fiscalYear:"2021",period:"FY",revenue:100,operatingIncome:10},
    {date:"2022-12-31",periodStart:"2022-01-02",fiscalYear:"2022",period:"FY",revenue:100,operatingIncome:20},
    {date:"2024-01-06",periodStart:"2023-01-01",fiscalYear:"2023",period:"FY",revenue:100,operatingIncome:30}];
  expect(computeGrowth(rows,[],{period:"annual"}).margins.operating.note ?? "").not.toMatch(/absent fiscal/i);
});

it("withholds the regular FY2021/2023/2024 slope for the absent FY2022 slot",()=>{
  const rows=[2021,2023,2024].map((y,i)=>({date:`${y}-12-31`,fiscalYear:String(y),period:"FY",periodStart:`${y}-01-01`,revenue:100,operatingIncome:10+i*10}));
  const out=computeGrowth(rows,[],{period:"annual"}).margins.operating;
  expect(out.slopePctPtsPerYear).toBeNull();
  expect(out.missingIntervals).toMatchObject([{after:"2021-12-31",before:"2023-12-31",fiscalYears:[2022]}]);
  expect(out.series.map(p=>p.date)).toEqual(rows.map(r=>r.date));
});

it("transports the actual limited margin-history support into the analyst payload as well as report exports",()=>{
  const b=completeCurrencyBundle({siblingQuarterCurrencies:["USD","USD","USD","USD"]});
  if(!b.statements.incomeAnnual.ok) throw Error("fixture");
  for(const row of b.statements.incomeAnnual.value.data.rows.slice(3,5)) {
    row.operatingIncome=undefined;
    row.fieldConflicts={operatingIncome:{usable:false,cause:"operating-scope",vendorValue:null,secValue:null,reason:"Unproved historical scope"}};
  }
  const c=runStageB(b);
  if(c.valuation.kind!=="dcf" || !c.valuation.assumptions) throw Error("DCF expected");
  const basis=c.valuation.assumptions.ebitMarginPath.basis;
  expect(basis).toContain("historical support: 3 observed annual margins");
  expect(basis).toContain("unsupported annual margins:");
  const payload=assembleContextPayload(b,c,{checks:[],flags:[],gaps:[]});
  expect(JSON.stringify(payload)).toContain(basis);
});

it.each([true,false])("discloses incomplete displayed operating history without a DCF (explicit fiscal labels %s)", labels=>{
  const b=completeCurrencyBundle({siblingQuarterCurrencies:["USD","USD","USD","USD"]});
  if(!b.statements.incomeAnnual.ok) throw Error("fixture");
  for(const [i,row] of b.statements.incomeAnnual.value.data.rows.entries()) {
    if(i>=3) { row.operatingIncome=undefined; row.fieldConflicts={operatingIncome:{usable:false,cause:"operating-scope",vendorValue:null,secValue:null,reason:"Unproved historical scope"}}; }
    if(!labels) row.fiscalYear=undefined;
  }
  for(const input of [b.statements.incomeAnnual,b.statements.incomeQuarterly]) if(input.ok) {
    for(const row of input.value.data.rows) row.operatingPerimeterRefusal="Synthetic current perimeter is incompatible with the selected base.";
  }
  // Serialize first: consumer support must also work on saved computations
  // containing only recorded date/pct points, without new optional metadata.
  const c=JSON.parse(JSON.stringify(runStageB(b))) as ReturnType<typeof runStageB>;
  if(c.valuation.kind!=="dcf") throw Error("DCF route expected");
  expect(c.valuation.assumptions).toBeNull();
  expect(c.growth.margins.operating.series.filter(p=>p.pct!==null)).toHaveLength(3);
  const before=JSON.stringify(c),payload=assembleContextPayload(b,c,{checks:[],flags:[],gaps:[]});
  const report=enrichDataOnlyReport(loadTask28Fixture(),{bundle:b,computed:c,reason:"Synthetic no-DCF history"});
  const expectedSupport="Displayed operating-margin history: 3 observed annual margins across 4 recorded annual rows from 2022-12-31 to 2025-12-31. " +
    `Observed periods: ${[2023,2024,2025].map(y=>`${y}-12-31${labels ? ` (FY${y})` : ""}`).join(", ")}. ` +
    `Unsupported recorded periods: 2022-12-31${labels ? " (FY2022)" : ""}. Model seed support, when used, is stated separately.`;
  for(const text of [JSON.stringify(payload),JSON.stringify(report),reportToMarkdown(report),reportToPrintBody(report)]) {
    expect(text).toContain(expectedSupport);
  }
  expect(JSON.stringify(c)).toBe(before);
});

const recentCadence=(): GrowthIncomeRow[]=>[2021,2023,2024].map((y,i)=>({date:`${y}-12-31`,periodStart:`${y}-01-01`,period:"FY",fiscalYear:String(y),revenue:100,operatingIncome:10+i*10}));
it.each(["changed end","unknown start","short duration"])("keeps the proved recent FY2022 gap beside a remote %s", mode=>{
  const old:GrowthIncomeRow={date:"2020-06-30",periodStart:"2019-07-01",fiscalYear:"2020",period:"FY",revenue:100,operatingIncome:1};
  if(mode==="unknown start") old.periodStart=undefined;
  if(mode==="short duration") old.periodStart="2020-01-01";
  const out=computeGrowth([old,...recentCadence()],[],{period:"annual"}).margins.operating;
  expect(out.slopePctPtsPerYear).toBeNull();
  expect(out.missingIntervals).toMatchObject([{after:"2021-12-31",before:"2023-12-31",fiscalYears:[2022]}]);
  expect(out.missingIntervals).toHaveLength(1);
});
it("does not use a consecutive pair from a different cadence to invent a slot across a transition",()=>{
  const old=[2019,2020].map(y=>({date:`${y}-06-30`,periodStart:`${y-1}-07-01`,period:"FY",fiscalYear:String(y)}));
  expect(missingAnnualIntervals([...old,...recentCadence().slice(0,2)])).toEqual([]);
});
it.each(["missing start","invalid start","short duration","null value"])("keeps a present internal %s row distinct from an absent fiscal slot",mode=>{
  const middle:GrowthIncomeRow={date:"2022-12-31",periodStart:"2022-01-01",period:"FY",fiscalYear:"2022",revenue:100,operatingIncome:undefined};
  if(mode==="missing start") middle.periodStart=undefined;
  if(mode==="invalid start") middle.periodStart="2022-02-30";
  if(mode==="short duration") middle.periodStart="2022-07-01";
  const rows=[...recentCadence(),middle];
  expect(missingAnnualIntervals(rows)).toEqual([]);
  const out=computeGrowth(rows,[],{period:"annual"}).margins.operating;
  expect(out.missingIntervals ?? []).toEqual([]);
  expect(out.slopePctPtsPerYear).toBeNull();
  expect(out.series.find(p=>p.date==="2022-12-31")?.pct).toBeNull();
});
it("recognizes a local 52/53-week missing slot without extending it across an older calendar change",()=>{
  const rows=[{date:"2020-06-30",periodStart:"2019-07-01",fiscalYear:"2020"},
    {date:"2022-01-01",periodStart:"2021-01-03",fiscalYear:"2021"},
    {date:"2024-01-06",periodStart:"2023-01-01",fiscalYear:"2023"},
    {date:"2025-01-04",periodStart:"2024-01-07",fiscalYear:"2024"}].map(r=>({...r,period:"FY"}));
  expect(missingAnnualIntervals(rows)).toMatchObject([{after:"2022-01-01",before:"2024-01-06",fiscalYears:[2022]}]);
  expect(missingAnnualIntervals(rows)).toHaveLength(1);
});
it.each(["invalid end","missing end"])("locates a present %s by fiscal identity without removing an internal barrier",mode=>{
  const row={date:mode==="invalid end" ? "2022-02-30" : "",period:"FY",fiscalYear:"2022",periodStart:"2022-01-01"};
  expect(missingAnnualIntervals([...recentCadence(),row])).toEqual([]);
  // A provably remote unsupported row does not invalidate a later local run.
  expect(missingAnnualIntervals([...recentCadence(),{...row,fiscalYear:"2019"}]))
    .toMatchObject([{after:"2021-12-31",before:"2023-12-31",fiscalYears:[2022]}]);
  // Neither date nor FY locates this row; conservatively refuse inference.
  expect(missingAnnualIntervals([...recentCadence(),{...row,fiscalYear:undefined}])).toEqual([]);
});
it.each(["invalid end","ambiguous duplicate"])("does not relabel a normalization-rejected %s as an entirely absent fiscal slot",mode=>{
  const row:GrowthIncomeRow={date:mode==="invalid end" ? "2022-02-30" : "2022-12-31",period:"FY",fiscalYear:"2022",periodStart:"2022-01-01",revenue:100,operatingIncome:20};
  const rejected=mode==="invalid end" ? [row] : [row,{...row,operatingIncome:30}];
  const out=computeGrowth([...recentCadence(),...rejected],[],{period:"annual"});
  expect(out.gaps.some(g=>g.field==="growth.incomeStatement.period" && g.reason.includes("dropped"))).toBe(true);
  expect(out.margins.operating.series.some(p=>p.date===row.date)).toBe(false);
  expect(out.margins.operating.missingIntervals ?? []).toEqual([]);
  // The same rejected row outside the recent run cannot veto that run's proof.
  const remote=computeGrowth([...recentCadence(),...rejected.map(r=>({...r,date:r.date.replace("2022","2019"),fiscalYear:"2019"}))],[],{period:"annual"});
  expect(remote.margins.operating.missingIntervals).toMatchObject([{fiscalYears:[2022]}]);
});
it("preserves a proved recent gap through valuation, projection and chart consumers despite a remote cadence change",()=>{
  const b=completeCurrencyBundle({siblingQuarterCurrencies:["USD","USD","USD","USD"]});
  if(!b.statements.incomeAnnual.ok) throw Error("fixture");
  const rows=b.statements.incomeAnnual.value.data.rows.filter(r=>r.fiscalYear!=="2023");
  for(const r of rows) r.periodStart=`${r.date!.slice(0,4)}-01-01`;
  // Supply enough independently annual steps for scenario dispersion so the
  // projection assertions exercise a real fan, not an absent series.
  const older=rows.at(-1)!;
  for(const y of [2017,2018,2019,2020]) rows.push({...older,date:`${y}-06-30`,periodStart:`${y-1}-07-01`,fiscalYear:String(y)});
  b.statements.incomeAnnual.value.data.rows=rows;
  const c=runStageB(b);
  expect(c.growth.margins.operating.slopePctPtsPerYear).toBeNull();
  if(c.valuation.kind!=="dcf"||!c.valuation.assumptions) throw Error("DCF expected");
  expect(c.valuation.assumptions.ebitMarginPath.basis).toContain("absent fiscal slot FY 2023 between 2022-12-31 and 2024-12-31");
  const chart=fundamentalsChartDataFromBundle(b,c).margins;
  expect(chart.find(p=>p.period.includes("FY 2023 (missing; between 2022-12-31 and 2024-12-31)"))?.operatingPct).toBeNull();
  expect(chart.some(p=>p.period==="2023-12-31")).toBe(false);
  const projected=c.projections.series.find(s=>s.metric==="operatingMargin");
  expect(projected).toBeDefined();
  expect(projected!.base.length).toBeGreaterThan(0);
  expect(projected!.historical).toEqual([]);
  expect(projected!.disclosures).toContainEqual(expect.objectContaining({field:"projections.operatingMargin.historical",
    reason:"Historical projection line withheld: missing operatingMargin observations at absent fiscal slot FY 2023 between 2022-12-31 and 2024-12-31; the chart must not bridge these periods."}));
});

it.each(["ambiguous duplicate", "invalid end", "missing end", "unknown identity"])("keeps a normalization-rejected %s recorded year distinct from an absent year in every margin consumer", mode => {
  const b = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  if (!b.statements.incomeAnnual.ok) throw Error("fixture");
  const rows = b.statements.incomeAnnual.value.data.rows;
  for (const row of rows) row.periodStart = `${row.date!.slice(0, 4)}-01-01`;
  const middle = rows.find(row => row.fiscalYear === "2023")!;
  if (mode === "ambiguous duplicate") rows.push({ ...middle, operatingIncome: middle.operatingIncome! + 1_000_000 });
  else if (mode === "invalid end") middle.date = "2023-02-30";
  else {
    middle.date = undefined;
    if (mode === "unknown identity") middle.fiscalYear = undefined;
  }
  const oldest = { ...rows.find(row => row.fiscalYear === "2022")! };
  for (const year of [2017, 2018, 2019, 2020]) rows.push({ ...oldest, date: `${year}-06-30`, periodStart: `${year - 1}-07-01`, fiscalYear: String(year) });
  const projectionSpy = vi.spyOn(projections, "computeProjections"), valuationSpy = vi.spyOn(valuation, "valueCompany");
  const [c, projectionInputs, dcfInputs] = (() => {
    try {
      const computed = runStageB(b);
      return [computed, projectionSpy.mock.calls.at(-1)![0], valuationSpy.mock.calls.at(-1)![1].dcfInputs!] as const;
    } finally { projectionSpy.mockRestore(); valuationSpy.mockRestore(); }
  })();
  if (c.valuation.kind !== "dcf" || !c.valuation.assumptions) throw Error("DCF expected");
  const projected = c.projections.series.find(series => series.metric === "operatingMargin");
  expect(projected?.base.length).toBeGreaterThan(0);
  expect(c.growth.margins.operating.missingIntervals ?? []).toEqual([]);
  expect(c.valuation.assumptions.ebitMarginPath.basis).not.toContain("absent fiscal slot FY 2023");
  expect(projected!.disclosures.some(gap => gap.reason.includes("absent fiscal slot FY 2023"))).toBe(false);
  const recorded = mode === "ambiguous duplicate" ? "recorded annual period 2023-12-31 (FY 2023) unavailable after normalization" :
    mode === "unknown identity" ? "recorded annual period of unknown date and fiscal year unavailable after normalization" : "recorded annual period FY 2023 unavailable after normalization";
  expect(c.growth.margins.operating.slopePctPtsPerYear).toBeNull();
  expect(c.valuation.assumptions.ebitMarginPath.basis).toContain(recorded);
  expect(projected!.historical).toEqual([]);
  expect(projected!.disclosures.some(gap => gap.reason.includes(recorded))).toBe(true);
  for (const barriers of [projectionInputs.incomeCadenceBarriers, dcfInputs.incomeCadenceBarriers]) {
    expect(barriers!.length).toBeGreaterThan(0);
    for (const barrier of barriers!) expect(Object.keys(barrier).every(key => ["date", "fiscalYear", "period"].includes(key))).toBe(true);
  }
  expect(dcfInputs.incomeHistory.some(row => row.date === "2023-12-31" || row.date === "2023-02-30" || !row.date)).toBe(false);
  expect(projectionInputs.incomeHistory.some(row => row.date === "2023-12-31" || row.date === "2023-02-30" || !row.date)).toBe(false);
  expect(fundamentalsChartDataFromBundle(b, c).margins.some(point => point.period.includes("FY 2023 (missing;"))).toBe(false);
});
