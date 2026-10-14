import type { DataBundle } from "@/pipeline/types";
import { createHash } from "node:crypto";
import { z } from "zod";
import { REPORT_SPEC_VERSION } from "@/report/schema";
import { SCORE_BANDS_VERSION } from "@/pipeline/stageB/grading";

export const RUN_INPUT_SNAPSHOT_FORMAT = "RUN_INPUT_SNAPSHOT_1" as const;
export const STAGE_B_IMPLEMENTATION_VERSION = "STAGE_B_2026_10_AUDIT" as const;
export interface SnapshotVersions { stageB: string; reportSpec: string; scoreBands: string }
export interface RunInputSnapshot {
  hash: string;
  content: { formatVersion: typeof RUN_INPUT_SNAPSHOT_FORMAT; versions: SnapshotVersions;
    stageBConfig: { evIncludeLeases: boolean }; bundle: DataBundle; redactedFields: string[] };
}
export interface RunSnapshotRef { hash: string; formatVersion: typeof RUN_INPUT_SNAPSHOT_FORMAT; capturedAt: string }

export const CURRENT_SNAPSHOT_VERSIONS: Readonly<SnapshotVersions> = Object.freeze({
  stageB: STAGE_B_IMPLEMENTATION_VERSION, reportSpec: REPORT_SPEC_VERSION, scoreBands: SCORE_BANDS_VERSION,
});

/** JSON semantics with sorted object keys, exact array order and no lossy NaN coercion. */
export function canonicalSnapshotJson(value: unknown): string {
  const active = new Set<object>();
  const encode = (v: unknown): string => {
    if (v === null) return "null";
    if (typeof v === "number") {
      if (!Number.isFinite(v)) throw new TypeError("Snapshot numbers must be finite");
      return JSON.stringify(v);
    }
    if (typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
    if (typeof v !== "object") throw new TypeError("Snapshot requires JSON values; undefined array entries are not supported");
    if (active.has(v)) throw new TypeError("Snapshot cannot contain circular values");
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) {
      throw new TypeError("Snapshot requires plain JSON objects");
    }
    active.add(v);
    try {
      if (Array.isArray(v)) return `[${[...v].map(encode).join(",")}]`;
      const record = v as Record<string, unknown>;
      return `{${Object.keys(record).filter(k => record[k] !== undefined).sort()
        .map(k => `${JSON.stringify(k)}:${encode(record[k])}`).join(",")}}`;
    } finally { active.delete(v); }
  };
  return encode(value);
}

const credentialKey = /^(?:.*api[_-]?key|authorization|password|.*secret|access[_-]?token|refresh[_-]?token|cookies?|credentials?)$/i;
/** Do not persist provider request credentials accidentally present in raw/error payloads. */
function redact(value: unknown, path: string, fields: string[]): unknown {
  if (typeof value === "string") {
    const safe = value.replace(/([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|key|secret)=)[^&#\s]*/gi, "$1[redacted]")
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]")
      .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[redacted]@");
    if (safe !== value) fields.push(path);
    return safe;
  }
  if (Array.isArray(value)) return value.map((v, i) => redact(v, `${path}[${i}]`, fields));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key, v]) => {
      if (credentialKey.test(key)) { fields.push(`${path}.${key}`); return false; }
      return v !== undefined;
    }).map(([key, v]) => [key, redact(v, `${path}.${key}`, fields)]));
  }
  return value;
}

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === "object") {
    for (const item of Object.values(v)) deepFreeze(item);
    Object.freeze(v);
  }
  return v;
}

const SnapshotSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  content: z.object({
    formatVersion: z.literal(RUN_INPUT_SNAPSHOT_FORMAT),
    versions: z.object({ stageB: z.string().min(1), reportSpec: z.string().min(1), scoreBands: z.string().min(1) }).strict(),
    stageBConfig: z.object({ evIncludeLeases: z.boolean() }).strict(),
    bundle: z.custom<DataBundle>(v => v !== null && typeof v === "object" &&
      typeof (v as DataBundle).symbol === "string" && (v as DataBundle).symbol.length > 0 &&
      Number.isFinite(Date.parse((v as DataBundle).builtAt)) && typeof (v as DataBundle).statements === "object"),
    redactedFields: z.array(z.string()),
  }).strict(),
}).strict();

export function captureRunInputSnapshot(bundle: DataBundle, config: { evIncludeLeases: boolean }, versions: SnapshotVersions = CURRENT_SNAPSHOT_VERSIONS): RunInputSnapshot {
  // Check cycles, prototypes and non-finite values before recursive redaction.
  const detached = JSON.parse(canonicalSnapshotJson(bundle));
  const redactedFields: string[] = [];
  const content = {
    formatVersion: RUN_INPUT_SNAPSHOT_FORMAT, versions: { ...versions },
    stageBConfig: { evIncludeLeases: config.evIncludeLeases },
    bundle: redact(detached, "bundle", redactedFields) as DataBundle,
    redactedFields: redactedFields.sort(),
  };
  const hash = createHash("sha256").update(canonicalSnapshotJson(content)).digest("hex");
  return verifyRunInputSnapshot({ hash, content });
}

export function verifyRunInputSnapshot(value: unknown): RunInputSnapshot {
  const parsed = SnapshotSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid snapshot format/version: ${parsed.error.message}`);
  const snapshot = parsed.data;
  const hash = createHash("sha256").update(canonicalSnapshotJson(snapshot.content)).digest("hex");
  if (hash !== snapshot.hash) throw new Error("Snapshot hash integrity mismatch");
  if (canonicalSnapshotJson(redact(snapshot.content.bundle, "bundle", [])) !== canonicalSnapshotJson(snapshot.content.bundle)) {
    throw new Error("Snapshot contains unredacted credentials");
  }
  return deepFreeze(JSON.parse(canonicalSnapshotJson(snapshot)) as RunInputSnapshot);
}
