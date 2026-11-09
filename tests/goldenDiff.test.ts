/**
 * golden:diff approvals for output files that only one run produced
 * (scripts/golden/diff.ts). The script runs as a child process over two small
 * synthetic run folders; nothing here reads the application database.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = path.join(process.cwd(), "scripts", "golden", "diff.ts");
const KEPT = "a".repeat(64);
const ADDED = "b".repeat(64);
const REMOVED = "c".repeat(64);
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function writeRun(root: string, name: string, files: Record<string, string>): string {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, "case-1"), { recursive: true });
  const manifest = {
    harness: 1,
    code: { ref: name, commit: "0".repeat(40), dirtyDiffHash: null, harnessFrom: "tree", packageLockSha256: null },
    environment: { node: "v24", installedLockSha256: null },
    cases: { "case-1": { snapshot: "s", analystOutput: null, status: "ok", payloadFingerprint: "1:x", files } },
    timingsMs: {},
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  return dir;
}

function runDiff(approvals?: unknown[]): { status: number | null; stdout: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "golden-diff-test-"));
  dirs.push(root);
  const before = writeRun(root, "before", { "report.md": KEPT, "audit.md": REMOVED });
  const after = writeRun(root, "after", { "report.md": KEPT, "print.html": ADDED });
  const args = ["--import", "tsx", SCRIPT, before, after];
  if (approvals) {
    const file = path.join(root, "approved.json");
    fs.writeFileSync(file, JSON.stringify({ approvals }));
    args.push("--approved", file);
  }
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
  return { status: result.status, stdout: result.stdout };
}

const addedApproval = { case: "case-1", file: "print.html", before: "missing", after: ADDED, reason: "export now renders" };
const removedApproval = { case: "case-1", file: "audit.md", before: REMOVED, after: "missing", reason: "export retired" };

describe("golden:diff added and removed outputs", () => {
  it("fails when an added or removed file is not approved", () => {
    const { status, stdout } = runDiff();
    expect(status).toBe(1);
    expect(stdout).toContain("case-1/print.html: ADDED missing -> bbbbbbbbbbbb");
    expect(stdout).toContain("case-1/audit.md: REMOVED cccccccccccc -> missing");
    expect(stdout).toContain("golden diff: 2 unapproved difference(s)");
  });

  it("passes when both are approved with the missing sentinel", () => {
    const { status, stdout } = runDiff([addedApproval, removedApproval]);
    expect(stdout).toContain("case-1/print.html: added, approved — export now renders");
    expect(stdout).toContain("case-1/audit.md: removed, approved — export retired");
    expect(stdout).toContain("golden diff: 2 approved change(s), nothing else");
    expect(status).toBe(0);
  });

  it("still fails the change that is left unapproved", () => {
    const { status, stdout } = runDiff([addedApproval]);
    expect(status).toBe(1);
    expect(stdout).toContain("golden diff: 1 unapproved difference(s)");
  });
});
