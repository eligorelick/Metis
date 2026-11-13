/**
 * "This ticker does not exist" — as opposed to "we could not reach anyone who
 * would know" (P5 in the refusal-wording inventory). Only an affirmative answer
 * counts: FMP replying with an empty result, or, on a plan with no FMP key, SEC's
 * own ticker table not listing the symbol at all. A transport failure, a cooldown
 * or a 403 is a degraded run, never an unknown ticker.
 *
 * One definition, read by the job runner (no report is saved for an unknown
 * ticker) and the company page (a 404 instead of the disclosed-gap page). Before
 * D-242 each kept its own copy of the same test.
 *
 * P11 (D-242): each status is decided by the entry's typed cause; an entry
 * without one (an older snapshot or stored bundle) by its sentence, through
 * `@/edgar/refusalCauseRead`. FMP's empty array with the public fallback's
 * failure appended (`fmp-empty-array-fallback-failed`) is not an affirmative
 * miss, as the exact-sentence test never treated it as one.
 */
import { gapCauseMatches } from "@/edgar/refusalCauseRead";
import type { DataBundle } from "@/pipeline/types";

export function isConfirmedUnknownProfile(bundle: { profile: DataBundle["profile"]; edgar: { cik: DataBundle["edgar"]["cik"] } }): boolean {
  if (bundle.profile.ok) return bundle.profile.value.data.rows.length === 0;
  if (gapCauseMatches(bundle.profile.gap, "fmpEmptyArrayAlone")) return true;
  // Keyless: FMP had nothing (no key, no fixture) AND EDGAR's ticker table has
  // no such registrant.
  const edgarMiss = !bundle.edgar.cik.ok && gapCauseMatches(bundle.edgar.cik.gap, "secTickerNotListed");
  return edgarMiss && gapCauseMatches(bundle.profile.gap, "fmpNoApiKey");
}
