import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { applyFinancialDiagnostics } from "@/report/financialDiagnostics";
import type { ComputedMetrics } from "@/pipeline/compute";
import { ReportSchema } from "@/report/schema";
import { computeCapital } from "@/pipeline/stageB/capital";
import { attachCurrentCapital } from "@/pipeline/stageB/currentCapital";

const report = () => ReportSchema.parse(JSON.parse(fs.readFileSync("fixtures/report/DEMO-sample.json","utf8")));
const capital = () => attachCurrentCapital(computeCapital([],[],[],[],{ price: null }), {
  income: { date:"2026-06-30",revenue:100,netIncome:20,operatingIncome:30,interestExpense:2 },
  cashFlow: {date:"2026-06-30",operatingCashFlow:40,capitalExpenditure:-25,stockBasedCompensation:9,financeLeasePrincipalPayments:3},
  balance: {date:"2026-06-30",totalDebt:30,cashAndShortTermInvestments:15,operatingLeaseLiability:10,capitalLeaseObligations:10},currency:"USD",
});
describe("deterministic financial explanation",()=>{
  it("renders the current basis and its cash/debt bridge without changing annual history",()=>{
    const r=report();
    const out=applyFinancialDiagnostics(r,{capital:capital()} as ComputedMetrics);
    expect(out.balanceSheet.coverage.numbers.some(n=>n.source==="computed.capital.current.cashBridge.standardizedFcf" && n.value===15)).toBe(true);
    expect(out.balanceSheet.debtProfile.numbers.some(n=>n.source==="computed.capital.current.debtBridge.netDebtExcludingOperatingLeases" && n.value===5)).toBe(true);
    expect(out.balanceSheet.coverage.commentary.at(-1)?.text).toContain("ttm");
    expect(r.balanceSheet.coverage.numbers).not.toEqual(out.balanceSheet.coverage.numbers);
  });
  it("does not invent executive execution or credibility grades from empty attributable evidence",()=>{
    const r=report();
    r.leadership.executives=[{name:"Officer",title:"CFO",tenureYears:null,grade:"C",credibilityGrade:"C",reasoning:[],evidence:{}}];
    const out=applyFinancialDiagnostics(r,{capital:capital()} as ComputedMetrics);
    expect(out.leadership.executives[0]).toMatchObject({grade:"not-assessed",credibilityGrade:"not-assessed"});
    expect(ReportSchema.safeParse(out).success).toBe(true);
  });
  it("does not count unknown, rejected or non-evidence claims as an executive track record",()=>{
    const r=report();
    r.leadership.executives=[{name:"Officer Smith",title:"CFO",tenureYears:null,grade:"A",credibilityGrade:"A",reasoning:[],evidence:{guidanceVsActuals:[{label:"JUDGMENT",source:"unknown",asOf:null,text:"No guidance-versus-actual evidence is available."}]}}];
    expect(applyFinancialDiagnostics(r,{capital:capital()} as ComputedMetrics).leadership.executives[0]).toMatchObject({grade:"not-assessed",credibilityGrade:"not-assessed"});
    r.leadership.executives[0]!.evidence.guidanceVsActuals=[{label:"FACT",source:"edgar:10-Q",asOf:"2026-06-30",text:"Officer Smith met 99% of guidance targets."}];
    r.appendix.verificationLog=[{path:"leadership.executives[0].evidence.guidanceVsActuals[0]",claim:"Officer Smith met 99% of guidance targets.",outcome:"unverified",validationStatus:"contradicted"}];
    expect(applyFinancialDiagnostics(r,{capital:capital()} as ComputedMetrics).leadership.executives[0]).toMatchObject({grade:"not-assessed",credibilityGrade:"not-assessed"});
  });
  it("retains a proposed assessment only for attributable pipeline-classified metric evidence",()=>{
    const r=report(), text="Officer Smith met 95% of guidance targets.";
    r.leadership.executives=[{name:"Officer Smith",title:"CFO",tenureYears:null,grade:"B",credibilityGrade:"B",reasoning:[],evidence:{guidanceVsActuals:[{label:"FACT",source:"edgar:10-Q",asOf:"2026-06-30",text}]}}];
    // The verify pass never marks prose "verified"; numeric validation is its strongest outcome.
    r.appendix.verificationLog=[{path:"leadership.executives[0].evidence.guidanceVsActuals[0]",claim:text,source:"edgar:10-Q",outcome:"unverified",validationStatus:"validated"}];
    expect(applyFinancialDiagnostics(r,{capital:capital()} as ComputedMetrics).leadership.executives[0]).toMatchObject({grade:"not-assessed",credibilityGrade:"not-assessed"});
    r.appendix.verificationLog[0]!.executiveEvidenceKind="guidance-track-record";
    expect(applyFinancialDiagnostics(r,{capital:capital()} as ComputedMetrics).leadership.executives[0]).toMatchObject({grade:"not-assessed",credibilityGrade:"B"});
  });
});
import { capexDefinition } from "@/pipeline/stageB/capital";
import { liquidityDefinition } from "@/pipeline/stageB/netDebt";
import { investmentDefinition, revenueDefinition } from "@/pipeline/stageB/valuation";
import { MODEL_TANGIBLE_COMMON_BASIS } from "@/pipeline/stageB/returns";
import { scoreDriverTable, figureRow } from "@/report/presentation";

