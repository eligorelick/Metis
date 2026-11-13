import { prepareReportForSurface } from "@/report/readerPreparation";
import { recordedValuationTrace } from "@/report/fairValueText";
import { qualificationText } from "@/report/assessment";
import { macroDisplayRows, plainFigureReaderNote } from "@/report/presentation";
import { SCENARIO_TARGET_UNAVAILABLE_TEXT, VALUATION_WITHHELD_TEXT, scenarioTargetsCaveat, valuationHeadlineView, valuationNoModelWithheldText, valuationScenarioView, type ScenarioRowView } from "@/report/presentation";
import { displayedProvenanceCoverage } from "@/report/presentation";
/**
 * reportToMarkdown — a clean, DETERMINISTIC Markdown rendering of a full
 * {@link Report} (report sections 1–13 + appendix) for an institutional
 * reader. This is the shareable artifact behind the "Export MD" button.
 *
 * Design goals (mirror the on-screen ReportView, plain-text edition):
 *   - Page 1 carries the call: a short run header, the key-data box, the
 *     verdict, the grades and the bull/bear disagreements.
 *   - Every claim carries its FACT/ESTIMATE/JUDGMENT label and ONE source
 *     marker with its as-of date; every figure carries a reader label, a
 *     rounded value and its as-of date (rules #2 and #5).
 *   - Audit material — registry ids, raw values, the verification log, the
 *     deterministic checks, the full missing-data manifest, the projection
 *     series and the execution record — lives in the separate audit export
 *     (src/report/export/auditMarkdown.ts, D-62).
 *   - The mandatory disclaimer and the FRED attribution appear verbatim.
 *   - DETERMINISTIC: same input → byte-identical output.
 *
 * Pure and dependency-free — safe to call from a route handler or a test.
 */

import { LEGACY_SCOPE_HEADING } from "@/report/legacyScopeQualifications";
import { analysisOutcomeText } from "@/report/analysisCompletion";
import { sourceFactAuditTables } from "@/report/sourceFactPresentation";
import { ownHistoryRankLabel } from "@/report/ownHistoryPresentation";
import { claimReasoning as sharedClaimReasoning, num, PLAIN_CLAIM_REASONING, statusMarkSuffix, tracedValue } from "@/report/export/readerFormat";
import { COMPUTED_MARK_LEGEND, hasComputedFigures } from "@/report/verificationMarks";
import { filingDisclosureTables, newerFilingBanner, newerResultsBanner } from "@/report/filingDisclosurePresentation";
import type { ReportAuditTable } from "@/report/auditTables";
import type { SourceFactSummary } from "@/report/sourceFacts";
import { valuationAuditTables, projectionAuditTables, primaryCapitalEvidenceTables } from "@/report/auditTables";
import { valuationReviewBlocks, type ValuationReviewInputs } from "@/report/researchReview";
import type {
  Appendix,
  BalanceSheet,
  Business,
  CatalystsRisks,
  Competitive,
  Disagreement,
  Fundamentals,
  GradeBlock,
  Leadership,
  Macro,
  MetricRow,
  Projections,
  Quality,
  Report,
  RouteMetrics,
  FairValue,
  Scenario,
  ScenarioTargets,
  Scoring,
  SegmentRow,
  SourcedClaim,
  Technicals,
  TracedNumber,
  Valuation,
  Verdict,
} from "@/report/schema";
import {
  type ReportCompletenessPresentation,
} from "@/report/completeness";
import {
  formatFinancialAmount,
  formatFinancialValue,
  tracedPeriodLabel,
  formatMoneyAmount,
  establishedCurrency,
  peerColumnKeys,
} from "@/report/format";
import { peerTableColumns, scenarioListItem } from "@/report/presentation";
import {
  annualSegmentHeading,
  assessmentLine,
  auditExportFilename,
  citedMark,
  claimCitation,
  compactLongIntegers,
  confidenceText,
  consensusTables,
  dataGapTables,
  displayProse,
  displayClaimText,
  qualityAccrualClarifications,
  executiveGradeText,
  executiveGroups,
  metricRowsWithoutTabled,
  ratioPercentText,
  showAnnualSegments,
  withoutChartReferences,
  seeAlsoText,
  withoutTabled,
  dataStateText,
  factorExposureTable,
  factorContributionSensitivityTable,
  figureRows,
  figureValueText,
  gapCountText,
  gapSummary,
  geographyLabel,
  geographicBasisNote,
  cashFlowGroupHeading,
  indicatorLabel,
  keyDataRows,
  technicalsFigureLabel,
  methodologyNotes,
  moatHeading,
  passLine,
  provisionalBarNote,
  provisionalSessionBar,
  pruneTable,
  reverseDcfValueText,
  runSummary,
  scoreDriverTable,
  scorecardTable,
  gradeReliabilityTable,
  sourceLabel,
  splitCommonLines,
  qualitativeScenarioConditions,
  QUALITATIVE_SCENARIO_HEADING,
  evidenceScopeSummary,
  provenanceHeadline,
  trustHeadline,
  trustRows,
  usageSummary,
  type FigureRow,
} from "@/report/presentation";
import { unavailableCashFlowModel, cashFlowModelExplanation, providerPeerListPresentation, leadershipRosterPresentation, unavailableModelInputTables } from "@/report/readerConventions";
import { presentationReportId, reportIdentityNote, type ReportPresentationContext, syntheticNotice, evidenceContractNotice, projectionsNotRecordedNotice, manifestReconciliationRows, routeMetricsForDisplay } from "@/report/presentation";
import { providerFallbackNotice } from "@/report/providerFallback";
import { reportSection, type ReportSectionKey } from "@/report/sectionManifest";
import {
  MANAGEMENT_ACTIONS_HEADING, MANAGEMENT_ACTOR_LABELS, MANAGEMENT_CATEGORY_LABELS, NO_MANAGEMENT_ACTIONS, NO_RECENT_DEVELOPMENTS,
  RECENT_DEVELOPMENTS_HEADING, SHAREHOLDER_ALIGNMENT_LABELS, developmentClaims, eventDateText, managementActionClaims,
} from "@/report/qualitativeAnalysis";
import {
  markdownBlockquote,
  markdownHeading,
  markdownListItem,
  markdownProse,
  markdownSourceLabel,
  markdownTable as table,
} from "@/report/export/markdownEscape";
import {
  EXECUTIVE_EVIDENCE_GROUPS,
  PROJECTION_METRIC_BY_KEY,
  PROJECTION_PATHS,
  SOURCE_ENTRY_FIELDS,
  gradeSurfaceEntries,
  orderedProjectionSeries,
  projectionAvailability,
  projectionDisplayAssumptions,
  projectionUnavailabilityNote,
  projectionCellPoint,
  projectionPeriodRows,
} from "@/report/surfaceManifest";
import { DISCLAIMER_TEXT, FRED_ATTRIBUTION_TEXT } from "@/report/schema";
import { compositeDisplayForReader as compositeDisplay, compositeNote, gradeDisplayLabel, readerGradeContractText, gradeHeading, type AspectEvidence } from "@/report/assessment";
import { formatScore } from "@/report/scoreText";
import { executiveAssessmentNote } from "@/report/executiveAssessment";
import { executiveTenureText, executiveCardClaims, executiveOfficeContext } from "@/report/executiveDecisions";

