/**
 * The one place a saved report becomes the report a reader surface renders
 * (P22: one presentation rule per figure; P21: saved reports are immutable,
 * so every step here is a read-time view that returns a new report).
 *
 * Every entry point calls {@link prepareReportForSurface}: the Markdown export
 * (`reportToMarkdown`), the print body (`reportToPrintBody`, which the print
 * page and `reportToPrintHtml` use), the audit export (`reportToAuditMarkdown`)
 * and the app view (`ReportView`, both layouts). The common steps live here
 * once; where a surface prepares differently today, the difference is a named,
 * commented entry in {@link SURFACE_PREPARATION} below, so all of them can be
 * read in one file. Those differences are kept on purpose: this module does
 * not change what any surface renders. Making them agree is a separate,
 * reader-visible change (see tmp/drift/REPORT.md for what each one changes).
 */
import { applyGradeOverrideContract } from "@/pipeline/stageC/gradeContract";
import { applyReportAssessmentStatus } from "@/report/assessment";
import { deriveReportCompletenessPresentation, withClassifiedDataOnlyGapCount, type ReportCompletenessPresentation } from "@/report/completeness";
import { legacyScopeQualifications } from "@/report/legacyScopeQualifications";
import { withPlainFigureNotes } from "@/report/presentation";
import { lenderConventionTables, withReaderConventions } from "@/report/readerConventions";
import type { ReportAuditTable } from "@/report/auditTables";
import type { Report } from "@/report/schema";
import { withStoredReportView } from "@/report/storedReportView";
import { withValuationUseSafety } from "@/report/valuationUseSafety";
import { indexVerificationMarks } from "@/report/verificationMarks";

/** The reader surfaces that prepare a report before rendering it. */
export type ReportSurface = "markdown" | "print" | "audit" | "web";

/** Re-apply the stored grade contract, then the assessment status it implies. */
function withGradeContract(report: Report): Report {
  return applyReportAssessmentStatus(applyGradeOverrideContract(report, report.appendix.verificationLog ?? []));
}

/**
 * The named read-time steps, each a pure report -> report view. The stored
 * reader chain ({@link withStoredReportView}) is one step: its own order is
 * fixed in storedReportView.ts.
 */
export const READER_PREPARATION_STEPS = {
  /** Classified data-only gap count (completeness.ts). */
  dataOnlyGapCount: withClassifiedDataOnlyGapCount,
  /** Plain-figure reader notes (presentation.ts). */
  plainFigureNotes: withPlainFigureNotes,
  /** Grade-override contract plus assessment status (gradeContract.ts, assessment.ts). */
  gradeContract: withGradeContract,
  /** The ordered saved-report readers (storedReportView.ts). */
  storedView: withStoredReportView,
  /** The current-use valuation check (valuationUseSafety.ts). */
  valuationUseSafety: withValuationUseSafety,
  /** Lender and reader conventions (readerConventions.ts). */
  readerConventions: withReaderConventions,
} as const satisfies Record<string, (report: Report) => Report>;

export type ReaderPreparationStep = keyof typeof READER_PREPARATION_STEPS;

/** Where a surface reads its lender-convention tables. */
export type LenderTablesSource =
  /** The report as it stands just before the reader-conventions step. */
  | "before-reader-conventions"
  /** The report the surface was given, before any step. */
  | "input"
  /** The surface renders no lender-convention tables. */
  | "not-read";

export interface SurfacePreparation {
  /** The steps, first to last; each sees the output of the one before it. */
  steps: readonly ReaderPreparationStep[];
  lenderTables: LenderTablesSource;
}

/** The export order: Markdown and print share it word for word. */
const EXPORT_PREPARATION: SurfacePreparation = {
  steps: ["dataOnlyGapCount", "plainFigureNotes", "gradeContract", "storedView", "valuationUseSafety", "readerConventions"],
  lenderTables: "before-reader-conventions",
};

/**
 * How each surface prepares a report. The exports are the reference; every
 * other entry states where it differs and why it is kept.
 */
export const SURFACE_PREPARATION: Readonly<Record<ReportSurface, SurfacePreparation>> = {
  markdown: EXPORT_PREPARATION,
  print: EXPORT_PREPARATION,
  /**
   * EXCEPTION web-order: the app view runs the stored readers first, then
   * reader conventions, then the data-only gap count and plain-figure notes,
   * and the current-use valuation check last. It does not re-apply the grade
   * contract (the saved-report parser already applied it once).
   * EXCEPTION web-lender-tables: the app view reads the lender-convention
   * tables from the report it was given, not from the prepared one.
   * Both kept as they are today; see the drift report.
   */
  web: {
    steps: ["storedView", "readerConventions", "dataOnlyGapCount", "plainFigureNotes", "valuationUseSafety"],
    lenderTables: "input",
  },
  /**
   * EXCEPTION audit-partial: the audit export is the raw record behind the
   * report, so it applies only the stored readers and the current-use check;
   * it adds no reader notes or conventions and renders no lender tables.
   */
  audit: {
    steps: ["storedView", "valuationUseSafety"],
    lenderTables: "not-read",
  },
};

/** What a surface renders from: the prepared report and the values every surface derives from it. */
export interface PreparedReport {
  report: Report;
  /** Lender-convention tables, read where {@link SurfacePreparation.lenderTables} says ([] when not read). */
  lenderTables: ReportAuditTable[];
  /** Saved-scope qualifications of the prepared report. */
  scopeQualifications: readonly string[];
  /** The data-completeness presentation of the prepared report. */
  completeness: ReportCompletenessPresentation;
}

/** Apply one surface's steps in order, without the derived values. */
export function prepareReportSteps(report: Report, steps: readonly ReaderPreparationStep[]): Report {
  return steps.reduce((current, step) => READER_PREPARATION_STEPS[step](current), report);
}

/**
 * Turn a stored report into the report one surface renders, plus the values
 * every surface derives from it. The input is never modified. The prepared
 * report's verification marks are indexed, as every surface needs them.
 */
export function prepareReportForSurface(input: Report, surface: ReportSurface): PreparedReport {
  const plan = SURFACE_PREPARATION[surface];
  let lenderTables: ReportAuditTable[] = plan.lenderTables === "input" ? lenderConventionTables(input) : [];
  let report = input;
  for (const step of plan.steps) {
    if (step === "readerConventions" && plan.lenderTables === "before-reader-conventions") lenderTables = lenderConventionTables(report);
    report = READER_PREPARATION_STEPS[step](report);
  }
  const scopeQualifications = legacyScopeQualifications(report);
  indexVerificationMarks(report);
  const completeness = deriveReportCompletenessPresentation(report.meta.dataCompleteness, report.appendix.missingData, report.appendix.sources);
  return { report, lenderTables, scopeQualifications, completeness };
}