describe("D-292 figure definitions from filed families", () => {
  it("names combined tangible/intangible spending, including foreign concepts, and leaves PP&E alone unchanged", () => {
    expect(capexDefinition(["ifrs-full/PurchaseOfPropertyPlantAndEquipmentAndIntangibleAssets"])).toContain("property, plant and equipment plus intangible assets");
    expect(capexDefinition(["issuer/PaymentsToAcquireIntangibleAssets"])).toContain("intangible assets");
    expect(capexDefinition(["us-gaap/PaymentsToAcquirePropertyPlantAndEquipment"])).toContain("property, plant and equipment only");
  });
  it("names the admitted investment family without claiming complete coverage", () => {
    expect(investmentDefinition(["us-gaap/LongTermInvestmentsAndReceivablesNet"])).toContain("advances and long-term receivables");
    expect(investmentDefinition(["us-gaap/EquityMethodInvestments"])).toContain("equity-method investments only");
    expect(investmentDefinition(["us-gaap/LongTermInvestments"])).toBeNull();
  });
  it("names sales and the added marketable securities only with their positive tag evidence", () => {
    expect(revenueDefinition(["us-gaap/SalesAndOtherOperatingRevenue"])).toBe("sales and other operating revenue");
    expect(revenueDefinition(["us-gaap/Revenues"])).toBeNull();
    expect(liquidityDefinition(["us-gaap/CashCashEquivalentsAndShortTermInvestments", "us-gaap/MarketableSecurities"])).toContain("plus marketable securities");
    expect(liquidityDefinition(["us-gaap/CashCashEquivalentsAndShortTermInvestments"])).toBeNull();
  });
  it("prints a code-owned definition beside a figure and states the model bank convention", () => {
    expect(figureRow({value:10,unit:"currency",source:"computed.capital.capexIntensity",asOf:null,verified:true,definition:"property, plant and equipment plus intangible assets"}).trace.definition).toContain("property, plant and equipment plus intangible assets");
    expect(MODEL_TANGIBLE_COMMON_BASIS).toContain("provider's goodwill and intangible-asset fields");
    expect(MODEL_TANGIBLE_COMMON_BASIS).toContain("not checked against the filing");
  });
});

import { filedDefinitionMatches, type CompanyFacts } from "@/edgar/xbrl";
import { debtCompositionDefinition } from "@/pipeline/stageB/leaseScope";
import { applyFigureDefinitions } from "@/report/financialDiagnostics";
import type { DataBundle } from "@/pipeline/types";
import { valuationAuditTables } from "@/report/auditTables";