/** AMZN audit 2026-10-20 finding 17: the evidence-scope line, when a pass ran on a plan allowance. */
function evidenceRow(report: Report): string[][] {
  const scope = evidenceScopeSummary(report);
  return scope === null ? [] : [["Evidence", scope]];
}

/* ======================================================================== *
 * Deterministic value formatting (no locale, no grouping — stable text)
 * ======================================================================== */

const DASH = "—";

/**
 * A section heading numbered from the shared section manifest — the same
 * index and title the print export and the live view use.
 */
function sectionHeading(key: ReportSectionKey): string {
  const section = reportSection(key);
  return `## ${section.index}. ${section.printTitle}`;
}

/** As-of stamp suffix; empty when the claim/figure is timeless (null). */
function asOfSuffix(asOf: string | null): string {
  return asOf ? ` _(as of ${markdownProse(asOf)})_` : "";
}

/** Stored prose with registry ids under reader labels (D-62) and figures at reader precision (D-67). */
function prose(text: string): string {
  return markdownProse(displayProse(text));
}

function item(text: string): string {
  return markdownListItem(displayProse(text));
}

/** One generated blockquote line; the template marker remains trusted syntax. */
function blockquote(text: string, boldLabel?: string): string {
  return `> ${boldLabel === undefined ? "" : `**${boldLabel}** `}${markdownBlockquote(text)}`;
}

/**
 * A body table (D-62): columns that are empty in every row are dropped, and a
 * table with no content is not printed at all. Returns "" when hidden.
 */
function bodyTable(headers: readonly string[], rows: readonly (readonly string[])[], keep: readonly string[] = []): string {
  const pruned = pruneTable(headers, rows, keep);
  return pruned === null ? "" : table(pruned.headers, pruned.rows);
}

/** A subsection: heading + body, or nothing when the body is empty. */
function subsection(heading: string, body: string): string[] {
  return body.length === 0 ? [] : [heading, "", body, ""];
}

/* ======================================================================== *
 * Shared block renderers
 * ======================================================================== */

function claimReasoning(reasoning: SourcedClaim | SourcedClaim[]): string {
  return sharedClaimReasoning(reasoning, PLAIN_CLAIM_REASONING);
}

/** A bullet list of sourced claims, each with its label and ONE source marker (D-62). */
function claimList(claims: readonly SourcedClaim[], numbers?: readonly TracedNumber[]): string {
  return claims
    .map((c) => `- **[${markdownListItem(c.label)}]** ${markdownListItem(displayClaimText(c, numbers))} _(${markdownProse(claimCitation(c))})_${statusMarkSuffix(c)}`)
    .join("\n");
}

function figureTable(rows: readonly FigureRow[], metricHeader = "Metric"): string {
  return bodyTable(
    [metricHeader, "Value", "Period", "As of", "Cited"],
    rows.map((r) => [r.label, r.value, r.period ?? DASH, r.asOf ?? DASH, r.cited]),
    ["Cited"],
  );
}

/**
 * D-67: what a grade line needs beyond its block — the aspect's deterministic
 * score (the limited-evidence label) and the report's data state (the
 * confidence cap).
 */
interface GradeContext {
  aspect?: AspectEvidence | null;
  completeness?: ReportCompletenessPresentation;
  /** A key number's reader label when its registry label would mislead (an unfinished session's "last close"). */
  labelFor?: (n: TracedNumber) => string | undefined;
}

function gradeContext(report: Report, key: keyof NonNullable<Report["scores"]>["aspects"], completeness: ReportCompletenessPresentation): GradeContext {
  return { aspect: report.scores?.aspects[key] ?? null, completeness };
}

/** The reasoning behind a grade: header line + one-liner + claims + key numbers (deduplicated within the section). */
function gradeBlock(title: string, block: GradeBlock, seen: Map<string, FigureRow>, report: Pick<Report, "filingDisclosures"> = {}, ctx: GradeContext = {}): string {
  const confidence = ctx.completeness ? confidenceText(block.confidence, ctx.completeness) : block.confidence;
  const lines: string[] = [
    `**${title} — ${gradeHeading(block, ctx.aspect)}** (confidence: ${confidence})`,
    "",
    `_${prose(block.oneLineWhy)}_`,
  ];
  if (block.interpretation) lines.push("", prose(block.interpretation));
  const qualifier = qualificationText(block.qualification);
  if (qualifier) lines.push("", markdownProse(qualifier));
  const contractText = readerGradeContractText(block);
  if (contractText) lines.push("", prose(contractText));
  if (block.reasoning.length > 0) lines.push("", "Reasoning:", "", claimList(block.reasoning, block.keyNumbers));
  const { kept, homes } = withoutTabled(report, block.keyNumbers);
  const numbers = figureTable(figureRows(kept, seen).map((row) => ({ ...row, label: ctx.labelFor?.(row.trace) ?? row.label })));
  if (numbers) lines.push("", "Key numbers:", "", numbers);
  const also = seeAlsoText(homes);
  if (also) lines.push("", `_${markdownProse(also)}_`);
  return lines.join("\n");
}

/**
 * A MetricRow group as a period → value table. The measurement window joins
 * the period cell only when it adds information the period label lacks.
 */
function metricRowsTable(rows: readonly MetricRow[]): string {
  const body: string[][] = [];
  for (const row of rows) {
    for (const v of row.values) {
      const window = tracedPeriodLabel(v.value.period, v.value.periodContext);
      const periodCell = window === "not supplied" || v.period.includes(window) ? v.period : window.includes(v.period) ? window : `${v.period} (${window})`;
      body.push([
        row.label,
        periodCell,
        figureValueText(v.value),
        v.value.asOf ?? DASH,
        citedMark(v.value),
      ]);
    }
  }
  return bodyTable(["Metric", "Period", "Value", "As of", "Cited"], body, ["Cited"]);
}

/** Segment rows (product/geographic) as name / revenue / share. */
function segmentTable(rows: readonly SegmentRow[], geographic = false): string {
  return bodyTable(
    ["Segment", "Revenue", "Share", "Period", "As of"],
    rows.map((s) => [
      geographic ? geographyLabel(s.name) : s.name,
      formatFinancialAmount(s.revenue.value, s.revenue.unit, s.revenue.currency),
      s.sharePct === null ? DASH : `${s.sharePct.toFixed(1)}%`,
      tracedPeriodLabel(s.revenue.period, s.revenue.periodContext),
      s.revenue.asOf ?? DASH,
    ]),
  );
}

/** Deterministic pipeline tables (filing disclosures, scores), one heading each; empty tables are hidden. */
function auditTableBlocks(tables: readonly ReportAuditTable[], level = "###"): string[] {
  return tables.flatMap((block) => {
    const body = bodyTable(block.headers, block.rows);
    if (!body && !(block.headers.length === 0 && block.note)) return [];
    return [`${level} ${markdownHeading(block.heading)}`, "", ...(body ? [body, ""] : []), ...(block.note ? [`_${markdownProse(block.note)}_`, ""] : [])];
  });
}

/* ======================================================================== *
 * Header, key data, verdict
 * ======================================================================== */

