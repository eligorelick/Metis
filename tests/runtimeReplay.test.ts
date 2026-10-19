import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileStageBReplay } from "../scripts/freeze-stageb-replay.mjs";
import { createRuntimeArtifactManifest } from "../scripts/runtime-artifact-manifest.mjs";
import { canonicalSnapshotJson, captureRunInputSnapshot, CURRENT_SNAPSHOT_VERSIONS } from "@/pipeline/runInputSnapshot";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { runStageB } from "@/pipeline/compute";

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("frozen runtime build replay CLI", () => {
  it("refuses to emit a replay graph with filesystem capabilities", async () => {
    const root = mkdtempSync(join(tmpdir(), "metis-nonoffline-build-")); roots.push(root);
    mkdirSync(join(root, "scripts"));
    writeFileSync(join(root, "scripts", "stageb-runtime-replay-entry.ts"), 'import fs from "node:fs"; export const runStageB = () => fs.readFileSync("secret");');
    await expect(Promise.resolve().then(() => compileStageBReplay(root, "unsafe-build"))).rejects.toThrow(/non-offline.*dependency/i);
  });

  it("requires explicit trust before evaluating a self-authored runtime manifest", { timeout: 30_000 }, () => {
    const root = mkdtempSync(join(tmpdir(), "metis-untrusted-replay-")); roots.push(root);
    const distDir = join(root, ".next"), marker = join(root, "evaluated.txt"), input = join(root, "snapshot.json");
    mkdirSync(join(distDir, "server"), { recursive: true });
    writeFileSync(join(distDir, "BUILD_ID"), "untrusted-build");
    const bundle = join(distDir, "server", "metis-stageb-replay.js");
    writeFileSync(bundle, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'evaluated'); module.exports = {};`);
    const manifest = createRuntimeArtifactManifest({ distDir, buildId: "untrusted-build", methodArtifactBytes: "method", dependencyLockBytes: "lock" });
    writeFileSync(join(distDir, "runtime-artifact-identity.json"), JSON.stringify(manifest));
    writeFileSync(input, canonicalSnapshotJson(captureRunInputSnapshot(completeCurrencyBundle({}), { evIncludeLeases: false }, undefined, manifest.identity)));
    const args = ["--conditions=react-server", "--import", "tsx", "scripts/replay-run-inputs.ts", "--snapshot", input, "--runtime-build", distDir];
    const missing = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
    expect(missing.status).toBe(1);
    expect(existsSync(marker)).toBe(false);
    expect(missing.stderr).toMatch(/trust-local-build yes/i);
    for (const value of ["no", "true"]) {
      const invalid = spawnSync(process.execPath, [...args, "--trust-local-build", value], { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
      expect(invalid.status).toBe(1);
      expect(invalid.stderr).toMatch(/trust-local-build yes/i);
      expect(existsSync(marker)).toBe(false);
    }
    const outsideRuntime = spawnSync(process.execPath, [...args.slice(0, -2), "--trust-local-build", "yes"], { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
    expect(outsideRuntime.status).toBe(1);
    expect(outsideRuntime.stderr).toMatch(/requires --runtime-build/i);
    expect(existsSync(marker)).toBe(false);
    const trustedArgs = [...args, "--trust-local-build", "yes"];
    for (const dependencyLockHash of [[manifest.identity.dependencyLockHash], undefined]) {
      writeFileSync(join(distDir, "runtime-artifact-identity.json"), JSON.stringify({ ...manifest, identity: { ...manifest.identity, dependencyLockHash } }));
      const invalidHash = spawnSync(process.execPath, trustedArgs, { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
      expect(invalidHash.status).toBe(1);
      expect(invalidHash.stderr).toMatch(/artifact identity.*invalid/i);
      expect(existsSync(marker)).toBe(false);
    }
    renameSync(bundle, join(distDir, "server", "placeholder.js"));
    writeFileSync(join(distDir, "runtime-artifact-identity.json"), JSON.stringify(createRuntimeArtifactManifest({ distDir, buildId: "untrusted-build", methodArtifactBytes: "method", dependencyLockBytes: "lock" })));
    const missingBundle = spawnSync(process.execPath, trustedArgs, { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
    expect(missingBundle.status).toBe(1);
    expect(missingBundle.stderr).toMatch(/replay bundle.*unavailable/i);
    expect(existsSync(marker)).toBe(false);
    renameSync(join(distDir, "server", "placeholder.js"), bundle);
    writeFileSync(join(distDir, "runtime-artifact-identity.json"), JSON.stringify(manifest));
    const originalSnapshot = readFileSync(input, "utf8");
    for (const field of ["symbol", "format"]) {
      const invalidSnapshot = JSON.parse(originalSnapshot);
      if (field === "symbol") invalidSnapshot.content.bundle.symbol = "tampered";
      else invalidSnapshot.content.formatVersion = "UNKNOWN_FORMAT";
      writeFileSync(input, JSON.stringify(invalidSnapshot));
      const invalidSchema = spawnSync(process.execPath, trustedArgs, { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
      expect(invalidSchema.status).toBe(1);
      expect(invalidSchema.stderr).toMatch(/snapshot.*integrity|snapshot.*format/i);
      expect(existsSync(marker)).toBe(false);
    }
  });

  it("executes retained Stage B after source mutation without git and rejects mismatched evidence", { timeout: 30_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), "metis-frozen-replay-")); roots.push(root);
    const project = process.cwd();
    symlinkSync(join(project, "node_modules"), join(root, "node_modules"), "junction");
    cpSync(join(project, "src"), join(root, "src"), { recursive: true });
    cpSync(join(project, "config"), join(root, "config"), { recursive: true });
    cpSync(join(project, "tsconfig.json"), join(root, "tsconfig.json"));
    cpSync(join(project, "package.json"), join(root, "package.json"));
    mkdirSync(join(root, "scripts"));
    for (const file of ["stageb-runtime-replay-entry.ts", "runtime-artifact-manifest.mjs"]) cpSync(join(project, "scripts", file), join(root, "scripts", file));
    const computeFile = join(root, "src", "pipeline", "compute.ts");
    writeFileSync(computeFile, readFileSync(computeFile, "utf8").replace("symbol: bundle.symbol,", 'symbol: "FROZEN",'));
    const versionsFile = join(root, "src", "pipeline", "runInputSnapshot.ts");
    writeFileSync(versionsFile, readFileSync(versionsFile, "utf8").replace(/export const STAGE_B_IMPLEMENTATION_VERSION = "[^"]+"/, 'export const STAGE_B_IMPLEMENTATION_VERSION = "FROZEN_STAGE_B"'));
    const frozenVersions = { ...CURRENT_SNAPSHOT_VERSIONS, stageB: "FROZEN_STAGE_B" };
    const distDir = join(root, ".next");
    mkdirSync(join(distDir, "server"), { recursive: true });
    writeFileSync(join(distDir, "BUILD_ID"), "frozen-build");
    vi.stubEnv("TEST_REPLAY_SECRET", "SECRET-SENTINEL-MUST-NOT-BE-EMBEDDED");
    const frozenBytes = await compileStageBReplay(root, "frozen-build");
    expect(Buffer.from(frozenBytes).toString("utf8")).not.toContain("SECRET-SENTINEL-MUST-NOT-BE-EMBEDDED");
    writeFileSync(join(distDir, "server", "metis-stageb-replay.js"), frozenBytes);
    const manifest = createRuntimeArtifactManifest({ distDir, buildId: "frozen-build", methodArtifactBytes: "packaged method", dependencyLockBytes: "packaged lock" });
    writeFileSync(join(distDir, "runtime-artifact-identity.json"), JSON.stringify(manifest));
    expect(existsSync(join(root, ".git"))).toBe(false);
    const bundle = completeCurrencyBundle({});
    for (const statements of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) if (statements.ok) for (const row of statements.value.data.rows) {
      row.operatingLeaseLiability = 50_000_000; row.capitalLeaseObligations = 60_000_000;
    }
    (bundle as unknown as Record<string, unknown>).rawEvidence = { apiKey: "DO-NOT-STORE" };
    const snapshot = captureRunInputSnapshot(bundle, { evIncludeLeases: true }, frozenVersions, manifest.identity);
    const cases = [
      { bundle: snapshot.content.bundle, config: { evIncludeLeases: true } },
      { bundle: completeCurrencyBundle({ bank: true }), config: { evIncludeLeases: false } },
      { bundle: completeCurrencyBundle({ reit: true }), config: { evIncludeLeases: true } },
      { bundle: completeCurrencyBundle({ burning: true, quarterlyRevenue: 200 }), config: { evIncludeLeases: false } },
    ];
    const isolated = spawnSync(process.execPath, ["-e", `
      const fs = require('node:fs'), Module = require('node:module');
      const saved = JSON.parse(fs.readFileSync(0, 'utf8'));
      const original = Module._load;
      Module._load = function(id, ...rest) {
        if (!id.startsWith(process.argv[1]) && id !== 'node:crypto') throw new Error('Forbidden replay dependency: ' + id);
        return original.call(this, id, ...rest);
      };
      globalThis.fetch = () => { throw new Error('Replay network forbidden'); };
      const frozen = require(process.argv[1]);
      let refusedAmbientConfig = false;
      try { frozen.runStageB(saved.snapshot.content.bundle); } catch (error) { refusedAmbientConfig = /captured calculation options/.test(error.message); }
      if (!refusedAmbientConfig) throw new Error('Replay accepted ambient settings');
      const results = saved.cases.map(testCase => {
        process.env.METIS_EV_INCLUDE_LEASES = testCase.config.evIncludeLeases ? 'false' : 'true';
        return frozen.runStageB(testCase.bundle, testCase.config);
      });
      process.stdout.write(JSON.stringify({ replay: frozen.replayRunInputSnapshot(saved.snapshot, saved.identity), results }));
    `, join(distDir, "server", "metis-stageb-replay.js")], { cwd: project, encoding: "utf8", input: canonicalSnapshotJson({ snapshot, identity: manifest.identity, cases }), timeout: 20_000 });
    expect(isolated.status, isolated.stderr).toBe(0);
    const isolatedResult = JSON.parse(isolated.stdout);
    expect(isolatedResult.replay).toMatchObject({ offline: true, computed: { symbol: "FROZEN" } });
    expect(isolatedResult.results).toEqual(cases.map(testCase => ({ ...runStageB(testCase.bundle, testCase.config), symbol: "FROZEN" })));
    const input = join(root, "snapshot.json"), output = join(root, "result.json");
    writeFileSync(input, canonicalSnapshotJson(snapshot));
    writeFileSync(computeFile, 'throw new Error("changed checkout must never execute");');
    writeFileSync(join(root, "package-lock.json"), "changed current lock");
    const args = ["--conditions=react-server", "--import", "tsx", "scripts/replay-run-inputs.ts", "--snapshot", input, "--runtime-build", distDir, "--trust-local-build", "yes", "--output", output];
    const child = spawnSync(process.execPath, args, { cwd: project, encoding: "utf8", timeout: 20_000 });
    expect(child.status, child.stderr).toBe(0);
    const result = JSON.parse(readFileSync(output, "utf8"));
    expect(result).toMatchObject({ offline: true, custody: "local-content-identity", computed: { symbol: "FROZEN" } });
    expect(result.computed.valuation).toEqual(runStageB(snapshot.content.bundle, { evIncludeLeases: true }).valuation);
    expect(result.computed.valuation).not.toEqual(runStageB(snapshot.content.bundle, { evIncludeLeases: false }).valuation);
    expect(JSON.stringify(result)).not.toContain("DO-NOT-STORE");
    rmSync(output);
    const alteredSnapshot = captureRunInputSnapshot(bundle, { evIncludeLeases: true }, frozenVersions, { ...manifest.identity, dependencyLockHash: "f".repeat(64) });
    writeFileSync(input, canonicalSnapshotJson(alteredSnapshot));
    const mismatch = spawnSync(process.execPath, args, { cwd: project, encoding: "utf8", timeout: 20_000 });
    expect(mismatch.status).toBe(1);
    expect(mismatch.stderr).toMatch(/artifact|custody/i);
    expect(existsSync(output)).toBe(false);
    writeFileSync(input, canonicalSnapshotJson(snapshot));
    writeFileSync(join(distDir, "BUILD_ID"), "foreign-build");
    const foreign = spawnSync(process.execPath, args, { cwd: project, encoding: "utf8", timeout: 20_000 });
    expect(foreign.status).toBe(1);
    expect(foreign.stderr).toMatch(/runtime|build|identity/i);
    expect(existsSync(output)).toBe(false);
    const foreignManifest = createRuntimeArtifactManifest({ distDir, buildId: "foreign-build", methodArtifactBytes: "packaged method", dependencyLockBytes: "packaged lock" });
    writeFileSync(join(distDir, "runtime-artifact-identity.json"), JSON.stringify(foreignManifest));
    const foreignBundle = spawnSync(process.execPath, args, { cwd: project, encoding: "utf8", timeout: 20_000 });
    expect(foreignBundle.status).toBe(1);
    expect(foreignBundle.stderr).toMatch(/bundle.*build identity/i);
    expect(existsSync(output)).toBe(false);
    const conflict = spawnSync(process.execPath, [...args, "--method-artifact", input, "--dependency-lock", input], { cwd: project, encoding: "utf8", timeout: 20_000 });
    expect(conflict.status).toBe(1);
    expect(conflict.stderr).toMatch(/not both/i);
  });
});