describe("D-293/294 definition identity and bridge rendering", () => {
  const point = (val:number, accn = "one", start = "2025-01-01") => ({start,end:"2025-12-31",val,accn,filed:"2026-02-01",form:"20-F"});
  const facts = (b = point(3)): CompanyFacts => ({cik:1,entityName:"Synthetic foreign issuer",facts:{"ifrs-full":{
    PPE:{units:{EUR:[point(20)]}}, Intangible:{units:{EUR:[b]}},
  }}});
  const match = (f:CompanyFacts,cutoff="2026-03-01") => filedDefinitionMatches(f,"EUR","2025-12-31",-23,cutoff,[["ifrs-full/PPE","ifrs-full/Intangible"]],true);
  it("requires exact value, currency, explicit annual period, filing and cutoff", () => {
    expect(match(facts())).toEqual(["ifrs-full/PPE","ifrs-full/Intangible"]);
    expect(match(facts(point(3,"other")))).toEqual([]);
    expect(match(facts(point(3,"one","2025-07-01")))).toEqual([]);
    expect(match(facts(point(4)))).toEqual([]);
    expect(match(facts(),"2026-01-01")).toEqual([]);
    expect(filedDefinitionMatches(facts(),"USD","2025-12-31",23,"2026-03-01",[["ifrs-full/PPE","ifrs-full/Intangible"]],true)).toEqual([]);
  });
  it("states debt scope from affirmative tags, and does not infer exclusions from a vendor zero", () => {
    const row = {date:"2025-12-31",reportedCurrency:"USD",totalDebt:30,fieldProvenance:{totalDebt:{source:"edgar",unit:"USD",periodEnd:"2025-12-31",periodStart:null,filings:[{accn:"one"}],tags:["us-gaap/OperatingLeaseLiabilityCurrent","us-gaap/OperatingLeaseLiabilityNoncurrent"]}}};
    expect(debtCompositionDefinition(row)).toContain("includes operating leases");
    expect(debtCompositionDefinition({...row,fieldProvenance:undefined})).toBeNull();
    expect(debtCompositionDefinition({...row,date:"2026-01-01"})).toBeNull();
    expect(debtCompositionDefinition({...row,fieldProvenance:{totalDebt:{...row.fieldProvenance.totalDebt,tags:["us-gaap/LongTermDebt"]}}})).toBeNull();
  });
  it("labels each debt history row from its source period, preserving values and report schema", () => {
    const r = report();
    r.balanceSheet.debtProfile.numbers = [{value:23,unit:"currency",source:"payload.statements.balance-sheet-annual.2025-12-31.total-debt",asOf:"2026-09-30",verified:true}];
    const b = {symbol:"TEST",builtAt:"2026-11-01",statements:Object.fromEntries(["balanceAnnual","balanceQuarterly","incomeAnnual","incomeQuarterly","cashflowAnnual","cashflowQuarterly"].map(k=>[k,{ok:true,value:{data:{rows:k === "balanceAnnual" ? [{date:"2025-12-31",totalDebt:23,fieldProvenance:{totalDebt:{tags:["us-gaap/OperatingLeaseLiabilityCurrent"]}}}] : []}}}]))} as unknown as DataBundle;
    applyFigureDefinitions(r,b);
    expect(figureRow(r.balanceSheet.debtProfile.numbers[0]!).trace.definition).toBe("lease treatment not established from the filing");
    expect(r.balanceSheet.debtProfile.numbers[0]!.value).toBe(23);
    expect(ReportSchema.safeParse(r).success).toBe(true);
  });
  it("names ADS units and a combined redeemable claim at the bridge, with an ordinary-count control", () => {
    const dcf=report().valuation.dcf;
    dcf.bridge = {enterpriseValue:100,netDebt:10,minorityInterest:5,preferredEquity:0,equityValue:85,dilutedShares:10,presentValueExplicit:50,presentValueTerminal:50,currency:"USD",asOf:"2025-12-31"};
    dcf.bridge.shareUnit="ADS-equivalent";
    dcf.bridge.minorityInterestDefinition="includes equity noncontrolling interests and redeemable noncontrolling interests";
    const rows=valuationAuditTables(dcf).flatMap(t=>t.rows);
    expect(rows.find(r=>r[0]!.startsWith("Diluted share denominator"))?.[0]).toContain("ADS-equivalent");
    expect(rows.find(r=>r[0]!.startsWith("Less minority interest"))?.[0]).toContain("redeemable noncontrolling");
    delete dcf.bridge.shareUnit;
    expect(valuationAuditTables(dcf).flatMap(t=>t.rows).find(r=>r[0]!.startsWith("Diluted share denominator"))?.[0]).toBe("Diluted share denominator");
  });
});

