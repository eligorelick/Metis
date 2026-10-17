import type { GradeBlock, Report, VerificationLogEntry } from "@/report/schema";
import { GRADE_SURFACES } from "@/report/surfaceManifest";
import { citationSourceId } from "@/pipeline/stageC/citations";
import type { Grade } from "@/types/core";
import { getEntityRegistry, isEntityWithheldStatement, validateEntityText, type EntityRegistry } from "@/pipeline/stageC/entityValidation";

export const GRADE_OVERRIDE_VERSION = "GRADE_OVERRIDE_1" as const;
const ORDER: readonly Grade[] = ["A", "B", "C", "D", "F"];

/** Citation admission is narrower than semantic validation of the whole thesis. */
function admittedRationale(block: GradeBlock, sectionPath: string, log: readonly VerificationLogEntry[], registry: EntityRegistry | null): boolean {
  const rationale = block.overrideRationale;
  if (!rationale?.reason.trim() || !rationale.evidenceSources.length) return false;
  // Entity withholding is a refusal, never new support. Check raw text too so
  // direct assembly/exports cannot bypass the existing canonical registry.
  const invalidText = (text: string) => isEntityWithheldStatement(text) ||
    (registry !== null && validateEntityText(text, registry, null).issues.some(issue => issue.code !== "primary-source-required"));
  if (invalidText(rationale.reason)) return false;
  return rationale.evidenceSources.every(source => block.reasoning.some((claim, index) => {
    if (!claim.text.trim() || invalidText(claim.text) || citationSourceId(claim) !== source) return false;
    const entries = log.filter(entry => entry.path === `${sectionPath}.reasoning[${index}]` && entry.claim === claim.text && entry.source === source);
    // A separate consistency failure can contradict an otherwise admitted citation.
    if (entries.some(entry => entry.outcome === "removed" || entry.validationStatus === "contradicted" || entry.claimSupportStatus === "contradicted" || entry.check !== undefined)) return false;
    return entries.some(entry => (entry.evidenceKind === "judgment" || entry.evidenceKind === "factual-claim") &&
      (entry.traceKind === "source-cited" || entry.traceKind === "payload-match" || entry.traceKind === "computed-derived" || entry.traceKind === "excerpt-match") &&
      (entry.claimSupportStatus === "cited" || entry.claimSupportStatus === "numeric-only") &&
      (entry.validationStatus === "cited" || entry.validationStatus === "validated"));
  }));
}

/**
 * Recompute the existing one-band contract at assembly and after verification.
 * Never rewrite a model letter into an apparently compliant proposal. Rejected
 * proposals remain raw audit data, with both headline surfaces withheld.
 */
export function applyGradeOverrideContract(report: Report, log: readonly VerificationLogEntry[]): Report {
  const result = structuredClone(report);
  const registry = getEntityRegistry(report.meta.symbol);
  for (const { key, sectionKey } of GRADE_SURFACES) {
    const section = sectionKey === "competitive" ? result.competitive.moatGraded
      : result[sectionKey].graded;
    const strip = result.verdict.gradeStrip[key];
    if (!section && !strip) continue;
    const proposed = section ?? strip!;
    const originalBand = report.scores?.aspects[key]?.band ?? null;
    const distance = originalBand === null ? null : Math.abs(ORDER.indexOf(originalBand) - ORDER.indexOf(proposed.grade));
    const sectionPath = sectionKey === "competitive" ? "competitive.moatGraded" : `${sectionKey}.graded`;
    let status: NonNullable<GradeBlock["gradeContract"]>["status"] = "unchanged";
    let reason: NonNullable<GradeBlock["gradeContract"]>["reason"] = "matches-deterministic-band";
    if (originalBand === null || report.scores?.aspects[key]?.score == null) {
      status = "unavailable"; reason = "no-deterministic-band";
    } else if (section && strip && section.grade !== strip.grade) {
      status = "rejected"; reason = "inconsistent-grade-surfaces";
    } else if (distance! > 1) {
      status = "rejected"; reason = "grade-distance-exceeded";
    } else if (distance === 1) {
      if (!section?.overrideRationale?.reason.trim() || !section.overrideRationale.evidenceSources.length) {
        status = "rejected"; reason = "missing-override-rationale";
      } else if (!admittedRationale(section, sectionPath, log, registry)) {
        status = "rejected"; reason = "unadmitted-override-evidence";
      } else {
        status = "accepted"; reason = "admitted-one-step-override";
      }
    }
    for (const block of [section, strip]) {
      if (!block) continue;
      // Only undo withholding caused by this validator during a provisional
      // assembly. Reapply independent evidence floors after this function.
      if ((block.gradeContract?.status === "rejected" || block.gradeContract?.status === "unavailable") && block.assessmentStatus === "not-assessed") delete block.assessmentStatus;
      const blockDistance = originalBand === null ? null : Math.abs(ORDER.indexOf(originalBand) - ORDER.indexOf(block.grade));
      block.gradeContract = { version: GRADE_OVERRIDE_VERSION, originalBand, proposedGrade: block.grade, distance: blockDistance, status, reason };
      if (status === "rejected" || status === "unavailable") block.assessmentStatus = "not-assessed";
    }
  }
  return result;
}
