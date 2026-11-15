/**
 * golden:value-check (scripts/golden/value-check.ts): a case's model value may
 * not move more than MODEL_VALUE_MOVE_LIMIT_PCT between two golden runs, nor
 * appear or disappear, unless an approval names a real decision entry that
 * names the company. The CLI runs as a child process over small synthetic run
 * folders and a synthetic DECISIONS file; nothing here reads the application
 * database or the real decision log.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MODEL_VALUE_MOVE_LIMIT_PCT, entryNamesCompany, modelValue, parseDecisions } from "../scripts/golden/value-check";

const SCRIPT = path.join(process.cwd(), "scripts", "golden", "value-check.ts");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

type FairValue = Record<string, unknown> | null;

/** A current headline value, as a general-route DCF stores it. */
const current = (value: number, currency = "USD"): FairValue => ({ status: "available", method: "fcff-dcf", perShare: { value, unit: `${currency}/share`, source: "computed.valuation.dcf.perShare" } });
/** A value the report shows only as a dated reference (perShare is null; the reference carries it). */
const datedReference = (value: number): FairValue => ({ status: "dated-reference", method: "fcff-dcf", perShare: null,
  reference: { perShare: { value, unit: "USD/share", source: "computed.valuation.dcf.perShare" }, valuationDate: "2025-12-31", quoteDate: "2026-11-13", basis: [] } });
/** A withheld value. */
const suppressed: FairValue = { status: "suppressed", method: null, perShare: null };

interface CaseSpec { symbol: string; fairValue: FairValue; status?: "ok" | "error" }

function writeRun(root: string, name: string, cases: Record<string, CaseSpec>): string {
  const dir = path.join(root, name);
  const entries: Record<string, unknown> = {};
  fs.mkdirSync(dir, { recursive: true });
  for (const [id, spec] of Object.entries(cases)) {
    fs.mkdirSync(path.join(dir, id), { recursive: true });
    const status = spec.status ?? "ok";
    entries[id] = { snapshot: "s", analystOutput: null, status, ...(status === "error" ? { error: "boom" } : {}), files: {} };
    if (status === "ok") fs.writeFileSync(path.join(dir, id, "stageB.json"), JSON.stringify({ symbol: spec.symbol, fairValue: spec.fairValue }));
  }
  const manifest = {
    harness: 1,
    code: { ref: name, commit: "0".repeat(40), dirtyDiffHash: null, harnessFrom: "tree", packageLockSha256: null },
    environment: { node: "v24", installedLockSha256: null },
    cases: entries,
    timingsMs: {},
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  return dir;
}

const DECISIONS = [
  "# Decisions",
  "",
  "## D-900 - Synthetic owner decision that moves ACME's model value (2026-11-14)",
  "",
  "The ACME model value moves because its operating window changed.",
  "",
  "### Approved report changes",
  "",
  "acme-data-only: model value.",
  "",
  "## D-901 - An unrelated decision about wording (2026-11-14)",
  "",
  "Wording only; names BETA but not the moved company.",
  "",
].join("\n");

function runCheck(before: Record<string, CaseSpec>, after: Record<string, CaseSpec>, approvals?: unknown[]): { status: number | null; stdout: string; stderr: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "golden-value-check-test-"));
  dirs.push(root);
  const decisions = path.join(root, "DECISIONS.md");
  fs.writeFileSync(decisions, DECISIONS);
  const args = ["--import", "tsx", SCRIPT, writeRun(root, "before", before), writeRun(root, "after", after), "--decisions", decisions];
  if (approvals) {
    const file = path.join(root, "approved.json");
    fs.writeFileSync(file, JSON.stringify({ valueMoves: approvals }));
    args.push("--approved", file);
  }
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** A control company whose value never moves, so every run checks more than the one case under test. */
const control: Record<string, CaseSpec> = { "beta-data-only": { symbol: "BETA", fairValue: current(50) } };

