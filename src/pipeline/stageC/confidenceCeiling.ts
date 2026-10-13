/**
 * Stage C — deterministic confidence ceiling per graded section (D-50).
 *
 * The judge chooses each section's confidence label (high / medium / low), and
 * verbalised LLM confidence is systematically overconfident (Xiong et al. 2024,
 * ICLR; Tian et al. 2023, EMNLP; Moore & Healy 2008 on overprecision). This
 * module ties the label to measured Stage B data coverage: the ceiling is the
 * MINIMUM of the rules below, and a label above it is lowered to it with the
 * reason recorded in `confidenceCap`. A lower model label is always kept.
 *
 * Rules (house conventions, not fitted; see docs/audit/DECISIONS.md D-50):
 *  - the aspect's deterministic score is unscored for lack of data → low
 *  - the aspect is not applicable to the route (no score exists)  → medium
 *  - aspect applicableCompleteness < 0.5                          → low
 *  - aspect applicableCompleteness < 0.75                         → medium
 *
 * Completeness is read over what the ROUTE can support (review of D-50,
 * 2026-10-13): `dataCompleteness` also counts route-suppressed signals as
 * missing, which capped every fully observed bank's fundamentals, quality and
 * leadership at medium with a reason that was false for it. A stored report
 * without `applicableCompleteness` falls back to `dataCompleteness`.
 *  - valuation only: the fair value (DCF / excess-return) is withheld, or the
 *    scenario fan is suppressed on the general DCF route           → medium
 *
 * Applied at assembly, i.e. after the judge pass and before verification, on
 * Stage B data only. The plan's verification-rate rule is NOT applied: the rate
 * is measured on the assembled report this function runs on, so it would be
 * circular. A per-aspect annual-period-count rule is also not applied: Stage B
 * does not record how many annual periods each aspect's inputs span, and a
 * count guessed here would be a number nobody measured.
 *
 * Reasons carry no numerals, so no new figure enters the report that the
 * registry cannot cite.
 */
import type { GradeBlock, Report, ScoreAspect } from "@/report/schema";
import { GRADE_SURFACES } from "@/report/surfaceManifest";

type Confidence = GradeBlock["confidence"];

/** Below this completeness the ceiling is "low" (convention, not fitted). */
export const LOW_CONFIDENCE_COMPLETENESS = 0.5;
/** Below this completeness the ceiling is "medium" (convention, not fitted). */
export const MEDIUM_CONFIDENCE_COMPLETENESS = 0.75;

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export interface ConfidenceCeiling {
  ceiling: Confidence;
  /** Why the ceiling is below "high"; null when nothing caps the section. */
  reason: string | null;
}

const ASPECT_LABEL: Record<ScoreAspect, string> = {
  fundamentals: "fundamentals",
  valuation: "valuation",
  quality: "quality",
  balanceSheet: "balance-sheet",
  moat: "moat",
  leadership: "leadership",
  technicals: "technicals",
};

/**
 * The ceiling for one aspect's section, from the assembled report's Stage B
 * blocks. Returns "high" (no cap) when the report carries no deterministic
 * scores at all — a legacy or stand-in report has nothing measured to cap with.
 */
export function confidenceCeilingFor(
  aspect: ScoreAspect,
  report: Pick<Report, "scores" | "scenarioTargets" | "fairValue">,
): ConfidenceCeiling {
  const candidates: ConfidenceCeiling[] = [];
  const label = ASPECT_LABEL[aspect];
  const score = report.scores?.aspects[aspect];
  if (score !== undefined) {
    const completeness = score.applicableCompleteness ?? score.dataCompleteness;
    if ((score.score === null || score.band === null) && score.applicableCompleteness === null) {
      // Route-inapplicable (an insurer's balance sheet, a pre-revenue
      // valuation): nothing is missing, but there is no measured anchor.
      candidates.push({
        ceiling: "medium",
        reason: `no deterministic ${label} score applies to this company's route`,
      });
    } else if (score.score === null || score.band === null) {
      candidates.push({
        ceiling: "low",
        // The score's own notApplicableReason is shown with the score; it is
        // not copied here because it may carry figures.
        reason: `the deterministic ${label} score is unscored`,
      });
    } else if (completeness < LOW_CONFIDENCE_COMPLETENESS) {
      candidates.push({
        ceiling: "low",
        reason: `the deterministic ${label} score rests on under half of the inputs its route supports`,
      });
    } else if (completeness < MEDIUM_CONFIDENCE_COMPLETENESS) {
      candidates.push({
        ceiling: "medium",
        reason: `the deterministic ${label} score rests on under three quarters of the inputs its route supports`,
      });
    }
  }
  if (aspect === "valuation") {
    if (report.fairValue?.status === "suppressed") {
      candidates.push({
        ceiling: "medium",
        reason: "the deterministic fair value (DCF / excess-return) was withheld",
      });
    } else if (
      report.fairValue?.method === "fcff-dcf" &&
      report.scenarioTargets?.status === "suppressed"
    ) {
      // Only the general DCF route models a scenario fan, so a suppressed fan
      // beside an available FCFF fair value means the evidence was too thin.
      candidates.push({
        ceiling: "medium",
        reason: "the bull / base / bear scenario price targets were suppressed for thin evidence",
      });
    }
  }
  // Minimum wins; the first reason at that level is the one shown.
  let result: ConfidenceCeiling = { ceiling: "high", reason: null };
  for (const c of candidates) {
    if (RANK[c.ceiling] < RANK[result.ceiling]) result = c;
  }
  return result;
}

/**
 * Lower `block.confidence` to the ceiling when it is above it, recording
 * {from, to, reason}. Idempotent: a block assembled twice (the judge-retry
 * path re-assembles a verified report) keeps the model's original label as
 * `from`. The cap is recomputed every time, so a stale or model-emitted
 * `confidenceCap` never survives, and the label is never raised.
 */
export function capBlockConfidence(block: GradeBlock, cap: ConfidenceCeiling): GradeBlock {
  const { confidenceCap: prior, ...rest } = block;
  const original = prior !== undefined && prior.to === block.confidence ? prior.from : block.confidence;
  if (cap.reason === null || RANK[original] <= RANK[cap.ceiling]) return rest;
  if (RANK[block.confidence] < RANK[cap.ceiling]) return rest;
  return {
    ...rest,
    confidence: cap.ceiling,
    confidenceCap: { from: original, to: cap.ceiling, reason: cap.reason },
  };
}

/**
 * Apply the ceiling to every graded section and its grade-strip twin. Pure;
 * returns a new report.
 */
export function applyConfidenceCeilings(report: Report): Report {
  const next = structuredClone(report);
  for (const { key, sectionKey } of GRADE_SURFACES) {
    const cap = confidenceCeilingFor(key, report);
    const strip = next.verdict.gradeStrip[key];
    if (strip !== undefined) next.verdict.gradeStrip[key] = capBlockConfidence(strip, cap);
    if (sectionKey === "competitive") {
      next.competitive.moatGraded = capBlockConfidence(next.competitive.moatGraded, cap);
    } else {
      const section = next[sectionKey] as { graded?: GradeBlock };
      if (section.graded !== undefined) section.graded = capBlockConfidence(section.graded, cap);
    }
  }
  return next;
}
