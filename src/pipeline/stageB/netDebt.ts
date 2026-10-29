/**
 * Versioned net-debt convention shared by capital scoring and every valuation
 * equity bridge. Pure and deterministic: no provider, clock, or persistence.
 */

/**
 * V3 (D-60): marketable equity securities that the filing places inside cash
 * and short-term investments are not cash. When their sourced fair value is
 * supplied, net debt nets only cash, cash equivalents and the remaining
 * short-term investments, and the equity securities are reported separately
 * as a non-operating asset. Without that input the result equals V2.
 */
export const NET_DEBT_RESOLVER_VERSION = "NET_DEBT_V3" as const;

export interface LeaseDebtInputs {
  totalDebt?: number | null;
  capitalLeaseObligations?: number | null;
  operatingLeaseLiability?: number | null;
  financeLeaseLiability?: number | null;
  /**
   * Wording only (audit 2026-10-29, AMZN #51 VAL-4): the vendor's own current
   * and noncurrent split of its lease line, and each field's filed tags, let
   * the refusal state every operand's scope. They never change the decision.
   */
  capitalLeaseObligationsCurrent?: number | null;
  capitalLeaseObligationsNonCurrent?: number | null;
  fieldProvenance?: Readonly<Record<string, { readonly tags: readonly string[] } | undefined>>;
}

