import type { Dcf, FairValue } from "@/report/schema";

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
  const reference = fairValueReferenceText(fairValue);
  if (reference) return reference;
  if (fairValue.status === "outside-domain") return fairValue.basis.join(" ");
  return `Intrinsic value per share suppressed — ${[...new Set([fairValue.reasons.map((r) => r.reason).join("; "), fairValue.basis.join(" ")].filter(Boolean))].join(" ")}`;
}

/** A dated model is a reference, never an upside comparison with a later price. */
export function fairValueReferenceText(fairValue: FairValue): string | null {
  const ref = fairValue.status === "dated-reference" ? fairValue.reference : undefined;
  if (!ref) return null;
  return `Dated reference value — valuation at ${ref.valuationDate}; not updated to price dated ${ref.quoteDate}. ${ref.perShare.value} ${ref.perShare.unit}. ${ref.basis.join(" ")}`;
}

/** Retained model provenance for audit widgets only; never admits a current value. */
export function recordedValuationTrace(dcf: Pick<Dcf, "perShare">, fairValue?: FairValue): Dcf["perShare"] {
  return dcf.perShare ?? recordedFairValueTrace(fairValue);
}

/** An admitted model's recorded trace, including a separately dated reference. */
export function recordedFairValueTrace(fairValue?: FairValue): FairValue["perShare"] {
  return fairValue?.perShare ?? fairValue?.reference?.perShare ?? fairValue?.auditValue ?? null;
}
