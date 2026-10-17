/** node --conditions=react-server --import tsx scripts/replay-run-inputs.ts --snapshot FILE [--output FILE] */
import fs from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalSnapshotJson, createSnapshotArtifactIdentity, verifyRunInputSnapshot } from "../src/pipeline/runInputSnapshot";
import { readRuntimeArtifactIdentity } from "./runtime-artifact-manifest.mjs";

type ReplayFunction = typeof import("../src/pipeline/replayRunInput").replayRunInputSnapshot;

async function main(args: string[]): Promise<void> {
  const allowed = new Set(["--snapshot", "--hash", "--job", "--generation", "--output", "--export-snapshot", "--method-artifact", "--dependency-lock", "--dirty-diff", "--code-commit", "--runtime-build", "--trust-local-build"]);
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.has(args[i]!) || !args[i + 1] || options.has(args[i]!)) throw new Error("Expected unique --snapshot FILE, --hash HASH, or --job ID --generation N; optional --output FILE and --export-snapshot FILE");
    options.set(args[i]!, args[i + 1]!);
  }
  if (["--snapshot", "--hash", "--job"].filter(key => options.has(key)).length !== 1) throw new Error("Choose exactly one snapshot input: --snapshot FILE, --hash HASH, or --job ID --generation N");
  if (options.has("--trust-local-build") && !options.has("--runtime-build")) throw new Error("--trust-local-build requires --runtime-build DIR");
  if (options.has("--runtime-build") && options.get("--trust-local-build") !== "yes") {
    throw new Error("Runtime replay executes trusted local build code; explicitly pass --trust-local-build yes");
  }
  if (options.has("--runtime-build") && ["--method-artifact", "--dependency-lock", "--dirty-diff", "--code-commit"].some(key => options.has(key))) {
    throw new Error("Choose --runtime-build DIR or raw method/dependency identity files, not both");
  }
  let snapshot: unknown;
  if (options.has("--snapshot")) snapshot = JSON.parse(fs.readFileSync(options.get("--snapshot")!, "utf8"));
  else {
    const store = await import("../src/pipeline/runInputSnapshotStore");
    let hash = options.get("--hash");
    if (!hash) {
      const generation = Number(options.get("--generation"));
      if (!options.has("--generation") || !Number.isSafeInteger(generation) || generation < 0) throw new Error("Job replay requires an explicit nonnegative --generation");
      hash = store.readJobRunSnapshotRef(options.get("--job")!, generation)?.hash;
    }
    if (!hash) throw new Error("No immutable snapshot associated with that run");
    snapshot = store.readRunInputSnapshot(hash);
    if (!snapshot) throw new Error("Immutable snapshot not found");
  }
  if (options.has("--method-artifact") !== options.has("--dependency-lock")) throw new Error("Replay identity requires both --method-artifact FILE and --dependency-lock FILE");
  if ((options.has("--dirty-diff") || options.has("--code-commit")) && !options.has("--method-artifact")) throw new Error("Recorded code/diff identity requires --method-artifact and --dependency-lock");
  // These bytes establish supplied artifact identity, not an attestation that
  // the artifact includes the entire executing dependency graph.
  const identity = options.has("--method-artifact") ? createSnapshotArtifactIdentity({
    methodArtifactBytes: fs.readFileSync(options.get("--method-artifact")!, "utf8"),
    dependencyLockBytes: fs.readFileSync(options.get("--dependency-lock")!, "utf8"),
    ...(options.has("--dirty-diff") ? { dirtyDiffBytes: fs.readFileSync(options.get("--dirty-diff")!, "utf8") } : {}),
    ...(options.has("--code-commit") ? { codeCommit: options.get("--code-commit")! } : {}),
  }) : undefined;
  let result: ReturnType<ReplayFunction>;
  if (options.has("--runtime-build")) {
    snapshot = verifyRunInputSnapshot(snapshot);
    const distDir = resolve(options.get("--runtime-build")!);
    const buildId = fs.readFileSync(join(distDir, "BUILD_ID"), "utf8").trim();
    const runtimeIdentity = readRuntimeArtifactIdentity({ distDir, buildId });
    if (!runtimeIdentity) throw new Error("Runtime build artifact identity is unavailable or invalid");
    const bundlePath = join(distDir, "server", "metis-stageb-replay.js");
    if (!fs.existsSync(bundlePath) || !fs.lstatSync(bundlePath).isFile()) throw new Error("Runtime replay bundle is unavailable");
    // Explicit opt-in authorizes module evaluation. Unsigned content hashes do
    // not authenticate code; the exported token can only be checked afterwards.
    const loaded = await import(pathToFileURL(bundlePath).href);
    const frozen = (loaded.default ?? loaded) as { RUNTIME_REPLAY_BUILD_ID?: unknown; CURRENT_SNAPSHOT_VERSIONS?: unknown; runStageB?: unknown; replayRunInputSnapshot?: ReplayFunction };
    if (frozen.RUNTIME_REPLAY_BUILD_ID !== buildId || typeof frozen.runStageB !== "function" ||
      typeof frozen.CURRENT_SNAPSHOT_VERSIONS !== "object" || frozen.CURRENT_SNAPSHOT_VERSIONS === null || typeof frozen.replayRunInputSnapshot !== "function") {
      throw new Error("Runtime replay bundle does not match its retained build identity");
    }
    // Both version checks and calculations execute inside the retained bundle.
    result = frozen.replayRunInputSnapshot(snapshot, runtimeIdentity);
  } else {
    const { replayRunInputSnapshot } = await import("../src/pipeline/replayRunInput");
    result = replayRunInputSnapshot(snapshot, identity);
  }
  const json = canonicalSnapshotJson(result);
  if (options.has("--output")) fs.writeFileSync(options.get("--output")!, `${json}\n`, { flag: "wx" });
  else process.stdout.write(`${json}\n`);
  if (options.has("--export-snapshot")) fs.writeFileSync(options.get("--export-snapshot")!, `${canonicalSnapshotJson(snapshot)}\n`, { flag: "wx" });
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
