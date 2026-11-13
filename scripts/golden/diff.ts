/**
 * golden:diff — compare two golden:run output folders.
 *
 *   npm run golden:diff -- BEFORE_DIR AFTER_DIR [--approved FILE] [--lines N]
 *
 * Compares every case's route, payload fingerprint, schema and reader status,
 * and the SHA-256 of each output file. For a changed JSON file it lists the
 * leaf paths that differ (tests/helpers/jsonLeafPaths.ts); for a changed
 * text file it prints the start of a unified diff. Exit 0 only when nothing
 * differs, or when every differing file is listed in --approved with both its
 * before and after hash and a reason:
 *
 *   { "approvals": [{ "case": "nvda-data-only", "file": "report.md",
 *       "before": "<sha256>", "after": "<sha256>", "reason": "why", "decision": "optional" }] }
 *
 * A file present in only one run is approved the same way, with "missing" as
 * the hash on the side where it does not exist. A changed manifest field
 * (payloadFingerprint, route, …) is approved with the field name as "file" and
 * its JSON-encoded values as before/after.
 *
 * An approval that matches no difference is also an error, so the list stays exact.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { comparePaths, diffPaths, type AuditJsonValue } from "../../tests/helpers/jsonLeafPaths";
import type { GoldenCaseEntry, GoldenManifest } from "./run";

interface Approval { case: string; file: string; before: string; after: string; reason: string; decision?: string }

/** The hash recorded for an output file that one run did not produce. */
const MISSING = "missing";

const COMPARED_FIELDS = ["status", "error", "snapshot", "analystOutput", "route", "overlays", "clock", "payloadFingerprint", "reportPath", "reportSchema", "readMode", "notes"] as const;

function parseArgs(argv: string[]): { before: string; after: string; approved?: string; lines: number } {
  const positional: string[] = [];
  const options = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--approved" || arg === "--lines") {
      const value = argv[++i];
      if (value === undefined || options.has(arg)) throw new Error(`${arg} needs one value`);
      options.set(arg, value);
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 2) throw new Error("usage: golden:diff BEFORE_DIR AFTER_DIR [--approved FILE] [--lines N]");
  return { before: path.resolve(positional[0]!), after: path.resolve(positional[1]!), approved: options.get("--approved"), lines: Number(options.get("--lines") ?? 40) };
}

