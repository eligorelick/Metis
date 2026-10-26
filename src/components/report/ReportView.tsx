/**
 * ReportView — the centerpiece renderer for a persisted {@link Report}
 * (src/report/schema.ts). Renders the full report (report sections 1–14)
 * as a dense, navigable, terminal-grade page:
 *
 *   - a sticky top bar holding the current 7-grade strip (Fundamentals,
 *     Valuation, Technicals, Balance Sheet, Quality/Red-Flags, Leadership,
 *     Moat), while legacy reports omit only Balance Sheet — each present grade
 *     is a clickable GradeChip that scroll-anchors to its full GradeReasoning;
 *   - the verdict synthesis, prominently, right under the grades;
 *   - the Catalysts & Risks panel with strong visual weight —
 *     accent-bordered — rendered in manifest order as section 10, between
 *     Competitive and Outlook (it is not hoisted above the numbered sections);
 *   - all sections in manifest order as anchored blocks;
 *   - a right-rail sticky anchor nav (the denser option vs. tabs) for jumping.
 *
 * Data-only reports (the multi-pass analysis is absent, including attempted
 * passes that failed) are detected exactly as the view API detects them
 * (appendix.missingData has an `analysis.llm` entry) and render a clear banner;
 * deterministic sections still render, with unavailable or thin-evidence
 * assessments withheld. The appendix/manifest is always shown.
 *
 * Server Component: the anchor nav is plain <a href> links and the expandable
 * reasoning is native <details>, so none of this needs to hydrate. Callers
 * (e.g. ReportTabs) can instantiate this on the server and pass the result
 * down as a ReactNode without pulling it into the client bundle. The chart
 * for the technicals section is passed in as a ReactNode so the (client)
 * chart module stays decoupled from this renderer.
 */

import { MetisLogo } from "@/brand/MetisLogo";
import { withPrincipalSummarySafety } from "@/report/principalAggregationSafety";
import { withHistoricalEnterpriseValueSafety } from "@/report/enterpriseValueSafety";
import { indexVerificationMarks } from "@/report/verificationMarks";
import type { ReactNode } from "react";
import { WorkspaceOnly } from "@/appearance/UiDesignProvider";
import { ReportEvidenceRail } from "./ReportEvidenceRail";
import { DossierCover } from "./DossierCover";
import { ClassicReportScrollOffset, ReportContents } from "./ReportContents";
import { EvidenceInspector } from "./EvidenceInspector";
import { evidenceIdentity } from "./evidenceIdentity";
import { dataStateText, presentationReportId, syntheticNotice } from "@/report/presentation";
import { SourceEvidenceCatalog } from "./SourceEvidenceCatalog";

import type { Report } from "@/report/schema";
import { evidenceTimingRows } from "@/report/evidenceTiming";
import { filingDisclosureTables, newerFilingBanner, newerResultsBanner } from "@/report/filingDisclosurePresentation";
import { deriveReportCompletenessPresentation } from "@/report/completeness";
import {
  REPORT_SECTION_MANIFEST,
  reportSection,
  type ReportSectionKey,
} from "@/report/sectionManifest";

import { sectionAnchorId } from "./primitives";
import {
  AppendixSection,
  BalanceSheetSection,
  BusinessSegments,
  CatalystsRisksPanel,
  CompetitiveSection,
  CompositeScorecard,
  DisagreementsBlock,
  ExecutiveSummary,
  FundamentalsSection,
  GradeStripBar,
  KeyDataBox,
  LeadershipSection,
  MacroSection,
  OutlookSection,
  ProjectionsSection,
  QualityFlags,
  ReportMetaStrip,
  TechnicalsSection,
  ValuationSection,
  VerdictHeader,
  SectionFrame,
} from "./sections";

/* ------------------------------------------------------------------------ *
 * Data-only detection — identical rule to the view API
 * (src/app/api/report/view/[reportId]/route.ts).
 * ------------------------------------------------------------------------ */

export function isDataOnlyReport(report: Report): boolean {
  return report.appendix.missingData.some((m) => m.field === "analysis.llm");
}

/* ------------------------------------------------------------------------ *
 * Right-rail anchor nav
 * ------------------------------------------------------------------------ */

function AnchorNav() {
  return (
    <nav className="report-anchor-nav sticky top-4 hidden max-h-[calc(100vh-6rem)] w-48 shrink-0 flex-col gap-0.5 overflow-y-auto xl:flex">
      <div className="mono px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-faint">
        sections
      </div>
      {REPORT_SECTION_MANIFEST.map((e) => (
        <a
          key={e.key}
          href={`#${sectionAnchorId(e.key)}`}
          className={`mono flex items-baseline gap-2 px-2 py-1 text-[11px] hover:bg-raised ${
            e.accent
              ? "text-accent hover:text-accent"
              : "text-muted hover:text-accent"
          }`}
        >
          <span className={e.accent ? "text-accent/70" : "text-faint"}>
            {String(e.index).padStart(2, "0")}
          </span>
          <span>{e.label}</span>
        </a>
      ))}
    </nav>
  );
}