it("keeps definition decoration out of provisional numeric verification (D-295)", () => {
  const r=report();
  r.fundamentals.returns=[{label:"Return on tangible common equity",values:[{period:"2025-12-31",value:{value:20,unit:"%",source:"computed.returns.rote",asOf:"2025-12-31",verified:true}}]}];
  const bundle={symbol:"TEST",builtAt:"2026-11-01",statements:Object.fromEntries(["balanceAnnual","balanceQuarterly","incomeAnnual","incomeQuarterly","cashflowAnnual","cashflowQuarterly"].map(k=>[k,{ok:true,value:{data:{rows:[]}}}]))} as unknown as DataBundle;
  const provisional=applyFinancialDiagnostics(r,{} as ComputedMetrics,bundle,{pendingVerification:true});
  expect(provisional.fundamentals.returns[0]!.label).toBe("Return on tangible common equity");
  expect(provisional.fundamentals.returns[0]!.values[0]!.value.definition).toBeUndefined();
  expect(applyFinancialDiagnostics(r,{} as ComputedMetrics,bundle).fundamentals.returns[0]!.values[0]!.value.definition).toContain("Model tangible equity");
});

import { sharedCapexDefinition } from "@/pipeline/stageB/capital";
import { annualRevenueDefinition } from "@/pipeline/stageB/valuation";
import { normalizeJudgeOutput } from "@/pipeline/stageC/passes";
import { analystCaseToJsonSchema, judgeOutputToJsonSchema } from "@/report/schema";
import { leaseEvidenceNote } from "@/pipeline/stageB/leaseScope";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TracedStat } from "@/components/report/primitives";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";

