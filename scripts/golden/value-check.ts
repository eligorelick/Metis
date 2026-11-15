/**
 * golden:value-check — fail when a case's model value moves more than
 * MODEL_VALUE_MOVE_LIMIT_PCT between two golden:run output folders.
 *
 *   npm run golden:value-check -- BEFORE_DIR AFTER_DIR [--approved FILE] [--decisions FILE]
 *
 * The model value is the per-share value the report headlines, read from each
 * case's stored stageB.json: `fairValue.perShare` when the value is current, or
 * `fairValue.reference.perShare` when the report shows it only as a dated
 * reference value. A case with neither shows no model value (withheld, or a
 * route with no per-share model). Nothing is recomputed.
 *
 * A case fails when its model value moves by more than the limit either way,
 * when a value appears or disappears, or when its unit or currency changes,
 * unless the approvals file lists that case with a decision id
 * (`D-nnn`) that has its own `## D-nnn` entry in docs/audit/DECISIONS.md and
 * whose entry names the company: its ticker (stageB.json `symbol`) or the case
 * id. The file can be the same one golden:diff reads; this check reads only
 * its `valueMoves` list:
 *
 *   { "valueMoves": [{ "case": "lly-data-only", "decision": "D-281", "reason": "why" }] }
 *
 * An approval that matches no move is also an error, so the list stays exact.
 * A case that did not run in either folder fails: its value cannot be checked.
 */
import fs from "node:fs";
import path from "node:path";
import type { GoldenManifest } from "./run";

/**
 * The owner's number (release brief R43, 2026-11-14): a model value that moves more than 10% between two builds,
 * either way, is a change a reader would act on, so it must be traced to a decision entry before it ships. The
 * LLY 518.37 -> 739.34 move (D-281) went untraced for a whole release round; this check stops that recurring.
 */
export const MODEL_VALUE_MOVE_LIMIT_PCT = 10;

export interface ModelValue {
  value: number;
  unit: string | null;
  currency: string | null;
  /** fairValue.status of the stored output ("available", "dated-reference", …). */
  status: string;
}

/** One side of a case: the shown model value, or null with the fair-value status that explains why there is none. */
export interface CaseSide {
  ran: boolean;
  symbol: string | null;
  value: ModelValue | null;
  status: string | null;
}

export interface ValueMoveApproval { case: string; decision: string; reason: string }

export interface ValueMoveRow {
  case: string;
  symbol: string | null;
  before: CaseSide | null;
  after: CaseSide | null;
  /** Signed percentage move; null when there is no number on one side. */
  movePct: number | null;
  /** Why the row counts as a move ("" when it does not). */
  move: string;
  approval: ValueMoveApproval | null;
  /** Why the row fails ("" when it passes). */
  failure: string;
}

type Json = Record<string, unknown>;

function record(value: unknown): Json | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** The headline model value of one stored Stage B output, or null when the report shows none. */
export function modelValue(stageB: Json): ModelValue | null {
  const fairValue = record(stageB.fairValue);
  if (!fairValue) return null;
  const status = text(fairValue.status) ?? "unknown";
  const traced = record(fairValue.perShare) ?? record(record(fairValue.reference)?.perShare);
  if (!traced || typeof traced.value !== "number" || !Number.isFinite(traced.value)) return null;
  return { value: traced.value, unit: text(traced.unit), currency: text(traced.currency), status };
}

/** One case side read from a stored Stage B output. */
export function caseSide(stageB: Json): CaseSide {
  return { ran: true, symbol: text(stageB.symbol), value: modelValue(stageB), status: text(record(stageB.fairValue)?.status) };
}

/** Each `## D-nnn` entry of DECISIONS.md, keyed by id, with its full text (heading to the next `## ` heading). */
export function parseDecisions(markdown: string): Map<string, string> {
  const entries = new Map<string, string>();
  let current: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (current) entries.set(current, `${entries.get(current) ?? ""}${lines.join("\n")}\n`);
  };
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      flush();
      const id = /^## (D-\d+)\b/.exec(line);
      current = id ? id[1]! : null;
      lines = [line];
    } else lines.push(line);
  }
  flush();
  return entries;
}

/** True when the entry names the company as a whole token: the ticker in capitals, or the case id. */
export function entryNamesCompany(entry: string, symbol: string | null, caseId: string): boolean {
  const token = (name: string) => new RegExp(`(?<![A-Za-z0-9.-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9-])`);
  return token(caseId).test(entry) || (symbol !== null && token(symbol.toUpperCase()).test(entry));
}

