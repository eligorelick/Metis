/** A normalized sample percentile and N are separate quantities, never an ordinal rank. */
export function ownHistoryRankLabel(value: number | null, observations?: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return `empirical percentile ${value.toFixed(0)}/100` +
    (typeof observations === "number" && Number.isFinite(observations) ? ` (n = ${observations} quarters)` : " (sample size unavailable)");
}
