import { METIS_LOCKUP_SVG } from "@/brand/identity";
import { withPrincipalSummarySafety } from "@/report/principalAggregationSafety";
import { withHistoricalEnterpriseValueSafety } from "@/report/enterpriseValueSafety";
import { ownHistoryRankLabel } from "@/report/ownHistoryPresentation";
/**
 * reportToPrintHtml — a self-contained, print-optimized HTML document for a
 * full {@link Report}. This is the dependency-free path to a PDF: the browser
 * prints THIS page to PDF. Intentionally LIGHT (dark-on-light) for paper
 * legibility, with print CSS (page-break-friendly section blocks, a serif
 * body, tabular numerals).
 *
 * Two consumers:
 *   - the export route (?format=pdf) returns this HTML directly (self-contained,
 *     inline CSS, no external assets — safe to serve raw);
 *   - the print page route builds a React tree, but reuses this module's body
 *     renderer + CSS so both surfaces are byte-identical in content.
 *
 * D-62: the same reader-facing structure as the Markdown export — a short run
 * header, the key-data box, the verdict with the bull/bear debate, reader
 * labels and rounded values, one source marker per claim, a methodology box
 * stated once. The audit material is the separate audit export.
 *
 * DETERMINISTIC and pure — no timestamps, no server-only imports. Every figure
 * carries its as-of; the disclaimer and FRED attribution appear verbatim.
 *
 * Security: this HTML is assembled from report content (already schema-
 * validated), so every interpolated string is HTML-escaped via {@link esc}. No
 * user-controlled markup is ever injected.
 */

import { sourceFactAuditTables } from "@/report/sourceFactPresentation";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import type { SourceFactSummary } from "@/report/sourceFacts";
import { applyReportAssessmentStatus, compositeDisplay, compositeNote, gradeContractText, gradeDisplayLabel, gradeForDisplay, type AspectEvidence } from "@/report/assessment";
import { formatScore } from "@/report/scoreText";
import { fairValueWithheldText } from "@/report/fairValueText";
import { applyGradeOverrideContract } from "@/pipeline/stageC/gradeContract";
import { valuationAuditTables, projectionAuditTables, type ReportAuditTable } from "@/report/auditTables";
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
  TracedNumber,
  Valuation,
} from "@/report/schema";
import {
  deriveReportCompletenessPresentation,
  type ReportCompletenessPresentation,
} from "@/report/completeness";
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
import {
  formatFinancialAmount,
  formatFinancialValue,
  tracedPeriodLabel,
  formatMoneyAmount,
  establishedCurrency,
  peerColumnKeys,
  formatPct,
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
  dataStateText,
  displayProse,
  displayClaimText,
  qualityAccrualClarifications,
  executiveGradeText,
  executiveGroups,
  ratioPercentText,
  showAnnualSegments,
  withoutChartReferences,
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
  metricRowsWithoutTabled,
  moatHeading,
  passLine,
  priceTiming,
  pruneTable,
  reverseDcfValueText,
  runSummary,
  scoreDriverTable,
  scorecardTable,
  seeAlsoText,
  sourceLabel,
  splitCommonLines,
  evidenceScopeSummary,
  trustHeadline,
  trustRows,
  usageSummary,
  withoutTabled,
  type BodyTable,
  type FigureRow,
} from "@/report/presentation";
import {
  REPORT_SECTION_MANIFEST,
  reportSection,
  type ReportSectionKey,
} from "@/report/sectionManifest";

/** AMZN audit 2026-10-20 finding 17: the evidence-scope line, when a pass ran on a plan allowance. */
function evidenceRow(report: Report): string[][] {
  const scope = evidenceScopeSummary(report);
  return scope === null ? [] : [["Evidence", scope]];
}

/* ======================================================================== *
 * Escaping + deterministic formatting
 * ======================================================================== */

const DASH = "—"; // em dash

/** HTML-escape a string for safe interpolation into the print document. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escaped stored prose: registry ids under reader labels, figures at reader precision (D-67). */
function prose(text: string, source?: string): string {
  return esc(displayProse(text, source));
}

function num(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return v.toFixed(digits);
}

function tracedValue(n: TracedNumber): string {
  return formatFinancialValue(n.value, n.unit, n.currency);
}

function signedPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return formatPct(v, digits, true);
}

function asOfTag(asOf: string | null): string {
  return asOf ? ` <span class="asof">as of ${esc(asOf)}</span>` : "";
}

function gradeClass(grade: string): string {
  return `g-${grade.toLowerCase()}`;
}

/* ======================================================================== *
 * HTML building blocks
 * ======================================================================== */

function h2(index: number, title: string): string {
  return `<h2 class="sec"><span class="secno">${index}</span> ${esc(title)}</h2>`;
}

function sectionHeading(key: ReportSectionKey): string {
  const section = reportSection(key);
  return h2(section.index, section.printTitle);
}

/** A table from escaped header + body cells (cells may carry inner markup). */
function table(headers: string[], rows: string[][]): string {
  const head = `<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>`;
  const body =
    rows.length === 0
      ? `<tbody><tr><td colspan="${headers.length}" class="empty">${DASH}</td></tr></tbody>`
      : `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<table>${head}${body}</table>`;
}

/**
 * A body table (D-62): always-empty columns are dropped and an empty table is
 * not printed. Cells are raw text and escaped here.
 */
function bodyTable(headers: readonly string[], rows: readonly (readonly string[])[], keep: readonly string[] = []): string {
  const pruned = pruneTable(headers, rows, keep);
  return pruned === null ? "" : table(pruned.headers, pruned.rows.map((row) => row.map(esc)));
}

function subsection(heading: string, body: string, level = "h3"): string {
  return body ? `<${level}>${esc(heading)}</${level}>${body}` : "";
}

/** Claims with ONE source marker each (D-62). */
function claimList(claims: readonly SourcedClaim[], numbers?: readonly TracedNumber[]): string {
  if (claims.length === 0) return "";
  return `<ul class="claims">${claims
    .map((c) => `<li><span class="label ${c.label.toLowerCase()}">${esc(c.label)}</span> ${esc(displayClaimText(c, numbers))} <span class="src">${esc(claimCitation(c))}</span></li>`)
    .join("")}</ul>`;
}

