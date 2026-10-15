import { z } from "zod";
import { canonicalSnapshotJson } from "@/pipeline/runInputSnapshot";
import { artifactHashSchema, artifactIsBound, evaluationStampSchema, hashArtifactBytes, parseTargetV2, retainedArtifactSchema, type RetainedArtifact, type TargetDefinitionV2 } from "./targetDefinition";

export const evaluationArtifactManifestSchema = z.object({
  registrationId: z.string().trim().min(1), inputHash: artifactHashSchema, reportHash: artifactHashSchema,
  targetHash: artifactHashSchema, sourceManifestHash: artifactHashSchema, dependencyLockHash: artifactHashSchema,
  methodArtifactHash: artifactHashSchema, promptHash: artifactHashSchema.nullable(), dirtyDiffHash: artifactHashSchema.nullable(),
  codeCommit: z.string().regex(/^[a-f0-9]{40,64}$/).nullable(), pipelineVersion: z.string().min(1), modelVersion: z.string().min(1).nullable(),
  acquiredAt: evaluationStampSchema, createdAt: evaluationStampSchema, frozenAt: evaluationStampSchema,
}).strict();
export type EvaluationArtifactManifest = z.infer<typeof evaluationArtifactManifestSchema>;
export interface EvaluationRegistrationRecord { manifest: EvaluationArtifactManifest; target: TargetDefinitionV2; artifacts: RetainedArtifact[] }

export function sourceManifestHash(artifacts: readonly RetainedArtifact[]): string {
  const sources = artifacts.filter(a => a.kind === "source").map(({ hash, kind }) => ({ hash, kind }))
    .sort((a, b) => a.hash.localeCompare(b.hash));
  return hashArtifactBytes(canonicalSnapshotJson(sources));
}

/** Validates content identity and declared ordering, never attests caller-supplied times or source truth. */
export function verifyEvaluationRegistration(manifestInput: unknown, targetInput: unknown, artifactInputs: unknown): EvaluationRegistrationRecord {
  const manifest = evaluationArtifactManifestSchema.parse(manifestInput);
  const target = parseTargetV2(targetInput);
  const artifacts = z.array(retainedArtifactSchema).parse(artifactInputs);
  if (artifacts.some(a => hashArtifactBytes(a.content) !== a.hash)) throw new Error("Retained artifact bytes are not bound to their content hash");
  if (manifest.targetHash !== hashArtifactBytes(canonicalSnapshotJson(target))) throw new Error("Target identity hash mismatch");
  if (manifest.sourceManifestHash !== sourceManifestHash(artifacts)) throw new Error("Source manifest identity hash mismatch");
  if (manifest.methodArtifactHash !== target.methodArtifactHash) throw new Error("Target method artifact identity mismatch");
  const bindings = [[manifest.inputHash, "input"], [manifest.reportHash, "report"], [manifest.methodArtifactHash, "method"], [manifest.dependencyLockHash, "dependency_lock"], [manifest.promptHash, "prompt"], [manifest.dirtyDiffHash, "dirty_diff"]] as const;
  for (const [hash, kind] of bindings) if (hash !== null && !artifactIsBound(hash, kind, artifacts)) throw new Error(`Unbound ${kind} artifact hash`);
  if (Date.parse(manifest.acquiredAt) > Date.parse(manifest.createdAt) || Date.parse(manifest.createdAt) > Date.parse(manifest.frozenAt) || Date.parse(manifest.createdAt) !== Date.parse(target.createdAt)) throw new Error("Declared acquisition/creation/freeze ordering or target creation identity conflicts");
  return JSON.parse(canonicalSnapshotJson({ manifest, target, artifacts })) as EvaluationRegistrationRecord;
}
