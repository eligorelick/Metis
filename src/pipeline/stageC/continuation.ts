/**
 * Keep what a cut-off structured response already wrote.
 *
 * The ChatGPT plan endpoint closes any single response at 15 minutes. Every
 * long judge failure on record ended at exactly 15.0 minutes (META, JPM and
 * MSFT twice, 2026-10-12), and the retry asked for the whole report again, so
 * it could run into the same wall: fifteen minutes of streamed output were
 * discarded each time.
 *
 * A JSON object streams in key order, so a cut-off response usually holds a
 * run of complete top-level sections followed by one unfinished one. The
 * complete ones are kept; the retry is asked for the remaining sections only,
 * as a JSON object of its own (so JSON mode still applies), and the two are
 * merged before schema validation. Nothing is guessed: a section counts only
 * when its value parses on its own, and the merged result is still validated
 * exactly as a whole response would be.
 */

/** Sections carried into a retry, and the keys the full response must hold. */
export interface PassContinuation {
  completed: Record<string, unknown>;
  /**
   * How many earlier attempts of this pass ran into the provider's response
   * time limit. A subscription connection lowers the reasoning effort by this
   * many steps, so the retry is not the same request that just hit the wall.
   */
  effortStepDown?: number;
}

/** True when the continuation carries sections to keep (not only an effort step-down). */
export function hasCompletedSections(continuation: PassContinuation | undefined): continuation is PassContinuation {
  return continuation !== undefined && Object.keys(continuation.completed).length > 0;
}

/** Index just past the JSON value starting at `start` (string, object, array or scalar), or -1. */
function valueEnd(text: string, start: number): number {
  const first = text[start];
  if (first === '"') {
    for (let i = start + 1; i < text.length; i++) {
      if (text[i] === "\\") i++;
      else if (text[i] === '"') return i + 1;
    }
    return -1;
  }
  if (first === "{" || first === "[") {
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === "\\") i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === "{" || ch === "[") {
        depth++;
      } else if (ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    return -1;
  }
  // number, true, false, null: runs to the next delimiter, which must exist —
  // a scalar at the very end of a cut-off text may itself be cut short.
  const match = /^[^,}\]\s]+/.exec(text.slice(start));
  if (match === null) return -1;
  const end = start + match[0].length;
  return end < text.length ? end : -1;
}

/**
 * The top-level fields of a (possibly cut-off) JSON object whose values are
 * complete and parse on their own, in order, stopping at the first that is
 * not. Returns an empty object when nothing complete is found.
 */
export function completedTopLevelFields(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let i = text.indexOf("{");
  if (i === -1) return out;
  i++;
  for (;;) {
    while (i < text.length && /[\s,]/.test(text[i]!)) i++;
    if (text[i] !== '"') return out;
    const keyEnd = valueEnd(text, i);
    if (keyEnd === -1) return out;
    let key: string;
    try {
      key = JSON.parse(text.slice(i, keyEnd)) as string;
    } catch {
      return out;
    }
    i = keyEnd;
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (text[i] !== ":") return out;
    i++;
    while (i < text.length && /\s/.test(text[i]!)) i++;
    const end = valueEnd(text, i);
    if (end === -1) return out;
    try {
      out[key] = JSON.parse(text.slice(i, end));
    } catch {
      return out;
    }
    i = end;
  }
}

/**
 * The instruction that turns a retry into a continuation: the completed
 * sections are shown for consistency, and only the missing ones are requested.
 */
export function continuationInstruction(
  completed: Record<string, unknown>,
  requiredKeys: readonly string[],
): string {
  const done = Object.keys(completed);
  const remaining = requiredKeys.filter((key) => !(key in completed));
  return (
    "Your previous response was cut off by the provider's response time limit before it finished. " +
    `These top-level sections were completed and are KEPT exactly as written: ${done.join(", ")}. ` +
    `Return a single JSON object containing ONLY the remaining top-level sections: ${remaining.join(", ")}. ` +
    "Use the same schema, stay consistent with the completed sections below, and do not repeat them.\n\n" +
    `COMPLETED SECTIONS (for reference only — do not re-emit):\n${JSON.stringify(completed)}`
  );
}

/**
 * The carried sections plus the retry's new ones. A carried section wins over
 * a re-emitted copy, so a continuation can only add what was missing.
 */
export function mergeContinuation(completed: Record<string, unknown>, raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  return { ...(raw as Record<string, unknown>), ...completed };
}
