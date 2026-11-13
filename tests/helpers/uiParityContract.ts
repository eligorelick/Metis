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
