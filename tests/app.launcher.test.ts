/**
 * `npm run app` (scripts/run-app.mjs) reuses a production build only while it
 * matches the source. These tests pin the decision: every state in which the
 * build on disk is not provably the one built from the current inputs asks for
 * a rebuild, and only an exact match reuses it.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appInputFingerprint, buildStampPath, EXTRA_BUNDLED_INPUTS, recordBuild, staleBuildReason } from "../scripts/run-app.mjs";

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

  it("treats a change to a file bundled from outside the source folders as a source change", () => {
    const write = (relative: string, content: string): void => {
      mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      writeFileSync(path.join(root, relative), content);
    };
    write("src/page.tsx", "export default 1;\n");
    const before = appInputFingerprint(root);
    for (const relative of EXTRA_BUNDLED_INPUTS) {
      write(relative, "first");
      const withFile = appInputFingerprint(root);
      write(relative, "second");
      const changed = appInputFingerprint(root);
      expect(new Set([before, withFile, changed]).size).toBe(3);
      rmSync(path.join(root, relative));
      expect(appInputFingerprint(root)).toBe(before);
    }
    write("src/page.tsx", "export default 2;\n");
    expect(appInputFingerprint(root)).not.toBe(before);
    // The saved sample report is read from disk on each request, so it is not a build input.
    write("fixtures/report/DEMO-current.json", "{}");
    write("src/page.tsx", "export default 1;\n");
    expect(appInputFingerprint(root)).toBe(before);
  });

  it("covers every file the app imports from outside the fingerprinted folders", () => {
    const repo = process.cwd();
    const covered = ["src/", "config/", "scripts/"];
    const outside = new Set<string>();
    const visit = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (/\.(?:ts|tsx|mjs|js|css)$/.test(entry.name)) {
          const text = readFileSync(full, "utf8");
          for (const match of text.matchAll(/(?:from\s+|import\s+|import\(\s*|require\(\s*|@import\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
            const target = path.relative(repo, path.resolve(dir, match[1]!)).split(path.sep).join("/");
            if (!covered.some((prefix) => target.startsWith(prefix))) outside.add(target);
          }
        }
      }
    };
    visit(path.join(repo, "src"));
    expect([...outside].sort()).toEqual(EXTRA_BUNDLED_INPUTS.filter((input) => input.startsWith("fixtures/")).sort());
  });

  it("refuses to record a build that has no build id", () => {
    expect(() => recordBuild(root, "inputs-a")).toThrow(/without a build id/);
  });
});
