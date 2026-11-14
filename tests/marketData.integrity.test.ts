import { describe, expect, it } from "vitest";
import { buildMarketData } from "@/pipeline/marketData";
import { currencyBundle } from "./helpers/currencyBundle";
import { MarketDataSchema, type Report } from "@/report/schema";
import { insiderEvidenceTables, consensusTables } from "@/report/presentation";

function marketData(counts: Record<string, unknown>) {
  const bundle = currencyBundle();
  bundle.gradesConsensus = { ok: true, value: { source: "fmp", endpoint: "grades-consensus", asOf: "2026-07-01", fetchedAt: bundle.builtAt, data: { rows: [counts], raw: {} } } };
  return buildMarketData(bundle);
}

describe("analyst grade count completeness", () => {
  const complete = { strongBuy: 8, buy: 5, hold: 2, sell: 0, strongSell: 0 };
  it("retains explicitly reported zero buckets and the complete distribution", () => {
    expect(marketData(complete)?.gradeCounts).toMatchObject({ strongPositive: 8, positive: 5, neutral: 2, negative: 0, strongNegative: 0 });
  });
  it("retains an explicitly reported empty distribution", () => {
    expect(marketData({ strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 })?.gradeCounts).toMatchObject({ strongPositive: 0, positive: 0, neutral: 0, negative: 0, strongNegative: 0 });
  });
  it.each(Object.keys(complete))("withholds a distribution missing %s instead of inventing a zero", (key) => {
    const counts: Record<string, unknown> = { ...complete };
    delete counts[key];
    expect(marketData(counts)?.gradeCounts).toBeNull();
  });
  it.each([null, NaN, Infinity, -1, 1.5])("withholds a distribution containing an invalid count %s", (invalid) => {
    expect(marketData({ ...complete, hold: invalid })?.gradeCounts).toBeNull();
  });
});

describe("float measurement compatibility", () => {
  function fromShares(row: Record<string, unknown>) {
    const bundle = currencyBundle();
    bundle.sharesFloat = { ok: true, value: { source: "edgar", endpoint: "shares-float", asOf: "2026-07-27", fetchedAt: bundle.builtAt, data: { rows: [row], raw: {} } } };
    return MarketDataSchema.parse(buildMarketData(bundle));
  }
  it("retains the historical float date but withholds its cross-date percentage", () => {
    const md = fromShares({ date: "2026-07-27", outstandingShares: 1.05e9, floatShares: 1.099397582e9, freeFloat: 104.7045, publicFloatAsOf: "2025-03-28", publicFloatPriceBasis: "measurement date" });
    expect(md.shares).toMatchObject({ outstanding: 1.05e9, float: 1.099397582e9, freeFloatPct: null, asOf: "2026-07-27", floatAsOf: "2025-03-28" });
  });
  it("withholds an impossible provider percentage", () => {
    expect(fromShares({ date: "2026-07-27", outstandingShares: 100, floatShares: 110, freeFloat: 110 }).shares?.freeFloatPct).toBeNull();
  });
  it("withholds a bounded percentage when the known measurement dates differ", () => {
    expect(fromShares({ date: "2026-07-27", outstandingShares: 100, floatShares: 90, freeFloat: 90, publicFloatAsOf: "2025-03-28" }).shares?.freeFloatPct).toBeNull();
  });
  it("retains a bounded same-date provider percentage", () => {
    expect(fromShares({ date: "2026-07-27", outstandingShares: 100, floatShares: 90, freeFloat: 90 }).shares).toMatchObject({ outstanding: 100, float: 90, freeFloatPct: 90, floatAsOf: "2026-07-27" });
  });
  it("does not date a latest-quote float conversion as a historical measurement", () => {
    expect(fromShares({ date: "2026-07-27", outstandingShares: 100, floatShares: 90, freeFloat: 90, publicFloatAsOf: "2025-03-28", publicFloatPriceBasis: "latest quote" }).shares).toMatchObject({ freeFloatPct: null, floatAsOf: null });
  });
  it("labels the historical float date and does not use it for current short-interest percentage", () => {
    const md = fromShares({ date: "2026-07-27", outstandingShares: 1.05e9, floatShares: 1.099397582e9, freeFloat: 104.7045, publicFloatAsOf: "2025-03-28", publicFloatPriceBasis: "measurement date" });
    md.shortInterest = { shares: 1e7, daysToCover: 2, averageDailyVolume: 5e6, settlementDate: "2026-07-15", changePct: null };
    const tables = consensusTables({ marketData: md } as Report);
    const text = JSON.stringify(tables);
    expect(text).toContain("2025-03-28");
    expect(text).not.toContain("of float");
    expect(text).not.toContain("104.7");
  });
});

// Audit 2026-10-22 B-19: Yahoo's chart has no market cap, so a cap on a Yahoo
// quote is the keyless price × filed share count.
describe("quoted market cap origin", () => {
  function withQuote(source: string) {
    const bundle = currencyBundle();
    bundle.quote = { ok: true, value: { source, endpoint: "quote", asOf: "2026-07-01", fetchedAt: bundle.builtAt, data: { rows: [{ symbol: "TEST", price: 10, marketCap: 1e9 }], raw: {} } } } as typeof bundle.quote;
    return MarketDataSchema.parse(buildMarketData(bundle)).quote;
  }
  it("marks a Yahoo quote's market cap as computed and a vendor's as provided", () => {
    expect(withQuote("yahoo")?.marketCapOrigin).toBe("computed");
    expect(withQuote("fmp")?.marketCapOrigin).toBe("provider");
  });
});

