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
  /**
   * D-220, on shortTermDebt only: the fiscal maturity bucket refused as current carrying debt. Read by
   * C4, `splitRefusal` in `admitDebtFields` (the split's own refusal, which leaves an inclusive total
   * standing), and C12, `recoverNoteCarryingDebt` (behind its `fiscalStandIn` gate), both in
   * `src/edgar/financialEnrichment.ts`. The same code on totalDebt/netDebt has another sentence and
   * is read by `noteRecoverableDebtTotal`.
   */
  shortTermDebtMaturityScope: {
    codes: new Set<StatementConflictCause>(["debt-maturity-scope"]),
    legacy: (reason) => reason.startsWith("debt maturity scope unresolved:"),
  },
  /**
   * D-220, on longTermDebt only: C4, `splitRefusal` in `admitDebtFields`: the noncurrent allocation
   * that depended on the refused maturity bucket.
   */
  longTermDebtNoncurrentAllocation: {
    codes: new Set<StatementConflictCause>(["debt-noncurrent-allocation"]),
    legacy: (reason) => reason.startsWith("noncurrent carrying debt allocation unavailable:"),
  },
  /**
   * D-220, on totalDebt/netDebt only: C12, `recoverNoteCarryingDebt`: a total refused for a missing
   * taxonomy class (the maturity scope, directly or through the short-term component, or components
   * that do not establish the total), which a same-filing debt note may reconcile.
   */
  noteRecoverableDebtTotal: {
    codes: new Set<StatementConflictCause>(["debt-component-maturity-scope", "debt-maturity-scope", "debt-components-incomplete"]),
    legacy: (reason) => /^incomplete debt carrying value: (?:shortTermDebt is unavailable \(debt maturity scope unresolved:|debt maturity scope unresolved:|current\/noncurrent financing components do not establish the total;)/.test(reason),
  },
  /**
   * D-221, on totalDebt only: C7, the gross-debt reconciliation in `admitDebtFields`: a total refused
   * because the same-period DebtLongtermAndShorttermCombinedAmount exceeded the composed components,
   * which a same-filing bridge from gross to carrying debt shows was not an omitted borrowing.
   */
  combinedAggregateExceedsComponents: {
    codes: new Set<StatementConflictCause>(["debt-combined-aggregate-exceeds-components"]),
    legacy: (reason) => reason.startsWith("incomplete debt carrying value: same-period DebtLongtermAndShorttermCombinedAmount "),
  },
  /**
   * D-221, on totalDebt only: C9, the minor-difference note in `admitDebtFields`: a usable,
   * filed-family total that retains the vendor total's minor difference as a qualification.
   * Not a refusal; the caller keeps its `usable` and `resolution` checks.
   */
  debtTotalMinorDifference: {
    codes: new Set<StatementConflictCause>(["debt-total-minor-difference"]),
    legacy: (reason) => reason.startsWith("vendor total ") && reason.includes("minor difference retained"),
  },
  /**
   * D-221, on totalDebt only: C5, `revisitVendorSum` in `admitDebtFields`: the pre-18ea3137
   * vendor-sum refusal. No current writer produces this sentence, with or without a code, so the
   * code set is empty: a conflict that carries any code is never revisited, and only an older row
   * without one is read by its sentence, as before.
   */
  legacyVendorSumRefusal: {
    codes: new Set<StatementConflictCause>(),
    legacy: (reason) => /^incomplete debt carrying value: the vendor lease line .*?, but the vendor total debt .* is not its short-term debt \+ long-term debt \+ lease line, so its composition is unknown;/.test(reason),
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