describe("golden:value-check", () => {
  it("defines the owner's limit once", () => {
    expect(MODEL_VALUE_MOVE_LIMIT_PCT).toBe(10);
  });

  it("passes a 9.9% move and prints every case's before, after and move", () => {
    const { status, stdout } = runCheck(
      { "acme-data-only": { symbol: "ACME", fairValue: current(100) }, ...control },
      { "acme-data-only": { symbol: "ACME", fairValue: current(109.9) }, ...control });
    expect(stdout).toContain("| acme-data-only | ACME | 100 USD/share | 109.9 USD/share | +9.90% | ok |");
    expect(stdout).toContain("| beta-data-only | BETA | 50 USD/share | 50 USD/share | 0.00% | ok |");
    expect(stdout).toContain("value check: 2 cases, 0 approved move(s), no unapproved move over 10%");
    expect(status).toBe(0);
  });

  it("fails a 10.1% move in either direction without an approval", () => {
    const up = runCheck({ "acme-data-only": { symbol: "ACME", fairValue: current(100) }, ...control },
      { "acme-data-only": { symbol: "ACME", fairValue: current(110.1) }, ...control });
    expect(up.stdout).toContain("+10.10% | FAIL: moved more than 10% with no approval naming a decision |");
    expect(up.stdout).toContain("value check: 1 failing case(s) (2 cases)");
    expect(up.status).toBe(1);
    const down = runCheck({ "acme-data-only": { symbol: "ACME", fairValue: current(100) } },
      { "acme-data-only": { symbol: "ACME", fairValue: current(89.9) } });
    expect(down.stdout).toContain("-10.10% | FAIL");
    expect(down.status).toBe(1);
  });

  it("passes a move approved by a real decision that names the company", () => {
    const { status, stdout } = runCheck(
      { "acme-data-only": { symbol: "ACME", fairValue: datedReference(100) }, ...control },
      { "acme-data-only": { symbol: "ACME", fairValue: current(140) }, ...control },
      [{ case: "acme-data-only", decision: "D-900", reason: "operating window" }]);
    expect(stdout).toContain("| acme-data-only | ACME | 100 USD/share (dated-reference) | 140 USD/share | +40.00% | approved by D-900: operating window |");
    expect(stdout).toContain("value check: 2 cases, 1 approved move(s)");
    expect(status).toBe(0);
  });

  it("fails an approval naming a decision that does not exist", () => {
    const { status, stdout } = runCheck({ "acme-data-only": { symbol: "ACME", fairValue: current(100) } },
      { "acme-data-only": { symbol: "ACME", fairValue: current(140) } },
      [{ case: "acme-data-only", decision: "D-999", reason: "made up" }]);
    expect(stdout).toContain("FAIL: moved more than 10%; approval names D-999, which has no entry in DECISIONS.md");
    expect(status).toBe(1);
  });

  it("fails an approval naming a real decision that does not name the company", () => {
    const { status, stdout } = runCheck({ "acme-data-only": { symbol: "ACME", fairValue: current(100) } },
      { "acme-data-only": { symbol: "ACME", fairValue: current(140) } },
      [{ case: "acme-data-only", decision: "D-901", reason: "wrong decision" }]);
    expect(stdout).toContain("FAIL: moved more than 10%; D-901's entry does not name ACME or acme-data-only");
    expect(status).toBe(1);
  });

  it("fails a value that appears or disappears without an approval, and passes it with one", () => {
    const appeared = runCheck({ "acme-data-only": { symbol: "ACME", fairValue: suppressed } },
      { "acme-data-only": { symbol: "ACME", fairValue: current(10) } });
    expect(appeared.stdout).toContain("| acme-data-only | ACME | none (suppressed) | 10 USD/share | — | FAIL: model value appeared with no approval naming a decision |");
    expect(appeared.status).toBe(1);
    const disappeared = runCheck({ "acme-data-only": { symbol: "ACME", fairValue: current(10) } },
      { "acme-data-only": { symbol: "ACME", fairValue: suppressed } });
    expect(disappeared.stdout).toContain("FAIL: model value disappeared with no approval naming a decision");
    expect(disappeared.status).toBe(1);
    const approved = runCheck({ "acme-data-only": { symbol: "ACME", fairValue: current(10) } },
      { "acme-data-only": { symbol: "ACME", fairValue: suppressed } },
      [{ case: "acme-data-only", decision: "D-900", reason: "withheld" }]);
    expect(approved.status).toBe(0);
  });

  it("passes a case withheld in both runs (control: no number on either side is not a move)", () => {
    const { status, stdout } = runCheck({ "reit-data-only": { symbol: "REIT", fairValue: suppressed } },
      { "reit-data-only": { symbol: "REIT", fairValue: suppressed } });
    expect(stdout).toContain("| reit-data-only | REIT | none (suppressed) | none (suppressed) | — | ok |");
    expect(status).toBe(0);
  });

  it("fails a currency change, a case that did not run, and a case only one run has", () => {
    const currency = runCheck({ "acme-data-only": { symbol: "ACME", fairValue: current(100) } },
      { "acme-data-only": { symbol: "ACME", fairValue: current(100, "EUR") } });
    expect(currency.stdout).toContain("FAIL: unit changed (USD/share -> EUR/share)");
    expect(currency.status).toBe(1);
    const error = runCheck({ "acme-data-only": { symbol: "ACME", fairValue: current(100) } },
      { "acme-data-only": { symbol: "ACME", fairValue: null, status: "error" } });
    expect(error.stdout).toContain("FAIL: did not run in the after folder");
    expect(error.status).toBe(1);
    const added = runCheck({}, { "acme-data-only": { symbol: "ACME", fairValue: current(100) } });
    expect(added.stdout).toContain("| acme-data-only | ACME | not in run | 100 USD/share | — | FAIL: model value appeared");
    expect(added.status).toBe(1);
  });

  it("fails an approval that matches no move, so the list stays exact", () => {
    const { status, stdout } = runCheck({ ...control }, { ...control },
      [{ case: "beta-data-only", decision: "D-901", reason: "stale" }]);
    expect(stdout).toContain("approval matched no move: beta-data-only D-901 (stale)");
    expect(status).toBe(1);
  });

  it("refuses an approval without a reason", () => {
    const { status, stderr } = runCheck({ ...control }, { ...control }, [{ case: "beta-data-only", decision: "D-900", reason: " " }]);
    expect(stderr).toContain("malformed value-move approval");
    expect(status).toBe(1);
  });
});

