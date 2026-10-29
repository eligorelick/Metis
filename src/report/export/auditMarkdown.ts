/**
 * reportToAuditMarkdown — the machine-checkable audit trail that accompanies a
 * research report (D-62). The report body is written for a reader; this file
 * keeps every raw leaf the body no longer prints: registry ids, full-precision
 * values, the pass-by-pass execution record, the verification log and the
 * deterministic checks, the full missing-data manifest, the score drivers, the
 * projection series and the as-of map.
 *
 * Served by GET /api/export/[reportId]?format=audit. Pure and DETERMINISTIC:
 * same input → byte-identical output (sorted as-of keys, no clock, no locale).
 */

import { formatExecutionMetadata } from "@/report/execution";
import { withPrincipalSummarySafety } from "@/report/principalAggregationSafety";
import { withHistoricalEnterpriseValueSafety } from "@/report/enterpriseValueSafety";
import { withLegacyEdgarDerivedLines } from "@/report/legacyEdgarDerivedLines";
import { withLegacyPayloadRecordSafety } from "@/report/legacyPayloadRecordSafety";
import { scoreAuditTables, factualValidationText } from "@/report/auditTables";
import { evidenceTimingRows, EVIDENCE_TIMING_NOTE } from "@/report/evidenceTiming";
import { deriveReportCompletenessPresentation, type ClassifiedGap } from "@/report/completeness";
import { peerCoverageAuditLines } from "@/report/researchReview";
import { sourceFactAuditTables } from "@/report/sourceFactPresentation";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import type { FilingSupplements } from "@/report/filingSupplementPresentation";
import {
  formatCostUsd,
  roundedDisplayedCostTotal,
} from "@/report/format";
import { displayedValidationStatus, geographicBasisNote, qualityAccrualClarifications, trustRows } from "@/report/presentation";
import { figureCitationStatus, indexVerificationMarks } from "@/report/verificationMarks";
import { providerFallbackNotice } from "@/report/providerFallback";
import {
  markdownBlockquote,
  markdownHeading,
  markdownProse,
  markdownTable as table,
} from "@/report/export/markdownEscape";
import {
  ASPECT_SCORE_FIELDS,
  AS_OF_MAP_FIELDS,
  COMPOSITE_SCORE_FIELDS,
  MANIFEST_ENTRY_FIELDS,
  PROJECTION_DISCLOSURE_FIELDS,
  PROJECTION_METRIC_BY_KEY,
  PROJECTION_PATHS,
  PROJECTION_POINT_FIELD_BY_KEY,
  PROJECTION_ROOT_FIELDS,
  PROJECTION_SCENARIO_WEIGHTS,
  PROJECTION_SERIES_FIELD_BY_KEY,
  SCORE_SURFACES,
  SCORE_WEIGHTS,
  SOURCE_ENTRY_FIELDS,
  TRACED_NUMBER_FIELDS,
  VERIFICATION_LOG_FIELDS,
  orderedProjectionSeries,
} from "@/report/surfaceManifest";
import { verificationEntryOutcomeLabel } from "@/report/schema";
import type {
  CheckRate,
  ConsistencyChecks,
  Projections,
  ProvenanceCoverage,
  Report,
  Scoring,
  TracedNumber,
} from "@/report/schema";
import { presentationReportId, reportIdentityNote, type ReportPresentationContext, syntheticNotice, manifestReconciliationRows, usageSummary } from "@/report/presentation";

