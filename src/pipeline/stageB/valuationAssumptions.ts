/** Actual forward-model parameters, copied after the model has been valued. */
export interface FinancialValuationAssumptions {
  version: "financial-valuation-assumptions-v1";
  modelKind: "excess-return";
  horizonYears: number;
  costOfEquityPct: number;
  initialCommonBook: number;
  roePathBasis: string;
  terminalRoePct: number;
  /** Null when no growing continuation was valued. */
  terminalGrowthPct: number | null;
  terminalExcessReturnPp: number;
  continuingValuePv: number;
  continuingValueSharePct: number | null;
  continuingValueBasis: string;
  /**
   * Audit 2026-10-22 C-10 follow-through (D-102): the payout path, year 1 to
   * year N, fading from the three-year average to the steady state the
   * continuing value assumes. Absent on legacy objects.
   */
  payoutPathPct?: number[];
  /** 1 − g / terminal ROE, clamped to 0-100%. */
  steadyStatePayoutPct?: number;
  payoutPathBasis?: string;
}

const display = (v: number): string => v !== 0 && Math.abs(v) < 0.005
  ? v.toPrecision(3) : String(Math.round(v * 100) / 100);

export function describeFinancialValuation(a: FinancialValuationAssumptions | null | undefined): string {
  if (!a) return "Forward financial valuation assumptions unavailable; continuation cannot be inferred from legacy output.";
  const continuation = a.continuingValuePv !== 0
    ? `continuing value ${display(a.continuingValuePv)} (currency, present value; ${a.continuingValueSharePct === null ? "share unavailable" : `${display(a.continuingValueSharePct)}% of equity value`}), with residual-income growth ${a.terminalGrowthPct === null ? "unavailable" : `${display(a.terminalGrowthPct)}%`} beyond year ${a.horizonYears}`
    : "no continuing value is added beyond the explicit horizon";
  return `Forward excess-return model: ${a.horizonYears}-year explicit horizon; cost of equity ${display(a.costOfEquityPct)}%; opening book equity ${display(a.initialCommonBook)}; terminal ROE ${display(a.terminalRoePct)}% (${display(a.terminalExcessReturnPp)}pp excess over cost of equity); ${continuation}. ${a.roePathBasis}. Continuing-value basis: ${a.continuingValueBasis}.${a.payoutPathBasis === undefined ? "" : ` The payout ${a.payoutPathBasis}.`}`;
}
