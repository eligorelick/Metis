/**
 * Which inputs a run took from a fallback source because its primary provider
 * failed (audit 2026-10-22 F-1 and F-13). Both the run-level header line and
 * the fair value's degraded-inputs reason are worded here, from the recorded
 * gaps, so the two cannot disagree about what was substituted.
 *
 * A substitution the run was configured for (`expected`: a keyless plan,
 * THESIS_STATEMENT_SOURCE=edgar) is the run's design, not a fallback, and is
 * never named.
 */

import { riskFreeSourceLabel } from "@/pipeline/riskFreeSeries";
import type { ManifestEntry } from "@/types/core";

/** Reader names of the keyless members that can replace an FMP member. */
const KEYLESS_MEMBER_LABEL: Record<string, string> = {
  profile: "company profile",
  quote: "quote",
  incomeAnnual: "annual income statement",
  incomeQuarterly: "quarterly income statement",
  balanceAnnual: "annual balance sheet",
  balanceQuarterly: "quarterly balance sheet",
  cashflowAnnual: "annual cash flow statement",
  cashflowQuarterly: "quarterly cash flow statement",
  eodPrices: "daily price history",
  spy: "SPY benchmark prices",
  sectorEtf: "sector ETF prices",
  enterpriseValues: "enterprise values",
  marketCapHistory: "market-cap history",
  sharesFloat: "shares float",
};
const KEYLESS_MEMBER_PLURAL = new Set(["enterpriseValues", "eodPrices", "spy", "sectorEtf"]);
const KEYLESS_SOURCE_LABEL: Record<string, string> = { edgar: "from SEC EDGAR", yahoo: "from Yahoo", computed: "computed from filed facts and prices" };

export function listText(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const MEMBER_ORDER = Object.keys(KEYLESS_MEMBER_LABEL);
const SOURCE_ORDER = Object.keys(KEYLESS_SOURCE_LABEL);
const rank = (order: string[], key: string): number => (order.includes(key) ? order.indexOf(key) : order.length);

/**
 * The FMP members the keyless layer served after an FMP failure, grouped by
 * the source that served them. Members and sources are in a fixed order, not
 * gap order: the report keeps the bundle's order and the AI context sorts its
 * manifest by field, and both must print the same sentence.
 */
export function keylessSubstitutions(gaps: readonly ManifestEntry[]): Array<{ source: string; members: string[] }> {
  const bySource = new Map<string, string[]>();
  for (const gap of gaps) {
    const member = gap.field.startsWith("keyless.") ? gap.field.slice("keyless.".length) : "";
    if (KEYLESS_MEMBER_LABEL[member] === undefined || gap.expected === true || gap.severity !== "info" || !gap.reason.startsWith("served by ")) continue;
    const source = gap.reason.slice("served by ".length).split(" ")[0] ?? "";
    const list = bySource.get(source) ?? [];
    if (!list.includes(member)) list.push(member);
    bySource.set(source, list);
  }
  return [...bySource]
    .sort(([a], [b]) => rank(SOURCE_ORDER, a) - rank(SOURCE_ORDER, b) || (a < b ? -1 : a > b ? 1 : 0))
    .map(([source, members]) => ({ source, members: [...members].sort((a, b) => rank(MEMBER_ORDER, a) - rank(MEMBER_ORDER, b)) }));
}

/** "the annual income statement and the annual balance sheet are from SEC EDGAR and the quote is from Yahoo", or null. */
export function keylessSubstitutionText(gaps: readonly ManifestEntry[]): string | null {
  const groups = keylessSubstitutions(gaps).map(({ source, members }) => {
    const subject = listText(members.map((m) => `the ${KEYLESS_MEMBER_LABEL[m]}`));
    const verb = members.length > 1 || KEYLESS_MEMBER_PLURAL.has(members[0]!) ? "are" : "is";
    return `${subject} ${verb} ${KEYLESS_SOURCE_LABEL[source] ?? `from ${source}`}`;
  });
  return groups.length === 0 ? null : listText(groups);
}

/** "the risk-free rate is <source> (observation <date>), not FRED DGS10", or null when the rate is DGS10 or withheld. */
export function riskFreeSubstitutionText(seriesId: string | null, asOf: string | null): string | null {
  if (seriesId === null || seriesId === "fred:DGS10") return null;
  return `the risk-free rate is ${riskFreeSourceLabel(seriesId)} (observation ${asOf ?? "date not reported"}), not FRED DGS10`;
}

/**
 * The risk-free part read back from a run's `riskFree.substitution` gap
 * (riskFreeFallback.ts): its second attempted source is the series that
 * served, and its reason carries the observation date.
 */
function riskFreeFromGaps(gaps: readonly ManifestEntry[]): string | null {
  const gap = gaps.find((g) => g.field === "riskFree.substitution");
  const seriesId = gap?.attemptedSources?.[1];
  if (gap === undefined || seriesId === undefined) return null;
  const date = /\(observation ([^)]+)\)/.exec(gap.reason)?.[1] ?? null;
  return riskFreeSubstitutionText(seriesId, date === "date not reported" ? null : date);
}

/**
 * Audit 2026-10-22 F-1 (owner decision): one run-level header line naming the
 * providers that fell back this run and what replaced them. Null when every
 * input came from its primary provider, or the substitution was configured.
 */
export function providerFallbackNotice(report: { appendix: { missingData: readonly ManifestEntry[] } }): string | null {
  const gaps = report.appendix.missingData;
  const parts: string[] = [];
  const keyless = keylessSubstitutionText(gaps);
  if (keyless !== null) parts.push(`FMP did not serve every member, so ${keyless}`);
  const riskFree = riskFreeFromGaps(gaps);
  if (riskFree !== null) parts.push(riskFree);
  if (parts.length === 0) return null;
  const sentence = parts.join("; ");
  return `Provider fallback · ${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}. A run with these providers healthy can give different figures; each substitution is listed under missing data.`;
}
