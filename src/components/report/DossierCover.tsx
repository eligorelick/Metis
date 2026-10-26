import type { Report } from "@/report/schema";
import type { ReportCompletenessPresentation } from "@/report/completeness";
import { scoreAuditTables } from "@/report/auditTables";
import { confidenceText, displayProse, keyDataRows } from "@/report/presentation";
import { CompositeScorecard, DisagreementsBlock, ExecutiveSummary, GradeStripBar, KeyDataBox, VerdictHeader } from "./sections";
import { FactorAttribution } from "./FactorAttribution";
import { ThesisCheckpoints } from "./ThesisCheckpoints";
import { ReportTrustSummary } from "./ReportTrustSummary";

/** Composition only: its report has already passed ReportView's safety presenters. */
export function DossierCover({ report, completeness }: { report: Report; completeness: ReportCompletenessPresentation }) {
  const dimensions = report.scores?.assessments
    ? scoreAuditTables(report.scores).find(table => table.heading === "Assessment dimensions")?.rows : undefined;
  const rows = keyDataRows(report);
  const selected = rows.filter((row, index) => index === 0 || row.label === "Composite grade" || row.label.startsWith("Model fair value") || row.label.startsWith("Scenario range"));
  return <section className="dossier-cover" aria-label="Executive research dossier">
    <div className="dossier-thesis">
      <p className="desk-eyebrow">{completeness.dataOnly ? "Deterministic snapshot" : "Research conclusion"}</p>
      {completeness.dataOnly ? <><p className="data-only-conclusion">No completed analyst synthesis. Deterministic results and their recorded limitations remain available.</p><details className="recorded-data-only-summary"><summary>Recorded deterministic summary and limitations</summary><VerdictHeader verdict={report.verdict} /></details></> : <VerdictHeader verdict={report.verdict} />}
    </div>
    <div className="dossier-headline-grid"><div className="snapshot-financial-ledger" aria-label="Recorded key financials">
      {!completeness.dataOnly && <p className="ledger-valuation-context">{displayProse(report.valuation.graded.oneLineWhy)}</p>}
      <dl>{selected.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd>{row.label.startsWith("Model fair value") && !completeness.dataOnly && <dd className="ledger-basis">Recorded valuation assessment confidence: {confidenceText(report.valuation.graded.confidence,completeness)}</dd>}{row.note && <dd className="ledger-basis">{row.note}</dd>}</div>)}</dl>
      <p className="ledger-model-limit">Model values are conditional estimates under the saved assumptions, not current quotes or forecasts. Calculated {report.meta.evidenceTiming?.calculationAsOf ?? report.valuation.dcf.perShare?.asOf ?? "date not recorded"}.</p>
      <a href="#report-valuation">Valuation assumptions, confidence and scenario limitations</a>
    </div>
    <ReportTrustSummary report={report} completeness={completeness} /></div>
    <div className="assessment-dimensions"><dl>{dimensions ? dimensions.map(([label,value,basis]) => <div key={label}><dt>{label}</dt><dd className="assessment-value">{value}</dd><dd className="assessment-basis">{basis}</dd></div>) : ["Business quality","Price attractiveness","Evidence availability"].map(label => <div key={label}><dt>{label}</dt><dd className="assessment-value text-muted">Not recorded</dd></div>)}</dl>{!dimensions && <p className="text-muted">These separate assessment dimensions were not recorded. They are not inferred from other grades.</p>}</div>
    <details id="report-key-data" className="dossier-detail"><summary>Full key data: quote, multiples and recorded model values</summary><KeyDataBox report={report} /></details>
    <nav className="dossier-detail-links" aria-label="Supporting research"><a href="#report-research-detail">Executive evidence</a><a href="#report-score-detail">Scores &amp; attribution</a><a href="#report-debate-detail">Checkpoints &amp; debate</a></nav>
    <details id="report-research-detail" className="dossier-detail" open={!completeness.dataOnly}><summary>{completeness.dataOnly ? "Recorded supporting evidence" : "Executive evidence and full recorded assessment rationales"}</summary>
      {report.verdict.executiveSummary && report.verdict.executiveSummary.length > 0 && <ExecutiveSummary claims={report.verdict.executiveSummary} />}
      <div className="dossier-analyst-assessments"><h3>{completeness.dataOnly ? "Deterministic section summaries" : "Analyst section assessments"}</h3><p>{completeness.dataOnly ? "No analyst assessment was completed. Any available bands below describe deterministic results." : "Recorded section judgments are distinct from deterministic scores and may differ."}</p><GradeStripBar gradeStrip={report.verdict.gradeStrip} scores={report.scores} /></div>
    </details>
    <details id="report-score-detail" className="dossier-detail"><summary>Deterministic scorecard, methodology &amp; factor attribution</summary>
      {report.scores ? <><CompositeScorecard scores={report.scores} mode="cover" /><FactorAttribution scores={report.scores} /></> : <p>No deterministic scorecard was recorded in this snapshot.</p>}
    </details>
    <details id="report-debate-detail" className="dossier-detail dossier-debate"><summary>Thesis review checkpoints &amp; bull/bear debate</summary><ThesisCheckpoints triggers={report.thesisTriggers} />{report.disagreements.length > 0 && <DisagreementsBlock disagreements={report.disagreements} />}</details>
  </section>;
}
