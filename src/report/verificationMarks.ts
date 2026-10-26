import { displayedValidationStatus } from "./claimMatching";
import type { Report, SourcedClaim, VerificationLogEntry } from "./schema";

/**
 * Audit 2026-10-22 F-21: each factual claim carries its verification status
 * after its citation, so a reader sees which bullets the header's counts are.
 * The status comes from the claim's own verification-log entry; a claim with
 * no factual-claim entry (a judgment, a data-only report, a note written after
 * the verify pass) is not marked.
 */
export type ClaimStatusMark = "validated" | "unverified" | "contradicted" | "qualitative";

const marks = new WeakMap<object, ClaimStatusMark>();
const indexed = new WeakSet<object>();

function markFor(entry: VerificationLogEntry): ClaimStatusMark {
  const status = displayedValidationStatus(entry);
  return status === "validated" ? "validated"
    : status === "contradicted" ? "contradicted"
      // "cited" is recorded only for a supported claim that states no figure.
      : status === "cited" ? "qualitative"
        : "unverified";
}

function resolvePath(root: unknown, path: string): unknown {
  let node = root;
  for (const [, key, index] of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    if (node === null || typeof node !== "object") return undefined;
    node = index === undefined ? (node as Record<string, unknown>)[key] : (node as unknown[])[Number(index)];
  }
  return node;
}

/**
 * Index the report a renderer is about to print. The log's claim entries
 * (factual-claim, no `check`) name the claim's report path and text; an entry
 * whose path no longer holds that text marks nothing.
 */
export function indexVerificationMarks(report: Report): void {
  if (indexed.has(report)) return;
  indexed.add(report);
  for (const entry of report.appendix.verificationLog ?? []) {
    if (entry.evidenceKind !== "factual-claim" || entry.check !== undefined || entry.path === undefined || entry.validationStatus === undefined) continue;
    const node = resolvePath(report, entry.path);
    if (node !== null && typeof node === "object" && (node as Partial<SourcedClaim>).text === entry.claim) marks.set(node, markFor(entry));
  }
}

/** The status mark of an indexed claim, or undefined. */
export function claimStatusMark(claim: SourcedClaim): ClaimStatusMark | undefined {
  return marks.get(claim);
}

/** The compact text form, e.g. "[validated]". */
export function claimStatusMarkText(claim: SourcedClaim): string | null {
  const mark = marks.get(claim);
  return mark === undefined ? null : `[${mark}]`;
}
