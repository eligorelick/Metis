import { displayedValidationStatus, isCountedClaimEntry } from "./claimMatching";
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
const factReports = new WeakSet<object>();
/** D-282: figures whose own verification entry records a value conflict. */
const contradictedFigures = new WeakSet<object>();

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
 * figures are indexed as computed. Optional marketStructure/competitors claims
 * resolve through their exact log paths without a section allowlist.
 */
export function indexVerificationMarks(report: Report): void {
  if (indexed.has(report)) return;
  indexed.add(report);
  // history.ts isDataOnly reads the same marker, but that module imports the database.
  if (report.appendix.missingData.some((gap) => gap.field === "analysis.llm") && indexComputedFigures(report)) computedReports.add(report);
  for (const entry of report.appendix.verificationLog ?? []) {
    // D-282: a figure whose own log entry found a value conflict is marked contradicted where it is shown.
    if (entry.evidenceKind === "number" && entry.check === undefined && entry.path !== undefined && displayedValidationStatus(entry) === "contradicted") {
      const figure = resolvePath(report, entry.path);
      if (figure !== null && typeof figure === "object" && typeof (figure as Partial<TracedNumber>).value === "number") contradictedFigures.add(figure);
      continue;
    }
    // A removed entry (an earnings-reference guard row, a withheld legacy claim) marks nothing.
    if (!isCountedClaimEntry(entry, "factual-claim") || entry.path === undefined) continue;
    const node = resolvePath(report, entry.path);
    if (node !== null && typeof node === "object" && (node as Partial<SourcedClaim>).text === entry.claim) { marks.set(node, markFor(entry)); factReports.add(report); }
  }
  // D-282 (P19): in a report the AI wrote, a FACT or ESTIMATE statement with no
  // check entry of its own (written after the check, or its entry removed) was
  // not confirmed by code, and says so rather than carrying no mark.
  if (factReports.has(report)) markUncheckedStatements(report);
}

function markUncheckedStatements(node: unknown): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const child of node) markUncheckedStatements(child); return; }
  const claim = node as Partial<SourcedClaim>;
  if (typeof claim.text === "string" && (claim.label === "FACT" || claim.label === "ESTIMATE") && typeof claim.source === "string") {
    if (!marks.has(node)) marks.set(node, "unverified");
    return;
  }
  for (const [key, value] of Object.entries(node)) if (key !== "appendix" && key !== "meta") markUncheckedStatements(value);
}

/** The claim's indexed status, or undefined when no factual-claim entry marks it. */
export function claimStatusMark(claim: SourcedClaim): ClaimStatusMark | undefined {
  return marks.get(claim);
}

/**
 * D-282 (P19, P22): the words a reader sees for each status. "unverified" and
 * "qualitative" are both statements code did not check against a record, so
 * both read "not confirmed"; the legend says what that means.
 */
export const CLAIM_STATUS_WORDS: Readonly<Record<ClaimStatusMark, string>> = {
  validated: "validated",
  unverified: "not confirmed",
  qualitative: "not confirmed",
  contradicted: "contradicted",
};

/**
 * D-302 (P21, P22): a read-time copy of a claim with reader wording in place of
 * its stored text. The copy keeps the original's verification mark; the stored
 * claim, its text and the log are unchanged.
 */
export function withReaderText(claim: SourcedClaim, text: string): SourcedClaim {
  if (text === claim.text) return claim;
  const copy = { ...claim, text };
  const mark = marks.get(claim);
  if (mark !== undefined) marks.set(copy, mark);
  return copy;
}

/** The compact text form, e.g. "[validated]" or "[not confirmed]". */
export function claimStatusMarkText(claim: SourcedClaim): string | null {
  const mark = marks.get(claim);
  return mark === undefined ? null : `[${CLAIM_STATUS_WORDS[mark]}]`;
}

/** The tag a reader sees in front of a claim: a contradicted statement never reads as FACT or ESTIMATE. */
export type ClaimTag = SourcedClaim["label"] | "CONTRADICTED";

/**
 * D-282 (P19, A3): a statement code found in conflict with its record is shown
 * under a CONTRADICTED tag, never under the FACT or ESTIMATE tag that would
 * present it as a fact. Its own label stays in the stored report and the audit.
 */
export function claimTag(claim: SourcedClaim): ClaimTag {
  return marks.get(claim) === "contradicted" && claim.label !== "JUDGMENT" ? "CONTRADICTED" : claim.label;
}

/** A traced figure's indexed conflict: its log entry found a value conflict with its record (D-282). */
export function isContradictedFigure(n: TracedNumber): boolean {
  return contradictedFigures.has(n);
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

/**
 * D-264, revised by D-282 (P19, P22): what each mark means, in plain words, at
 * the top of every report the AI wrote. Citation coverage and numerical
 * matching still answer different questions.
 */
export const FACT_STATUS_LEGEND = "How to read the marks. [validated]: code checked the statement's figures against the record it cites. [not confirmed]: written by the AI and not checked by code; it may be wrong. A JUDGMENT tag: the AI's opinion; facts inside it are not checked. [contradicted] or a CONTRADICTED tag: code found a conflict with the record, so do not rely on it. A mark at the end of a paragraph or table cell covers all of it. A table or card captioned 'Written by the AI; not checked by code' was written by the AI as a whole, including its titles, dates and ratings; a figure in it that code checked keeps its own mark. A citation shows where a statement points, not that it is correct. Citation coverage counts traceable figures, not validated claims.";

/** Show the legend only when this report has factual status tags to explain. */
export function hasFactStatusMarks(report: Report): boolean {
  return factReports.has(report);
}
