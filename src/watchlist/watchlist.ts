/**
 * Watchlist data layer — server-only (sidebar watchlist with
 * add/remove; last report date, grade chips, price snapshot, next earnings).
 *
 * Two responsibilities:
 *   1. Raw persistence over the `watchlist` table (add / remove / list). Symbols
 *      are normalized to UPPERCASE on write so the primary key is canonical and
 *      add/remove are idempotent.
 *   2. Enrichment: {@link getWatchlistView} joins each watched symbol against
 *      (a) the latest `done` report (grade strip + as-of + verification rate),
 *      (b) an eligible cached FMP quote (price + change%), and
 *      (c) the next future earnings date from cached FMP earnings. Every lookup
 *      degrades to a `null` field plus a `gaps[]` entry rather than throwing.
 *      Navigation never fetches market data or loads synthetic quote fixtures.
 *
 * Server-only: imports @/db and provider clients. NEVER import into a client
 * component — the Sidebar server component calls this and passes plain data down
 * as props to the small client controls. (`import "server-only"` matches the
 * rest of the data layer; the plain-node test runner stubs it via vi.mock.)
 */

import "server-only";

import { cache } from "react";

import { asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { watchlist, type WatchlistRow } from "@/db/schema";
import { readCachedResponse } from "@/cache/apiCache";
import { createFmpClient, type CachedFetchFn, type FmpClient } from "@/providers/fmp";
import { isReservedFixtureSymbol } from "@/providers/reservedSymbols";
import { getLatestDoneReport } from "@/report/query";
import { listRunRefsForSymbol, type RunRef } from "@/report/history";
import { gradeDisplayLabel, gradeForDisplay, hasLimitedEvidence, MIN_HEADLINE_EVIDENCE, restsOnSingleSignal } from "@/report/assessment";
import {
  gradeSurfaceEntries,
  type GradeSurfaceKey,
} from "@/report/surfaceManifest";
import type { Report } from "@/report/schema";
import { canonicalEntitySymbol, normalizeSymbol as normalizeTickerSymbol } from "@/symbol";
import type { Grade } from "@/types/core";

/* ------------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------------ */

export type WatchlistEntry = WatchlistRow;

/** Display grades from the verdict strip; null means the section was not assessed. */
export interface WatchlistGrades {
  fundamentals: Grade | null;
  valuation: Grade | null;
  technicals: Grade | null;
  balanceSheet?: Grade | null;
  quality: Grade | null;
  leadership: Grade | null;
  moat: Grade | null;
}

export type WatchlistGradeLabels = Partial<Record<GradeSurfaceKey, string>>;

/**
 * One enriched sidebar row. Every enrichment field is nullable — a missing
 * quote / report / earnings date degrades the field to null and records the
 * reason in `gaps` (never throws).
 */
export interface WatchlistRowView {
  symbol: string;
  companyName?: string;
  price?: number | null;
  changePct?: number | null;
  /** as-of date of the price snapshot (ISO), when available. */
  asOf?: string | null;
  /** True when the saved quote is beyond the provider's freshness TTL. */
  priceStale?: boolean;
  /** Verdict grade strip from the latest done report, or null when none. */
  grades?: WatchlistGrades | null;
  /** Presentation-only explanations from the saved report's evidence map. */
  gradeLabels?: WatchlistGradeLabels;
  /** ISO createdAt of the latest done report, or null. */
  lastReportAt?: string | null;
  /** Verification rate of the latest done report (0..1), or null. */
  verificationRate?: number | null;
  /** Next future earnings date (ISO YYYY-MM-DD), or null. */
  nextEarnings?: string | null;
  /** Every saved run for the symbol (newest-first), for the sidebar disclosure. */
  runs: RunRef[];
  /** Degradation notes — one line per field that could not be resolved. */
  gaps: string[];
}

/* ------------------------------------------------------------------------ *
 * Raw persistence
 * ------------------------------------------------------------------------ */

/** Normalize a user-supplied ticker to the canonical stored form. */
export function normalizeSymbol(symbol: string): string {
  const normalized = normalizeTickerSymbol(symbol);
  if (normalized === null) throw new Error("watchlist symbol is invalid");
  return normalized;
}

/**
 * Add a symbol to the watchlist (idempotent — re-adding keeps the original
 * addedAt). Returns the normalized symbol that was stored.
 */
export function addToWatchlist(symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  const canonical = canonicalEntitySymbol(normalized);
  const db = getDb();
  // `normalizeSymbol` only uppercases, so BRK.B and BRK-B used to create two
  // rows for one company — and since every report and run read folds that
  // share-class alias, both rows resolved to the same report and the sidebar
  // listed the company twice. Keep the spelling already stored (provider
  // lookups use it) and never add a second row for the same entity.
  if (canonical !== null) {
    const existing = db
      .select({ symbol: watchlist.symbol })
      .from(watchlist)
      .where(sql`upper(replace(${watchlist.symbol}, '-', '.')) = ${canonical}`)
      .get();
    if (existing !== undefined) return existing.symbol;
  }
  db
    .insert(watchlist)
    .values({ symbol: normalized, addedAt: new Date().toISOString() })
    .onConflictDoNothing({ target: watchlist.symbol })
    .run();
  return normalized;
}

/** Remove a symbol from the watchlist (idempotent — no-op when absent). */
export function removeFromWatchlist(symbol: string): void {
  const normalized = normalizeSymbol(symbol);
  const canonical = canonicalEntitySymbol(normalized);
  // Remove by entity, so an entry added as BRK.B is removable as BRK-B.
  getDb()
    .delete(watchlist)
    .where(
      canonical === null
        ? eq(watchlist.symbol, normalized)
        : sql`upper(replace(${watchlist.symbol}, '-', '.')) = ${canonical}`,
    )
    .run();
}

/** Raw watchlist rows, oldest-added first. */
export function listWatchlist(): WatchlistEntry[] {
  return getDb().select().from(watchlist).orderBy(asc(watchlist.addedAt)).all();
}

/* ------------------------------------------------------------------------ *
 * Enrichment
 * ------------------------------------------------------------------------ */

/**
 * Options for {@link getWatchlistView} — the FMP client is injectable for tests.
 *
 * The view is wrapped in React's `cache` so the sidebar and the home panel,
 * which render in parallel in one request, share one set of durable reads.
 * Outside a server render `cache` is a pass-through, so tests see plain calls.
 */
export interface WatchlistViewOptions {
  /** Explicit enrichment client for refresh callers/tests. Default navigation only reads the DB cache. */
  fmp?: FmpClient;
  /** Clock override (tests) — used to compute the earnings "from" window. */
  now?: () => Date;
}

/**
 * Build the enriched sidebar view for every watched symbol. Runs the three
 * enrichments per symbol concurrently; a failure in any one degrades that field
 * to null + a gap note and never rejects the whole view.
 *
 * Missing or ineligible cached responses become gaps; the report join still
 * works from the local DB, independently of provider credentials.
 */
export const getWatchlistView = cache(async function getWatchlistView(
  options: WatchlistViewOptions = {},
): Promise<WatchlistRowView[]> {
  const entries = listWatchlist();
  const now = options.now ?? (() => new Date());
  const fmp = options.fmp ?? defaultFmpClient(now);

  return Promise.all(entries.map((entry) => enrichSymbol(entry.symbol, fmp, now, options.fmp === undefined)));
});

/**
 * Reuse FMP's retrieval schema/identity/timestamp checks with a read-only cache
 * bridge. The loader is deliberately inaccessible here: navigation never
 * refreshes missing, stale or invalid rows and cannot clobber pipeline inputs.
 */
function defaultFmpClient(now: () => Date): FmpClient {
  const maxStaleSeconds = 7 * 86_400;
  const cachedFetch: CachedFetchFn = async <T>(key: string, ttlMs: number) => {
    const ttlSeconds = Math.max(0, Math.floor(ttlMs / 1000));
    const sourced = readCachedResponse<T>({
      provider: "fmp", endpoint: key, params: {}, ttlSeconds, maxStaleSeconds, now,
      // The live loader admits only successful exchanges. Reject poisoned legacy
      // envelopes here; FmpClient then validates the original provider body.
      validateBody: (value) => {
        if (typeof value !== "object" || value === null || !("body" in value) || !("status" in value) || !("fetchedAt" in value)) return "invalid provider exchange";
        const { status, fetchedAt } = value;
        const age = typeof fetchedAt === "string" ? (now().getTime() - Date.parse(fetchedAt)) / 1000 : NaN;
        return typeof status === "number" && Number.isInteger(status) && status >= 200 && status < 300 && Number.isFinite(age) && age >= 0 && age <= ttlSeconds + maxStaleSeconds
          ? null : "invalid provider exchange metadata";
      },
    });
    if (sourced === null) throw new Error("no eligible cached response; refresh through a research run");
    // Never let a newer cache wrapper relabel an older exchange as fresh.
    const exchangeFetchedAt = (sourced.data as { fetchedAt: string }).fetchedAt;
    const fetchedAt = Date.parse(exchangeFetchedAt) < Date.parse(sourced.fetchedAt)
      ? exchangeFetchedAt : sourced.fetchedAt;
    const stale = sourced.stale === true || (now().getTime() - Date.parse(fetchedAt)) / 1000 > ttlSeconds;
    return { value: sourced.data, fetchedAt,
      ...(stale ? { stale: true } : {}),
      ...(sourced.staleReason ? { staleReason: sourced.staleReason } : {}),
    };
  };
  return createFmpClient({
    // A noncredential selects the cached-response parser without loading keys
    // or fixtures. No request can use it: this bridge never calls the loader.
    apiKey: "watchlist-cache-only",
    cachedFetch,
    now,
  });
}

async function enrichSymbol(
  symbol: string,
  fmp: FmpClient,
  now: () => Date,
  cacheOnly: boolean,
): Promise<WatchlistRowView> {
  const gaps: string[] = [];

  const [priceData, report, nextEarnings] = await Promise.all([
    loadPrice(symbol, fmp, gaps, cacheOnly),
    loadReport(symbol, gaps),
    loadNextEarnings(symbol, fmp, now, gaps, cacheOnly),
  ]);

  const runs = loadRuns(symbol, gaps);

  return {
    symbol,
    ...(priceData.companyName !== undefined ? { companyName: priceData.companyName } : {}),
    ...(report.companyName !== undefined && priceData.companyName === undefined
      ? { companyName: report.companyName }
      : {}),
    price: priceData.price,
    changePct: priceData.changePct,
    asOf: priceData.asOf,
    priceStale: priceData.stale === true,
    grades: report.grades,
    gradeLabels: report.gradeLabels,
    lastReportAt: report.lastReportAt,
    verificationRate: report.verificationRate,
    nextEarnings,
    runs,
    gaps,
  };
}

/** All saved run refs for the symbol (newest-first); degrades to [] + a note. */
function loadRuns(symbol: string, gaps: string[]): RunRef[] {
  try {
    return listRunRefsForSymbol(symbol);
  } catch (err) {
    gaps.push(`runs: ${errText(err)}`);
    return [];
  }
}

interface PriceEnrichment {
  price: number | null;
  changePct: number | null;
  asOf: string | null;
  companyName?: string;
  stale?: boolean;
}

/** FMP quote → price + change%; any gap/exception degrades to nulls + note. */
async function loadPrice(
  symbol: string,
  fmp: FmpClient,
  gaps: string[],
  cacheOnly: boolean,
): Promise<PriceEnrichment> {
  try {
    if (cacheOnly && isReservedFixtureSymbol(symbol)) throw new Error("no cached market quote for a synthetic fixture symbol");
    const result = await fmp.quote(symbol);
    if (!result.ok) {
      gaps.push(`price: ${result.gap.reason}`);
      return { price: null, changePct: null, asOf: null };
    }
    const row = result.value.data.rows[0];
    if (row === undefined) {
      gaps.push("price: quote returned no rows");
      return { price: null, changePct: null, asOf: null };
    }
    const price = typeof row.price === "number" ? row.price : null;
    const changePct =
      typeof row.changePercentage === "number" ? row.changePercentage : null;
    if (price === null) gaps.push("price: quote row has no price");
    return {
      price,
      changePct,
      asOf: result.value.asOf,
      stale: result.value.stale === true,
      ...(typeof row.name === "string" && row.name.length > 0
        ? { companyName: row.name }
        : {}),
    };
  } catch (err) {
    gaps.push(`price: ${errText(err)}`);
    return { price: null, changePct: null, asOf: null };
  }
}

interface ReportEnrichment {
  grades: WatchlistGrades | null;
  lastReportAt: string | null;
  verificationRate: number | null;
  companyName?: string;
  gradeLabels?: WatchlistGradeLabels;
}

/** Latest done report → grade strip + as-of + verification rate. */
function loadReport(symbol: string, gaps: string[]): ReportEnrichment {
  try {
    const latest = getLatestDoneReport(symbol);
    if (latest === null) {
      return { grades: null, lastReportAt: null, verificationRate: null };
    }
    const grades = latest.report ? extractGrades(latest.report) : null;
    if (latest.report === null) {
      gaps.push("report: stored JSON unreadable — grades unavailable");
    }
    return {
      grades,
      ...(latest.report ? { gradeLabels: extractGradeLabels(latest.report) } : {}),
      lastReportAt: latest.createdAt,
      verificationRate: latest.verificationRate,
      ...(latest.report?.meta.companyName
        ? { companyName: latest.report.meta.companyName }
        : {}),
    };
  } catch (err) {
    gaps.push(`report: ${errText(err)}`);
    return { grades: null, lastReportAt: null, verificationRate: null };
  }
}

/** Pull the present section grades out of a validated report's grade strip. */
function extractGrades(report: Report): WatchlistGrades {
  const grades: Partial<Record<GradeSurfaceKey, Grade | null>> = {};
  for (const { descriptor, block } of gradeSurfaceEntries(report.verdict.gradeStrip)) {
    grades[descriptor.key] = gradeForDisplay(block);
  }
  return grades as WatchlistGrades;
}

function extractGradeLabels(report: Report): WatchlistGradeLabels {
  const labels: WatchlistGradeLabels = {};
  for (const { descriptor, block } of gradeSurfaceEntries(report.verdict.gradeStrip)) {
    const aspect = report.scores?.aspects[descriptor.key];
    const label = gradeDisplayLabel(block, aspect);
    labels[descriptor.key] = gradeForDisplay(block) === null && aspect && hasLimitedEvidence(aspect)
      ? `${label}; ${restsOnSingleSignal(aspect) && aspect.dataCompleteness >= MIN_HEADLINE_EVIDENCE ? "two signals" : `${Math.round(MIN_HEADLINE_EVIDENCE * 100)}% evidence`} required for a letter grade`
      : label;
  }
  return labels;
}

/**
 * Next future earnings date from FMP `earnings` (past + future rows; future
 * rows carry epsActual=null). We pick the earliest row dated on/after today.
 * Any gap/exception degrades to null + a note.
 */
async function loadNextEarnings(
  symbol: string,
  fmp: FmpClient,
  now: () => Date,
  gaps: string[],
  cacheOnly: boolean,
): Promise<string | null> {
  try {
    if (cacheOnly && isReservedFixtureSymbol(symbol)) throw new Error("no cached earnings for a synthetic fixture symbol");
    const result = await fmp.earnings(symbol);
    if (!result.ok) {
      gaps.push(`earnings: ${result.gap.reason}`);
      return null;
    }
    const todayIso = now().toISOString().slice(0, 10);
    let next: string | null = null;
    for (const row of result.value.data.rows) {
      const date = typeof row.date === "string" ? row.date.slice(0, 10) : null;
      if (date === null || date.length < 10) continue;
      if (date < todayIso) continue;
      if (next === null || date < next) next = date;
    }
    if (next === null) gaps.push("earnings: no future earnings date found");
    return next;
  } catch (err) {
    gaps.push(`earnings: ${errText(err)}`);
    return null;
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
