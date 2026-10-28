/**
 * The currency of an analyst estimate, a price target or a compensation total.
 * (A stock-peers market cap does NOT inherit: peers are not necessarily listed
 * where the subject is, so a peer cap takes only a currency its own row or its
 * own profile states, AI-301; see peerListingCurrency in stageC/payload.ts.)
 *
 * FMP's /stable/analyst-estimates, /stable/price-target-consensus and
 * /stable/governance-executive-compensation rows carry
 * no currency field, and FMP documents no convention for them. A row's own
 * `reportedCurrency` or `currency` always wins. Without one, the row inherits
 * the issuer's currency (D-57, which replaces D-28's own-row-only rule) when
 * the evidence for that currency agrees:
 *
 *  - the reporting currency the statements establish (their own label or a
 *    statement of the same filing; the currency the Stage B model runs in);
 *  - the listing currency on the profile (the quote's currency);
 *  - the issuer is not an ADR.
 *
 * An ADR is the one case where the per-symbol endpoints genuinely have two
 * candidate currencies: an estimate may be stated per receipt in the listing
 * currency or per ordinary share in the reporting currency. That, a reporting
 * currency that differs from the listing currency, or either one being
 * unknown, withholds inheritance; the row then stays "currency unknown" and is
 * never registered or used as money.
 */
export const ANALYST_ESTIMATE_PROVIDER_CONVENTION: string | null = null;

function iso(value: unknown): string | null {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** The row's own currency, else the documented provider convention, else null. */
export function estimateCurrency(row: object | null | undefined): string | null {
  const fields = (row ?? {}) as { reportedCurrency?: unknown; currency?: unknown };
  return iso(fields.reportedCurrency) ?? iso(fields.currency) ?? ANALYST_ESTIMATE_PROVIDER_CONVENTION;
}

/** The issuer currency single-currency provider rows inherit, with why. */
export interface InheritedIssuerCurrency {
  /** ISO code rows without their own currency inherit; null when withheld. */
  code: string | null;
  /** One sentence for the payload note and the manifest. */
  basis: string;
}

export function inheritedIssuerCurrency(evidence: {
  /** The statements' established reporting currency (Stage B's model currency). */
  reporting: string | null | undefined;
  /** The profile's listing (trading) currency. */
  listing: string | null | undefined;
  isAdr: boolean;
}): InheritedIssuerCurrency {
  const reporting = iso(evidence.reporting);
  const listing = iso(evidence.listing);
  if (evidence.isAdr) {
    return {
      code: null,
      basis:
        "not inherited: the issuer is an ADR, so a provider row without a currency may be per receipt in the listing " +
        "currency or per ordinary share in the reporting currency",
    };
  }
  if (reporting === null || listing === null) {
    return {
      code: null,
      basis: `not inherited: the ${reporting === null ? "reporting" : "listing"} currency is not established, so nothing confirms the issuer's currency`,
    };
  }
  if (reporting !== listing) {
    return {
      code: null,
      basis: `not inherited: the statements report in ${reporting} while the listing trades in ${listing}`,
    };
  }
  return {
    code: reporting,
    basis:
      `inherited from the issuer's reporting currency ${reporting}: the statements and the listing agree and the issuer ` +
      "is not an ADR; the provider row carries no currency of its own (D-57)",
  };
}

/**
 * A provider row's currency: its own, else the inherited issuer currency.
 * `inherited` marks the second case so every consumer can disclose it.
 */
export function providerRowCurrency(
  row: object | null | undefined,
  issuer: InheritedIssuerCurrency,
): { code: string | null; inherited: boolean } {
  const own = estimateCurrency(row);
  if (own !== null) return { code: own, inherited: false };
  return { code: issuer.code, inherited: issuer.code !== null };
}
