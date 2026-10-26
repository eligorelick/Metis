import { describe, expect, it } from "vitest";
import { buildDataCompleteness, deriveReportCompletenessPresentation } from "@/report/completeness";
import { compositeDisplay, compositeNote, evidencePercentText } from "@/report/assessment";
import { dataStateText, manifestReconciliationRows, syntheticNotice, trustRows } from "@/report/presentation";
import { reportToMarkdown, reportToAuditMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { loadTask28Fixture } from "./helpers/task28Report";
import { factualValidationText } from "@/report/auditTables";
import type { ManifestEntry } from "@/types/core";

function presentation(gaps: ManifestEntry[]) {
  return deriveReportCompletenessPresentation(buildDataCompleteness(gaps), gaps);
}

describe("reader trust refinement", () => {
  it("leads with degraded data state and keeps reconciliation confirmation in details", () => {
    const c = presentation([{field:"unavailable.input",severity:"warn",reason:"Not available"}]);
    expect(c.metadataStatus).toBe("confirmed");
    expect(c.statusText).toMatch(/^Data completeness: degraded/);
    expect(c.statusText).not.toContain("Completeness confirmed");
    expect(dataStateText(c)).toContain("1 data issue");
    expect(deriveReportCompletenessPresentation(undefined, []).statusText).toContain("unknown");
  });

  it("separates the critical analysis-only failure from grouped data issues and reconciles every raw entry", () => {
    const gaps: ManifestEntry[] = [
      {field:"analysis.llm",severity:"critical",reason:"AI unavailable"},
      {field:"fmp.historicalPriceEodFull(SPY)",severity:"warn",reason:"Missing"},
      {field:"fmp.historicalPriceEodFull(XLK)",severity:"warn",reason:"Missing"},
      ...Array.from({length:13},(_,i)=>({field:`missing.${i}`,severity:"warn" as const,reason:"Missing"})),
      {field:"fixture.reserved(DEMO)",severity:"info",expected:true,reason:"Fictional inputs"},
      {field:"note",severity:"info",reason:"Retained note"},
    ];
    const c = presentation(gaps);
    expect(c.state).toBe("blocked");
    expect(c.criticalCount).toBe(1);
    expect(c.dataCriticalCount).toBe(0);
    expect(c.dataWarningCount).toBe(14);
    expect(c.processDisclosureCount).toBe(1);
    const rows = manifestReconciliationRows(gaps,c);
    expect(rows.reduce((sum,row)=>sum+row.entries,0)).toBe(gaps.length);
    expect(rows.find(row=>row.kind==="data")?.entries).toBe(15);
    expect(rows.find(row=>row.kind==="process")?.entries).toBe(1);
    expect(dataStateText(c)).toContain("14 data issues");
    expect(dataStateText(c)).toContain("analysis-process");
  });

  it("uses one decimal without promoting insufficient evidence across its original floor", () => {
    expect(evidencePercentText(0.8381212121212122)).toBe("83.8%");
    expect(evidencePercentText(0.941788)).toBe("94.2%");
    expect(evidencePercentText(0.49999)).toBe("<50.0%");
    const scores = loadTask28Fixture().scores!;
    scores.assessments={businessQuality:{score:null,band:null,basis:"Not recorded"},valuation:{score:null,band:null,basis:"Not recorded"},evidenceCompleteness:0.49999,calibration:"unbacktested-house-rules"};
    expect(compositeDisplay(scores).grade).toBeNull();
    expect(compositeNote(scores)).toContain("<50.0%");
  });

  it("calls numerical matches matches, never validation of the whole claim", () => {
    const rows=trustRows({numeric:{supported:267,total:271,rate:267/271},factualClaims:{supported:140,total:140,rate:1},judgments:{cited:113,total:113,rate:1},factualValidation:{cited:140,validated:36,unchecked:104,contradicted:0,qualitative:19,total:140,rate:36/140}});
    expect(rows[0]?.value).toBe("267/271 (98.5%)");
    expect(rows.find(row=>row.label.startsWith("Numeric factual"))).toEqual({label:"Numeric factual claims numerically matched to a cited figure",value:"36/121; 85 not matched to a cited figure"});
    const detail=factualValidationText({numeric:{supported:267,total:271,rate:267/271},factualClaims:{supported:140,total:140,rate:1},judgments:{cited:113,total:113,rate:1},factualValidation:{cited:140,validated:36,unchecked:104,contradicted:0,qualitative:19,total:140,rate:36/140}})!;
    expect(detail).toContain("36/121 numeric factual claims numerically matched");
    expect(detail).toContain("85 unmatched numeric claims");
    expect(detail).toContain("19 qualitative claims");
    expect(detail).toContain("104 unchecked");
  });

  it("requires recorded fixture provenance, and carries fictional notices into detached exports", () => {
    const report=loadTask28Fixture();
    report.meta.symbol="DEMO";
    report.meta.model="unknown";
    report.meta.pipelineVersion="stage-c-1.6.1";
    report.appendix.missingData=[];
    expect(syntheticNotice(report)).toBeNull();
    report.appendix.missingData.push({field:"fixture.reserved(DEMO)",severity:"info",expected:true,reason:"All observations are invented for a fictional issuer."});
    expect(syntheticNotice(report)).toContain("fictional");
    for(const output of [reportToMarkdown(report),reportToAuditMarkdown(report),reportToPrintBody(report)]) expect(output).toContain("Synthetic demonstration");
  });

  it.each([undefined,999])("uses selected row identity in detached exports without replacing embedded provenance (%s)", embedded => {
    const report=loadTask28Fixture();
    if(embedded === undefined) delete report.meta.reportId; else report.meta.reportId=embedded;
    const before=JSON.stringify(report);
    expect(reportToMarkdown(report,{selectedReportId:3}).replaceAll("\\#","#")).toContain("| Saved report | #3 |");
    expect(reportToAuditMarkdown(report,{selectedReportId:3}).replaceAll("\\#","#")).toContain("| Saved report | #3 |");
    expect(reportToPrintBody(report,{selectedReportId:3})).toContain("<td>Saved report</td><td>#3</td>");
    expect(JSON.stringify(report)).toBe(before);
  });
});
