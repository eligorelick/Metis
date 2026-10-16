/**
 * One component per report section (report sections 1–13). Each is dense,
 * consistent, and provenance-first: figures render as {@link TracedFigure}s
 * (value + citation-coverage indicator + as-of on hover), claims as
 * {@link ClaimText} (label chip + source), graded sections lead with a
 * {@link GradeReasoning} block.
 *
 * Server Component — static presentational markup, no data fetching. The
 * claim source line is a native <details> (ClaimText.tsx, a Server Component
 * that ships no client JS); the chart panels and the export buttons are the
 * only client islands (components/charts/*, ExportButtons). Everything else
 * here renders and streams from the server with zero hydration cost. Consumed
 * by ReportView.
 */

import type { ReactNode } from "react";
import { gradeForDisplay, MIN_HEADLINE_EVIDENCE } from "@/report/assessment";
import { valuationAuditTables, projectionAuditTables, type ReportAuditTable } from "@/report/auditTables";
import {
  actionableGapTable,
  annualSegmentHeading,
  assessmentLine,
  auditExportPath,
  compactLongIntegers,
  consensusTables,
  dataStateText,
  factorExposureTable,
  figureRows,
  gapCountText,
  gapSummary,
  geographyLabel,
  humanizeInlineCitations,
  indicatorLabel,
  keyDataRows,
  methodologyNotes,
  metricRowsWithoutTabled,
  moatSourceLabel,
  passLine,
  priceTiming,
  pruneTable,
  runSummary,
  scoreDriverTable,
  scorecardTable,
  seeAlsoText,
  splitCommonLines,
  trustHeadline,
  trustRows,
  usageSummary,
  withoutTabled,
  type BodyTable,
  type FigureRow,
} from "@/report/presentation";
import { ValuationReview } from "@/components/report/ValuationReview";
import type { ValuationReviewInputs } from "@/report/researchReview";
import type { EvidenceTimingRow } from "@/report/evidenceTiming";
import { sourceFactAuditTables } from "@/report/sourceFactPresentation";
import type { SourceFactSummary } from "@/report/sourceFacts";

import {
  Badge,
  DataTable,
  GradeChip,
  ScorePill,
  SectionHeading,
  type Column,
  type Tone,
} from "@/components/ui";
import type {
  Appendix,
  BalanceSheet,
  Business,
  CatalystsRisks,
  Competitive,
  Disagreement,
  Executive,
  Fundamentals,
  GradeBlock,
  Leadership,
  Macro,
  MetricRow,
  MultipleRow,
  Outlook,
  Projections,
  Quality,
  Report,
  RouteMetricRow,
  RouteMetrics,
  Scoring,
  SourcedClaim,
  FairValue,
  ScenarioTargets,
  Technicals,
  TracedNumber,
  Valuation,
  Verdict,
} from "@/report/schema";
import {
  establishedCurrency,
  formatFinancialValue,
  peerColumnKeys,
} from "@/report/format";
import type { ReportCompletenessPresentation } from "@/report/completeness";
import { deriveReportCompletenessPresentation } from "@/report/completeness";
import type { Grade } from "@/types/core";
import {
  EXECUTIVE_EVIDENCE_GROUPS,
  SCORE_SURFACES,
  SCORE_SURFACE_BY_KEY,
  SOURCE_ENTRY_FIELDS,
  gradeSurfaceEntries,
  orderedProjectionSeries,
} from "@/report/surfaceManifest";

import { SensitivityHeatmap } from "@/components/charts/SensitivityHeatmap";
import { ProjectionFanChart } from "@/components/charts/lazy";

import {
  ClaimList,
  formatMultiple,
  formatNumber,
  formatPct,
  GradeReasoning,
  ScenarioCard,
  sectionAnchorId,
  SeverityProbMatrix,
  ShareBar,
  TracedFigure,
  TracedNumberSourceDetails,
  TracedStat,
  type MatrixItem,
} from "./primitives";

/* ======================================================================== *
 * Section frame — anchored wrapper with a numbered heading
 * ======================================================================== */