describe("value-check helpers", () => {
  it("reads the current value first, then the dated reference, else none", () => {
    expect(modelValue({ fairValue: current(42) })).toEqual({ value: 42, unit: "USD/share", currency: null, status: "available" });
    expect(modelValue({ fairValue: datedReference(518.37) })).toEqual({ value: 518.37, unit: "USD/share", currency: null, status: "dated-reference" });
    expect(modelValue({ fairValue: suppressed })).toBeNull();
    expect(modelValue({})).toBeNull();
  });

  it("splits DECISIONS.md at its D-nnn headings, keeping sub-headings in their entry", () => {
    const entries = parseDecisions(DECISIONS);
    expect([...entries.keys()]).toEqual(["D-900", "D-901"]);
    expect(entries.get("D-900")).toContain("acme-data-only: model value.");
    expect(entries.get("D-901")).not.toContain("ACME");
  });

  it("matches the ticker as a whole capitalised token or the case id, never inside another word", () => {
    expect(entryNamesCompany("The LLY bridge.", "LLY", "lly-data-only")).toBe(true);
    expect(entryNamesCompany("case lly-data-only only", "LLY", "lly-data-only")).toBe(true);
    expect(entryNamesCompany("Realty Income (O) moved.", "O", "o-data-only")).toBe(true);
    expect(entryNamesCompany("P/FFO and P/AFFO only; rolly-data-only", "O", "o-data-only")).toBe(false);
    expect(entryNamesCompany("Illy coffee; LLYX", "LLY", "lly-data-only")).toBe(false);
  });
});
