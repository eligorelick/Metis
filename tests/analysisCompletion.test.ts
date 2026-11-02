import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportSnapshotDetails } from "@/components/report/ReportSnapshotHeader";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { buildDataCompleteness } from "@/report/completeness";
import { ReportSchema, REPORT_SPEC_VERSION } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";
import { analysisOutcomeFromSteps, analysisOutcomeText } from "@/report/analysisCompletion";

describe("mandatory analysis completion", () => {
  const complete = ["bull", "bear", "synthesize", "verify"].map(step => ({ step, status: "done" }));
  it("requires every mandatory stage and an accepted final report", () => {
    expect(analysisOutcomeFromSteps(complete)).toBe("complete");
    for (const stage of complete) expect(analysisOutcomeFromSteps(complete.map(s => s === stage ? { ...s, status: "error" } : s))).toBe("data-only");
    expect(analysisOutcomeFromSteps([])).toBe("data-only");
    expect(analysisOutcomeFromSteps(complete, { dataOnly: true })).toBe("data-only");
  });
  it("accepts explicit durable artifact reuse, never arbitrary skipped analysis", () => {
    const steps = complete.map(s => s.step === "verify" ? s : { ...s, status: "skipped", detail: "covered by reused durable verify artifact" });
    expect(analysisOutcomeFromSteps(steps)).toBe("complete");
    expect(analysisOutcomeFromSteps(steps.map(s => ({ ...s, detail: "upstream failure" })))).toBe("data-only");
  });
});

// Server-rendered UI/export smoke only: no live browser or provider run.
describe("saved completion UI/export parity", () => {
  it.each(["complete", "data-only"] as const)("preserves the saved %s status and limits", outcome => {
    const snapshot = loadTask28Fixture();
    snapshot.meta.specVersion = REPORT_SPEC_VERSION;
    snapshot.meta.analysisOutcome = outcome;
    if (outcome === "data-only") snapshot.appendix.missingData.push({ field: "analysis.llm", reason: "Mandatory verification failed; accepted artifacts remain saved.", severity: "warn" });
    snapshot.meta.dataCompleteness = buildDataCompleteness(snapshot.appendix.missingData);
    const stored = JSON.stringify(snapshot);
    const report = ReportSchema.parse(JSON.parse(stored));
    const text = analysisOutcomeText(outcome);
    const ui = renderToStaticMarkup(createElement(ReportSnapshotDetails, { report, reportId: 59, status: "done" }));
    expect(ui).toContain("#59");
    expect(ui).toContain("Process: ");
    expect(ui).toContain("DONE");
    for (const rendered of [ui, reportToMarkdown(report), reportToPrintHtml(report), reportToAuditMarkdown(report)]) {
      expect(rendered).toContain(text);
      expect(rendered).not.toContain(analysisOutcomeText(outcome === "complete" ? "data-only" : "complete"));
    }
    expect(JSON.stringify(snapshot)).toBe(stored);
  });
  it("does not infer mandatory success for an unstamped historical record", () => {
    const report = loadTask28Fixture();
    delete report.meta.analysisOutcome;
    expect(analysisOutcomeText(undefined)).toContain("not recorded");
    const ui = renderToStaticMarkup(createElement(ReportSnapshotDetails, { report, reportId: 58, status: "done" }));
    for (const rendered of [ui, reportToMarkdown(report), reportToPrintHtml(report), reportToAuditMarkdown(report)]) expect(rendered).not.toContain("Mandatory stages completed");
  });
});