function figureTable(rows: readonly FigureRow[], metricHeader = "Metric"): string {
  return bodyTable([metricHeader, "Value", "Period", "As of", "Cited"], rows.map((r) => [r.label, r.value, r.period ?? DASH, r.asOf ?? DASH, r.cited]), ["Cited"]);
}

function bodyTables(tables: readonly (ReportAuditTable | BodyTable | null)[], level = "h3"): string {
  return tables.map((t) => {
    if (!t) return "";
    const body = bodyTable(t.headers, t.rows);
    return body ? `<${level}>${esc(t.heading)}</${level}>${body}${t.note ? `<p class="faint">${esc(t.note)}</p>` : ""}` : "";
  }).join("");
}

/** D-67: the aspect's deterministic score (limited-evidence label) and the data state (confidence cap). */
interface GradeContext {
  aspect?: AspectEvidence | null;
  completeness?: ReportCompletenessPresentation;
}

function gradeContext(report: Report, key: keyof NonNullable<Report["scores"]>["aspects"]): GradeContext {
  return { aspect: report.scores?.aspects[key] ?? null, completeness: deriveReportCompletenessPresentation(report.meta.dataCompleteness, report.appendix.missingData, report.appendix.sources) };
}

function gradeBlock(title: string, block: GradeBlock, seen: Map<string, FigureRow>, report: Pick<Report, "filingDisclosures"> = {}, ctx: GradeContext = {}): string {
  const confidence = ctx.completeness ? confidenceText(block.confidence, ctx.completeness) : block.confidence;
  const parts: string[] = [
    `<div class="gradehead"><span class="chip ${gradeClass(gradeForDisplay(block) ?? "unavailable")}">${esc(gradeDisplayLabel(block, ctx.aspect))}</span> <strong>${esc(title)}</strong> <span class="conf">confidence: ${esc(confidence)}</span></div>`,
    `<p class="why">${prose(block.oneLineWhy)}</p>`,
  ];
  if (block.interpretation) parts.push(`<p class="interp">${prose(block.interpretation)}</p>`);
  const contractText = gradeContractText(block);
  if (contractText) parts.push(`<p class="faint">${prose(contractText)}</p>`);
  if (block.reasoning.length > 0) parts.push(claimList(block.reasoning, block.keyNumbers));
  const { kept, homes } = withoutTabled(report, block.keyNumbers);
  parts.push(figureTable(figureRows(kept, seen)));
  const also = seeAlsoText(homes);
  if (also) parts.push(`<p class="faint">${esc(also)}</p>`);
  return `<div class="gradeblock">${parts.join("")}</div>`;
}

function metricRowsTable(rows: readonly MetricRow[]): string {
  const body: string[][] = [];
  for (const row of rows) {
    for (const v of row.values) {
      const window = tracedPeriodLabel(v.value.period, v.value.periodContext);
      const periodCell = window === "not supplied" || v.period.includes(window) ? v.period : window.includes(v.period) ? window : `${v.period} (${window})`;
      body.push([row.label, periodCell, figureValueText(v.value), v.value.asOf ?? DASH, citedMark(v.value.verified)]);
    }
  }
  return bodyTable(["Metric", "Period", "Value", "As of", "Cited"], body, ["Cited"]);
}

function segmentTable(rows: readonly SegmentRow[], geographic = false): string {
  return bodyTable(
    ["Segment", "Revenue", "Share"],
    rows.map((s) => [geographic ? geographyLabel(s.name) : s.name, formatFinancialAmount(s.revenue.value, s.revenue.unit, s.revenue.currency), s.sharePct === null ? DASH : `${s.sharePct.toFixed(1)}%`]),
  );
}

/* ======================================================================== *
 * Header, key data, verdict
 * ======================================================================== */

function headerBlock(report: Report, completeness: ReportCompletenessPresentation): string {
  const m = report.meta;
  const meta = table(
    ["Report", "Detail"],
    [
      ["Generated", m.generatedAt],
      ["Model", runSummary(report)],
      ["Usage", usageSummary(report)],
      ["Data completeness", dataStateText(completeness)],
      ...evidenceRow(report),
      ["Verification", trustHeadline(m.provenanceCoverage, report.appendix.verificationLog) ?? "Not recorded; a citation is a provenance check, not factual validation."],
      ["Versions", `spec ${m.specVersion} · pipeline ${m.pipelineVersion}`],
    ].map((r) => r.map((c) => esc(String(c)))),
  );
  return `<header class="report-header">
    <div class="metis-print-brand">${METIS_LOCKUP_SVG}</div>
    <h1>${esc(m.companyName)} <span class="ticker">(${esc(m.symbol)})</span></h1>
    <p class="subtitle">Equity Research Report</p>
    ${meta}
    <p class="disclaimer">${esc(m.disclaimer)}</p>
  </header>`;
}

function keyDataBlock(report: Report): string {
  const rows = keyDataRows(report);
  if (rows.length === 0) return "";
  return `<section class="block keydata"><h3>Key data</h3>${bodyTable(["Key data", "Value", "Basis"], rows.map((row) => [row.label, row.value, row.note ?? DASH]))}</section>`;
}

function disagreementsBlock(disagreements: readonly Disagreement[]): string {
  if (disagreements.length === 0) return "";
  const items = disagreements
    .map((d) => `<li><strong>${esc(d.topic)}</strong> (${esc(d.kind)})<ul>
        <li>Bull: ${prose(d.bullView)}</li>
        <li>Bear: ${prose(d.bearView)}</li>
        <li>Judge: ${prose(d.judgeResolution)}</li></ul></li>`)
    .join("");
  return `<h3>Bull/bear disagreements</h3><ul class="disagreements">${items}</ul>`;
}

