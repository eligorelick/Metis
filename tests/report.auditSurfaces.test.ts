import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { scoreAuditTables, valuationAuditTables, projectionAuditTables, factualValidationText } from "@/report/auditTables";
import { ReportSchema, type Report } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

function auditReport(): Report {
  const report = loadTask28Fixture();
  const coverage = {
    numeric:{supported:1,total:2,rate:0.5}, factualClaims:{supported:3,total:4,rate:0.75}, judgments:{cited:0,total:0,rate:null},
    factualValidation:{cited:3,validated:1,contradicted:1,unchecked:2,total:4,rate:0.25},
  };
  report.meta.provenanceCoverage = coverage;
  report.appendix.provenanceCoverage = coverage;
  report.meta.runSnapshot = {hash:"a".repeat(64),formatVersion:"RUN_INPUT_SNAPSHOT_1",capturedAt:"2026-10-14T03:00:00.000Z"};
  report.scores!.assessments = {
    businessQuality:{score:74,band:"B",basis:"Operating quality independent of quoted price"},
    valuation:{score:35,band:"D",basis:"Price and cash-flow assumptions"},
    evidenceCompleteness:0.8,calibration:"unbacktested-house-rules",
  };
  report.scores!.factorExposure = [{family:"capital-returns",weightPct:25,aboveNeutralPoints:5}];
  report.scores!.aspects.quality.signals = [{id:"roic",raw:0.23456789,unit:"frac",transformedScore:70,signalWeight:1,evidenceFraction:1,effectiveCompositeWeightPct:25,contributionPoints:5,family:"capital-returns",asOf:"2026-06-30",period:"2025-07-01 to 2026-06-30",startDate:"2025-07-01",endDate:"2026-06-30",windowYears:1,fallbackReason:null,operands:[]}];
  report.valuation.dcf.bridge = {enterpriseValue:1200000000,netDebt:100000000,minorityInterest:0,preferredEquity:0,equityValue:1100000000,dilutedShares:10000000,presentValueExplicit:400000000,presentValueTerminal:800000000,currency:"USD",asOf:"2026-06-30"};
  report.valuation.dcf.forecastRows = [{year:1,period:"NTM ending 2027-06-30",periodStart:"2026-07-01",periodEnd:"2027-06-30",periodBasis:"rolling-12-month",revenue:200000000,growthPct:10,ebitMarginPct:30,taxRatePct:21,nopat:47400000,reinvestment:10000000,fcff:37400000,presentValue:34000000}];
  report.projections!.scenarioAssumptions = {methodVersion:"scenario-sentinel-1",shockPersistence:"persistent-explicit-horizon",terminalTransition:"Terminal growth converges to 3%",growthMarginCorrelation:0.5,scenarios:[{name:"base",growthDeltaPp:0,marginDeltaPp:0}],alternatives:[{name:"decaying-growth-shock",bullPerShare:112,bearPerShare:84,basis:"Growth shock decays; terminal assumptions unchanged"}]};
  const point = report.projections!.series[0]!.base[0]!;
  Object.assign(point,{periodStart:"2026-07-01",periodEnd:"2027-06-30",periodBasis:"rolling-12-month"});
  const eps = report.projections!.series.find(s=>s.metric==="epsDiluted")!;
  eps.capitalReturn = {shareCountAnnualizedPct:-2.59,appliedShareCountAnnualizedPct:0,policy:"flat-share-conservative",basis:"Repurchases have no future funding schedule",netIncomeToEbit:0.79};
  eps.flatShare = {bull:eps.bull,base:eps.base,bear:eps.bear,weighted:eps.weighted};
  eps.shareTrend = structuredClone(eps.flatShare);
  report.leadership.executives[0]!.grade = "not-assessed";
  report.leadership.executives[0]!.credibilityGrade = "not-assessed";
  report.leadership.executives[0]!.assessmentReason = "No attributable execution evidence in this run";
  return ReportSchema.parse(report);
}

describe("audit disclosures across live, Markdown and print reports",()=>{
  it("shows actual periods, financial bridges and validation status consistently without mutation",()=>{
    const report=auditReport(), before=JSON.stringify(report);
    const surfaces=[renderToStaticMarkup(createElement(ReportView,{report})),reportToMarkdown(report),reportToPrintBody(report)];
    // D-62: reader tables in the body; modeled point dates, raw signal values,
    // the scenario-construction record and the full validation partition in the
    // audit export.
    for (const surface of surfaces) {
      for (const text of ["Enterprise value to equity bridge","DCF annual cash-flow path","Common equity value","Score drivers","Factor-family exposure","Business quality","price attractiveness","2027-06-30","1/4 numeric claims numerically matched (not whole-claim validation)","1 contradicted","3/4 factual claims cited","No attributable execution evidence in this run","EPS share-count sensitivity","unfunded hypothetical","a".repeat(64)]) expect(surface).toContain(text);
    }
    const audit = reportToAuditMarkdown(report);
    for (const text of ["Signal evidence and contributions","2026-07-01","rolling-12-month","scenario-sentinel-1","1/4 numeric factual claims numerically matched","2 unchecked, 1 contradicted","Factual claims cited: 3/4"]) expect(audit).toContain(text);
    expect(JSON.stringify(report)).toBe(before);
  });
  it("does not manufacture legacy evidence, bridges or sensitivity paths",()=>{
    const report=loadTask28Fixture();
    expect(scoreAuditTables(report.scores!)).toEqual([expect.objectContaining({
      heading: "Factor contribution sensitivity", rows: [["Unavailable", expect.stringMatching(/complete.*reconcile/i)]],
    })]);
    expect(valuationAuditTables(report.valuation.dcf)).toEqual([]);
    expect(projectionAuditTables(report.projections!)).toEqual([]);
    expect(factualValidationText()).toBeNull();
  });
});
