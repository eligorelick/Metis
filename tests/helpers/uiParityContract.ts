import { createHash } from "node:crypto";
import { Window } from "happy-dom";
import type { Report, TracedNumber } from "@/report/schema";
import { REPORT_SECTION_MANIFEST } from "@/report/sectionManifest";
import {
  displayClaimText,
  displayProse,
  SCENARIO_TARGET_UNAVAILABLE_TEXT,
  scenarioTargetsCaveat,
  VALUATION_WITHHELD_TEXT,
  valuationHeadlineView,
  valuationNoModelWithheldText,
  valuationScenarioView,
  type ValuationSurface,
} from "@/report/presentation";
import { unavailableCashFlowModel } from "@/report/readerConventions";
import { prepareReportForSurface } from "@/report/readerPreparation";

export interface UiParityContract {
  digest: string;
  sectionIds: string[];
  thesis: string;
  claims: string[];
  gradeRationales: string[];
  gaps: { field: string; reason: string }[];
  sourceIdentities: string[];
  figures: Pick<TracedNumber, "value" | "unit" | "currency" | "sourceId" | "source" | "asOf" | "period" | "verified">[];
}

export function reportDigest(report: Report): string {
  return createHash("sha256").update(JSON.stringify(report)).digest("hex");
}

/** Inventory of stored semantics; no valuation, scoring or source inference. */
export function captureUiParityContract(report: Report): UiParityContract {
  const blocks = [report.fundamentals.graded, report.valuation.graded, report.technicals.graded,
    report.balanceSheet.graded, report.quality.graded, report.leadership.graded, report.competitive.moatGraded].filter((block) => block !== undefined);
  const figures = [
    ...blocks.flatMap((block) => block.keyNumbers),
    ...report.balanceSheet.debtProfile.numbers, ...report.balanceSheet.coverage.numbers,
    ...report.balanceSheet.capexTrajectory.numbers, ...report.technicals.indicators,
    ...report.competitive.peerTable.flatMap((peer) => peer.metrics),
    ...Object.values(report.scores?.aspects ?? {}).flatMap((aspect) => aspect.drivers),
  ];
  return {
    digest: reportDigest(report),
    sectionIds: REPORT_SECTION_MANIFEST.filter((section) => section.key !== "projections" || report.projections !== undefined)
      .map((section) => `report-${section.key}`),
    thesis: displayProse(report.verdict.synthesis),
    claims: (report.verdict.executiveSummary ?? []).map((claim) => displayClaimText(claim)),
    gradeRationales: blocks.map((block) => displayProse(block.oneLineWhy)),
    gaps: report.appendix.missingData.map(({ field, reason }) => ({ field, reason })),
    sourceIdentities: report.appendix.sources.map((source) => source.endpoint),
    figures: figures.map(({ value, unit, currency, sourceId, source, asOf, period, verified }) => ({ value, unit, currency, sourceId, source, asOf, period, verified })),
  };
}

export function readableHtml(html: string): { text: string; ids: Set<string> } {
  const window = new Window();
  window.document.body.innerHTML = html;
  // Native details remain inspectable. Invisible duplicates and metadata do not count.
  window.document.querySelectorAll("script,style,[hidden],[aria-hidden=true],.sr-only").forEach((element) => element.remove());
  const result = {
    text: normalize(window.document.body.textContent ?? ""),
    ids: new Set(Array.from(window.document.querySelectorAll("[id]")).map((element) => element.id)),
  };
  void window.happyDOM.close();
  return result;
}

function normalize(value: string): string { return value.replace(/\s+/g, " ").trim(); }

/**
 * Classic text that states a fact the dossier also shows, in the dossier's own
 * words (D-241); each entry names what the dossier shows instead. Changing the
 * wording is the owner's call, not this test's. Each pattern matches one whole
 * classic text segment.
 * Anything else classic renders must appear in the dossier's readable text.
 */
