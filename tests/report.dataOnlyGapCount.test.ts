import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { enrichDataOnlyReport } from "@/pipeline/stageC/dataOnlyReport";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

function fixture() {
  const report = loadTask28Fixture();
  report.appendix.missingData = [
    { field: "analysis.llm", severity: "warn", reason: "AI disabled" },
    { field: "provider.quote", severity: "warn", reason: "Missing quote" },
    { field: "provider.estimate", severity: "warn", reason: "Missing estimates" },
    { field: "provider.info", severity: "info", reason: "Available context" },
    { field: "provider.expected", severity: "warn", reason: "Expected omission", expected: true },
  ];
  return report;
}
it("counts classified data gaps instead of manifest entries in new data-only synthesis", () => {
  const b = completeCurrencyBundle({}), computed = runStageB(b);
  const result = enrichDataOnlyReport(fixture(), { bundle: b, computed, reason: "AI disabled" });
  expect(result.verdict.synthesis).toContain("2 data gaps recorded in the appendix.");
  expect(result.verdict.synthesis).not.toContain("5 data gaps");
});
it("corrects only the anchored legacy data-only sentence across reader surfaces without mutating the saved report", () => {
  const report = fixture();
  report.verdict.synthesis = "Snapshot. 0 forensic flags raised; 5 data gaps disclosed in the appendix. Figures below come from fetched data and deterministic computations; no completed analyst synthesis is available.";
  const before = JSON.stringify(report);
  for (const text of [reportToMarkdown(report), reportToPrintBody(report), renderToStaticMarkup(createElement(ReportView, { report }))]) {
    expect(text).toContain("2 data gaps recorded in the appendix.");
    expect(text).not.toContain("5 data gaps disclosed");
  }
  expect(JSON.stringify(report)).toBe(before);
  report.verdict.synthesis = "The analyst sees 5 data gaps disclosed in the appendix.";
  expect(reportToMarkdown(report)).toContain(report.verdict.synthesis);
  report.appendix.missingData = [];
  report.verdict.synthesis = "Snapshot. 0 forensic flags raised; 5 data gaps disclosed in the appendix. Figures below come from fetched data and deterministic computations; no completed analyst synthesis is available.";
  expect(reportToMarkdown(report)).toContain("5 data gaps disclosed in the appendix.");
});
