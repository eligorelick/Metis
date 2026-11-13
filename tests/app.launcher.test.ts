/**
 * `npm run app` (scripts/run-app.mjs) reuses a production build only while it
 * matches the source. These tests pin the decision: every state in which the
 * build on disk is not provably the one built from the current inputs asks for
 * a rebuild, and only an exact match reuses it.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildStampPath, recordBuild, staleBuildReason } from "../scripts/run-app.mjs";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "metis-app-launcher-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeBuild(buildId: string, withIdentity = true): void {
  mkdirSync(path.join(root, ".next"), { recursive: true });
  writeFileSync(path.join(root, ".next", "BUILD_ID"), buildId);
  if (withIdentity) writeFileSync(path.join(root, ".next", "runtime-artifact-identity.json"), "{}\n");
}

describe("app launcher build reuse", () => {
  it("builds when there is no build", () => {
    expect(staleBuildReason(root, "inputs-a")).toBe("no finished build was found");
  });

  it("builds when the build never finished writing its identity", () => {
    writeBuild("build-1", false);
    recordBuild(root, "inputs-a");
    expect(staleBuildReason(root, "inputs-a")).toBe("no finished build was found");
  });

  it("builds when a build exists but nothing records what it was built from", () => {
    writeBuild("build-1");
    expect(staleBuildReason(root, "inputs-a")).toBe("the existing build has no record of what it was built from");
    mkdirSync(path.join(root, ".local"), { recursive: true });
    for (const unreadable of ["not json", "null", "42"]) {
      writeFileSync(buildStampPath(root), unreadable);
      expect(staleBuildReason(root, "inputs-a")).toBe("the existing build has no record of what it was built from");
    }
  });

  it("reuses the build only when both the build id and the inputs match", () => {
    writeBuild("build-1");
    recordBuild(root, "inputs-a");
    expect(JSON.parse(readFileSync(buildStampPath(root), "utf8"))).toEqual({ buildId: "build-1", fingerprint: "inputs-a" });
    expect(staleBuildReason(root, "inputs-a")).toBeNull();
    // The source changed.
    expect(staleBuildReason(root, "inputs-b")).toBe("the source changed since the last build");
    // Another build replaced the recorded one (for example a manual `npm run build`).
    writeBuild("build-2");
    expect(staleBuildReason(root, "inputs-a")).toBe("the build on disk is not the one last recorded");
  });

  it("refuses to record a build that has no build id", () => {
    expect(() => recordBuild(root, "inputs-a")).toThrow(/without a build id/);
  });
});