import { insiderEvidence, resultsHistory } from "@/pipeline/providerEvidence";
it("keeps earnings differences provider-only and leaves missing operands unavailable", () => {
 const b=currencyBundle();
 b.earningsHistory={ok:true,value:{source:"fmp",endpoint:"earnings",asOf:"2026-01-01",fetchedAt:b.builtAt,data:{rows:[{date:"2025-11-01",currency:"USD",revenueActual:120,revenueEstimated:100,epsActual:2,epsEstimated:null},{date:"2099-01-01",revenueActual:300}],raw:{}}}};
 expect(resultsHistory(b)).toMatchObject([{date:"2025-11-01",values:{revenueDifference:20,epsDifference:null}}]);
});
it("distinguishes officer, director, ten-percent and former-holder selected sales", () => {
 const b=currencyBundle();
 b.insiderTrades={ok:true,value:{source:"fmp",endpoint:"insider-trades",asOf:"2026-01-01",fetchedAt:b.builtAt,data:{rows:["officer: CEO","director","10% owner","other: Former 10% Shareholder"].map((typeOfOwner,i)=>({typeOfOwner,reportingName:`Person ${i}`,transactionType:"S-Sale",transactionDate:"2025-11-01",securitiesTransacted:10})),raw:{}}}};
 const notes=insiderEvidence(b).join(" ");
 expect(notes).toContain("not limited to officers and directors");
 expect(notes).toContain("officer: CEO (officer/director): 1 code S sale rows; 10 shares");
 expect(notes).toContain("director (officer/director)");
 expect(notes).toContain("Former 10% Shareholder (ten-percent, former or other owner)");
 expect(notes).toContain("sellers: Person 3");
});
it("does not invent dividend figures or earnings rows for missing inputs",()=>{
 const b=currencyBundle(); expect(resultsHistory(b)).toEqual([]);
 const d=buildFilingDisclosures(completeCurrencyBundle({}));
 expect(d?.dividends?.indicated.value).toBeNull();
 expect(d?.dividends?.indicated.reason).toContain("declared dividend");
});

import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import { ReportSchema } from "@/report/schema";
import { readFileSync } from "node:fs";
it("D-272 renders both provider tables with scope, source, basis and rounded fractional shares",()=>{
 const b=completeCurrencyBundle({});
 b.earningsHistory={ok:true,value:{source:"fmp",endpoint:"earnings",asOf:"2026-06-01",fetchedAt:b.builtAt,data:{rows:[{date:"2026-06-01",revenueActual:120,revenueEstimated:100,epsActual:2,epsEstimated:1}],raw:{}}}};
 b.insiderTrades={ok:true,value:{source:"fmp",endpoint:"insider-trades",asOf:"2026-06-01",fetchedAt:b.builtAt,data:{rows:[{reportingName:"Example Holder",typeOfOwner:"10% owner",transactionType:"S-Sale",transactionDate:"2026-05-01",securitiesTransacted:128.95950000000002}],raw:{}}}};
 const report=ReportSchema.parse(JSON.parse(readFileSync("fixtures/report/DEMO-sample.json","utf8")));report.marketData=buildMarketData(b);
 const results=consensusTables(report).find(t=>t.heading.includes("Reported results"))!;
 expect(results.headers).toContain("Fiscal window"); expect(JSON.stringify(results)).toContain("accounting basis unverified");expect(JSON.stringify(results)).toContain("fmp:earnings / 2026-06-01");
 const insider=JSON.stringify(insiderEvidenceTables(report));expect(insider).toContain("128.9595 shares");expect(insider).not.toContain("00000002");expect(insider).not.toContain("Do not attribute");
});
it("D-272 registers quarter-specific insider operands and plain revenue labels without a fictitious report-date period",()=>{
 const b=completeCurrencyBundle({});
 b.insiderStats={ok:true,value:{source:"fmp",endpoint:"insider-statistics",asOf:"2026-07-01",fetchedAt:b.builtAt,data:{rows:[{year:2026,quarter:2,totalSales:327,totalPurchases:0,totalAcquired:0,totalDisposed:1000}],raw:{}}}};
 b.earningsHistory={ok:true,value:{source:"fmp",endpoint:"earnings",asOf:"2026-06-01",fetchedAt:b.builtAt,data:{rows:[{date:"2026-06-01",revenueActual:120,revenueEstimated:100,epsActual:2,epsEstimated:1}],raw:{}}}};
 const p=assembleContextPayload(b,runStageB(b),{checks:[],flags:[],gaps:[]});
 expect(p.insiders.figures.find(f=>f.label.includes("sale transactions, 2026 Q2"))).toMatchObject({value:327,unit:"count",periodContext:{kind:"duration",start:"2026-04-01",end:"2026-06-30"}});
 const revenue=p.estimates.figures.find(f=>f.label.includes("reported versus consensus") && f.label.includes("revenue actual"))!;
 expect(revenue.period).toBeNull();expect(revenue.label).not.toContain("EPS");expect(p.estimates.figures.find(f=>f.label.includes("provider EPS actual"))?.label).toContain("accounting basis unverified");
 expect(p.provenanceRegistry?.some(r=>r.label?.includes("sale transactions, 2026 Q2"))).toBe(true);
});

it("D-272 withholds result differences when the operand currency is unestablished",()=>{
 const b=completeCurrencyBundle({});b.earningsHistory={ok:true,value:{source:"fmp",endpoint:"earnings",asOf:"2026-06-01",fetchedAt:b.builtAt,data:{rows:[{date:"2026-06-01",revenueActual:120,revenueEstimated:100,epsActual:2,epsEstimated:1}],raw:{}}}};
 expect(resultsHistory(b)[0]).toMatchObject({currency:null,values:{revenueDifference:null,epsDifference:null}});
});
