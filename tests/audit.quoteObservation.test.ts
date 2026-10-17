import { describe, expect, it } from "vitest";
import { buildMarketData } from "@/pipeline/marketData";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import { validateBundle } from "@/pipeline/stageA/validate";
import { keyDataRows } from "@/report/presentation";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

describe("price observation evidence on report and model surfaces", () => {
  it.each([
    [{}, null],
    [{ date: "2026-02-30" }, null],
    [{ date: "2026-06-30" }, "2026-06-30"],
    [{ timestamp: Date.parse("2026-06-30T20:00:00Z") / 1000 }, "2026-06-30"],
  ] as const)("retains actual observation %j without substituting the envelope fetch date", (observation, expected) => {
    const bundle = completeCurrencyBundle({});
    bundle.edgar.companyFacts = { ok: false, gap: { field: "edgar.companyFacts", reason: "Synthetic fixture has no SEC facts", severity: "info" } };
    if (!bundle.quote.ok) throw new Error("fixture quote absent");
    bundle.quote.value.asOf = "2026-07-01";
    bundle.quote.value.data.rows = [{ symbol: bundle.symbol, price: 100, marketCap: 1000, ...observation }];
    const market = buildMarketData(bundle)!;
    expect(market.quote?.asOf).toBe(expected);
    expect(market.quote?.price).toBe(100);
    const payload = assembleContextPayload(bundle, runStageB(bundle), validateBundle(bundle));
    expect(payload.quote.figures.find(row => row.label === "price")?.asOf).toBe(expected);
    if (expected === null) expect(payload.quote.notes.join(" ")).toMatch(/observation date unavailable/i);
  });

  it("does not backfill an explicitly unknown market-data price date from a legacy trace", () => {
    const report = loadTask28Fixture();
    report.marketData = { version: "1", currency: "USD", estimateCurrency: null, estimateCurrencyBasis: null,
      quote: { price: 100, marketCap: null, yearHigh: null, yearLow: null, volume: null, priceAvg50: null, priceAvg200: null, asOf: null },
      shares: null, enterpriseValue: null, estimates: [], estimatesAsOf: null, priceTarget: null, gradeCounts: null, shortInterest: null };
    report.technicals.indicators.unshift({ value: 100, unit: "currency/share", currency: "USD", source: "payload.quote.price", asOf: "2026-07-01", verified: true });
    const row = keyDataRows(report).find(item => /price|close/i.test(item.label));
    expect(row?.note).toBe("observation date unavailable");
  });
});

it.each(["resolved", "vendor-undated", "vendor-profile-dated", "vendor-quote-dated", "vendor-both-undated", "wacc-profile-dated"] as const)("keeps Altman capitalization observation tied to its actual source (%s)", mode => {
  const bundle=completeCurrencyBundle({sic:"3571"});
  if(!bundle.quote.ok || !bundle.profile.ok) throw new Error("price fixtures");
  bundle.quote.value.asOf="2026-07-01";
  bundle.profile.value.asOf="2026-07-01";
  bundle.quote.value.data.rows[0].timestamp=Date.parse("2026-06-30T20:00:00Z")/1000;
  delete bundle.profile.value.data.rows[0].timestamp;
  delete bundle.profile.value.data.rows[0].date;
  if(mode==="vendor-both-undated") delete bundle.quote.value.data.rows[0].timestamp;
  if(mode==="wacc-profile-dated") { bundle.quote.value.data.rows[0].marketCap=undefined; bundle.profile.value.data.rows[0].date="2026-06-29"; }
  if(mode==="vendor-profile-dated") bundle.profile.value.data.rows[0].date="2026-06-29";
  if(mode==="vendor-quote-dated") bundle.profile.value.data.rows[0].marketCap=undefined;
  if(mode==="resolved") {
    bundle.edgar.registrant={name:"Example",cik10:"0000000042",sic:"3571",sicDescription:null,exchanges:[],tickers:[bundle.symbol],fiscalYearEnd:"1231",stateOfIncorporation:null,forms:["10-K"]};
    bundle.economicShareEvidence=[{issuerId:"0000000042",securityId:bundle.symbol,asOf:"2026-03-31",filed:"2026-05-06",effectiveFrom:"2026-05-06",effectiveTo:null,complete:true,sourceHash:"filed-counts-and-rights",sourceIds:["filed:capital"],classes:[
      {classId:bundle.symbol,shares:100e6,countBasis:"outstanding",economicUnitsPerQuotedShare:1,priceBasis:"quoted-market-price"},
      {classId:"B",shares:20e6,countBasis:"outstanding",economicUnitsPerQuotedShare:1,priceBasis:"economic-equivalence-proxy"},
    ]}];
  }
  const result=runStageB(bundle);
  expect(result.forensics.altman?.asOf.marketCap).toBe(mode==="vendor-undated" || mode==="vendor-both-undated" ? null : mode==="vendor-profile-dated" || mode==="wacc-profile-dated" ? "2026-06-29" : "2026-06-30");
  expect(result.returns.wacc.asOf?.marketCap ?? null).toBe(mode==="vendor-both-undated" ? null : mode==="wacc-profile-dated" ? "2026-06-29" : "2026-06-30");
});
