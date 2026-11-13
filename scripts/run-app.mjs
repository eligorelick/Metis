/**
 * Everyday launcher: serve the production build, building it first when it is
 * missing or older than the source.
 *
 *   npm run app                  # http://127.0.0.1:3000
 *   npm run app -- -p 3100       # extra arguments go to `next start`
 *
 * `npm run dev` is for changing the code. Its server adds debugging work to
 * every page, which makes a long saved report several times slower to open
 * than the production build this command serves.
 *
 * The build is reused only while its inputs are unchanged: the same input
 * fingerprint the build itself checks (src, config, scripts, the methodology
 * document, the lockfile and the build settings) is recorded next to the build
 * id after a successful build, and both must still match.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildInputFingerprint } from "./freeze-stageb-replay.mjs";

/** Where the last successful build's inputs are recorded (outside the build output, untracked). */
export function buildStampPath(root) {
  return join(root, ".local", "app-build.json");
}

function readBuildId(root) {
  try {
    return readFileSync(join(root, ".next", "BUILD_ID"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

/** Why the build must run again, or null when the existing build matches the source. */
export function staleBuildReason(root, fingerprint = buildInputFingerprint(root)) {
  const buildId = readBuildId(root);
  if (buildId === null || !existsSync(join(root, ".next", "runtime-artifact-identity.json"))) return "no finished build was found";
  let stamp;
  try {
    stamp = JSON.parse(readFileSync(buildStampPath(root), "utf8"));
  } catch {
    return "the existing build has no record of what it was built from";
  }
  if (stamp === null || typeof stamp !== "object") return "the existing build has no record of what it was built from";
  if (stamp.buildId !== buildId) return "the build on disk is not the one last recorded";
  if (stamp.fingerprint !== fingerprint) return "the source changed since the last build";
  return null;
}

/** Record what a finished build was built from. */
export function recordBuild(root, fingerprint) {
  const buildId = readBuildId(root);
  if (buildId === null) throw new Error("The build finished without a build id; refusing to record it.");
  mkdirSync(join(root, ".local"), { recursive: true });
  writeFileSync(buildStampPath(root), `${JSON.stringify({ buildId, fingerprint })}\n`);
}

function main() {
  const root = process.cwd();
  const fingerprint = buildInputFingerprint(root);
  const reason = staleBuildReason(root, fingerprint);
  if (reason !== null) {
    console.log(`[app] Building first: ${reason}. This takes a minute or two.`);
    const built = spawnSync(process.execPath, [join(root, "scripts", "build-with-identity.mjs")], { cwd: root, stdio: "inherit" });
    if (built.error) throw built.error;
    if (built.status !== 0) process.exit(built.status ?? 1);
    // The build refuses inputs that changed while it ran, so this fingerprint is what it built.
    recordBuild(root, fingerprint);
  } else {
    console.log("[app] The build is up to date.");
  }
  const started = spawnSync(process.execPath, [join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", ...process.argv.slice(2)],
    { cwd: root, stdio: "inherit" });
  if (started.error) throw started.error;
  process.exit(started.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
