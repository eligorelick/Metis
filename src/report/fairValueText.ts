import type { FairValue } from "@/report/schema";

/**
 * The sentence every surface prints when no fair value is published. A DCF
 * outside its domain says so and names the failed test (audit 2026-10-22 B-29).
 */
export function fairValueWithheldText(fairValue: FairValue): string {
  if (fairValue.status === "outside-domain") return fairValue.basis.join(" ");
  return `Intrinsic value per share suppressed — ${fairValue.reasons.map((r) => r.reason).join("; ") || fairValue.basis.join(" ")}`;
}
