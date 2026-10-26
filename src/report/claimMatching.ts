import type { ProvenanceCoverage } from "./schema";

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