function renderAboutReport(report: Report, completeness: ReportCompletenessPresentation, context: ReportPresentationContext): string {
  const m = report.meta;
  const lines: string[] = [
    "### About this report",
    "",
    table(
      ["Report", "Detail"],
      [
        ["Generated", m.generatedAt],
        ["Saved report", presentationReportId(report,context) === undefined ? "ID not recorded" : `#${presentationReportId(report,context)}`],
        ["Snapshot", "Saved research; observations retain their recorded dates"],
        ...(m.analysisOutcome ? [["Workflow completion", analysisOutcomeText(m.analysisOutcome)]] : []),
        ...(reportIdentityNote(report,context) ? [["Embedded identity", reportIdentityNote(report,context)!]] : []),
        // D-62: one line; the judge protocol and the per-pass record are in the appendix and the audit export.
        ["Model", runSummary(report)],
        ["Usage", usageSummary(report)],
        ["Data completeness", dataStateText(completeness)],
        ...evidenceRow(report),
        ["Verification", trustHeadline(displayedProvenanceCoverage(report, "header"), report.appendix.verificationLog) ?? "Not recorded; a citation is a provenance check, not factual validation."],
        ...(provenanceHeadline(displayedProvenanceCoverage(report, "header")) ? [["Provenance", provenanceHeadline(displayedProvenanceCoverage(report, "header"), report.appendix.verificationLog)!]] : []),
        ["Versions", `spec ${m.specVersion} · pipeline ${m.pipelineVersion}`],
      ],
    ),
  ];
  return lines.join("\n");
}

function renderHeader(report: Report): string {
  const m = report.meta;
  return [
    `# ${markdownHeading(m.companyName)} (${markdownHeading(m.symbol)}) — Equity Research Report`, "",
    "*Metis · Equity research*", "", `Report date: ${markdownProse(m.generatedAt.slice(0, 10))}`, "",
    `> ${markdownBlockquote(m.disclaimer)}`,
    ...(syntheticNotice(report) ? ["", `> ${markdownBlockquote(syntheticNotice(report)!)}`] : []),
    ...(providerFallbackNotice(report) ? ["", `> ${markdownBlockquote(providerFallbackNotice(report)!)}`] : []),
    ...(evidenceContractNotice(report) ? ["", `> ${markdownBlockquote(evidenceContractNotice(report)!)}`] : []),
  ].join("\n");
}

/** The page-1 key-data box (audit P1-12); rows without inputs are omitted. */
function renderKeyData(report: Report): string {
  const rows = keyDataRows(report);
  if (rows.length === 0) return "";
  return ["### Key data", "", bodyTable(["Key data", "Value", "Basis"], rows.map((row) => [row.label, row.value, row.note ?? DASH]))].join("\n");
}

function renderDisagreements(disagreements: readonly Disagreement[]): string[] {
  if (disagreements.length === 0) return [];
  const lines: string[] = ["### Bull/bear disagreements", ""];
  for (const d of disagreements) {
    lines.push(
      `- **${markdownListItem(d.topic)}** (${markdownListItem(d.kind)})`,
      `  - Bull: ${item(d.bullView)}`,
      `  - Bear: ${item(d.bearView)}`,
      `  - Judge: ${item(d.judgeResolution)}`,
    );
  }
  return [...lines, ""];
}

function renderVerdict(report: Report): string {
  const v = report.verdict;
  const strip = table(
    ["Section", "Grade", "Why"],
    gradeSurfaceEntries(v.gradeStrip).map(({ descriptor, block }) => [
      descriptor.label,
      gradeDisplayLabel(block, report.scores?.aspects[descriptor.key]),
      displayProse(block.oneLineWhy),
    ]),
  );
  const lines: string[] = [sectionHeading("verdict"), "", prose(v.synthesis), ""];
  const figureNote = plainFigureReaderNote(report);
  if (figureNote) lines.push(figureNote, "");
  if (v.executiveSummary && v.executiveSummary.length > 0) {
    lines.push("### Executive summary", "", claimList(v.executiveSummary), "");
  }
  lines.push(...renderRecentDevelopments(v.recentDevelopments));
  lines.push("### Grade strip", "", strip, "");
  // D-62: the debate belongs with the verdict it informs, not under Macro.
  lines.push(...renderDisagreements(report.disagreements));
  return lines.join("\n").trimEnd();
}

/** Q1: absent on saved reports (nothing printed); an empty list says so. */
function renderRecentDevelopments(developments: Verdict["recentDevelopments"]): string[] {
  if (developments === undefined) return [];
  const lines = [`### ${RECENT_DEVELOPMENTS_HEADING}`, ""];
  if (developments.summary.length > 0) lines.push(claimList(developments.summary), "");
  lines.push(developments.items.length === 0 ? NO_RECENT_DEVELOPMENTS : bodyTable(
    ["Date", "Development", "Direction", "Affects", "Note"],
    developments.items.map((item) => [eventDateText(item.occurredOn), item.title, item.direction, item.affects || DASH, claimReasoning(developmentClaims(item))]),
    ["Direction"],
  ), "");
  return lines;
}

function renderScores(scores: Scoring): string {
  const c = scores.composite;
  const card = scorecardTable(scores);
  const drivers = scoreDriverTable(scores);
  const exposure = factorExposureTable(scores);
  const assessment = assessmentLine(scores);
  return [
    // A sub-heading of the verdict, as on the print surface.
    "### Scorecard (deterministic)",
    "",
    // F-19: no letter under the evidence floor; the qualifier inside 45–55.
    `**Composite: ${c.score === null ? DASH : formatScore(c.score)} / 100 (${c.band === null ? DASH : compositeDisplay(scores).label})**`,
    "",
    `_${markdownProse(compositeNote(scores))}_`,
    ...(assessment ? ["", markdownProse(assessment)] : []),
    "",
    table(card.headers, card.rows),
    "",
    ...(card.note ? [`_${markdownProse(card.note)}_`, ""] : []),
    ...auditTableBlocks([gradeReliabilityTable(scores)]),
    ...(drivers ? auditTableBlocks([drivers]) : []),
    ...(exposure ? auditTableBlocks([exposure]) : []),
    ...auditTableBlocks([factorContributionSensitivityTable(scores)]),
    `_${markdownProse(c.methodology)}_ _(bands ${markdownProse(scores.bandsVersion)})_`,
  ].join("\n");
}

/* ======================================================================== *
 * Section renderers (sections 2–13)
 * ======================================================================== */

function renderBusiness(b: Business, extra: readonly ReportAuditTable[] = []): string {
  const quarterly = auditTableBlocks(extra);
  const lines: string[] = [sectionHeading("business"), ""];
  lines.push(...subsection("### What they sell", claimList(b.whatTheySell)));
  if (b.marketStructure?.length) lines.push(...subsection("### Market & industry structure", claimList(b.marketStructure)));
  lines.push(...quarterly);
  // Keep dated geography and explicitly referenced annual categories inspectable.
  const annualProductReference = [...b.whatTheySell, ...b.concentrationRisks].some(c => /annual product|product categor|product table/i.test(c.text));
  if (showAnnualSegments(quarterly.length > 0) || annualProductReference) {
    lines.push(...subsection(`### ${annualSegmentHeading("Product", b.segments.product, quarterly.length > 0)}`, segmentTable(b.segments.product)));
  }
  if (b.segments.geographic.length > 0) {
    lines.push(...subsection(`### ${annualSegmentHeading("Geographic", b.segments.geographic, quarterly.length > 0)}`, segmentTable(b.segments.geographic, true)));
    const geographicBasis = geographicBasisNote(b.segments.geographic);
    if (geographicBasis) lines.push("", markdownProse(geographicBasis), "");
  }
  lines.push(...subsection("### Concentration risks", claimList(b.concentrationRisks)));
  return lines.join("\n").trimEnd();
}

