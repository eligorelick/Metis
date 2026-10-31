import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { restoreQcom53Task12Lock } from "./helpers/qcom53Task12Lock";

const lockPath = path.join(process.cwd(), "package-lock.json");
const source = readFileSync(lockPath, "utf8");
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const changedPaths = [
  "",
  "node_modules/@isaacs/nonrecursive-glob-match",
  "node_modules/@typescript-eslint/typescript-estree/node_modules/balanced-match",
  "node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion",
  "node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch",
  "node_modules/balanced-match",
  "node_modules/brace-expansion",
  "node_modules/concat-map",
  "node_modules/minimatch",
  "node_modules/minimatch-modern",
  "scripts/legacy-minimatch",
];

describe("Task 12 exact historical lock restoration", () => {
  it("restores only the eleven authorized nodes and exact old bytes without changing the installed lock", () => {
    expect(hash(source)).toBe("9626141684a0c02a95ee949bd7a2ecb06c44d6706956ae7b069b3d8ee903668f");
    const restored = restoreQcom53Task12Lock(source);
    expect(Buffer.byteLength(restored)).toBe(327945);
    expect(hash(restored)).toBe("39ef0024e898fa8db387dfeef99bb97a9463fd7a8a584082e961feaec8770d95");
    const current = JSON.parse(source), before = JSON.parse(restored);
    const keys = [...new Set([...Object.keys(current.packages), ...Object.keys(before.packages)])];
    expect(keys.filter(key => JSON.stringify(current.packages[key]) !== JSON.stringify(before.packages[key])).sort()).toEqual(changedPaths);
    const runtime = Object.entries(current.packages).filter(([key, value]) => key !== "" && !(value as { dev?: boolean; link?: boolean }).dev && !(value as { link?: boolean }).link);
    // 148 non-root runtime nodes plus the root's runtime declarations below.
    expect(runtime).toHaveLength(148);
    for (const [key, value] of runtime) expect(before.packages[key]).toEqual(value);
    expect(before.packages["node_modules/fast-glob"]).toEqual(current.packages["node_modules/fast-glob"]);
    expect(before.packages[""].dependencies).toEqual(current.packages[""].dependencies);
    expect(readFileSync(lockPath, "utf8")).toBe(source);
    // This is a one-step inverse of the current patch, not a generic normalizer.
    expect(() => restoreQcom53Task12Lock(restored)).toThrow(/Task12 lock.*current bytes/);
  });

  it.each(changedPaths)("refuses drift even inside the authorized node %s", location => {
    const changed = JSON.parse(source);
    changed.packages[location] = { ...changed.packages[location], unexpectedTask12Field: "must not be erased" };
    expect(() => restoreQcom53Task12Lock(JSON.stringify(changed, null, 2) + "\n")).toThrow(/Task12 lock.*current bytes/);
  });

  it.each(["version", "integrity", "license"])("refuses unrelated runtime %s drift", field => {
    const changed = JSON.parse(source);
    changed.packages["node_modules/next"][field] += "-tampered";
    expect(() => restoreQcom53Task12Lock(JSON.stringify(changed, null, 2) + "\n")).toThrow(/Task12 lock.*current bytes/);
  });

  it.each([
    ["node_modules/typescript", "version"],
    ["node_modules/@emnapi/runtime", "integrity"],
    ["node_modules/minimatch-modern", "integrity"],
    ["scripts/next-eslint-glob", "name"],
    ["scripts/legacy-minimatch", "license"],
  ])("refuses dev, optional, identity and owned integrity drift at %s.%s", (location, field) => {
    const changed = JSON.parse(source);
    changed.packages[location][field] += "-tampered";
    expect(() => restoreQcom53Task12Lock(JSON.stringify(changed, null, 2) + "\n")).toThrow(/Task12 lock.*current bytes/);
  });

  it("refuses unknown additions, removals and root dependency changes", () => {
    const extra = JSON.parse(source);
    extra.packages["node_modules/unreviewed"] = { version: "1.0.0", dev: true };
    const missing = JSON.parse(source);
    delete missing.packages["node_modules/minimatch"];
    const runtime = JSON.parse(source);
    runtime.packages[""].dependencies.next = "99.0.0";
    const own = JSON.parse(source);
    own.packages[""].devDependencies["minimatch-modern"] = "npm:minimatch@99.0.0";
    const metadata = JSON.parse(source);
    metadata.unreviewed = "must not disappear";
    for (const changed of [extra, missing, runtime, own, metadata]) {
      expect(() => restoreQcom53Task12Lock(JSON.stringify(changed, null, 2) + "\n")).toThrow(/Task12 lock.*current bytes/);
    }
  });

  it("refuses formatting drift, duplicate keys and malformed JSON before normalization", () => {
    for (const changed of [source + " ", source.replaceAll("\n", "\r\n"), source.replace('{\n', '{\n  "name": "duplicate",\n'), "{"]) {
      expect(() => restoreQcom53Task12Lock(changed)).toThrow(/Task12 lock.*current bytes/);
    }
  });
});