describe("D-292..D-295 review: definitions are bounded, pipeline-owned presentation", () => {
  const emptyBundle = {symbol:"TEST",builtAt:"2026-11-01"} as DataBundle;
  it("accepts legacy bundles without statements and leaves the scoring object unchanged, including aliases", () => {
    const r=report();
    const before=structuredClone(r.scores);
    applyFigureDefinitions(r,emptyBundle);
    expect(r.scores).toEqual(before);
    expect(ReportSchema.safeParse(r).success).toBe(true);
  });
  it("removes numeric definitions from every model-facing wire schema and strips attempted model definitions", () => {
    const walk=(o:unknown):void => {
      if (!o || typeof o !== "object") return;
      const obj=o as Record<string,unknown>;
      if (obj.properties && typeof obj.properties === "object") {
        const p=obj.properties as Record<string,unknown>;
        if ("value" in p && "unit" in p && "source" in p) expect(p).not.toHaveProperty("definition");
      }
      Object.values(obj).forEach(walk);
    };
    walk(judgeOutputToJsonSchema()); walk(analystCaseToJsonSchema());
    const n={value:1,unit:"USD",source:"computed.test",asOf:null,definition:"model invented this"};
    expect(normalizeJudgeOutput({fundamentals:{graded:{keyNumbers:[n]}}})).not.toHaveProperty("fundamentals.graded.keyNumbers[0].definition");
  });
  it("does not describe a combined investment inventory as equity-method only", () => {
    const mixed=investmentDefinition(["us-gaap/EquityMethodInvestments","us-gaap/AvailableForSaleSecuritiesDebtSecuritiesNoncurrent","us-gaap/EquitySecuritiesWithoutReadilyDeterminableFairValueAmount"]);
    expect(mixed).toContain("noncurrent debt securities"); expect(mixed).toContain("nonmarketable equity securities"); expect(mixed).not.toContain("only");
    expect(investmentDefinition(["us-gaap/EquityMethodInvestments"])).toContain("only");
  });
  it("attaches the short provider-field convention to the exact tangible TTM source, never common-equity ROE or intangible assets", () => {
    const r=report();
    const num=(source:string)=>({value:23,unit:"%",source,asOf:"2025-12-31",verified:true});
    r.balanceSheet.coverage.numbers=[num("computed.returns.commonReturnTtm"),num("computed.returns.intangibleAssets")];
    const original=structuredClone(r);
    applyFigureDefinitions(r,emptyBundle,{returns:{commonReturnTtm:{basis:"tangible-common-equity"}}} as ComputedMetrics);
    expect(r.balanceSheet.coverage.numbers[0]!.definition).toBe(MODEL_TANGIBLE_COMMON_BASIS);
    expect(r.balanceSheet.coverage.numbers[1]!.definition).toBeUndefined();
    applyFigureDefinitions(original,emptyBundle,{returns:{commonReturnTtm:{basis:"common-equity"}}} as ComputedMetrics);
    expect(original.balanceSheet.coverage.numbers[0]!.definition).toBeUndefined();
    expect(MODEL_TANGIBLE_COMMON_BASIS).not.toMatch(/mortgage|deferred-tax|diluted|bank/i);
  });
  it("uses one proven definition only for uniform periods, and discloses mixed and unproved histories", () => {
    const combined=capexDefinition(["ifrs-full/PurchaseOfPropertyPlantAndEquipmentAndIntangibleAssets"]);
    const ppe=capexDefinition(["ifrs-full/PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"]);
    expect(sharedCapexDefinition([combined,combined])).toBe(combined);
    expect(sharedCapexDefinition([combined,ppe])).toContain("differ across periods");
    expect(sharedCapexDefinition([combined,null])).toContain("not established for every period");
  });
  it("keeps producer labels and renders a separate wrapping definition on app, Markdown and print", () => {
    const n={value:10,unit:"currency",source:"computed.current-capital.total-debt-including-leases",asOf:null,verified:true,definition:"lease treatment not established from the filing"};
    expect(figureRow(n).label).toBe("Debt used in this report");
    const html=renderToStaticMarkup(createElement(TracedStat,{label:figureRow(n).label,n}));
    expect(html).toContain("block whitespace-normal break-words"); expect(html).toContain(n.definition);
    const r=report();r.balanceSheet.debtProfile.numbers=[n];
    expect(reportToMarkdown(r)).toContain(n.definition); expect(reportToPrintHtml(r)).toContain(n.definition);
    expect(reportToMarkdown(r)).toContain("| Debt used in this report | ");
  });
  it("renders per-period definitions without concatenating into stored metric labels, and is idempotent", () => {
    const r=report();r.fundamentals.returns=[{label:"Return on tangible common equity",values:[{period:"2025-12-31",value:{value:20,unit:"%",source:"computed.returns.rote",asOf:"2025-12-31",verified:true}}]}];
    applyFigureDefinitions(r,emptyBundle);const once=structuredClone(r);applyFigureDefinitions(r,emptyBundle);
    expect(r).toEqual(once);expect(r.fundamentals.returns[0]!.label).toBe("Return on tangible common equity");
    expect(reportToMarkdown(r)).toContain(MODEL_TANGIBLE_COMMON_BASIS);
  });
  it("uses the same filed debt composition for the label and lease note, with unknown and wrong-period controls", () => {
    const row={date:"2025-12-31",reportedCurrency:"USD",totalDebt:30,fieldProvenance:{totalDebt:{source:"edgar",unit:"USD",periodEnd:"2025-12-31",periodStart:null,filings:[{accn:"one"}],tags:["us-gaap/OperatingLeaseLiabilityCurrent","us-gaap/OperatingLeaseLiabilityNoncurrent"]}}};
    expect(leaseEvidenceNote(row)).toContain(debtCompositionDefinition(row)!);
    expect(leaseEvidenceNote(row)).not.toContain("Debt inclusion is not independently established");
    expect(debtCompositionDefinition({...row,date:"2026-01-01"})).toBeNull();
    expect(leaseEvidenceNote(null)).toContain("lease coverage is unverified");
  });
  it("labels the quote share count as well as the divisor in ADS units", () => {
    const dcf=report().valuation.dcf;dcf.bridge={enterpriseValue:100,netDebt:10,minorityInterest:0,preferredEquity:0,equityValue:90,dilutedShares:10,presentValueExplicit:50,presentValueTerminal:50,currency:"USD",asOf:"2025-12-31",sharesOutstandingAtQuote:10,shareUnit:"ADS-equivalent"};
    const rows=valuationAuditTables(dcf).flatMap(t=>t.rows);
    expect(rows.find(r=>r[0]!.startsWith("Shares outstanding at the quote"))?.[0]).toContain("ADS-equivalent");
  });
  it("discloses an unmatched annual provider line beside the exact same-filing total, with P8, period and captured-line controls", () => {
    const point={start:"2025-01-01",end:"2025-12-31",val:2200,accn:"one",filed:"2026-02-01",form:"10-K"};
    const facts:CompanyFacts={cik:1,entityName:"Example",facts:{"us-gaap":{Revenues:{units:{USD:[point]}}}}};
    const row={date:"2025-12-31",revenue:2000,reportedCurrency:"USD",filingDate:"2026-02-01"};
    expect(annualRevenueDefinition(row,facts,"2026-11-01")).toBe("provider revenue line, not reconciled to a filed line; filed total revenues for FY2025 were 2,200 USD (10-K one)");
    expect(annualRevenueDefinition({...row,revenue:2200.1},facts,"2026-11-01")).toBeNull();
    expect(annualRevenueDefinition({...row,filingDate:"2026-03-01"},facts,"2026-11-01")).toBeNull();
    facts.facts["us-gaap"]!.SalesRevenueNet={units:{USD:[{...point,val:2000}]}};
    expect(annualRevenueDefinition(row,facts,"2026-11-01")).toBeNull();
  });
});

