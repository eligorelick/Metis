import type { ValuationUse } from "@/report/schema";
import { dcfDomainFailure, runDcf, S2C_CLAMP, type DcfAssumptions, type DcfResult } from "./valuation";

export interface TaxCapitalSensitivity {
  basis: string;
  withheldReason: string | null;
  rows: Array<{ taxShiftPp: number; taxYears: number; salesToCapitalFactor: number; salesToCapital: number;
    perShare: number | null; changeFromBase: number | null; withheldReason: string | null }>;
}

/** Mechanical alternatives only: never replace the underwritten base or grades. */
export function taxCapitalSensitivity(assumptions: DcfAssumptions, base: DcfResult, waccPct: number, valuationUse: ValuationUse): TaxCapitalSensitivity {
  const taxYears = Math.min(5, Math.max(0, assumptions.years - 1));
  const basis = `Mechanical sensitivity, not an underwritten forecast or revised fair value: shift the operating tax rate by -5/0/+5 percentage points in the first ${taxYears} years and multiply explicit-period sales-to-capital by 0.75/1/1.25. Revenue, EBIT margins, WACC (including its existing debt-tax shield), later taxes, terminal growth/ROIC, valuation date and the base equity bridge stay fixed. No segment economics or tax-benefit recurrence is inferred; capital efficiency here measures marginal forecast reinvestment. Cells outside the admitted input range or DCF domain are withheld.`;
  const refused = valuationUse?.status !== "current" ? "Current valuation use is not established."
    : !Number.isInteger(assumptions.years) || assumptions.years < 1 ||
      [assumptions.growthPath.value, assumptions.ebitMarginPath.value, assumptions.taxRatePath.value].some(path =>
        path.length !== assumptions.years || path.some(value => !Number.isFinite(value)))
      ? "Forecast paths must contain finite values for the complete forecast horizon."
    : base.perShare === null || !Number.isFinite(base.perShare) || base.domain || base.noncontrollingKeyWithheld || base.temporaryEquityWithheld || dcfDomainFailure(base)
      ? "The base DCF is withheld or outside its domain; sensitivity cannot restore it."
      : !Number.isFinite(waccPct) || waccPct <= -100 || !Number.isFinite(assumptions.salesToCapital.value) || assumptions.salesToCapital.value <= 0
        ? "Required discount-rate or capital-efficiency input is invalid." : null;
  if (refused) return { basis, withheldReason: refused, rows: [] };
  const rows: TaxCapitalSensitivity["rows"] = [];
  for (const taxShiftPp of [-5, 0, 5]) for (const salesToCapitalFactor of [0.75, 1, 1.25]) {
    const salesToCapital = assumptions.salesToCapital.value * salesToCapitalFactor;
    const taxes = assumptions.taxRatePath.value.map((value, i) => value + (i < taxYears ? taxShiftPp : 0));
    // Retain an already admitted issuer-history floor below the house floor.
    const floor = Math.min(S2C_CLAMP[0], assumptions.salesToCapital.value);
    let withheldReason = taxes.some(value => !Number.isFinite(value) || value < 0 || value > 50)
      ? "Shifted operating tax rate falls outside [0%, 50%]."
      : salesToCapital < floor || salesToCapital > S2C_CLAMP[1] ? "Shifted capital efficiency falls outside the admitted input range." : null;
    let perShare: number | null = null;
    if (!withheldReason) {
      const result = runDcf({ ...assumptions, taxRatePath: { ...assumptions.taxRatePath, value: taxes }, salesToCapital: { ...assumptions.salesToCapital, value: salesToCapital } }, { ...base.bridge, waccPct });
      withheldReason = result.temporaryEquityWithheld ?? dcfDomainFailure(result)?.reason ?? (result.perShare === null || !Number.isFinite(result.perShare) ? "Finite per-share bridge unavailable." : null);
      perShare = withheldReason === null ? result.perShare : null;
    }
    rows.push({ taxShiftPp, taxYears, salesToCapitalFactor, salesToCapital, perShare, changeFromBase: perShare === null ? null : perShare - base.perShare!, withheldReason });
  }
  return { basis, withheldReason: null, rows };
}
