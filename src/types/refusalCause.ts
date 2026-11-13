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
 * - A reader that has moved to codes (D-219) decides a conflict that carries a
 *   code by the code alone; an unknown or unrelated code fails its check. A
 *   conflict without a code (a frozen input, an older snapshot, or a writer
 *   that writes none) is still read by its sentence, with the reader's original
 *   pattern, and only through `@/edgar/refusalCauseRead`, the one place that
 *   holds those legacy patterns. A missing code is never treated as any member
 *   of this list, never derived by parsing a sentence, and never written onto
 *   a legacy row.
 * - The first four members were already read as typed causes before D-218.
 *   The rest are dual-written beside their sentences (`DUAL_WRITTEN_CONFLICT_CAUSES`).
 *   Since D-219 the lease-portion recovery and the same-filing debt completion
 *   read five of them (`CONFLICT_CAUSES_READ_BY_CODE`); since D-220 the
 *   debt-maturity split check and the debt-note recovery read four more; since
 *   D-221 the minor-difference note reads one more (the combined-total recovery
 *   reads a code already read); since D-222 the stock-compensation and cash
 *   rechecks read `vendor-sec-value-conflict` and the vendor share-count recheck
 *   reads `vendor-share-value-conflict`. Every one of them is now read.
 */
export const STATEMENT_CONFLICT_CAUSES = [
  // Read as typed causes before D-218.
  "revenue-scope",
  "operating-basis",
  "operating-scope",
  "borrowing-cost-scope",
  // D-218 step 1: written beside the sentence; read since D-219 to D-222.
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
 * The D-218 step-1 codes. Those no reader decides by are kept out of run input
 * snapshots (`captureRunInputSnapshot`) so a stored snapshot's bytes stay as
 * they were. A step that migrates a reader to one of these codes stops
 * stripping it there, with its own snapshot note: D-219, D-220, D-221 and D-222 keep
 * the codes in `CONFLICT_CAUSES_READ_BY_CODE` (`@/edgar/refusalCauseRead`). Since
 * D-222 every one of them is read, so none is stripped; the list stays so that a
 * later dual-written code is again kept out until a reader reads it.
 */
export const DUAL_WRITTEN_CONFLICT_CAUSES: ReadonlySet<StatementConflictCause> = new Set<StatementConflictCause>(
  STATEMENT_CONFLICT_CAUSES.slice(STATEMENT_CONFLICT_CAUSES.indexOf("vendor-sec-value-conflict")),
);

/**
 * P10, P11 (D-229): the typed causes a missing-data entry (`ManifestEntry.cause`)
 * may carry. Same owner and same rules as the conflict list above: a code names
 * what its writer established, is written by the writer that composes the
 * sentence, and is never derived by parsing a sentence or written onto an entry
 * that has none. A code in this list and one in the conflict list never share a
 * name, so a code read off either kind of row means one thing.
 *
 * Each member names a cause that a run-time reader already tells apart by the
 * entry's wording (the inventory's G and P sites); no member is a new
 * distinction. Step S4.5a dual-writes them beside the unchanged sentences and no
 * reader decides by them yet. An entry without a code (any saved report, run
 * input snapshot or frozen record made before D-229, or a writer that has none)
 * is unresolved: it is read by its sentence as before and is never taken to be
 * any member of this list. A writer that rewrites an entry's sentence keeps a
 * code only when the new sentence still states that same cause
 * (`withoutGapCause` in `@/pipeline/stageA/manifest` drops it otherwise).
 */
export const GAP_CAUSES = [
  /** G1, G2: "DCF suppressed for unprofitable overlay ..." on `valuation.dcf` (`valueCompany`). */
  "dcf-unprofitable-overlay",
  /** G4: "balance-sheet fields missing for invested capital: ..." on `valuation.dcf.salesToCapital`. */
  "invested-capital-balance-fields-missing",
  /** G3: `TEMPORARY_EQUITY_REFUSAL_LEAD` on `valuation.dcf.salesToCapital`: a refused temporary-equity operand withholds the DCF. */
  "invested-capital-temporary-equity-refused",
  /** G3: `LEASE_EMPTIED_CAPITAL_LEAD` on `valuation.dcf.salesToCapital`: the operating-lease removal empties invested capital. */
  "invested-capital-lease-emptied",
  /** G5: "temporary-equity SEC enrichment withheld: <reason>" for the whole balance date (`supplementTemporaryEquity` `refuse`). */
  "temporary-equity-enrichment-withheld",
  /** G5 (and the R4 sentence): "temporary-equity SEC enrichment withheld: vendor A/L/permanent-equity operands are missing, ..." for one category. */
  "temporary-equity-operands-unmatched",
  /** P1: the gap an `FmpQuotaError` leaves ("FMP quota/rate limit (HTTP n): ..."), with any retry note appended. */
  "fmp-quota",
  /** P2, P3, P5: `FMP_EMPTY_ARRAY_REASON`, a 200 response with an empty array. */
  "fmp-empty-array",
  /** P5: "no API key + no fixture" from the FMP client. */
  "fmp-no-api-key",
  /** P7a: an `FmpAccessError` of symbol scope ("this symbol is unavailable on this endpoint with this key"). */
  "fmp-symbol-restricted",
  /** P5: `ticker "<symbol>" not in SEC company_tickers.json` from the EDGAR ticker lookup. */
  "sec-ticker-not-listed",
  /** P4: the no-annual-report gap of a successor registrant whose predecessor EDGAR does not link (`UNLINKED_PREDECESSOR`). */
  "sec-unlinked-predecessor",
] as const;

export type GapCause = (typeof GAP_CAUSES)[number];