function auditValue(value: unknown): string {
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function tracedAuditCells(trace: TracedNumber): string[] {
  return TRACED_NUMBER_FIELDS.map((field) => {
    if (field.key === "verified") return figureCitationStatus(trace);
    return auditValue(trace[field.key]);
  });
}

function coverageCell(supported: number, total: number, rate: number | null): string {
  return `${supported}/${total} (${rate === null ? "n/a — no items" : `${(rate * 100).toFixed(1)}%`})`;
}

// The coverage counts, grade-strip reasoning included, beside the displayed
// rows above them (review of F-21).
function provenanceCoverageTable(coverage: ProvenanceCoverage): string {
  return table(
    ["Evidence class", "Supported / total, grade-strip reasoning included"],
    [
      ["Numeric provenance", coverageCell(coverage.numeric.supported, coverage.numeric.total, coverage.numeric.rate)],
      ["Factual-claim citations", coverageCell(coverage.factualClaims.supported, coverage.factualClaims.total, coverage.factualClaims.rate)],
      ["Judgment citations", coverageCell(coverage.judgments.cited, coverage.judgments.total, coverage.judgments.rate)],
    ],
  );
}

const CONSISTENCY_CHECK_LABELS: readonly [keyof ConsistencyChecks, string][] = [
  ["direction", "Direction word vs the sign of the cited change"],
  ["period", "Period phrase vs the cited figure's period"],
  ["unit", "Unit word vs the cited figure's registry unit"],
  ["namedIndividual", "Claims naming a person: filings/transcripts only"],
];

function checkCell(rate: CheckRate): string {
  return `${rate.passed}/${rate.checked} (${rate.rate === null ? "n/a — nothing eligible" : `${(rate.rate * 100).toFixed(0)}%`})`;
}

function renderRun(report: Report, context: ReportPresentationContext): string {
  const m = report.meta;
  const lines: string[] = ["## Run execution", ""];
  lines.push(table(["Field", "Value"], [
    ["Generated", m.generatedAt],
    ["Saved report", presentationReportId(report,context) === undefined ? "ID not recorded" : `#${presentationReportId(report,context)}`],
    ["Recorded usage", usageSummary(report)],
    ...(reportIdentityNote(report,context) ? [["Embedded identity", reportIdentityNote(report,context)!]] : []),
    ["Model", m.model],
    ["Spec version", m.specVersion],
    ["Pipeline version", m.pipelineVersion],
    ...(m.verifyModel !== undefined ? [["Verify model", m.verifyModel]] : []),
    ...(m.runSnapshot ? [["Frozen input snapshot", `${m.runSnapshot.hash} (${m.runSnapshot.formatVersion}; ${m.runSnapshot.capturedAt})`]] : []),
  ]), "");
  if (m.judgeProtocol !== undefined) lines.push("### Judgement protocol", "", markdownProse(m.judgeProtocol.note), "");
  if (m.execution && m.execution.length > 0) {
    lines.push("### Pass execution", "", ...m.execution.map((entry) => `- ${markdownProse(formatExecutionMetadata(entry))}`), "");
  }
  const totalCost = roundedDisplayedCostTotal(report.appendix.costBreakdown.map((entry) => entry.costUsd));
  lines.push(
    "### Recorded API charge breakdown",
    "",
    table(["Step", "Model", "Cost (USD)", "Note"], report.appendix.costBreakdown.map((e) => [e.step, e.model, formatCostUsd(e.costUsd), e.discarded === true ? `discarded: ${e.discardedReason ?? "its output was not used"}` : ""])),
    "",
    `Recorded API charge total: **${formatCostUsd(totalCost)}**. Plan subscriptions and unreported usage are not priced by this ledger.`,
  );
  return lines.join("\n");
}

function renderVerification(report: Report): string {
  const a = report.appendix;
  const lines: string[] = ["## Verification", ""];
  const coverage = a.provenanceCoverage ?? report.meta.provenanceCoverage;
  const rows = trustRows(coverage, a.verificationLog);
  if (rows.length > 0) lines.push(table(["Check", "Result"], rows.map((row) => [row.label, row.value])), "");
  const detail = factualValidationText(coverage, a.verificationLog);
  if (detail) lines.push(markdownProse(detail), "");
  if (coverage) lines.push(provenanceCoverageTable(coverage), "");
  lines.push(
    `Citation coverage: **${a.verificationRate === null ? "—" : `${(a.verificationRate * 100).toFixed(1)}%`}** — share of report figures traceable to a citation or payload value; a provenance check, not a correctness check.`,
    "",
  );
  if (a.consistencyChecks) {
    lines.push(
      "### Deterministic checks",
      "",
      "No model call. Each check evaluates only the claim/figure pairs it can locate, so a low \"checked\" count means little could be checked — not that everything passed. Failures appear in the verification log below with the sentence, the cited figure and the reason.",
      "",
      table(["Deterministic check", "Passed / checked"], CONSISTENCY_CHECK_LABELS.map(([key, label]) => [label, checkCell(a.consistencyChecks![key])])),
      "",
    );
  }
  if (a.verificationLog && a.verificationLog.length > 0) {
    lines.push(
      "### Verification log",
      "",
      table(
        VERIFICATION_LOG_FIELDS.map((field) => field.label),
        a.verificationLog.map((entry) =>
          VERIFICATION_LOG_FIELDS.map((field) => {
            if (field.key === "outcome") return verificationEntryOutcomeLabel(entry);
            // F-22: a legacy metadata gap recorded as contradicted reads as
            // unverified. Its support columns came from the same failure, and
            // the stored entry cannot show whether the value also conflicted.
            if (displayedValidationStatus(entry) !== entry.validationStatus) {
              const reread = field.key === "validationStatus" ? displayedValidationStatus(entry)
                : field.key === "numericSupportStatus" && entry.numericSupportStatus === "contradicted" ? "unchecked"
                  : field.key === "claimSupportStatus" && entry.claimSupportStatus === "contradicted" ? "cited" : undefined;
              if (reread !== undefined) return `${auditValue(reread)} (recorded contradicted; period or unit not established; value not rechecked)`;
            }
            return auditValue(entry[field.key]);
          })),
      ),
      "",
    );
  }
  return lines.join("\n").trimEnd();
}

function renderScores(scores: Scoring): string {
  const c = scores.composite;
  const aspectDescriptors = SCORE_SURFACES.filter((descriptor) => descriptor.kind === "aspect");
  const compositeFields = COMPOSITE_SCORE_FIELDS.filter((field) => field.key !== "weights");
  const aspectFields = ASPECT_SCORE_FIELDS.filter((field) => field.key !== "drivers" && field.key !== "signals");
  return [
    "## Scorecard (deterministic)",
    "",
    table(
      ["Score identity", ...compositeFields.map((field) => field.label)],
      [[
        SCORE_SURFACES[0].label,
        ...compositeFields.map((field) => {
          if (field.key === "score") return auditValue(c.score);
          if (field.key === "band") return auditValue(c.band);
          return c.methodology;
        }),
      ]],
    ),
    "",
    "### Composite weights",
    "",
    table(["Aspect", "Weight"], SCORE_WEIGHTS.map((descriptor) => [descriptor.label, String(c.weights[descriptor.aspect])])),
    "",
    "### Aspect scores",
    "",
    table(
      ["Aspect", ...aspectFields.map((field) => field.label)],
      aspectDescriptors.map((descriptor) => {
        const aspect = scores.aspects[descriptor.key];
        return [
          descriptor.label,
          ...aspectFields.map((field) => (field.key === "dataCompleteness" ? String(aspect.dataCompleteness) : auditValue(aspect[field.key]))),
        ];
      }),
    ),
    "",
    "### Score drivers",
    "",
    table(
      ["Aspect", ...TRACED_NUMBER_FIELDS.map((field) => field.label)],
      aspectDescriptors.flatMap((descriptor) =>
        scores.aspects[descriptor.key].drivers.map((driver) => [descriptor.label, ...tracedAuditCells(driver)])),
    ),
    "",
    ...scoreAuditTables(scores).flatMap((t) => [`### ${t.heading}`, "", table(t.headers, t.rows), ...(t.note ? ["", markdownProse(t.note)] : []), ""]),
    `_Band table: ${markdownProse(scores.bandsVersion)}._`,
  ].join("\n");
}

/** Every traced figure the report body shows, with its registry identity. */
function renderFigureRegistry(report: Report): string {
  const groups: Array<[string, readonly TracedNumber[]]> = [
    ["Fundamentals", report.fundamentals.graded.keyNumbers],
    ["Balance sheet", [
      ...(report.balanceSheet.graded?.keyNumbers ?? []),
      ...report.balanceSheet.debtProfile.numbers,
      ...report.balanceSheet.coverage.numbers,
      ...report.balanceSheet.capexTrajectory.numbers,
    ]],
    ["Valuation", report.valuation.graded.keyNumbers],
    ["Quality", report.quality.graded.keyNumbers],
    ["Technicals", [...report.technicals.graded.keyNumbers, ...report.technicals.indicators]],
    ["Leadership (capital-stewardship proxy)", report.leadership.graded.keyNumbers],
    ["Competitive", [...report.competitive.moatGraded.keyNumbers, ...report.competitive.peerTable.flatMap((peer) => peer.metrics)]],
  ];
  const rows = groups.flatMap(([section, numbers]) => numbers.map((n) => [section, ...tracedAuditCells(n)]));
  if (rows.length === 0) return "";
  return [
    "## Figure registry",
    "",
    "Every traced figure in the report body, with its registry id and stored value. The body shows these under reader labels, rounded, with exact duplicates removed.",
    "",
    table(["Section", ...TRACED_NUMBER_FIELDS.map((field) => field.label)], rows),
  ].join("\n");
}

function renderTiming(report: Report): string {
  const rows = evidenceTimingRows(report);
  if (rows.length === 0) return "";
  const lines: string[] = [];
  if (rows.length > 0) {
    lines.push("## Evidence timing", "", table(["Event", "Established timing"], rows.map((row) => [row.label, row.value])), "", markdownProse(EVIDENCE_TIMING_NOTE), "");
  }
  return lines.join("\n").trimEnd();
}

function renderProjections(p: Projections): string {
  const series = orderedProjectionSeries(p.series);
  const lines: string[] = ["## Projection audit trail", ""];
  lines.push(
    table(
      ["Field", "Value"],
      PROJECTION_ROOT_FIELDS.flatMap((field) => {
        if (field.key === "scenarioWeights") {
          return PROJECTION_SCENARIO_WEIGHTS.map((descriptor) => [`${descriptor.label} scenario weight`, String(p.scenarioWeights[descriptor.key])]);
        }
        if (field.key === "horizonYears") return [[field.label, String(p.horizonYears)]];
        if (field.key === "weightsVersion") return [[field.label, p.weightsVersion]];
        if (field.key === "series") return [[field.label, String(p.series.length)]];
        return [[field.label, auditValue(p[field.key])]];
      }),
    ),
    "",
  );
  for (const s of series) {
    const metric = PROJECTION_METRIC_BY_KEY[s.metric];
    lines.push(`### ${metric.label} projection series`, "");
    lines.push(
      table(
        [
          PROJECTION_SERIES_FIELD_BY_KEY.metric.label,
          "Path",
          PROJECTION_POINT_FIELD_BY_KEY.period.label,
          PROJECTION_POINT_FIELD_BY_KEY.periodStart.label,
          PROJECTION_POINT_FIELD_BY_KEY.periodEnd.label,
          PROJECTION_POINT_FIELD_BY_KEY.periodBasis.label,
          "Series unit",
          ...TRACED_NUMBER_FIELDS.map((field) => field.label),
        ],
        PROJECTION_PATHS.flatMap((path) =>
          s[path.key].map((point) => [
            metric.label,
            path.label,
            point.period,
            auditValue(point.periodStart),
            auditValue(point.periodEnd),
            auditValue(point.periodBasis),
            s.unit,
            ...tracedAuditCells(point.value),
          ])),
      ),
      "",
      table([PROJECTION_SERIES_FIELD_BY_KEY.assumptions.label], s.assumptions.map((assumption) => [assumption])),
      "",
      table(
        PROJECTION_DISCLOSURE_FIELDS.map((field) => field.label),
        s.disclosures.map((disclosure) =>
          PROJECTION_DISCLOSURE_FIELDS.map((field) => {
            if (field.key === "attemptedSources") return disclosure.attemptedSources?.join(", ") ?? "n/a";
            if (field.key === "expected") return disclosure.expected === undefined ? "unknown" : disclosure.expected ? "yes" : "no";
            if (field.key === "resolution") return auditValue(disclosure.resolution);
            return disclosure[field.key];
          })),
      ),
      "",
    );
  }
  return lines.join("\n").trimEnd();
}

/**
 * D-67: how the report body reads this record — how its header counts the
 * manifest, and what the body moved here: the annual provider segment tables
 * (the prior presentation, beside the quarterly XBRL tables), the full peer
 * screen and the source-fact table with its registry identities.
 */
function renderBodyReading(report: Report): string {
  const lines: string[] = [];
  const k = deriveReportCompletenessPresentation(report.meta.dataCompleteness, report.appendix.missingData, report.appendix.sources).classification;
  const counted: Array<[string, ClassifiedGap]> = [
    ...k.dataGaps.map((gap) => ["data gap", gap] as [string, ClassifiedGap]),
    ...k.processDisclosures.map((gap) => ["analysis-process disclosure", gap] as [string, ClassifiedGap]),
    ...k.downgraded.map((gap) => ["shown as information", gap] as [string, ClassifiedGap]),
  ];
  if (counted.length > 0) {
    lines.push(
      "### How the report counts the manifest",
      "",
      "One row per underlying gap: the report header counts data gaps and analysis-process disclosures separately, and shows the downgraded entries as information for the reason given. The manifest above keeps every recorded severity.",
      "",
      table(["Class", "Shown as", "Recorded", "Manifest fields", "Why"], counted.map(([kind, gap]) => [kind, kind === "analysis-process disclosure" ? "disclosure" : gap.severity, gap.recordedSeverity, gap.fields.join(", "), gap.downgrade ?? ""])),
      "",
    );
  }
  const segments = report.business.segments;
  const segmentRows = [
    ...segments.product.map((s) => ["Product", s.name, String(s.revenue.value), s.revenue.unit, s.revenue.asOf ?? "n/a", s.sharePct === null ? "n/a" : String(s.sharePct), s.revenue.source]),
    ...segments.geographic.map((s) => ["Geographic", s.name, String(s.revenue.value), s.revenue.unit, s.revenue.asOf ?? "n/a", s.sharePct === null ? "n/a" : String(s.sharePct), s.revenue.source]),
  ];
  if (segmentRows.length > 0) {
    lines.push(
      "### Annual provider segments",
      "",
      "Annual segment rows retain their source's labels and allocation basis. The report body shows them only when no quarterly XBRL segment table is available.",
      "",
      table(["Kind", "Segment", "Revenue", "Unit", "As of", "Share %", "Registry id"], segmentRows),
      ...(geographicBasisNote(segments.geographic) ? ["", markdownProse(geographicBasisNote(segments.geographic)!)] : []),
      "",
    );
  }
  const peers = report.valuation.peerCoverage;
  const accrualClarifications = qualityAccrualClarifications(report.quality);
  if (accrualClarifications.length > 0) lines.push("### Quality structured measures", "", ...accrualClarifications.flatMap(note => [markdownProse(note), ""]));
  if (peers) lines.push("### Peer screen", "", ...peerCoverageAuditLines(peers).flatMap((line) => [`- ${markdownProse(line)}`]), "");
  const facts = sourceFactAuditTables(report.sourceFactSummary, true)[0];
  if (facts) lines.push(`### ${facts.heading}`, "", table(facts.headers, facts.rows), "");
  const disclosures: FilingSupplements | undefined = report.filingDisclosures;
  if (disclosures) {
    for (const timing of filingDisclosureTables(report.filingDisclosures, "balanceSheet").filter(item => item.heading.startsWith("Payment timing as reported"))) {
      lines.push(`### ${timing.heading}`, "", table(timing.headers, timing.rows), "", markdownProse(timing.note ?? ""), "");
    }
    const supplements = Object.fromEntries(Object.entries({
      filingFacts: disclosures.filingFacts,
      commentaryOutlook: disclosures.commentaryOutlook,
      officerChanges: disclosures.officerChanges,
      sayOnPay: disclosures.sayOnPay,
      tradingArrangements: disclosures.tradingArrangements,
      companyStatements: report.filingDisclosures?.companyStatements,
      commitmentPaymentTiming: report.filingDisclosures?.commitmentPaymentTiming,
    }).filter(([, value]) => value !== undefined && (!Array.isArray(value) || value.length > 0)));
    if (Object.keys(supplements).length > 0) {
      lines.push("### Filing disclosure supplements (raw record)", "", "Stored values, periods, source identities and issuer text, before display rounding.", "", "```json", JSON.stringify(supplements, null, 2), "```", "");
    }
  }
  if (lines.length === 0) return "";
  return ["## How the report body reads this record", "", ...lines].join("\n").trimEnd();
}

function renderManifest(report: Report): string {
  const a = report.appendix;
  const completeness = deriveReportCompletenessPresentation(report.meta.dataCompleteness, a.missingData, a.sources);
  return [
    "## Missing-data manifest",
    "",
    markdownProse(completeness.statusText),
    "",
    a.missingData.length > 0
      ? table(
          MANIFEST_ENTRY_FIELDS.map((field) => field.label),
          a.missingData.map((gap) =>
            MANIFEST_ENTRY_FIELDS.map((field) => {
              if (field.key === "attemptedSources") return gap.attemptedSources?.join(", ") ?? "n/a";
              if (field.key === "expected") return gap.expected === undefined ? "unknown" : gap.expected ? "yes" : "no";
              if (field.key === "resolution") return auditValue(gap.resolution);
              return gap[field.key];
            })),
        )
      : `_${markdownProse(completeness.manifestText)}_`,
  ].join("\n");
}

function renderSources(report: Report): string {
  const keys = Object.keys(report.meta.asOfMap).sort();
  return [
    "## Sources",
    "",
    table(
      SOURCE_ENTRY_FIELDS.map((field) => field.label),
      report.appendix.sources.map((source) =>
        SOURCE_ENTRY_FIELDS.map((field) => {
          if (field.key === "stale") return source.stale === undefined ? "unknown" : source.stale ? "yes" : "no";
          return source[field.key];
        })),
    ),
    ...(keys.length > 0
      ? ["", "### As-of map", "", table(AS_OF_MAP_FIELDS.map((field) => field.label), keys.map((k) => [k, report.meta.asOfMap[k]]))]
      : []),
  ].join("\n");
}

function renderOwnHistory(report: Report): string {
  const rows = report.valuation.multiples.filter(row => row.ownHistoryDetails?.length);
  if (!rows.length) return "";
  return ["## Historical multiple sample observations", "",
    "Each value below is a retained sample observation. Market dates are the actual capitalization observation dates; vendor ratios do not establish an underlying quote date.", "",
    ...rows.flatMap(row => [`### ${markdownHeading(row.name)}`, "", markdownProse(row.ownHistoryBasis ?? "Sample basis unavailable."), "",
      table(["Period end", "Market date", "Multiple (unrounded)", "Source", "Capitalization source"],
        row.ownHistoryDetails!.map(point => [point.periodEnd, point.marketDate ?? "unavailable", String(point.value), point.source, point.marketCapSourceId ?? "unavailable"])), ""]),
  ].join("\n").trimEnd();
}

/** The full audit trail for one report, as Markdown. */
export function reportToAuditMarkdown(report: Report, context: ReportPresentationContext = {}): string {
  report = withLegacyEdgarDerivedLines(withLegacyPayloadRecordSafety(withHistoricalEnterpriseValueSafety(withPrincipalSummarySafety(report))));
  indexVerificationMarks(report);
  const m = report.meta;
  const blocks = [
    [
      `# ${markdownHeading(m.companyName)} (${markdownHeading(m.symbol)}) — Audit trail`,
      "",
      `*Metis · companion to the research report${presentationReportId(report,context) === undefined ? "" : ` #${presentationReportId(report,context)}`} generated ${markdownProse(m.generatedAt)}*`,
      "",
      `> ${markdownBlockquote("Machine-checkable record behind the report: raw values, registry ids, checks and data gaps. It is not a second report and adds no analysis.")}`,
      ...(syntheticNotice(report) ? ["", `> ${markdownBlockquote(syntheticNotice(report)!)}`] : []),
      ...(providerFallbackNotice(report) ? ["", `> ${markdownBlockquote(providerFallbackNotice(report)!)}`] : []),
    ].join("\n"),
    renderRun(report,context),
    report.marketData?.enterpriseValueNote ? `## Historical enterprise-value presentation\n\n${markdownProse(report.marketData.enterpriseValueNote)}` : "",
    renderVerification(report),
    report.scores ? renderScores(report.scores) : "",
    renderFigureRegistry(report),
    report.valuation.multiplesBasis ? `## Current multiple equity and enterprise-value basis\n\n${markdownProse(report.valuation.multiplesBasis)}` : "",
    report.valuation.multiples.some(row => row.basis) ? `## Current multiple row bases and limitations\n\n${table(["Multiple", "Current (unrounded)", "Basis and limitations"], report.valuation.multiples.filter(row => row.basis).map(row => [row.name, row.current === null ? "unavailable" : String(row.current), row.basis!]))}` : "",
    renderOwnHistory(report),
    renderTiming(report),
    report.projections ? renderProjections(report.projections) : "",
    renderManifest(report),
    table(["Manifest reconciliation", "Displayed groups", "Recorded entries"], manifestReconciliationRows(report.appendix.missingData, deriveReportCompletenessPresentation(report.meta.dataCompleteness, report.appendix.missingData, report.appendix.sources)).map(row => [row.label, String(row.groups), String(row.entries)])),
    renderSources(report),
    renderBodyReading(report),
  ].filter((block) => block.length > 0);
  return blocks.join("\n\n---\n\n") + "\n";
}