import { displayClaimText } from "@/report/presentation";
it("names the ADS basis beside a uniquely cited share-count claim without rewriting its value or verification (D-294)", () => {
  const source="payload.statements.income-statement-annual.2025-12-31.diluted-shares";
  const claim={text:"Diluted weighted-average shares were 5.19 billion.",label:"FACT" as const,source,asOf:"2025-12-31"};
  const n={value:5.19e9,unit:"shares",source,asOf:"2025-12-31",verified:false,definition:"ADS-equivalent shares"};
  expect(displayClaimText(claim,[n])).toContain(`${claim.text} [Cited share-count basis: ADS-equivalent shares.]`);
  expect(n.verified).toBe(false);
  expect(displayClaimText(claim,[{...n,asOf:"2024-12-31"}])).toBe(claim.text);
});

it("does not apply a latest-period definition to an ambiguous capex-family or CAGR source (D-292)", () => {
  const r=report();
  r.balanceSheet.capexTrajectory.numbers=[{value:10,unit:"%",source:"computed.capital.capexIntensity",asOf:"2025-12-31",period:null,verified:true}];
  const b={symbol:"TEST",builtAt:"2026-11-01",statements:{cashflowAnnual:{ok:true,value:{data:{rows:[{date:"2025-12-31",capitalExpenditure:-10,fieldProvenance:{capitalExpenditure:{tags:["us-gaap/PaymentsToAcquirePropertyPlantAndEquipment","us-gaap/PaymentsToAcquireIntangibleAssets"]}}}]}}}}} as unknown as DataBundle;
  applyFigureDefinitions(r,b);
  expect(r.balanceSheet.capexTrajectory.numbers[0]!.definition).toContain("not established for every period");
});

