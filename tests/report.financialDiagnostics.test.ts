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
import { figureRow } from "@/report/presentation";

describe("D-292 figure definitions from filed families", () => {
  it("names combined tangible/intangible spending, including foreign concepts, and leaves PP&E alone unchanged", () => {
    expect(capexDefinition(["ifrs-full/PurchaseOfPropertyPlantAndEquipmentAndIntangibleAssets"])).toContain("property, plant and equipment plus intangible assets");
    expect(capexDefinition(["issuer/PaymentsToAcquireIntangibleAssets"])).toContain("intangible assets");
    expect(capexDefinition(["us-gaap/PaymentsToAcquirePropertyPlantAndEquipment"])).toBeNull();
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
    expect(figureRow({value:10,unit:"currency",source:"computed.capital.capexIntensity",asOf:null,verified:true,definition:"property, plant and equipment plus intangible assets"}).label).toContain("property, plant and equipment plus intangible assets");
    expect(MODEL_TANGIBLE_COMMON_BASIS).toContain("mortgage servicing rights");
    expect(MODEL_TANGIBLE_COMMON_BASIS).toContain("diluted shares");
  });
});

import { filedDefinitionMatches, type CompanyFacts } from "@/edgar/xbrl";
import { debtDefinition } from "@/pipeline/stageB/netDebt";
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
    expect(debtDefinition(["us-gaap/OperatingLeaseLiabilityCurrent"])).toBe("includes operating leases");
    expect(debtDefinition(["us-gaap/LongTermDebtNoncurrent","us-gaap/DebtCurrent"])).toContain("operating leases excluded");
    expect(debtDefinition([])).toContain("not independently established");
  });
  it("labels each debt history row from its source period, preserving values and report schema", () => {
    const r = report();
    r.balanceSheet.debtProfile.numbers = [{value:23,unit:"currency",source:"payload.statements.balance-sheet-annual.2025-12-31.total-debt",asOf:"2026-09-30",verified:true}];
    const b = {symbol:"TEST",builtAt:"2026-11-01",statements:Object.fromEntries(["balanceAnnual","balanceQuarterly","incomeAnnual","incomeQuarterly","cashflowAnnual","cashflowQuarterly"].map(k=>[k,{ok:true,value:{data:{rows:k === "balanceAnnual" ? [{date:"2025-12-31",totalDebt:23,fieldProvenance:{totalDebt:{tags:["us-gaap/OperatingLeaseLiabilityCurrent"]}}}] : []}}}]))} as unknown as DataBundle;
    applyFigureDefinitions(r,b);
    expect(figureRow(r.balanceSheet.debtProfile.numbers[0]!).label).toContain("includes operating leases");
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
  expect(applyFinancialDiagnostics(r,{} as ComputedMetrics,bundle).fundamentals.returns[0]!.label).toContain("Model tangible common equity");
});
