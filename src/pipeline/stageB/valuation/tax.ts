/** Bounded tax reread for one-off income; do not assume deductibility (P16; D-153). */
import { isNum } from "./primitives";


/** D-153: Bound the tax reread rather than assume the deductibility of a tagged one-off. */
export function taxRateWithoutOneOffs(i: { pretax: number | null; taxExpense: number | null; oneOff: number; marginalPct: number; historicalMedianPct: number | null }): { pct: number; noTaxEffectPct: number; marginalEffectPct: number; source: "historical-median-inside" | "historical-median-held" | "marginal-reading" } | null {
  if (!isNum(i.pretax) || !isNum(i.taxExpense) || i.taxExpense < 0 || i.pretax - i.oneOff <= 0) return null;
  const hold = (n: number) => Math.min(35, Math.max(0, n));
  const noTaxEffectPct = hold(i.taxExpense / (i.pretax - i.oneOff) * 100);
  const marginalEffectPct = hold((i.taxExpense - i.marginalPct / 100 * i.oneOff) / (i.pretax - i.oneOff) * 100);
  const pct = isNum(i.historicalMedianPct) ? Math.min(Math.max(noTaxEffectPct, marginalEffectPct), Math.max(Math.min(noTaxEffectPct, marginalEffectPct), i.historicalMedianPct)) : marginalEffectPct;
  return { pct, noTaxEffectPct, marginalEffectPct, source: !isNum(i.historicalMedianPct) ? "marginal-reading" : pct === i.historicalMedianPct ? "historical-median-inside" : "historical-median-held" };
}
