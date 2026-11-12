/**
 * P11 (D-218): the one list of typed causes a `StatementFieldConflict` may carry.
 *
 * A refusal is judged from its cause and evidence, never its wording. Today
 * about two dozen sites still decide by reading `reason` text; each is pinned
 * in tests/refusalWording.ratchet.test.ts. This list is step 1 of the
 * migration away from that: the writers whose sentences those sites read now
 * also write one of the codes below, and the sentence stays exactly as it was.
 *
 * Rules for this list:
 * - A code names what the writer established, not how the sentence reads. A
 *   code is written by the writer that composes the sentence; it is never
 *   derived by parsing a sentence.
 * - A conflict without a code is unknown. No reader may treat a missing code
 *   as any member of this list; legacy rows written before a code existed stay
 *   unresolved for code-based readers.
 * - The first four members were already read as typed causes before D-218.
 *   The rest are dual-written beside their sentences and read by nothing yet;
 *   see `DUAL_WRITTEN_CONFLICT_CAUSES`.
 */
export const STATEMENT_CONFLICT_CAUSES = [
  // Read as typed causes before D-218.
  "revenue-scope",
  "operating-basis",
  "operating-scope",
  "borrowing-cost-scope",
  // D-218 step 1: written beside the sentence, not yet read.
  /** "vendor/SEC <field> conflict: ...", on the conflicted field and on each dependent field that carries the same sentence. */
  "vendor-sec-value-conflict",
  /** "the vendor's <label> for <date> (...) differs from / matches an earlier filing ... field unavailable until reconciled". */
  "vendor-share-value-conflict",
  /** "debt maturity scope unresolved: ..." on shortTermDebt, or "incomplete debt carrying value: debt maturity scope unresolved: ..." on totalDebt/netDebt. */
  "debt-maturity-scope",
  /** "incomplete debt carrying value: shortTermDebt is unavailable (debt maturity scope unresolved: ...)". */
  "debt-component-maturity-scope",
  /** "noncurrent carrying debt allocation unavailable: ..." on longTermDebt. */
  "debt-noncurrent-allocation",
  /** "incomplete debt carrying value: current/noncurrent financing components do not establish the total; ...". */
  "debt-components-incomplete",
  /** "incomplete debt carrying value: same-period <tag> ... exceeds the composed ...", any tag but the combined one. */
  "debt-aggregate-exceeds-components",
  /** The same sentence when the tag is DebtLongtermAndShorttermCombinedAmount. */
  "debt-combined-aggregate-exceeds-components",
  /** "incomplete debt carrying value: the vendor short-term debt is 0 but the same-period filing tags current debt ...". */
  "debt-vendor-short-term-zero",
  /** "incomplete debt carrying value: the vendor lease line ..., but ...", any cause but the one below. */
  "debt-lease-line-refused",
  /** The same sentence when the filing establishes no total operating-lease liability. */
  "debt-lease-line-no-operating-total",
  /** "vendor total ... minor difference retained as a qualification ..." on a usable, filed-family totalDebt. */
  "debt-total-minor-difference",
] as const;

export type StatementConflictCause = (typeof STATEMENT_CONFLICT_CAUSES)[number];

/**
 * The D-218 step-1 codes. Nothing reads them yet, and they are kept out of run
 * input snapshots (`captureRunInputSnapshot`) so a stored snapshot's bytes stay
 * as they were. A later step that migrates a reader to one of these codes must
 * stop stripping it there, with its own snapshot version note.
 */
export const DUAL_WRITTEN_CONFLICT_CAUSES: ReadonlySet<StatementConflictCause> = new Set<StatementConflictCause>(
  STATEMENT_CONFLICT_CAUSES.slice(STATEMENT_CONFLICT_CAUSES.indexOf("vendor-sec-value-conflict")),
);
