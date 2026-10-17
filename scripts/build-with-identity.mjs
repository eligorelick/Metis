import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRuntimeArtifactManifest } from "./runtime-artifact-manifest.mjs";
import { buildInputFingerprint, compileStageBReplay } from "./freeze-stageb-replay.mjs";

const root = process.cwd();
const distDir = join(root, ".next");
const buildId = randomUUID();
const inputFingerprint = buildInputFingerprint(root);
// Capture the lock and method supplied to this build before invoking Next.
const methodArtifactBytes = readFileSync(join(root, "docs", "METHODOLOGY.md"));
const dependencyLockBytes = readFileSync(join(root, "package-lock.json"));
let codeCommit = null;
let dirtyDiffBytes;
try {
  const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const normalize = (directory) => process.platform === "win32" ? resolve(directory).toLowerCase() : resolve(directory);
  if (normalize(gitRoot) !== normalize(root)) throw new Error("Packaged build has no project git metadata");
  codeCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  dirtyDiffBytes = execFileSync("git", ["diff", "--binary", "HEAD", "--", "src", "config", "scripts", "docs/METHODOLOGY.md", "package.json", "package-lock.json", "next.config.ts"],
    { cwd: root, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
} catch { codeCommit = null; dirtyDiffBytes = undefined; }
rmSync(join(distDir, "runtime-artifact-identity.json"), { force: true });
const frozenReplay = await compileStageBReplay(root, buildId);
if (buildInputFingerprint(root) !== inputFingerprint) throw new Error("Inputs changed during build; refusing mixed artifact identity");
const built = spawnSync(process.execPath, [join(root, "node_modules", "next", "dist", "bin", "next"), "build", ...process.argv.slice(2)],
  { cwd: root, stdio: "inherit", env: { ...process.env, METIS_RUNTIME_BUILD_ID: buildId } });
if (built.error) throw built.error;
if (built.status !== 0) process.exit(built.status ?? 1);
if (buildInputFingerprint(root) !== inputFingerprint) throw new Error("Inputs changed during build; refusing mixed artifact identity");
writeFileSync(join(distDir, "server", "metis-stageb-replay.js"), frozenReplay);
const manifest = createRuntimeArtifactManifest({ distDir, buildId, methodArtifactBytes, dependencyLockBytes, codeCommit, dirtyDiffBytes });
writeFileSync(join(distDir, "runtime-artifact-identity.json"), `${JSON.stringify(manifest)}\n`, { flag: "wx" });