function sectionVerdict(report: Report): string {
  const v = report.verdict;
  const strip = table(
    ["Section", "Grade", "Why"],
    gradeSurfaceEntries(v.gradeStrip).map(({ descriptor, block }) => [
      esc(descriptor.label),
      `<span class="chip ${gradeClass(gradeForDisplay(block) ?? "unavailable")}">${esc(gradeDisplayLabel(block, report.scores?.aspects[descriptor.key]))}</span>`,
      prose(block.oneLineWhy),
    ]),
  );
  const execSummary = v.executiveSummary && v.executiveSummary.length > 0 ? `<h3>Executive summary</h3>${claimList(v.executiveSummary)}` : "";
  // D-62: the debate sits with the verdict it informs.
  return `<section class="block">${sectionHeading("verdict")}<p class="synthesis">${prose(v.synthesis)}</p>${execSummary}<h3>Grade strip</h3>${strip}${disagreementsBlock(report.disagreements)}</section>`;
}

function sectionScores(scores: Scoring): string {
  const c = scores.composite;
  const card = scorecardTable(scores);
  const assessment = assessmentLine(scores);
  // F-19: no letter under the evidence floor; the qualifier inside 45–55.
  const shown = compositeDisplay(scores);
  const compositeChip = c.band === null ? DASH
    : `<span class="chip ${gradeClass(shown.grade ?? "unavailable")}">${esc(shown.label)}</span>`;
  return `<section class="block"><h3>Scorecard (deterministic)</h3>
    <p>Composite: <strong class="mono">${c.score === null ? DASH : formatScore(c.score)} / 100</strong> ${compositeChip}</p>
    <p class="faint">${esc(compositeNote(scores))}</p>
    ${assessment ? `<p>${esc(assessment)}</p>` : ""}
    ${table(card.headers, card.rows.map((row) => row.map(esc)))}${card.note ? `<p class="faint">${esc(card.note)}</p>` : ""}
    ${bodyTables([scoreDriverTable(scores), factorExposureTable(scores), factorContributionSensitivityTable(scores)])}
    <p class="faint">${esc(c.methodology)} <em>(bands ${esc(scores.bandsVersion)})</em></p></section>`;
}

/* ======================================================================== *
 * Section renderers
 * ======================================================================== */

function sectionBusiness(b: Business, extra: ReportAuditTable[] = []): string {
  const quarterly = bodyTables(extra);
  // D-67: beside the quarterly XBRL tables the annual provider tables are in the audit export.
  const annual = (showAnnualSegments(quarterly.length > 0)
    ? subsection(annualSegmentHeading("Product", b.segments.product, false), segmentTable(b.segments.product)) : "") +
    (showAnnualSegments(quarterly.length > 0) || geographicBasisNote(b.segments.geographic)
      ? `${subsection(annualSegmentHeading("Geographic", b.segments.geographic, false), segmentTable(b.segments.geographic, true))}${geographicBasisNote(b.segments.geographic) ? `<p class="faint">${esc(geographicBasisNote(b.segments.geographic)!)}</p>` : ""}` : "");
  return `<section class="block">${sectionHeading("business")}
    ${subsection("What they sell", claimList(b.whatTheySell))}
    ${quarterly}
    ${annual}
    ${subsection("Concentration risks", claimList(b.concentrationRisks))}</section>`;
}

function sectionFundamentals(f: Fundamentals, summary: SourceFactSummary | undefined, extra: ReportAuditTable[], report: Report): string {
  const seen = new Map<string, FigureRow>();
  const homes: string[] = [];
  const group = (heading: string, rows: readonly MetricRow[]): string => {
    const split = metricRowsWithoutTabled(report, rows);
    for (const home of split.homes) if (!homes.includes(home)) homes.push(home);
    return subsection(heading, metricRowsTable(split.kept));
  };
  const groups = [group("Growth", f.growthTable), group("Margin trend", f.marginTrend), group("Returns", f.returns), group("Free cash flow", f.fcf)].join("");
  const also = seeAlsoText(homes);
  return `<section class="block">${sectionHeading("fundamentals")}${gradeBlock("Fundamentals", f.graded, seen, report, gradeContext(report, "fundamentals"))}
    ${groups}${also ? `<p class="faint">${esc(also)}</p>` : ""}${bodyTables(extra)}
    ${subsection("Commentary", claimList(f.commentary))}${bodyTables(sourceFactAuditTables(summary, false))}</section>`;
}

function sectionBalanceSheet(bs: BalanceSheet, report: Report): string {
  const seen = new Map<string, FigureRow>();
  const grade = bs.graded ? gradeBlock("Balance Sheet & Capital", bs.graded, seen, report, gradeContext(report, "balanceSheet")) : "";
  const group = (title: string, g: { commentary: readonly SourcedClaim[]; numbers: readonly TracedNumber[] }): string => {
    const body = `${claimList(g.commentary)}${figureTable(figureRows(withoutTabled(report, g.numbers).kept, seen))}`;
    return subsection(title, body);
  };
  return `<section class="block">${sectionHeading("balanceSheet")}
    ${grade}
    ${group("Debt profile", bs.debtProfile)}
    ${group("Coverage", bs.coverage)}
    ${group("Capex trajectory", bs.capexTrajectory)}
    ${bodyTables(filingDisclosureTables(report.filingDisclosures, "balanceSheet"))}
    ${subsection("Capital allocation", claimList(bs.capitalAllocation))}</section>`;
}

/** WS5 (D-17): route metrics, with the withheld reason beside every blank. */
function routeMetricsBlock(rm: RouteMetrics): string {
  return [
    `<h3>Route metrics (${esc(rm.route)} route)${asOfTag(rm.asOf)}</h3>`,
    table(
      ["Metric", "Value", "Basis / reason withheld"],
      rm.metrics.map((m) => [
        esc(m.label) + (m.proxy ? ' <span class="faint">(stand-in)</span>' : ""),
        m.value === null ? "withheld" : esc(formatFinancialValue(m.value, m.unit, m.currency ?? null)),
        esc(m.withheldReason ?? m.basis),
      ]),
    ),
    ...rm.notes.map((n) => `<p class="faint">${esc(n)}</p>`),
  ].join("");
}

