/**
 * Pass output parsing, split out of passes.ts: the response text, JSON salvage of a truncated or
 * trailing-field output, the response-shape description and the typed validation error. A model's
 * output is parsed, never trusted for numbers (P18).
 */

import type { PassMessage, PassUsage } from "./passTypes";

/**
 * How a response ended, for a rejected answer's durable record: stop reason,
 * content-block counts, text size and output tokens. Block types only (text,
 * thinking, server_tool_use, ...), never block contents.
 */
export function responseShapeText(message: PassMessage, usage: PassUsage | undefined): string {
  const counts = new Map<string, number>();
  for (const block of message.content) counts.set(block.type, (counts.get(block.type) ?? 0) + 1);
  const blocks = [...counts].map(([type, n]) => `${type} ${n}`).join(", ") || "none";
  const textChars = message.content.reduce((sum, block) => sum + (block.type === "text" ? block.text?.length ?? 0 : 0), 0);
  return `stop reason ${message.stop_reason ?? "not recorded"}; content blocks: ${blocks}; text ${textChars} chars; output ${usage?.output_tokens ?? "unknown"} tokens`;
}

/* ------------------------------------------------------------------------ *
 * Structured-output extraction + validation
 * ------------------------------------------------------------------------ */

/** Extract the concatenated text-block content (the structured JSON) from a message. */
export function extractText(message: PassMessage): string {
  return message.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

/**
 * Parse pass output as JSON, salvaging the first balanced top-level JSON
 * value when the raw text doesn't parse whole. `output_config.format` should
 * guarantee pure JSON, but with web-search tools in the turn some models
 * (observed live on haiku-4-5, 2026-07-08) append prose or a second copy
 * after the JSON — discarding the whole multi-dollar pass over trailing text
 * is worse than salvaging the value and letting Zod validate it as usual.
 * Throws (JSON.parse's error) when no parseable JSON value is found.
 */
export function parseJsonSalvaging(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (wholeError) {
    const start = text.search(/[{[]/);
    if (start === -1) throw wholeError;
    const end = balancedEnd(text, start);
    if (end === -1) throw wholeError;
    return JSON.parse(text.slice(start, end));
  }
}

/**
 * The first top-level object plus the top-level fields written AFTER it, for
 * an output whose root was closed too early — `{"verdict":{…}}, "business":
 * {…}, …}` — or split into a second `{"business":…}` object. Salvaging only
 * the first object there throws away every later section (observed live on a
 * ChatGPT plan model, 2026-10-12: a 44 KB judge output parsed to `verdict`
 * alone and the retry was told twelve sections were missing). Fragments are
 * merged only when each is a plain object whose keys are all new, so a
 * duplicated second copy or trailing prose yields null. Callers use this only
 * as a fallback after the first object FAILED validation, so it can rescue an
 * output but never change one that already passes.
 */
export function parseJsonMergingTrailingFields(text: string): Record<string, unknown> | null {
  try {
    JSON.parse(text);
    return null; // a whole document has nothing trailing to merge
  } catch {
    const start = text.indexOf("{");
    if (start === -1) return null;
    const end = balancedEnd(text, start);
    if (end === -1) return null;
    let first: unknown;
    try {
      first = JSON.parse(text.slice(start, end));
    } catch {
      return null;
    }
    return mergeTrailingFields(first, text.slice(end));
  }
}

/** Index just past the balanced JSON value opening at `start`, or -1. */
function balancedEnd(text: string, start: number): number {
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
    } else if (inString) {
      if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The first object plus the top-level fields that follow it, or null when
 * nothing mergeable follows (prose, a repeated key, an unparseable fragment).
 */
function mergeTrailingFields(first: unknown, rest: string): Record<string, unknown> | null {
  if (!isPlainObject(first)) return null;
  const merged: Record<string, unknown> = { ...first };
  let remaining = rest;
  let mergedAny = false;
  for (;;) {
    remaining = remaining.replace(/^\s*,?\s*/, "");
    // An early-closed root continues with `"key": …` up to its own closing
    // brace; a second object starts with `{`. Anything else ends the scan.
    const source = remaining.startsWith('"') ? `{${remaining}` : remaining;
    if (!source.startsWith("{")) break;
    const end = balancedEnd(source, 0);
    if (end === -1) return null;
    let fragment: unknown;
    try {
      fragment = JSON.parse(source.slice(0, end));
    } catch {
      return null;
    }
    if (!isPlainObject(fragment)) return null;
    for (const key of Object.keys(fragment)) {
      if (key in merged) return null;
    }
    Object.assign(merged, fragment);
    mergedAny = true;
    remaining = source.slice(end);
  }
  return mergedAny ? merged : null;
}

/** Thrown when the report fails ReportSchema validation (caught by the runner to retry). */
export class ReportValidationError extends Error {
  constructor(
    message: string,
    /** The Zod issue string to feed back to the judge on retry. */
    readonly zodError: string,
  ) {
    super(message);
    this.name = "ReportValidationError";
  }
}

/* ------------------------------------------------------------------------ *
 * Web-search counting
 * ------------------------------------------------------------------------ */

export function webSearchesOf(usage: PassUsage): number {
  return usage.server_tool_use?.web_search_requests ?? 0;
}
