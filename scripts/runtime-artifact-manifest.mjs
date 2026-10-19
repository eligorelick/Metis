import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const FORMAT = "METIS_RUNTIME_ARTIFACT_IDENTITY_1";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40,64}$/;
const isHash = (value) => typeof value === "string" && hashPattern.test(value);

/** Only immutable compiled modules/manifests, never generated responses or caches. */
function compiledArtifacts(distDir) {
  for (const directory of [distDir, join(distDir, "server")]) {
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Runtime artifact directories must be local directories");
  }
  const artifacts = [];
  const visit = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = `${prefix}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error("Runtime artifact symlinks are unsupported");
      if (entry.isDirectory()) visit(join(directory, entry.name), name);
      else if (entry.isFile() && /\.(?:js|json)$/.test(entry.name)) {
        artifacts.push({ path: name, hash: sha(readFileSync(join(directory, entry.name))) });
      }
    }
  };
  visit(join(distDir, "server"), "server");
  artifacts.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (!artifacts.some(artifact => artifact.path.endsWith(".js"))) throw new Error("No compiled runtime modules available");
  return artifacts;
}

const methodHash = (methodSourceHash, artifacts) => sha(JSON.stringify({ methodSourceHash, artifacts }));

/**
 * Captured build inputs and compiled bytes establish local identity, not attestation.
 * @param {{ distDir: string, buildId: string, methodArtifactBytes: string | Buffer, dependencyLockBytes: string | Buffer, codeCommit?: string | null, dirtyDiffBytes?: string | Buffer }} input
 */
export function createRuntimeArtifactManifest({ distDir, buildId, methodArtifactBytes, dependencyLockBytes, codeCommit = null, dirtyDiffBytes }) {
  if (!buildId || readFileSync(join(distDir, "BUILD_ID"), "utf8").trim() !== buildId) throw new Error("Runtime build identity mismatch");
  if (codeCommit !== null && !commitPattern.test(codeCommit)) throw new Error("Invalid build commit identity");
  const artifacts = compiledArtifacts(distDir);
  const methodSourceHash = sha(methodArtifactBytes);
  return {
    formatVersion: FORMAT, buildId, methodSourceHash, artifacts,
    identity: {
      methodArtifactHash: methodHash(methodSourceHash, artifacts),
      dependencyLockHash: sha(dependencyLockBytes),
      codeCommit,
      dirtyDiffHash: dirtyDiffBytes === undefined ? null : sha(dirtyDiffBytes),
    },
  };
}

/**
 * Never substitute the current checkout for missing build evidence.
 * @param {{ distDir: string, buildId?: string }} input
 * @returns {Readonly<{ methodArtifactHash: string, dependencyLockHash: string, codeCommit: string | null, dirtyDiffHash: string | null }> | undefined}
 */
export function readRuntimeArtifactIdentity({ distDir, buildId }) {
  if (!buildId) return undefined;
  try {
    for (const path of [join(distDir, "BUILD_ID"), join(distDir, "runtime-artifact-identity.json")]) {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || !stat.isFile()) return undefined;
    }
    const manifest = JSON.parse(readFileSync(join(distDir, "runtime-artifact-identity.json"), "utf8"));
    const identity = manifest.identity;
    if (manifest.formatVersion !== FORMAT || manifest.buildId !== buildId ||
      readFileSync(join(distDir, "BUILD_ID"), "utf8").trim() !== buildId ||
      !isHash(manifest.methodSourceHash) || !identity ||
      !isHash(identity.methodArtifactHash) || !isHash(identity.dependencyLockHash) ||
      !(identity.codeCommit === null || (typeof identity.codeCommit === "string" && commitPattern.test(identity.codeCommit))) ||
      !(identity.dirtyDiffHash === null || isHash(identity.dirtyDiffHash))) return undefined;
    // Compare with a fresh enumeration rather than opening manifest-controlled paths.
    // This rejects traversal, duplicates, missing/extra files and changed bytes.
    const artifacts = compiledArtifacts(distDir);
    if (JSON.stringify(manifest.artifacts) !== JSON.stringify(artifacts) ||
      methodHash(manifest.methodSourceHash, artifacts) !== identity.methodArtifactHash) return undefined;
    return Object.freeze({ methodArtifactHash: identity.methodArtifactHash, dependencyLockHash: identity.dependencyLockHash,
      codeCommit: identity.codeCommit, dirtyDiffHash: identity.dirtyDiffHash });
  } catch {
    return undefined;
  }
}
