import type { FairValue } from "@/report/schema";

/** Audit 2026-10-22 F-13: the reason an available fair value's inputs were substituted. */
export const FAIR_VALUE_DEGRADED_FIELD = "valuation.fairValue.degradedInputs";

/** The degraded-inputs sentence every surface prints beside an available headline value, or null. */
export function fairValueDegradedText(fairValue: FairValue | null | undefined): string | null {
  if (!fairValue || fairValue.status !== "available") return null;
  return fairValue.reasons.find((r) => r.field === FAIR_VALUE_DEGRADED_FIELD)?.reason ?? null;
}

/**
 * The sentence every surface prints when no fair value is published. A DCF
 * outside its domain says so and names the failed test (audit 2026-10-22 B-29).
 */
export function fairValueWithheldText(fairValue: FairValue): string {
  if (fairValue.status === "outside-domain") return fairValue.basis.join(" ");
  return `Intrinsic value per share suppressed — ${fairValue.reasons.map((r) => r.reason).join("; ") || fairValue.basis.join(" ")}`;
}