export const CLASSIC_ONLY_WORDING: readonly { pattern: RegExp; dossier: string }[] = [
  { pattern: /^Equity research report$/, dossier: "brand line beside the classic logo; the dossier header reads Equity Research Report" },
  { pattern: /^sections$/, dossier: "classic section index caption; the dossier contents menu links the same sections" },
  { pattern: /^composite scorecard$/, dossier: "heading: Deterministic scorecard" },
  { pattern: /^House scoring bands$/, dossier: "Band policy: <version> under Score methodology & recorded inputs" },
  { pattern: /^No completed multi-pass analysis\. /, dossier: "Data-only · analysis unavailable, with the recorded reason and the same data issue counts (dataStateText)" },
  { pattern: /^DCF · intrinsic value \/ share$/, dossier: "the dossier's headline label (valuationHeadlineView, per surface)" },
  { pattern: /^DCF provenance$/, dossier: "Model value provenance" },
  { pattern: /^reverse DCF — market is pricing$/, dossier: "Reverse valuation — market-implied assumptions" },
  { pattern: /^(DCF|Valuation) assumptions$/, dossier: "Recorded valuation assumptions" },
  { pattern: /^sensitivity · per share( \(rows = WACC, cols = terminal g\) — green high → red low)?$/, dossier: "Recorded sensitivity cases" },
  { pattern: /^no sensitivity grid$/, dossier: "No WACC × terminal growth grid was recorded for this valuation method." },
];

/**
 * A whole-number cell and a cell at more decimals that can both be roundings of
 * one stored value: "$161" and "$161.37", "$112" and "$112.50" (stored 112.4999).
 */
function roundsTo(classicCell: string, dossierCell: string): boolean {
  if (classicCell === dossierCell) return true;
  const shape = /^(-?[^\d\s-]*)([\d,]+)(\.\d+)?$/;
  const whole = shape.exec(classicCell);
  const precise = shape.exec(dossierCell);
  if (!whole || !precise || whole[3] !== undefined || precise[3] === undefined || whole[1] !== precise[1]) return false;
  const decimals = precise[3].length - 1;
  const gap = Math.abs(Number(whole[2]!.replaceAll(",", "")) - Number(`${precise[2]!.replaceAll(",", "")}${precise[3]}`));
  return gap <= 0.5 + 0.5 * 10 ** -decimals + 1e-9;
}

function readableDocument(html: string): Window {
  const window = new Window();
  window.document.body.innerHTML = html;
  window.document.querySelectorAll("script,style,[hidden],[aria-hidden=true],.sr-only").forEach((element) => element.remove());
  return window;
}

/**
 * A document's readable text without whitespace, with the positions where the
 * original had a break: whitespace, or the start of another element's text.
 */
interface ReadableText { text: string; breaks: Set<number> }
function readableText(window: Window): ReadableText {
  const breaks = new Set<number>();
  let text = "";
  let parent: unknown = null;
  const walker = window.document.createTreeWalker(window.document.body, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let pending = node.parentElement !== parent;
    let wrote = false;
    for (const char of node.textContent ?? "") {
      if (/\s/.test(char)) { pending = true; continue; }
      if (pending) breaks.add(text.length);
      pending = false;
      wrote = true;
      text += char;
    }
    if (wrote) parent = node.parentElement;
    // Trailing whitespace separates this node's text from whatever follows.
    if (pending && wrote) breaks.add(text.length);
  }
  return { text, breaks };
}

const isDigit = (char: string | undefined): boolean => char !== undefined && char >= "0" && char <= "9";
const isNumberMark = (char: string | undefined): boolean => char === "." || char === ",";

/**
 * True when `needle` (whitespace removed) occurs in the text and the occurrence
 * is not a piece of a longer number: "$161" is not shown by "$1610.00" or
 * "$161.37", and "61" is not shown by "$161". A break in the original (space
 * or another element) ends a number, so adjacent cells do not run together.
 */
