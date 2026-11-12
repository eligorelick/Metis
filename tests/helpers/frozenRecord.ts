/**
 * Current-value frozen records (P27 change control).
 *
 * A frozen record is today's output of a deterministic, provider-free fixture,
 * written as structured JSON leaves so a reviewer can diff it. A test rebuilds
 * the output and requires exact equality, leaf by leaf and in key order, with
 * the committed record; a mismatch names every differing leaf.
 *
 * A record changes only through the deliberate refresh in
 * `scripts/freeze-refresh.mjs` (`npm run freeze:refresh`). That script sets
 * the `FROZEN_RECORD_*` variables below for one test file; no normal test run
 * sets them. A refresh must name a decision, a reason and the leaf-path scope
 * it expects to change; it is refused when any other leaf moved, and it
 * appends {date, target, decision, reason, scope, before/after hash, changed
 * paths} to `tests/fixtures/frozen/refresh-log.json`. The log is append-only
 * and its last entry per target must hash to the committed record, so a hand
 * edit of a record, or a wholesale re-record outside the protocol, fails the
 * suite.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect } from "vitest";

export type FrozenJson = null | boolean | number | string | FrozenJson[] | { [key: string]: FrozenJson };

export const FROZEN_DIR = path.join(process.cwd(), "tests", "fixtures", "frozen");
export const FROZEN_LOG_PATH = path.join(FROZEN_DIR, "refresh-log.json");
export const FROZEN_TARGETS = {
  "stagec-payload": path.join(FROZEN_DIR, "stagec-payload-current.json"),
  "audit-fixture": path.join(FROZEN_DIR, "audit-fixture-current.json"),
} as const;
export type FrozenTarget = keyof typeof FROZEN_TARGETS;

/** Strings longer than this are stored as a digest; everything else is stored verbatim. */
export const FROZEN_TEXT_LIMIT = 4_000;
export const FROZEN_DECISION_PATTERN = /^D-\d{2,4}$/;
export const FROZEN_INITIAL_DECISION = "initial-freeze";
export const FROZEN_MINIMUM_REASON = 60;
const MAX_LOGGED_PATHS = 200;
const FROZEN_INLINE_WIDTH = 360;
const MAX_REPORTED_DIFFS = 60;

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** A bulky string, kept checkable without storing it: byte length, sha256 and its first characters. */
export function textDigest(text: string): { bytes: number; sha256: string; head: string } {
  return { bytes: Buffer.byteLength(text, "utf8"), sha256: sha256Text(text), head: text.slice(0, 80) };
}

/** JSON round trip (exactly what the historical hashes see), with bulky strings digested. */
export function toFrozenJson(value: unknown, textLimit = FROZEN_TEXT_LIMIT): FrozenJson {
  return JSON.parse(JSON.stringify(value, (_key, leaf: unknown) =>
    typeof leaf === "string" && leaf.length > textLimit ? { $text: textDigest(leaf) } : leaf)) as FrozenJson;
}

/** A serialized prompt as its total size and hash plus one size/hash per `## ` section, in order. */
export function promptDigest(prompt: string): FrozenJson {
  const sections: { heading: string; bytes: number; sha256: string }[] = [];
  const lines = prompt.split("\n");
  let heading = "(before the first ## heading)";
  let body: string[] = [];
  const flush = () => {
    if (body.length === 0) return;
    const text = body.join("\n");
    sections.push({ heading, bytes: Buffer.byteLength(text, "utf8"), sha256: sha256Text(text) });
  };
  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      heading = line;
      body = [line];
    } else body.push(line);
  }
  flush();
  return { bytes: Buffer.byteLength(prompt, "utf8"), sha256: sha256Text(prompt), sections };
}

const segment = (key: string): string => (/^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`);

/** Every leaf (and every empty container) with its path, in serialization order. */
export function flattenFrozen(value: FrozenJson, at = "$"): [string, FrozenJson][] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [[at, []]];
    return value.flatMap((item, index) => flattenFrozen(item, `${at}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return [[at, {}]];
    return keys.flatMap((key) => flattenFrozen(value[key]!, `${at}${segment(key)}`));
  }
  return [[at, value]];
}

const show = (value: FrozenJson | undefined): string => {
  if (value === undefined) return "(absent)";
  const text = JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
};

