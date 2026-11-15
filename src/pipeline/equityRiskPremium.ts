/**
 * Equity risk premium selection, split out of compute.ts: the issuer-domicile ERP row by country
 * identity, with the disclosed US fallback; conflicting rows fail closed (P10, P16).
 */

import type { FmpMarketRiskPremiumRow } from "@/providers/fmp";
import { num } from "./bundleRows";

export const US_COUNTRY_KEYS = new Set(["us", "usa", "unitedstates", "unitedstatesofamerica"]);

/**
 * Select the US total ERP by country identity, never by provider array order.
 * Conflicting US rows fail closed so an ambiguous vendor response cannot
 * silently choose whichever value happens to arrive first.
 */
export function selectUsEquityRiskPremium(
  rows: ReadonlyArray<FmpMarketRiskPremiumRow>,
): number | null {
  const values = rows.flatMap((row) => {
    const countryKey = typeof row.country === "string"
      ? row.country.toLowerCase().replace(/[^a-z]/g, "")
      : "";
    const value = num(row.totalEquityRiskPremium);
    return US_COUNTRY_KEYS.has(countryKey) && value !== null ? [value] : [];
  });
  const uniqueValues = [...new Set(values)];
  return uniqueValues.length === 1 ? uniqueValues[0] : null;
}

export const countryKeyOf = (value: unknown): string =>
  typeof value === "string" ? value.toLowerCase().replace(/[^a-z]/g, "") : "";

/**
 * FMP's profile reports an ISO-2 code ("TW"); its market-risk-premium rows are
 * keyed by full country NAME ("Taiwan"). Comparing them directly could never
 * match, so the domicile lookup silently fell through to the US premium for
 * every foreign issuer — the exact defect it was written to fix.
 *
 * Unlisted codes stay unresolved and keep the DISCLOSED US fallback, so an
 * unmapped domicile fails closed and loudly rather than matching wrongly.
 */
const COUNTRY_CODE_TO_NAME: Readonly<Record<string, string>> = {
  ar: "argentina", au: "australia", at: "austria", be: "belgium", br: "brazil",
  ca: "canada", cl: "chile", cn: "china", co: "colombia", cz: "czechrepublic",
  dk: "denmark", eg: "egypt", fi: "finland", fr: "france", de: "germany",
  gr: "greece", hk: "hongkong", hu: "hungary", in: "india", id: "indonesia",
  ie: "ireland", il: "israel", it: "italy", jp: "japan", kr: "southkorea",
  lu: "luxembourg", my: "malaysia", mx: "mexico", nl: "netherlands",
  nz: "newzealand", no: "norway", pe: "peru", ph: "philippines", pl: "poland",
  pt: "portugal", qa: "qatar", ro: "romania", ru: "russia", sa: "saudiarabia",
  sg: "singapore", za: "southafrica", es: "spain", se: "sweden",
  ch: "switzerland", tw: "taiwan", th: "thailand", tr: "turkey",
  ae: "unitedarabemirates", gb: "unitedkingdom", uk: "unitedkingdom",
  us: "unitedstates", vn: "vietnam",
};

/** Every spelling one domicile may appear under, for set-intersection matching. */
function countryAliases(value: unknown): Set<string> {
  const key = countryKeyOf(value);
  if (key.length === 0) return new Set();
  const out = new Set([key]);
  const mapped = COUNTRY_CODE_TO_NAME[key];
  if (mapped !== undefined) out.add(mapped);
  for (const [code, name] of Object.entries(COUNTRY_CODE_TO_NAME)) {
    if (name === key) out.add(code);
  }
  return out;
}

/**
 * Select the total ERP for the ISSUER'S domicile, never the US premium by
 * default. CAPM's market premium is a property of the market the equity is
 * exposed to; substituting the US premium for a foreign issuer understates its
 * cost of equity by the whole country risk premium — which is the entire point
 * of Damodaran's country-risk adjustment, and which the vendor already supplies
 * per country in the same payload.
 *
 * Returns the domicile row when it resolves unambiguously. Otherwise falls back
 * to the US row and says so, so the substitution is disclosed rather than
 * silent. Conflicting rows for one country fail closed, as the US selector
 * already did.
 */
export function selectEquityRiskPremium(
  rows: ReadonlyArray<FmpMarketRiskPremiumRow>,
  country: string | null,
): {
  pct: number | null;
  basis: "domicile" | "us-fallback";
  country: string | null;
  /** Why the domicile row was not used — absent, or several conflicting rows. */
  reason: "absent" | "conflicting" | null;
} {
  const aliases = countryAliases(country);
  const isUs = [...aliases].some((a) => US_COUNTRY_KEYS.has(a) || a === "unitedstates");
  let matchCount = 0;
  if (aliases.size > 0 && !isUs) {
    const matches = [
      ...new Set(
        rows.flatMap((row) => {
          const value = num(row.totalEquityRiskPremium);
          const rowAliases = countryAliases(row.country);
          const hit = [...rowAliases].some((a) => aliases.has(a));
          return hit && value !== null ? [value] : [];
        }),
      ),
    ];
    matchCount = matches.length;
    if (matches.length === 1) {
      return {
        pct: matches[0],
        basis: "domicile",
        country: typeof country === "string" ? country : null,
        reason: null,
      };
    }
  }
  return {
    pct: selectUsEquityRiskPremium(rows),
    // Keyed on isUs, not on alias resolution: an unknown or blank domicile is
    // NOT a domicile match, and labelling it one made its disclosure unreachable.
    basis: isUs ? "domicile" : "us-fallback",
    country: typeof country === "string" ? country : null,
    // More than one DISTINCT premium for the domicile is a vendor conflict, not
    // an absence, and must not be disclosed as "no vendor row".
    reason: isUs ? null : matchCount > 1 ? "conflicting" : "absent",
  };
}
