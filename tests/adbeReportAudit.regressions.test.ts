import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";
import { runStageB } from "@/pipeline/compute";
import { buildMarketData } from "@/pipeline/marketData";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { computeDcfDisplay } from "@/pipeline/stageB/fairValue";
import { computeScores, type ScoringInputs } from "@/pipeline/stageB/grading";
import { metricPolicy } from "@/pipeline/stageB/sectorRouting";
import { consensusTables, keyDataRows, scoreDriverTable } from "@/report/presentation";
import { valuationAuditTables } from "@/report/auditTables";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

function auditBundle() {
  const b = completeCurrencyBundle({ symbol: "ADBE" });
  const captured = JSON.parse(readFileSync("fixtures/company-ir/adobe-20261019/audit-financial-inputs.json", "utf8"));
  Object.assign(b, { builtAt: captured.builtAt, profile: captured.profile, quote: captured.quote, statements: captured.statements });
  Object.assign(b.edgar, captured.edgar);
  return b;
}

describe("independent first-report audit reproductions", () => {
  it.each(["issuer","currency","partial","interval","future","filing"])("does not manufacture an investment comparison from incompatible %s evidence", change=>{
    const b=auditBundle();if(!b.statements.cashflowAnnual.ok||!b.edgar.companyFacts.ok)throw Error("source fixture");
    const row=b.statements.cashflowAnnual.value.data.rows[0]!;
    const facts=b.edgar.companyFacts.value.data;
    if(change==="issuer")row.cik="1";
    if(change==="currency")row.reportedCurrency="EUR";
    if(change==="partial")delete facts.facts["us-gaap"]!.ProceedsFromSaleOfShortTermInvestments;
    if(change==="interval")row.periodStart="2024-12-01";
    if(change==="future")for(const fact of Object.values(facts.facts["us-gaap"]!))for(const p of (fact as {units:{USD:{filed:string}[]}}).units.USD)p.filed="2026-12-01";
    if(change==="filing")row.filingDate="2026-01-14";
    const admitted=enrichFinancialFields(b.statements.balanceAnnual,b.statements.cashflowAnnual,facts,"annual",b.builtAt);
    expect(admitted.cashflow.ok&&admitted.cashflow.value.data.rows[0]).toMatchObject({purchasesOfInvestments:-1125e6,salesMaturitiesOfInvestments:688e6});
  });
  it("reconciles the filed investment arithmetic when vendor components have the same short-term scope", () => {
    const b=auditBundle();if(!b.statements.cashflowAnnual.ok)throw Error("cash fixture");
    Object.assign(b.statements.cashflowAnnual.value.data.rows[0]!,{purchasesOfInvestments:-2034e6,salesMaturitiesOfInvestments:1174e6});
    const result=runStageB(b).forensics.accruals;
    expect(result).toMatchObject({definition:"financial-asset-adjusted",financialAssetCashFlow:-860e6,operatingInvestingCashFlow:-327e6,aggregateAccrualsCashFlow:-2574e6});
    expect(result?.cashFlowAccrualRatio).toBeCloseTo(-2574/11975.5,8);
  });
  it("refuses unreconciled investment components and switches dependent accruals to their disclosed operating definition", () => {
    const b = auditBundle();
    if (!b.edgar.companyFacts.ok || !b.statements.cashflowAnnual.ok) throw Error("source fixture");
    const raw = structuredClone(b.statements.cashflowAnnual);
    const admitted = enrichFinancialFields(b.statements.balanceAnnual, raw, b.edgar.companyFacts.value.data, "annual", b.builtAt);
    expect(admitted.cashflow.ok && admitted.cashflow.value.data.rows[0]).toMatchObject({ purchasesOfInvestments: null, salesMaturitiesOfInvestments: null, otherInvestingActivities: null,
      fieldConflicts: { purchasesOfInvestments: { usable: false, vendorValue: -1125e6 }, salesMaturitiesOfInvestments: { usable: false, vendorValue: 688e6 } } });
    b.statements.cashflowAnnual = admitted.cashflow;
    const result = runStageB(JSON.parse(JSON.stringify(b)));
    expect(result.forensics.accruals).toMatchObject({ definition: "operating", financialAssetCashFlow: null, operatingInvestingCashFlow: null, otherInvestingCashFlow: null, aggregateAccrualsCashFlow: -2901e6 });
    expect(JSON.stringify(result.forensics.accruals)).not.toContain("-437000000");
    expect(raw).toEqual(b.statements.cashflowAnnual.ok ? expect.objectContaining({ value: expect.objectContaining({ data: expect.objectContaining({ raw: b.statements.cashflowAnnual.value.data.raw }) }) }) : null);
  });

  it("labels unverified provider EPS basis in the market tables, headline and model context", () => {
    const b=completeCurrencyBundle({});
    const report=loadTask28Fixture();
    report.marketData=buildMarketData(b);
    const tables=JSON.stringify(consensusTables(report));
    const headline=JSON.stringify(keyDataRows(report));
    expect(tables).toMatch(/accounting basis unverified/i);
    expect(tables).toMatch(/not comparable.*GAAP|do not compare.*GAAP/i);
    expect(headline).toMatch(/basis unverified/i);
    const prompt=serializePayloadForPrompt(assembleContextPayload(b,runStageB(b),{checks:[],flags:[],gaps:[]}));
    expect(prompt).toMatch(/EPS accounting basis.*unverified/i);
    expect(prompt).toMatch(/do not compare.*GAAP/i);
  });

  it("names the actual fallback history measure without calling current P/E unavailable", () => {
    const c=runStageB(completeCurrencyBundle({}));
    if(c.valuation.kind!=="dcf")throw Error("DCF fixture");
    c.valuation.multiples.multiples=[{key:"peTtm",current:18,basis:"current GAAP",peers:null,ownHistory:null},{key:"evToEbitda",current:20,basis:"current",peers:null,ownHistory:{percentileRank:40,observations:12,basis:"retained",p5:null,p25:null,p50:null,p75:null,p95:null}}];
    const inputs:ScoringInputs={route:c.route,policy:metricPolicy(c.route),growth:c.growth,...c.returns,capital:c.capital,forensics:c.forensics,technicals:c.technicals,valuation:c.valuation,financialMetrics:c.financialMetrics,currentPrice:100,asOf:"2026-10-19"};
    const scores=computeScores(inputs);
    const row=scoreDriverTable(scores)?.rows.find(row=>row[0]==="Valuation"&&row[1]?.includes("history"));
    expect(row?.[1]).toBe("EV/EBITDA own-history rank");
    expect(row?.at(-1)).toMatch(/P\/E history comparison unavailable/i);
  });

  it("retains local sensitivity floor and terminal-return conventions without changing arithmetic", () => {
    const c=runStageB(completeCurrencyBundle({}));
    const display=computeDcfDisplay(c.valuation,"USD");
    const report=loadTask28Fixture();Object.assign(report.valuation.dcf,display);
    const tables=JSON.stringify(valuationAuditTables(report.valuation.dcf));
    expect(tables).toMatch(/reinvestment.*floor.*zero|reinvestment.*floored at 0/i);
    expect(tables).toMatch(/terminal ROIC.*WACC/i);
  });

  it("extracts dated retained remaining authority without treating it as funded repurchases", () => {
    const b=auditBundle();
    const d=buildFilingDisclosures(b);
    expect(d?.capitalReturn).toMatchObject({authorizationRemaining:24.55e9,authorizationRemainingAsOf:"2026-08-28",authorizationRemainingSource:{form:"10-Q",accession:"0000796343-26-000156",filingDate:"2026-09-22"}});
    const c=runStageB(b);const eps=c.projections?.series.find(s=>s.metric==="epsDiluted");
    expect(eps?.capitalReturn).toMatchObject({authorizationRemaining:24.55e9,policy:"flat-share-conservative",appliedShareCountAnnualizedPct:0});
    expect(eps?.capitalReturn?.basis).toMatch(/discretionary|not.*commitment/i);
  });
  it("keeps MD&A remaining authority separately sourced from an earnings release's returned cash in the payload",()=>{
    const b=auditBundle();
    const release=buildEarningsReleaseRecord({filing:{accessionNumber:"0000796343-26-000155",filingDate:"2026-09-10",acceptanceDateTime:undefined},
      releaseUrl:"https://www.sec.gov/Archives/edgar/data/796343/000079634326000155/ex99.htm",commentaryUrl:null,commentaryText:null,includeNarrative:true,
      releaseText:"Adobe Reports Third Quarter Fiscal 2026 Results. During the third quarter of fiscal 2026, Adobe returned US$1.0 billion to stockholders."});
    b.edgar.currentReports={ok:true,value:{source:"edgar",endpoint:"fixture",asOf:"2026-09-10",fetchedAt:b.builtAt,data:{version:CURRENT_REPORTS_VERSION,releases:[release],events:[],notes:[]}}};
    const payload=assembleContextPayload(b,runStageB(b),{checks:[],flags:[],gaps:[]});
    const figures=payload.issuerFilings?.figures ?? [];
    expect(figures.find(f=>f.label==="share repurchase authorization remaining")).toMatchObject({value:24.55e9,source:"edgar:10-Q 0000796343-26-000156",asOf:"2026-09-22",period:"2026-08-28"});
    expect(figures.find(f=>f.label.startsWith("returned to shareholders"))).toMatchObject({value:1e9,source:"edgar:8-K EX-99.1",asOf:"2026-09-10"});
  });
  it.each(["issuer","document","future","period","currency"])("does not borrow remaining authority from incompatible %s evidence", change => {
    const b=auditBundle();if(!b.edgar.tenQMdna.ok||!b.statements.incomeQuarterly.ok)throw Error("source fixture");
    const section=b.edgar.tenQMdna.value.data;
    if(change==="issuer"&&b.edgar.cik.ok)b.edgar.cik.value.data.ticker="OTHER";
    if(change==="issuer")b.edgar.registrant=null;
    if(change==="document")section.documentUrl="https://unrelated.example/filing.htm";
    if(change==="future")section.filingDate="2026-12-01";
    if(change==="period")section.text=section.text.replace("As of August 28, 2026, a total of $24.55", "As of May 29, 2026, a total of $24.55");
    if(change==="currency")b.statements.incomeQuarterly.value.data.rows[0]!.reportedCurrency="EUR";
    expect(buildFilingDisclosures(b)?.capitalReturn?.authorizationRemaining ?? null).toBeNull();
  });
  it("extracts the source's remaining balance rather than a fixed ticker amount",()=>{
    const b=auditBundle();if(!b.edgar.tenQMdna.ok)throw Error("source fixture");
    b.edgar.tenQMdna.value.data.text=b.edgar.tenQMdna.value.data.text.replace("$24.55 billion remained", "$13.25 billion remained");
    expect(buildFilingDisclosures(b)?.capitalReturn?.authorizationRemaining).toBe(13.25e9);
  });
});
