/**
 * P11 (D-219): how a reader that has moved to typed refusal codes decides on a
 * `StatementFieldConflict`.
 *
 * - A conflict that carries a `cause` is decided by that code alone: it passes
 *   only when the code is in the reader's set. The sentence is not read, so an
 *   unknown or unrelated code fails closed.
 * - A conflict without a `cause` was stored before its writer wrote codes (a
 *   frozen input, an older run snapshot) or comes from a writer that has none.
 *   It is read by its sentence, with the reader's original pattern, here.
 *
 * ===================================================================
 * LEGACY WORDING: this module is the only place where a conflict
 * without a typed cause is read by its sentence. Add nothing here
 * except when a reader is migrated from wording to codes; that step
 * moves the reader's pattern here verbatim and lowers its count in
 * tests/refusalWording.ratchet.test.ts. A code is never derived from
 * a sentence and never written onto a row that has none.
 * ===================================================================
 */
import type { StatementConflictCause } from "@/types/refusalCause";

interface CodeReader {
  /** The codes that pass this reader's check. */
  readonly codes: ReadonlySet<StatementConflictCause>;
  /** The reader's pre-D-219 wording test, unchanged, for conflicts that carry no code. */
  readonly legacy: (reason: string) => boolean;
}

const READERS = {
  /**
   * C14, `restoreRefusedOperatingPortion` (`src/pipeline/stageB/leaseScope.ts`, D-186): a lease-line
   * refusal because the filing established no total operating-lease liability.
   */
  leaseLineNoOperatingTotal: {
    codes: new Set<StatementConflictCause>(["debt-lease-line-no-operating-total"]),
    legacy: (reason) => /^incomplete debt carrying value: the vendor lease line /.test(reason) &&
      /no total operating-lease liability/.test(reason),
  },
  /**
   * C11, `completeFiledDebtScope` (`src/edgar/financialEnrichment.ts`): an incomplete-scope debt
   * refusal the same-filing completion may revisit. Collapse, plausibility, vendor/SEC conflicts and
   * refused components stay refused.
   */
  recoverableDebtScope: {
    codes: new Set<StatementConflictCause>(["debt-lease-line-refused", "debt-lease-line-no-operating-total",
      "debt-vendor-short-term-zero", "debt-aggregate-exceeds-components", "debt-combined-aggregate-exceeds-components"]),
    legacy: (reason) => /^incomplete debt carrying value: (?:the vendor (?:lease line|short-term debt)|same-period )/.test(reason),
  },
} as const satisfies Record<string, CodeReader>;

export type ConflictCodeReader = keyof typeof READERS;

/** The codes a reader decides by. Run input snapshots keep these (`captureRunInputSnapshot`). */
export const CONFLICT_CAUSES_READ_BY_CODE: ReadonlySet<StatementConflictCause> =
  new Set(Object.values(READERS).flatMap((reader) => [...reader.codes]));

/** Whether `conflict` passes `reader`'s check: by its code when it has one, else by its sentence. */
export function conflictCauseMatches(conflict: { readonly cause?: unknown; readonly reason?: string }, reader: ConflictCodeReader): boolean {
  const { codes, legacy }: CodeReader = READERS[reader];
  if (conflict.cause !== undefined) return codes.has(conflict.cause as StatementConflictCause);
  return legacy(conflict.reason ?? "");
}