/** Leaf-level differences, frozen versus today; then key/element order if every leaf agrees. */
export function diffFrozen(frozen: FrozenJson, today: FrozenJson): { paths: string[]; lines: string[] } {
  const before = flattenFrozen(frozen);
  const after = flattenFrozen(today);
  const beforeMap = new Map(before);
  const afterMap = new Map(after);
  const paths: string[] = [];
  const lines: string[] = [];
  for (const [leaf, value] of before) {
    if (!afterMap.has(leaf)) {
      paths.push(leaf);
      lines.push(`${leaf}: frozen ${show(value)} -> today (absent)`);
    } else if (JSON.stringify(afterMap.get(leaf)) !== JSON.stringify(value)) {
      paths.push(leaf);
      lines.push(`${leaf}: frozen ${show(value)} -> today ${show(afterMap.get(leaf))}`);
    }
  }
  for (const [leaf, value] of after) {
    if (!beforeMap.has(leaf)) {
      paths.push(leaf);
      lines.push(`${leaf}: frozen (absent) -> today ${show(value)}`);
    }
  }
  if (paths.length === 0) {
    const index = before.findIndex(([leaf], position) => after[position]![0] !== leaf);
    if (index >= 0) {
      paths.push(before[index]![0]);
      lines.push(`order changed at leaf ${index}: frozen ${before[index]![0]} -> today ${after[index]![0]}`);
    }
  }
  return { paths, lines };
}

/**
 * Record file layout: indented JSON, except that an object or array whose
 * members are all scalars is written on one line when it fits, so one
 * registry record or one projection point is one diff line.
 */
export function formatFrozen(value: FrozenJson, indent = ""): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const entries: [string | null, FrozenJson][] = Array.isArray(value)
    ? value.map((item) => [null, item])
    : Object.entries(value);
  const open = Array.isArray(value) ? "[" : "{";
  const close = Array.isArray(value) ? "]" : "}";
  if (entries.length === 0) return open + close;
  const label = (key: string | null): string => (key === null ? "" : `${JSON.stringify(key)}: `);
  const scalar = (item: FrozenJson): boolean =>
    item === null || typeof item !== "object" || (Array.isArray(item) ? item.length === 0 : Object.keys(item).length === 0);
  if (entries.every(([, item]) => scalar(item))) {
    const inline = `${open}${entries.map(([key, item]) => label(key) + JSON.stringify(item)).join(", ")}${close}`;
    if (inline.length + indent.length <= FROZEN_INLINE_WIDTH) return inline;
  }
  const inner = `${indent}  `;
  const body = entries.map(([key, item]) => inner + label(key) + formatFrozen(item, inner)).join(",\n");
  return `${open}\n${body}\n${indent}${close}`;
}

export function readFrozenRecord(target: FrozenTarget): FrozenJson | null {
  const file = FROZEN_TARGETS[target];
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as FrozenJson) : null;
}

/** Hash of a record's content, independent of file formatting; key order is part of it. */
export function frozenRecordSha256(record: FrozenJson): string {
  return sha256Text(JSON.stringify(record));
}

export interface FrozenLogEntry {
  date: string;
  target: FrozenTarget;
  decision: string;
  reason: string;
  scope: string[];
  beforeSha256: string | null;
  afterSha256: string;
  changedLeaves: number;
  changedPaths: string[];
}

export function readFrozenLog(): FrozenLogEntry[] {
  return existsSync(FROZEN_LOG_PATH) ? (JSON.parse(readFileSync(FROZEN_LOG_PATH, "utf8")) as FrozenLogEntry[]) : [];
}

function inScope(leaf: string, scope: readonly string[]): boolean {
  return scope.some((prefix) => leaf === prefix || leaf.startsWith(`${prefix}.`) || leaf.startsWith(`${prefix}[`));
}

