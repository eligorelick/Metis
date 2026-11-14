/**
 * P11 (D-219): how a reader that has moved to typed refusal codes decides on a
 * `StatementFieldConflict`, and (D-242) on a missing-data entry (`ManifestEntry`).
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
 * or missing-data entry without a typed cause is read by its sentence. Add nothing here
 * except when a reader is migrated from wording to codes; that step
 * moves the reader's pattern here verbatim and lowers its count in
 * tests/refusalWording.ratchet.test.ts. A code is never derived from
 * a sentence and never written onto a row that has none.
 * ===================================================================
 */
import type { GapCause, StatementConflictCause } from "@/types/refusalCause";

interface CodeReader {
  /** The codes that pass this reader's check. */
  readonly codes: ReadonlySet<StatementConflictCause>;
  /** The reader's pre-D-219 wording test, unchanged, for conflicts that carry no code. */
  readonly legacy: (reason: string) => boolean;
}

/** D-261: one shared legacy value-comparison reader; typed records never read wording. */
function legacyValueComparison(reason: string, kind: "cash" | "lease" | "temporary"): boolean {
  const prefixes = { cash: ["vendor/SEC cashAndCashEquivalents conflict:"],
    lease: ["vendor/SEC conflict for operatingLeaseLiability at ", "vendor/SEC conflict for financeLeaseLiability at "],
    temporary: ["temporary-equity vendor/SEC conflict for "] };
  return prefixes[kind].some(prefix => reason.startsWith(prefix));
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
  /**
   * D-222, on stockBasedCompensation only: C1 `priorSbcZero` and C2 `replaySbc` in the vendor/SEC
   * comparison (`admitCashFields`, `src/edgar/financialEnrichment.ts`): the comparison's own refusal
   * of this field, which a compatible filed quarter may replace. The same code on another field
   * names that field in its sentence and is not read here.
   */
  vendorSecStockCompensation: {
    codes: new Set<StatementConflictCause>(["vendor-sec-value-conflict"]),
    legacy: (reason) => reason.startsWith("vendor/SEC stockBasedCompensation conflict:"),
  },
  /**
   * D-222, on a balance row's cashAndCashEquivalents only: C3 `replayCash` in the vendor/SEC
   * comparison: the comparison's own refusal of the cash field, which the same-filing cash-scope
   * reconciliation may replace. Its dependents (cashAndShortTermInvestments, netDebt) carry the same
   * code and sentence but are not read here.
   */
  vendorSecCash: {
    codes: new Set<StatementConflictCause>(["vendor-sec-value-conflict"]),
    legacy: (reason) => legacyValueComparison(reason, "cash"),
  },
  /** D-261 review: the lease comparison, on the operating/finance lease field only. */
  vendorSecLease: {
    codes: new Set<StatementConflictCause>(["vendor-sec-value-conflict"]),
    legacy: (reason) => legacyValueComparison(reason, "lease"),
  },
  /** D-261 review: complete matched temporary-equity categories may replace this old comparison. */
  vendorSecTemporaryEquity: {
    codes: new Set<StatementConflictCause>(["vendor-sec-value-conflict"]),
    legacy: (reason) => legacyValueComparison(reason, "temporary"),
  },
  /**
   * D-222, on eps/epsDiluted only: C13 `canRecheck` in `guardVendorShareFields`
   * (`src/pipeline/keyless.ts`): the no-split disagreement with the filer's exact-interval EPS,
   * which the filed-reconciliation pass rechecks for a loss quarter.
   */
  vendorShareRecheck: {
    codes: new Set<StatementConflictCause>(["vendor-share-value-conflict"]),
    legacy: (reason) => reason.startsWith("the vendor's ") && reason.includes("; field unavailable until reconciled"),
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

// ---------------------------------------------------------------------------
// Missing-data entries (`ManifestEntry.cause`, `GAP_CAUSES`), D-242
// ---------------------------------------------------------------------------

interface GapReader {
  /** The codes that pass this reader's check. */
  readonly codes: ReadonlySet<GapCause>;
  /** The consumer's pre-D-242 wording test, moved here verbatim, for entries that carry no code. */
  readonly legacy: (reason: string) => boolean;
}

/**
 * P10, P11 (D-242): the gap readers (inventory G1-G5) and provider-status checks (P1-P5, P7a) that
 * decide by a missing-data entry's typed cause. Same rule as the conflict readers above: an entry
 * that carries a `cause` is decided by that code alone (an unknown or unrelated code fails); an entry
 * without one (written before D-229, restored from a run-input snapshot, or by a writer that has no
 * code) is read by its sentence with the consumer's original test, here. Each consumer keeps its
 * other conditions (field, severity, path) at its own site. The sentences are spelled out rather
 * than imported so the legacy test stays what it was even if a writer's wording later changes.
 */
const GAP_READERS = {
  /** G1 (`compute.ts` FIN-OTHER retained-suppression rewrite) and G2 (`compute.ts` observed-trigger suffix). */
  dcfUnprofitableOverlay: {
    codes: new Set<GapCause>(["dcf-unprofitable-overlay"]),
    legacy: (reason) => reason.startsWith("DCF suppressed for unprofitable overlay"),
  },
  /**
   * G3, `dcfWithheldWarnGap` (`stageB/fairValue.ts`): the warn gap that withheld the DCF for a refused
   * temporary-equity operand (`TEMPORARY_EQUITY_REFUSAL_LEAD`) or lease-emptied invested capital
   * (`LEASE_EMPTIED_CAPITAL_LEAD`, both `stageB/seniorClaims.ts`).
   */
  investedCapitalClaimWithheld: {
    codes: new Set<GapCause>(["invested-capital-temporary-equity-refused", "invested-capital-lease-emptied"]),
    legacy: (reason) => reason.startsWith("Temporary equity refused for invested capital: ") ||
      reason.startsWith("Invested capital emptied by the operating-lease removal: "),
  },
  /** G4, `dcfWithheldReason` (`stageB/fairValue.ts`): the critical invested-capital gap whose upstream quote is net debt. */
  investedCapitalBalanceFieldsMissing: {
    codes: new Set<GapCause>(["invested-capital-balance-fields-missing"]),
    legacy: (reason) => reason.startsWith("balance-sheet fields missing"),
  },
  /**
   * G5, `temporaryEquityUnknownAt` (`stageB/seniorClaims.ts`): a temporary-equity enrichment refusal that
   * leaves a bridge date's claim unknown. The SEC-silent sentence (no current writer; R2's legacy row)
   * says the period holds none and does not pass.
   */
  temporaryEquityEnrichmentRefused: {
    codes: new Set<GapCause>(["temporary-equity-enrichment-withheld", "temporary-equity-operands-unmatched"]),
    legacy: (reason) => reason.startsWith("temporary-equity SEC enrichment withheld: ") &&
      !reason.endsWith("temporary carrying amounts are absent or explicitly refused for this SEC period"),
  },
  /** P1, `isFmpQuotaGap` (`providers/fmp.ts`; the retry loop, `rateLimitedValuationEntry`, the analyst-estimate refusal): an FMP rate limit. */
  fmpQuota: {
    codes: new Set<GapCause>(["fmp-quota"]),
    legacy: (reason) => reason.startsWith("FMP quota/rate limit"),
  },
  /**
   * P2 (`fmp.ts` no-new-bar check) and P5 (`jobRunner.ts`, `app/company/[symbol]/page.tsx` confirmed
   * miss): exactly `FMP_EMPTY_ARRAY_REASON`. An empty array to which the public fallback appended its
   * own failure carries `fmp-empty-array-fallback-failed` and does not pass, as `===` did not.
   */
  fmpEmptyArrayAlone: {
    codes: new Set<GapCause>(["fmp-empty-array"]),
    legacy: (reason) => reason === "FMP returned an empty array (no data for this query)",
  },
  /** P3, `markSegmentationGapExpected` (`pipeline/dataBundle.ts`): a sentence that states FMP's empty array, alone or extended. */
  fmpEmptyArrayStated: {
    codes: new Set<GapCause>(["fmp-empty-array", "fmp-empty-array-fallback-failed"]),
    legacy: (reason) => reason.includes("FMP returned an empty array (no data for this query)"),
  },
  /** P5 (`jobRunner.ts`, company page): the FMP client had no key and no fixture. */
  fmpNoApiKey: {
    codes: new Set<GapCause>(["fmp-no-api-key"]),
    legacy: (reason) => /no API key/.test(reason),
  },
  /** P5 (`jobRunner.ts`, company page): SEC's ticker table does not list the symbol. */
  secTickerNotListed: {
    codes: new Set<GapCause>(["sec-ticker-not-listed"]),
    legacy: (reason) => /not in SEC company_tickers\.json/.test(reason),
  },
  /** P4, `withResolvedPredecessor` (`pipeline/dataBundle.ts`): a successor whose predecessor EDGAR does not link. */
  secUnlinkedPredecessor: {
    codes: new Set<GapCause>(["sec-unlinked-predecessor"]),
    legacy: (reason) => reason.includes(" — its predecessor's annual reports live under another CIK that EDGAR does not link"),
  },
  /** P7a, `symbolRefused` (`pipeline/peers.ts`): FMP refused this one symbol on this endpoint. */
  fmpSymbolRestricted: {
    codes: new Set<GapCause>(["fmp-symbol-restricted"]),
    legacy: (reason) => /this symbol is unavailable on this endpoint/i.test(reason),
  },
} as const satisfies Record<string, GapReader>;

export type GapCodeReader = keyof typeof GAP_READERS;

/** The missing-data codes a reader decides by. */
export const GAP_CAUSES_READ_BY_CODE: ReadonlySet<GapCause> =
  new Set(Object.values(GAP_READERS).flatMap((reader) => [...reader.codes]));

/** Whether a missing-data entry passes `reader`'s check: by its code when it has one, else by its sentence. */
export function gapCauseMatches(entry: { readonly cause?: unknown; readonly reason?: string }, reader: GapCodeReader): boolean {
  const { codes, legacy }: GapReader = GAP_READERS[reader];
  if (entry.cause !== undefined) return codes.has(entry.cause as GapCause);
  return legacy(entry.reason ?? "");
}
