import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRuntimeArtifactManifest, readRuntimeArtifactIdentity } from "../scripts/runtime-artifact-manifest.mjs";
import { getRuntimeSnapshotArtifactIdentity } from "@/pipeline/runtimeArtifactIdentity";
import { captureRunInputSnapshot } from "@/pipeline/runInputSnapshot";
import { replayRunInputSnapshot } from "@/pipeline/replayRunInput";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const roots: string[] = [];
const sha = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
function fixture(buildId = "build-a") {
  const root = mkdtempSync(join(tmpdir(), "metis-runtime-identity-"));
  roots.push(root);
  const distDir = join(root, ".next");
  mkdirSync(join(distDir, "server", "chunks"), { recursive: true });
  writeFileSync(join(distDir, "BUILD_ID"), buildId);
  writeFileSync(join(distDir, "server", "chunks", "compute.js"), "export const score = 7;");
  writeFileSync(join(distDir, "server", "routes.json"), '{"route":"compute"}');
  const input = { distDir, buildId, methodArtifactBytes: "method at build", dependencyLockBytes: "lock at build", codeCommit: "a".repeat(40), dirtyDiffBytes: "build diff" };
  const manifest = createRuntimeArtifactManifest(input);
  writeFileSync(join(distDir, "runtime-artifact-identity.json"), JSON.stringify(manifest));
  return { root, distDir, manifest, input };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("runtime artifact identity", () => {
  it.each(["methodSourceHash", "methodArtifactHash", "dependencyLockHash", "dirtyDiffHash"])("treats non-string %s evidence as incomplete without breaking snapshot capture", (field) => {
    const { root, distDir, manifest } = fixture();
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.stubEnv("METIS_RUNTIME_BUILD_ID", "build-a");
    for (const value of [["a".repeat(64)], {}, 123, true, undefined, ...(field === "dirtyDiffHash" ? [] : [null])]) {
      const altered = JSON.parse(JSON.stringify(manifest));
      if (field === "methodSourceHash") {
        altered.methodSourceHash = value;
        altered.identity.methodArtifactHash = sha(JSON.stringify({ methodSourceHash: value, artifacts: altered.artifacts }));
      } else altered.identity[field] = value;
      writeFileSync(join(distDir, "runtime-artifact-identity.json"), JSON.stringify(altered));
      const identity = getRuntimeSnapshotArtifactIdentity();
      expect(identity, `${field} must reject ${JSON.stringify(value)}`).toBeUndefined();
      expect(() => captureRunInputSnapshot(completeCurrencyBundle({}), { evIncludeLeases: false }, undefined, identity)).not.toThrow();
    }
  });

  it("captures lock and method before compilation and writes identity only after a successful build", () => {
    const { root, distDir } = fixture();
    rmSync(join(distDir, "runtime-artifact-identity.json"));
    mkdirSync(join(root, "docs"));
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "compute.ts"), "original source");
    writeFileSync(join(root, "scripts", "stageb-runtime-replay-entry.ts"), 'export const RUNTIME_REPLAY_BUILD_ID = process.env.METIS_RUNTIME_BUILD_ID; export const runStageB = () => ({symbol: "frozen"});');
    mkdirSync(join(root, "node_modules", "next", "dist", "bin"), { recursive: true });
    writeFileSync(join(root, "docs", "METHODOLOGY.md"), "method before compile");
    writeFileSync(join(root, "package-lock.json"), "lock before compile");
    writeFileSync(join(root, "node_modules", "next", "dist", "bin", "next"), `
      const fs = require('node:fs');
      fs.writeFileSync('.next/BUILD_ID', process.env.METIS_RUNTIME_BUILD_ID);
      if (process.env.TEST_BUILD_MUTATE) fs.writeFileSync(process.env.TEST_BUILD_MUTATE, 'changed during compilation');
      if (process.env.TEST_BUILD_FAIL) process.exit(1);
    `);
    const script = join(process.cwd(), "scripts", "build-with-identity.mjs");
    const built = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", env: { ...process.env, TEST_BUILD_FAIL: "" } });
    expect(built.status, built.stderr).toBe(0);
    const buildId = readFileSync(join(distDir, "BUILD_ID"), "utf8");
    expect(readRuntimeArtifactIdentity({ distDir, buildId })).toMatchObject({ dependencyLockHash: sha("lock before compile") });
    expect(JSON.parse(readFileSync(join(distDir, "runtime-artifact-identity.json"), "utf8")).methodSourceHash).toBe(sha("method before compile"));
    expect(JSON.parse(readFileSync(join(distDir, "runtime-artifact-identity.json"), "utf8")).identity.codeCommit).toBeNull();
    for (const file of ["package-lock.json", "docs/METHODOLOGY.md", "src/compute.ts"]) {
      const before = readFileSync(join(root, file));
      const changed = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", env: { ...process.env, TEST_BUILD_MUTATE: file } });
      expect(changed.status).toBe(1);
      expect(changed.stderr).toMatch(/changed.*build|build.*changed/i);
      expect(existsSync(join(distDir, "runtime-artifact-identity.json"))).toBe(false);
      writeFileSync(join(root, file), before);
    }
    const failed = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", env: { ...process.env, TEST_BUILD_FAIL: "1" } });
    expect(failed.status).toBe(1);
    expect(existsSync(join(distDir, "runtime-artifact-identity.json"))).toBe(false);
    expect(readRuntimeArtifactIdentity({ distDir, buildId })).toBeUndefined();
  });

  it("uses the compiled build and captured lock after the source checkout changes", () => {
    const { root, distDir, manifest } = fixture();
    const before = readRuntimeArtifactIdentity({ distDir, buildId: "build-a" });
    expect(before).toMatchObject({ dependencyLockHash: sha("lock at build"), codeCommit: "a".repeat(40), dirtyDiffHash: sha("build diff") });
    expect(before?.methodArtifactHash).toMatch(/^[a-f0-9]{64}$/);
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "compute.ts"), "changed checkout");
    writeFileSync(join(root, "package-lock.json"), "new lock");
    expect(readRuntimeArtifactIdentity({ distDir, buildId: "build-a" })).toEqual(before);
    expect(JSON.stringify(manifest)).not.toContain(root);
    expect(JSON.stringify(manifest)).not.toContain("method at build");
    expect(JSON.stringify(manifest)).not.toContain("lock at build");
  });

  it.each(["changed", "missing", "extra"])("omits identity for %s compiled artifacts", (mutation) => {
    const { distDir } = fixture();
    const compiled = join(distDir, "server", "chunks", "compute.js");
    if (mutation === "changed") writeFileSync(compiled, "stale or changed compiled code");
    if (mutation === "missing") rmSync(compiled);
    if (mutation === "extra") writeFileSync(join(distDir, "server", "new.js"), "new module");
    expect(readRuntimeArtifactIdentity({ distDir, buildId: "build-a" })).toBeUndefined();
  });

  it("refuses a symlinked server root even when its bytes match the manifest", () => {
    const { root, distDir } = fixture();
    const moved = join(root, "outside-server");
    renameSync(join(distDir, "server"), moved);
    symlinkSync(moved, join(distDir, "server"), "junction");
    expect(readRuntimeArtifactIdentity({ distDir, buildId: "build-a" })).toBeUndefined();
  });

  it("refuses symlinked directories within the compiled graph", () => {
    const { root, distDir } = fixture();
    const moved = join(root, "outside-chunks");
    renameSync(join(distDir, "server", "chunks"), moved);
    symlinkSync(moved, join(distDir, "server", "chunks"), "junction");
    expect(readRuntimeArtifactIdentity({ distDir, buildId: "build-a" })).toBeUndefined();
  });

  it.each(["missing", "malformed", "wrong-format", "method-metadata", "json-artifact", "empty-graph"])("leaves identity unavailable for %s build evidence", (mutation) => {
    const { distDir, manifest } = fixture();
    const file = join(distDir, "runtime-artifact-identity.json");
    if (mutation === "missing") rmSync(file);
    if (mutation === "malformed") writeFileSync(file, "{");
    if (mutation === "wrong-format") writeFileSync(file, JSON.stringify({ ...manifest, formatVersion: "future" }));
    if (mutation === "method-metadata") writeFileSync(file, JSON.stringify({ ...manifest, methodSourceHash: sha("different method") }));
    if (mutation === "json-artifact") writeFileSync(join(distDir, "server", "routes.json"), "{}");
    if (mutation === "empty-graph") rmSync(join(distDir, "server", "chunks", "compute.js"));
    expect(readRuntimeArtifactIdentity({ distDir, buildId: "build-a" })).toBeUndefined();
  });

  it("refuses foreign build IDs, tampered identity hashes and unsafe manifest paths", () => {
    const { distDir, manifest } = fixture();
    expect(readRuntimeArtifactIdentity({ distDir, buildId: "old-loaded-build" })).toBeUndefined();
    writeFileSync(join(distDir, "BUILD_ID"), "different-disk-build");
    expect(readRuntimeArtifactIdentity({ distDir, buildId: "build-a" })).toBeUndefined();
    writeFileSync(join(distDir, "BUILD_ID"), "build-a");
    for (const altered of [
      { ...manifest, identity: { ...manifest.identity, methodArtifactHash: "f".repeat(64) } },
      { ...manifest, artifacts: [{ path: "../outside.js", hash: sha("outside") }] },
      { ...manifest, identity: { ...manifest.identity, codeCommit: "credential-value" } },
    ]) {
      writeFileSync(join(distDir, "runtime-artifact-identity.json"), JSON.stringify(altered));
      expect(readRuntimeArtifactIdentity({ distDir, buildId: "build-a" })).toBeUndefined();
    }
  });

  it.each([undefined, "", "foreign"])("leaves unbound source/dev captures incomplete for build token %j", (token) => {
    const { root } = fixture();
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.stubEnv("METIS_RUNTIME_BUILD_ID", token);
    const identity = getRuntimeSnapshotArtifactIdentity();
    expect(identity).toBeUndefined();
    expect(captureRunInputSnapshot(completeCurrencyBundle({}), { evIncludeLeases: false }, undefined, identity).content.custody).toBeUndefined();
  });

  it("requires matching compiled artifacts for replay and preserves redaction and deterministic Stage B", () => {
    const { root, distDir } = fixture();
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.stubEnv("METIS_RUNTIME_BUILD_ID", "build-a");
    const identity = getRuntimeSnapshotArtifactIdentity();
    expect(identity).toBeDefined();
    const bundle = completeCurrencyBundle({});
    (bundle as unknown as Record<string, unknown>).rawEvidence = { apiKey: "DO-NOT-STORE", excerpt: "Evidence" };
    const snapshot = captureRunInputSnapshot(bundle, { evIncludeLeases: false }, undefined, identity);
    expect(JSON.stringify(snapshot)).not.toContain("DO-NOT-STORE");
    const first = replayRunInputSnapshot(snapshot, identity);
    expect(replayRunInputSnapshot(snapshot, identity).computed).toEqual(first.computed);
    writeFileSync(join(distDir, "server", "chunks", "compute.js"), "changed build");
    expect(() => replayRunInputSnapshot(snapshot, getRuntimeSnapshotArtifactIdentity())).toThrow(/artifact|custody/i);
    expect(readFileSync(join(distDir, "runtime-artifact-identity.json"), "utf8")).not.toContain("DO-NOT-STORE");
  });
});