import { keyDataRows, consensusTables } from "@/report/presentation";
it("uses Stage B's rebuilt debt composition, without lending its basis to a different raw amount (D-295)", () => {
  const date = "2026-06-30";
  const corrected = {date, reportedCurrency:"USD", totalDebt:45, cashAndShortTermInvestments:5,
    fieldProvenance:{totalDebt:{source:"edgar",unit:"USD",periodEnd:date,periodStart:null,filings:[{accn:"synthetic-rebuild"}],
      tags:["us-gaap/OperatingLeaseLiabilityCurrent","us-gaap/OperatingLeaseLiabilityNoncurrent"]}}};
  const c = attachCurrentCapital(computeCapital([],[],[],[],{price:null}), {
    income:{date,revenue:100,netIncome:10}, cashFlow:{date,operatingCashFlow:20,capitalExpenditure:-5}, balance:corrected, currency:"USD"});
  const bundle = {symbol:"TEST",builtAt:"2026-11-01",statements:Object.fromEntries(
    ["balanceAnnual","balanceQuarterly","incomeAnnual","incomeQuarterly","cashflowAnnual","cashflowQuarterly"].map(k=>[k,{ok:true,value:{data:{rows:k==="balanceQuarterly" ? [{date,reportedCurrency:"USD",totalDebt:30}] : []}}}]))} as unknown as DataBundle;
  const r=report();
  r.balanceSheet.debtProfile.numbers=[
    ...["computed.capital.current.debtBridge.totalDebtIncludingLeases","computed.current-capital.total-debt-including-leases"].map(source=>({source,value:45,unit:"currency",asOf:date,verified:true})),
    {source:`payload.statements.balance-sheet-quarterly.${date}.total-debt`,value:30,unit:"currency",asOf:date,verified:true},
    {source:"computed.current-capital.total-debt-including-leases",value:45,unit:"currency",asOf:"2025-12-31",verified:true}];
  applyFigureDefinitions(r,bundle,{capital:c} as ComputedMetrics);
  const [bridge,alias,raw,stale]=r.balanceSheet.debtProfile.numbers;
  expect(bridge!.definition).toBe("includes operating leases in the filed debt composition");
  expect(alias!.definition).toBe(bridge!.definition);
  expect(c.current!.debtBridge.leaseEvidenceNote).toContain(bridge!.definition!);
  expect(raw!.definition).toBe("lease treatment not established from the filing");
  expect(stale!.definition).toBeUndefined();
  expect(r.balanceSheet.debtProfile.numbers.map(n=>n.value)).toEqual([45,45,30,45]);
});

it("keeps ADS units on provider scope branches and dilution notes, with ordinary and no-scope controls (D-294)", () => {
  const r=report();
  r.marketData = {version:"1",currency:"USD",estimateCurrency:null,estimateCurrencyBasis:null,quote:null,shares:null,enterpriseValue:null,estimates:[],estimatesAsOf:null,priceTarget:null,gradeCounts:null,shortInterest:null};
  r.marketData.shares={outstanding:100,float:null,freeFloatPct:null,asOf:"2025-12-31",shareUnit:"ADS-equivalent"};
  r.valuation.marketValueScope={status:"unresolved"} as NonNullable<typeof r.valuation.marketValueScope>;
  expect(keyDataRows(r).find(row=>row.label.startsWith("Provider shares"))?.label).toBe("Provider shares (scope unverified) (ADS-equivalent)");
  r.valuation.marketValueScope={status:"resolved",multiClass:true} as NonNullable<typeof r.valuation.marketValueScope>;
  expect(consensusTables(r).flatMap(t=>t.rows).find(row=>row[0]!.startsWith("Provider shares"))?.[0]).toBe("Provider shares (quoted class only) (ADS-equivalent)");
  delete r.valuation.marketValueScope;
  expect(keyDataRows(r).find(row=>row.label.startsWith("Shares outstanding"))?.label).toContain("ADS-equivalent");
  delete r.marketData.shares.shareUnit;
  expect(keyDataRows(r).find(row=>row.label.startsWith("Shares outstanding"))?.label).toBe("Shares outstanding");
  const inc=[{date:"2025-12-31",revenue:100,weightedAverageShsOut:100,weightedAverageShsOutDil:105}];
  const ads=computeCapital(inc,[],[],[],{price:null},{shareUnit:"ADS-equivalent"});
  const ordinary=computeCapital(inc,[],[],[],{price:null});
  expect(ads.dilution.note).toContain("diluted 105 vs basic 100 ADS-equivalent shares");
  expect(ordinary.dilution.note).toContain("diluted 105 vs basic 100 shares");
  expect(ordinary.dilution.note).not.toContain("ADS");
});

