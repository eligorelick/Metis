import type { ProvenanceCoverage, VerificationLogEntry } from "./schema";

type FactualValidation = NonNullable<ProvenanceCoverage["factualValidation"]>;
type NumericClaimPartition =
  | { total: number; unmatched: number; unknownText: null }
  | { total: null; unmatched: null; unknownText: string };

/** The recorded qualitative count covers cited, non-contradicted claims only. */
export function numericClaimPartition(v: FactualValidation): NumericClaimPartition {
  if (v.total === 0) return { total: 0, unmatched: 0, unknownText: null };
  const reason = v.qualitative === undefined
    ? "the qualitative split was not recorded"
    : v.cited < v.total || v.contradicted > 0
      ? "uncited or contradicted claims do not have a complete numeric/qualitative split"
      : null;
  if (reason) return {
    total: null,
    unmatched: null,
    unknownText: `${v.validated} recorded numerical match${v.validated === 1 ? "" : "es"}; numeric-claim denominator unknown: ${reason}`,
  };
  // The complete cited partition establishes the denominator without rechecking prose.
  return { total: v.total - v.qualitative!, unmatched: v.unchecked - v.qualitative!, unknownText: null };
}

/**
 * Audit 2026-10-22 F-22: a period, unit or currency the cited record does not
 * establish is a metadata gap, so the claim or figure is unverified, never
 * contradicted. Logs written before that rule recorded these reasons as
 * contradicted; a stored report reads them under the same rule as a new one.
 */
const METADATA_GAP_REASONS: ReadonlySet<string> = new Set([
  "period-mismatch", "unit-mismatch", "currency-mismatch", "period-word-mismatch", "unit-word-mismatch",
]);

/** The validation status a reader is shown for one verification-log entry. */
export function displayedValidationStatus(entry: Pick<VerificationLogEntry, "validationStatus" | "reason">): VerificationLogEntry["validationStatus"] {
  return entry.validationStatus === "contradicted" && entry.reason !== undefined && METADATA_GAP_REASONS.has(entry.reason)
    ? "unchecked" : entry.validationStatus;
}

/** Recorded factual-claim statuses with legacy metadata gaps read as unverified (F-22). */
export function displayedFactualValidation(
  v: FactualValidation,
  log: readonly VerificationLogEntry[] | undefined,
): FactualValidation {
  const reread = Math.min(v.contradicted, (log ?? []).filter((entry) => entry.evidenceKind === "factual-claim" && entry.check === undefined &&
    entry.validationStatus === "contradicted" && displayedValidationStatus(entry) === "unchecked").length);
  return reread === 0 ? v : { ...v, contradicted: v.contradicted - reread, unchecked: v.unchecked + reread };
}
