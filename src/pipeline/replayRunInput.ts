import { runStageB, type ComputedMetrics } from "@/pipeline/compute";
import { CURRENT_SNAPSHOT_VERSIONS, canonicalSnapshotJson, verifyRunInputSnapshot } from "@/pipeline/runInputSnapshot";

/** No provider, cache, DB, LLM or current clock access: only the frozen calculation inputs. */
export function replayRunInputSnapshot(value: unknown): { snapshotHash: string; offline: true; computed: ComputedMetrics } {
  const snapshot = verifyRunInputSnapshot(value);
  if (canonicalSnapshotJson(snapshot.content.versions) !== canonicalSnapshotJson(CURRENT_SNAPSHOT_VERSIONS)) {
    throw new Error("Snapshot calculation implementation version is unavailable; refusing an inexact historical replay");
  }
  return { snapshotHash: snapshot.hash, offline: true, computed: runStageB(snapshot.content.bundle, snapshot.content.stageBConfig) };
}