function renderFundamentals(f: Fundamentals, summary?: SourceFactSummary, extra: readonly ReportAuditTable[] = [], report: Pick<Report, "filingDisclosures"> = {}, ctx: GradeContext = {}): string {
  const seen = new Map<string, FigureRow>();
  const lines: string[] = [sectionHeading("fundamentals"), ""];
  lines.push(gradeBlock("Fundamentals", f.graded, seen, report, ctx), "");
  // D-62: figures a deterministic filing table shows are left to that table.
  const homes: string[] = [];
  const metricGroup = (heading: string, rows: readonly MetricRow[]): void => {
    const split = metricRowsWithoutTabled(report, rows);
    for (const home of split.homes) if (!homes.includes(home)) homes.push(home);
    lines.push(...subsection(heading, metricRowsTable(split.kept)));
  };
  metricGroup("### Growth", f.growthTable);
  metricGroup("### Margin trend", f.marginTrend);
  metricGroup("### Returns", f.returns);
  metricGroup(`### ${cashFlowGroupHeading(f.fcf)}`, f.fcf);
  const also = seeAlsoText(homes);
  if (also) lines.push(`_${markdownProse(also)}_`, "");
  lines.push(...auditTableBlocks(extra));
  lines.push(...subsection("### Commentary", claimList(f.commentary)));
  // D-67: the registry identity column is in the audit export.
  lines.push(...auditTableBlocks(sourceFactAuditTables(summary, false)));
  return lines.join("\n").trimEnd();
}

function renderBalanceSheet(bs: BalanceSheet, report: Pick<Report, "filingDisclosures"> = {}, ctx: GradeContext = {}): string {
  const seen = new Map<string, FigureRow>();
  const lines: string[] = [sectionHeading("balanceSheet"), ""];
  if (bs.graded) lines.push(gradeBlock("Balance Sheet & Capital", bs.graded, seen, report, ctx), "");
  const group = (title: string, g: { commentary: readonly SourcedClaim[]; numbers: readonly TracedNumber[] }): void => {
    const claims = claimList(g.commentary);
    const numbers = figureTable(figureRows(withoutTabled(report, g.numbers).kept, seen));
    if (!claims && !numbers) return;
    lines.push(`### ${title}`, "");
    if (claims) lines.push(claims, "");
    if (numbers) lines.push(numbers, "");
  };
  group("Debt profile", bs.debtProfile);
  group("Coverage", bs.coverage);
  group("Capex trajectory", bs.capexTrajectory);
  // D-63 commitments and guarantees, in their home section.
  lines.push(...auditTableBlocks(filingDisclosureTables(report.filingDisclosures, "balanceSheet")));
  lines.push(...subsection("### Capital allocation", claimList(bs.capitalAllocation)));
  return lines.join("\n").trimEnd();
}

/**
 * WS5 (D-17): the route metrics a bank, insurer or mortgage REIT leads with.
 * `withheldReason` is the load-bearing column: a blank reads as a failed fetch
 * when the figure was REFUSED. `proxy` marks a labeled stand-in.
 */
function renderRouteMetrics(rm: RouteMetrics): string {
  const rows = rm.metrics.map((m) => [
    m.label + (m.proxy ? " (stand-in)" : ""),
    m.value === null ? "withheld" : formatFinancialValue(m.value, m.unit, m.currency ?? null),
    m.withheldReason ?? m.basis,
  ]);
  return [
    `### Route metrics (${markdownHeading(rm.route)} route)${asOfSuffix(rm.asOf)}`,
    "",
    table(["Metric", "Value", "Basis / reason withheld"], rows),
    "",
    ...rm.notes.map((n) => `_${markdownProse(n)}_`),
    "",
  ].join("\n");
}

