import type { Scoring } from "@/report/schema";
import { factorContributionSensitivityTable } from "@/report/auditTables";
import { formatScore } from "@/report/scoreText";
import { RecordedAuditTable } from "./RecordedAuditTable";

/** Geometry uses admitted display points only; the audit producer owns reconciliation. */
export function FactorAttribution({ scores }: { scores: Scoring }) {
  const table = factorContributionSensitivityTable(scores);
  const available = table.headers[0] === "Factor family";
  const magnitude = available ? Math.max(1, Math.ceil(Math.max(...table.rows.map(row => Math.abs(Number(row[2])))))) : 1;
  return <section className="factor-attribution" aria-label="Composite factor attribution">
    <div className="analysis-visual-heading"><h3>{table.heading}</h3>
      {available && <p>Neutral baseline <span className="mono">50</span> → recorded composite <span className="mono">{formatScore(scores.composite.score, 2)}</span></p>}
    </div>
    {available ? <>
      <p className="analysis-visual-description">Signed contributions to the recorded house-rule score. The center line is zero contribution; effective family weights retain route applicability and missingness.</p>
      <p className="factor-signed-scale">Shared signed-point scale: −{magnitude} · 0 (neutral) · +{magnitude}. Arithmetic attribution, not causation or prediction.</p>
      <ul className="factor-contribution-list">{table.rows.map(([family, weight, points, neutralized]) => {
        const value = Number(points);
        return <li key={family} data-contribution-points={points}>
          <div className="factor-contribution-label"><span>{family.replaceAll("-", " ")}</span><span className="mono">{weight} effective</span></div>
          <div className="factor-contribution-track" role="img" aria-label={`${family}: ${points} points versus neutral; ${weight} effective weight. Composite if family neutral: ${neutralized}.`}>
            <span className="factor-neutral-axis" aria-hidden="true" />
            <span className="factor-contribution-bar" data-direction={value < 0 ? "negative" : "positive"} style={{ width: `${Math.abs(value) / magnitude * 48}%`, ...(value < 0 ? { right: "50%" } : { left: "50%" }) }} aria-hidden="true" />
          </div>
          <span className="factor-contribution-value mono">{value > 0 ? "+" : ""}{points} pts</span>
        </li>;
      })}</ul>
      <details><summary>Recorded contributions &amp; composite if a family were neutral</summary><RecordedAuditTable table={table} /></details>
    </> : <><p className="analysis-unavailable">{table.rows[0]?.[1] ?? "Factor attribution was not recorded."}</p><p className="recorded-audit-note">{table.note}</p></>}
  </section>;
}
