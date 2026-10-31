import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import { withLegacyImpliedReturnShareBasis, IMPLIED_RETURN_SHARE_BASIS_SPEC } from "@/report/legacyImpliedReturnShareBasis";
import { applyGradeOverrideContract } from "@/pipeline/stageC/gradeContract";
import { loadTask28Fixture } from "./helpers/task28Report";

const field = "presentation.legacyValuation.impliedReturnShareBasis";
const phrase = "was not solved on the share count the value per share divides by";
function stored(version = "1.1.0", affected = true) {
  const report = loadTask28Fixture();
  report.meta.specVersion = version;
  if (affected) report.scores!.aspects.valuation.drivers = [{
    value: 22.63, unit: "pp", source: "computed.scores.valuation.roeImpliedVsAchievable",
    asOf: "2025-12-31", verified: true,
  }];
  return report;
}

describe("FIN-506: stored implied-return share-basis disclosure", () => {
  it.each(["1.1.0", "1.50.0", "1.51.0"])("adds a view-only note to an affected report at %s", version => {
    const report = stored(version), before = JSON.stringify(report);
    const parsed = parseStoredReportWithSafety(before);
    expect(parsed).not.toBeNull();
    const view = parsed!.report;
    expect(view.appendix.missingData.find(g => g.field === field)).toMatchObject({
      reason: expect.stringContaining(phrase), severity: "info", expected: true,
    });
    expect(view.scores).toEqual(report.scores);
    // The existing stored parser adds grade-contract metadata; pin that exact main behavior.
    expect(view.valuation).toEqual(applyGradeOverrideContract(report, report.appendix.verificationLog ?? []).valuation);
    expect(JSON.stringify(report)).toBe(before);
    const twice = parseStoredReportWithSafety(JSON.stringify(view))!.report;
    expect(twice.appendix.missingData.filter(g => g.field === field)).toHaveLength(1);
  });
  it.each(["1.52.0", "1.53.0"])("does not mark corrected reports at %s", version => {
    expect(parseStoredReportWithSafety(JSON.stringify(stored(version)))!.report.appendix.missingData.some(g => g.field === field)).toBe(false);
  });
  it("does not mark a report without the affected signal", () => {
    expect(parseStoredReportWithSafety(JSON.stringify(stored("1.1.0", false)))!.report.appendix.missingData.some(g => g.field === field)).toBe(false);
  });
  it("the pure adapter preserves all existing fields and is immutable and idempotent", () => {
    const report = stored(), before = JSON.stringify(report);
    const view = withLegacyImpliedReturnShareBasis(report);
    expect(IMPLIED_RETURN_SHARE_BASIS_SPEC).toBe("1.52.0");
    expect(view.valuation).toBe(report.valuation);
    expect(view.scores).toBe(report.scores);
    expect(view.appendix.verificationLog).toBe(report.appendix.verificationLog);
    expect({ ...view, appendix: { ...view.appendix, missingData: report.appendix.missingData } }).toEqual(report);
    expect(JSON.stringify(report)).toBe(before);
    expect(withLegacyImpliedReturnShareBasis(view)).toBe(view);
    const current = stored(IMPLIED_RETURN_SHARE_BASIS_SPEC);
    expect(withLegacyImpliedReturnShareBasis(current)).toBe(current);
  });
  it("composes the same note in screen, Markdown, print and audit views without changing stored fields", () => {
    const report = stored(), before = JSON.stringify(report);
    for (const text of [
      renderToStaticMarkup(createElement(ReportView, { report })), reportToMarkdown(report),
      reportToPrintBody(report), reportToAuditMarkdown(report),
    ]) expect(text.includes(phrase), "FIN-506 note must be visible in every reader and audit export").toBe(true);
    expect(JSON.stringify(report)).toBe(before);
  });
});