function renderValuation(
  v: Valuation,
  scenarioTargets?: ScenarioTargets,
  fairValue?: FairValue,
  routeMetrics?: RouteMetrics,
  review: ValuationReviewInputs & { report?: Report } = {},
  ctx: GradeContext = {},
): string {
  const seen = new Map<string, FigureRow>();
  const lines: string[] = [sectionHeading("valuation"), ""];
  lines.push(gradeBlock("Valuation", v.graded, seen, review.report ?? {}, ctx), "");

  // perShare is null when the deterministic fair value was suppressed — show
  // "unavailable", never a fabricated number.
  const recordedPerShare = recordedValuationTrace(v.dcf, fairValue);
  const noModel = review.report ? unavailableCashFlowModel(review.report) : false;
  if (noModel) lines.push(markdownProse(cashFlowModelExplanation(review.report!)), "", ...auditTableBlocks(unavailableModelInputTables(review.report!)));
  // P22: the headline, its caveats and the scenario rows are decided in presentation.ts.
  const noModelText = noModel ? valuationNoModelWithheldText(fairValue, "markdown") : null;
  if (noModelText !== null) lines.push(markdownProse(noModelText), "");
  if (!noModel) {
    const headline = valuationHeadlineView(v, fairValue, "markdown");
    lines.push(
      `### ${headline.heading}`,
      "",
      headline.perShare !== null && headline.valueText !== null
        ? `${headline.label}: **${markdownProse(headline.valueText)}**${asOfSuffix(headline.perShare.asOf)}${headline.comparison === null ? "" : ` — ${headline.comparison.label} ${headline.comparison.text}`}`
        : `${headline.label}: **${VALUATION_WITHHELD_TEXT}** — ${headline.withheldReason ?? ""}`,
      // Audit 2026-10-22 F-13: substituted inputs, beside the value they moved.
      ...(headline.degradedCaveat !== null ? ["", `**${markdownProse(headline.degradedCaveat)}**`] : []),
      ...(headline.basisCaveat !== null ? [`_${markdownProse(headline.basisCaveat)}_`] : []),
      "",
    );
    lines.push(...subsection("Assumptions:", bodyTable(["Assumption", "Value", "Basis"], v.dcf.assumptions.map((a) => [a.name, a.value, displayProse(compactLongIntegers(a.basis))]))));
    lines.push(...auditTableBlocks(valuationAuditTables(v.dcf, recordedPerShare)));

    // Sensitivity grid (WACC × terminal growth), rendered as a pivot table.
    const waccs = uniqueSorted(v.dcf.sensitivityGrid.map((c) => c.waccPct));
    const gterms = uniqueSorted(v.dcf.sensitivityGrid.map((c) => c.gTermPct));
    if (waccs.length > 0 && gterms.length > 0) {
      const lookup = new Map<string, number | null>();
      for (const c of v.dcf.sensitivityGrid) lookup.set(`${c.waccPct}|${c.gTermPct}`, c.perShare);
      const headers = ["WACC \\ g", ...gterms.map((g) => `${g.toFixed(1)}%`)];
      const rows = waccs.map((w) => [
        `${w.toFixed(1)}%`,
        ...gterms.map((g) => {
          const ps = lookup.get(`${w}|${g}`);
          // The grid is in the currency of the per-share value beside it.
          return ps === undefined || ps === null ? DASH : formatMoneyAmount(ps, recordedPerShare ? establishedCurrency(recordedPerShare.unit, recordedPerShare.currency) : null, 0);
        }),
      ]);
      lines.push("### Sensitivity (per share — rows = WACC, cols = terminal g)", "", table(headers, rows), "");
    }

    lines.push(
      "### Reverse DCF",
      "",
      `Implied ${markdownProse(v.reverseDcf.impliedMetric)}: **${reverseDcfValueText(v.reverseDcf.impliedMetric, v.reverseDcf.impliedValue)}**`,
      "",
      prose(v.reverseDcf.narrative),
      "",
    );
  }

  lines.push(...subsection("### Multiples", bodyTable(
    // Empirical percentile within the retained sample; N is separate from its scale.
    ["Multiple", "Basis and limitations", "Current", "Peer median", "Own-history percentile (sample)", "Sector-appropriate"],
    v.multiples.map((m) => [
      m.name,
      m.basis ?? DASH,
      m.current === null ? DASH : `${num(m.current, 1)}×`,
      m.peerMedian === null ? DASH : `${num(m.peerMedian, 1)}×${typeof m.peerCount === "number" ? ` (n = ${m.peerCount})` : ""}`,
      m.own5yPercentile === null
        ? DASH
        : ownHistoryRankLabel(m.own5yPercentile, m.ownHistoryObservations),
      m.sectorAppropriate ? "yes" : "no",
    ]),
  )));
  if (v.multiplesBasis) lines.push(markdownProse(v.multiplesBasis), "");

  // D-62: consensus and market data, shown once, beside the multiples.
  if (review.report) lines.push(...auditTableBlocks(consensusTables(review.report)));

  const scenarios = noModel ? null : valuationScenarioView(v, review.scenarioPresentation, "markdown");
  if (scenarios !== null) {
    lines.push(`### ${scenarios.heading}`, "");
    if (scenarios.weightBasis !== null) lines.push(`_${markdownProse(scenarios.weightBasis)}_`, "");
    const targetsCaveat = scenarioTargetsCaveat(scenarioTargets, markdownProse);
    if (targetsCaveat !== null) lines.push(`_${targetsCaveat}_`, "");
  }
  for (const block of valuationReviewBlocks({ ...review, valuation: v, peerCoverage: v.peerCoverage, symbol: review.report?.meta.symbol })) {
    if (noModel && block.title === "Valuation sensitivity assessment") continue;
    lines.push(`### ${markdownHeading(block.title)}`, "", ...block.paragraphs.flatMap((p) => [prose(p), ""]));
    for (const item of block.items) {
      lines.push(`**${markdownProse(item.title)}**`, "", ...item.paragraphs.flatMap((p) => [prose(p), ""]));
    }
    if (block.table) lines.push(table(block.table.headers, block.table.rows), "");
  }
  // D-62: the assumption lines every scenario shares are stated once.
  if (scenarios !== null) {
    if (scenarios.common.length > 0) {
      lines.push("**Assumptions common to every scenario:**", "", ...scenarios.common.map((line) => `- ${markdownListItem(line)}`), "");
    }
    for (const row of scenarios.rows) lines.push(renderScenario(row), "");
  } else {
    lines.push(...renderQualitativeScenarios(v.scenarios));
  }
  if (routeMetrics) lines.push(renderRouteMetrics(routeMetrics), "");
  return lines.join("\n").trimEnd();
}

/** No cash-flow model: each case's stated conditions, without target or probability scaffolding. */
function renderQualitativeScenarios(scenarios: readonly Scenario[]): string[] {
  const view = qualitativeScenarioConditions(scenarios);
  if (view === null) return [];
  const list = (title: string, items: readonly string[]) => items.length === 0 ? [] : [title, "", items.map((text) => `- ${item(text)}`).join("\n"), ""];
  return [
    `### ${QUALITATIVE_SCENARIO_HEADING}`, "",
    ...list("What would have to be true in every case:", view.commonConditions),
    ...list("Qualitative commentary common to every case (not valuation inputs):", view.commonCommentary),
    ...view.cases.flatMap((c) => [`#### ${capitalize(c.name)}`, "",
      ...list("What would have to be true:", c.conditions),
      ...list("Qualitative commentary (not valuation inputs):", c.commentary)]),
  ];
}

function renderScenario(row: ScenarioRowView): string {
  const lines: string[] = [];
  const { scenario: sc, assumptions } = row;
  // A suppressed target shows "unavailable", never a fabricated value.
  const target = row.targetText === null ? SCENARIO_TARGET_UNAVAILABLE_TEXT : markdownHeading(row.targetText);
  const targetAsOf = row.target ? asOfSuffix(row.target.asOf) : "";
  // D-60: computed targets carry no weight; a stored report that recorded one still shows it.
  const weight = row.weight === null ? "" : `${row.weight.label} ${row.weight.text}, `;
  lines.push(
    `#### ${capitalize(sc.name)} — ${target} (${weight}${markdownHeading(sc.horizon)})${targetAsOf}`,
  );
  if (assumptions.length > 0) {
    lines.push("", "Assumptions:", "", assumptions.map((assumption) => `- ${markdownListItem(assumption)}`).join("\n"));
  }
  if (sc.whatWouldHaveToBeTrue.length > 0) {
    lines.push("", "What would have to be true:", "", sc.whatWouldHaveToBeTrue.map((condition) => `- ${item(scenarioListItem(condition))}`).join("\n"));
  }
  if (sc.qualitativeCommentary?.length) {
    lines.push("", "Qualitative commentary (not valuation inputs):", "", ...sc.qualitativeCommentary.map((text) => `- ${item(scenarioListItem(text))}`));
  }
  return lines.join("\n");
}

function renderQuality(q: Quality, ctx: GradeContext = {}): string {
  const lines: string[] = [sectionHeading("quality"), ""];
  lines.push(gradeBlock("Quality", q.graded, new Map(), {}, ctx), "");
  lines.push(...qualityAccrualClarifications(q).flatMap(note => [markdownProse(note), ""]));
  const fs = q.forensicScores;
  // "Not applicable" carries the reason a battery was skipped for this route;
  // the column is dropped when no battery was skipped.
  const forensicTable = bodyTable(
    ["Battery", "Variant", "Score", "Zone", "Not applicable"],
    [
      ["Altman Z", fs.altman, num(fs.altman.score, 2)] as const,
      ["Beneish M", fs.beneish, num(fs.beneish.score, 2)] as const,
      ["Piotroski F", fs.piotroski, num(fs.piotroski.score, 0)] as const,
      // D-67: the accrual ratio prints in percent, as the score drivers and key numbers print it.
      ["Accruals", fs.accruals, fs.accruals.score === null ? DASH : ratioPercentText(fs.accruals.score)] as const,
    ].map(([label, entry, score]) => [label, entry.variant, score, entry.zone ?? DASH, entry.notApplicableReason ?? DASH]),
  );
  // D-68: methodology and context notes sit under the table; flags are findings.
  const forensicNotes = (q.notes ?? []).length > 0 ? `Notes:\n\n${(q.notes ?? []).map((note) => `- ${item(note)}`).join("\n")}` : "";
  lines.push(...subsection("### Forensic scores", [forensicTable, forensicNotes].filter((part) => part.length > 0).join("\n\n")));
  lines.push(
    "### Flags",
    "",
    q.flags.length > 0 ? table(["Severity", "Flag", "Source"], q.flags.map((f) => [f.severity, displayProse(f.text), sourceLabel(f.source)])) : "_No forensic flags raised._",
  );
  return lines.join("\n");
}

