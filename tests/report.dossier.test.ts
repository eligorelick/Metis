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

describe("complete research dossier composition", () => {
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
