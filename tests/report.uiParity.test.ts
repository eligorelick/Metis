import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { withPrincipalSummarySafety } from "@/report/principalAggregationSafety";
import { withHistoricalEnterpriseValueSafety } from "@/report/enterpriseValueSafety";
import { applyReportAssessmentStatus } from "@/report/assessment";
import type { Report } from "@/report/schema";
import { loadTask28Fixture, task28SentinelReport, task28LegacyMissingBlocksReport, task28LegacyOptionalReport } from "./helpers/task28Report";
import { assertUiParityContract, captureUiParityContract, freezeReport, readableHtml, reportDigest } from "./helpers/uiParityContract";

function surfaces(report: Report, layout: "classic" | "dossier" = "classic") {
  return {
    live: renderToStaticMarkup(createElement(ReportView, { report, layout })),
    markdown: reportToMarkdown(report), print: reportToPrintBody(report), audit: reportToAuditMarkdown(report),
  };
}

function dataOnlyReport(): Report {
  const report = loadTask28Fixture();
  report.appendix.missingData.push({ field: "analysis.llm", severity: "critical", reason: "Analysis attempted and failed; retained deterministic snapshot." });
  report.scores!.aspects.quality.dataCompleteness = 0.1;
  report.scores!.aspects.balanceSheet.score = null;
  report.scores!.aspects.balanceSheet.band = null;
  return applyReportAssessmentStatus(report);
}

function missingCurrencyReport(): Report {
  const report = loadTask28Fixture();
  report.fundamentals.graded.keyNumbers[0] = { ...report.fundamentals.graded.keyNumbers[0]!,
    value: -25.625, unit: "currency", currency: null, asOf: null, period: "FY2019", verified: false,
    sourceId: "PARITY:unknown-currency:negative", source: "PARITY:observed-negative-input" };
  report.meta.asOfMap["old.statement"] = "2019-12-31";
  return report;
}

function longEvidenceReport(): Report {
  const report = loadTask28Fixture();
  report.verdict.executiveSummary = Array.from({ length: 105 }, (_, index) => ({
    label: "FACT", text: `PARITY claim ${index}: ${"An observed fixture condition remains explicit. ".repeat(8)}`,
    source: `PARITY:source:${index}`, sourceId: `PARITY:registry:${index}`, asOf: "2025-12-31",
  }));
  return report;
}

describe("production UI semantic preservation baseline", () => {
  it.each(([
    ["canonical", loadTask28Fixture], ["sentinel context", task28SentinelReport],
    ["legacy missing blocks", task28LegacyMissingBlocksReport], ["legacy optional", task28LegacyOptionalReport],
    ["data-only and limited evidence", dataOnlyReport], ["unknown currency, negative and stale input", missingCurrencyReport],
    ["more than one hundred long claims", longEvidenceReport],
  ] as const).flatMap(([name, makeReport]) => (["classic", "dossier"] as const).map((layout) => [`${name} in ${layout}`, makeReport, layout] as const)))("retains report and export meanings without mutating %s", (_, makeReport, layout) => {
    const report = freezeReport(makeReport());
    const before = reportDigest(report);
    const admitted = withHistoricalEnterpriseValueSafety(withPrincipalSummarySafety(report));
    const contract = captureUiParityContract(admitted);
    expect(() => assertUiParityContract(contract, surfaces(report, layout))).not.toThrow();
    expect(reportDigest(report)).toBe(before);
    expect(contract.figures.length).toBeGreaterThan(0);
  });

  it.each(["warning", "source", "numeric context"])("detects a deliberately omitted %s", (kind) => {
    const report = loadTask28Fixture();
    report.appendix.missingData.push({ field: "ui.parity.sentinel", severity: "critical", reason: "PARITY-WARNING-MUST-SURVIVE" });
    report.fundamentals.graded.keyNumbers[0] = {
      ...report.fundamentals.graded.keyNumbers[0]!, sourceId: "PARITY-SOURCE-MUST-SURVIVE", period: "PARITY-PERIOD-MUST-SURVIVE",
    };
    const contract = captureUiParityContract(withHistoricalEnterpriseValueSafety(withPrincipalSummarySafety(report)));
    const rendered = surfaces(report);
    const marker = kind === "warning" ? "PARITY-WARNING-MUST-SURVIVE" : kind === "source" ? "PARITY-SOURCE-MUST-SURVIVE" : "PARITY-PERIOD-MUST-SURVIVE";
    rendered.audit = rendered.audit.replaceAll(marker, "REMOVED");
    expect(() => assertUiParityContract(contract, rendered)).toThrow(/Missing/);
  });

  it("does not count hidden duplicate content as accessible report text", () => {
    expect(readableHtml('<p>Visible</p><div hidden>Hidden warning</div><span class="sr-only">Duplicate</span><script>fake source</script>').text).toBe("Visible");
  });
});