function renderTechnicals(report: Report, ctx: GradeContext = {}): string {
  const t: Technicals = report.technicals;
  const bar = provisionalSessionBar(report);
  const seen = new Map<string, FigureRow>();
  const lines: string[] = [sectionHeading("technicals"), ""];
  lines.push(gradeBlock("Technicals", t.graded, seen, {}, { ...ctx, labelFor: (n) => technicalsFigureLabel(n, bar) }), "");
  if (bar) lines.push(`_${markdownProse(provisionalBarNote(bar))}_`, "");
  lines.push(
    "### Structured read",
    "",
    `- **Trend:** ${item(t.read.trend)}`,
    `- **Momentum:** ${item(t.read.momentum)}`,
    `- **Key levels:** ${item(t.read.keyLevels)}`,
    `- **Relative strength:** ${item(t.read.relativeStrength)}`,
    "",
  );
  const indicators = figureTable(figureRows(t.indicators.map((n) => n), seen).map((row) => ({ ...row, label: indicatorLabel(row.trace, bar) })), "Indicator");
  lines.push(...subsection("### Indicators", indicators));
  if (t.flags.length > 0) {
    lines.push("### Flags", "", table(["Severity", "Flag", "Source"], t.flags.map((f) => [f.severity, displayProse(f.text), sourceLabel(f.source)])));
  }
  return lines.join("\n").trimEnd();
}

function renderLeadership(l: Leadership, report: Partial<Pick<Report, "filingDisclosures" | "appendix" | "outlook">> = {}, ctx: GradeContext = {}): string {
  const lines: string[] = [sectionHeading("leadership"), ""];
  const roster = leadershipRosterPresentation(l);
  lines.push(gradeBlock("Leadership (capital-stewardship proxy)", l.graded, new Map(), report, ctx), "");
  lines.push("### Executives", "");
  if (l.executives.length === 0) lines.push("No individual executive assessment recorded.", "");
  // D-67: one card per assessed officer; the not-assessed officers share one line.
  const contexts = new Map(l.executives.map(e => [e, executiveOfficeContext(e, l, report.appendix?.verificationLog, report.outlook?.guidanceCredibility)]));
  const companyClaims = (l.managementActions ?? []).flatMap(managementActionClaims);
  const groups = executiveGroups(l.executives, l.executives.filter(e => contexts.get(e) !== undefined || executiveTenureText(e) !== undefined));
  for (const e of groups.assessed) {
    lines.push(
      `#### ${markdownHeading(e.name)} — ${markdownHeading(e.title)}`,
      "",
      `Grade **${executiveGradeText(e.grade)}** · credibility **${executiveGradeText(e.credibilityGrade)}**`,
      "",
    );
    if (executiveTenureText(e)) lines.push(`${markdownProse(executiveTenureText(e)!)} (${markdownSourceLabel(e.officeTenure!.source)}; filed ${e.officeTenure!.filingDate})`, "");
    if (e.reasoning.length > 0) lines.push(claimList(executiveCardClaims(e, e.reasoning, companyClaims)), "");
    const context = contexts.get(e);
    const reason = context?.note ?? executiveAssessmentNote(e);
    if (reason) lines.push(prose(reason), "");
    for (const descriptor of EXECUTIVE_EVIDENCE_GROUPS) {
      const claims = executiveCardClaims(e, e.evidence[descriptor.key] ?? [], companyClaims);
      if (!claims || claims.length === 0) continue;
      lines.push(`##### ${descriptor.label}`, "", claimList(claims), "");
    }
    if (context) {
      lines.push("##### Office decision context", "");
      for (const a of context.actions) lines.push(`[${a.occurredOn} · ${MANAGEMENT_ACTOR_LABELS[a.actor]}: shared management chronology](#report-management-actions) · ${prose(a.verificationNote)}`, "");
      if (context.guidance.length) lines.push("##### Company guidance context", "", claimList(context.guidance), "");
    }
  }
  if (groups.notAssessed.length > 0) {
    lines.push(`#### ${groups.assessed.length > 0 ? "Other officers" : "Officers"}`, "", ...groups.notAssessedLines.flatMap((line) => [markdownProse(line), ""]));
    if (groups.notAssessedClaims.length > 0) lines.push(claimList(groups.notAssessedClaims), "");
  }
  if (l.managementActions !== undefined) {
    lines.push('<a id="report-management-actions"></a>', "", `### ${MANAGEMENT_ACTIONS_HEADING}`, "", l.managementActions.length === 0 ? NO_MANAGEMENT_ACTIONS : bodyTable(
      ["Date", "Who", "Action", "Shareholder alignment", "Note"],
      l.managementActions.map((item) => [eventDateText(item.occurredOn), MANAGEMENT_ACTOR_LABELS[item.actor], MANAGEMENT_CATEGORY_LABELS[item.category],
        SHAREHOLDER_ALIGNMENT_LABELS[item.shareholderAlignment], claimReasoning(managementActionClaims(item))]),
      ["Shareholder alignment"],
    ), "");
  }
  lines.push(...subsection("### Insider activity", claimList(l.insiderSummary)));
  lines.push(...subsection("### Provider executive roster", claimList(roster.roster)));
  lines.push(...subsection("### Governance", claimList(roster.governance)));
  lines.push(...auditTableBlocks(filingDisclosureTables(report.filingDisclosures, "leadership")));
  return lines.join("\n").trimEnd();
}

function renderCompetitive(c: Competitive, ctx: GradeContext = {}, report?: Report): string {
  const lines: string[] = [sectionHeading("competitive"), ""];
  lines.push(gradeBlock("Moat", c.moatGraded, new Map(), {}, ctx), "");
  const peerList = report ? providerPeerListPresentation(report) : { heading: "Peer table" };
  lines.push(`### ${peerList.heading}`, "");
  if (peerList.note) lines.push(markdownProse(peerList.note), "");
  if (!peerList.hideTable && c.peerTable.length > 0) {
    // Columns keyed by the metric, not by position (peerMetricKey), headed by reader labels.
    const { keys: metricKeys, headings } = peerTableColumns(c.peerTable);
    const rows = c.peerTable.map((p) => {
      const rowKeys = peerColumnKeys(p.metrics);
      const byKey = new Map(p.metrics.map((metric, i) => [rowKeys[i], metric]));
      return [
        p.name,
        p.symbol ?? DASH,
        ...metricKeys.map((key) => {
          const metric = byKey.get(key);
          return metric ? formatFinancialAmount(metric.value, metric.unit, metric.currency) : DASH;
        }),
      ];
    });
    lines.push(table(["Peer", "Symbol", ...headings], rows), "");
  } else if (!peerList.hideTable) {
    lines.push("_No peer data._", "");
  }
  if (c.competitors?.length) lines.push(...subsection("### Competitors", claimList(c.competitors)));
  if (c.moatAssessment.length > 0) {
    lines.push("### Moat assessment", "");
    for (const m of c.moatAssessment) {
      // D-62: "Scale — narrow", not the raw enums "scale (narrow)".
      lines.push(`#### ${markdownHeading(moatHeading(m))}`, "", claimList(m.reasoning), "");
    }
  }
  lines.push("### Market-share direction", "", prose(c.marketShareDirection));
  return lines.join("\n");
}

