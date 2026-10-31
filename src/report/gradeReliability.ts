import type { AspectScore } from "@/report/schema";
import { scoreToBand } from "@/pipeline/stageB/grading";
import type { Grade } from "@/types/core";

export type AttributeGradeReliability =
  | { status: "available"; score: number; applicableCompleteness: number; low: number; high: number; lowBand: Grade; highBand: Grade }
  | { status: "unavailable"; reason: "unknown-coverage" | "route-inapplicable" | "unscored" | "invalid-coverage" | "invalid-score" };

/** Remove only arithmetic noise around integer band cutoffs, not genuine subthreshold values. */
function endpointBand(value: number): Grade {
  const integer = Math.round(value);
  const stable = Math.abs(value - integer) <= 2 * Number.EPSILON * Math.max(1, Math.abs(value)) ? integer : value;
  return scoreToBand(stable);
}

/**
 * Arithmetic sensitivity to the unobserved route-applicable signal weight.
 * Explicit coverage is required: historical total coverage cannot establish
 * how much of this route's applicable denominator was observed.
 */
export function attributeGradeReliability(aspect: Pick<AspectScore, "score" | "applicableCompleteness" | "notApplicableReason">): AttributeGradeReliability {
  const { score, applicableCompleteness: coverage } = aspect;
  // notApplicableReason also describes data gaps in existing reports; only
  // explicit null applicable coverage establishes route inapplicability.
  if (coverage === null) return { status: "unavailable", reason: "route-inapplicable" };
  if (score === null) return { status: "unavailable", reason: "unscored" };
  if (!Number.isFinite(score) || score < 0 || score > 100) return { status: "unavailable", reason: "invalid-score" };
  if (coverage === undefined) return { status: "unavailable", reason: "unknown-coverage" };
  if (!Number.isFinite(coverage) || coverage < 0 || coverage > 1) return { status: "unavailable", reason: "invalid-coverage" };
  const low = score * coverage;
  const high = low + 100 * (1 - coverage);
  return { status: "available", score, applicableCompleteness: coverage, low, high, lowBand: endpointBand(low), highBand: endpointBand(high) };
}
