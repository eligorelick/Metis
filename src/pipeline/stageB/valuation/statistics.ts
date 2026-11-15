/** Quantiles and ranks used by valuation; preserve full precision until display (P13). */



/** Linear-interpolated quantile (p in [0,1]) over finite values. */
export function quantile(values: number[], p: number): number | null {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const idx = Math.min(Math.max(p, 0), 1) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

export const medianOf = (values: number[]): number | null => quantile(values, 0.5);

/**
 * Percentile rank (0–100) of v within values, linear interpolation between
 * order statistics, with tolerance-aware tied midranks. Flat samples are
 * uninformative and return null. Needs >= 2 finite values.
 */
export function percentileRank(values: number[], v: number): number | null {
  const s = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (s.length < 2 || !Number.isFinite(v)) return null;
  const tied = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  if (tied(s[0], s[s.length - 1])) return null;
  const tiedIndices = s.flatMap((x, i) => tied(x, v) ? [i] : []);
  if (tiedIndices.length > 0) return ((tiedIndices[0] + tiedIndices[tiedIndices.length - 1]) / 2 / (s.length - 1)) * 100;
  if (v <= s[0]) return 0;
  if (v >= s[s.length - 1]) return 100;
  for (let i = 0; i < s.length - 1; i++) {
    if (v >= s[i] && v <= s[i + 1]) {
      const frac = s[i + 1] === s[i] ? 0 : (v - s[i]) / (s[i + 1] - s[i]);
      return ((i + frac) / (s.length - 1)) * 100;
    }
  }
  return null; // unreachable for finite sorted input
}