function sectionValuation(
  v: Valuation,
  scenarioTargets: ScenarioTargets | undefined,
  fairValue: FairValue | undefined,
  routeMetrics: RouteMetrics | undefined,
  review: ValuationReviewInputs,
  report: Report,
): string {
  const seen = new Map<string, FigureRow>();
  const parts: string[] = [gradeBlock("Valuation", v.graded, seen, report, gradeContext(report, "valuation"))];
  const dcfPs = v.dcf.perShare;
  parts.push(
    dcfPs
      ? `<h3>DCF</h3><p>Intrinsic value per share: <strong class="mono">${esc(tracedValue(dcfPs))}</strong>${asOfTag(dcfPs.asOf)}${v.dcf.upsidePct === null ? "" : ` &mdash; upside <span class="mono">${esc(signedPct(v.dcf.upsidePct))}</span>`}</p>`
      : `<h3>DCF</h3><p>Intrinsic value per share: <strong>unavailable</strong> &mdash; the deterministic fair value could not be computed for this route/inputs (see the data-gap summary in the appendix).</p>`,
  );
  if (fairValue) {
    parts.push(
      fairValue.status === "available"
        ? `<p class="faint">${prose(fairValue.basis.join(" "))}</p>`
        : `<p class="faint">${esc(fairValueWithheldText(fairValue))}</p>`,
    );
  }
  parts.push(bodyTable(["Assumption", "Value", "Basis"], v.dcf.assumptions.map((a) => [a.name, a.value, displayProse(compactLongIntegers(a.basis))])));
  parts.push(bodyTables(valuationAuditTables(v.dcf)));

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
        // In the currency of the per-share value beside it.
        return ps === undefined || ps === null ? DASH : formatMoneyAmount(ps, dcfPs ? establishedCurrency(dcfPs.unit, dcfPs.currency) : null, 0);
      }),
    ]);
    parts.push(`<h3>Sensitivity (per share &mdash; rows = WACC, cols = terminal g)</h3>`, table(headers, rows.map((r) => r.map((c) => `<span class="mono">${esc(c)}</span>`))));
  }

  parts.push(`<h3>Reverse DCF</h3><p>Implied ${esc(v.reverseDcf.impliedMetric)}: <strong class="mono">${esc(reverseDcfValueText(v.reverseDcf.impliedMetric, v.reverseDcf.impliedValue))}</strong></p><p>${prose(v.reverseDcf.narrative)}</p>`);

  parts.push(subsection("Multiples", bodyTable(
    // Empirical percentile within the retained sample; N is separate from its scale.
    ["Multiple", "Basis and limitations", "Current", "Peer median", "Own-history percentile (sample)", "Sector-appropriate"],
    v.multiples.map((m) => [
      m.name,
      m.basis ?? DASH,
      m.current === null ? DASH : `${num(m.current, 1)}×`,
      m.peerMedian === null ? DASH : `${num(m.peerMedian, 1)}×${typeof m.peerCount === "number" ? ` (n = ${m.peerCount})` : ""}`,
      m.own5yPercentile === null ? DASH : ownHistoryRankLabel(m.own5yPercentile, m.ownHistoryObservations),
      m.sectorAppropriate ? "yes" : "no",
    ]),
  )));
  if (v.multiplesBasis) parts.push(`<p class="faint">${esc(v.multiplesBasis)}</p>`);
  // D-62: consensus and market data, once, beside the multiples.
  parts.push(bodyTables(consensusTables(report)));

  parts.push(`<h3>Scenarios</h3>`);
  if (review.scenarioPresentation?.weightBasis) parts.push(`<p class="faint">${esc(review.scenarioPresentation.weightBasis)}</p>`);
  if (scenarioTargets) {
    parts.push(scenarioTargets.status === "available"
      ? `<p class="faint">Price targets are computed-derived (${esc(scenarioTargets.method)}), not analyst targets. ${prose(scenarioTargets.basis.join(" "))}</p>`
      : `<p class="faint">Scenario price targets suppressed — ${esc(scenarioTargets.missingReasons.map((m) => m.reason).join("; ") || scenarioTargets.basis.join(" "))}</p>`);
  }
  for (const block of valuationReviewBlocks({ ...review, peerCoverage: v.peerCoverage, symbol: report.meta.symbol })) {
    parts.push(`<h3>${esc(block.title)}</h3>`, ...block.paragraphs.map((p) => `<p>${prose(p)}</p>`));
    for (const item of block.items) parts.push(`<h4>${esc(item.title)}</h4>`, ...item.paragraphs.map((p) => `<p>${prose(p)}</p>`));
    if (block.table) parts.push(bodyTable(block.table.headers, block.table.rows));
  }
  const { common, specific } = splitCommonLines(v.scenarios.map((sc) => sc.assumptions.map((line) => displayProse(compactLongIntegers(line)))));
  if (common.length > 0) parts.push(`<p><em>Assumptions common to every scenario</em></p><ul class="claims">${common.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`);
  v.scenarios.forEach((sc, index) => parts.push(scenarioCard(sc, specific[index] ?? [], review.scenarioPresentation !== undefined)));
  if (routeMetrics) parts.push(routeMetricsBlock(routeMetrics));
  return `<section class="block">${sectionHeading("valuation")}${parts.join("")}</section>`;
}

function scenarioCard(sc: Scenario, assumptions: readonly string[], computedWeights = false): string {
  const list = (items: readonly string[]): string => `<ul>${items.map((i) => `<li>${prose(i)}</li>`).join("")}</ul>`;
  const probability = sc.probability === null ? "unavailable" : `${(sc.probability * 100).toFixed(0)}%`;
  const blocks = [
    assumptions.length > 0 ? `<div><em>Assumptions</em>${list(assumptions)}</div>` : "",
    sc.whatWouldHaveToBeTrue.length > 0 ? `<div><em>What would have to be true</em>${list(sc.whatWouldHaveToBeTrue)}</div>` : "",
    sc.qualitativeCommentary?.length ? `<div><em>Qualitative commentary (not valuation inputs)</em>${list(sc.qualitativeCommentary)}</div>` : "",
  ].join("");
  return `<div class="scenario ${esc(sc.name)}">
    <div class="scenariohead"><strong>${esc(sc.name.toUpperCase())}</strong>
      <span class="mono">${sc.priceTarget ? esc(tracedValue(sc.priceTarget)) : "per-share target unavailable"}</span>
      ${computedWeights && sc.probability === null ? "" : `<span class="prob">${computedWeights ? "display weight" : "p"} ${probability}</span>`}
      <span class="asof">${esc(sc.horizon)}</span></div>
    <div class="scenariobody">${blocks}</div></div>`;
}

