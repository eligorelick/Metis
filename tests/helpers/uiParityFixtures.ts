/**
 * The seven fixture reports the UI parity tests render (D-241, D-246):
 * canonical, sentinel context, legacy missing blocks, legacy optional,
 * data-only with limited evidence, unknown currency with negative and stale
 * input, and more than one hundred long claims.
 */
import { applyReportAssessmentStatus } from "@/report/assessment";
import type { Report } from "@/report/schema";
import { loadTask28Fixture, task28SentinelReport, task28LegacyMissingBlocksReport, task28LegacyOptionalReport } from "./task28Report";

export function dataOnlyReport(): Report {
  const report = loadTask28Fixture();
  report.appendix.missingData.push({ field: "analysis.llm", severity: "critical", reason: "Analysis attempted and failed; retained deterministic snapshot." });
  report.scores!.aspects.quality.dataCompleteness = 0.1;
  report.scores!.aspects.balanceSheet.score = null;
  report.scores!.aspects.balanceSheet.band = null;
  return applyReportAssessmentStatus(report);
}

export function missingCurrencyReport(): Report {
  const report = loadTask28Fixture();
  report.fundamentals.graded.keyNumbers[0] = { ...report.fundamentals.graded.keyNumbers[0]!,
    value: -25.625, unit: "currency", currency: null, asOf: null, period: "FY2019", verified: false,
    sourceId: "PARITY:unknown-currency:negative", source: "PARITY:observed-negative-input" };
  report.meta.asOfMap["old.statement"] = "2019-12-31";
  return report;
}

export function longEvidenceReport(): Report {
  const report = loadTask28Fixture();
  report.verdict.executiveSummary = Array.from({ length: 105 }, (_, index) => ({
    label: "FACT", text: `PARITY claim ${index}: ${"An observed fixture condition remains explicit. ".repeat(8)}`,
    source: `PARITY:source:${index}`, sourceId: `PARITY:registry:${index}`, asOf: "2025-12-31",
  }));
  return report;
}

export const LAYOUT_FIXTURES: ReadonlyArray<readonly [string, () => Report]> = [
  ["canonical", loadTask28Fixture], ["sentinel context", task28SentinelReport],
  ["legacy missing blocks", task28LegacyMissingBlocksReport], ["legacy optional", task28LegacyOptionalReport],
  ["data-only and limited evidence", dataOnlyReport], ["unknown currency, negative and stale input", missingCurrencyReport],
  ["more than one hundred long claims", longEvidenceReport],
];
