import { describe, expect, it } from "vitest";
import { computeRoic } from "@/pipeline/stageB/returns";
import * as unusualItems from "@/pipeline/stageB/unusualItems";
import { buildDcfAssumptions, type DcfAssumptionInputs } from "@/pipeline/stageB/valuation";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";

const row = (year: number, operatingIncome: number) => ({ date: `${year}-12-31`, revenue: 1000, grossProfit: 450, operatingIncome, incomeBeforeTax: operatingIncome - 10, incomeTaxExpense: .21 * (operatingIncome - 10) });
const common = { revenueCagr3yPct: 3, revenueCagr5yPct: 3, analystEstimates: null, waccPct: 9, riskFreePct: 4,
  balance: { date: "2025-12-31", basis: "annual" as const, totalDebt: 300, totalStockholdersEquity: 700, cashAndShortTermInvestments: 100 }, marketCap: 2000, domicileCountry: "US" };
const item = (value: number) => ({ value, components: [{ tag: "GoodwillImpairmentLoss", value }], withheld: [], basis: "filed one-off charge" });

describe("one operating-income basis (FIN-402 family)", () => {
  it("normalizes the annual margin history and ceiling, leaving unadmitted amounts in", () => {
    const history = [100,120,140,160,100].map((v,i)=>row(2021+i,v));
    const build = (incomeHistory: DcfAssumptionInputs["incomeHistory"]) => buildDcfAssumptions({ ...common, incomeHistory,
      incomeTtm: { ...history[4]!, basis: "annual" }, unusualOperatingItems: item(-80) }).assumptions!;
    const normalized = build([...history.slice(0,4),row(2025,180)]);
    const adjusted = build(history.map(r=>({...r,unusualOperatingItems:r.date === "2025-12-31" ? -80 : null})));
    expect(adjusted.ebitMarginPath.value).toEqual(normalized.ebitMarginPath.value);
    expect(adjusted.scenarioMarginCeiling).toEqual(normalized.scenarioMarginCeiling);
    expect(adjusted.terminal.roicTermPct.basis).toMatch(/terminal evidence.*excluding.*one-off/);
    expect(build(history.map(r=>({...r,unusualOperatingItems:null}))).ebitMarginPath.value).not.toEqual(normalized.ebitMarginPath.value);
  });
  it("removes a TTM gain from the ceiling as well as the seed", () => {
    const incomeHistory = [100,120,140,160,180].map((v,i)=>row(2021+i,v));
    const build = (oi: number, oneOff: number) => buildDcfAssumptions({ ...common, incomeHistory,
      incomeTtm: { ...row(2026,oi), basis: "ttm" }, unusualOperatingItems: item(oneOff) }).assumptions!;
    expect(build(300,100).scenarioMarginCeiling?.pct).toBeCloseTo(20,9);
    expect(build(300,100).ebitMarginPath.value).toEqual(build(200,0).ebitMarginPath.value);
  });
  it("preserves GAAP ROIC but normalizes the separate terminal evidence", () => {
    const income = [2025,2024,2023,2022,2021].map(y=>row(y,y === 2025 ? 80 : 170));
    const balance = [2025,2024,2023,2022,2021,2020].map(y=>({date:`${y}-12-31`,totalDebt:300,totalStockholdersEquity:600,cashAndShortTermInvestments:100}));
    const raw = computeRoic(income,balance,{domicileCountry:"US"});
    const normalized = computeRoic(income,balance,{domicileCountry:"US", unusualByYear:new Map([["2025-12-31",-90]])});
    expect(normalized.latestRoicPct).toBe(raw.latestRoicPct);
    expect(normalized.series.at(-1)?.terminalEvidenceRoicPct).toBeCloseTo(16.7875,6);
  });
  it("does not add back a recurring family in three of the last five years", () => {
    const years = [2025,2024,2023,2022,2021].map(y=>`${y}-12-31`);
    const byYear = new Map([2025,2023,2021].map(y=>[`${y}-12-31`,item(-10)]));
    const r = unusualItems.withoutRecurringFamilies(byYear,years);
    expect(r.byYear.size).toBe(0);
    expect(r.recurring).toEqual([{tag:"GoodwillImpairmentLoss",years:[years[0],years[2],years[4]]}]);
    expect(unusualItems.withoutRecurringFamilies(new Map([...byYear].slice(0,2)),years).byYear.size).toBe(2);
  });
  it("wires admitted TTM charges into coverage on the same EBIT window", () => {
    const make = (charge: number) => {
      const b = completeCurrencyBundle({debt:1000});
      b.edgar.cik = {ok:true,value:{data:{cik:42,cik10:"0000000042",ticker:b.symbol},source:"edgar",endpoint:"fixture",asOf:b.builtAt,fetchedAt:b.builtAt}} as typeof b.edgar.cik;
      const points = [
        {start:"2025-01-01",end:"2025-12-31",val:0,form:"10-K",filed:"2026-02-01"},
        {start:"2025-01-01",end:"2025-03-31",val:0,form:"10-Q",filed:"2025-05-01"},
        {start:"2026-01-01",end:"2026-03-31",val:charge,form:"10-Q",filed:"2026-05-01"},
      ].map(p=>({...p,accn:"0000000042-26-000001",fp:"Q1",fy:2026}));
      b.edgar.companyFacts = {ok:true,value:{data:{cik:42,entityName:"Test",facts:{"us-gaap":{AssetImpairmentCharges:{units:{USD:points}}}}},source:"edgar",endpoint:"fixture",asOf:b.builtAt,fetchedAt:b.builtAt}} as typeof b.edgar.companyFacts;
      if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
      const q=b.statements.incomeQuarterly.value.data.rows[0]!;
      q.operatingIncome=60*M-charge;
      return runStageB(b);
    };
    const clean=make(0), impaired=make(200*M);
    expect(impaired.returns.wacc.interestCoverageRatio).toBe(clean.returns.wacc.interestCoverageRatio);
    expect(impaired.returns.wacc.syntheticRating).toBe(clean.returns.wacc.syntheticRating);
    expect(impaired.returns.wacc.notes.join(" ")).toMatch(/excluding tagged one-off/);
  });
});