function sectionQuality(q: Quality, report: Report): string {
  const fs = q.forensicScores;
  // "Not applicable" carries the reason a battery was skipped for this route;
  // the column is dropped when no battery was skipped.
  const forensic = bodyTable(
    ["Battery", "Variant", "Score", "Zone", "Not applicable"],
    ([
      ["Altman Z", fs.altman, num(fs.altman.score, 2)],
      ["Beneish M", fs.beneish, num(fs.beneish.score, 2)],
      ["Piotroski F", fs.piotroski, num(fs.piotroski.score, 0)],
      // D-67: the accrual ratio prints in percent, as the score drivers and key numbers print it.
      ["Accruals", fs.accruals, fs.accruals.score === null ? DASH : ratioPercentText(fs.accruals.score)],
    ] as const).map(([label, entry, score]) => [label, entry.variant, score, entry.zone ?? DASH, entry.notApplicableReason ?? DASH]),
  );
  const flags = q.flags.length > 0
    ? table(["Severity", "Flag", "Source"], q.flags.map((f) => [esc(f.severity), prose(f.text), esc(sourceLabel(f.source))]))
    : `<p class="faint">No forensic flags raised.</p>`;
  // D-68: methodology and context notes sit under the table; flags are findings.
  const notes = (q.notes ?? []).length > 0 ? `<div><em>Notes</em><ul>${(q.notes ?? []).map((note) => `<li>${prose(note)}</li>`).join("")}</ul></div>` : "";
  const clarification = qualityAccrualClarifications(q).map(note => `<p class="faint">${esc(note)}</p>`).join("");
  return `<section class="block">${sectionHeading("quality")}${gradeBlock("Quality", q.graded, new Map(), report, gradeContext(report, "quality"))}${clarification}${subsection("Forensic scores", forensic + notes)}<h3>Flags</h3>${flags}</section>`;
}

function sectionTechnicals(report: Report): string {
  const t = report.technicals;
  const timing = priceTiming(report);
  const seen = new Map<string, FigureRow>();
  const read = `<ul class="read">
    <li><strong>Trend:</strong> ${prose(t.read.trend)}</li>
    <li><strong>Momentum:</strong> ${prose(t.read.momentum)}</li>
    <li><strong>Key levels:</strong> ${prose(t.read.keyLevels)}</li>
    <li><strong>Relative strength:</strong> ${prose(t.read.relativeStrength)}</li></ul>`;
  const grade = gradeBlock("Technicals", t.graded, seen, report, gradeContext(report, "technicals"));
  const indicators = figureTable(figureRows(t.indicators, seen).map((row) => ({ ...row, label: indicatorLabel(row.trace, timing) })), "Indicator");
  const flags = t.flags.length > 0 ? table(["Severity", "Flag", "Source"], t.flags.map((f) => [esc(f.severity), prose(f.text), esc(sourceLabel(f.source))])) : "";
  return `<section class="block">${sectionHeading("technicals")}${grade}<h3>Structured read</h3>${read}${subsection("Indicators", indicators)}${subsection("Flags", flags)}</section>`;
}

function sectionLeadership(l: Leadership, report: Report): string {
  // D-67: one card per assessed officer; the not-assessed officers share one line.
  const groups = executiveGroups(l.executives);
  const execs = groups.assessed
    .map((e) => {
      const evidence = EXECUTIVE_EVIDENCE_GROUPS.map((descriptor) => {
        const claims = e.evidence[descriptor.key];
        if (!claims || claims.length === 0) return "";
        return `<h4>${esc(descriptor.label)}</h4>${claimList(claims)}`;
      }).join("");
      return `<div class="exec"><h4>${esc(e.name)} &mdash; ${esc(e.title)}</h4>
        <p>Grade <span class="chip ${gradeClass(e.grade)}">${esc(executiveGradeText(e.grade))}</span> &middot; credibility <span class="chip ${gradeClass(e.credibilityGrade)}">${esc(executiveGradeText(e.credibilityGrade))}</span>${e.tenureYears === null ? "" : ` &middot; tenure ${e.tenureYears.toFixed(1)}y`}</p>${e.assessmentReason ? `<p>${prose(e.assessmentReason)}</p>` : ""}${claimList(e.reasoning)}${evidence}</div>`;
    })
    .join("");
  const others = groups.notAssessed.length > 0
    ? `<div class="exec"><h4>${groups.assessed.length > 0 ? "Other officers" : "Officers"}</h4>${groups.notAssessedLines.map((line) => `<p>${esc(line)}</p>`).join("")}${claimList(groups.notAssessedClaims)}</div>`
    : "";
  return `<section class="block">${sectionHeading("leadership")}${gradeBlock("Leadership (capital-stewardship proxy)", l.graded, new Map(), report, gradeContext(report, "leadership"))}<h3>Executives</h3>${execs}${others}${subsection("Insider activity", claimList(l.insiderSummary))}${subsection("Governance", claimList(l.governanceNotes))}${bodyTables(filingDisclosureTables(report.filingDisclosures, "leadership"))}</section>`;
}