function renderCatalystsRisks(cr: CatalystsRisks, dataOnly = false, extra: readonly ReportAuditTable[] = []): string {
  const lines: string[] = [sectionHeading("catalystsRisks"), ""];
  if (dataOnly) lines.push("Not assessed — no completed analyst assessment is available. Empty lists do not establish that no catalysts or risks exist.", "");
  lines.push(...subsection("### Catalysts", bodyTable(
    ["Catalyst", "Expected", "Direction", "Significance", "Note"],
    cr.catalysts.map((c) => [c.title, c.expectedDate ?? DASH, c.direction, c.significance, claimReasoning(c.reasoning)]),
  )));
  lines.push(...subsection("### Risks", bodyTable(
    ["Risk", "Severity", "Probability", "Source", "Note"],
    cr.risks.map((r) => [r.title, r.severity, r.probability, sourceLabel(r.source), claimReasoning(r.reasoning)]),
    ["Probability"],
  )));
  lines.push(...auditTableBlocks(extra));
  return lines.join("\n").trimEnd();
}

function renderOutlook(report: Report): string {
  const o = report.outlook;
  const lines: string[] = [sectionHeading("outlook"), ""];
  lines.push(...subsection("### Segment trajectories", claimList(o.segmentTrajectories)));
  if (o.tam && o.tam.length > 0) lines.push(...subsection("### TAM", claimList(o.tam)));
  lines.push(...subsection("### Estimate-revision trend", claimList(o.estimateRevisionTrend)));
  lines.push(...subsection("### Guidance credibility", claimList(o.guidanceCredibility)));
  lines.push(...auditTableBlocks(filingDisclosureTables(report.filingDisclosures, "outlook")));
  const horizons: Array<[string, readonly SourcedClaim[]]> = [
    ["1-year", o.scenarioNarratives.y1],
    ["3-year", o.scenarioNarratives.y3],
    ["5-year", o.scenarioNarratives.y5],
  ];
  if (horizons.some(([, claims]) => claims.length > 0)) {
    lines.push("### Scenario narratives", "");
    for (const [label, claims] of horizons) lines.push(...subsection(`**${label}**`, claimList(claims)));
  }
  return lines.join("\n").trimEnd();
}

/** D-224: the shared "projections not recorded" note, under the section heading; empty when it does not apply. */
function renderProjectionsNotRecorded(report: Report): string {
  const notice = projectionsNotRecordedNotice(report);
  return notice ? [sectionHeading("projections"), "", `_${markdownProse(notice)}_`].join("\n") : "";
}

function renderProjections(p: Projections): string {
  const series = orderedProjectionSeries(p.series);
  const available = projectionAvailability(series);
  const pct = (w: number) => `${Math.round(w * 100)}%`;
  const lines: string[] = [
    sectionHeading("projections"),
    "",
  ];
  if (available.forward) lines.push(
    `Horizon ${p.horizonYears}y${available.weighted ? ` · unbacktested display prior weights ${pct(p.scenarioWeights.bull)} / ${pct(p.scenarioWeights.base)} / ${pct(p.scenarioWeights.bear)} (bull / base / bear)` : ""}.`,
    "",
  );
  lines.push(...auditTableBlocks(projectionAuditTables(p)));
  if (!available.forward) {
    lines.push(`_Not applicable${p.notApplicableReason ? `: ${markdownProse(p.notApplicableReason)}` : "."}_`, "");
  }
  if (!available.weighted) lines.push("No weighted projection points are available; no projection weights are applied.", "");
  // D-62: the assumption block every series repeats is stated once. D-67: no
  // chart is rendered here, so a sentence pointing at one is dropped.
  const { common, specific } = splitCommonLines(series.map((s) => projectionDisplayAssumptions(s).map((line) => withoutChartReferences(displayProse(line)))));
  if (common.length > 0) {
    lines.push("**Assumptions common to every series:**", "", ...common.map((line) => `- ${markdownListItem(line)}`), "");
  }
  const forwardPaths = PROJECTION_PATHS.filter((descriptor) => descriptor.kind !== "historical");
  series.forEach((s, index) => {
    // D-65: the table prints forecast periods only, so the heading names the forecast measure.
    lines.push(`### ${PROJECTION_METRIC_BY_KEY[s.metric].forecastLabel} (${markdownHeading(s.unit)})`, "");
    const rows = projectionPeriodRows(s).flatMap((row) => {
      const points = forwardPaths.map((descriptor) => projectionCellPoint(row, descriptor.key, s.unit));
      if (points.every((point) => point === null)) return [];
      return [[row.period, ...points.map((point) => (point === null ? DASH : tracedValue(point.value)))]];
    });
    const unavailable = projectionUnavailabilityNote(s);
    lines.push(unavailable === null ? table(["Period", ...forwardPaths.map((descriptor) => descriptor.label)], rows) : markdownProse(unavailable), "");
    const own = specific[index] ?? [];
    if (own.length > 0) lines.push("Assumptions:", "", own.map((assumption) => `- ${markdownListItem(assumption)}`).join("\n"), "");
  });
  return lines.join("\n").trimEnd();
}

function renderMacro(m: Macro): string {
  const lines: string[] = [sectionHeading("macro"), ""];
  lines.push(
    table(
      ["Series", "Name", "Latest", "As of", "Relevance"],
      macroDisplayRows(m).map((s) => [s.seriesId, s.name, tracedValue(s.latest), s.observation, displayProse(s.relevance)]),
    ),
    "",
  );
  lines.push(...subsection("### Sensitivity notes", claimList(m.sensitivityNotes)));
  // Mandatory FRED attribution, verbatim.
  lines.push(`> ${markdownBlockquote(m.fredAttribution)}`);
  return lines.join("\n");
}

/* ======================================================================== *
 * Appendix
 * ======================================================================== */