function shownWhole(needle: string, hay: ReadableText): boolean {
  const numericStart = isDigit(needle[0]), numericEnd = isDigit(needle.at(-1));
  for (let at = hay.text.indexOf(needle); at !== -1; at = hay.text.indexOf(needle, at + 1)) {
    const end = at + needle.length;
    const cutBefore = numericStart && !hay.breaks.has(at) &&
      (isDigit(hay.text[at - 1]) || (isNumberMark(hay.text[at - 1]) && !hay.breaks.has(at - 1) && isDigit(hay.text[at - 2])));
    const cutAfter = numericEnd && !hay.breaks.has(end) &&
      (isDigit(hay.text[end]) || (isNumberMark(hay.text[end]) && !hay.breaks.has(end + 1) && isDigit(hay.text[end + 1])));
    if (!cutBefore && !cutAfter) return true;
  }
  return false;
}

type ReadableElement = ReturnType<Window["document"]["querySelectorAll"]>[number];
const rowCells = (row: ReadableElement) => Array.from(row.querySelectorAll("th,td")).map((cell) => normalize(cell.textContent ?? ""));

/**
 * Every fact the classic layout renders, as readable text (native details
 * count as shown; hidden and screen-reader-only duplicates do not), that the
 * dossier layout does not render anywhere. Text is compared without
 * whitespace, so the same words in different markup match, and a table row,
 * list item or term pair must appear whole. A number must appear whole too:
 * a classic figure is not shown by a longer dossier number that merely
 * contains its digits. Two allowances, both stated: the
 * classic wording in {@link CLASSIC_ONLY_WORDING}, and a classic table row of
 * whole numbers that a dossier row shows cell for cell at more decimals (the
 * sensitivity grid). Returns the missing classic segments; empty means the
 * dossier shows everything classic shows.
 */
export function classicFactsMissingFromDossier(classicHtml: string, dossierHtml: string): string[] {
  const squash = (value: string) => value.replace(/\s+/g, "");
  const dossierWindow = readableDocument(dossierHtml);
  const dossier = readableText(dossierWindow);
  const dossierRows = Array.from(dossierWindow.document.querySelectorAll("tr")).map(rowCells);
  const classicWindow = readableDocument(classicHtml);
  const absent = (text: string) => text.length >= 2 && !shownWhole(squash(text), dossier);
  const worded = (text: string) => CLASSIC_ONLY_WORDING.some(({ pattern }) => pattern.test(text));
  const roundedRow = (row: ReadableElement | null | undefined) => {
    if (!row) return false;
    const cells = rowCells(row);
    return dossierRows.some((other) => other.length === cells.length && cells.every((cell, index) => roundsTo(cell, other[index]!)));
  };
  const missing: string[] = [];
  const nodesMissingOrExplained: string[] = [];
  const walker = classicWindow.document.createTreeWalker(classicWindow.document.body, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = normalize(node.textContent ?? "");
    if (!absent(text)) continue;
    nodesMissingOrExplained.push(text);
    if (!worded(text) && !roundedRow(node.parentElement?.closest("tr"))) missing.push(text);
  }
  for (const element of Array.from(classicWindow.document.querySelectorAll("tr,li,dt,dd,dl > div,td,th,p,summary,caption,h1,h2,h3,h4"))) {
    const text = normalize(element.textContent ?? "");
    if (!absent(text) || worded(text) || nodesMissingOrExplained.some((part) => text.includes(part))) continue;
    if (roundedRow(element.tagName === "TR" ? element : element.closest("tr"))) continue;
    missing.push(text);
  }
  void dossierWindow.happyDOM.close();
  void classicWindow.happyDOM.close();
  return [...new Set(missing)];
}
function plainMarkdown(value: string): string {
  return normalize(value.replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1").replace(/[`*]/g, ""));
}

export function assertUiParityContract(contract: UiParityContract, surfaces: { live: string; markdown: string; print: string; audit: string }): void {
  const live = readableHtml(surfaces.live);
  const print = readableHtml(surfaces.print);
  const bodyTexts = [live.text, plainMarkdown(surfaces.markdown), print.text];
  const audit = plainMarkdown(surfaces.audit);
  const contains = (text: string, expected: string, label: string) => {
    if (expected && !text.includes(normalize(expected))) throw new Error(`Missing ${label}: ${expected}`);
  };
  for (const id of contract.sectionIds) if (!live.ids.has(id)) throw new Error(`Missing report destination: ${id}`);
  for (const body of bodyTexts) {
    contains(body, contract.thesis, "thesis");
    for (const claim of contract.claims) contains(body, claim, "executive claim");
  }
  for (const reason of contract.gradeRationales) contains(live.text, reason, "grade rationale");
  // Raw context is deliberately at the existing audit disclosure level.
  for (const gap of contract.gaps) {
    contains(audit, gap.field, "gap identity");
    contains(audit, gap.reason, "gap reason");
  }
  for (const endpoint of contract.sourceIdentities) contains(audit, endpoint, "source endpoint");
  for (const figure of contract.figures) {
    for (const [key, value] of Object.entries(figure)) {
      if (value === null || value === undefined || key === "verified") continue;
      contains(audit, String(value), `numeric ${key}`);
    }
  }
}

export function freezeReport<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeReport(child);
  }
  return value;
}