function sectionCompetitive(c: Competitive, report: Report): string {
  let peers = `<p class="faint">No peer data.</p>`;
  if (c.peerTable.length > 0) {
    // Columns keyed by the metric, not by position — see peerMetricKey.
    const metricKeys: string[] = [];
    for (const p of c.peerTable) {
      for (const key of peerColumnKeys(p.metrics)) if (!metricKeys.includes(key)) metricKeys.push(key);
    }
    const rows = c.peerTable.map((p) => {
      const rowKeys = peerColumnKeys(p.metrics);
      const byKey = new Map(p.metrics.map((metric, i) => [rowKeys[i], metric]));
      return [
        esc(p.name),
        esc(p.symbol ?? DASH),
        ...metricKeys.map((key) => {
          const metric = byKey.get(key);
          return metric ? `<span class="mono">${esc(formatFinancialAmount(metric.value, metric.unit, metric.currency))}</span>` : DASH;
        }),
      ];
    });
    peers = table(["Peer", "Symbol", ...metricKeys], rows);
  }
  // D-62: "Scale — narrow", not the raw enums.
  const moat = c.moatAssessment.map((m) => `<h4>${esc(moatHeading(m))}</h4>${claimList(m.reasoning)}`).join("");
  return `<section class="block">${sectionHeading("competitive")}${gradeBlock("Moat", c.moatGraded, new Map(), report, gradeContext(report, "moat"))}<h3>Peer table</h3>${peers}${subsection("Moat assessment", moat)}
    <h3>Market-share direction</h3><p>${prose(c.marketShareDirection)}</p></section>`;
}

function sectionCatalystsRisks(cr: CatalystsRisks, dataOnly = false, extra: ReportAuditTable[] = []): string {
  const catalysts = bodyTable(
    ["Catalyst", "Expected", "Direction", "Significance", "Note"],
    cr.catalysts.map((c) => [c.title, c.expectedDate ?? DASH, c.direction, c.significance, displayProse(c.reasoning.text, c.reasoning.source)]),
  );
  const risks = bodyTable(
    ["Risk", "Severity", "Probability", "Source", "Note"],
    cr.risks.map((r) => [r.title, r.severity, r.probability, sourceLabel(r.source), displayProse(r.reasoning.text, r.reasoning.source)]),
    ["Probability"],
  );
  const disclosure = dataOnly ? "<p>Not assessed — no completed analyst assessment is available. Empty lists do not establish that no catalysts or risks exist.</p>" : "";
  return `<section class="block prominent">${sectionHeading("catalystsRisks")}${disclosure}${subsection("Catalysts", catalysts)}${subsection("Risks", risks)}${bodyTables(extra)}</section>`;
}

function sectionOutlook(report: Report): string {
  const o = report.outlook;
  const horizons: Array<[string, readonly SourcedClaim[]]> = [["1-year", o.scenarioNarratives.y1], ["3-year", o.scenarioNarratives.y3], ["5-year", o.scenarioNarratives.y5]];
  const narratives = horizons.map(([label, claims]) => subsection(label, claimList(claims), "h4")).join("");
  return `<section class="block">${sectionHeading("outlook")}
    ${subsection("Segment trajectories", claimList(o.segmentTrajectories))}
    ${o.tam && o.tam.length > 0 ? subsection("TAM", claimList(o.tam)) : ""}
    ${subsection("Estimate-revision trend", claimList(o.estimateRevisionTrend))}
    ${subsection("Guidance credibility", claimList(o.guidanceCredibility))}${bodyTables(filingDisclosureTables(report.filingDisclosures, "outlook"))}
    ${narratives ? `<h3>Scenario narratives</h3>${narratives}` : ""}</section>`;
}

