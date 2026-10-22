/**
 * How a 0-100 score is printed beside its band. Dependency-free so client
 * components (ui.tsx) can share it with the exports and the judge payload.
 */

/** The house band cutoffs (grading.ts scoreToBand); a printed score never rounds across one. */
export const SCORE_BAND_CUTOFFS = [85, 70, 55, 40] as const;

/** `value` × 10^digits on the decimal it stands for (54.6 → 546, not 545.99…). */
function shifted(value: number, digits: number): number {
  return Number(`${Number(value.toPrecision(15))}e${digits}`);
}

/**
 * A 0-100 score with `digits` decimals, unless rounding would carry it up
 * across a band cutoff (54.6 printed "55" beside D, under a legend that says
 * C ≥55). Then it is cut, not rounded, to at least one decimal ("54.6"), so
 * the number shown and its band always agree. The score and band are unchanged.
 */
export function formatScore(score: number | null | undefined, digits = 0): string {
  if (score == null || !Number.isFinite(score)) return "n/a";
  const rounded = Math.round(shifted(score, digits)) / 10 ** digits;
  if (!SCORE_BAND_CUTOFFS.some((cutoff) => score < cutoff && rounded >= cutoff)) return rounded.toFixed(digits);
  const precise = Math.max(digits, 1);
  return (Math.floor(shifted(score, precise)) / 10 ** precise).toFixed(precise);
}
