import type { Report, TracedNumber } from "@/report/schema";
import { sourceFactAuditTables } from "@/report/sourceFactPresentation";
import { evidenceSourceIdentity } from "./evidenceIdentity";

/** Hidden enhancement payload, never a substitute for the report's visible evidence. */
export function SourceEvidenceCatalog({ report }: { report: Report }) {
  const summary = report.sourceFactSummary;
  if (!summary?.rows.length) return null;
  const reconciliation = sourceFactAuditTables(summary).find(table => table.heading === "Reported earnings reconciliation");
  return <div hidden aria-hidden="true">
    {summary.rows.map(row => {
      const figure: TracedNumber = { ...row, sourceId: row.provenanceId, verified: null };
      return <div key={row.provenanceId} data-evidence-context="recorded" data-evidence-number-context={evidenceSourceIdentity("number", figure)} data-evidence-claim-context={evidenceSourceIdentity("claim", figure)}>
        <h4>As-reported filing context</h4>
        <p>{row.canonicalText}</p>
        <dl>{[["Metric", row.metric], ["Recorded origin", row.origin], ["Source identity", row.provenanceId], ["Measurement window", JSON.stringify(row.periodContext)], ["Observation date", row.asOf], ["Qualifier", row.qualifier]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        {reconciliation && summary.earningsReconciliation.operandIds.includes(row.provenanceId) && <>
          <h4>{reconciliation.heading}</h4>
          <div className="evidence-table-scroll" tabIndex={0} aria-label="Scrollable recorded reconciliation">
            <table><thead><tr>{reconciliation.headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{reconciliation.rows.map((cells, index) => <tr key={index}>{cells.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table>
          </div>
          <p>{reconciliation.note}</p>
          <p>Recorded operand identities: {summary.earningsReconciliation.operandIds.join(" · ")}</p>
        </>}
      </div>;
    })}
  </div>;
}
