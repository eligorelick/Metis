/**
 * Versioned net-debt convention shared by capital scoring and every valuation
 * equity bridge. Pure and deterministic: no provider, clock, or persistence.
 */

export const NET_DEBT_RESOLVER_VERSION = "NET_DEBT_V2" as const;

export interface LeaseDebtInputs {
  totalDebt?: number | null;
  capitalLeaseObligations?: number | null;
  operatingLeaseLiability?: number | null;
  financeLeaseLiability?: number | null;
}

/** Missing splits retain the reported basis; contradictory supplied totals do not. */
export function leaseDebtConflict(inputs: LeaseDebtInputs): string | null {
  const debt = finite(inputs.totalDebt);
  const total = finite(inputs.capitalLeaseObligations);
  const operating = finite(inputs.operatingLeaseLiability);
  const finance = finite(inputs.financeLeaseLiability);
  if ([debt, total, operating, finance].some(value => value !== null && value < 0)) {
    return "negative debt or lease liability - invalid debt/lease composition";
  }
  const exceeds = (part: number | null, whole: number | null): boolean =>
    part !== null && whole !== null && part > whole + Math.max(1, Math.abs(whole) * 1e-6);
  if (exceeds(total, debt) || exceeds(operating, debt) || exceeds(finance, debt)) {
    return "lease liability exceeds total debt - incompatible debt/lease composition";
  }
  if (operating !== null && finance !== null && exceeds(operating + finance, debt)) {
    return "operating and finance lease liabilities together exceed total debt";
  }
  if (exceeds(operating, total) || exceeds(finance, total)) {
    return "lease component exceeds total lease liabilities - incompatible debt/lease composition";
  }
  if (total !== null && operating !== null && finance !== null &&
      Math.abs(operating + finance - total) > Math.max(1, Math.abs(total) * 1e-6)) {
    return "operating and finance leases do not reconcile to total lease liabilities";
  }
  return null;
}

export interface NetDebtInputs extends LeaseDebtInputs {
  date?: string | null;
  totalDebt?: number | null;
  cashAndCashEquivalents?: number | null;
  shortTermInvestments?: number | null;
  cashAndShortTermInvestments?: number | null;
  /** Accepted only for diagnostics; its cash-only convention is never used. */
  vendorNetDebt?: number | null;
}

export interface NetDebtResolution {
  /**
   * Set when supplied cash or lease components contradict their totals. This
   * is a data-integrity refusal, not a missing cash basis; callers must not
   * fall back to narrower cash figures or an unadjusted debt balance.
   */
  conflict?: true;
  version: typeof NET_DEBT_RESOLVER_VERSION;
  value: number | null;
  asOf: string | null;
  cashBasis: "combined-field" | "component-sum" | null;
  components: {
    totalDebt: number | null;
    cashAndCashEquivalents: number | null;
    shortTermInvestments: number | null;
    cashAndShortTermInvestments: number | null;
    vendorNetDebt: number | null;
  };
  reason: string;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function resolveNetDebt(inputs: NetDebtInputs): NetDebtResolution {
  const totalDebt = finite(inputs.totalDebt);
  const cash = finite(inputs.cashAndCashEquivalents);
  const shortTermInvestments = finite(inputs.shortTermInvestments);
  const combinedCash = finite(inputs.cashAndShortTermInvestments);
  const vendorNetDebt = finite(inputs.vendorNetDebt);
  const components = {
    totalDebt,
    cashAndCashEquivalents: cash,
    shortTermInvestments,
    cashAndShortTermInvestments: combinedCash,
    vendorNetDebt,
  };
  const base = {
    version: NET_DEBT_RESOLVER_VERSION,
    asOf: typeof inputs.date === "string" && inputs.date.length > 0 ? inputs.date : null,
    components,
  };

  if (totalDebt === null) {
    return {
      ...base,
      value: null,
      cashBasis: null,
      reason: "total debt missing — house net debt unavailable",
    };
  }

  // A negative FMP totalDebt is invalid data (interest income netted, or a vendor
  // sign-convention flip) — the same class the WACC/ROIC paths already reject
  // (compute.ts totalDebtSnapshot, returns.ts investedCapital). Accepting it would
  // subtract a NEGATIVE debt, silently inflating the valuation equity bridge by
  // |totalDebt| + cash. Fail closed so the bridge suppresses rather than inflates.
  if (totalDebt < 0) {
    return {
      ...base,
      value: null,
      cashBasis: null,
      reason: "total debt is negative — invalid data; house net debt unavailable",
    };
  }

  const leaseConflict = leaseDebtConflict(inputs);
  if (leaseConflict !== null) {
    return { ...base, value: null, cashBasis: null, conflict: true, reason: leaseConflict };
  }

  if (combinedCash !== null) {
    // Short-term investments cannot be negative, so a combined field BELOW the
    // cash balance alone is the same contradiction as a mismatch against the
    // full component sum — and a vendor zero-fill of the combined field would
    // otherwise overstate net debt by the whole cash balance in every consumer.
    if (cash !== null && combinedCash < cash - Math.max(1, Math.abs(cash) * 1e-6)) {
      return {
        ...base,
        value: null,
        cashBasis: null,
        conflict: true,
        reason: "combined cash-and-short-term-investments is below the reported cash balance",
      };
    }
    if (cash !== null && shortTermInvestments !== null) {
      const componentSum = cash + shortTermInvestments;
      const tolerance = Math.max(1, Math.abs(combinedCash) * 1e-6);
      if (Math.abs(componentSum - combinedCash) > tolerance) {
        return {
          ...base,
          value: null,
          cashBasis: null,
          conflict: true,
          reason: "combined cash-and-short-term-investments conflicts with reported components",
        };
      }
    }
    return {
      ...base,
      value: totalDebt - combinedCash,
      cashBasis: "combined-field",
      reason: "total debt minus cash and short-term investments (combined field)",
    };
  }

  if (cash !== null && shortTermInvestments !== null) {
    return {
      ...base,
      value: totalDebt - cash - shortTermInvestments,
      cashBasis: "component-sum",
      reason: "total debt minus cash and separately reported short-term investments",
    };
  }

  return {
    ...base,
    value: null,
    cashBasis: null,
    reason:
      "combined cash-and-short-term-investments unavailable and one or more cash components missing; vendor cash-only net debt rejected",
  };
}
