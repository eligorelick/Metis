import type { DataBundle } from "@/pipeline/types";
import { createHash } from "node:crypto";
import { z } from "zod";
import { REPORT_SPEC_VERSION } from "@/report/schema";
import { SCORE_BANDS_VERSION } from "@/pipeline/stageB/grading";

export const RUN_INPUT_SNAPSHOT_FORMAT = "RUN_INPUT_SNAPSHOT_1" as const;
// NVDA_AUDIT_2 (D-65..D-68): all eligible consensus windows, non-operating
// investment add-backs, quote-date discounting, consistent EV multiples and
// effective scenario shocks. Earlier snapshots require their original engine.
// D-72: missing interest, acquisition payments and segment-history safeguards.
// D-73: preserve debt refusals instead of using incomplete or older balances.
// D-83 adds explicit EPS-convention metadata; financial arithmetic is retained.
// D-84: common-payout history excludes explicit source refusals, including total zero.
// IREN source-scope corrections: disjoint cash investment/FCF, historical share admission, EPS and class-scope refusals. Old stored reports/snapshots retain their original contracts.
// Separate AFFO comparability and unresolved company/security-model admission.
// D-97: instrument-class financing debt, debt plausibility, operating-lease portion scope and zero/immaterial NCI.
// D-98: SEC-statement investment stakes and their tax, YoY guided pace, improving-margin fade, one-off margin seed and gain-inflated P/E.
// D-99: SBC beyond negative FCF, loss-year ROIC at the marginal-rate floor, recent buyback timing, bounded reverse DCF, scenario margin direction, seasonal consensus calendarization and lease-consistent leverage.
export const STAGE_B_IMPLEMENTATION_VERSION = "STAGE_B_2026_10_ACCOUNTING_EVIDENCE_17" as const;
export interface SnapshotVersions { stageB: string; reportSpec: string; scoreBands: string }
export interface SnapshotArtifactIdentity { methodArtifactHash: string; dependencyLockHash: string; codeCommit: string | null; dirtyDiffHash: string | null }
export interface SnapshotCustody extends SnapshotArtifactIdentity { status: "local-content-identity"; normalizedSourceContentHash: string }
export interface RunInputSnapshot {
  hash: string;
  content: { formatVersion: typeof RUN_INPUT_SNAPSHOT_FORMAT; versions: SnapshotVersions;
    stageBConfig: { evIncludeLeases: boolean }; bundle: DataBundle; redactedFields: string[]; custody?: SnapshotCustody };
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
    custody: z.object({
      status: z.literal("local-content-identity"),
      methodArtifactHash: z.string().regex(/^[a-f0-9]{64}$/), dependencyLockHash: z.string().regex(/^[a-f0-9]{64}$/),
      codeCommit: z.string().regex(/^[a-f0-9]{40,64}$/).nullable(), dirtyDiffHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
      normalizedSourceContentHash: z.string().regex(/^[a-f0-9]{64}$/),
    }).strict().optional(),
  }).strict(),
}).strict();

/** Hash actual artifact bytes. Commit identity is supplied metadata, not independently attested. */
export function createSnapshotArtifactIdentity(input: { methodArtifactBytes: string; dependencyLockBytes: string; dirtyDiffBytes?: string; codeCommit?: string | null }): SnapshotArtifactIdentity {
  const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
  return { methodArtifactHash: hash(input.methodArtifactBytes), dependencyLockHash: hash(input.dependencyLockBytes), dirtyDiffHash: input.dirtyDiffBytes === undefined ? null : hash(input.dirtyDiffBytes), codeCommit: input.codeCommit ?? null };
}

export function captureRunInputSnapshot(bundle: DataBundle, config: { evIncludeLeases: boolean }, versions: SnapshotVersions = CURRENT_SNAPSHOT_VERSIONS, identity?: SnapshotArtifactIdentity): RunInputSnapshot {
  // Check cycles, prototypes and non-finite values before recursive redaction.
  const detached = JSON.parse(canonicalSnapshotJson(bundle));
  const redactedFields: string[] = [];
  const content = {
    formatVersion: RUN_INPUT_SNAPSHOT_FORMAT, versions: { ...versions },
    stageBConfig: { evIncludeLeases: config.evIncludeLeases },
    bundle: redact(detached, "bundle", redactedFields) as DataBundle,
    redactedFields: redactedFields.sort(),
  };
  const contentWithCustody = identity ? { ...content, custody: { ...identity, status: "local-content-identity" as const,
    normalizedSourceContentHash: createHash("sha256").update(canonicalSnapshotJson(content.bundle)).digest("hex") } } : content;
  const hash = createHash("sha256").update(canonicalSnapshotJson(contentWithCustody)).digest("hex");
  return verifyRunInputSnapshot({ hash, content: contentWithCustody });
}

export function verifyRunInputSnapshot(value: unknown): RunInputSnapshot {
  const parsed = SnapshotSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid snapshot format/version: ${parsed.error.message}`);
  const snapshot = parsed.data;
  const hash = createHash("sha256").update(canonicalSnapshotJson(snapshot.content)).digest("hex");
  if (hash !== snapshot.hash) throw new Error("Snapshot hash integrity mismatch");
  if (snapshot.content.custody && snapshot.content.custody.normalizedSourceContentHash !== createHash("sha256").update(canonicalSnapshotJson(snapshot.content.bundle)).digest("hex")) throw new Error("Snapshot source content identity mismatch");
  if (canonicalSnapshotJson(redact(snapshot.content.bundle, "bundle", [])) !== canonicalSnapshotJson(snapshot.content.bundle)) {
    throw new Error("Snapshot contains unredacted credentials");
  }
  return deepFreeze(JSON.parse(canonicalSnapshotJson(snapshot)) as RunInputSnapshot);
}
