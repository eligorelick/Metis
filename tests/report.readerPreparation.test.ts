/**
 * P22: every surface prepares a stored report through prepareReportForSurface
 * (src/report/readerPreparation.ts). These tests pin each surface's order, prove
 * the shared step equals the chain each surface used to compose by hand, and
 * check idempotence, legacy reports and that the input is never modified.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyGradeOverrideContract } from "@/pipeline/stageC/gradeContract";
import { applyReportAssessmentStatus } from "@/report/assessment";
import { deriveReportCompletenessPresentation, withClassifiedDataOnlyGapCount } from "@/report/completeness";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import { legacyScopeQualifications } from "@/report/legacyScopeQualifications";
import { withPlainFigureNotes } from "@/report/presentation";
import { lenderConventionTables, withReaderConventions } from "@/report/readerConventions";
import { prepareReportForSurface, prepareReportSteps, SURFACE_PREPARATION, type ReportSurface } from "@/report/readerPreparation";
import type { Report } from "@/report/schema";
import { withSafeStoredReportView, withStoredReportView } from "@/report/storedReportView";
import { withValuationUseSafety } from "@/report/valuationUseSafety";
import { loadTask28Fixture, task28LegacyMissingBlocksReport, task28LegacyOptionalReport, task28SentinelReport } from "./helpers/task28Report";
import { freezeReport, reportDigest } from "./helpers/uiParityContract";

const SURFACES: readonly ReportSurface[] = ["markdown", "print", "audit", "web"];

function dataOnlyReport(): Report {
  const report = loadTask28Fixture();
  report.appendix.missingData.push({ field: "analysis.llm", severity: "critical", reason: "Analysis attempted and failed; retained deterministic snapshot." });
  return applyReportAssessmentStatus(report);
}

function demoReport(name: string): () => Report {
  return () => JSON.parse(fs.readFileSync(path.join(process.cwd(), "fixtures", "report", name), "utf8")) as Report;
}

/** Saved-report fixtures, parsed as the app parses a stored row (legacy read modes included). */
function storedReport(name: string): () => Report {
  return () => {
    const parsed = parseStoredReportWithSafety(fs.readFileSync(path.join(process.cwd(), "fixtures", "report", name), "utf8"));
    if (parsed === null) throw new Error(`${name} did not parse`);
    return parsed.report;
  };
}

const FIXTURES: ReadonlyArray<readonly [string, () => Report]> = [
  ["canonical", loadTask28Fixture],
  ["sentinel", task28SentinelReport],
  ["legacy missing blocks", task28LegacyMissingBlocksReport],
  ["legacy optional", task28LegacyOptionalReport],
  ["data-only", dataOnlyReport],
  ["demo current", demoReport("DEMO-current.json")],
  ["demo sample (stored, parsed)", storedReport("DEMO-sample.json")],
];

/** The chains each entry point composed by hand before the shared step (main at 0ace9d9c). */
const HAND_WRITTEN: Record<ReportSurface, (input: Report) => { report: Report; lenderTables: unknown }> = {
  markdown: exportChain,
  print: exportChain,
  web: (input) => ({
    report: withValuationUseSafety(withPlainFigureNotes(withClassifiedDataOnlyGapCount(withReaderConventions(withStoredReportView(input))))),
    lenderTables: lenderConventionTables(input),
  }),
  audit: (input) => ({ report: withSafeStoredReportView(input), lenderTables: [] }),
};

function exportChain(input: Report): { report: Report; lenderTables: unknown } {
  let report = withPlainFigureNotes(withClassifiedDataOnlyGapCount(input));
  report = applyReportAssessmentStatus(applyGradeOverrideContract(report, report.appendix.verificationLog ?? []));
  report = withSafeStoredReportView(report);
  const lenderTables = lenderConventionTables(report);
  return { report: withReaderConventions(report), lenderTables };
}

describe("shared report preparation (P22)", () => {
  it("pins each surface's steps and named differences", () => {
    expect(SURFACE_PREPARATION.markdown).toBe(SURFACE_PREPARATION.print);
    expect(SURFACE_PREPARATION.markdown).toEqual({
      steps: ["dataOnlyGapCount", "plainFigureNotes", "gradeContract", "storedView", "valuationUseSafety", "readerConventions"],
      lenderTables: "before-reader-conventions",
    });
    // EXCEPTION web-order and web-lender-tables (readerPreparation.ts).
    expect(SURFACE_PREPARATION.web).toEqual({
      steps: ["storedView", "readerConventions", "dataOnlyGapCount", "plainFigureNotes", "valuationUseSafety"],
      lenderTables: "input",
    });
    // EXCEPTION audit-partial.
    expect(SURFACE_PREPARATION.audit).toEqual({ steps: ["storedView", "valuationUseSafety"], lenderTables: "not-read" });
  });

  describe.each(FIXTURES)("%s", (_name, make) => {
    it.each(SURFACES)("equals the chain %s used to compose by hand", (surface) => {
      const prepared = prepareReportForSurface(make(), surface);
      const expected = HAND_WRITTEN[surface](make());
      expect(JSON.stringify(prepared.report)).toBe(JSON.stringify(expected.report));
      expect(prepared.lenderTables).toEqual(expected.lenderTables);
      expect(prepared.scopeQualifications).toEqual(legacyScopeQualifications(expected.report));
      expect(prepared.completeness).toEqual(deriveReportCompletenessPresentation(expected.report.meta.dataCompleteness, expected.report.appendix.missingData, expected.report.appendix.sources));
    });

    it.each(SURFACES)("applies the %s steps in their listed order", (surface) => {
      const input = make();
      expect(JSON.stringify(prepareReportForSurface(input, surface).report)).toBe(JSON.stringify(prepareReportSteps(input, SURFACE_PREPARATION[surface].steps)));
    });

    it.each(SURFACES)("never modifies the %s input", (surface) => {
      const input = freezeReport(make());
      const before = reportDigest(input);
      expect(() => prepareReportForSurface(input, surface)).not.toThrow();
      expect(reportDigest(input)).toBe(before);
    });

    // The saved-report parser already applies the stored readers and the grade
    // contract once, and the exports apply them again, so a second pass must not
    // change the content. (On some reports it reorders object keys; that
    // already happens today, as the parser and the exports both apply them.)
    it.each(SURFACES)("is idempotent for %s: preparing a prepared report changes nothing", (surface) => {
      const once = prepareReportForSurface(make(), surface).report;
      const twice = prepareReportForSurface(structuredClone(once), surface).report;
      expect(twice).toStrictEqual(once);
    });
  });

});
