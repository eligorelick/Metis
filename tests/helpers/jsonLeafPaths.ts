/**
 * Leaf paths and canonical JSON for projection-shaped documents.
 *
 * `diffPaths` lists every leaf where two JSON documents disagree, as dotted
 * paths (arrays by index, object keys with their dots and backslashes
 * escaped), and `comparePaths` orders them with numeric indices in numeric
 * order. `npm run golden:diff` (scripts/golden/diff.ts) uses both to name the
 * changed leaves of a same-report output file. `canonicalJson` is key-sorted
 * JSON; the frozen DEMO fixture record (tests/audit.fixtureComparison.test.ts)
 * hashes its projection with it.
 *
 * These functions were the generic half of the audited fixture comparison's
 * intended-delta contract. The ledger half (the delta file format, its
 * reconstruction check and the manifest identity view) was retired by D-232
 * once today's projection was frozen; it is reachable in git history.
 */

export type AuditJsonPrimitive = null | boolean | number | string;
export type AuditJsonValue =
  | AuditJsonPrimitive
  | AuditJsonValue[]
  | { [key: string]: AuditJsonValue };

export function isRecord(value: AuditJsonValue): value is { [key: string]: AuditJsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Paths are dotted, and object keys in this projection can themselves contain
 * dots: the as-of map is keyed by source names like `edgar.cik`. A key's dots
 * and backslashes are therefore escaped, so `asOfMap.edgar\.cik` addresses the
 * one key and `asOfMap.edgar.cik` addresses a nested pair. Without this a
 * dotted key and a nested pair would report the same path.
 */
export function encodeSegment(key: string): string {
  return key.replaceAll("\\", "\\\\").replaceAll(".", "\\.");
}

export function splitPath(dottedPath: string): string[] {
  const segments: string[] = [];
  let current = "";
  for (let index = 0; index < dottedPath.length; index++) {
    const character = dottedPath[index];
    if (character === "\\" && index + 1 < dottedPath.length) {
      current += dottedPath[index + 1];
      index++;
      continue;
    }
    if (character === ".") {
      segments.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  segments.push(current);
  return segments;
}

export function canonicalJson(value: AuditJsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Every leaf path where the two documents disagree. Arrays are compared by
 * index, so an insertion reports every following element: that is deliberate,
 * because position is part of what a reader sees.
 */
export function diffPaths(
  before: AuditJsonValue,
  after: AuditJsonValue,
  prefix = "",
): string[] {
  if (Array.isArray(before) && Array.isArray(after)) {
    const paths: string[] = [];
    const sharedLength = Math.min(before.length, after.length);
    for (let index = 0; index < sharedLength; index++) {
      paths.push(...diffPaths(before[index], after[index], `${prefix}.${index}`));
    }
    for (let index = sharedLength; index < Math.max(before.length, after.length); index++) {
      paths.push(`${prefix}.${index}`);
    }
    return paths;
  }
  if (Array.isArray(before) || Array.isArray(after)) return [prefix];
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((key) => {
      const encoded = encodeSegment(key);
      const child = prefix.length > 0 ? `${prefix}.${encoded}` : encoded;
      if (!(key in before) || !(key in after)) return [child];
      return diffPaths(before[key], after[key], child);
    });
  }
  return Object.is(before, after) ? [] : [prefix];
}

/** Sort paths so numeric array indices order numerically, not lexically. */
export function comparePaths(left: string, right: string): number {
  const a = splitPath(left);
  const b = splitPath(right);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const x = a[index];
    const y = b[index];
    if (x === y) continue;
    const nx = Number(x);
    const ny = Number(y);
    if (Number.isInteger(nx) && Number.isInteger(ny)) return nx - ny;
    return x < y ? -1 : 1;
  }
  return a.length - b.length;
}
