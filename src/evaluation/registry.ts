import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { canonicalSnapshotJson } from "@/pipeline/runInputSnapshot";
import { artifactHashSchema, evaluationStampSchema, hashArtifactBytes, type RetainedArtifact } from "./targetDefinition";
import { verifyEvaluationRegistration, type EvaluationRegistrationRecord } from "./artifactManifest";

export interface RegistrationReceipt { id: string; sequence: number; recordHash: string; recordedAt: string; custodyStatus: "local-append-only" }
export interface RegisteredForecast extends EvaluationRegistrationRecord { receipt: RegistrationReceipt }
export interface EvaluationRegistryStore {
  append(record: EvaluationRegistrationRecord): Promise<RegistrationReceipt>;
  read(id: string): Promise<RegisteredForecast | null>;
}
const entrySchema = z.object({ sequence: z.number().int().positive(), previousRecordHash: artifactHashSchema.nullable(), recordedAt: evaluationStampSchema, recordHash: artifactHashSchema, record: z.unknown() }).strict();

/** Wait for another writer, but never remove a lock whose ownership is unknown. */
async function acquireRegistryLock(lock: string): Promise<number> {
  const deadline = performance.now() + 5_000;
  for (;;) {
    try { return fs.openSync(lock, "wx", 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw new Error("Evaluation registry lock acquisition timed out; lock may be active or stale. Registry unchanged; inspect ownership before recovery.", { cause: error });
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(25, remaining)));
    }
  }
}

/** API append-only and hash chained, not an externally witnessed clock or a deletion-proof archive. */
export class FileEvaluationRegistryStore implements EvaluationRegistryStore {
  constructor(readonly filename: string) {}
  private entries(): RegisteredForecast[] {
    if (!fs.existsSync(this.filename)) return [];
    const text = fs.readFileSync(this.filename, "utf8");
    if (text && !text.endsWith("\n")) throw new Error("Registry has a truncated entry");
    const rows: RegisteredForecast[] = [];
    const ids = new Set<string>();
    let previousRecordHash: string | null = null;
    for (const line of text.split("\n").filter(Boolean)) {
      const entry = entrySchema.parse(JSON.parse(line));
      const recordInput = z.object({ manifest: z.unknown(), target: z.unknown(), artifacts: z.unknown() }).strict().parse(entry.record);
      const record = verifyEvaluationRegistration(recordInput.manifest, recordInput.target, recordInput.artifacts);
      const payload = { sequence: entry.sequence, previousRecordHash: entry.previousRecordHash, recordedAt: entry.recordedAt, record };
      if (entry.sequence !== rows.length + 1 || entry.previousRecordHash !== previousRecordHash || hashArtifactBytes(canonicalSnapshotJson(payload)) !== entry.recordHash || ids.has(record.manifest.registrationId)) throw new Error("Registry chain integrity mismatch");
      ids.add(record.manifest.registrationId); previousRecordHash = entry.recordHash;
      rows.push({ ...record, receipt: { id: record.manifest.registrationId, sequence: entry.sequence, recordHash: entry.recordHash, recordedAt: entry.recordedAt, custodyStatus: "local-append-only" } });
    }
    return rows;
  }
  async list(): Promise<RegisteredForecast[]> { return this.entries(); }
  async read(id: string): Promise<RegisteredForecast | null> { return this.entries().find(r => r.manifest.registrationId === id) ?? null; }
  async append(input: EvaluationRegistrationRecord): Promise<RegistrationReceipt> {
    const record = verifyEvaluationRegistration(input.manifest, input.target, input.artifacts);
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    const lock = `${this.filename}.lock`;
    const descriptor = await acquireRegistryLock(lock);
    try {
      const entries = this.entries();
      const stored = entries.find(r => r.manifest.registrationId === record.manifest.registrationId);
      if (stored) {
        const { receipt, ...existing } = stored;
        if (canonicalSnapshotJson(existing) !== canonicalSnapshotJson(record)) throw new Error("Registered forecast is immutable: target or artifact identity changed");
        return receipt;
      }
      const payload = { sequence: entries.length + 1, previousRecordHash: entries.at(-1)?.receipt.recordHash ?? null, recordedAt: new Date().toISOString(), record };
      const recordHash = hashArtifactBytes(canonicalSnapshotJson(payload));
      const fd = fs.openSync(this.filename, "a", 0o600);
      try { fs.writeFileSync(fd, `${canonicalSnapshotJson({ ...payload, recordHash })}\n`, "utf8"); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      return { id: record.manifest.registrationId, sequence: payload.sequence, recordHash, recordedAt: payload.recordedAt, custodyStatus: "local-append-only" };
    } finally { fs.closeSync(descriptor); fs.unlinkSync(lock); }
  }
}

export async function registerForecast(manifest: unknown, target: unknown, store: EvaluationRegistryStore, artifacts: readonly RetainedArtifact[]): Promise<RegistrationReceipt> {
  const record = verifyEvaluationRegistration(manifest, target, artifacts);
  return store.append(record);
}
