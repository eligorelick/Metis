/**
 * The risk-free rate's last two sources (audit 2026-10-22 B-4).
 *
 * Owner order: FRED DGS10 (keyed API, then fredgraph.csv) → FMP treasury
 * year10 → the last good cached DGS10 observation, if it is at most ten
 * business days old → the U.S. Treasury daily par yield curve 10-year point.
 * The first two are read where they always were (`riskFreePct` in compute.ts);
 * this module is consulted only when both of them have no value, so a run with
 * a healthy FRED never reaches it and its figures do not move.
 *
 * Every value it returns carries its own series id and observation date, which
 * the WACC line prints; when both sources fail the gap names both reasons and
 * the WACC is withheld exactly as before.
 */

import type { FetchResult, ManifestEntry } from "@/types/core";
import { CACHED_DGS10_SERIES_ID, riskFreeSourceLabel, TREASURY_PAR_CURVE_SERIES_ID } from "@/pipeline/riskFreeSeries";
import type { FredObservation } from "@/providers/fred";
import type { FmpPayload, FmpTreasuryRatesRow } from "@/providers/fmp";
import { latestTenYearParYield, TREASURY_PAR_CURVE_ENDPOINT, type TreasuryConfig, type TreasuryYieldObservation } from "@/providers/treasury";

/** Owner rule: a cached DGS10 observation older than this many business days is not used. */
export const CACHED_DGS10_MAX_BUSINESS_DAYS = 10;
export const CACHED_DGS10_ENDPOINT = "api_cache series/DGS10 (last good observation)";

export interface RiskFreeFallbackObservation {
  /** YYYY-MM-DD observation date. */
  date: string;
  /** Percent, e.g. 4.02 */
  value: number;
  /** CACHED_DGS10_SERIES_ID or TREASURY_PAR_CURVE_SERIES_ID */
  seriesId: string;
}

/** One cached FRED DGS10 row, as `listCachedBodies` returns it. */
export interface CachedDgs10Row {
  params: string;
  data: { obs?: FredObservation[] };
  fetchedAt: string;
}

export interface RiskFreeFallbackDeps {
  /** Every cached `fred` `series/DGS10` row (production: `listCachedBodies`). */
  cachedDgs10Rows: () => Promise<CachedDgs10Row[]>;
  /** The Treasury par-curve read (production: `latestTenYearParYield`). */
  treasuryParYield?: (today: string, config: TreasuryConfig) => Promise<FetchResult<TreasuryYieldObservation>>;
  treasury?: TreasuryConfig;
}

const DAY_MS = 86_400_000;

/**
 * Whether the first two sources gave a rate, read exactly as `riskFreePct`
 * (compute.ts) reads them: any finite DGS10 observation, else a finite FMP
 * treasury `year10` on the newest row. The fallback runs only when this is false.
 */
export function primaryRiskFreeAvailable(
  dgs10: FetchResult<FredObservation[]> | undefined,
  treasury: FetchResult<FmpPayload<FmpTreasuryRatesRow>>,
): boolean {
  if (dgs10?.ok && dgs10.value.data.some((o) => Number.isFinite(o.value))) return true;
  const year10 = treasury.ok ? treasury.value.data.rows[0]?.year10 : undefined;
  return typeof year10 === "number" && Number.isFinite(year10);
}

/**
 * Weekdays after `from` up to and including `to` (both YYYY-MM-DD): Friday to
 * the next Monday is one business day. Federal holidays are not removed, so the
 * count can only overstate the age and the rule only errs toward refusing.
 */
export function businessDaysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number.POSITIVE_INFINITY;
  let count = 0;
  for (let t = start + DAY_MS; t <= end; t += DAY_MS) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

function unitsOf(params: string): string | null {
  try {
    const parsed = JSON.parse(params) as { units?: unknown };
    return typeof parsed.units === "string" ? parsed.units : null;
  } catch {
    return null;
  }
}

