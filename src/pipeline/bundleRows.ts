/**
 * Stage B bundle row helpers, split out of compute.ts: unwrap a bundle member (a FetchResult) to its
 * admitted rows, read a finite number, string or ISO day, and match rows across statements by
 * fiscal-period date. Pure; every Stage B module reads its rows through these.
 */

import { admittedStatementRow } from "@/providers/fmp";
import type { FetchResult, Sourced } from "@/types/core";
import type { FmpFetch } from "@/pipeline/types";
import type { FmpRawRow } from "@/providers/fmp";

// ---------------------------------------------------------------------------
// Small unwrap helpers — every bundle member is a FetchResult<...>
// ---------------------------------------------------------------------------

export function rowsOf<TRow extends FmpRawRow>(f: FmpFetch<TRow>): TRow[] {
  if (!f.ok) return [];
  return f.value.data.rows.map(admittedStatementRow);
}

/** First row of a single-row FMP payload (profile/quote), or null. */
export function firstRow<TRow extends FmpRawRow>(f: FmpFetch<TRow>): TRow | null {
  return rowsOf(f)[0] ?? null;
}

export function sourcedOf<T>(f: FetchResult<T>): Sourced<T> | null {
  return f.ok ? f.value : null;
}

export function valueOf<T>(f: FetchResult<T>): T | null {
  return f.ok ? f.value.data : null;
}

export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function isoDay(v: unknown): string | null {
  const s = str(v);
  return s ? s.slice(0, 10) : null;
}

export const SPREAD_DAYS = 24 * 3600 * 1000;

export function matchByDate<T>(byDate: Map<string, T>, iso: string): T | null {
  const exact = byDate.get(iso);
  if (exact !== undefined) return exact;
  // Tolerate small fiscal-date drift across statements (±5 days).
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return null;
  let best: T | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const [k, v] of byDate) {
    const t = Date.parse(k);
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - target) / SPREAD_DAYS;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = v;
    }
  }
  return bestDelta <= 5 ? best : null;
}
