import "server-only";
import { join } from "node:path";
import { readRuntimeArtifactIdentity, readRuntimeCodeIdentity } from "../../scripts/runtime-artifact-manifest.mjs";
import type { SnapshotArtifactIdentity } from "@/pipeline/runInputSnapshot";
import type { ReportCodeIdentity } from "@/report/codeIdentity";

const runtimeBuild = () => ({ distDir: join(process.cwd(), ".next"), buildId: process.env.METIS_RUNTIME_BUILD_ID });

/**
 * Next embeds this build token in the executing module. A later checkout or
 * replacement .next manifest cannot silently identify an older loaded build.
 * Missing evidence leaves custody absent; content hashes are not attestation.
 */
export function getRuntimeSnapshotArtifactIdentity(): SnapshotArtifactIdentity | undefined {
  return readRuntimeArtifactIdentity(runtimeBuild());
}

/**
 * The same verified build evidence, in the shape a newly built report records
 * (P27, D-227; owner src/report/codeIdentity.ts). Undefined without a verified
 * build: a dev server, tests, the same-report harness and the CLI record none.
 */
export function getRuntimeReportCodeIdentity(): ReportCodeIdentity | undefined {
  return readRuntimeCodeIdentity(runtimeBuild());
}