import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
it("labels the actual Stage B debt rebuild from filed borrowings and complete leases (D-295)", () => {
  const date="2026-03-31", filed="2026-05-01", accn="0000000042-26-000001";
  const concept=(val:number)=>({units:{USD:[{end:date,val:val*M,filed,accn,form:"10-Q"}]}});
  const facts:CompanyFacts={cik:42,entityName:"Synthetic manufacturer",facts:{"us-gaap":{
    LongTermDebtCurrent:concept(4),LongTermDebtNoncurrent:concept(100),
    OperatingLeaseLiability:concept(20),OperatingLeaseLiabilityCurrent:concept(2),OperatingLeaseLiabilityNoncurrent:concept(18),
    FinanceLeaseLiabilityCurrent:concept(1),FinanceLeaseLiabilityNoncurrent:concept(5)}}};
  const bundle=withIssuerFacts(completeCurrencyBundle({symbol:"TEST",siblingQuarterCurrencies:["USD","USD","USD","USD"]}),facts);
  if (!bundle.statements.balanceQuarterly.ok) throw Error("fixture");
  const raw=bundle.statements.balanceQuarterly.value.data.rows[0]!;
  Object.assign(raw,{date,cik:"0000000042",reportedCurrency:"USD",filingDate:filed,shortTermDebt:4*M,longTermDebt:100*M,
    capitalLeaseObligations:20*M,totalDebt:124*M,netDebt:114*M,cashAndCashEquivalents:10*M,cashAndShortTermInvestments:10*M});
  delete raw.operatingLeaseLiability;delete raw.financeLeaseLiability;delete raw.fieldProvenance;delete raw.fieldConflicts;
  const computed=runStageB(bundle), current=computed.capital.current!;
  expect(current.asOf).toBe(date);
  expect(current.debtBridge.totalDebtIncludingLeases).toBe(130*M);
  expect(raw.totalDebt).toBe(124*M);
  expect(raw.fieldProvenance).toBeUndefined();
  const r=report();r.balanceSheet.debtProfile.numbers=[{value:130*M,unit:"currency",source:"computed.current-capital.total-debt-including-leases",asOf:date,verified:true}];
  applyFigureDefinitions(r,bundle,computed);
  expect(r.balanceSheet.debtProfile.numbers[0]!.definition).toBe("includes operating leases in the filed debt composition");
  expect(current.debtBridge.leaseEvidenceNote).toContain(r.balanceSheet.debtProfile.numbers[0]!.definition!);
});


it("D-305 defines moat summary and score drivers while leaving common ROE alone",()=>{
  const r=report();
  r.fundamentals.graded.keyNumbers=["roteLevel","roteFloor","roeLevel"].map(key=>({value:20,unit:"%",source:`computed.scores.moat.${key}`,asOf:"2025-12-31",verified:true}));
  applyFigureDefinitions(r,{symbol:"TEST",builtAt:"2026-01-01"} as DataBundle);
  expect(r.fundamentals.graded.keyNumbers.slice(0,2).map(n=>n.definition)).toEqual([MODEL_TANGIBLE_COMMON_BASIS,MODEL_TANGIBLE_COMMON_BASIS]);
  expect(r.fundamentals.graded.keyNumbers[2]!.definition).toBeUndefined();
});

it("D-305 defines score cards and app signal rows from the same typed ROTE identity",()=>{
  const r=report();
  const n={value:20,unit:"%",source:"computed.scores.moat.roteLevel",asOf:"2025-12-31",verified:true};
  r.scores!.aspects.moat.drivers=[n];
  r.scores!.aspects.moat.signals=[{id:"roteLevel",raw:20,unit:"%",transformedScore:70,signalWeight:1,evidenceFraction:1,effectiveCompositeWeightPct:10,contributionPoints:2,family:"returns",asOf:"2025-12-31",period:"2025-12-31",startDate:null,endDate:null,windowYears:1,fallbackReason:null,operands:[]}];
  applyFigureDefinitions(r,{symbol:"TEST",builtAt:"2026-01-01"} as DataBundle);
  expect(r.scores!.aspects.moat.drivers[0]!.definition).toBe(MODEL_TANGIBLE_COMMON_BASIS);
  expect(scoreDriverTable(r.scores!)!.rows.flat().join(" ")).toContain(MODEL_TANGIBLE_COMMON_BASIS);
  r.scores!.aspects.moat.signals[0]!.id="roeLevel";
  expect(scoreDriverTable(r.scores!)!.rows.flat().join(" ")).not.toContain(MODEL_TANGIBLE_COMMON_BASIS);
});
