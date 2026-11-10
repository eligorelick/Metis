/**
 * Value formatting shared by the Markdown and print exports (P22: one
 * presentation rule per figure). Each export used to keep its own copy of
 * these helpers, and the copies drifted: Markdown rounded signed percentages
 * with `toFixed`, so 12.35 printed "+12.3%" there and "+12.4%" in print and
 * the app. Both exports now read these helpers, and the signed percentage
 * uses the app's `formatPct` (`decimalRound`) rounding.
 *
 * Deterministic text: no locale and no digit grouping.
 */
import { formatFinancialValue, formatPct } from "@/report/format";
import { claimCitation, displayClaimText, displayProse } from "@/report/presentation";
import type { SourcedClaim, TracedNumber } from "@/report/schema";
import { claimStatusMarkText } from "@/report/verificationMarks";

/** The reader's mark for an absent value. */
export const READER_DASH = "—";

/** Fixed-decimal number, or an em dash for null/non-finite. */
export function num(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return READER_DASH;
  return v.toFixed(digits);
}

/** A traced figure in its own unit and currency. */
export function tracedValue(n: TracedNumber): string {
  return formatFinancialValue(n.value, n.unit, n.currency);
}

/**
 * Signed percent for deltas (e.g. +7.3% / -4.0%), rounded as the app rounds
 * it; an em dash for null/non-finite. A value that rounds to zero prints
 * without a sign, as the app shows it.
 */
export function signedPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return READER_DASH;
  return formatPct(v, digits, true);
}

/** F-21: a factual claim's verification status as a plain-text suffix, or "". */
export function statusMarkSuffix(claim: SourcedClaim): string {
  const mark = claimStatusMarkText(claim);
  return mark === null ? "" : ` ${mark}`;
}

/**
 * How one export writes the parts of a reasoning cell. Every function takes
 * plain text and returns that export's markup.
 */
export interface ClaimReasoningMarkup {
  /** A single reasoning claim: its prose with the status suffix. */
  text(plain: string): string;
  /** A claim label inside the brackets. */
  label(label: string): string;
  /** One claim's display text. */
  claimText(text: string): string;
  /** One claim's citation, inside the parentheses. */
  citation(claim: SourcedClaim): string;
  /** One claim's status suffix. */
  mark(suffix: string): string;
}

/**
 * A catalyst, risk or development reasoning cell: one claim's prose, or each
 * claim as "[label] text (citation)" joined by spaces, with each claim's status mark.
 */
export function claimReasoning(reasoning: SourcedClaim | SourcedClaim[], markup: ClaimReasoningMarkup): string {
  if (!Array.isArray(reasoning)) return markup.text(`${displayProse(reasoning.text, reasoning.source)}${statusMarkSuffix(reasoning)}`);
  return reasoning
    .map(claim => `[${markup.label(claim.label)}] ${markup.claimText(displayClaimText(claim))} (${markup.citation(claim)})${markup.mark(statusMarkSuffix(claim))}`)
    .join(" ");
}

/** Plain-text reasoning parts for an export whose table escapes each cell. */
export const PLAIN_CLAIM_REASONING: ClaimReasoningMarkup = {
  text: plain => plain,
  label: label => label,
  claimText: text => text,
  citation: claim => claimCitation(claim),
  mark: suffix => suffix,
};