function describeMove(before: CaseSide | null, after: CaseSide | null): { movePct: number | null; move: string } {
  // A case only one run has is a move even when neither side shows a value: an omitted case was not checked.
  if (before === null || after === null) return { movePct: null, move: `case only in the ${before === null ? "after" : "before"} run` };
  const a = before.value;
  const b = after.value;
  if (a === null && b === null) return { movePct: null, move: "" };
  if (a === null) return { movePct: null, move: "model value appeared" };
  if (b === null) return { movePct: null, move: "model value disappeared" };
  // The stored trace names its currency in the unit ("USD/share"); a separate currency, when both sides state one, must agree too.
  if (a.unit !== b.unit || (a.currency !== null && b.currency !== null && a.currency !== b.currency)) {
    const unit = (v: ModelValue) => [v.currency, v.unit].filter(Boolean).join(" ") || "no unit";
    return { movePct: null, move: `unit changed (${unit(a)} -> ${unit(b)})` };
  }
  if (a.value === b.value) return { movePct: 0, move: "" };
  const movePct = a.value === 0 ? (b.value > 0 ? Infinity : -Infinity) : ((b.value - a.value) / Math.abs(a.value)) * 100;
  // Binary floating point turns an exact decimal 10% (89.60 -> 98.56) into 10.000000000000009; the comparison is made
  // on the move rounded to 1e-9 percentage points, far below any stored precision, so exactly 10% passes as D-291 says.
  const compared = Number.isFinite(movePct) ? Math.round(movePct * 1e9) / 1e9 : movePct;
  return { movePct, move: Math.abs(compared) > MODEL_VALUE_MOVE_LIMIT_PCT ? `moved more than ${MODEL_VALUE_MOVE_LIMIT_PCT}%` : "" };
}

/**
 * Compares every case of two runs. A case whose move is over the limit (or that appears, disappears or changes
 * unit) needs a valid approval; every approval must match such a move.
 */
export function checkValueMoves(
  before: ReadonlyMap<string, CaseSide>,
  after: ReadonlyMap<string, CaseSide>,
  approvals: readonly ValueMoveApproval[],
  decisions: ReadonlyMap<string, string>,
): { rows: ValueMoveRow[]; unusedApprovals: ValueMoveApproval[] } {
  for (const approval of approvals) {
    if (!approval?.case || !approval.decision || !approval.reason?.trim()) {
      throw new Error(`malformed value-move approval ${JSON.stringify(approval)}: case, decision and a reason are required`);
    }
  }
  // An empty run checks nothing; it must never pass as "no value moved" (D-291).
  if (before.size === 0 || after.size === 0) throw new Error(`the ${before.size === 0 ? "before" : "after"} run has no cases; nothing can be checked`);
  const used = new Set<ValueMoveApproval>();
  const rows: ValueMoveRow[] = [];
  const ids = [...new Set([...before.keys(), ...after.keys()])];
  for (const id of ids) {
    const x = before.get(id) ?? null;
    const y = after.get(id) ?? null;
    const symbol = y?.symbol ?? x?.symbol ?? null;
    if ((x !== null && !x.ran) || (y !== null && !y.ran)) {
      rows.push({ case: id, symbol, before: x, after: y, movePct: null, move: "", approval: null, failure: `did not run in the ${x !== null && !x.ran ? "before" : "after"} folder; its model value cannot be checked` });
      continue;
    }
    const { movePct, move } = describeMove(x, y);
    if (!move) {
      rows.push({ case: id, symbol, before: x, after: y, movePct, move, approval: null, failure: "" });
      continue;
    }
    const candidates = approvals.filter((approval) => approval.case === id);
    for (const candidate of candidates) used.add(candidate);
    let failure = `${move} with no approval naming a decision`;
    let approval: ValueMoveApproval | null = null;
    for (const candidate of candidates) {
      const entry = /^D-\d+$/.test(candidate.decision) ? decisions.get(candidate.decision) : undefined;
      if (entry === undefined) {
        failure = `${move}; approval names ${candidate.decision}, which has no entry in DECISIONS.md`;
      } else if (!entryNamesCompany(entry, symbol, id)) {
        failure = `${move}; ${candidate.decision}'s entry does not name ${symbol ?? "the company"} or ${id}`;
      } else {
        approval = candidate;
        failure = "";
        break;
      }
    }
    rows.push({ case: id, symbol, before: x, after: y, movePct, move, approval, failure });
  }
  return { rows, unusedApprovals: approvals.filter((approval) => !used.has(approval)) };
}