/** The refresh request, read only from the variables `scripts/freeze-refresh.mjs` sets. */
function refreshRequest(target: FrozenTarget): { decision: string; reason: string; scope: string[] } | null {
  if (process.env.FROZEN_RECORD_REFRESH !== target) return null;
  if ((process.env.CI ?? "") !== "") throw new Error("frozen records are never refreshed in CI");
  const decision = (process.env.FROZEN_RECORD_DECISION ?? "").trim();
  const reason = (process.env.FROZEN_RECORD_REASON ?? "").trim();
  const scope = (process.env.FROZEN_RECORD_SCOPE ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  return { decision, reason, scope };
}

/** Validate a refresh against the committed record; returns the log entry to append. Pure apart from the clock. */
export function planFrozenRefresh(
  target: FrozenTarget,
  previous: FrozenJson | null,
  next: FrozenJson,
  request: { decision: string; reason: string; scope: string[] },
  today = new Date().toISOString().slice(0, 10),
): FrozenLogEntry {
  const { decision, reason, scope } = request;
  const initial = previous === null;
  if (!FROZEN_DECISION_PATTERN.test(decision) && !(initial && decision === FROZEN_INITIAL_DECISION)) {
    throw new Error(`frozen refresh of ${target} needs a decision id like D-123 (got ${JSON.stringify(decision)})`);
  }
  if (reason.length < FROZEN_MINIMUM_REASON || /\bTODO\b|\bTBD\b/i.test(reason)) {
    throw new Error(`frozen refresh of ${target} needs a real reason of at least ${FROZEN_MINIMUM_REASON} characters`);
  }
  if (scope.length === 0) throw new Error(`frozen refresh of ${target} needs --scope: the leaf paths expected to change`);
  if (!initial && scope.some((prefix) => prefix === "$" || prefix === "*")) {
    throw new Error(`frozen refresh of ${target} may not re-record the whole record; name the changed leaf paths`);
  }
  if (initial && !(scope.length === 1 && scope[0] === "$")) {
    throw new Error(`the first freeze of ${target} records the whole record: pass --scope $`);
  }
  const changed = initial ? ["$"] : diffFrozen(previous, next).paths;
  if (changed.length === 0) throw new Error(`frozen record ${target} already matches today's output; nothing to refresh`);
  const outside = changed.filter((leaf) => !inScope(leaf, scope));
  if (outside.length > 0) {
    throw new Error(
      `frozen refresh of ${target} refused: ${outside.length} changed leaf/leaves outside --scope ${scope.join(",")}:\n` +
        outside.slice(0, 20).join("\n"),
    );
  }
  return {
    date: today,
    target,
    decision,
    reason,
    scope,
    beforeSha256: initial ? null : frozenRecordSha256(previous),
    afterSha256: frozenRecordSha256(next),
    changedLeaves: changed.length,
    changedPaths: changed.slice(0, MAX_LOGGED_PATHS),
  };
}

/** Every log entry is well formed, each target's chain is unbroken, and its last entry hashes to the committed record. */
export function assertFrozenLog(entries: readonly FrozenLogEntry[], records: Partial<Record<FrozenTarget, FrozenJson | null>>): void {
  const lastHash = new Map<FrozenTarget, string>();
  for (const entry of entries) {
    expect(Object.keys(FROZEN_TARGETS)).toContain(entry.target);
    expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const previous = lastHash.get(entry.target) ?? null;
    if (previous === null) {
      expect(entry.beforeSha256).toBeNull();
      expect(entry.scope).toEqual(["$"]);
      expect(FROZEN_DECISION_PATTERN.test(entry.decision) || entry.decision === FROZEN_INITIAL_DECISION).toBe(true);
    } else {
      expect(entry.beforeSha256).toBe(previous);
      expect(entry.decision).toMatch(FROZEN_DECISION_PATTERN);
      expect(entry.scope.length).toBeGreaterThan(0);
    }
    expect(entry.reason.trim().length).toBeGreaterThanOrEqual(FROZEN_MINIMUM_REASON);
    expect(entry.changedLeaves).toBeGreaterThan(0);
    expect(entry.afterSha256).toMatch(/^[0-9a-f]{64}$/);
    lastHash.set(entry.target, entry.afterSha256);
  }
  for (const [target, record] of Object.entries(records) as [FrozenTarget, FrozenJson | null][]) {
    expect(record, `${target} has no committed frozen record`).not.toBeNull();
    expect(lastHash.get(target), `${target}: the refresh log's last entry must hash to the committed record`).toBe(
      frozenRecordSha256(record!),
    );
  }
}

/**
 * Compare today's output with the committed record. Under an explicit refresh
 * request for this target (and only then) validate, write the record and
 * append the log entry first; the comparison then runs against what was written.
 */
const refreshedThisProcess = new Set<FrozenTarget>();

export function expectFrozenRecord(target: FrozenTarget, today: FrozenJson): void {
  const request = refreshedThisProcess.has(target) ? null : refreshRequest(target);
  if (request !== null) {
    refreshedThisProcess.add(target);
    const previous = readFrozenRecord(target);
    const entry = planFrozenRefresh(target, previous, today, request);
    writeFileSync(FROZEN_TARGETS[target], `${formatFrozen(today)}\n`, "utf8");
    writeFileSync(FROZEN_LOG_PATH, `${JSON.stringify([...readFrozenLog(), entry], null, 2)}\n`, "utf8");
  }
  const frozen = readFrozenRecord(target);
  expect(frozen, `${target}: no committed frozen record; see npm run freeze:refresh in docs/OPERATIONS.md`).not.toBeNull();
  const { lines } = diffFrozen(frozen!, today);
  const report = lines.length <= MAX_REPORTED_DIFFS
    ? lines
    : [...lines.slice(0, MAX_REPORTED_DIFFS), `... and ${lines.length - MAX_REPORTED_DIFFS} more differing leaves`];
  expect(report, `${target}: today's output differs from the frozen record (leaf: frozen -> today)`).toEqual([]);
}
