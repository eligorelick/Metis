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
import type { DataBundle } from "./types";
import type { ForeignValuationBasis } from "./foreignCurrency";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { conceptFactsSchema, CORE_FACT_FORMS, parseFactPoints } from "@/edgar/xbrl";
import { REVENUE_TAGS } from "@/edgar/tagSynonyms";

export const ANALYST_ESTIMATE_PROVIDER_CONVENTION: string | null = null;

function iso(value: unknown): string | null {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/**
 * The row's own ISO currency only, never a provider convention. A stock-peers
 * row reads its currency this way (AI-301): a convention set for estimates must
 * not turn a peer cap into money.
 */
export function ownRowCurrency(row: object | null | undefined): string | null {
  const fields = (row ?? {}) as { reportedCurrency?: unknown; currency?: unknown };
  return establishedIsoCode(fields.reportedCurrency) ?? establishedIsoCode(fields.currency);
}

/**
 * A raw currency code taken as stated: exactly three uppercase letters, else null.
 * Never uppercased: "GBp" (pence), "ZAc" and "ILa" are minor units, and uppercasing
 * one would register a cap 100 times too large as major-unit money (a peer cap).
 */
export function establishedIsoCode(value: unknown): string | null {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value.trim()) ? value.trim() : null;
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

/** D-188: calibration establishes total revenue only, never EPS or targets. */
export function calibratedRevenueCurrency(bundle: DataBundle, issuer: InheritedIssuerCurrency, foreign: ForeignValuationBasis | null): InheritedIssuerCurrency {
  const refuse = (test: string): InheritedIssuerCurrency => ({ code: null, basis: `revenue calibration refused: ${test}` });
  if (issuer.code !== null || foreign === null) return refuse("requires withheld inheritance and an admitted foreign valuation basis");
  const reporting = foreign.fx.reportingCurrency, rate = foreign.fx.usdPerReportingUnit;
  const cutoff = bundle.builtAt.slice(0, 10);
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const observed = bundle.edgar?.companyFacts?.ok ? bundle.edgar.companyFacts.value.fetchedAt : null;
  if (!facts || !observed || !Number.isFinite(Date.parse(observed)) || Date.parse(observed) > Date.parse(bundle.builtAt)) return refuse("filed annual revenue evidence unavailable at cutoff");
  const filed = new Map<string, number>();
  for (const [namespace, tags] of [["us-gaap", REVENUE_TAGS], ["ifrs-full", ["Revenue", "RevenueFromContractsWithCustomers"]]] as const) {
    for (const tag of tags) {
      const parsed = conceptFactsSchema.safeParse(facts.facts[namespace]?.[tag]);
      if (!parsed.success) continue;
      const points = parseFactPoints(parsed.data.units[reporting] ?? []).filter(p => p.start && CORE_FACT_FORMS.has(p.form) &&
        p.end <= cutoff && p.filed <= cutoff && Number.isFinite(Date.parse(p.filed)) && p.val > 0 &&
        (Date.parse(p.end) - Date.parse(p.start)) / 86400000 >= 350 && (Date.parse(p.end) - Date.parse(p.start)) / 86400000 <= 380);
      for (const end of new Set(points.map(p => p.end))) {
        if (filed.has(end)) continue; // Same ordered total-revenue synonyms as statements.
        const latest = points.filter(p => p.end === end).sort((a, b) => b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn));
        if (latest.some(p => p.filed === latest[0]!.filed && p.val !== latest[0]!.val)) return refuse(`contradictory filed annual revenue for ${end}`);
        filed.set(end, latest[0]!.val);
      }
    }
  }
  const rows = bundle.analystEstimates.ok ? bundle.analystEstimates.value.data.rows : [];
  const overlap = rows.filter(r => estimateCurrency(r) === null && typeof r.date === "string" && r.date <= cutoff && filed.has(r.date) &&
    typeof r.revenueAvg === "number" && Number.isFinite(r.revenueAvg) && r.revenueAvg > 0)
    .map(r => ({ end: r.date!, estimate: r.revenueAvg!, filed: filed.get(r.date!)! })).sort((a, b) => b.end.localeCompare(a.end));
  if (!overlap.length) return refuse("no overlapping estimate and filed annual revenue on or before cutoff");
  const latest = overlap[0]!;
  if (Math.abs(latest.estimate / latest.filed - 1) > 0.03) return refuse(`latest overlap ${latest.end} estimate ${latest.estimate} versus filed ${latest.filed} ${reporting} fails 3% tolerance`);
  if (!Number.isFinite(rate) || rate <= 0 || Math.abs(1 / rate - 1) <= 0.06 || Math.abs(latest.estimate / (latest.filed * rate) - 1) <= 0.06) return refuse(`listing-currency reading for ${latest.end} is not rejected beyond 6% (FX too close to 1 or ambiguous)`);
  const recentEnds = [...filed.keys()].sort().reverse().slice(0, 3);
  const contradiction = overlap.find(p => recentEnds.includes(p.end) && Math.abs(p.estimate / p.filed - 1) > 0.10);
  if (contradiction) return refuse(`overlapping year ${contradiction.end} contradicts reporting currency beyond 10%`);
  return { code: reporting, basis: `revenue totals admitted by calibration: ${latest.end} estimate ${latest.estimate}, filed revenue ${latest.filed} ${reporting}, within 3% tolerance; listing-currency reading rejected beyond 6% at ${rate} USD/${reporting}; every other overlap in the last three filed fiscal years agrees within 10%. EPS, per-share rows and price targets remain withheld without their own currency` };
}