function sideText(side: CaseSide | null): string {
  if (side === null) return "not in run";
  if (!side.ran) return "did not run";
  if (side.value === null) return `none (${side.status ?? "no fair value"})`;
  const unit = side.value.unit ?? side.value.currency ?? "";
  return `${side.value.value} ${unit}${side.value.status === "available" ? "" : ` (${side.value.status})`}`.trim();
}

function pctText(movePct: number | null): string {
  if (movePct === null) return "—";
  if (!Number.isFinite(movePct)) return movePct > 0 ? "+∞%" : "−∞%";
  return `${movePct > 0 ? "+" : ""}${movePct.toFixed(2)}%`;
}

/** The per-case table, as Markdown so it can be pasted into a pull request. */
export function renderTable(rows: readonly ValueMoveRow[]): string[] {
  const out = ["| Case | Ticker | Before | After | Move | Result |", "| --- | --- | --- | --- | --- | --- |"];
  for (const row of rows) {
    const result = row.failure ? `FAIL: ${row.failure}` : row.approval ? `approved by ${row.approval.decision}: ${row.approval.reason}` : "ok";
    out.push(`| ${row.case} | ${row.symbol ?? "—"} | ${sideText(row.before)} | ${sideText(row.after)} | ${pctText(row.movePct)} | ${result.replace(/\|/g, "\\|")} |`);
  }
  return out;
}

/** Every case of one golden:run folder, read from its manifest and each case's stageB.json. */
export function readRun(dir: string): Map<string, CaseSide> {
  const file = path.join(dir, "manifest.json");
  if (!fs.existsSync(file)) throw new Error(`${dir} has no manifest.json; run golden:run first`);
  const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as GoldenManifest;
  const sides = new Map<string, CaseSide>();
  for (const [id, entry] of Object.entries(manifest.cases)) {
    const stageBFile = path.join(dir, id, "stageB.json");
    if (entry.status !== "ok" || !fs.existsSync(stageBFile)) {
      sides.set(id, { ran: false, symbol: null, value: null, status: null });
      continue;
    }
    sides.set(id, caseSide(JSON.parse(fs.readFileSync(stageBFile, "utf8")) as Json));
  }
  return sides;
}

function parseArgs(argv: string[]): { before: string; after: string; approved?: string; decisions: string } {
  const positional: string[] = [];
  const options = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--approved" || arg === "--decisions") {
      const value = argv[++i];
      if (value === undefined || options.has(arg)) throw new Error(`${arg} needs one value`);
      options.set(arg, value);
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 2) throw new Error("usage: golden:value-check BEFORE_DIR AFTER_DIR [--approved FILE] [--decisions FILE]");
  return {
    before: path.resolve(positional[0]!),
    after: path.resolve(positional[1]!),
    approved: options.get("--approved"),
    decisions: path.resolve(options.get("--decisions") ?? path.join("docs", "audit", "DECISIONS.md")),
  };
}

function main(argv: string[]): void {
  const args = parseArgs(argv);
  const approvals = args.approved
    ? ((JSON.parse(fs.readFileSync(args.approved, "utf8")) as { valueMoves?: ValueMoveApproval[] }).valueMoves ?? [])
    : [];
  if (!Array.isArray(approvals)) throw new Error(`${args.approved}: valueMoves must be a list`);
  const decisions = parseDecisions(fs.readFileSync(args.decisions, "utf8"));
  const { rows, unusedApprovals } = checkValueMoves(readRun(args.before), readRun(args.after), approvals, decisions);
  const out = [`golden:value-check ${path.basename(args.before)} -> ${path.basename(args.after)} (limit ${MODEL_VALUE_MOVE_LIMIT_PCT}% either way)`, "", ...renderTable(rows), ""];
  for (const approval of unusedApprovals) out.push(`approval matched no move: ${approval.case} ${approval.decision} (${approval.reason})`);
  const failed = rows.filter((row) => row.failure).length;
  const approved = rows.filter((row) => row.approval).length;
  out.push(failed === 0 && unusedApprovals.length === 0
    ? `value check: ${rows.length} cases, ${approved} approved move(s), no unapproved move over ${MODEL_VALUE_MOVE_LIMIT_PCT}%`
    : `value check: ${failed} failing case(s)${unusedApprovals.length ? `, ${unusedApprovals.length} unused approval(s)` : ""} (${rows.length} cases)`);
  process.stdout.write(`${out.join("\n")}\n`);
  if (failed > 0 || unusedApprovals.length > 0) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
