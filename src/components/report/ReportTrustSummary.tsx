import type { Report } from "@/report/schema";
import type { ReportCompletenessPresentation } from "@/report/completeness";
import { dataStateText, manifestReconciliationRows, trustRows } from "@/report/presentation";
import { evidencePercentText } from "@/report/assessment";

/** Distinct denominators, close to the score and estimate, with the raw accounting reachable. */
export function ReportTrustSummary({report, completeness:c}: {report:Report; completeness:ReportCompletenessPresentation}) {
  const rows = trustRows(report.appendix.provenanceCoverage ?? report.meta.provenanceCoverage, report.appendix.verificationLog);
  const warnings = report.appendix.missingData.filter(gap => gap.expected !== true && gap.severity === "warn").length;
  const share = report.scores?.assessments?.evidenceCompleteness;
  return <section className="report-trust-summary" aria-label="Research evidence summary">
    <p className="trust-condition">{dataStateText(c)}</p>
    <dl className="trust-measures">
      {["Figures traced to a cited source", "Factual claims carrying a citation", "Numeric factual claims numerically matched to a cited figure"].map(label => <div key={label}><dt>{label}</dt><dd>{rows.find(row => row.label === label)?.value ?? `Not recorded${c.dataOnly ? " · no completed verification pass" : ""}`}</dd></div>)}
      <div><dt>Signal evidence availability</dt><dd>{share === undefined ? "Not recorded" : `${evidencePercentText(share)} of route-applicable signal weight`}</dd></div>
    </dl>
    <p>Citations trace sources; numerical matches check figures, not entire prose claims. Availability, completeness and model confidence are separate. None measures investment success.</p>
    <details className="trust-details" id="report-trust-details">
      <summary>{c.dataCriticalCount+c.dataWarningCount} grouped data issues · {warnings} recorded warning entries · reconciliation &amp; definitions</summary>
      <p>Metadata reconciliation: {c.metadataStatus}. This checks agreement with the manifest, not research completeness. EDGAR partial means some retained SEC sources exist alongside gaps; XBRL skipped means no completed cross-check; provisional forensics are not an audit.</p>
      {c.analysisReason && <p>Analysis availability: {c.analysisReason}</p>}
      <dl>{rows.map(row=><div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
      {share !== undefined && <p>Precise signal evidence availability: {String(share)} (fraction). Eligibility uses this recorded precision; a letter needs 50% and partial single-signal assessments remain limited.</p>}
      <div className="overflow-x-auto" tabIndex={0} aria-label="Manifest reconciliation table"><table><thead><tr><th>Presentation</th><th>Groups</th><th>Raw entries</th></tr></thead><tbody>{manifestReconciliationRows(report.appendix.missingData,c).map(row=><tr key={row.kind}><th scope="row">{row.label}</th><td>{row.groups}</td><td>{row.entries}</td></tr>)}</tbody></table></div>
      <p>{report.appendix.missingData.length} original manifest entries remain in the audit, with their recorded severities and full explanations.</p>
      <ul>{[...c.classification.dataGaps,...c.classification.processDisclosures,...c.classification.downgraded].filter(g=>g.fields.length>1 || g.downgrade).map(g=><li key={g.key}>{g.fields.join(" + ")} · {g.fields.length} recorded entries · recorded {g.recordedSeverity}, displayed {g.severity}{g.downgrade ? `: ${g.downgrade}` : ""}</li>)}</ul>
      <a href="#report-appendix">Full sources, verification and manifest</a>
    </details>
  </section>;
}
