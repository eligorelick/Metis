import { stripVTControlCharacters } from "node:util";

function boundedText(value: string, limit: number, tail = false): string {
  const clean = [...stripVTControlCharacters(value)].filter(character => {
    const code = character.charCodeAt(0);
    return character === "\n" || character === "\t" || (code >= 32 && !(code >= 127 && code <= 159));
  }).join("");
  if (clean.length <= limit) return clean;
  return tail ? `[truncated] ${clean.slice(-limit)}` : `${clean.slice(0, limit)} [truncated]`;
}

/** Fixed diagnostic fields only: never serialize a child environment or argv. */
export function describeTestFailure(error: unknown): string {
  const record = error !== null && typeof error === "object" ? error as Record<string, unknown> : undefined;
  const message = typeof record?.message === "string" ? record.message
    : record ? "Non-Error object thrown" : String(error);
  const details = [boundedText(message, 512)];
  for (const field of ["code", "status", "signal", "pid"] as const) {
    const value = record?.[field];
    if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
      details.push(`${field}=${boundedText(String(value), 128)}`);
    }
  }
  for (const field of ["stdout", "stderr"] as const) {
    const value = record?.[field];
    const text = typeof value === "string" ? value : Buffer.isBuffer(value) ? value.toString("utf8") : null;
    if (text !== null) details.push(`${field} tail: ${boundedText(text, 2_048, true)}`);
  }
  return details.join("\n");
}

/** Cleanup remains mandatory; neither failure is allowed to hide the other. */
export function withRequiredCleanup(body: () => void, cleanup: () => void): void {
  let bodyFailed = false;
  let bodyError: unknown;
  try {
    body();
  } catch (error) {
    bodyFailed = true;
    bodyError = error;
  }
  try {
    cleanup();
  } catch (cleanupError) {
    if (!bodyFailed) throw cleanupError;
    const bodySummary = describeTestFailure(bodyError);
    const cleanupSummary = describeTestFailure(cleanupError);
    const aggregate = new AggregateError([bodyError, cleanupError],
      `Test body and required cleanup both failed.\nBody: ${bodySummary}\nCleanup: ${cleanupSummary}`,
      { cause: bodyError });
    // Vitest honors toJSON before traversing Error properties. Keep originals
    // in errors/cause for inspection, but prevent worker reporting from dumping
    // unbounded child streams or unrelated fields from either original error.
    Object.defineProperty(aggregate, "toJSON", { value: () => ({
      name: aggregate.name,
      message: aggregate.message,
      errors: [bodySummary, cleanupSummary],
      cause: bodySummary,
    }) });
    throw aggregate;
  }
  if (bodyFailed) throw bodyError;
}