/** The newest finite DGS10 observation on or before `today` across every cached row in percent ("lin") units. */
export function lastCachedDgs10(rows: CachedDgs10Row[], today: string): { obs: FredObservation; fetchedAt: string } | null {
  let best: { obs: FredObservation; fetchedAt: string } | null = null;
  for (const row of rows) {
    if (unitsOf(row.params) !== "lin" || !Array.isArray(row.data.obs)) continue;
    for (const obs of row.data.obs) {
      if (typeof obs?.date !== "string" || !Number.isFinite(obs.value) || obs.date > today) continue;
      if (best === null || obs.date > best.obs.date || (obs.date === best.obs.date && row.fetchedAt > best.fetchedAt)) {
        best = { obs, fetchedAt: row.fetchedAt };
      }
    }
  }
  return best;
}

export async function resolveRiskFreeFallback(
  today: string,
  deps: RiskFreeFallbackDeps,
): Promise<FetchResult<RiskFreeFallbackObservation>> {
  let cachedProblem: string;
  const cached = lastCachedDgs10(await deps.cachedDgs10Rows(), today);
  if (cached === null) {
    cachedProblem = "no cached DGS10 observation";
  } else {
    const age = businessDaysBetween(cached.obs.date, today);
    if (age <= CACHED_DGS10_MAX_BUSINESS_DAYS) {
      return {
        ok: true,
        value: {
          data: { date: cached.obs.date, value: cached.obs.value, seriesId: CACHED_DGS10_SERIES_ID },
          asOf: cached.obs.date,
          source: "fred",
          endpoint: CACHED_DGS10_ENDPOINT,
          fetchedAt: cached.fetchedAt,
          stale: true,
        },
      };
    }
    cachedProblem = `last cached DGS10 observation (${cached.obs.date}) is ${age} business days old, beyond the ${CACHED_DGS10_MAX_BUSINESS_DAYS}-business-day limit`;
  }
  const read = deps.treasuryParYield ?? latestTenYearParYield;
  const treasury = await read(today, deps.treasury ?? {});
  if (treasury.ok) {
    const { date, value } = treasury.value.data;
    return {
      ok: true,
      value: {
        ...treasury.value,
        data: { date, value, seriesId: TREASURY_PAR_CURVE_SERIES_ID },
        endpoint: TREASURY_PAR_CURVE_ENDPOINT,
      },
    };
  }
  const gap: ManifestEntry = {
    field: "riskFree.fallback",
    reason: `risk-free fallback unavailable: ${cachedProblem}; ${treasury.gap.reason}`,
    severity: "warn",
    attemptedSources: ["fred (api_cache)", "treasury"],
  };
  return { ok: false, gap };
}

/**
 * The disclosure that the risk-free rate did not come from FRED DGS10: which
 * source stood in, its observation date, and why. Null when DGS10 served, or
 * when no source served (the provider gaps already say the WACC is withheld).
 * Never `expected`: a FRED outage is an incident on every plan.
 */
export function riskFreeSubstitutionGap(
  dgs10: FetchResult<FredObservation[]> | undefined,
  treasury: FetchResult<FmpPayload<FmpTreasuryRatesRow>>,
  fallback: FetchResult<RiskFreeFallbackObservation> | undefined,
): ManifestEntry | null {
  if (dgs10?.ok && dgs10.value.data.some((o) => Number.isFinite(o.value))) return null;
  const row = treasury.ok ? treasury.value.data.rows[0] : undefined;
  let seriesId: string;
  let date: string | null;
  let why = "FRED DGS10 had no observation";
  if (typeof row?.year10 === "number" && Number.isFinite(row.year10)) {
    seriesId = "fmp:treasury-rates.year10";
    date = typeof row.date === "string" ? row.date.slice(0, 10) : null;
  } else if (fallback?.ok) {
    seriesId = fallback.value.data.seriesId;
    date = fallback.value.data.date;
    why += " and FMP treasury rates had no 10-year value";
  } else {
    return null;
  }
  return {
    field: "riskFree.substitution",
    reason: `risk-free rate served by ${riskFreeSourceLabel(seriesId)} (observation ${date ?? "date not reported"}) because ${why}`,
    severity: "info",
    attemptedSources: ["fred", seriesId],
  };
}