function renderAppendix(report: Report, completeness: ReportCompletenessPresentation, context: ReportPresentationContext): string {
  const a: Appendix = report.appendix;
  const m = report.meta;
  const lines: string[] = [sectionHeading("appendix"), ""];
  lines.push(renderAboutReport(report, completeness, context), "");

  // D-62: the standard limitations, stated once.
  lines.push("### Methodology and limitations", "", ...methodologyNotes(report).map((note) => `- ${markdownListItem(note)}`), "");

  const runRows: string[][] = [
    ...(m.execution ?? []).map((entry, index) => [index === 0 ? "Passes" : "", passLine(entry, report.appendix.costBreakdown)]),
    ...(m.judgeProtocol !== undefined ? [["Judgement protocol", displayProse(m.judgeProtocol.note)]] : []),
    ...(m.verifyModel !== undefined ? [["Verify model", m.verifyModel]] : []),
    ["Usage", usageSummary(report)],
    ...evidenceRow(report),
    ["Spec version", m.specVersion],
    ["Pipeline version", m.pipelineVersion],
    ...(m.runSnapshot ? [["Frozen input snapshot", `${m.runSnapshot.hash} (${m.runSnapshot.formatVersion}; ${m.runSnapshot.capturedAt})`]] : []),
  ];
  lines.push("### Run details", "", table(["Item", "Detail"], runRows), "");

  lines.push("### Verification", "");
  if (a.missingData.some((gap) => gap.field === "analysis.llm")) {
    lines.push("No completed citation-check pass. Deterministic values retain their source paths; these paths do not establish independently checked factual claims.", "");
  } else {
    const rows = trustRows(displayedProvenanceCoverage(report, "appendix"), a.verificationLog);
    if (rows.length > 0) lines.push(table(["Check", "Result"], rows.map((row) => [row.label, row.value])), "");
  }
  lines.push(
    `Citation coverage: **${a.verificationRate === null ? DASH : `${(a.verificationRate * 100).toFixed(1)}%`}** of report figures trace to a citation or payload value (provenance, not correctness).`,
    "",
  );
  if (a.consistencyChecks) {
    const c = a.consistencyChecks;
    const failed = c.direction.failed + c.period.failed + c.unit.failed + c.namedIndividual.failed;
    const checked = c.direction.checked + c.period.checked + c.unit.checked + c.namedIndividual.checked;
    lines.push(`Deterministic consistency checks: ${checked - failed}/${checked} passed (direction, period, unit and named-person checks; the log is in the audit export).`, "");
  }

  // D-67: one row per underlying data gap; process disclosures and moot entries apart.
  lines.push("### Data gaps", "", markdownProse(`${gapCountText(a.missingData, completeness)} ${dataStateText(completeness)}`), "");
  lines.push(bodyTable(["Manifest reconciliation", "Displayed groups", "Recorded entries"], manifestReconciliationRows(a.missingData, completeness).map(row => [row.label, String(row.groups), String(row.entries)])), "", "Recorded warning and critical severities are retained in the full audit. Grouping describes related issues; numerical matches do not validate whole prose claims.", "");
  lines.push(...auditTableBlocks(dataGapTables(completeness), "####"));
  const families = gapSummary(a.missingData, completeness.classification);
  if (families.length > 0) lines.push(table(["Gap family", "Entries", "Highest severity (as shown)"], families.map((row) => [row.family, String(row.entries), row.highest])), "");

  lines.push(
    "### Sources",
    "",
    table(
      SOURCE_ENTRY_FIELDS.map((field) => field.label),
      a.sources.map((source) =>
        SOURCE_ENTRY_FIELDS.map((field) => (field.key === "stale" ? (source.stale === undefined ? "unknown" : source.stale ? "yes" : "no") : source[field.key]))),
    ),
    "",
  );

  const path = auditExportFilename(report,context);
  lines.push(
    "### Audit trail",
    "",
    markdownProse(`The verification log, deterministic checks, full missing-data manifest, score drivers with registry ids, projection series, evidence timing, as-of map and pass-by-pass execution record are in the separate audit export${path ? ` (${path})` : ""}.`),
  );
  return lines.join("\n");
}

/* ======================================================================== *
 * Small helpers
 * ======================================================================== */

function uniqueSorted(values: readonly number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/* ======================================================================== *
 * reportToMarkdown — the public entry point
 * ======================================================================== */

/**
 * Render a full {@link Report} to a deterministic Markdown document. Every
 * report section, the appendix, the disclaimer and the FRED attribution are
 * present; the audit material is in {@link reportToAuditMarkdown}.
 */
export function reportToMarkdown(report: Report, context: ReportPresentationContext = {}): string {
  const prepared = prepareReportForSurface(report, "markdown");
  report = prepared.report;
  const { lenderTables, scopeQualifications, completeness } = prepared;
  const blocks: string[] = [
    renderHeader(report),
    scopeQualifications.length ? `## ${LEGACY_SCOPE_HEADING}\n\n${scopeQualifications.map(note => `- ${markdownListItem(note)}`).join("\n")}` : "",
    completeness.bannerText ? blockquote(completeness.bannerText) : "",
    newerResultsBanner(report.filingDisclosures) ? blockquote(newerResultsBanner(report.filingDisclosures)!, "Newer results not reflected.") : "",
    newerFilingBanner(report.filingDisclosures) ? blockquote(newerFilingBanner(report.filingDisclosures)!, "Newer filing not reflected.") : "",
    renderKeyData(report),
    renderVerdict(report),
    report.scores ? renderScores(report.scores) : "",
    renderBusiness(report.business, filingDisclosureTables(report.filingDisclosures, "business")),
    renderFundamentals(report.fundamentals, report.sourceFactSummary, [...filingDisclosureTables(report.filingDisclosures, "fundamentals"), ...lenderTables], report, gradeContext(report, "fundamentals", completeness)),
    renderBalanceSheet(report.balanceSheet, report, gradeContext(report, "balanceSheet", completeness)),
    renderValuation(report.valuation, report.scenarioTargets, report.fairValue, routeMetricsForDisplay(report), { scenarioPresentation: report.scenarioPresentation, thesisTriggers: report.thesisTriggers, report }, gradeContext(report, "valuation", completeness)),
    renderQuality(report.quality, gradeContext(report, "quality", completeness)),
    renderTechnicals(report, gradeContext(report, "technicals", completeness)),
    renderLeadership(report.leadership, report, gradeContext(report, "leadership", completeness)),
    ...auditTableBlocks(primaryCapitalEvidenceTables(report.primaryCapitalEvidence), "##"),
    renderCompetitive(report.competitive, gradeContext(report, "moat", completeness), report),
    renderCatalystsRisks(report.catalystsRisks, report.appendix.missingData.some((gap) => gap.field === "analysis.llm"), filingDisclosureTables(report.filingDisclosures, "catalystsRisks")),
    renderOutlook(report),
    report.projections && !unavailableCashFlowModel(report) ? renderProjections(report.projections) : renderProjectionsNotRecorded(report),
    renderMacro(report.macro),
    renderAppendix(report, completeness, context),
  ].filter((b) => b.length > 0);

  // Join sections with a blank-line-separated horizontal rule for readability;
  // ensure a single trailing newline for a clean file.
  const markdown = blocks.join("\n\n---\n\n") + "\n";
  return hasComputedFigures(report) ? withComputedMarkLegend(markdown) : markdown;
}

/** F-23: a data-only report says what "computed" means under its first table with a Cited column. */
function withComputedMarkLegend(markdown: string): string {
  const lines = markdown.split("\n");
  const header = lines.findIndex((line) => line.startsWith("|") && line.endsWith(" | Cited |"));
  if (header < 0) return markdown;
  let end = header;
  while (end + 1 < lines.length && lines[end + 1].startsWith("|")) end++;
  lines.splice(end + 1, 0, "", `_${markdownProse(COMPUTED_MARK_LEGEND)}_`);
  return lines.join("\n");
}

export { reportToAuditMarkdown } from "@/report/export/auditMarkdown";

/** Constants re-exported so callers/tests can assert on them without a second import. */
export { DISCLAIMER_TEXT, FRED_ATTRIBUTION_TEXT };
