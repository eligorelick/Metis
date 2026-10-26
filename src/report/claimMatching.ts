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

/**
 * Audit 2026-10-22 F-21: the claims the report never prints. The grade strip
 * shows each section's grade and one-line why; its reasoning claims (often a
 * copy of the section's own) are verified and logged but appear on no surface,
 * so the counts a reader can match against marked bullets leave them out.
 */
function unprintedClaimEntries(log: readonly VerificationLogEntry[] | undefined, kind: "factual-claim" | "judgment"): VerificationLogEntry[] {
  return (log ?? []).filter((entry) => entry.evidenceKind === kind && entry.check === undefined &&
    entry.validationStatus !== undefined && entry.path?.startsWith("verdict.gradeStrip.") === true);
}

/** How many unprinted factual claims {@link displayedFactualValidation} leaves out of `v`. */
export function unprintedFactualClaimCount(v: FactualValidation, log: readonly VerificationLogEntry[] | undefined): number {
  return displayedFactualValidation(v, log, false).total - displayedFactualValidation(v, log).total;
}

const cited = (entry: VerificationLogEntry) => entry.claimSupportStatus === undefined
  ? entry.traceKind !== "untraced" : entry.claimSupportStatus !== "unreviewed";

/**
 * Recorded factual-claim statuses with legacy metadata gaps read as unverified
 * (F-22), counting only the claims the report prints (F-21).
 */
export function displayedFactualValidation(
  v: FactualValidation,
  log: readonly VerificationLogEntry[] | undefined,
  printedOnly = true,
): FactualValidation {
  const reread = Math.min(v.contradicted, (log ?? []).filter((entry) => entry.evidenceKind === "factual-claim" && entry.check === undefined &&
    entry.validationStatus === "contradicted" && displayedValidationStatus(entry) === "unchecked").length);
  const shown = reread === 0 ? v : { ...v, contradicted: v.contradicted - reread, unchecked: v.unchecked + reread };
  const unprinted = printedOnly ? unprintedClaimEntries(log, "factual-claim") : [];
  if (unprinted.length === 0) return shown;
  const status = unprinted.map(displayedValidationStatus);
  const count = (s: VerificationLogEntry["validationStatus"]) => status.filter((x) => x === s).length;
  const next: FactualValidation = {
    cited: shown.cited - unprinted.filter(cited).length,
    validated: shown.validated - count("validated"),
    unchecked: shown.unchecked - (unprinted.length - count("validated") - count("contradicted")),
    contradicted: shown.contradicted - count("contradicted"),
    ...(shown.qualitative === undefined ? {} : { qualitative: shown.qualitative - count("cited") }),
    total: shown.total - unprinted.length,
    rate: null,
  };
  next.rate = next.total === 0 ? null : next.validated / next.total;
  // A log that does not cover these counts (an older snapshot) leaves them as recorded.
  return Object.values(next).some((n) => typeof n === "number" && n < 0) ? shown : next;
}

/** Coverage with the factual and judgment claim counts limited to printed claims (F-21). */
export function displayedClaimCoverage(coverage: ProvenanceCoverage, log: readonly VerificationLogEntry[] | undefined): ProvenanceCoverage {
  const less = (rate: ProvenanceCoverage["factualClaims"], entries: VerificationLogEntry[]) => {
    const supported = rate.supported - entries.filter(cited).length;
    const total = rate.total - entries.length;
    return supported < 0 || total < 0 ? rate : { supported, total, rate: total === 0 ? null : supported / total };
  };
  const factual = unprintedClaimEntries(log, "factual-claim");
  const judgments = unprintedClaimEntries(log, "judgment");
  if (factual.length === 0 && judgments.length === 0) return coverage;
  const j = less({ supported: coverage.judgments.cited, total: coverage.judgments.total, rate: coverage.judgments.rate }, judgments);
  return {
    ...coverage,
    factualClaims: less(coverage.factualClaims, factual),
    judgments: { cited: j.supported, total: j.total, rate: j.rate },
  };
}
