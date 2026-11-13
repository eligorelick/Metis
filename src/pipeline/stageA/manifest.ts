/**
 * Missing-data manifest utilities : every gap is disclosed, never
 * papered over. This module merges gap lists from many sources (provider
 * FetchResults, validation, structural seeds) into one deduped,
 * severity-ordered manifest for the report appendix.
 *
 * Pure — no network, no db.
 */

import type { ManifestEntry } from "@/types/core";

// ---------------------------------------------------------------------------
// Severity ranking
// ---------------------------------------------------------------------------

const RANK: Record<ManifestEntry["severity"], number> = {
  info: 0,
  warn: 1,
  critical: 2,
};

/** Numeric rank for a severity: info=0 < warn=1 < critical=2. */
export function severityRank(severity: ManifestEntry["severity"]): number {
  return RANK[severity];
}

// ---------------------------------------------------------------------------
// mergeManifest
// ---------------------------------------------------------------------------

/** Accepted inputs: single entries, arrays, or nothing (null/undefined skipped). */
export type ManifestSource = ManifestEntry | ManifestEntry[] | null | undefined;

function dedupeSources(
  a: string[] | undefined,
  b: string[] | undefined,
): string[] | undefined {
  if (a === undefined && b === undefined) return undefined;
  const out: string[] = [];
  for (const s of [...(a ?? []), ...(b ?? [])]) {
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Merge any number of gap sources into one manifest:
 *  - deduped by `field`, keeping the HIGHEST severity entry (its reason wins);
 *  - `attemptedSources` are unioned across duplicates (order-preserving);
 *  - deterministic output: severity DESC, then field ASC.
 *
 * Input entries are never mutated.
 */
export function mergeManifest(...sources: ManifestSource[]): ManifestEntry[] {
  const byField = new Map<string, ManifestEntry>();

  for (const source of sources) {
    if (source === null || source === undefined) continue;
    const entries = Array.isArray(source) ? source : [source];
    for (const entry of entries) {
      const current = byField.get(entry.field);
      if (current === undefined) {
        byField.set(entry.field, { ...entry });
        continue;
      }
      const mergedSources = dedupeSources(current.attemptedSources, entry.attemptedSources);
      if (severityRank(entry.severity) > severityRank(current.severity)) {
        const winner: ManifestEntry = { ...entry };
        if (mergedSources !== undefined) winner.attemptedSources = mergedSources;
        byField.set(entry.field, winner);
      } else if (mergedSources !== undefined) {
        current.attemptedSources = mergedSources;
      }
    }
  }

  return [...byField.values()].sort((a, b) => {
    const bySeverity = severityRank(b.severity) - severityRank(a.severity);
    if (bySeverity !== 0) return bySeverity;
    return a.field < b.field ? -1 : a.field > b.field ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// renderManifestSummary
// ---------------------------------------------------------------------------

export interface ManifestSummary {
  total: number;
  bySeverity: { critical: number; warn: number; info: number };
  /** One-line human-readable summary for the report header/appendix. */
  line: string;
}

/** Counts by severity + a rendered one-liner. */
export function renderManifestSummary(entries: readonly ManifestEntry[]): ManifestSummary {
  const bySeverity = { critical: 0, warn: 0, info: 0 };
  for (const e of entries) bySeverity[e.severity]++;
  const line =
    `${entries.length} data gap(s): ${bySeverity.critical} critical, ` +
    `${bySeverity.warn} warning(s), ${bySeverity.info} informational`;
  return { total: entries.length, bySeverity, line };
}

// ---------------------------------------------------------------------------
// Typed gap causes (P10, P11, D-229)
// ---------------------------------------------------------------------------

/**
 * The entry without its typed cause. A writer that rewrites an entry's sentence
 * into one that no longer states the recorded cause uses this, so a code never
 * sits beside a sentence it does not describe (as D-226 rules for conflicts).
 * The result has no code: it is unresolved, never given another one.
 */
export function withoutGapCause<T extends ManifestEntry>(entry: T): T {
  if (!("cause" in entry)) return entry;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cause, ...rest } = entry;
  return rest as T;
}

/** Whether a plain JSON object has the shape of a `ManifestEntry` (string `field` and `reason`, a known `severity`). */
export const isManifestEntryShaped = (value: Record<string, unknown>): boolean =>
  typeof value.field === "string" && typeof value.reason === "string" &&
  (value.severity === "info" || value.severity === "warn" || value.severity === "critical");

/**
 * A copy of `value` in which no missing-data entry carries a typed cause; every
 * other byte, key order included, is kept, and parts without one are returned
 * as they are (the input is never mutated). Used where a code must not travel
 * (D-229): the Stage C payload boundary, run input snapshots, the request
 * schema and the dossier's report identity. Only objects shaped like a
 * `ManifestEntry` (string `field` and `reason`, a known `severity`) lose `cause`,
 * so a field conflict's `cause` is never touched.
 */
export function withoutGapCauses<T>(value: T): T {
  const seen = new Map<object, unknown>();
  const strip = (node: unknown): unknown => {
    if (node === null || typeof node !== "object") return node;
    if (seen.has(node)) return seen.get(node);
    // A shared (or, never expected, cyclic) part is visited once.
    seen.set(node, node);
    if (Array.isArray(node)) {
      let changed = false;
      const out = node.map((item) => {
        const next = strip(item);
        if (next !== item) changed = true;
        return next;
      });
      const result = changed ? out : node;
      seen.set(node, result);
      return result;
    }
    const record = node as Record<string, unknown>;
    // Only plain data objects are copied; class instances (Map, Date, ...) are kept as they are.
    if (Object.getPrototypeOf(record) !== Object.prototype && Object.getPrototypeOf(record) !== null) return node;
    const drop = "cause" in record && isManifestEntryShaped(record);
    let changed = drop;
    const entries: [string, unknown][] = [];
    for (const [key, child] of Object.entries(record)) {
      if (drop && key === "cause") continue;
      const next = strip(child);
      if (next !== child) changed = true;
      entries.push([key, next]);
    }
    const result = changed ? Object.fromEntries(entries) : node;
    seen.set(node, result);
    return result;
  };
  return strip(value) as T;
}
