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

import { sourceFactAuditTables } from "@/report/sourceFactPresentation";
import { withPrincipalSummarySafety } from "@/report/principalAggregationSafety";
import { withHistoricalEnterpriseValueSafety } from "@/report/enterpriseValueSafety";
import { ownHistoryRankLabel } from "@/report/ownHistoryPresentation";
import { claimStatusMarkText, COMPUTED_MARK_LEGEND, indexVerificationMarks } from "@/report/verificationMarks";
import { filingDisclosureTables, newerResultsBanner } from "@/report/filingDisclosurePresentation";
import type { ReportAuditTable } from "@/report/auditTables";
import type { SourceFactSummary } from "@/report/sourceFacts";
import { valuationAuditTables, projectionAuditTables } from "@/report/auditTables";
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
} from "@/report/schema";
import {
  deriveReportCompletenessPresentation,
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
import {
  annualSegmentHeading,
  assessmentLine,
  auditExportPath,
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
  indicatorLabel,
  keyDataRows,
  methodologyNotes,
  moatHeading,
  passLine,
  priceTiming,
  pruneTable,
  reverseDcfValueText,
  runSummary,
  scoreDriverTable,
  scorecardTable,
  sourceLabel,
  splitCommonLines,
  evidenceScopeSummary,
  provenanceHeadline,
  trustHeadline,
  trustRows,
  usageSummary,
  type FigureRow,
} from "@/report/presentation";
import { presentationReportId, reportIdentityNote, type ReportPresentationContext, syntheticNotice, manifestReconciliationRows } from "@/report/presentation";
import { reportSection, type ReportSectionKey } from "@/report/sectionManifest";
import {
  markdownBlockquote,
  markdownHeading,
  markdownListItem,
  markdownProse,
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
  projectionCellPoint,
  projectionPeriodRows,
} from "@/report/surfaceManifest";
import { DISCLAIMER_TEXT, FRED_ATTRIBUTION_TEXT } from "@/report/schema";
import { applyReportAssessmentStatus, compositeDisplayForReader as compositeDisplay, compositeNote, gradeContractText, gradeDisplayLabel, gradeHeading, type AspectEvidence } from "@/report/assessment";
import { formatScore } from "@/report/scoreText";
import { fairValueWithheldText } from "@/report/fairValueText";
import { applyGradeOverrideContract } from "@/pipeline/stageC/gradeContract";

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

/** Fixed-decimal number, or an em dash for null/non-finite. */
function num(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return v.toFixed(digits);
}

function tracedValue(n: TracedNumber): string {
  return formatFinancialValue(n.value, n.unit, n.currency);
}

/** Signed percent for deltas (e.g. +7.3% / -4.0%). */
function signedPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
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
function blockquote(text: string): string {
  return `> ${markdownBlockquote(text)}`;
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

/** F-21: a factual claim's verification status after its citation, or nothing. */
function withStatusMark(claim: SourcedClaim): string {
  const mark = claimStatusMarkText(claim);
  return mark === null ? "" : ` ${mark}`;
}

/** A bullet list of sourced claims, each with its label and ONE source marker (D-62). */
function claimList(claims: readonly SourcedClaim[], numbers?: readonly TracedNumber[]): string {
  return claims
    .map((c) => `- **[${markdownListItem(c.label)}]** ${markdownListItem(displayClaimText(c, numbers))} _(${markdownProse(claimCitation(c))})_${withStatusMark(c)}`)
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
  const contractText = gradeContractText(block);
  if (contractText) lines.push("", prose(contractText));
  if (block.reasoning.length > 0) lines.push("", "Reasoning:", "", claimList(block.reasoning, block.keyNumbers));
  const { kept, homes } = withoutTabled(report, block.keyNumbers);
  const numbers = figureTable(figureRows(kept, seen));
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
    ["Segment", "Revenue", "Share"],
    rows.map((s) => [
      geographic ? geographyLabel(s.name) : s.name,
      formatFinancialAmount(s.revenue.value, s.revenue.unit, s.revenue.currency),
      s.sharePct === null ? DASH : `${s.sharePct.toFixed(1)}%`,
    ]),
  );
}

/** Deterministic pipeline tables (filing disclosures, scores), one heading each; empty tables are hidden. */
function auditTableBlocks(tables: readonly ReportAuditTable[], level = "###"): string[] {
  return tables.flatMap((block) => {
    const body = bodyTable(block.headers, block.rows);
    if (!body) return [];
    return [`${level} ${markdownHeading(block.heading)}`, "", body, "", ...(block.note ? [`_${markdownProse(block.note)}_`, ""] : [])];
  });
}

/* ======================================================================== *
 * Header, key data, verdict
 * ======================================================================== */

function renderHeader(report: Report, completeness: ReportCompletenessPresentation, context: ReportPresentationContext): string {
  const m = report.meta;
  const lines: string[] = [
    `# ${markdownHeading(m.companyName)} (${markdownHeading(m.symbol)}) — Research Report`,
    "",
    "*Metis · Equity research*",
    "",
    table(
      ["Report", "Detail"],
      [
        ["Generated", m.generatedAt],
        ["Saved report", presentationReportId(report,context) === undefined ? "ID not recorded" : `#${presentationReportId(report,context)}`],
        ["Snapshot", "Saved research; observations retain their recorded dates"],
        ...(reportIdentityNote(report,context) ? [["Embedded identity", reportIdentityNote(report,context)!]] : []),
        // D-62: one line; the judge protocol and the per-pass record are in the appendix and the audit export.
        ["Model", runSummary(report)],
        ["Usage", usageSummary(report)],
        ["Data completeness", dataStateText(completeness)],
        ...evidenceRow(report),
        ["Verification", trustHeadline(m.provenanceCoverage, report.appendix.verificationLog) ?? "Not recorded; a citation is a provenance check, not factual validation."],
        ...(provenanceHeadline(m.provenanceCoverage) ? [["Provenance", provenanceHeadline(m.provenanceCoverage, report.appendix.verificationLog)!]] : []),
        ["Versions", `spec ${m.specVersion} · pipeline ${m.pipelineVersion}`],
      ],
    ),
    "",
    // Mandatory disclaimer, verbatim.
    `> ${markdownBlockquote(m.disclaimer)}`,
    ...(syntheticNotice(report) ? ["", `> ${markdownBlockquote(syntheticNotice(report)!)}`] : []),
  ];
  return lines.join("\n");
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
  if (v.executiveSummary && v.executiveSummary.length > 0) {
    lines.push("### Executive summary", "", claimList(v.executiveSummary), "");
  }
  lines.push("### Grade strip", "", strip, "");
  // D-62: the debate belongs with the verdict it informs, not under Macro.
  lines.push(...renderDisagreements(report.disagreements));
  return lines.join("\n").trimEnd();
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
  lines.push(...quarterly);
  // D-67: beside the quarterly XBRL tables the annual provider tables are in the audit export.
  if (showAnnualSegments(quarterly.length > 0)) {
    lines.push(...subsection(`### ${annualSegmentHeading("Product", b.segments.product, false)}`, segmentTable(b.segments.product)));
  }
  if (showAnnualSegments(quarterly.length > 0) || geographicBasisNote(b.segments.geographic)) {
    lines.push(...subsection(`### ${annualSegmentHeading("Geographic", b.segments.geographic, false)}`, segmentTable(b.segments.geographic, true)));
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
  metricGroup("### Free cash flow", f.fcf);
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
  const dcfPs = v.dcf.perShare;
  lines.push(
    "### DCF",
    "",
    dcfPs
      ? `Intrinsic value per share: **${markdownProse(tracedValue(dcfPs))}**${asOfSuffix(dcfPs.asOf)}${v.dcf.upsidePct === null ? "" : ` — upside ${signedPct(v.dcf.upsidePct)}`}`
      : "Intrinsic value per share: **unavailable** — the deterministic fair value could not be computed for this route/inputs (see the data-gap summary in the appendix).",
    ...(fairValue
      ? [
          fairValue.status === "available"
            ? `_${prose(fairValue.basis.join(" "))}_`
            : `_${prose(fairValueWithheldText(fairValue))}_`,
        ]
      : []),
    "",
  );
  lines.push(...subsection("Assumptions:", bodyTable(["Assumption", "Value", "Basis"], v.dcf.assumptions.map((a) => [a.name, a.value, displayProse(compactLongIntegers(a.basis))]))));
  lines.push(...auditTableBlocks(valuationAuditTables(v.dcf)));

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
        return ps === undefined || ps === null ? DASH : formatMoneyAmount(ps, dcfPs ? establishedCurrency(dcfPs.unit, dcfPs.currency) : null, 0);
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

  lines.push("### Scenarios", "");
  if (review.scenarioPresentation?.weightBasis) lines.push(`_${markdownProse(review.scenarioPresentation.weightBasis)}_`, "");
  if (scenarioTargets) {
    if (scenarioTargets.status === "available") {
      lines.push(`_Price targets are computed-derived (${markdownProse(scenarioTargets.method)}), not analyst targets. ${prose(scenarioTargets.basis.join(" "))}_`, "");
    } else {
      const reasons = scenarioTargets.missingReasons.map((m) => m.reason).join("; ");
      lines.push(`_Scenario price targets suppressed — ${markdownProse(reasons || scenarioTargets.basis.join(" "))}_`, "");
    }
  }
  for (const block of valuationReviewBlocks({ ...review, peerCoverage: v.peerCoverage, symbol: review.report?.meta.symbol })) {
    lines.push(`### ${markdownHeading(block.title)}`, "", ...block.paragraphs.flatMap((p) => [prose(p), ""]));
    for (const item of block.items) {
      lines.push(`**${markdownProse(item.title)}**`, "", ...item.paragraphs.flatMap((p) => [prose(p), ""]));
    }
    if (block.table) lines.push(table(block.table.headers, block.table.rows), "");
  }
  // D-62: the assumption lines every scenario shares are stated once.
  const { common, specific } = splitCommonLines(v.scenarios.map((sc) => sc.assumptions.map((line) => displayProse(compactLongIntegers(line)))));
  if (common.length > 0) {
    lines.push("**Assumptions common to every scenario:**", "", ...common.map((line) => `- ${markdownListItem(line)}`), "");
  }
  v.scenarios.forEach((sc, index) => {
    lines.push(renderScenario(sc, specific[index] ?? [], review.scenarioPresentation !== undefined), "");
  });
  if (routeMetrics) lines.push(renderRouteMetrics(routeMetrics), "");
  return lines.join("\n").trimEnd();
}

function renderScenario(sc: Scenario, assumptions: readonly string[], computedWeights = false): string {
  const lines: string[] = [];
  // priceTarget is null when the deterministic computation suppressed it —
  // show "unavailable", never a fabricated value.
  const pt = sc.priceTarget;
  const target = pt ? markdownHeading(tracedValue(pt)) : "per-share target unavailable";
  const targetAsOf = pt ? asOfSuffix(pt.asOf) : "";
  const probability = sc.probability === null ? "unavailable" : `${(sc.probability * 100).toFixed(0)}%`;
  // D-60: computed targets carry no weight; a stored report that recorded one still shows it.
  const weight = computedWeights && sc.probability === null ? "" : `${computedWeights ? "display weight" : "p"} ${probability}, `;
  lines.push(
    `#### ${capitalize(sc.name)} — ${target} (${weight}${markdownHeading(sc.horizon)})${targetAsOf}`,
  );
  if (assumptions.length > 0) {
    lines.push("", "Assumptions:", "", assumptions.map((assumption) => `- ${markdownListItem(assumption)}`).join("\n"));
  }
  if (sc.whatWouldHaveToBeTrue.length > 0) {
    lines.push("", "What would have to be true:", "", sc.whatWouldHaveToBeTrue.map((condition) => `- ${item(condition)}`).join("\n"));
  }
  if (sc.qualitativeCommentary?.length) {
    lines.push("", "Qualitative commentary (not valuation inputs):", "", ...sc.qualitativeCommentary.map((text) => `- ${item(text)}`));
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
  const timing = priceTiming(report);
  const seen = new Map<string, FigureRow>();
  const lines: string[] = [sectionHeading("technicals"), ""];
  lines.push(gradeBlock("Technicals", t.graded, seen, {}, ctx), "");
  lines.push(
    "### Structured read",
    "",
    `- **Trend:** ${item(t.read.trend)}`,
    `- **Momentum:** ${item(t.read.momentum)}`,
    `- **Key levels:** ${item(t.read.keyLevels)}`,
    `- **Relative strength:** ${item(t.read.relativeStrength)}`,
    "",
  );
  const indicators = figureTable(figureRows(t.indicators.map((n) => n), seen).map((row) => ({ ...row, label: indicatorLabel(row.trace, timing) })), "Indicator");
  lines.push(...subsection("### Indicators", indicators));
  if (t.flags.length > 0) {
    lines.push("### Flags", "", table(["Severity", "Flag", "Source"], t.flags.map((f) => [f.severity, displayProse(f.text), sourceLabel(f.source)])));
  }
  return lines.join("\n").trimEnd();
}

function renderLeadership(l: Leadership, report: Pick<Report, "filingDisclosures"> = {}, ctx: GradeContext = {}): string {
  const lines: string[] = [sectionHeading("leadership"), ""];
  lines.push(gradeBlock("Leadership (capital-stewardship proxy)", l.graded, new Map(), report, ctx), "");
  lines.push("### Executives", "");
  // D-67: one card per assessed officer; the not-assessed officers share one line.
  const groups = executiveGroups(l.executives);
  for (const e of groups.assessed) {
    lines.push(
      `#### ${markdownHeading(e.name)} — ${markdownHeading(e.title)}`,
      "",
      `Grade **${executiveGradeText(e.grade)}** · credibility **${executiveGradeText(e.credibilityGrade)}**${e.tenureYears === null ? "" : ` · tenure ${e.tenureYears.toFixed(1)}y`}`,
      "",
    );
    if (e.reasoning.length > 0) lines.push(claimList(e.reasoning), "");
    if (e.assessmentReason) lines.push(prose(e.assessmentReason), "");
    for (const descriptor of EXECUTIVE_EVIDENCE_GROUPS) {
      const claims = e.evidence[descriptor.key];
      if (!claims || claims.length === 0) continue;
      lines.push(`##### ${descriptor.label}`, "", claimList(claims), "");
    }
  }
  if (groups.notAssessed.length > 0) {
    lines.push(`#### ${groups.assessed.length > 0 ? "Other officers" : "Officers"}`, "", ...groups.notAssessedLines.flatMap((line) => [markdownProse(line), ""]));
    if (groups.notAssessedClaims.length > 0) lines.push(claimList(groups.notAssessedClaims), "");
  }
  lines.push(...subsection("### Insider activity", claimList(l.insiderSummary)));
  lines.push(...subsection("### Governance", claimList(l.governanceNotes)));
  lines.push(...auditTableBlocks(filingDisclosureTables(report.filingDisclosures, "leadership")));
  return lines.join("\n").trimEnd();
}

function renderCompetitive(c: Competitive, ctx: GradeContext = {}): string {
  const lines: string[] = [sectionHeading("competitive"), ""];
  lines.push(gradeBlock("Moat", c.moatGraded, new Map(), {}, ctx), "");
  lines.push("### Peer table", "");
  if (c.peerTable.length > 0) {
    // Columns keyed by the metric, not by position (peerMetricKey).
    const metricKeys: string[] = [];
    for (const p of c.peerTable) {
      for (const key of peerColumnKeys(p.metrics)) {
        if (!metricKeys.includes(key)) metricKeys.push(key);
      }
    }
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
    lines.push(table(["Peer", "Symbol", ...metricKeys], rows), "");
  } else {
    lines.push("_No peer data._", "");
  }
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
    cr.catalysts.map((c) => [c.title, c.expectedDate ?? DASH, c.direction, c.significance, `${displayProse(c.reasoning.text, c.reasoning.source)}${withStatusMark(c.reasoning)}`]),
  )));
  lines.push(...subsection("### Risks", bodyTable(
    ["Risk", "Severity", "Probability", "Source", "Note"],
    cr.risks.map((r) => [r.title, r.severity, r.probability, sourceLabel(r.source), `${displayProse(r.reasoning.text, r.reasoning.source)}${withStatusMark(r.reasoning)}`]),
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
    lines.push(table(["Period", ...forwardPaths.map((descriptor) => descriptor.label)], rows), "");
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
      m.relevantSeries.map((s) => [s.seriesId, s.name, tracedValue(s.latest), s.latest.asOf ?? DASH, displayProse(s.relevance)]),
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

  // D-62: the standard limitations, stated once.
  lines.push("### Methodology and limitations", "", ...methodologyNotes(report).map((note) => `- ${markdownListItem(note)}`), "");

  const runRows: string[][] = [
    ...(m.execution ?? []).map((entry, index) => [index === 0 ? "Passes" : "", passLine(entry)]),
    ...(m.judgeProtocol !== undefined ? [["Judgement protocol", m.judgeProtocol.note]] : []),
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
    const rows = trustRows(a.provenanceCoverage ?? m.provenanceCoverage, a.verificationLog);
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

  const path = auditExportPath(report,context);
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
  report = applyReportAssessmentStatus(applyGradeOverrideContract(report, report.appendix.verificationLog ?? []));
  report = withHistoricalEnterpriseValueSafety(withPrincipalSummarySafety(report));
  indexVerificationMarks(report);
  const completeness = deriveReportCompletenessPresentation(
    report.meta.dataCompleteness,
    report.appendix.missingData,
    report.appendix.sources,
  );
  const blocks: string[] = [
    renderHeader(report, completeness, context),
    completeness.bannerText ? blockquote(completeness.bannerText) : "",
    newerResultsBanner(report.filingDisclosures) ? blockquote(`**Newer results not reflected.** ${newerResultsBanner(report.filingDisclosures)}`) : "",
    renderKeyData(report),
    renderVerdict(report),
    report.scores ? renderScores(report.scores) : "",
    renderBusiness(report.business, filingDisclosureTables(report.filingDisclosures, "business")),
    renderFundamentals(report.fundamentals, report.sourceFactSummary, filingDisclosureTables(report.filingDisclosures, "fundamentals"), report, gradeContext(report, "fundamentals", completeness)),
    renderBalanceSheet(report.balanceSheet, report, gradeContext(report, "balanceSheet", completeness)),
    renderValuation(report.valuation, report.scenarioTargets, report.fairValue, report.routeMetrics, { scenarioPresentation: report.scenarioPresentation, thesisTriggers: report.thesisTriggers, report }, gradeContext(report, "valuation", completeness)),
    renderQuality(report.quality, gradeContext(report, "quality", completeness)),
    renderTechnicals(report, gradeContext(report, "technicals", completeness)),
    renderLeadership(report.leadership, report, gradeContext(report, "leadership", completeness)),
    renderCompetitive(report.competitive, gradeContext(report, "moat", completeness)),
    renderCatalystsRisks(report.catalystsRisks, report.appendix.missingData.some((gap) => gap.field === "analysis.llm"), filingDisclosureTables(report.filingDisclosures, "catalystsRisks")),
    renderOutlook(report),
    report.projections ? renderProjections(report.projections) : "",
    renderMacro(report.macro),
    renderAppendix(report, completeness, context),
  ].filter((b) => b.length > 0);

  // Join sections with a blank-line-separated horizontal rule for readability;
  // ensure a single trailing newline for a clean file.
  return withComputedMarkLegend(blocks.join("\n\n---\n\n") + "\n");
}

/** F-23: a data-only report says what "computed" means under its first table with a Cited column. */
function withComputedMarkLegend(markdown: string): string {
  const lines = markdown.split("\n");
  if (!lines.some((line) => line.startsWith("|") && line.includes(" | computed |"))) return markdown;
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
