import { displayedValidationStatus } from "./claimMatching";
import { numericCitationTraceLabel } from "./format";
import type { Report, SourcedClaim, TracedNumber, VerificationLogEntry } from "./schema";

/**
 * Audit 2026-10-22 F-21: each factual claim carries its verification status
 * after its citation, so a reader sees which bullets the header's counts are.
 * The status comes from the claim's own verification-log entry; a claim with
 * no factual-claim entry (a judgment, a data-only report, a note written after
 * the verify pass) is not marked.
 */
export type ClaimStatusMark = "validated" | "unverified" | "contradicted" | "qualitative";

const marks = new WeakMap<object, ClaimStatusMark>();
/** F-23: figures of a data-only report, whose `verified` means computed, not citation-checked. */
const computedFigures = new WeakSet<object>();
/** Indexed data-only reports holding at least one computed figure. */
const computedReports = new WeakSet<object>();
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

/** Index a data-only report's figures as computed; true when it holds any. */
function indexComputedFigures(node: unknown): boolean {
  if (node === null || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.map(indexComputedFigures).includes(true);
  const obj = node as Record<string, unknown>;
  let found = false;
  if (obj.verified === true && typeof obj.value === "number" && typeof obj.source === "string") {
    computedFigures.add(obj);
    found = true;
  }
  for (const value of Object.values(obj)) found = indexComputedFigures(value) || found;
  return found;
}

/**
 * Index the report a renderer is about to print. The log's claim entries
 * (factual-claim, no `check`) name the claim's report path and text; an entry
 * whose path no longer holds that text marks nothing. A data-only report's
 * figures are indexed as computed.
 */
export function indexVerificationMarks(report: Report): void {
  if (indexed.has(report)) return;
  indexed.add(report);
  // history.ts isDataOnly reads the same marker, but that module imports the database.
  if (report.appendix.missingData.some((gap) => gap.field === "analysis.llm") && indexComputedFigures(report)) computedReports.add(report);
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

/**
 * True for a figure of an indexed data-only report: no citation-check pass
 * ran, and `verified` records only that the pipeline computed it (F-23).
 */
export function isComputedFigure(n: TracedNumber): boolean {
  return computedFigures.has(n);
}

/**
 * True for an indexed data-only report with a computed figure: the reports
 * whose Cited column needs the legend. A checked report's own cells may read
 * "computed" (a Sources row's provider), so the exporters ask this instead of
 * reading their output (review of F-23).
 */
export function hasComputedFigures(report: Report): boolean {
  return computedReports.has(report);
}

/** The legend printed under the first table with a Cited column in a data-only report (F-23). */
export const COMPUTED_MARK_LEGEND = "Cited column: \"computed\" means the pipeline calculated the figure from its stated inputs. No citation-check pass ran on this data-only report, so no figure is marked ✓ (citation-traced).";

/** A figure's citation status in words: "computed (no citation check ran)" for a data-only report's figure (F-23). */
export function figureCitationStatus(n: TracedNumber): string {
  return n.verified === true && isComputedFigure(n) ? "computed (no citation check ran)" : numericCitationTraceLabel(n.verified);
}