/**
 * Audit 2026-10-22 B-24: a results release the statements do not reach yet;
 * B-23: a 10-Q or 10-K on file they do not reach.
 */
function NewerResultsBanner({ text, label = "newer results not reflected" }: { text: string; label?: string }) {
  return (
    <div className="border border-warn/50 bg-warn/10 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="mono border border-warn/50 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] text-warn">
          {label}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted">
        {text}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------ *
 * Data-only banner
 * ------------------------------------------------------------------------ */

/**
 * `reason` is the report's own `analysis.llm` manifest entry — the pipeline's
 * honest account (no key vs. model resolution vs. passes that RAN and failed,
 * billing real cost). Hardcoding "no API key" here misdescribed the 2026-07-10
 * incident, where two ~8-minute analyst passes billed and then died overloaded.
 */
function DataOnlyBanner({ text }: { text: string }) {
  return (
    <div className="border border-warn/50 bg-warn/10 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="mono border border-warn/50 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] text-warn">
          data-only
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted">
        {text}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------ *
 * ReportView
 * ------------------------------------------------------------------------ */

export function ReportView({
  report: sourceReport,
  /** Optional chart node mounted inside the Technicals section. */
  technicalsChart,
  /** Optional chart node mounted inside the Fundamentals section. */
  fundamentalsChart,
  layout = "classic",
  selectedReportId,
}: {
  report: Report;
  technicalsChart?: ReactNode;
  fundamentalsChart?: ReactNode;
  layout?: "classic" | "dossier";
  selectedReportId?: number;
}) {
  const report = withHistoricalEnterpriseValueSafety(withPrincipalSummarySafety(sourceReport));
  // F-21: the claim chips below read each claim's verification status.
  indexVerificationMarks(report);
  const reportId = presentationReportId(report,{selectedReportId});
  const inspectionIdentity = layout === "dossier" ? evidenceIdentity("report", report) : "";
  const completeness = deriveReportCompletenessPresentation(
    report.meta.dataCompleteness,
    report.appendix.missingData,
    report.appendix.sources,
  );
  // D-67: each grade line gets its aspect score (limited-evidence label) and the data state (confidence cap).
  const grading = (key: keyof NonNullable<Report["scores"]>["aspects"]) => ({ aspect: report.scores?.aspects[key] ?? null, completeness });
  const sections: Record<ReportSectionKey, ReactNode> = {
    verdict: (
      <div id={sectionAnchorId("verdict")} tabIndex={-1} className="scroll-mt-28">
        {layout === "dossier" ? <DossierCover report={report} completeness={completeness} /> : <>
        <VerdictHeader verdict={report.verdict} />
        {report.verdict.executiveSummary && report.verdict.executiveSummary.length > 0 && (
          <div className="mt-3"><ExecutiveSummary claims={report.verdict.executiveSummary} /></div>
        )}
        {report.scores && <div className="mt-3"><CompositeScorecard scores={report.scores} /></div>}
        <div className="mt-3"><GradeStripBar gradeStrip={report.verdict.gradeStrip} scores={report.scores} /></div>
        {/* D-62: the bull/bear debate sits with the verdict it informs. */}
        {report.disagreements.length > 0 && <div className="mt-3 border border-edge bg-panel px-3 py-3"><DisagreementsBlock disagreements={report.disagreements} /></div>}
        </>}
      </div>
    ),
    business: <BusinessSegments business={report.business} index={reportSection("business").index} extraTables={filingDisclosureTables(report.filingDisclosures, "business")} />,
    fundamentals: <FundamentalsSection report={report} fundamentals={report.fundamentals} sourceFactSummary={report.sourceFactSummary} index={reportSection("fundamentals").index} grading={grading("fundamentals")} chart={fundamentalsChart} extraTables={filingDisclosureTables(report.filingDisclosures, "fundamentals")} />,
    balanceSheet: <BalanceSheetSection report={report} grading={grading("balanceSheet")} balanceSheet={report.balanceSheet} index={reportSection("balanceSheet").index} />,
    valuation: <ValuationSection presentation={layout} report={report} grading={grading("valuation")} valuation={report.valuation} scenarioTargets={report.scenarioTargets} fairValue={report.fairValue} routeMetrics={report.routeMetrics} scenarioPresentation={report.scenarioPresentation} thesisTriggers={report.thesisTriggers} evidenceTiming={evidenceTimingRows(report)} index={reportSection("valuation").index} />,
    quality: <QualityFlags quality={report.quality} grading={grading("quality")} index={reportSection("quality").index} />,
    technicals: <TechnicalsSection report={report} grading={grading("technicals")} technicals={report.technicals} index={reportSection("technicals").index} chart={technicalsChart} />,
    leadership: <LeadershipSection report={report} grading={grading("leadership")} leadership={report.leadership} index={reportSection("leadership").index} />,
    competitive: <CompetitiveSection report={report} grading={grading("moat")} competitive={report.competitive} index={reportSection("competitive").index} />,
    catalystsRisks: <CatalystsRisksPanel catalystsRisks={report.catalystsRisks} dataOnly={isDataOnlyReport(report)} index={reportSection("catalystsRisks").index} extraTables={filingDisclosureTables(report.filingDisclosures, "catalystsRisks")} />,
    outlook: <OutlookSection outlook={report.outlook} index={reportSection("outlook").index} extraTables={filingDisclosureTables(report.filingDisclosures, "outlook")} />,
    projections: report.projections ? <ProjectionsSection projections={report.projections} index={reportSection("projections").index} /> : layout === "dossier" ? <SectionFrame id="projections" index={reportSection("projections").index} title="Weighted Projections"><p className="text-muted">Projections were not recorded in this snapshot. No forecast series or scenario weights are inferred.</p></SectionFrame> : null,
    macro: <MacroSection macro={report.macro} index={reportSection("macro").index} />,
    appendix: <AppendixSection report={report} selectedReportId={reportId} completeness={completeness} showTrustDetails={layout === "classic"} index={reportSection("appendix").index} />,
  };

  return (
    <div className="thesis-report mx-auto flex max-w-[1400px] flex-col gap-3 p-4" data-report-layout={layout}>
      {layout === "classic" && <ClassicReportScrollOffset />}
      {layout === "dossier" && <SourceEvidenceCatalog report={report} />}
      {layout === "classic" && <div className="flex items-center gap-4 border-b border-edge pb-3">
        <MetisLogo className="h-7 w-[111px] shrink-0" />
        <span className="text-[10px] uppercase tracking-[0.16em] text-faint">Equity research report</span>
      </div>}
      {/* Sticky grade strip — clickable, deep-links to each graded section. */}
      <div className="report-grade-strip sticky top-0 z-20 -mx-4 border-b border-edge bg-bg/95 px-4 py-2 backdrop-blur">
        {layout === "dossier" && <div className="report-sticky-context"><span>{report.meta.symbol} · {reportId === undefined ? "saved snapshot" : `#${reportId}`}</span><ReportContents key={`${report.meta.symbol}:${report.meta.generatedAt}`} reportIdentity={`${report.meta.symbol}:${reportId ?? report.meta.generatedAt}`} hasProjections={report.projections !== undefined} /></div>}
        <GradeStripBar gradeStrip={report.verdict.gradeStrip} scores={report.scores} compact presentation={layout === "dossier" ? "dossier" : "default"} />
      </div>

      {report.meta && (layout === "dossier" ? <details className="report-snapshot-details"><summary>Run, usage &amp; provenance details</summary><ReportMetaStrip report={report} selectedReportId={reportId} completeness={completeness} /></details> : <ReportMetaStrip report={report} selectedReportId={reportId} completeness={completeness} />)}
      {layout === "classic" && syntheticNotice(report) && <p className="text-warn">{syntheticNotice(report)}</p>}

      {completeness.bannerText && (layout === "classic" ? <DataOnlyBanner text={completeness.bannerText} /> : <details className="data-only-availability"><summary>Data-only · analysis unavailable · full reason</summary><p>{completeness.analysisReason}</p><p>{dataStateText(completeness)}</p></details>)}

      {newerResultsBanner(report.filingDisclosures) && <NewerResultsBanner text={newerResultsBanner(report.filingDisclosures)!} />}
      {newerFilingBanner(report.filingDisclosures) && <NewerResultsBanner text={newerFilingBanner(report.filingDisclosures)!} label="newer filing not reflected" />}

      {layout === "classic" && <KeyDataBox report={report} />}

      <div className="report-columns flex gap-4">
        {/* Main column */}
        <div className="report-reading flex min-w-0 flex-1 flex-col gap-3">
          {REPORT_SECTION_MANIFEST.map((section) => (
            <div key={section.key} className="contents">{sections[section.key]}</div>
          ))}
        </div>

        {/* Right-rail anchor nav (denser than tabs). */}
        {layout === "dossier" ? <ReportEvidenceRail report={report} selectedReportId={reportId} inspector={<EvidenceInspector key={inspectionIdentity} reportIdentity={inspectionIdentity} />} /> : <><AnchorNav /><WorkspaceOnly><ReportEvidenceRail report={report} selectedReportId={reportId} /></WorkspaceOnly></>}
      </div>
    </div>
  );
}
