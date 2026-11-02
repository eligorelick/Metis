import type { Executive } from "@/report/schema";

/**
 * Why an executive card lacks an assessment. Reports stored before the FIGR
 * extra-high audit (B2-09, 2026-11-02) carry one generic sentence for either
 * gap, so "execution and/or guidance-versus-actual evidence is absent" printed
 * beside an admitted execution grade. Readers now see which assessment is
 * missing; the stored text is mapped at read time.
 */
export const LEGACY_EXECUTIVE_ASSESSMENT_REASON =
  "Attributable, validated execution and/or guidance-versus-actual evidence is absent. A citation, rejected claim, compensation or job title alone cannot establish the missing assessment.";

/** Execution graded, credibility withheld: the grade rests on company results, not a personal record. */
export const CREDIBILITY_NOT_ASSESSED_REASON =
  "Credibility is not assessed: no attributable, validated guidance-versus-actual record. The execution grade rests on company results cited in this officer's evidence, not on a measured personal track record.";

/** Nothing graded; printed after "Not assessed: <officers>." */
export const EXECUTIVE_NOT_ASSESSED_REASON =
  "No attributable, validated execution or guidance-versus-actual record. A citation, rejected claim, compensation or job title alone cannot establish an assessment.";

/** Credibility withheld while the model itself left execution ungraded. */
const CREDIBILITY_ONLY_REASON = "Credibility is not assessed: no attributable, validated guidance-versus-actual record.";

/** The evidence gate's reason for a withheld assessment, or undefined when both stand. */
export function executiveAssessmentReason(gate: { execution: boolean; credibility: boolean }, grade: Executive["grade"]): string | undefined {
  if (!gate.execution) return EXECUTIVE_NOT_ASSESSED_REASON;
  if (!gate.credibility) return grade === "not-assessed" ? CREDIBILITY_ONLY_REASON : CREDIBILITY_NOT_ASSESSED_REASON;
  return undefined;
}

/** The reason a reader sees: the stored one, with the legacy generic sentence made specific. */
export function executiveAssessmentNote(e: Pick<Executive, "grade" | "credibilityGrade" | "assessmentReason">): string | undefined {
  const stored = e.assessmentReason?.trim();
  if (stored !== LEGACY_EXECUTIVE_ASSESSMENT_REASON) return stored || undefined;
  // The gate set grade "not-assessed" exactly when execution was not admitted.
  return executiveAssessmentReason({ execution: e.grade !== "not-assessed", credibility: e.credibilityGrade !== "not-assessed" }, e.grade) ?? stored;
}
