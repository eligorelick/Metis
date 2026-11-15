/**
 * Failure classification and failure text, split out of jobRunner.ts: which errors are retryable,
 * transport or provider-busy failures, the bounded raw output a retry echoes back, and the plain
 * wording of a rejected output's issues. Retries and fallbacks are named as observed (P24).
 */

import { type ManifestEntry } from "@/types/core";
import { NO_RATING_RULE_ID } from "@/report/schema";
import { type PassContinuation } from "@/pipeline/stageC/continuation";
import type { PipelinePasses } from "./jobPassContract";

const ISSUE_WORDS: Record<string, string> = {
  too_small: "is empty or too short",
  too_big: "is too long",
  invalid_type: "has the wrong type",
  invalid_value: "is not an allowed value",
  invalid_format: "has the wrong format",
  unrecognized_keys: "has unexpected fields",
};

/** `text` on one line, at most `max` characters. */
function oneLine(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

interface ZodIssueList {
  issues: Record<string, unknown>[];
  /** Where the array opens and ends in the text. */
  start: number;
  end: number;
  /** False when the text stops before the array's closing bracket. */
  closed: boolean;
}

/**
 * The Zod issue array in `text`: each complete issue object, read up to the
 * array's own closing bracket. A stored failure detail is cut at 4,096
 * characters (serializePassFailure), so a rejection with about 15 or more
 * issues arrives without its end and no longer parses as a whole; the issues
 * before the cut still count.
 */
function zodIssueList(text: string): ZodIssueList | null {
  const start = text.search(/\[\s*\{/);
  if (start < 0) return null;
  const issues: Record<string, unknown>[] = [];
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      if (depth === 0) objectStart = ch === "{" ? i : -1;
      depth++;
    } else if (ch === "}" || ch === "]") {
      if (depth === 0) return issues.length === 0 ? null : { issues, start, end: i + 1, closed: true };
      depth--;
      if (depth === 0 && objectStart >= 0) {
        try {
          const issue = JSON.parse(text.slice(objectStart, i + 1)) as unknown;
          if (issue !== null && typeof issue === "object" && !Array.isArray(issue)) issues.push(issue as Record<string, unknown>);
        } catch {
          // Not an issue object; leave it out.
        }
        objectStart = -1;
      }
    }
  }
  return issues.length === 0 ? null : { issues, start, end: text.length, closed: false };
}

/**
 * The issues in words: "2 fields failed the schema: thesis[0].sourceId is
 * empty or too short; …". `ruleMessages` preserves custom-rule details on the
 * run panel only (the date rule quotes the rejected value). The known rating
 * rule has a controlled fixed diagnostic in both consumers. Arbitrary custom
 * messages remain excluded from saved reports.
 */
function issueListInWords(list: ZodIssueList, ruleMessages: boolean): string {
  const fields = list.issues.map(({ path, code, message, params }) => {
    const where = Array.isArray(path) && path.length > 0
      ? path.map((part, i) => typeof part === "number" ? `[${part}]` : `${i === 0 ? "" : "."}${String(part)}`).join("")
      : "the output";
    if (code === "custom" && params !== null && typeof params === "object" &&
      (params as Record<string, unknown>).ruleId === NO_RATING_RULE_ID) {
      return `${where} contains prohibited investment-rating language`;
    }
    if (ruleMessages && code === "custom" && typeof message === "string" && message.trim() !== "") {
      return `${where}: ${oneLine(message, 80)}`;
    }
    return `${where} ${ISSUE_WORDS[String(code)] ?? "is invalid"}`;
  });
  const count = list.closed
    ? `${fields.length} field${fields.length === 1 ? "" : "s"}`
    : `${fields.length} or more fields`;
  const more = !list.closed ? "; and more" : fields.length > 3 ? `; and ${fields.length - 3} more` : "";
  return `${count} failed the schema: ${fields.slice(0, 3).join("; ")}${more}`;
}

/**
 * A rejected analyst output in words a reader can follow, for the run panel.
 * NVDA run #49 (2026-10-26) printed the parse error there as the raw Zod
 * issue array. The full text still goes back to the model as repair feedback
 * and stays on the pass artifact.
 */
export function plainRejectionNote(detail: string): string {
  const list = zodIssueList(detail);
  if (list !== null) return issueListInWords(list, true);
  const incomplete = detail.indexOf("the case is incomplete:");
  if (incomplete >= 0) return oneLine(detail.slice(incomplete), 200);
  if (detail.includes("pass output was not valid JSON")) return "the output was not valid JSON";
  return oneLine(detail, 200);
}

/**
 * `text` with its Zod issue array, if it has one, put in words and the rest
 * kept, for a saved report's missing-data reason: it still names the pass and
 * the failure kind, without the array or any rule's message.
 */
export function withPlainIssueList(text: string): string {
  const list = zodIssueList(text);
  return list === null ? text : `${text.slice(0, list.start)}${issueListInWords(list, false)}${text.slice(list.end)}`;
}

/**
 * Cap on how much of a failed judge output is echoed back on retry. Sized
 * from MEASURED output — 1.1.0 judge JSON runs ~100–120K chars on sonnet-5;
 * the old 60K cap truncated every realistic echo mid-document, defeating the
 * "repair this JSON in place" instruction. 200K covers observed sizes ~1.7×
 * over while still bounding a true runaway. Mirrors the passes module's
 * JUDGE_RETRY_PREVIOUS_OUTPUT_CAP (same decoupling convention as
 * MAX_JUDGE_RETRIES).
 */
export const JUDGE_RETRY_RAW_OUTPUT_CAP = 200_000;

/** Bound a rejected output before it is echoed back for repair. */
export function capRawOutput(raw: string): string {
  return raw.length > JUDGE_RETRY_RAW_OUTPUT_CAP
    ? `${raw.slice(0, JUDGE_RETRY_RAW_OUTPUT_CAP)}\n[...truncated]`
    : raw;
}

/** Raw text of a received-but-invalid pass output, when the error carries it. */
/**
 * A dropped response this long ran into the ChatGPT plan endpoint's 15-minute
 * response limit: every long judge failure on record ended at exactly 15.0
 * minutes, and every success finished under 13 (2026-10-12).
 */
export const SUBSCRIPTION_TIME_LIMIT_NEAR_MS = 14 * 60_000;

/** Answer text a cut-off provider response had streamed, when the error carries it. */
export function partialTextOfError(err: unknown): string {
  if (err === null || typeof err !== "object") return "";
  const partial = (err as { partialText?: unknown }).partialText;
  return typeof partial === "string" ? partial : "";
}

/** The carried sections a retry may keep, and the ones it must write again (audit 2026-10-22 D-3). */
export function checkCarried(
  passes: Pick<PipelinePasses, "checkCarriedSections">,
  pass: "bull" | "bear" | "synthesize",
  sections: Record<string, unknown>,
): { kept: Record<string, unknown>; dropped: string[] } {
  if (Object.keys(sections).length === 0) return { kept: sections, dropped: [] };
  return passes.checkCarriedSections?.(pass, sections) ?? { kept: sections, dropped: [] };
}

/** How an analyst retry's step detail names what it kept and what it asks for again. */
export function carriedDetail(continuation: PassContinuation | undefined, dropped: readonly string[]): string {
  const parts: string[] = [];
  const kept = Object.keys(continuation?.completed ?? {});
  if (kept.length > 0) parts.push(`kept: ${kept.join(", ")}`);
  if (dropped.length > 0) {
    parts.push(`dropped as not matching ${dropped.length === 1 ? "its" : "their"} schema, so asked for again: ${dropped.join(", ")}`);
  }
  return parts.length === 0 ? "" : ` (${parts.join("; ")})`;
}

export function rawTextOfError(err: unknown): string {
  if (err === null || typeof err !== "object" || !("rawText" in err)) return "";
  const raw = (err as { rawText?: unknown }).rawText;
  if (typeof raw !== "string") return "";
  return capRawOutput(raw);
}

/**
 * Repair attempts per analyst side after a schema-invalid output (each
 * attempt is its own settlement checkpoint and cost row). One: the judge's
 * two retries guard a 60-100K-token document; an analyst case is a tenth of
 * that and a second slip on the same feedback is a model problem, not a
 * formatting one.
 */
export const MAX_ANALYST_REPAIRS = 1;

/** OD-10: the same provider class controls both backoff and explanation. */
export const PROVIDER_BUSY_PATTERN = /server_is_overloaded|server_error|subscription_sharing_(?:usage|user)_unavailable|HTTP (?:429|5\d\d)\b|rate_limit_exceeded/i;
export function providerWasBusy(error: unknown): boolean { return PROVIDER_BUSY_PATTERN.test(errMessage(error)); }

/** True when a pass failed in transit (dropped stream), not on a rejected output. */
export function isTransportFailure(err: unknown): boolean {
  return err !== null && typeof err === "object" && (err as { kind?: unknown }).kind === "transport";
}

export function isRetryableJudgeError(err: unknown): boolean {
  if (err !== null && typeof err === "object" && "retryable" in err) {
    return (err as { retryable?: unknown }).retryable === true;
  }
  const message = errMessage(err).toLowerCase();
  return (
    message.includes("schema-invalid") ||
    message.includes("unparseable structured output") ||
    message.includes("not valid json") ||
    message.includes("report-schema") ||
    message.includes("schema validation")
  );
}

/**
 * Stable key of a report-assembly failure: the sorted issue paths and codes of
 * a ReportValidationError (its `zodError` is the JSON issue list), else its
 * message. Two attempts with the same key failed the same way.
 *
 * The key is the issue path plus code only, so two refinements on one path with
 * different messages count as the same failure, and a `zodError` that is not a
 * JSON array falls back to the message, which collapses every such failure to
 * one key. Both are fail-safe: they buy fewer paid retries, never more.
 */
export function assemblyIssueKey(err: unknown): string {
  const zodError = err !== null && typeof err === "object" ? (err as { zodError?: unknown }).zodError : undefined;
  if (typeof zodError === "string") {
    try {
      const issues: unknown = JSON.parse(zodError);
      if (Array.isArray(issues)) {
        return issues
          .map((issue: { path?: unknown; code?: unknown }) =>
            `${Array.isArray(issue.path) ? issue.path.join(".") : ""}:${String(issue.code)}`)
          .sort()
          .join("|");
      }
    } catch { /* not a JSON issue list: fall through to the message */ }
  }
  return errMessage(err);
}

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function gapFor(field: string, err: unknown): ManifestEntry {
  return { field: `pipeline.${field}`, reason: errMessage(err), severity: "warn" };
}
