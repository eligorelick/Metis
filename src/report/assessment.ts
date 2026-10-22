import type { AspectScore, GradeBlock, Report, Scoring } from "@/report/schema";
import { GRADE_SURFACES } from "@/report/surfaceManifest";
import type { Grade } from "@/types/core";

/** Presentation threshold only: raw scores and the composite calculation stay unchanged. */
export const MIN_HEADLINE_EVIDENCE = 0.5;

/**
 * Audit 2026-10-22 F-19: the house band table puts the composite's neutral
 * prior (50) in D, so a score from 45 to 55 inclusive carries a "neutral"
 * qualifier wherever its letter is shown. The letter itself is unchanged.
 */
export const NEUTRAL_SCORE_BAND = { low: 45, high: 55 } as const;

/** The band thresholds printed beside the composite (grading.ts scoreToBand). */
export const BAND_THRESHOLDS_TEXT = "A ≥85, B ≥70, C ≥55, D ≥40, F below 40; 45–55 neutral";

/** Judged on the whole-number score every surface prints, so 55.4 (shown 55) is neutral. */
export function isNeutralScore(score: number | null | undefined): boolean {
  if (typeof score !== "number" || !Number.isFinite(score)) return false;
  const shown = Math.round(score);
  return shown >= NEUTRAL_SCORE_BAND.low && shown <= NEUTRAL_SCORE_BAND.high;
}

/** "D (neutral)" for a band letter whose score sits in the neutral range, else the letter. */
export function withNeutral(letter: string, score: number | null | undefined): string {
  return isNeutralScore(score) ? `${letter} (neutral)` : letter;
}

/** A whole-percent evidence share, never rounded up across the floor. */
export function evidencePct(share: number): number {
  return Math.floor(share * 100 + 1e-9);
}

/**
 * F-19: the composite carries the aspects' evidence floor. Below half of the
 * route-applicable signal weight no letter is shown, only the score and the
 * evidence share; an older report without the share keeps its letter.
 */
/** What `compositeDisplay` reads: the stored score and band, and the evidence share. */
type CompositeEvidence = {
  composite: Pick<Scoring["composite"], "score" | "band">;
  assessments?: { evidenceCompleteness?: number } | null;
};

export function compositeDisplay(scores: CompositeEvidence): {
  grade: Scoring["composite"]["band"]; label: string; evidence: number | null;
} {
  const { score, band } = scores.composite;
  const share = scores.assessments?.evidenceCompleteness;
  const evidence = typeof share === "number" && Number.isFinite(share) ? share : null;
  if (score === null || band === null) return { grade: null, label: "—", evidence };
  if (evidence !== null && evidence < MIN_HEADLINE_EVIDENCE) {
    return { grade: null, label: `Not graded: evidence ${evidencePct(evidence)}%`, evidence };
  }
  return { grade: band, label: withNeutral(band, score), evidence };
}

/** "B (71/100)", or "Not graded: evidence 5% (score 51/100)" under the floor. */
export function compositeText(scores: Pick<Scoring, "composite" | "assessments">): string {
  const view = compositeDisplay(scores);
  const score = scores.composite.score;
  if (score === null) return view.label;
  return view.grade === null && view.label !== "—"
    ? `${view.label} (score ${Math.round(score)}/100)`
    : `${view.label} (${Math.round(score)}/100)`;
}

/** The evidence share and the band thresholds, printed beside the composite. */
export function compositeNote(scores: Pick<Scoring, "composite" | "assessments">): string {
  const { evidence } = compositeDisplay(scores);
  const floor = `a letter needs ${Math.round(MIN_HEADLINE_EVIDENCE * 100)}%`;
  return `${evidence === null ? "" : `evidence for ${evidencePct(evidence)}% of the route-applicable signal weight (${floor}); `}bands ${BAND_THRESHOLDS_TEXT}`;
}

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
      : hasLimitedEvidence(aspect) || statuses.includes("limited-evidence")
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
export type AspectEvidence = Pick<AspectScore, "score" | "band" | "dataCompleteness"> & Partial<Pick<AspectScore, "signals">>;

/**
 * Audit PGR-4: one signal carrying part of an aspect's intended evidence is
 * not corroborated, however large its weight. A route that designs a single
 * signal (the REIT P/FFO rank) and observes it in full is not affected.
 */
export function restsOnSingleSignal(aspect: AspectEvidence): boolean {
  return aspect.signals?.length === 1 && aspect.dataCompleteness < 1;
}

/** True when an aspect has a score but evidence for less than half its signal weight, or from one partial signal. */
export function hasLimitedEvidence(aspect: AspectEvidence | null | undefined): boolean {
  return aspect != null && aspect.score !== null && aspect.band !== null &&
    (aspect.dataCompleteness < MIN_HEADLINE_EVIDENCE || restsOnSingleSignal(aspect));
}

/**
 * D-67: the one rule for an aspect under the evidence floor. No surface shows
 * a letter for it (the strip, the section header, the scorecard band and the
 * live chips all withhold it), and every surface shows the same deterministic
 * score with the marker and the evidence share. The composite applies the
 * same floor to its own route-applicable evidence (F-19, `compositeDisplay`).
 */
export function limitedEvidenceText(aspect: AspectEvidence): string {
  return `score ${Math.round(aspect.score ?? 0)}/100 on ${restsOnSingleSignal(aspect) ? "one signal, " : ""}${Math.round(aspect.dataCompleteness * 100)}% of signals`;
}

/**
 * The shown letter, qualified "neutral" (F-19) when it is the deterministic
 * band of a score in the neutral range. An analyst letter that differs from
 * the band is the analyst's, and is not qualified by the score.
 */
function shownLetter(block: GradeBlock, aspect?: AspectEvidence | null): string {
  return aspect && aspect.band === block.grade ? withNeutral(block.grade, aspect.score) : block.grade;
}

export function gradeDisplayLabel(block: GradeBlock, aspect?: AspectEvidence | null): string {
  if (gradeForDisplay(block) !== null) return shownLetter(block, aspect);
  const limited = block.assessmentStatus === "limited-evidence" || /on (\d+)% of intended signals/.test(block.oneLineWhy);
  if (!limited) return "Not assessed";
  return aspect && aspect.score !== null && aspect.band !== null
    ? `Not assessed — limited evidence (${limitedEvidenceText(aspect)})`
    : "Not assessed — limited evidence";
}

/** "Grade A", or the not-assessed label: the heading of a graded section. */
export function gradeHeading(block: GradeBlock, aspect?: AspectEvidence | null): string {
  return gradeForDisplay(block) !== null ? `Grade ${shownLetter(block, aspect)}` : gradeDisplayLabel(block, aspect);
}
