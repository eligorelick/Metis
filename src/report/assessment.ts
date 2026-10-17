import type { AspectScore, GradeBlock, Report } from "@/report/schema";
import { GRADE_SURFACES } from "@/report/surfaceManifest";
import type { Grade } from "@/types/core";

/** Presentation threshold only: raw scores and the composite calculation stay unchanged. */
export const MIN_HEADLINE_EVIDENCE = 0.5;

/**
 * Apply the same evidence floor to every headline, including completed AI
 * reports. Letters, narratives and scores remain intact for audit. Stored
 * reports use this immutable view; no historical bytes need to be rewritten.
 */
export function applyReportAssessmentStatus(report: Report): Report {
  // Truly older reports have no deterministic evidence map to evaluate.
  if (report.scores === undefined) return report;
  const normalized = structuredClone(report);
  for (const { key, sectionKey } of GRADE_SURFACES) {
    const aspect = report.scores.aspects[key];
    const strip = normalized.verdict.gradeStrip[key];
    const section = sectionKey === "competitive" ? normalized.competitive.moatGraded : normalized[sectionKey].graded;
    const statuses = [strip?.assessmentStatus, section?.assessmentStatus];
    const unavailable = aspect == null || aspect.score === null || aspect.band === null;
    // Existing withheld assessments can become more restrictive, never less.
    const status = unavailable || statuses.includes("not-assessed")
      ? "not-assessed"
      : aspect.dataCompleteness < MIN_HEADLINE_EVIDENCE || statuses.includes("limited-evidence")
        ? "limited-evidence"
        : undefined;
    if (status === undefined) continue;
    if (strip !== undefined) strip.assessmentStatus = status;
    if (section !== undefined) section.assessmentStatus = status;
  }
  return normalized;
}

export function gradeForDisplay(block: GradeBlock): Grade | null {
  if (block.gradeContract?.status === "rejected" || block.gradeContract?.status === "unavailable") return null;
  if (block.assessmentStatus === "not-assessed" || block.assessmentStatus === "limited-evidence") return null;
  // Previously saved data-only reports used required placeholder letters. Do not
  // promote those canonical disclosures back into an apparent assessment.
  if (/^(?:Not scored|Not graded|Not assessed|LLM analysis did not run)/i.test(block.oneLineWhy)) return null;
  const legacyCoverage = /on (\d+)% of intended signals; no analyst pass ran/.exec(block.oneLineWhy);
  if (legacyCoverage && Number(legacyCoverage[1]) < MIN_HEADLINE_EVIDENCE * 100) return null;
  return block.grade;
}

/** Display the validation limit beside the raw reasoning, across all exports. */
export function gradeContractText(block: GradeBlock): string | null {
  if (!block.gradeContract) return null;
  const audit = block.gradeContract;
  // Only the section's rationale is adjudicated. A strip may retain its own
  // raw proposal for audit, so do not label that prose as admitted here.
  return `Grade contract: ${audit.status} (${audit.reason}).`;
}

/** The deterministic score fields a limited-evidence label reads. */
export type AspectEvidence = Pick<AspectScore, "score" | "band" | "dataCompleteness">;

/** True when an aspect has a score but evidence for less than half its signal weight. */
export function hasLimitedEvidence(aspect: AspectEvidence | null | undefined): boolean {
  return aspect != null && aspect.score !== null && aspect.band !== null && aspect.dataCompleteness < MIN_HEADLINE_EVIDENCE;
}

/**
 * D-67: the one rule for an aspect under the evidence floor. No surface shows
 * a letter for it (the strip, the section header, the scorecard band and the
 * live chips all withhold it), and every surface shows the same deterministic
 * score with the marker and the evidence share. The composite is unchanged:
 * it already weights each aspect by its evidence share.
 */
export function limitedEvidenceText(aspect: AspectEvidence): string {
  return `score ${Math.round(aspect.score ?? 0)}/100 on ${Math.round(aspect.dataCompleteness * 100)}% of signals`;
}

export function gradeDisplayLabel(block: GradeBlock, aspect?: AspectEvidence | null): string {
  if (gradeForDisplay(block) !== null) return block.grade;
  const limited = block.assessmentStatus === "limited-evidence" || /on (\d+)% of intended signals/.test(block.oneLineWhy);
  if (!limited) return "Not assessed";
  return aspect && aspect.score !== null && aspect.band !== null
    ? `Not assessed — limited evidence (${limitedEvidenceText(aspect)})`
    : "Not assessed — limited evidence";
}

/** "Grade A", or the not-assessed label: the heading of a graded section. */
export function gradeHeading(block: GradeBlock, aspect?: AspectEvidence | null): string {
  return gradeForDisplay(block) !== null ? `Grade ${block.grade}` : gradeDisplayLabel(block, aspect);
}
