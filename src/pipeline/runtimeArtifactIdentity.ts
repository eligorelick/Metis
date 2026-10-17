import "server-only";
import { join } from "node:path";
import { readRuntimeArtifactIdentity } from "../../scripts/runtime-artifact-manifest.mjs";
import type { SnapshotArtifactIdentity } from "@/pipeline/runInputSnapshot";

/**
 * Next embeds this build token in the executing module. A later checkout or
 * replacement .next manifest cannot silently identify an older loaded build.
 * Missing evidence leaves custody absent; content hashes are not attestation.
 */
export function getRuntimeSnapshotArtifactIdentity(): SnapshotArtifactIdentity | undefined {
  return readRuntimeArtifactIdentity({ distDir: join(process.cwd(), ".next"), buildId: process.env.METIS_RUNTIME_BUILD_ID });
}
