/**
 * Whether a statement-derived value may be set against the quote.
 *
 * A per-share intrinsic value, earnings, book value, FFO or a debt balance is
 * in the statements' currency; a price or a market capitalisation is in the
 * listing (quote) currency. Setting one against the other — an upside, a
 * price multiple, a reverse valuation, a market-value weight — is only a
 * figure when both are in ONE KNOWN currency. Different currencies would need
 * an FX rate, which is never invented here; an unknown currency on either side
 * leaves the comparison unproven. Either way the comparison is withheld, and
 * everything that does not touch the quote stays.
 * A minor-unit code is an unproven unit, not an FX mismatch; no scaling is inferred.
 */
export type PriceComparison =
  | { comparable: true; currency: string }
  | { comparable: false; mismatch: boolean; reason: string };

export const MINOR_UNIT_QUOTE_CODES: Readonly<Record<string, { major: string; label: string }>> = {
  GBp: { major: "GBP", label: "pence" }, GBX: { major: "GBP", label: "pence" }, GBx: { major: "GBP", label: "pence" },
  ZAc: { major: "ZAR", label: "cents" }, ZAC: { major: "ZAR", label: "cents" },
  ILA: { major: "ILS", label: "agorot" }, ILa: { major: "ILS", label: "agorot" },
};

/** Inspect the raw spelling before case folding (lowercase ISO `gbp` is pounds). */
export function minorUnitQuote(value: unknown): { code: string; major: string; label: string } | null {
  const code = typeof value === "string" ? value.trim() : "";
  return Object.hasOwn(MINOR_UNIT_QUOTE_CODES, code) ? { code, ...MINOR_UNIT_QUOTE_CODES[code] } : null;
}

function iso(value: string | null | undefined): string | null {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export function comparePriceCurrency(
  statementsCurrency: string | null | undefined,
  quoteCurrency: string | null | undefined,
): PriceComparison {
  const minor = minorUnitQuote(statementsCurrency) ?? minorUnitQuote(quoteCurrency);
  if (minor !== null) return {
    comparable: false, mismatch: false,
    reason: `${minor.code} (${minor.label}, a minor unit of ${minor.major}) is an unproven unit; no unit conversion is attempted`,
  };
  const statements = iso(statementsCurrency);
  const quote = iso(quoteCurrency);
  if (statements !== null && quote !== null) {
    return statements === quote
      ? { comparable: true, currency: statements }
      : {
          comparable: false,
          mismatch: true,
          reason: `statements in ${statements}, quote in ${quote} — no FX conversion is attempted`,
        };
  }
  return {
    comparable: false,
    mismatch: false,
    reason:
      statements === null && quote === null
        ? "statements' currency unknown and quote currency unknown"
        : statements === null
          ? `statements' currency unknown (quote in ${quote})`
          : `quote currency unknown (statements in ${statements})`,
  };
}
