/**
 * U.S. Treasury daily par yield curve, 10-year point (audit 2026-10-22 B-4).
 *
 * Server-only. The last source in the risk-free fallback chain, used only when
 * FRED DGS10 (keyed, then fredgraph.csv), FMP's treasury endpoint and the last
 * good cached DGS10 observation are all unavailable. FRED's DGS10 is the
 * Federal Reserve's H.15 copy of this same Treasury par-curve 10-year point, so
 * it is the same rate from its primary publisher, not a proxy.
 *
 * The yearly CSV lists one row per business day, newest first, with a `Date`
 * column (MM/DD/YYYY) and one column per tenor. Columns are found by header
 * name, so an added tenor does not move the 10-year read; any other shape is a
 * disclosed gap, never a guessed number. No key; no identity is sent.
 */

import "server-only";

import type { FetchResult, ManifestEntry } from "@/types/core";
import { fetchWithRedirectPolicy } from "@/providers/http";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface TreasuryConfig {
  fetchImpl?: FetchLike;
  /** Per-attempt timeout. 0 disables. */
  timeoutMs?: number;
  /** Job/request cancellation. */
  signal?: AbortSignal;
}

export interface TreasuryYieldObservation {
  /** YYYY-MM-DD */
  date: string;
  /** Percent, e.g. 4.02 */
  value: number;
}

const BASE = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv";
const DEFAULT_TIMEOUT_MS = 15_000;
export const TREASURY_PAR_CURVE_ENDPOINT = "home.treasury.gov daily Treasury par yield curve rates (10 Yr)";

export function treasuryParCurveUrl(year: number): string {
  return `${BASE}/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
}

function unquote(cell: string): string {
  const t = cell.trim();
  return t.length >= 2 && t.startsWith("\"") && t.endsWith("\"") ? t.slice(1, -1).trim() : t;
}

function isoFromUsDate(raw: string): string | null {
  const parts = raw.split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts.map((p) => p.trim());
    if (y.length !== 4 || m.length < 1 || m.length > 2 || d.length < 1 || d.length > 2) return null;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const ms = Date.parse(`${iso}T00:00:00Z`);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === iso ? iso : null;
  }
  const ms = Date.parse(`${raw}T00:00:00Z`);
  return raw.length === 10 && Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === raw ? raw : null;
}

/**
 * The newest 10-year observation on or before `today` in a par-yield-curve CSV,
 * or null when the body is not that CSV (no `Date` and `10 Yr` header columns).
 */
export function parseTreasuryParCurveCsv(csv: string, today: string): TreasuryYieldObservation | null | "no-rows" {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = (lines[0] ?? "").split(",").map((c) => unquote(c).toLowerCase());
  const dateCol = header.indexOf("date");
  const tenCol = header.findIndex((c) => c === "10 yr" || c === "10 year");
  if (dateCol === -1 || tenCol === -1) return null;
  let best: TreasuryYieldObservation | null = null;
  for (const line of lines.slice(1)) {
    const cells = line.split(",").map(unquote);
    const date = isoFromUsDate(cells[dateCol] ?? "");
    const rawValue = cells[tenCol] ?? "";
    if (date === null || date > today || rawValue === "" || rawValue.toUpperCase() === "N/A") continue;
    const value = Number(rawValue);
    // A 10-year yield outside [-5%, 50%] is a parse fault, not a rate.
    if (!Number.isFinite(value) || value < -5 || value > 50) continue;
    if (best === null || date > best.date) best = { date, value };
  }
  return best ?? "no-rows";
}

function gap(reason: string): ManifestEntry {
  return { field: "riskFree.treasuryParCurve", reason, severity: "warn", attemptedSources: ["treasury"] };
}

async function fetchYear(year: number, config: TreasuryConfig): Promise<{ ok: true; text: string } | { ok: false; failure: string }> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const signal = controller && config.signal ? AbortSignal.any([controller.signal, config.signal]) : controller?.signal ?? config.signal;
    const res = await fetchWithRedirectPolicy(treasuryParCurveUrl(year), { headers: { Accept: "text/csv, */*" }, signal }, config.fetchImpl ?? fetch);
    if (!res.ok) return { ok: false, failure: `HTTP ${res.status}` };
    return { ok: true, text: await res.text() };
  } catch (err) {
    config.signal?.throwIfAborted();
    return { ok: false, failure: `network error: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Latest 10-year par yield on or before `today` (YYYY-MM-DD). In the first days
 * of January the current year's file can still be empty, so the previous
 * year's file is read once when the current one has no row.
 */
export async function latestTenYearParYield(today: string, config: TreasuryConfig = {}): Promise<FetchResult<TreasuryYieldObservation>> {
  const year = Number(today.slice(0, 4));
  if (!Number.isInteger(year)) throw new TypeError(`treasury: invalid date "${today}"`);
  let lastProblem = "no attempt made";
  for (const y of [year, year - 1]) {
    const res = await fetchYear(y, config);
    if (!res.ok) return { ok: false, gap: gap(`U.S. Treasury par yield curve unavailable: ${res.failure}`) };
    const parsed = parseTreasuryParCurveCsv(res.text, today);
    if (parsed === null) return { ok: false, gap: gap("U.S. Treasury par yield curve returned no recognizable CSV (no Date and 10 Yr columns)") };
    if (parsed !== "no-rows") {
      return { ok: true, value: { data: parsed, asOf: parsed.date, source: "treasury", endpoint: TREASURY_PAR_CURVE_ENDPOINT, fetchedAt: new Date().toISOString() } };
    }
    lastProblem = `no 10-year observation on or before ${today} in the ${y} file`;
  }
  return { ok: false, gap: gap(`U.S. Treasury par yield curve: ${lastProblem}`) };
}