/** An amount in millions with grouped digits ("96,320M"); the refusal names the values it compared. */
export function millions(value: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value / 1e6)}M`;
}

/**
 * What a vendor total completed from its filing (D-132) had left out, read
 * from the completed total's tags: the filed current debt is among them only
 * when it replaced a zero or absent vendor short-term debt.
 */
export function completedTotalOmission(tags: readonly string[]): string {
  return tags.some((tag) => /(^|\/)LongTermDebtCurrent$/.test(tag)) ? "current debt and current lease liabilities" : "current lease liabilities";
}

/** "(current + noncurrent)", "(noncurrent only)" or "(current only)" from a lease field's filed tags; "" when they do not say. */
function filedScope(tags: readonly string[] | undefined, prefix: "Operating" | "Finance"): string {
  if (tags === undefined) return "";
  if (tags.includes(`us-gaap/${prefix}LeaseLiability`)) return " (current + noncurrent)";
  const current = tags.includes(`us-gaap/${prefix}LeaseLiabilityCurrent`), noncurrent = tags.includes(`us-gaap/${prefix}LeaseLiabilityNoncurrent`);
  return current && noncurrent ? " (current + noncurrent)" : noncurrent ? " (noncurrent only)" : current ? " (current only)" : "";
}

/** The lease line as its source states it: a filed total, or the vendor's line with the split the vendor itself reports. */
function leaseLineText(inputs: LeaseDebtInputs, total: number): string {
  const tags = inputs.fieldProvenance?.capitalLeaseObligations?.tags;
  if (tags !== undefined) {
    const scopes = new Set([filedScope(tags, "Operating"), filedScope(tags, "Finance")].filter(scope => scope !== ""));
    return `the filed lease-liability total ${millions(total)}${scopes.size === 1 ? [...scopes][0] : ""}`;
  }
  const current = finite(inputs.capitalLeaseObligationsCurrent), noncurrent = finite(inputs.capitalLeaseObligationsNonCurrent);
  const tolerance = Math.max(1, Math.abs(total) * 1e-6);
  const scope = (current === null || current === 0) && noncurrent !== null && Math.abs(noncurrent - total) <= tolerance ? " (noncurrent only)"
    : current !== null && current > 0 && noncurrent !== null && Math.abs(current + noncurrent - total) <= tolerance ? " (current + noncurrent)" : "";
  return `the vendor lease line ${millions(total)}${scope}`;
}

/**
 * Missing splits retain the reported basis; contradictory supplied totals do
 * not. The reason names the amounts compared and, where the inputs state it,
 * each operand's current/noncurrent scope, so it describes the inputs and never
 * reads as a fault of the issuer's own balance sheet (audit 2026-10-29, AMZN
 * #51 VAL-4). The tests and their order are unchanged.
 */
export function leaseDebtConflict(inputs: LeaseDebtInputs): string | null {
  const debt = finite(inputs.totalDebt);
  const total = finite(inputs.capitalLeaseObligations);
  const operating = finite(inputs.operatingLeaseLiability);
  const finance = finite(inputs.financeLeaseLiability);
  const operatingText = (value: number) => `operating-lease liability ${millions(value)}${filedScope(inputs.fieldProvenance?.operatingLeaseLiability?.tags, "Operating")}`;
  const financeText = (value: number) => `finance-lease liability ${millions(value)}${filedScope(inputs.fieldProvenance?.financeLeaseLiability?.tags, "Finance")}`;
  const negative = ([["total debt", debt], ["lease line", total], ["operating-lease liability", operating], ["finance-lease liability", finance]] as const)
    .filter(([, value]) => value !== null && value < 0);
  if (negative.length > 0) {
    return `negative debt or lease input (${negative.map(([label, value]) => `${label} ${millions(value!)}`).join(", ")}) - invalid debt/lease input`;
  }
  const exceeds = (part: number | null, whole: number | null): boolean =>
    part !== null && whole !== null && part > whole + Math.max(1, Math.abs(whole) * 1e-6);
  const overDebt = exceeds(total, debt) ? leaseLineText(inputs, total!) : exceeds(operating, debt) ? operatingText(operating!) : exceeds(finance, debt) ? financeText(finance!) : null;
  if (overDebt !== null) {
    return `${overDebt} exceeds total debt ${millions(debt!)} - the debt and lease inputs do not reconcile`;
  }
  if (operating !== null && finance !== null && exceeds(operating + finance, debt)) {
    return `${operatingText(operating)} and ${financeText(finance)} together exceed total debt ${millions(debt!)}`;
  }
  const overLine = exceeds(operating, total) ? operatingText(operating!) : exceeds(finance, total) ? financeText(finance!) : null;
  if (overLine !== null) {
    return `${overLine} exceeds ${leaseLineText(inputs, total!)} - the lease inputs are on different scopes and do not reconcile`;
  }
  if (total !== null && operating !== null && finance !== null &&
      Math.abs(operating + finance - total) > Math.max(1, Math.abs(total) * 1e-6)) {
    return `${operatingText(operating)} plus ${financeText(finance)} (${millions(operating + finance)}) do not reconcile to ${leaseLineText(inputs, total)}`;
  }
  return null;
}

/**
 * Removing the operating-lease liability from net debt or EV presumes totalDebt
 * holds it (audit 2026-10-19, CODE-1). An operating lease enriched from SEC
 * onto a vendor row whose totalDebt is borrowings only would otherwise be
 * subtracted from debt it was never in. Proven when the row's total lease
 * liability covers the operating slice, or when totalDebt reconciles to
 * current plus noncurrent borrowings plus the leases. Returns the reason the
 * removal is unproven, or null.
 */
export function operatingLeaseScopeUnproven(row: LeaseDebtInputs & { shortTermDebt?: number | null; longTermDebt?: number | null }): string | null {
  const operating = finite(row.operatingLeaseLiability);
  if (operating === null || operating === 0) return null;
  const tolerance = (value: number): number => Math.max(1, Math.abs(value) * 1e-6);
  const total = finite(row.capitalLeaseObligations);
  if (total !== null && total >= operating - tolerance(operating)) return null;
  const debt = finite(row.totalDebt), short = finite(row.shortTermDebt), long = finite(row.longTermDebt);
  const composed = short !== null && long !== null ? short + long + operating + (finite(row.financeLeaseLiability) ?? 0) : null;
  if (debt !== null && composed !== null && Math.abs(composed - debt) <= tolerance(debt)) return null;
  // KNW-04 (audit 2026-10-29, AMZN #51): each half names what it compared; a smaller total that exists is not denied.
  // Fix round 3: amounts in millions, as every other refusal on this path.
  const cover = total === null ? "no total lease liability is disclosed" : `the total lease liability ${millions(total)} is smaller than it`;
  const reconcile = debt === null ? "total debt is unavailable"
    : composed === null ? "current and noncurrent borrowings are not both disclosed to reconcile it"
      : `borrowings plus leases ${millions(composed)} do not reconcile to the total`;
  return `operating-lease scope unproven: the operating-lease liability ${millions(operating)} is not shown to be inside total debt ${debt === null ? "unavailable" : millions(debt)} ` +
    `(${cover}, and ${reconcile}), so it is not removed; net debt is used as reported`;
}

export interface NetDebtInputs extends LeaseDebtInputs {
  date?: string | null;
  totalDebt?: number | null;
  cashAndCashEquivalents?: number | null;
  shortTermInvestments?: number | null;
  cashAndShortTermInvestments?: number | null;
  /**
   * D-60: fair value of the marketable equity securities INSIDE the
   * cash-and-short-term-investments total (marketableEquity.ts establishes it
   * from the filing). Excluded from cash; never inferred.
   */
  marketableEquitySecurities?: number | null;
  /** Accepted only for diagnostics; its cash-only convention is never used. */
  vendorNetDebt?: number | null;
  /** The admission's refusals: a total debt refused there is named as refused, not missing (KNW-04). */
  fieldConflicts?: Readonly<Record<string, { readonly usable?: boolean; readonly reason?: string } | undefined>>;
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
  /**
   * D-60: the marketable equity securities left out of cash (a non-operating
   * asset, valued separately). Present only when they were excluded.
   */
  nonOperatingEquitySecurities?: number;
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
  const suppliedEquity = finite(inputs.marketableEquitySecurities);
  // D-60: equity securities leave a cash total only when it can hold them —
  // positive, and no larger than the total's non-cash part.
  const equityOutsideCash = (liquidity: number, cashPart: number | null): { excluded: number | null; text: string } => {
    if (suppliedEquity === null || suppliedEquity === 0) return { excluded: null, text: "" };
    const room = liquidity - (cashPart ?? 0);
    if (suppliedEquity < 0 || suppliedEquity > room + Math.max(1, Math.abs(liquidity) * 1e-6)) {
      return { excluded: null, text: `; supplied marketable equity securities ${suppliedEquity} do not fit inside the short-term investments and were not separated` };
    }
    return {
      excluded: suppliedEquity,
      text: `, excluding ${suppliedEquity} of marketable equity securities: they are a non-operating asset at fair value, not cash`,
    };
  };
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
    const refused = inputs.fieldConflicts?.totalDebt;
    return {
      ...base,
      value: null,
      cashBasis: null,
      reason: refused?.usable === false
        ? `total debt withheld (${refused.reason ?? "refused at admission"}) — house net debt unavailable`
        : "total debt missing — house net debt unavailable",
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
    const equity = equityOutsideCash(combinedCash, cash);
    return {
      ...base,
      value: totalDebt - combinedCash + (equity.excluded ?? 0),
      cashBasis: "combined-field",
      ...(equity.excluded !== null ? { nonOperatingEquitySecurities: equity.excluded } : {}),
      reason: `total debt minus cash and short-term investments (combined field)${equity.text}`,
    };
  }

  if (cash !== null && shortTermInvestments !== null) {
    const equity = equityOutsideCash(cash + shortTermInvestments, cash);
    return {
      ...base,
      value: totalDebt - cash - shortTermInvestments + (equity.excluded ?? 0),
      cashBasis: "component-sum",
      ...(equity.excluded !== null ? { nonOperatingEquitySecurities: equity.excluded } : {}),
      reason: `total debt minus cash and separately reported short-term investments${equity.text}`,
    };
  }

  return {
    ...base,
    value: null,
    cashBasis: null,
    // Fix round 2, M3: name the row's cash-only net debt only when it carries one (a keyless row often does not).
    reason: "combined cash-and-short-term-investments unavailable and one or more cash components missing" +
      (vendorNetDebt !== null ? "; the row's cash-only net debt is not used" : ""),
  };
}
