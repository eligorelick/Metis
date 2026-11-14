import { ScoreAspectSchema, type AspectScore, type GradeBlock, type GradeQualification, type Report, type Scoring, type ScoreAspect, type ValuationUse } from "@/report/schema";
import type { ManifestEntry } from "@/types/core";
import type { WaccOperatingEvidence } from "@/pipeline/stageB/returns";
import { formatScore } from "@/report/scoreText";
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

/** Display precision only. A rounded percentage must never imply an unmet evidence floor. */
export function evidencePercentText(share: number): string {
  const shown = (share * 100).toFixed(1);
  return share < MIN_HEADLINE_EVIDENCE && Number(shown) >= MIN_HEADLINE_EVIDENCE * 100
    ? `<${(MIN_HEADLINE_EVIDENCE * 100).toFixed(1)}%`
    : share < 1 && Number(shown) === 100 ? "<100.0%" : `${shown}%`;
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
  qualification?: Scoring["qualification"];
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

/** Reader formatting is separate so generation/prompt consumers retain their exact contract. */
export function compositeDisplayForReader(scores: CompositeEvidence): ReturnType<typeof compositeDisplay> {
  const view = compositeDisplay(scores);
  const shown = view.evidence !== null && view.evidence < MIN_HEADLINE_EVIDENCE && view.label !== "—"
    ? { ...view, label: `Not graded: evidence ${evidencePercentText(view.evidence)}` }
    : view;
  return shown.grade === null ? shown : { ...shown, label: qualifiedGradeLabel(shown.label, scores.qualification?.composite) };
}

/** "B (71/100)", or "Not graded: evidence 5% (score 51/100)" under the floor. */
export function compositeText(scores: Pick<Scoring, "composite" | "assessments" | "qualification">): string {
  const view = compositeDisplayForReader(scores);
  const score = scores.composite.score;
  if (score === null) return view.label;
  return view.grade === null && view.label !== "—"
    ? `${view.label} (score ${formatScore(score)}/100)`
    : `${view.label} (${formatScore(score)}/100)`;
}

/** The evidence share and the band thresholds, printed beside the composite. */
export function compositeNote(scores: Pick<Scoring, "composite" | "assessments" | "qualification"> & Partial<Pick<Scoring, "aspects">>): string {
  const { evidence } = compositeDisplay(scores);
  const floor = `a letter needs ${Math.round(MIN_HEADLINE_EVIDENCE * 100)}%`;
  const note = `${evidence === null ? "" : `evidence for ${evidencePercentText(evidence)} of the route-applicable signal weight (${floor}); `}bands ${BAND_THRESHOLDS_TEXT}`;
  const unscored = unscoredAspectsText(scores);
  const qualification = qualificationText(scores.qualification?.composite);
  return [note, unscored, qualification].filter(Boolean).map((text, index, parts) => index < parts.length - 1 ? text!.replace(/\.+$/, "") : text).join(". ");
}

const COMPOSITE_ASPECT_LABEL: Readonly<Record<keyof Scoring["aspects"], string>> = {
  fundamentals: "Fundamentals", valuation: "Valuation", quality: "Quality", balanceSheet: "Balance sheet",
  moat: "Moat", leadership: "Leadership", technicals: "Technicals",
};

/**
 * The composite shrinks an unscored aspect to the neutral midpoint, so removing
 * poor evidence can raise the number. The score is not rewritten; the reader is
 * told which weight is a placeholder, on saved reports as well as new ones.
 */
function unscoredAspectsText(scores: Pick<Scoring, "composite"> & Partial<Pick<Scoring, "aspects">>): string | null {
  const { aspects } = scores;
  if (!aspects) return null;
  const missing = (Object.keys(COMPOSITE_ASPECT_LABEL) as (keyof Scoring["aspects"])[])
    .filter((key) => aspects[key]?.score === null && scores.composite.weights[key] > 0)
    .map((key) => ({ label: COMPOSITE_ASPECT_LABEL[key], weight: scores.composite.weights[key] }));
  if (missing.length === 0) return null;
  const limit = "Not directly comparable with a company scored on it, and a missing aspect can raise or lower this number.";
  if (missing.length === 1) return `${missing[0]!.label} (${missing[0]!.weight}% of the score) has no score, so its weight counts as neutral. ${limit}`;
  const named = missing.map(({ label, weight }) => `${label} (${weight}%)`);
  return `${named.slice(0, -1).join(", ")} and ${named.at(-1)} of the score have no score, so their weight counts as neutral. Not directly comparable with a company scored on them, and a missing aspect can raise or lower this number.`;
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
    const qualification = report.scores.qualification?.aspects[key] ?? legacyQualification(key);
    if (strip !== undefined) strip.qualification = structuredClone(qualification);
    if (section !== undefined) section.qualification = structuredClone(qualification);
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

/**
 * The contract line a reader export prints: only when the contract changed
 * the outcome (a refused or an admitted override). FIGR extra-high audit B2-18:
 * "unchanged (matches-deterministic-band)" and "unavailable
 * (no-deterministic-band)" repeated on every section and told a reader
 * nothing; the audit export lists every contract.
 */
export function readerGradeContractText(block: GradeBlock): string | null {
  const status = block.gradeContract?.status;
  return status === "rejected" || status === "accepted" ? gradeContractText(block) : null;
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
  return `score ${formatScore(aspect.score ?? 0)}/100 on ${restsOnSingleSignal(aspect) ? "one signal, " : ""}${evidencePercentText(aspect.dataCompleteness)} of signals`;
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
  if (gradeForDisplay(block) !== null) return qualifiedGradeLabel(shownLetter(block, aspect), block.qualification);
  const limited = block.assessmentStatus === "limited-evidence" || /on (\d+)% of intended signals/.test(block.oneLineWhy);
  if (!limited) return "Not assessed";
  return aspect && aspect.score !== null && aspect.band !== null
    ? `Not assessed — limited evidence (${limitedEvidenceText(aspect)})`
    : "Not assessed — limited evidence";
}

/** "Grade A", or the not-assessed label: the heading of a graded section. */
export function gradeHeading(block: GradeBlock, aspect?: AspectEvidence | null): string {
  return gradeForDisplay(block) !== null ? `Grade ${gradeDisplayLabel(block, aspect)}` : gradeDisplayLabel(block, aspect);
}

export type FinancialEvidenceQualification = {
  code: "financial-evidence-blocked" | "selected-operating-scope-unverified";
  field: string; detail: string; affectedAspects: ScoreAspect[];
};

export function financialEvidenceQualifications(gaps: readonly ManifestEntry[], operatingEvidence: WaccOperatingEvidence | null): FinancialEvidenceQualification[] {
  const affected: Record<string, ScoreAspect[]> = {
    statements: ["fundamentals", "valuation", "quality", "balanceSheet"], returns: ["valuation", "quality"],
    capital: ["valuation", "balanceSheet", "leadership"], valuation: ["valuation"],
  };
  const result: FinancialEvidenceQualification[] = [];
  for (const gap of gaps) {
    const aspects = affected[gap.field.split(".")[0]!];
    if (gap.severity === "critical" && gap.expected !== true && aspects) result.push({
      code: "financial-evidence-blocked", field: gap.field, detail: gap.reason, affectedAspects: aspects,
    });
  }
  if (operatingEvidence?.status === "unverified-derivation" && operatingEvidence.usedInDiscountRate) result.push({
    code: "selected-operating-scope-unverified", field: operatingEvidence.field, affectedAspects: ["valuation", "quality"],
    detail: `The selected operating-income derivation (${operatingEvidence.asOf ?? "date unavailable"}) has unverified consolidated operating scope and was used in the discount rate.`,
  });
  return result;
}

function legacyQualification(aspect: ScoreAspect | null): GradeQualification {
  return { status: "unknown", reasons: [{ code: "legacy-qualification-unknown", aspect, field: null,
    detail: "This stored assessment has no recorded evidence qualification; its grade is retained for audit." }] };
}

/** Annotation only. No score, band, weight, signal or arithmetic is recalculated. */
export function withAssessmentQualification(scores: Scoring, context: {
  valuationUse: ValuationUse; financialEvidence: readonly FinancialEvidenceQualification[];
}): Scoring {
  const result = structuredClone(scores);
  const aspects = {} as Record<ScoreAspect, GradeQualification>;
  for (const key of ScoreAspectSchema.options) {
    const aspect = scores.aspects[key], coverage = aspect.applicableCompleteness;
    if (scores.composite.weights[key] <= 0 || coverage === null) { aspects[key] = { status: "not-applicable", reasons: [] }; continue; }
    const reasons: GradeQualification["reasons"] = [];
    if (aspect.score === null || aspect.band === null || coverage === 0) reasons.push({
      code: "missing-applicable-aspect", aspect: key, field: `scores.aspects.${key}`, detail: `${COMPOSITE_ASPECT_LABEL[key]} has no route-applicable score evidence.`,
    });
    else if (hasLimitedEvidence(aspect)) reasons.push({ code: "limited-applicable-evidence", aspect: key,
      field: `scores.aspects.${key}`, detail: `${COMPOSITE_ASPECT_LABEL[key]} has limited evidence (${limitedEvidenceText(aspect)}).` });
    if (key === "valuation" && context.valuationUse.status !== "current" && context.valuationUse.status !== "not-applicable") reasons.push({
      code: "current-valuation-unavailable", aspect: key, field: "valuation.currentUse", detail: "Current valuation evidence is unavailable or its alignment with the quote date is unestablished.",
    });
    for (const evidence of context.financialEvidence) if (evidence.affectedAspects.includes(key)) reasons.push({
      code: evidence.code, aspect: key, field: evidence.field, detail: evidence.detail,
    });
    aspects[key] = reasons.length ? { status: "provisional", reasons } : coverage === undefined
      ? legacyQualification(key) : { status: "supported", reasons: [] };
  }
  const reasons = ScoreAspectSchema.options.flatMap(key => aspects[key].reasons);
  result.qualification = { aspects, composite: { status: Object.values(aspects).some(a => a.status === "provisional") ? "provisional"
    : Object.values(aspects).some(a => a.status === "unknown") ? "unknown" : "supported", reasons } };
  return result;
}

export function qualifiedGradeLabel(letter: string, qualification: GradeQualification | undefined): string {
  return qualification?.status === "provisional" ? `${letter} — Provisional`
    : qualification?.status === "unknown" ? `${letter} — Qualification unknown` : letter;
}

export function qualificationText(qualification: GradeQualification | undefined): string | null {
  if (!qualification || qualification.status === "supported" || qualification.status === "not-applicable") return null;
  return `${qualification.status === "provisional" ? "Provisional" : "Qualification unknown"}: ${[...new Set(qualification.reasons.map(r => r.detail))].join(" ")}`;
}