export function SectionFrame({
  id,
  index,
  title,
  right,
  children,
}: {
  id: string;
  index: number;
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={sectionAnchorId(id)}
      // scroll-margin so the sticky grade strip + nav don't cover the heading.
      className="scroll-mt-28 border border-edge bg-panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-edge px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="mono text-[10px] text-faint">
            {String(index).padStart(2, "0")}
          </span>
          <h2 className="mono text-[12px] font-medium uppercase tracking-[0.12em] text-fg">
            {title}
          </h2>
        </div>
        {right !== undefined && (
          <div className="flex items-center gap-2 text-[11px] text-muted">
            {right}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 px-3 py-3">{children}</div>
    </section>
  );
}

/** Small labeled sub-block used inside sections. */
function SubBlock({
  label,
  semanticToken,
  children,
}: {
  label: ReactNode;
  semanticToken?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="text-[9px] uppercase tracking-[0.12em] text-faint">
        {semanticToken && <span aria-hidden="true" className="sr-only">{semanticToken}</span>}
        {label}
      </div>
      {children}
    </div>
  );
}

interface AuditRow {
  key: string;
  cells: readonly ReactNode[];
}

function AuditTable({
  headers,
  rows,
}: {
  headers: readonly string[];
  rows: readonly AuditRow[];
}) {
  return (
    <div className="overflow-x-auto border border-edge">
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-edge bg-raised">
            {headers.map((header, headerIndex) => (
              <th key={`${headerIndex}:${header}`} className="whitespace-nowrap px-2 py-1 text-left font-medium text-faint">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="px-2 py-1 text-faint">n/a</td></tr>
          ) : rows.map((row) => (
            <tr key={row.key} className="border-b border-edge last:border-b-0">
              {row.cells.map((cell, index) => (
                <td key={index} className="whitespace-nowrap px-2 py-1 align-top text-muted">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ======================================================================== *
 * §7.1 Verdict header + grade strip/* ======================================================================== *
 * §7.1 Verdict header + grade strip
 * ======================================================================== */

export function VerdictHeader({ verdict }: { verdict: Verdict }) {
  return (
    <div className="border border-edge-strong bg-panel">
      <div className="border-b border-edge px-3 py-1.5">
        <SectionHeading>verdict · synthesis</SectionHeading>
      </div>
      <div className="px-3 py-3">
        <p className="text-[13px] leading-relaxed text-fg">
          {verdict.synthesis}
        </p>
      </div>
    </div>
  );
}

/**
 * The sticky, clickable grade strip. Each chip is a link to its section anchor
 * (`#report-<section>`) — clicking scrolls there where the full GradeReasoning
 * lives. Renders inline in flow AND is reused sticky at the top of ReportView.
 */
export function GradeStripBar({
  gradeStrip,
  compact = false,
}: {
  gradeStrip: Verdict["gradeStrip"];
  compact?: boolean;
}) {
  const entries = gradeSurfaceEntries(gradeStrip);
  return (
    <div
      className={`grid grid-cols-3 gap-1.5 ${entries.length === 7 ? "lg:grid-cols-7" : "lg:grid-cols-6"} ${compact ? "" : ""}`}
    >
      {entries.map(({ descriptor, block }) => {
        const anchor = sectionAnchorId(descriptor.sectionKey);
        return (
          <a
            key={descriptor.id}
            href={`#${anchor}`}
            className="group flex flex-col gap-1 border border-edge bg-panel px-2 py-1.5 transition-colors hover:border-accent/50 hover:bg-raised"
            title={block.oneLineWhy}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] uppercase tracking-[0.09em] text-faint group-hover:text-muted">
                {descriptor.label}
              </span>
              <GradeChip grade={gradeForDisplay(block)} />
            </div>
            {!compact && (
              <p className="line-clamp-2 text-[10px] leading-snug text-faint">
                {block.oneLineWhy}
              </p>
            )}
          </a>
        );
      })}
    </div>
  );
}

/* ======================================================================== *
 * §7.1b Composite scorecard (deterministic 0–100 per aspect + composite)
 * ======================================================================== */

/**
 * The deterministic scorecard: the weighted composite (big) plus a clickable
 * 0–100 score pill per aspect, each deep-linking to its section. Sub-100 data
 * completeness is surfaced so a thinly-scored aspect is disclosed, not hidden.
 */
function ExtraAuditTables({ tables }: { tables: readonly (ReportAuditTable | BodyTable | null)[] }) {
  // D-62: always-empty columns are dropped and empty tables are not shown.
  return <>{tables.map((t) => {
    if (!t) return null;
    const pruned = pruneTable(t.headers, t.rows);
    if (!pruned) return null;
    return <SubBlock key={t.heading} label={t.heading}>
      <AuditTable headers={pruned.headers} rows={pruned.rows.map((cells, index) => ({ key: `${t.heading}:${index}`, cells }))}/>
      {t.note && <p className="mt-2 text-[11px] leading-snug text-muted">{t.note}</p>}
    </SubBlock>;
  })}</>;
}

export function CompositeScorecard({ scores }: { scores: Scoring }) {
  const c = scores.composite;
  return (
    <div className="border border-edge-strong bg-panel">
      <div className="flex items-center justify-between gap-2 border-b border-edge px-3 py-1.5">
        <SectionHeading>composite scorecard</SectionHeading>
        <span className="mono text-[9px] text-faint">bands {scores.bandsVersion}</span>
      </div>
      <div className="flex flex-col gap-3 px-3 py-3 lg:flex-row lg:items-center">
        <div className="flex shrink-0 items-center gap-3 border-b border-edge pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-[0.1em] text-faint">
              {SCORE_SURFACE_BY_KEY.composite.label.toLowerCase()}
            </span>
            <span className="mono text-[30px] leading-none text-fg">
              {c.score === null ? "n/a" : Math.round(c.score)}
            </span>
          </div>
          {c.band && <GradeChip grade={c.band} />}
        </div>
        <div className="grid flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
          {SCORE_SURFACES.map((descriptor) => {
            if (descriptor.kind !== "aspect") return null;
            const a = scores.aspects[descriptor.key];
            return (
              <a
                key={descriptor.id}
                href={`#${sectionAnchorId(descriptor.sectionKey)}`}
                className="flex flex-col gap-1 border border-edge bg-raised px-2 py-1.5 transition-colors hover:border-accent/50"
                title={a.notApplicableReason ?? a.note}
              >
                <span className="text-[9px] uppercase tracking-[0.09em] text-faint">{descriptor.label}</span>
                <div className="flex items-center justify-between gap-1">
                  {a.score !== null && a.dataCompleteness < MIN_HEADLINE_EVIDENCE
                    ? <span className="mono text-[10px] text-warn">limited evidence</span>
                    : <ScorePill score={a.score} band={a.band} />}
                  {a.score !== null && a.dataCompleteness < 1 && (
                    <span
                      className="mono text-[9px] text-warn"
                      title={`data completeness ${(a.dataCompleteness * 100).toFixed(0)}%`}
                    >
                      {Math.round(a.dataCompleteness * 100)}%
                    </span>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-edge px-3 py-3">
        {assessmentLine(scores) && <p className="text-[11px] text-muted">{assessmentLine(scores)}</p>}
        <ExtraAuditTables tables={[scorecardTable(scores), scoreDriverTable(scores), factorExposureTable(scores)]} />
      </div>
      <div className="border-t border-edge px-3 py-1.5">
        <p className="text-[10px] leading-snug text-faint">{c.methodology}</p>
      </div>
    </div>
  );
}

/**
 * The executive summary / analyst note — the top-of-report interpretive narrative
 * that weaves the composite grade, projections, and scenarios into one thesis.
 */
export function ExecutiveSummary({ claims }: { claims: readonly SourcedClaim[] }) {
  if (claims.length === 0) return null;
  return (
    <div className="border border-accent/40 bg-panel">
      <div className="border-b border-edge px-3 py-1.5">
        <SectionHeading>executive summary · analyst note</SectionHeading>
      </div>
      <div className="px-3 py-3">
        <ClaimList claims={claims} />
      </div>
    </div>
  );
}

/* ======================================================================== *
 * §7.11b Weighted projections (deterministic fan)
 * ======================================================================== */

export function ProjectionsSection({
  projections,
  index,
}: {
  projections: Projections;
  index: number;
}) {
  const weights = projections.scenarioWeights;
  const series = orderedProjectionSeries(projections.series);
  return (
    <SectionFrame
      id="projections"
      index={index}
      title="Weighted Projections"
      right={
        <span className="mono text-[10px] text-faint">
          {projections.horizonYears}y · {Math.round(weights.bull * 100)}/{Math.round(weights.base * 100)}/
          {Math.round(weights.bear * 100)} bull/base/bear
        </span>
      }
    >
      {series.length === 0 ? (
        <div className="text-[11px] text-faint">
          Projections not applicable
          {projections.notApplicableReason ? `: ${projections.notApplicableReason}` : "."}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {series.map((s, seriesIndex) => (
            <div key={`${s.metric}:${seriesIndex}`} className="border border-edge bg-bg p-2">
              <ProjectionFanChart series={s} />
            </div>
          ))}
        </div>
      )}
      {(() => {
        const { common, specific } = splitCommonLines(series.map((s) => s.assumptions));
        const lines = [...common, ...specific.flat().filter((line, i, all) => all.indexOf(line) === i)];
        return lines.length > 0 ? (
          <SubBlock label="method & assumptions">
            <ul className="flex flex-col gap-0.5">
              {lines.map((a, i) => (
                <li key={i} className="text-[11px] leading-snug text-muted">· {a}</li>
              ))}
            </ul>
          </SubBlock>
        ) : null;
      })()}
      <ExtraAuditTables tables={projectionAuditTables(projections)}/>
      {series.length > 0 && (
        <p className="text-[10px] leading-snug text-faint">
          Forward figures are model ESTIMATEs (computed.projections.*), not facts. The weighted path uses a
          versioned, unbacktested display prior—not empirical outcome probabilities or a point prediction.
        </p>
      )}
    </SectionFrame>
  );
}

/* ======================================================================== *
 * §7.2 Business & segments
 * ======================================================================== */

function SegmentTable({
  rows,
  emptyLabel,
}: {
  rows: Business["segments"]["product"];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <div className="text-[11px] text-faint">{emptyLabel}</div>;
  }
  // Share bars scaled to the max share so relative weight reads at a glance.
  const maxShare = Math.max(
    ...rows.map((r) => r.sharePct ?? 0),
    1,
  );
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={i} className="report-segment-row grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
          <div className="min-w-0 break-words text-[11px] text-fg" title={r.name}>
            {r.name}
          </div>
          <div className="min-w-0 break-words text-right">
            <TracedFigure n={r.revenue} className="text-[11px]" />
          </div>
          <div className="col-span-2 min-w-0">
            <ShareBar
              pct={r.sharePct === null ? null : (r.sharePct / maxShare) * 100}
              label={r.sharePct === null ? "n/a" : `${r.sharePct.toFixed(1)}%`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BusinessSegments({
  business,
  index,
  extraTables = [],
}: {
  business: Business;
  index: number;
  /** Deterministic filing-disclosure tables (XBRL segment revenue by quarter). */
  extraTables?: ReportAuditTable[];
}) {
  return (
    <SectionFrame id="business" index={index} title="Business & Segments">
      <SubBlock label="what they sell">
        <ClaimList claims={business.whatTheySell} />
      </SubBlock>
      <ExtraAuditTables tables={extraTables} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SubBlock label={annualSegmentHeading("Product", business.segments.product, extraTables.length > 0).toLowerCase()}>
          <SegmentTable
            rows={business.segments.product}
            emptyLabel="no product segmentation reported"
          />
        </SubBlock>
        <SubBlock label={annualSegmentHeading("Geographic", business.segments.geographic, extraTables.length > 0).toLowerCase()}>
          <SegmentTable
            rows={business.segments.geographic.map((row) => ({ ...row, name: geographyLabel(row.name) }))}
            emptyLabel="no geographic segmentation reported"
          />
        </SubBlock>
      </div>
      <SubBlock label="concentration risks">
        <ClaimList claims={business.concentrationRisks} empty="No concentration-risk assessment available." />
      </SubBlock>
    </SectionFrame>
  );
}

/* ======================================================================== *
 * Shared: MetricRow tables (fundamentals)
 * ======================================================================== */

function MetricRowsTable({ rows }: { rows: readonly MetricRow[] }) {
  if (rows.length === 0) {
    return <div className="text-[11px] text-faint">no data</div>;
  }
  // Union of period labels across rows, in first-seen order.
  const periods: string[] = [];
  for (const row of rows) {
    for (const v of row.values) {
      if (!periods.includes(v.period)) periods.push(v.period);
    }
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-edge-strong">
            <th className="px-2 py-1 text-left text-[9px] uppercase tracking-[0.1em] text-faint">
              metric
            </th>
            {periods.map((p) => (
              <th
                key={p}
                className="px-2 py-1 text-right text-[9px] uppercase tracking-[0.1em] text-faint"
              >
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-edge last:border-b-0 hover:bg-raised">
              <td className="px-2 py-1 text-left text-muted">{row.label}</td>
              {periods.map((p) => {
                const cell = row.values.find((v) => v.period === p);
                return (
                  <td key={p} className="px-2 py-1 text-right">
                    {cell ? (
                      <TracedFigure n={cell.value} className="text-[11px]" showProvenance />
                    ) : (
                      <span className="mono text-faint">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FundamentalsSection({
  fundamentals,
  sourceFactSummary,
  index,
  openReasoning,
  chart,
  extraTables = [],
  report = {},
}: {
  /** D-62: the filing tables that are the home of some figures. */
  report?: Pick<Report, "filingDisclosures">;
  fundamentals: Fundamentals;
  sourceFactSummary?: SourceFactSummary;
  /** Deterministic filing-disclosure tables (quarterly trend, issuer FCF, capital return). */
  extraTables?: ReportAuditTable[];
  index: number;
  openReasoning?: boolean;
  /** Optional fundamentals chart bundle (revenue/margin/FCF/shares) mounts here. */
  chart?: ReactNode;
}) {
  return (
    <SectionFrame id="fundamentals" index={index} title="Fundamentals">
      <GradeReasoning
        title="fundamentals"
        block={fundamentals.graded}
        defaultOpen={openReasoning}
        report={report}
      />
      {chart !== undefined && (
        <div className="border border-edge bg-bg">{chart}</div>
      )}
      {(() => {
        const groups = [
          { label: "growth", split: metricRowsWithoutTabled(report, fundamentals.growthTable) },
          { label: "margin trend", split: metricRowsWithoutTabled(report, fundamentals.marginTrend) },
          { label: "returns", split: metricRowsWithoutTabled(report, fundamentals.returns) },
          { label: "free cash flow", split: metricRowsWithoutTabled(report, fundamentals.fcf) },
        ];
        const homes = [...new Set(groups.flatMap((group) => group.split.homes))];
        const also = seeAlsoText(homes);
        return (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              {groups.filter((group) => group.split.kept.length > 0).map((group) => (
                <SubBlock key={group.label} label={group.label}>
                  <MetricRowsTable rows={group.split.kept} />
                </SubBlock>
              ))}
            </div>
            {also && <p className="text-[10px] text-faint">{also}</p>}
          </>
        );
      })()}
      <ExtraAuditTables tables={extraTables} />
      <SubBlock label="commentary">
        <ClaimList claims={fundamentals.commentary} />
      </SubBlock>
      <ExtraAuditTables tables={sourceFactAuditTables(sourceFactSummary)} />
    </SectionFrame>
  );
}

/* ======================================================================== *
 * §7.4 Balance sheet & capital
 * ======================================================================== */

function TracedNumberRow({ rows }: { rows: readonly FigureRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((row, i) => (
        <TracedStat key={i} label={row.label} n={row.trace} />
      ))}
    </div>
  );
}

export function BalanceSheetSection({
  balanceSheet,
  index,
  report = {},
}: {
  balanceSheet: BalanceSheet;
  index: number;
  report?: Pick<Report, "filingDisclosures">;
}) {
  // One identity map per section: the capital bridge registers each figure twice.
  const seen = new Map<string, FigureRow>();
  for (const row of figureRows(withoutTabled(report, balanceSheet.graded?.keyNumbers ?? []).kept)) seen.set(`${row.trace.value}|${row.trace.unit}`, row);
  const blocks: Array<{
    label: string;
    data: { commentary: readonly SourcedClaim[]; numbers: readonly TracedNumber[] };
  }> = [
    { label: "debt profile", data: balanceSheet.debtProfile },
    { label: "coverage", data: balanceSheet.coverage },
    { label: "capex trajectory", data: balanceSheet.capexTrajectory },
  ];
  return (
    <SectionFrame id="balanceSheet" index={index} title="Balance Sheet & Capital">
      {balanceSheet.graded && (
        <GradeReasoning title="balance sheet & capital" block={balanceSheet.graded} report={report} />
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {blocks.map((b) => (
          <SubBlock key={b.label} label={b.label}>
            <TracedNumberRow rows={figureRows(withoutTabled(report, b.data.numbers).kept, seen)} />
            <div className="mt-1.5">
              <ClaimList claims={b.data.commentary} />
            </div>
          </SubBlock>
        ))}
      </div>
      <SubBlock label="capital allocation record">
        <ClaimList claims={balanceSheet.capitalAllocation} />
      </SubBlock>
    </SectionFrame>
  );
}

/* ======================================================================== *
 * §7.5 Valuation (graded)
 * ======================================================================== */

function SensitivityGrid({ dcf }: { dcf: Valuation["dcf"] }) {
  const cells = dcf.sensitivityGrid;
  if (cells.length === 0) {
    return <div className="text-[11px] text-faint">no sensitivity grid</div>;
  }
  // Highlight the middle (WACC, g) pair as the base case — the single shared
  // SensitivityHeatmap (src/components/charts) owns axis derivation + coloring.
  const waccs = [...new Set(cells.map((c) => c.waccPct))].sort((a, b) => a - b);
  const gs = [...new Set(cells.map((c) => c.gTermPct))].sort((a, b) => a - b);
  const baseWacc = waccs[Math.floor(waccs.length / 2)] ?? null;
  const baseG = gs[Math.floor(gs.length / 2)] ?? null;

  return (
    <SensitivityHeatmap
      cells={cells}
      baseWacc={baseWacc}
      baseG={baseG}
      currency={dcf.perShare ? establishedCurrency(dcf.perShare.unit, dcf.perShare.currency) : null}
    />
  );
}

function MultiplesTable({ rows }: { rows: readonly MultipleRow[] }) {
  const cols: Column<MultipleRow>[] = [
    {
      key: "name",
      header: "multiple",
      render: (m) => <span className="mono text-muted">{m.name}</span>,
    },
    {
      key: "cur",
      header: "current",
      align: "right",
      render: (m) => <span className="mono">{formatMultiple(m.current)}</span>,
    },
    {
      key: "peer",
      header: "peer median",
      align: "right",
      render: (m) => (
        <span className="mono text-muted">{formatMultiple(m.peerMedian)}{typeof m.peerCount === "number" ? ` (n = ${m.peerCount})` : ""}</span>
      ),
    },
    {
      key: "pct",
      // WS6 (D-19): a RANK among the issuer's own quarters, never a percentile
      // - the window is 8-20 observations. WS6 review (SHOULD-FIX 3): N is
      // printed beside the rank, not left in the computed valuation notes.
      header: "own-history rank",
      align: "right",
      render: (m) =>
        m.own5yPercentile === null ? (
          <span className="mono text-faint">n/a</span>
        ) : (
          <div className="flex items-center justify-end gap-1.5">
            <div className="w-16">
              <ShareBar
                pct={m.own5yPercentile}
                tone={m.own5yPercentile >= 70 ? "warn" : "accent"}
                label={
                  // A 0–100 percentile rank among N quarters, printed the way
                  // the Markdown and print exports print it; "rank 85 of 12
                  // quarters" read as an impossible ordinal (audit
                  // 2026-09-06, F214).
                  typeof m.ownHistoryObservations === "number"
                    ? `rank ${m.own5yPercentile.toFixed(0)}/100 of ${m.ownHistoryObservations} quarters`
                    : `rank ${m.own5yPercentile.toFixed(0)}`
                }
              />
            </div>
          </div>
        ),
    },
    {
      key: "sector",
      header: "sector-appropriate",
      align: "center",
      render: (m) =>
        m.sectorAppropriate ? (
          <span className="mono text-pos">✓</span>
        ) : (
          <span className="mono text-faint">—</span>
        ),
    },
  ];
  return (
    <DataTable
      columns={cols}
      rows={rows}
      rowKey={(m) => m.name}
      empty="no multiples derivable"
    />
  );
}

/**
 * WS5 (D-17): the metrics a bank, insurer or mortgage REIT leads with.
 *
 * A withheld metric renders its REASON, never a blank cell: a blank reads as a
 * fetch that failed when in fact the figure was refused because the filer's
 * tags cannot satisfy its definition. A `proxy` row is a labeled stand-in,
 * published under its own name and marked as one.
 */
function RouteMetricsTable({ rows }: { rows: readonly RouteMetricRow[] }) {
  const cols: Column<RouteMetricRow>[] = [
    {
      key: "label",
      header: "metric",
      render: (m) => (
        <span className="mono text-muted">
          {m.label}
          {m.proxy ? <span className="ml-1 text-[10px] text-faint">(stand-in)</span> : null}
        </span>
      ),
    },
    {
      key: "value",
      header: "value",
      align: "right",
      render: (m) =>
        m.value === null ? (
          <span className="mono text-faint">withheld</span>
        ) : (
          <span className="mono">{formatFinancialValue(m.value, m.unit, m.currency ?? null)}</span>
        ),
    },
    {
      key: "basis",
      header: "basis / reason withheld",
      render: (m) => (
        <span className="text-[11px] leading-snug text-faint">{m.withheldReason ?? m.basis}</span>
      ),
    },
  ];
  return (
    <DataTable columns={cols} rows={rows} rowKey={(m) => m.key} empty="no route metrics" />
  );
}

export function ValuationSection({
  valuation,
  scenarioTargets,
  fairValue,
  routeMetrics,
  index,
  openReasoning,
  scenarioPresentation,
  thesisTriggers,
  evidenceTiming,
  report,
}: {
  /** D-62: consensus/market data and the filing tables that are some figures' home. */
  report?: Report;
  valuation: Valuation;
  scenarioTargets?: ScenarioTargets;
  fairValue?: FairValue;
  routeMetrics?: RouteMetrics;
  index: number;
  openReasoning?: boolean;
  evidenceTiming?: readonly EvidenceTimingRow[];
} & ValuationReviewInputs) {
  const { dcf, reverseDcf } = valuation;
  return (
    <SectionFrame id="valuation" index={index} title="Valuation">
      {/* D-62: evidence timing is in the audit export. */}
      {evidenceTiming === undefined ? null : null}
      <GradeReasoning
        title="valuation"
        block={valuation.graded}
        defaultOpen={openReasoning}
        report={report ?? {}}
      />

      {/* DCF headline + reverse-DCF callout */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-2 border border-edge bg-raised px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.1em] text-faint">
            DCF · intrinsic value / share
          </div>
          {dcf.perShare ? (
            <TracedFigure n={dcf.perShare} tone="accent" className="text-[24px]" />
          ) : (
            // Deterministic fair value suppressed (no per-share model / insufficient
            // inputs) — show "unavailable", never a fabricated number.
            <span className="mono text-[15px] text-faint">unavailable</span>
          )}
          {dcf.perShare && dcf.upsidePct !== null && (
            <div className="mono text-[12px]">
              <span className="text-faint">vs price </span>
              <span className={dcf.upsidePct >= 0 ? "text-pos" : "text-neg"}>
                {formatPct(dcf.upsidePct, 1, true)}
              </span>
            </div>
          )}
          {dcf.perShare && <TracedNumberSourceDetails n={dcf.perShare} label="DCF provenance" />}
          {fairValue ? (
            <p className="text-[10px] leading-snug text-faint">
              {fairValue.status === "available"
                ? fairValue.basis.join(" ")
                : `Intrinsic value per share suppressed — ${
                    fairValue.reasons.map((r) => r.reason).join("; ") || fairValue.basis.join(" ")
                  }`}
            </p>
          ) : null}
          <div className="mt-1 border-t border-edge pt-2">
            <div className="text-[9px] uppercase tracking-[0.1em] text-faint">
              reverse DCF — market is pricing
            </div>
            <div className="mono mt-0.5 text-[13px] text-warn">
              {reverseDcf.impliedValue === null
                ? "n/a"
                : `~${reverseDcf.impliedValue.toFixed(1)}% ${reverseDcf.impliedMetric}`}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              {reverseDcf.narrative}
            </p>
          </div>
        </div>

        <SubBlock label="DCF assumptions">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-edge-strong">
                  <th className="px-2 py-1 text-left text-[9px] uppercase tracking-[0.1em] text-faint">
                    assumption
                  </th>
                  <th className="px-2 py-1 text-right text-[9px] uppercase tracking-[0.1em] text-faint">
                    value
                  </th>
                  <th className="px-2 py-1 text-left text-[9px] uppercase tracking-[0.1em] text-faint">
                    basis
                  </th>
                </tr>
              </thead>
              <tbody>
                {dcf.assumptions.map((a, i) => (
                  <tr
                    key={i}
                    className="border-b border-edge last:border-b-0 hover:bg-raised"
                  >
                    <td className="px-2 py-1 text-muted">{a.name}</td>
                    <td className="mono px-2 py-1 text-right text-fg">
                      {a.value}
                    </td>
                    <td className="px-2 py-1 text-[10px] text-faint">
                      {a.basis}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SubBlock>
      </div>

      <SubBlock label="sensitivity · per share (rows = WACC, cols = terminal g) — green high → red low">
        <SensitivityGrid dcf={dcf} />
        <ExtraAuditTables tables={valuationAuditTables(dcf)}/>
      </SubBlock>

      <SubBlock label="multiples vs peers & own 5-yr history">
        <MultiplesTable rows={valuation.multiples} />
      </SubBlock>
      {report && <ExtraAuditTables tables={consensusTables(report)} />}

      <ValuationReview scenarioPresentation={scenarioPresentation} thesisTriggers={thesisTriggers} peerCoverage={valuation.peerCoverage} />

      <SubBlock label={scenarioPresentation ? "scenarios · sensitivity cases (bull / base / bear)" : "scenarios · probability-weighted (bull / base / bear)"}>
        <p className="mb-2 text-[11px] leading-snug text-faint">
          {scenarioPresentation?.weightBasis ?? "Narrative probabilities are model JUDGMENTs, not empirically calibrated odds. Data-only reports show them as unavailable."}
        </p>
        {scenarioTargets ? (
          <p className="mb-2 text-[11px] leading-snug text-faint">
            {scenarioTargets.status === "available"
              ? `Price targets are computed-derived (${scenarioTargets.method}), not analyst targets. ${scenarioTargets.basis.join(" ")}`
              : `Scenario price targets suppressed — ${
                  scenarioTargets.missingReasons.map((m) => m.reason).join("; ") ||
                  scenarioTargets.basis.join(" ")
                }`}
          </p>
        ) : null}
        {(() => {
          const { common } = splitCommonLines(valuation.scenarios.map((sc) => sc.assumptions.map(compactLongIntegers)));
          return common.length > 0 ? (
            <div className="mb-2">
              <div className="mb-1 text-[9px] uppercase tracking-[0.1em] text-faint">assumptions common to every scenario</div>
              <ul className="flex flex-col gap-0.5">{common.map((line, i) => <li key={i} className="text-[11px] leading-snug text-muted">· {line}</li>)}</ul>
            </div>
          ) : null;
        })()}
        <div className="grid gap-3 lg:grid-cols-3">
          {["bull", "base", "bear"].map((name) => {
            const s = valuation.scenarios.find((sc) => sc.name === name);
            if (!s) return null;
            const scenarioIndex = valuation.scenarios.indexOf(s);
            const specific = splitCommonLines(valuation.scenarios.map((sc) => sc.assumptions.map(compactLongIntegers))).specific[scenarioIndex] ?? [];
            return (
              <ScenarioCard
                key={name}
                name={s.name}
                probability={s.probability}
                priceTarget={s.priceTarget}
                horizon={s.horizon}
                assumptions={specific}
                whatWouldHaveToBeTrue={s.whatWouldHaveToBeTrue}
                weightLabel={scenarioPresentation ? "Display weight" : "p"}
                qualitativeCommentary={s.qualitativeCommentary}
              />
            );
          })}
        </div>
      </SubBlock>

      {routeMetrics ? (
        <SubBlock
          label={`route metrics · ${routeMetrics.route}${routeMetrics.asOf === null ? "" : ` · as of ${routeMetrics.asOf}`}`}
        >
          <RouteMetricsTable rows={routeMetrics.metrics} />
          {routeMetrics.notes.map((n) => (
            <p key={n} className="mt-2 text-[11px] leading-snug text-faint">
              {n}
            </p>
          ))}
        </SubBlock>
      ) : null}
    </SectionFrame>
  );
}

/* ======================================================================== *
 * §7.6 Quality & red flags (graded)
 * ======================================================================== */

function zoneTone(zone: string | null): Tone {
  if (zone === null) return "muted";
  const z = zone.toLowerCase();
  if (z.includes("safe") || z.includes("strong") || z.includes("unlikely"))
    return "pos";
  if (z.includes("distress") || z.includes("manipulat") || z.includes("red"))
    return "neg";
  if (z.includes("grey") || z.includes("gray") || z.includes("caution"))
    return "warn";
  return "muted";
}

function ForensicCard({
  name,
  score,
  zone,
  variant,
  notApplicableReason,
}: {
  name: string;
  score: number | null;
  zone: string | null;
  variant: string;
  notApplicableReason?: string;
}) {
  const tone = zoneTone(zone);
  return (
    <div className="flex flex-col gap-1 border border-edge bg-raised px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="mono text-[10px] uppercase tracking-[0.1em] text-faint">
          {name}
        </span>
        <span className="text-[9px] text-faint">{variant}</span>
      </div>
      {notApplicableReason ? (
        <div className="text-[10px] leading-snug text-faint">
          {notApplicableReason}
        </div>
      ) : (
        <>
          <div className="mono text-[18px] text-fg">
            {score === null ? "n/a" : formatNumber(score, 2)}
          </div>
          {zone && <Badge tone={tone}>{zone}</Badge>}
        </>
      )}
    </div>
  );
}

const SEVERITY_TONE: Record<"high" | "medium" | "low", Tone> = {
  high: "neg",
  medium: "warn",
  low: "muted",
};

export function QualityFlags({
  quality,
  index,
  openReasoning,
}: {
  quality: Quality;
  index: number;
  openReasoning?: boolean;
}) {
  const f = quality.forensicScores;
  // Flags by severity (high → low).
  const order: Array<"high" | "medium" | "low"> = ["high", "medium", "low"];
  const sortedFlags = [...quality.flags].sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity),
  );
  return (
    <SectionFrame id="quality" index={index} title="Quality & Red-Flags">
      <GradeReasoning
        title="quality / red-flags"
        block={quality.graded}
        defaultOpen={openReasoning}
      />
      <SubBlock label="forensic scores">
        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
          <ForensicCard
            name="Altman Z"
            score={f.altman.score}
            zone={f.altman.zone}
            variant={f.altman.variant}
            notApplicableReason={f.altman.notApplicableReason}
          />
          <ForensicCard
            name="Beneish M"
            score={f.beneish.score}
            zone={f.beneish.zone}
            variant={f.beneish.variant}
            notApplicableReason={f.beneish.notApplicableReason}
          />
          <ForensicCard
            name="Piotroski F"
            score={f.piotroski.score}
            zone={f.piotroski.zone}
            variant={f.piotroski.variant}
            notApplicableReason={f.piotroski.notApplicableReason}
          />
          <ForensicCard
            name="Accruals"
            score={f.accruals.score}
            zone={f.accruals.zone}
            variant={f.accruals.variant}
            notApplicableReason={f.accruals.notApplicableReason}
          />
        </div>
      </SubBlock>
      <SubBlock label={`plain-english flags (${sortedFlags.length})`}>
        {sortedFlags.length === 0 ? (
          <div className="text-[11px] text-faint">No flags were raised by the checks with available inputs. Unavailable or inapplicable checks are disclosed above and in the missing-data manifest.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sortedFlags.map((flag, i) => (
              <div
                key={i}
                className="flex items-start gap-2 border border-edge bg-raised px-2 py-1.5"
              >
                <Badge tone={SEVERITY_TONE[flag.severity]}>
                  {flag.severity}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] leading-snug text-fg">{flag.text}</p>
                  <span className="mono text-[9px] text-faint">
                    {flag.source}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SubBlock>
    </SectionFrame>
  );
}

/* ======================================================================== *
 * §7.7 Technicals (graded) — accepts a chart slot
 * ======================================================================== */

export function TechnicalsSection({
  technicals,
  index,
  openReasoning,
  chart,
  report,
}: {
  /** D-62: quote timing names the latest price; filing tables are some figures' home. */
  report?: Report;
  technicals: Technicals;
  index: number;
  openReasoning?: boolean;
  /** Chart mounts here (a client chart passed by the caller). */
  chart?: ReactNode;
}) {
  const read = technicals.read;
  const readRows: Array<{ label: string; value: string }> = [
    { label: "trend", value: read.trend },
    { label: "momentum", value: read.momentum },
    { label: "key levels", value: read.keyLevels },
    { label: "relative strength", value: read.relativeStrength },
  ];
  return (
    <SectionFrame id="technicals" index={index} title="Technicals">
      <GradeReasoning
        title="technicals"
        block={technicals.graded}
        defaultOpen={openReasoning}
        report={report ?? {}}
      />

      {chart !== undefined && (
        <div className="border border-edge bg-bg">{chart}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SubBlock label="structured read">
          <div className="flex flex-col gap-1.5">
            {readRows.map((r) => (
              <div key={r.label} className="flex items-baseline gap-2">
                <span className="w-28 shrink-0 text-[10px] uppercase tracking-[0.08em] text-faint">
                  {r.label}
                </span>
                <span className="text-[11px] leading-snug text-fg">
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </SubBlock>
        <SubBlock label="indicators">
          <div className="flex flex-wrap gap-1.5">
            {figureRows(technicals.indicators).map((row, i) => (
              <TracedStat
                key={i}
                label={indicatorLabel(row.trace, report ? priceTiming(report) : { intraday: false, detail: null })}
                n={row.trace}
              />
            ))}
          </div>
        </SubBlock>
      </div>

      {technicals.flags.length > 0 && (
        <SubBlock label="flags">
          <div className="flex flex-col gap-1.5">
            {technicals.flags.map((flag, i) => (
              <div
                key={i}
                className="flex items-start gap-2 border border-edge bg-raised px-2 py-1.5"
              >
                <Badge tone={SEVERITY_TONE[flag.severity]}>{flag.severity}</Badge>
                <span className="text-[11px] leading-snug text-fg">
                  {flag.text}
                </span>
              </div>
            ))}
          </div>
        </SubBlock>
      )}
    </SectionFrame>
  );
}

/* ======================================================================== *
 * §7.8 Leadership & governance (graded)
 * ======================================================================== */

function ExecutiveCard({ exec }: { exec: Executive }) {
  return (
    <div className="flex flex-col border border-edge bg-raised">
      <div className="flex items-center justify-between gap-2 border-b border-edge px-2.5 py-1.5">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium text-fg">
            {exec.name}
          </div>
          <div className="truncate text-[10px] text-faint">
            {exec.title}
            {exec.tenureYears !== null
              ? ` · ${exec.tenureYears.toFixed(0)}y tenure`
              : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[8px] uppercase tracking-[0.1em] text-faint">
              grade
            </span>
            <GradeChip grade={exec.grade} />
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[8px] uppercase tracking-[0.1em] text-faint">
              cred
            </span>
            <GradeChip grade={exec.credibilityGrade} />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 px-2.5 py-2">
        {exec.assessmentReason && <p className="text-[11px] text-muted">{exec.assessmentReason}</p>}
        <ClaimList claims={exec.reasoning} />
        {EXECUTIVE_EVIDENCE_GROUPS.map((descriptor) => ({
          descriptor,
          claims: exec.evidence[descriptor.key],
        })).filter((group) => group.claims && group.claims.length > 0).map((group) => (
          <SubBlock
            key={group.descriptor.id}
            label={group.descriptor.label}
            semanticToken={group.descriptor.label.toLowerCase()}
          >
            <ClaimList claims={group.claims ?? []} />
          </SubBlock>
        ))}
      </div>
    </div>
  );
}

export function LeadershipSection({
  leadership,
  index,
  openReasoning,
  report = {},
}: {
  report?: Pick<Report, "filingDisclosures">;
  leadership: Leadership;
  index: number;
  openReasoning?: boolean;
}) {
  return (
    <SectionFrame id="leadership" index={index} title="Leadership & Governance">
      <GradeReasoning
        title="leadership"
        block={leadership.graded}
        defaultOpen={openReasoning}
        report={report}
      />
      <SubBlock label={`executives (${leadership.executives.length})`}>
        <div className="grid gap-3 lg:grid-cols-2">
          {leadership.executives.map((exec, i) => (
            <ExecutiveCard key={i} exec={exec} />
          ))}
        </div>
      </SubBlock>
      <div className="grid gap-4 lg:grid-cols-2">
        <SubBlock label="Insider activity" semanticToken="insider activity">
          <ClaimList claims={leadership.insiderSummary} empty="no insider data" />
        </SubBlock>
        <SubBlock label="board / comp notes">
          <ClaimList claims={leadership.governanceNotes} empty="none" />
        </SubBlock>
      </div>
    </SectionFrame>
  );
}

/* ======================================================================== *
 * §7.9 Competitive landscape (Moat graded)
 * ======================================================================== */

const MOAT_STRENGTH_TONE: Record<"none" | "narrow" | "wide", Tone> = {
  none: "muted",
  narrow: "warn",
  wide: "pos",
};


function PeerTable({ peers }: { peers: Competitive["peerTable"] }) {
  if (peers.length === 0) {
    return <div className="text-[11px] text-faint">no peers resolved</div>;
  }
  // Columns keyed by the metric (peerMetricKey), never one column per peer.
  const metricKeys: string[] = [];
  for (const p of peers) {
    for (const key of peerColumnKeys(p.metrics)) {
      if (!metricKeys.includes(key)) metricKeys.push(key);
    }
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-edge-strong">
            <th className="px-2 py-1 text-left text-[9px] uppercase tracking-[0.1em] text-faint">
              peer
            </th>
            {metricKeys.map((k) => (
              <th key={k} className="px-2 py-1 text-right text-[9px] text-faint">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {peers.map((p, i) => (
            <tr
              key={i}
              className="border-b border-edge last:border-b-0 hover:bg-raised"
            >
              <td className="px-2 py-1 text-left">
                <span className="text-fg">{p.name}</span>
                {p.symbol && (
                  <span className="mono ml-1 text-[9px] text-faint">
                    {p.symbol}
                  </span>
                )}
              </td>
              {metricKeys.map((k) => {
                const rowKeys = peerColumnKeys(p.metrics);
                const m = p.metrics[rowKeys.indexOf(k)];
                return (
                  <td key={k} className="px-2 py-1 text-right">
                    {m ? (
                      <TracedFigure n={m} className="text-[11px]" />
                    ) : (
                      <span className="mono text-faint">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CompetitiveSection({
  competitive,
  index,
  openReasoning,
  report = {},
}: {
  report?: Pick<Report, "filingDisclosures">;
  competitive: Competitive;
  index: number;
  openReasoning?: boolean;
}) {
  return (
    <SectionFrame id="competitive" index={index} title="Competitive · Moat">
      <GradeReasoning
        title="moat"
        block={competitive.moatGraded}
        defaultOpen={openReasoning}
        report={report}
      />
      <SubBlock label="moat sources">
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {competitive.moatAssessment.map((m, i) => (
            <div
              key={i}
              className="flex flex-col gap-1 border border-edge bg-raised px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-fg">
                  {moatSourceLabel(m.source)}
                </span>
                <Badge tone={MOAT_STRENGTH_TONE[m.strength]}>{m.strength}</Badge>
              </div>
              <ClaimList claims={m.reasoning} />
            </div>
          ))}
        </div>
      </SubBlock>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SubBlock label="peer table">
          <PeerTable peers={competitive.peerTable} />
        </SubBlock>
        <SubBlock label="market-share direction">
          <p className="text-[11px] leading-snug text-fg">
            {competitive.marketShareDirection}
          </p>
        </SubBlock>
      </div>
    </SectionFrame>
  );
}

/* ======================================================================== *
 * §7.10 Catalysts & Risks — PROMINENT
 * ======================================================================== */

const DIRECTION_META: Record<
  "positive" | "negative" | "mixed",
  { glyph: string; tone: Tone }
> = {
  positive: { glyph: "▲", tone: "pos" },
  negative: { glyph: "▼", tone: "neg" },
  mixed: { glyph: "◆", tone: "warn" },
};

const SIGNIFICANCE_TONE: Record<"high" | "medium" | "low", Tone> = {
  high: "accent",
  medium: "muted",
  low: "muted",
};

/**
 * The Catalysts & Risks panel — the design requires it to be VISUALLY PROMINENT.
 * Rendered with a strong accent border, in manifest order as section 10
 * (between Competitive and Outlook; it is NOT hoisted above the numbered
 * sections — audit 2026-09-06, F215). The weight comes from the border,
 * the significance chips and the two-column layout,
 * Catalysts are a dated
 * timeline with direction arrows + significance; risks are placed on a
 * severity × probability matrix and also listed with their sources.
 */
export function CatalystsRisksPanel({
  catalystsRisks,
  index,
  dataOnly = false,
  extraTables = [],
}: {
  catalystsRisks: CatalystsRisks;
  index?: number;
  dataOnly?: boolean;
  /** Deterministic filing-disclosure tables (material 8-K events). */
  extraTables?: ReportAuditTable[];
}) {
  const { catalysts, risks } = catalystsRisks;
  const matrixItems: MatrixItem[] = risks.map((r) => ({
    title: r.title,
    severity: r.severity,
    probability: r.probability,
  }));
  const sortedCatalysts = [...catalysts].sort((a, b) => {
    // Undated last; otherwise ascending by expected date.
    if (a.expectedDate === null && b.expectedDate === null) return 0;
    if (a.expectedDate === null) return 1;
    if (b.expectedDate === null) return -1;
    return a.expectedDate.localeCompare(b.expectedDate);
  });

  return (
    <section
      id={sectionAnchorId("catalystsRisks")}
      className="scroll-mt-28 border-2 border-accent/50 bg-panel shadow-[0_0_0_1px_rgba(59,167,245,0.08)]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-accent/40 bg-accent/5 px-3 py-2">
        <div className="flex items-baseline gap-2">
          {index !== undefined && (
            <span className="mono text-[10px] text-accent">
              {String(index).padStart(2, "0")}
            </span>
          )}
          <h2 className="mono text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
            Catalysts &amp; Risks
          </h2>
        </div>
        <span className="mono text-[10px] text-muted">
          {dataOnly ? "Not assessed" : `${catalysts.length} catalysts · ${risks.length} risks`}
        </span>
      </div>

      <div className="grid gap-4 px-3 py-3 lg:grid-cols-2">
        {/* Catalysts timeline */}
        <div className="flex flex-col gap-2">
          <div className="text-[9px] uppercase tracking-[0.12em] text-faint">
            catalysts · dated
          </div>
          {sortedCatalysts.length === 0 ? (
            <div className="text-[11px] text-faint">{dataOnly ? "Not assessed — no completed analyst assessment is available." : "No catalysts recorded."}</div>
          ) : (
            <ol className="flex flex-col">
              {sortedCatalysts.map((c, i) => {
                const dir = DIRECTION_META[c.direction];
                return (
                  <li
                    key={i}
                    className="flex items-start gap-2 border-l-2 py-1.5 pl-2.5"
                    style={{
                      borderColor:
                        dir.tone === "pos"
                          ? "var(--pos)"
                          : dir.tone === "neg"
                            ? "var(--neg)"
                            : "var(--warn)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className={`mono mt-px shrink-0 text-[12px] ${
                        dir.tone === "pos"
                          ? "text-pos"
                          : dir.tone === "neg"
                            ? "text-neg"
                            : "text-warn"
                      }`}
                    >
                      {dir.glyph}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-[12px] font-medium text-fg">
                          {c.title}
                        </span>
                        <Badge tone={SIGNIFICANCE_TONE[c.significance]}>
                          significance {c.significance}
                        </Badge>
                      </div>
                      <div className="mono text-[10px] text-faint">
                        expected date {c.expectedDate?.trim() ? c.expectedDate : "not recorded"}
                        <span className="ml-2">direction {c.direction}</span>
                      </div>
                      <div className="mt-1">
                        <ClaimList claims={[c.reasoning]} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Risks matrix + list */}
        <div className="flex flex-col gap-2">
          <div className="text-[9px] uppercase tracking-[0.12em] text-faint">
            risks · severity × probability
          </div>
          {dataOnly && risks.length === 0
            ? <p className="text-[11px] text-faint">Not assessed — an empty list does not establish that no risks exist.</p>
            : <SeverityProbMatrix items={matrixItems} />}
          <div className="mt-1 flex flex-col gap-1.5">
            {risks.map((r, i) => (
              <div
                key={i}
                className="flex items-start gap-2 border border-edge bg-raised px-2 py-1.5"
              >
                <Badge tone={SEVERITY_TONE[r.severity]}>severity {r.severity}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[11px] font-medium text-fg">
                      {r.title}
                    </span>
                    <span className="text-[9px] uppercase tracking-[0.08em] text-faint">
                      probability {r.probability}
                    </span>
                  </div>
                  <p className="mono mt-0.5 break-words text-[10px] text-faint">
                    risk source {r.source.trim() ? r.source : "not recorded"}
                  </p>
                  <div className="mt-0.5">
                    <ClaimList claims={[r.reasoning]} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {extraTables.length > 0 && <div className="flex flex-col gap-3 px-3 pb-3"><ExtraAuditTables tables={extraTables} /></div>}
    </section>
  );
}

/* ======================================================================== *
 * §7.11 Future outlook
 * ======================================================================== */

export function OutlookSection({
  outlook,
  index,
  extraTables = [],
}: {
  outlook: Outlook;
  index: number;
  /** Deterministic filing-disclosure tables (guidance, results vs prior guidance). */
  extraTables?: ReportAuditTable[];
}) {
  const horizons: Array<{ label: string; claims: readonly SourcedClaim[] }> = [
    { label: "1-year", claims: outlook.scenarioNarratives.y1 },
    { label: "3-year", claims: outlook.scenarioNarratives.y3 },
    { label: "5-year", claims: outlook.scenarioNarratives.y5 },
  ];
  return (
    <SectionFrame id="outlook" index={index} title="Future Outlook">
      <SubBlock label="scenario narratives">
        <div className="grid gap-3 lg:grid-cols-3">
          {horizons.map((h) => (
            <div
              key={h.label}
              className="flex flex-col gap-2 border border-edge bg-raised px-2.5 py-2"
            >
              <div className="mono text-[10px] uppercase tracking-[0.1em] text-accent">
                {h.label}
              </div>
              <ClaimList claims={h.claims} />
            </div>
          ))}
        </div>
      </SubBlock>
      <div className="grid gap-4 lg:grid-cols-2">
        <SubBlock label="segment trajectories">
          <ClaimList claims={outlook.segmentTrajectories} />
        </SubBlock>
        {outlook.tam && outlook.tam.length > 0 && (
          <SubBlock label="TAM">
            <ClaimList claims={outlook.tam} />
          </SubBlock>
        )}
        <SubBlock label="estimate-revision trend">
          <ClaimList claims={outlook.estimateRevisionTrend} />
        </SubBlock>
        <SubBlock label="guidance credibility">
          <ClaimList claims={outlook.guidanceCredibility} />
        </SubBlock>
      </div>
      <ExtraAuditTables tables={extraTables} />
    </SectionFrame>
  );
}

/* ======================================================================== *
 * §7.12 Macro context
 * ======================================================================== */

export function MacroSection({ macro, index }: { macro: Macro; index: number }) {
  const cols: Column<Macro["relevantSeries"][number]>[] = [
    {
      key: "id",
      header: "series",
      render: (s) => <span className="mono text-muted">{s.seriesId}</span>,
    },
    {
      key: "name",
      header: "name",
      render: (s) => <span className="text-fg">{s.name}</span>,
    },
    {
      key: "latest",
      header: "latest",
      align: "right",
      render: (s) => <TracedFigure n={s.latest} className="text-[11px]" />,
    },
    {
      key: "rel",
      header: "relevance",
      render: (s) => (
        <span className="text-[10px] leading-snug text-muted">{s.relevance}</span>
      ),
    },
  ];
  return (
    <SectionFrame id="macro" index={index} title="Macro Context">
      <SubBlock label="relevant FRED series">
        <DataTable
          columns={cols}
          rows={macro.relevantSeries}
          rowKey={(s) => s.seriesId}
          empty="no macro series mapped"
        />
      </SubBlock>
      <SubBlock label="rate / cycle / FX sensitivity">
        <ClaimList claims={macro.sensitivityNotes} />
      </SubBlock>
      <p className="mono border-t border-edge pt-2 text-[9px] leading-snug text-faint">
        {macro.fredAttribution}
      </p>
    </SectionFrame>
  );
}

/* ======================================================================== *
 * §7.13 Appendix
 * ======================================================================== */

export function DisagreementsBlock({
  disagreements,
}: {
  disagreements: readonly Disagreement[];
}) {
  if (disagreements.length === 0) return null;
  return (
    <SubBlock label={`bull/bear disagreements (${disagreements.length})`}>
      <div className="flex flex-col gap-2">
        {disagreements.map((d, i) => (
          <div key={i} className="border border-edge bg-raised px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-fg">{d.topic}</span>
              <Badge tone={d.kind === "fact" ? "accent" : "muted"}>
                {d.kind}
              </Badge>
            </div>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              <div className="border-l-2 border-pos/50 pl-2">
                <div className="text-[8px] uppercase tracking-[0.1em] text-pos">
                  bull view
                </div>
                <p className="text-[11px] leading-snug text-muted">
                  {humanizeInlineCitations(d.bullView)}
                </p>
              </div>
              <div className="border-l-2 border-neg/50 pl-2">
                <div className="text-[8px] uppercase tracking-[0.1em] text-neg">
                  bear view
                </div>
                <p className="text-[11px] leading-snug text-muted">
                  {humanizeInlineCitations(d.bearView)}
                </p>
              </div>
            </div>
            <div className="mt-1.5 border-t border-edge pt-1.5">
              <div className="text-[8px] uppercase tracking-[0.1em] text-faint">
                judge resolution
              </div>
              <p className="text-[11px] leading-snug text-fg">
                {humanizeInlineCitations(d.judgeResolution)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </SubBlock>
  );
}

/**
 * D-62: the page-1 key-data box — price, size, consensus, multiples, model
 * value — built only from values already in the report; absent rows are
 * omitted rather than printed as "n/a".
 */
export function KeyDataBox({ report }: { report: Report }) {
  const rows = keyDataRows(report);
  if (rows.length === 0) return null;
  return (
    <div className="border border-edge-strong bg-panel">
      <div className="border-b border-edge px-3 py-1.5">
        <SectionHeading>key data</SectionHeading>
      </div>
      <dl className="grid gap-x-4 gap-y-1 px-3 py-2 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="flex min-w-0 items-baseline justify-between gap-2 border-b border-edge/60 py-1">
            <dt className="text-faint">{row.label}</dt>
            <dd className="mono text-right text-fg">
              {row.value}
              {row.note && <span className="ml-1 text-[9px] text-faint">{row.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function AppendixSection({
  report,
  completeness,
  index,
}: {
  report: Report;
  completeness?: ReportCompletenessPresentation;
  index: number;
}) {
  const appendix: Appendix = report.appendix;
  const m = report.meta;
  const rate = appendix.verificationRate;
  const dataOnly = appendix.missingData.some((gap) => gap.field === "analysis.llm");
  const presentation = completeness ?? deriveReportCompletenessPresentation(m.dataCompleteness, appendix.missingData);
  const trust = trustRows(appendix.provenanceCoverage ?? m.provenanceCoverage);
  const checks = appendix.consistencyChecks; // WS7 (D-20)
  const checked = checks ? checks.direction.checked + checks.period.checked + checks.unit.checked + checks.namedIndividual.checked : 0;
  const failed = checks ? checks.direction.failed + checks.period.failed + checks.unit.failed + checks.namedIndividual.failed : 0;
  const named = actionableGapTable(appendix.missingData);
  const families = gapSummary(appendix.missingData);
  const auditPath = auditExportPath(report);

  return (
    <SectionFrame
      id="appendix"
      index={index}
      title="Appendix"
      right={
        <span
          className="mono text-[11px] text-muted"
          title="Citation coverage: share of report figures traceable to a citation or payload value — a provenance check, not a correctness/accuracy check."
        >
          cited{" "}
          <span className="text-fg">
            {rate === null ? "—" : `${(rate * 100).toFixed(1)}%`}
          </span>
        </span>
      }
    >
      {/* D-62: the standard limitations, stated once. */}
      <SubBlock label="methodology and limitations">
        <ul className="flex flex-col gap-1">
          {methodologyNotes(report).map((note) => (
            <li key={note} className="text-[11px] leading-snug text-muted">· {note}</li>
          ))}
        </ul>
      </SubBlock>

      <SubBlock label="run details">
        <ul className="flex flex-col gap-0.5 text-[11px] text-muted">
          {(m.execution ?? []).map((entry, i) => <li key={`${entry.step}-${i}`} className="mono">{passLine(entry)}</li>)}
          {m.judgeProtocol && <li>{m.judgeProtocol.note}</li>}
          {m.verifyModel !== undefined && <li>verify model {m.verifyModel}</li>}
          <li>{usageSummary(report)}</li>
          <li className="mono">spec {m.specVersion} · pipeline {m.pipelineVersion}</li>
          {m.runSnapshot && <li className="mono break-all">frozen input snapshot {m.runSnapshot.hash} · {m.runSnapshot.capturedAt}</li>}
        </ul>
      </SubBlock>

      <SubBlock label="verification">
        {dataOnly ? (
          <p className="text-[11px] text-faint">No completed citation-check pass. Deterministic values retain their source paths; these paths do not establish independently checked factual claims.</p>
        ) : (
          <dl className="grid gap-1 text-[11px] sm:grid-cols-2">
            {trust.map((row) => (
              <div key={row.label} className="flex justify-between gap-2">
                <dt className="text-faint">{row.label}</dt>
                <dd className="mono text-muted">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {checks && (
          <p className="mt-1 text-[11px] text-muted">
            Deterministic consistency checks: <span className={failed > 0 ? "mono text-amber-500" : "mono"}>{checked - failed}/{checked}</span> passed (direction, period, unit and named-person checks; the log is in the audit export).
          </p>
        )}
      </SubBlock>

      <SubBlock label="data gaps">
        <p className="text-[11px] text-muted">{gapCountText(appendix.missingData)} {dataStateText(presentation)}</p>
        <ExtraAuditTables tables={[named]} />
        {families.length > 0 && (
          <AuditTable
            headers={["Gap family", "Entries", "Highest severity"]}
            rows={families.map((row) => ({ key: row.family, cells: [row.family, String(row.entries), row.highest] }))}
          />
        )}
      </SubBlock>

      <SubBlock label={`sources (${appendix.sources.length})`}>
        <AuditTable
          headers={SOURCE_ENTRY_FIELDS.map((field) => field.label.toLowerCase())}
          rows={appendix.sources.map((source, sourceIndex) => ({
            key: `source:${sourceIndex}`,
            cells: SOURCE_ENTRY_FIELDS.map((field) => {
              if (field.key === "stale") {
                return source.stale === undefined ? "unknown" : source.stale ? "yes" : "no";
              }
              return source[field.key];
            }),
          }))}
        />
      </SubBlock>

      <p className="text-[11px] text-muted">
        The verification log, deterministic checks, full missing-data manifest, score drivers with registry ids, projection series, evidence timing, as-of map and pass-by-pass execution record are in the separate audit export
        {auditPath ? <> (<a className="text-accent hover:underline" href={auditPath}>download the audit trail</a>)</> : null}.
      </p>
    </SectionFrame>
  );
}

/* ======================================================================== *
 * Meta strip — symbol / company / run / usage / data / verification
 * ======================================================================== */

export function ReportMetaStrip({
  report,
  completeness,
}: {
  report: Report;
  completeness?: ReportCompletenessPresentation;
}) {
  const m = report.meta;
  const presentation = completeness ?? deriveReportCompletenessPresentation(
    report.meta.dataCompleteness,
    report.appendix.missingData,
  );
  const verification = trustHeadline(m.provenanceCoverage);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border border-edge bg-panel px-3 py-2">
      <div className="flex items-baseline gap-3">
        <span className="mono text-[20px] font-semibold tracking-[0.06em] text-fg">
          {m.symbol}
        </span>
        <span className="text-[13px] text-muted">{m.companyName}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-faint">
        {/* D-62: one line for the run; the judge protocol and per-pass record are in the appendix. */}
        <span>
          model <span className="mono text-muted">{runSummary(report)}</span>
        </span>
        <span>
          usage <span className="mono text-muted">{usageSummary(report)}</span>
        </span>
        <span>
          generated{" "}
          <span className="mono text-muted">
            {m.generatedAt.replace("T", " ").slice(0, 19)}Z
          </span>
        </span>
        <span className="mono">spec {m.specVersion}</span>
        <span
          className={presentation.state === "blocked"
            ? "font-semibold text-red-500"
            : presentation.state === "degraded" || presentation.state === "unknown"
              ? "font-semibold text-amber-500"
              : "text-muted"}
          title="Persisted completeness metadata reconciled against the missing-data manifest."
          data-report-completeness={presentation.metadataStatus}
        >
          Data completeness · {dataStateText(presentation)}
        </span>
      </div>
      {verification && <p className="mt-2 basis-full text-[11px] text-muted">Verification · {verification}</p>}
      {/* WS6 (D-19): the stored disclaimer, verbatim, on the page that shows
          seven letter grades and three price targets. */}
      <p className="basis-full text-[10px] leading-snug text-faint">{m.disclaimer}</p>
    </div>
  );
}

/** Re-export the grade type so callers can annotate without a second import. */
export type { Grade, GradeBlock };