/**
 * P22: the valuation texts each surface must show, as the shared decisions in
 * presentation.ts state them for that surface: the headline label, shown value
 * or withheld text, comparison, caveats, and every scenario row. Captured from
 * the report each surface prepares (readerPreparation.ts), so a renderer that
 * re-decides any of them, or drops one, fails {@link assertValuationParity}.
 */
export type ValuationParityContract = Record<ValuationSurface, { label: string; text: string }[]>;

export function captureValuationParity(report: Report): ValuationParityContract {
  const surfaces: ValuationSurface[] = ["markdown", "print", "classic", "dossier"];
  return Object.fromEntries(surfaces.map((surface) => {
    const prepared = prepareReportForSurface(report, surface === "markdown" || surface === "print" ? surface : "web").report;
    const texts: { label: string; text: string }[] = [];
    const add = (label: string, text: string | null | undefined) => { if (text) texts.push({ label, text }); };
    if (unavailableCashFlowModel(prepared)) {
      add("no-model withheld text", valuationNoModelWithheldText(prepared.fairValue, surface));
    } else {
      const headline = valuationHeadlineView(prepared.valuation, prepared.fairValue, surface);
      add("headline label", headline.label);
      add("headline value", headline.valueText ?? VALUATION_WITHHELD_TEXT);
      add("withheld reason", headline.perShare === null ? headline.withheldReason : null);
      add("comparison label", headline.comparison?.label);
      add("comparison", headline.comparison?.text);
      add("degraded caveat", headline.degradedCaveat);
      add("basis caveat", headline.basisCaveat);
      const scenarios = valuationScenarioView(prepared.valuation, prepared.scenarioPresentation, surface);
      add("scenario heading", scenarios.heading);
      add("weight basis", scenarios.weightBasis);
      add("scenario targets caveat", scenarioTargetsCaveat(prepared.scenarioTargets, (text) => text));
      for (const row of scenarios.rows) {
        add(`${row.scenario.name} target`, row.targetText ?? SCENARIO_TARGET_UNAVAILABLE_TEXT);
        add(`${row.scenario.name} weight label`, row.weight?.label);
        add(`${row.scenario.name} weight`, row.weight?.text);
      }
    }
    return [surface, texts];
  })) as ValuationParityContract;
}

/** Markdown with every inline escape the exports apply removed, for text comparison. */
function unescapedMarkdown(value: string): string {
  return normalize(value.replace(/\\([\\`*_~[\]<>&#@{}()+\-.!|])/g, "$1").replace(/[`*]/g, ""));
}

/** Every surface shows its own decided valuation texts; the app checks the layout it rendered. */
export function assertValuationParity(contract: ValuationParityContract, surfaces: { live: string; markdown: string; print: string }, layout: "classic" | "dossier"): void {
  const bodies: [ValuationSurface, string][] = [
    ["markdown", unescapedMarkdown(surfaces.markdown)],
    ["print", readableHtml(surfaces.print).text],
    [layout, readableHtml(surfaces.live).text],
  ];
  for (const [surface, body] of bodies) {
    for (const { label, text } of contract[surface]) {
      if (!body.includes(normalize(text))) throw new Error(`Missing ${surface} valuation ${label}: ${text}`);
    }
  }
}