function sectionProjections(p: Projections): string {
  const series = orderedProjectionSeries(p.series);
  const available = projectionAvailability(series);
  const forwardPaths = PROJECTION_PATHS.filter((descriptor) => descriptor.kind !== "historical");
  // D-67: no chart is rendered here, so a sentence pointing at one is dropped.
  const { common, specific } = splitCommonLines(series.map((s) => projectionDisplayAssumptions(s).map((line) => withoutChartReferences(displayProse(line)))));
  const blocks = series
    .map((s, index) => {
      const rows = projectionPeriodRows(s).flatMap((row) => {
        const points = forwardPaths.map((descriptor) => projectionCellPoint(row, descriptor.key, s.unit));
        if (points.every((point) => point === null)) return [];
        return [[esc(row.period), ...points.map((point) => `<span class="mono">${point === null ? DASH : esc(tracedValue(point.value))}</span>`)]];
      });
      const own = specific[index] ?? [];
      const assumptions = own.length > 0 ? `<ul class="claims">${own.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : "";
      return `<h3>${esc(PROJECTION_METRIC_BY_KEY[s.metric].forecastLabel)} (${esc(s.unit)})</h3>${table(["Period", ...forwardPaths.map((descriptor) => descriptor.label)], rows)}${assumptions}`;
    })
    .join("");
  const pct = (w: number) => `${Math.round(w * 100)}%`;
  return `<section class="block">${sectionHeading("projections")}
    ${available.forward ? `<p class="faint">Horizon ${p.horizonYears}y${available.weighted ? ` · unbacktested display prior weights ${pct(p.scenarioWeights.bull)} / ${pct(p.scenarioWeights.base)} / ${pct(p.scenarioWeights.bear)} (bull / base / bear)` : ""}.</p>` : ""}
    ${!available.forward ? `<p class="faint">Not applicable${p.notApplicableReason ? `: ${esc(p.notApplicableReason)}` : "."}</p>` : ""}
    ${!available.weighted ? `<p class="faint">No weighted projection points are available; no projection weights are applied.</p>` : ""}
    ${bodyTables(projectionAuditTables(p))}
    ${common.length > 0 ? `<p><em>Assumptions common to every series</em></p><ul class="claims">${common.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>` : ""}
    ${blocks}</section>`;
}

function sectionMacro(m: Macro): string {
  const series = table(
    ["Series", "Name", "Latest", "As of", "Relevance"],
    m.relevantSeries.map((s) => [esc(s.seriesId), esc(s.name), `<span class="mono">${esc(tracedValue(s.latest))}</span>`, esc(s.latest.asOf ?? DASH), prose(s.relevance)]),
  );
  return `<section class="block">${sectionHeading("macro")}${series}${subsection("Sensitivity notes", claimList(m.sensitivityNotes))}<p class="attribution">${esc(m.fredAttribution)}</p></section>`;
}

function sectionAppendix(report: Report, completeness: ReportCompletenessPresentation): string {
  const a: Appendix = report.appendix;
  const m = report.meta;
  const methodology = `<div class="methodology"><h3>Methodology and limitations</h3><ul>${methodologyNotes(report).map((note) => `<li>${esc(note)}</li>`).join("")}</ul></div>`;
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
  const run = `<h3>Run details</h3>${table(["Item", "Detail"], runRows.map((row) => row.map(esc)))}`;
  const dataOnly = a.missingData.some((gap) => gap.field === "analysis.llm");
  const trust = trustRows(a.provenanceCoverage ?? m.provenanceCoverage, a.verificationLog);
  const checks = a.consistencyChecks;
  const checkLine = checks
    ? (() => {
        const failed = checks.direction.failed + checks.period.failed + checks.unit.failed + checks.namedIndividual.failed;
        const checked = checks.direction.checked + checks.period.checked + checks.unit.checked + checks.namedIndividual.checked;
        return `<p>Deterministic consistency checks: ${checked - failed}/${checked} passed (direction, period, unit and named-person checks; the log is in the audit export).</p>`;
      })()
    : "";
  const verification = `<h3>Verification</h3>${dataOnly
    ? "<p>No completed citation-check pass. Deterministic values retain their source paths; these paths do not establish independently checked factual claims.</p>"
    : trust.length > 0 ? table(["Check", "Result"], trust.map((row) => [esc(row.label), esc(row.value)])) : ""}
    <p>Citation coverage: <strong>${a.verificationRate === null ? DASH : `${(a.verificationRate * 100).toFixed(0)}%`}</strong> of report figures trace to a citation or payload value (provenance, not correctness).</p>${checkLine}`;
  // D-67: one row per underlying data gap; process disclosures and moot entries apart.
  const families = gapSummary(a.missingData, completeness.classification);
  const gaps = `<h3>Data gaps</h3><p>${esc(`${gapCountText(a.missingData, completeness)} ${dataStateText(completeness)}`)}</p>${bodyTables(dataGapTables(completeness), "h4")}${families.length > 0 ? table(["Gap family", "Entries", "Highest severity (as shown)"], families.map((row) => [esc(row.family), String(row.entries), esc(row.highest)])) : ""}`;
  const sources = `<h3>Sources</h3>${table(
    SOURCE_ENTRY_FIELDS.map((field) => field.label),
    a.sources.map((source) => SOURCE_ENTRY_FIELDS.map((field) => (field.key === "stale" ? (source.stale === undefined ? "unknown" : source.stale ? "yes" : "no") : esc(source[field.key])))),
  )}`;
  const path = auditExportPath(report);
  const audit = `<h3>Audit trail</h3><p>The verification log, deterministic checks, full missing-data manifest, score drivers with registry ids, projection series, evidence timing, as-of map and pass-by-pass execution record are in the separate audit export${path ? ` (<span class="mono">${esc(path)}</span>)` : ""}.</p>`;
  return `<section class="block">${sectionHeading("appendix")}${methodology}${run}${verification}${gaps}${sources}${audit}</section>`;
}

/**
 * The report BODY (sections only) as an HTML fragment — reused by both the
 * standalone document and the React print page. Does NOT include <html>/<head>.
 */
export function reportToPrintBody(report: Report): string {
  report = applyReportAssessmentStatus(applyGradeOverrideContract(report, report.appendix.verificationLog ?? []));
  report = withHistoricalEnterpriseValueSafety(withPrincipalSummarySafety(report));
  const completeness = deriveReportCompletenessPresentation(report.meta.dataCompleteness, report.appendix.missingData, report.appendix.sources);
  const sections: Record<ReportSectionKey, string> = {
    verdict: `${sectionVerdict(report)}${report.scores ? sectionScores(report.scores) : ""}`,
    business: sectionBusiness(report.business, filingDisclosureTables(report.filingDisclosures, "business")),
    fundamentals: sectionFundamentals(report.fundamentals, report.sourceFactSummary, filingDisclosureTables(report.filingDisclosures, "fundamentals"), report),
    balanceSheet: sectionBalanceSheet(report.balanceSheet, report),
    valuation: sectionValuation(report.valuation, report.scenarioTargets, report.fairValue, report.routeMetrics, { scenarioPresentation: report.scenarioPresentation, thesisTriggers: report.thesisTriggers }, report),
    quality: sectionQuality(report.quality, report),
    technicals: sectionTechnicals(report),
    leadership: sectionLeadership(report.leadership, report),
    competitive: sectionCompetitive(report.competitive, report),
    catalystsRisks: sectionCatalystsRisks(report.catalystsRisks, report.appendix.missingData.some((gap) => gap.field === "analysis.llm"), filingDisclosureTables(report.filingDisclosures, "catalystsRisks")),
    outlook: sectionOutlook(report),
    projections: report.projections ? sectionProjections(report.projections) : "",
    macro: sectionMacro(report.macro),
    appendix: sectionAppendix(report, completeness),
  };
  return [
    headerBlock(report, completeness),
    completeness.bannerText ? `<aside class="data-only-banner">${esc(completeness.bannerText)}</aside>` : "",
    keyDataBlock(report),
    ...REPORT_SECTION_MANIFEST.map((section) => sections[section.key]),
  ]
    .filter((b) => b.length > 0)
    .join("\n");
}

/**
 * The print CSS — light, paper-legible, page-break-friendly. Exported so the
 * React print page can inject the identical stylesheet.
 */
export const PRINT_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 0;
  background: #ffffff; color: #181b19;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 11pt; line-height: 1.45;
  font-variant-numeric: tabular-nums;
}
.metis-print-brand { width: 132pt; margin-bottom: 16pt; }
.metis-print-brand svg { display: block; width: 100%; height: auto; }
.print-doc { max-width: 8.1in; margin: 0 auto; padding: 0.6in 0.7in; }
h1 { font-size: 20pt; margin: 0 0 2pt; font-family: Georgia, serif; }
.ticker { color: #665b4c; font-weight: normal; }
.subtitle { margin: 0 0 12pt; color: #665b4c; font-size: 11pt; letter-spacing: 0.04em; text-transform: uppercase; }
.report-header { border-bottom: 2px solid #181b19; padding-bottom: 12pt; margin-bottom: 16pt; }
.disclaimer { margin-top: 10pt; font-style: italic; color: #665b4c; }
.attribution { margin-top: 8pt; font-size: 9pt; color: #665b4c; font-style: italic; }
h2.sec { font-size: 14pt; margin: 18pt 0 6pt; padding-top: 6pt; border-top: 1px solid #d5cbbb; }
.secno { display: inline-block; min-width: 1.6em; color: #6f685c; font-weight: normal; }
h3 { font-size: 11.5pt; margin: 12pt 0 4pt; color: #2a2e36; }
h4 { font-size: 10.5pt; margin: 8pt 0 3pt; color: #2a2e36; }
p { margin: 4pt 0; overflow-wrap: anywhere; }
.synthesis { font-size: 11.5pt; margin: 0 0 10pt; }
.faint { color: #6f685c; }
.mono { font-family: "SF Mono", "Consolas", "Menlo", monospace; font-variant-numeric: tabular-nums; }
.asof { color: #6f685c; font-size: 8.5pt; font-family: "SF Mono", Consolas, monospace; }
.src { color: #6f685c; font-size: 8.5pt; font-family: "SF Mono", Consolas, monospace; }
table { width: 100%; border-collapse: collapse; margin: 5pt 0 9pt; font-size: 9.5pt; break-inside: auto; page-break-inside: auto; }
.report-header table { table-layout: fixed; }
.report-header th:first-child, .report-header td:first-child { width: 22%; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th, td { border: 1px solid #d5cbbb; padding: 3pt 5pt; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
th { background: #f6f2e9; font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.03em; color: #665b4c; }
td.empty { text-align: center; color: #6f685c; }
ul.claims { margin: 4pt 0; padding-left: 16pt; }
ul.claims li { margin: 3pt 0; }
.read { margin: 4pt 0; padding-left: 16pt; }
.label { display: inline-block; font-family: Arial, sans-serif; font-size: 7.5pt; font-weight: bold; text-transform: uppercase; padding: 0 3pt; border: 1px solid currentColor; border-radius: 2px; letter-spacing: 0.04em; }
.label.fact { color: #665b4c; }
.label.estimate { color: #785b32; }
.label.judgment { color: #9a6b00; }
.chip { display: inline-block; min-width: 1.4em; text-align: center; font-family: Arial, sans-serif; font-weight: bold; padding: 0 4pt; border: 1.5px solid currentColor; border-radius: 2px; }
.g-a { color: #1a7f4b; } .g-b { color: #3a8f3a; } .g-c { color: #9a6b00; } .g-d { color: #b5521a; } .g-f { color: #c0392b; }
.gradeblock { border: 1px solid #d5cbbb; background: #faf8f3; padding: 8pt 10pt; margin: 6pt 0 10pt; }
.gradehead { font-size: 11pt; }
.conf { color: #6f685c; font-size: 9pt; }
.why { font-style: italic; margin: 4pt 0; }
.interp { margin: 4pt 0; color: #2a2e36; border-left: 2px solid #d5cbbb; padding-left: 8pt; }
.v.ok { color: #1a7f4b; } .v.warn { color: #b5521a; font-size: 8pt; } .v.faint { color: #b5bac4; }
.scenario { border: 1px solid #d5cbbb; margin: 6pt 0; padding: 6pt 8pt; break-inside: avoid; }
.scenario.bull { border-left: 3px solid #1a7f4b; }
.scenario.base { border-left: 3px solid #785b32; }
.scenario.bear { border-left: 3px solid #c0392b; }
.scenariohead { font-size: 10.5pt; }
.scenariohead .prob { color: #665b4c; margin-left: 6pt; }
.scenariobody { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; margin-top: 4pt; }
.scenariobody ul { margin: 2pt 0; padding-left: 14pt; }
.block { break-inside: auto; }
.block.prominent { border: 2px solid #785b32; padding: 6pt 10pt; background: #faf8f3; margin: 12pt 0; }
.exec { break-inside: avoid; margin: 6pt 0; }
.disagreements ul { margin: 2pt 0; }
.keydata { border: 1.5px solid #181b19; padding: 4pt 10pt 6pt; margin: 0 0 12pt; break-inside: avoid; }
.keydata h3 { margin-top: 4pt; }
.methodology { border: 1px solid #d5cbbb; background: #faf8f3; padding: 6pt 10pt; margin: 6pt 0 10pt; }
.methodology ul { margin: 2pt 0; padding-left: 14pt; }
@media print {
  .print-doc { max-width: none; padding: 0; margin: 0; }
  h2.sec, h3, h4 { break-after: avoid-page; page-break-after: avoid; }
  .scenario, .gradeblock, .exec { break-inside: avoid; page-break-inside: avoid; }
  @page { margin: 0.6in 0.5in; }
}
`;

/**
 * The tiny auto-print script: fires the browser print dialog once the document
 * has loaded. Included only when {@link ReportToPrintHtmlOptions.autoPrint} is
 * set — the self-contained ?format=pdf response uses it so the print dialog
 * appears immediately.
 */
const AUTOPRINT_SCRIPT = `<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},250);});</script>`;

export interface ReportToPrintHtmlOptions {
  /** When true, embed a script that fires window.print() on load. */
  autoPrint?: boolean;
}

/**
 * Full standalone print document (`<!doctype html>` … `</html>`) for a report.
 * Self-contained: inline CSS, no external assets, escaped content.
 */
export function reportToPrintHtml(report: Report, options: ReportToPrintHtmlOptions = {}): string {
  const title = `${report.meta.symbol} — ${report.meta.companyName} — Metis Report`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<div class="print-doc">
${reportToPrintBody(report)}
</div>
${options.autoPrint ? AUTOPRINT_SCRIPT : ""}
</body>
</html>`;
}

/* ======================================================================== *
 * Helpers
 * ======================================================================== */

function uniqueSorted(values: readonly number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}
