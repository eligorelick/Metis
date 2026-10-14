import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, type ThesisDb } from "@/db";
import { jobRunInputs, runInputSnapshots } from "@/db/schema";
import { canonicalSnapshotJson, RUN_INPUT_SNAPSHOT_FORMAT, verifyRunInputSnapshot, type RunInputSnapshot, type RunSnapshotRef } from "@/pipeline/runInputSnapshot";

export function readRunInputSnapshot(hash: string, db: ThesisDb = getDb()): RunInputSnapshot | null {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid snapshot hash");
  const row = db.select().from(runInputSnapshots).where(eq(runInputSnapshots.hash, hash)).get();
  if (!row) return null;
  let snapshot: RunInputSnapshot;
  try { snapshot = verifyRunInputSnapshot(JSON.parse(row.snapshotJson)); }
  catch (error) { throw new Error("Stored snapshot integrity validation failed", { cause: error }); }
  if (snapshot.hash !== hash) throw new Error("Stored snapshot hash does not match its content address");
  return snapshot;
}

export function readJobRunSnapshotRef(jobId: string, generation: number, db: ThesisDb = getDb()): RunSnapshotRef | null {
  const row = db.select().from(jobRunInputs).where(and(eq(jobRunInputs.jobId, jobId), eq(jobRunInputs.runGeneration, generation))).get();
  if (!row) return null;
  if (!readRunInputSnapshot(row.snapshotHash, db)) throw new Error("Run references a missing snapshot");
  return { hash: row.snapshotHash, formatVersion: RUN_INPUT_SNAPSHOT_FORMAT, capturedAt: row.capturedAt };
}

export function persistRunInputSnapshot(jobId: string, generation: number, input: RunInputSnapshot, capturedAt: string, db: ThesisDb = getDb()): RunSnapshotRef {
  if (!Number.isSafeInteger(generation) || generation < 0 || !Number.isFinite(Date.parse(capturedAt))) throw new Error("Invalid snapshot run identity/capture time");
  const snapshot = verifyRunInputSnapshot(input);
  return db.transaction(tx => {
    const stored = readJobRunSnapshotRef(jobId, generation, tx);
    if (stored) {
      if (stored.hash !== snapshot.hash) throw new Error("Run inputs are immutable: generation already has a different snapshot");
      return stored;
    }
    tx.insert(runInputSnapshots).values({ hash: snapshot.hash, snapshotJson: canonicalSnapshotJson(snapshot), createdAt: capturedAt }).onConflictDoNothing().run();
    const blob = readRunInputSnapshot(snapshot.hash, tx);
    if (!blob || canonicalSnapshotJson(blob) !== canonicalSnapshotJson(snapshot)) throw new Error("Snapshot content-address collision");
    tx.insert(jobRunInputs).values({ jobId, runGeneration: generation, snapshotHash: snapshot.hash, capturedAt }).run();
    return { hash: snapshot.hash, formatVersion: RUN_INPUT_SNAPSHOT_FORMAT, capturedAt };
  });
}
