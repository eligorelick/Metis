import { runStageB, type ComputedMetrics } from "@/pipeline/compute";
import { CURRENT_SNAPSHOT_VERSIONS, canonicalSnapshotJson, verifyRunInputSnapshot, type SnapshotArtifactIdentity } from "@/pipeline/runInputSnapshot";

/** No provider, cache, DB, LLM or current clock access: only the frozen calculation inputs. */
export function replayRunInputSnapshot(value: unknown, currentIdentity?: SnapshotArtifactIdentity): { snapshotHash: string; offline: true; custody: "local-content-identity" | "legacy-unverified"; computed: ComputedMetrics } {
  const snapshot = verifyRunInputSnapshot(value);
  if (canonicalSnapshotJson(snapshot.content.versions) !== canonicalSnapshotJson(CURRENT_SNAPSHOT_VERSIONS)) {
    throw new Error("Snapshot calculation implementation version is unavailable; refusing an inexact historical replay");
  }
  const custody = snapshot.content.custody;
  if (custody && (!currentIdentity || custody.methodArtifactHash !== currentIdentity.methodArtifactHash || custody.dependencyLockHash !== currentIdentity.dependencyLockHash || custody.codeCommit !== currentIdentity.codeCommit || custody.dirtyDiffHash !== currentIdentity.dirtyDiffHash)) throw new Error("Snapshot code/method/dependency artifact custody differs from the supplied replay implementation identity or is unavailable");
  return { snapshotHash: snapshot.hash, offline: true, custody: custody ? "local-content-identity" : "legacy-unverified", computed: runStageB(snapshot.content.bundle, snapshot.content.stageBConfig) };
}
