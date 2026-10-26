import type { Dcf } from "@/report/schema";
import { valuationAuditTables } from "@/report/auditTables";
import { RecordedAuditTable } from "./RecordedAuditTable";
import { TracedFigure, TracedNumberSourceDetails } from "./primitives";

/** A flow of recorded components, not a new calculation or a mixed-unit bar chart. */
export function CapitalBridge({ dcf }: { dcf: Dcf }) {
  const table = valuationAuditTables(dcf).find(item => item.heading === "Enterprise value to equity bridge");
  if (!table) return <section className="capital-bridge" aria-label="Recorded capital structure bridge">
    <h3>Capital structure bridge</h3>
    <p className="analysis-unavailable">An operating-assets to common-equity bridge was not recorded in this snapshot. The recorded valuation method and any route-specific outputs remain below.</p>
  </section>;
  const equity = table.rows.findIndex(row => row[0] === "Common equity value");
  const stages = [
    { key: "operating", title: "Operating assets", rows: table.rows.slice(0, 3) },
    { key: "claims", title: "Ownership & non-operating items", rows: table.rows.slice(3, equity) },
    { key: "common", title: "Common equity & share basis", rows: table.rows.slice(equity) },
  ];
  return <section className="capital-bridge" aria-label="Recorded capital structure bridge">
    <div className="analysis-visual-heading"><h3>{table.heading}</h3><p>Recorded amounts and signs · {dcf.bridge?.currency ?? "currency not recorded"}</p></div>
    <div className="capital-bridge-stages">{stages.map(stage => <div key={stage.key} data-capital-stage={stage.key}>
      <h4>{stage.title}</h4><dl>{stage.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="mono">{value}</dd></div>)}</dl>
      {stage.key === "common" && dcf.perShare && <div className="capital-per-share" role="group" aria-label="Recorded bridge per-share endpoint">
        <p>Recorded model value per share</p>
        <TracedFigure n={dcf.perShare} tone="accent" />
        <TracedNumberSourceDetails n={dcf.perShare} label="Per-share endpoint provenance" />
      </div>}
    </div>)}</div>
    <details><summary>Complete bridge table &amp; valuation conventions</summary><RecordedAuditTable table={table} /></details>
  </section>;
}