function readManifest(dir: string): GoldenManifest {
  const file = path.join(dir, "manifest.json");
  if (!fs.existsSync(file)) throw new Error(`${dir} has no manifest.json; run golden:run first`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as GoldenManifest;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function jsonLeafDiff(beforeFile: string, afterFile: string, limit: number): string[] {
  const before = JSON.parse(fs.readFileSync(beforeFile, "utf8")) as AuditJsonValue;
  const after = JSON.parse(fs.readFileSync(afterFile, "utf8")) as AuditJsonValue;
  const paths = diffPaths(before, after).sort(comparePaths);
  const shown = paths.slice(0, limit).map((leaf) => `      ${leaf || "(root)"}`);
  return [`    ${paths.length} JSON leaf path(s) differ`, ...shown, ...(paths.length > limit ? [`      … ${paths.length - limit} more`] : [])];
}

const MAX_LINE = 200;

/**
 * Unified diff of two text outputs via `git diff --no-index`. Static web markup
 * is one long line, so HTML is split at tag boundaries first; printed lines are
 * capped so a changed line cannot flood the terminal.
 */
function textDiff(beforeFile: string, afterFile: string, limit: number): string[] {
  const prepare = (file: string) => {
    const text = fs.readFileSync(file, "utf8");
    return file.endsWith(".html") ? text.replace(/></g, ">\n<") : text;
  };
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "golden-diff-"));
  try {
    fs.writeFileSync(path.join(scratch, "before"), prepare(beforeFile));
    fs.writeFileSync(path.join(scratch, "after"), prepare(afterFile));
    const result = spawnSync("git", ["diff", "--no-index", "--no-color", "--unified=1", "--", "before", "after"], { cwd: scratch, encoding: "utf8", maxBuffer: 1 << 30 });
    const lines = (result.stdout ?? "").split("\n")
      .filter((line) => !/^(diff --git|index |--- |\+\+\+ |\\ No newline)/.test(line) && line.length > 0);
    const changed = lines.filter((line) => line.startsWith("+") || line.startsWith("-")).length;
    const clip = (line: string) => (line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…` : line);
    return [`    ${changed} changed line(s)${afterFile.endsWith(".html") ? " (HTML split at tags)" : ""}`,
      ...lines.slice(0, limit).map((line) => `      ${clip(line)}`), ...(lines.length > limit ? ["      …"] : [])];
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function main(argv: string[]): void {
  const args = parseArgs(argv);
  const a = readManifest(args.before);
  const b = readManifest(args.after);
  const approvals: Approval[] = args.approved ? (JSON.parse(fs.readFileSync(args.approved, "utf8")) as { approvals: Approval[] }).approvals : [];
  for (const approval of approvals) {
    if (!approval.case || !approval.file || !approval.before || !approval.after || !approval.reason?.trim()) {
      throw new Error(`malformed approval ${JSON.stringify(approval)}: case, file, before, after and a reason are required`);
    }
  }
  const used = new Set<Approval>();
  const out: string[] = [];
  const describe = (m: GoldenManifest) => `${m.code.ref} @ ${m.code.commit.slice(0, 12)}${m.code.dirtyDiffHash ? ` + uncommitted ${m.code.dirtyDiffHash.slice(0, 8)}` : ""}`;
  out.push(`golden:diff ${describe(a)}  ->  ${describe(b)}`);
  if (a.code.packageLockSha256 !== b.code.packageLockSha256) out.push("  note: package-lock.json differs between the two commits; both ran on the installed node_modules");
  if (a.environment.node !== b.environment.node || a.environment.installedLockSha256 !== b.environment.installedLockSha256) {
    out.push(`  note: environment differs (node ${a.environment.node} vs ${b.environment.node}, installed modules ${a.environment.installedLockSha256 === b.environment.installedLockSha256 ? "same" : "differ"})`);
  }

  let fileCount = 0;
  let unapproved = 0;
  let approvedCount = 0;
  const caseIds = [...new Set([...Object.keys(a.cases), ...Object.keys(b.cases)])];
  for (const id of caseIds) {
    const x: GoldenCaseEntry | undefined = a.cases[id];
    const y: GoldenCaseEntry | undefined = b.cases[id];
    if (!x || !y) {
      out.push(`  ${id}: only in ${x ? "before" : "after"}`);
      unapproved++;
      continue;
    }
    if (x.status !== "ok" || y.status !== "ok") {
      out.push(`  ${id}: did not run (${x.status !== "ok" ? `before: ${x.error}` : ""}${y.status !== "ok" ? ` after: ${y.error}` : ""})`);
      unapproved++;
      continue;
    }
    for (const field of COMPARED_FIELDS) {
      if (same(x[field], y[field])) continue;
      const before = JSON.stringify(x[field] ?? null);
      const after = JSON.stringify(y[field] ?? null);
      const approval = approvals.find((entry) => entry.case === id && entry.file === field && entry.before === before && entry.after === after);
      if (approval) {
        used.add(approval);
        approvedCount++;
      } else unapproved++;
      out.push(`  ${id}: ${field} ${before} -> ${after}${approval ? `, approved — ${approval.reason}` : ""}`);
    }
    const files = [...new Set([...Object.keys(x.files ?? {}), ...Object.keys(y.files ?? {})])];
    for (const file of files) {
      fileCount++;
      const before = x.files?.[file] ?? MISSING;
      const after = y.files?.[file] ?? MISSING;
      if (before === after) continue;
      const change = before === MISSING ? "added" : after === MISSING ? "removed" : "changed";
      const approval = approvals.find((entry) => entry.case === id && entry.file === file && entry.before === before && entry.after === after);
      if (approval) {
        used.add(approval);
        approvedCount++;
        out.push(`  ${id}/${file}: ${change}, approved — ${approval.reason}${approval.decision ? ` (${approval.decision})` : ""}`);
      } else {
        unapproved++;
        out.push(`  ${id}/${file}: ${change.toUpperCase()} ${before.slice(0, 12)} -> ${after.slice(0, 12)}`);
      }
      const beforeFile = path.join(args.before, id, file);
      const afterFile = path.join(args.after, id, file);
      if (change === "changed" && fs.existsSync(beforeFile) && fs.existsSync(afterFile)) {
        out.push(...(file.endsWith(".json") ? jsonLeafDiff(beforeFile, afterFile, args.lines) : textDiff(beforeFile, afterFile, args.lines)));
      }
    }
  }
  const stale = approvals.filter((approval) => !used.has(approval));
  for (const approval of stale) out.push(`  approval matched no difference: ${approval.case}/${approval.file} (${approval.reason})`);

  const summary = unapproved === 0 && stale.length === 0
    ? approvedCount === 0
      ? `golden diff: no changes (${caseIds.length} cases, ${fileCount} files compared)`
      : `golden diff: ${approvedCount} approved change(s), nothing else (${caseIds.length} cases, ${fileCount} files compared)`
    : `golden diff: ${unapproved} unapproved difference(s)${stale.length ? `, ${stale.length} unused approval(s)` : ""} (${caseIds.length} cases, ${fileCount} files compared)`;
  out.push(summary);
  process.stdout.write(`${out.join("\n")}\n`);
  if (unapproved > 0 || stale.length > 0) process.exitCode = 1;
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
