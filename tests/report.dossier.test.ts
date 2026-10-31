import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { REPORT_SECTION_MANIFEST } from "@/report/sectionManifest";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { loadTask28Fixture, task28LegacyMissingBlocksReport } from "./helpers/task28Report";
import { assertUiParityContract, captureUiParityContract, readableHtml, freezeReport, reportDigest } from "./helpers/uiParityContract";
import { withHistoricalEnterpriseValueSafety } from "@/report/enterpriseValueSafety";
import { withPrincipalSummarySafety } from "@/report/principalAggregationSafety";
import { ReportEvidenceRail } from "@/components/report/ReportEvidenceRail";
import { RunsOn } from "@/app/company/[symbol]/GenerateReport";
import { failedPassNote } from "@/report/execution";

describe("complete research dossier composition", () => {
  it("labels current routing settings as prospective", () => {
    const future = readableHtml(renderToStaticMarkup(createElement(RunsOn, { route: { label: "ChatGPT plan · future-model", ready: true } }))).text;
    expect(future).toContain("Next run");
    expect(future).toContain("future-model");
    expect(future).not.toContain("Runs on");
  });

  it("separates saved failed Sonnet attempts from the different next-run route", () => {
    const report = loadTask28Fixture();
    report.meta.model = "unavailable";
    report.meta.execution = ["bull attempt 1", "bull attempt 2", "bear"].map(step => ({ step,
      requestedModel: "claude-sonnet-5-5", effectiveModel: "claude-sonnet-5-5", requestedEffort: "high", effectiveEffort: "high",
      fallbackUsed: false, adjustments: [], note: failedPassNote(step) }));
    const before = reportDigest(report);
    const rail = readableHtml(renderToStaticMarkup(createElement(ReportEvidenceRail, { report }))).text;
    const future = readableHtml(renderToStaticMarkup(createElement(RunsOn, { route: { label: "ChatGPT plan · future-model", ready: true } }))).text;
    expect(rail).toContain("Saved model evidence");
    expect(rail).toContain("claude-sonnet-5-5");
    expect(rail).toContain("bull attempt 1");
    expect(rail).toContain("bull attempt 2");
    expect(rail).toContain("no usable analysis was completed");
    expect(rail).not.toContain("Requested model unavailable");
    expect(rail).not.toContain("future-model");
    expect(future).toContain("Next run");
    expect(future).toContain("future-model");
    expect(reportDigest(report)).toBe(before);
  });

  it("retains the full report semantics while composing one cover and recorded evidence rail", () => {
    const report = freezeReport(loadTask28Fixture());
    const before = reportDigest(report);
    const live = renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }));
    const admitted = withHistoricalEnterpriseValueSafety(withPrincipalSummarySafety(report));
    expect(() => assertUiParityContract(captureUiParityContract(admitted), {
      live, markdown: reportToMarkdown(report), print: reportToPrintBody(report), audit: reportToAuditMarkdown(report),
    })).not.toThrow();
    expect(live).toContain('aria-label="Executive research dossier"');
    expect(live).toContain('aria-label="Report evidence and gaps"');
    expect(live).toContain("Deterministic scorecard");
    expect(live).toContain("Analyst section assessments");
    expect(reportDigest(report)).toBe(before);
  });

  it("keeps all 14 destinations reachable for legacy reports without inventing projections or scores", () => {
    const report = task28LegacyMissingBlocksReport();
    const html = renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }));
    const { ids, text } = readableHtml(html);
    for (const section of REPORT_SECTION_MANIFEST) {
      expect(ids.has(`report-${section.key}`)).toBe(true);
      expect(html).toContain(`href="#report-${section.key}"`);
    }
    expect(text).toContain("Projections were not recorded in this snapshot");
    expect(text).toContain("No deterministic scorecard was recorded");
    expect(html).toContain('aria-label="Report contents"');
  });

  it("does not infer assessment dimensions when stored metadata is absent", () => {
    const report = loadTask28Fixture();
    delete report.scores!.assessments;
    const html = renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }));
    expect(html).toContain("Business quality");
    expect(html).toContain("Price attractiveness");
    expect(html).toContain("Evidence availability");
    expect(html).toContain("These separate assessment dimensions were not recorded");
  });

  it("keeps the classic report available without adding the dossier-only evidence rail", () => {
    const html = renderToStaticMarkup(createElement(ReportView, { report: loadTask28Fixture(), layout: "classic" }));
    expect(html).not.toContain('aria-label="Executive research dossier"');
    expect(html).not.toContain('aria-label="Report evidence and gaps"');
    expect(html).toContain("verdict · synthesis");
  });
});
