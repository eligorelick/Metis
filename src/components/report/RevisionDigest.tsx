import Link from "next/link";
import type { DiffComparison, DiffReasonCode, ReportDiff, TracedValueSnapshot } from "@/report/diff";
import { DIFF_REASON_LABELS } from "@/report/diffPresentation";
import { GRADE_SURFACE_BY_KEY, SCORE_SURFACE_BY_KEY } from "@/report/surfaceManifest";

function Reasons({ reasons }: { reasons: readonly DiffReasonCode[] }) {
  return <span className="text-warn">{[...new Set(reasons)].map(reason => DIFF_REASON_LABELS[reason]).join("; ")}</span>;
}
function trace(value: TracedValueSnapshot | null) {
  if (value === null) return "Absent";
  return [value.value === null ? "Unavailable" : String(value.value), value.unit, value.currency, value.period].filter(Boolean).join(" · ");
}
function Family({ label, comparison, changes }: { label: string; comparison: DiffComparison; changes: readonly DiffComparison[] }) {
  const withheld = changes.filter(change => change.comparison === "not-comparable");
  return <div><dt>{label}</dt><dd>{comparison.comparison === "not-comparable" ? <>Comparison withheld · <Reasons reasons={comparison.reasons} /></> : <>{changes.filter(change => change.comparison === "comparable").length} comparable changes{withheld.length > 0 && <> · {withheld.length} withheld: <Reasons reasons={withheld.flatMap(change => change.reasons)} /></>}</>}</dd></div>;
}

/** A reading aid for the existing deterministic diff, never a second comparer. */
export function RevisionDigest({ diff, compareHref }: { diff: ReportDiff; compareHref: string }) {
  return <section className="revision-digest" aria-label="Revision digest">
    <div className="revision-digest-heading"><div><p className="section-eyebrow">Saved research · older → newer</p><h2 className="metis-heading">Revision digest</h2></div>{compareHref.startsWith("#") ? <a href={compareHref}>Full comparison →</a> : <Link href={compareHref} prefetch={false}>Full comparison →</Link>}</div>
    {diff.comparisonStatus === "not-comparable" ? <p>Comparison withheld for some fields. <Reasons reasons={diff.notComparableReasons} /></p> : diff.comparisonStatus === "unchanged" ? <p>No changes in comparable report fields.</p> : <p>Recorded research changed. Review the underlying values and comparability context below.</p>}
    <p className="text-muted">Source freshness: {diff.sourceFreshness.from} → {diff.sourceFreshness.to}. Freshness does not establish that a new filing was added.</p>
    <dl className="revision-families">
      <Family label="Analyst grades" comparison={diff.familyComparisons.grades} changes={diff.gradeChanges} />
      <Family label="Deterministic scores" comparison={diff.familyComparisons.scores} changes={diff.scoreChanges} />
      <Family label="Scenario targets" comparison={diff.familyComparisons.targets} changes={diff.targetChanges} />
      <Family label="Factor weights" comparison={diff.familyComparisons.weights} changes={diff.weightChanges} />
      <Family label="Score drivers" comparison={diff.familyComparisons.drivers} changes={diff.driverChanges} />
      <Family label="Catalysts" comparison={diff.familyComparisons.catalysts} changes={diff.catalystChanges} />
      <Family label="Risks" comparison={diff.familyComparisons.risks} changes={diff.riskChanges} />
    </dl>
    <ul className="revision-highlights">
      {diff.familyComparisons.grades.comparison === "comparable" && diff.gradeChanges.filter(change => change.comparison === "comparable").map(change => <li key={change.section}>{GRADE_SURFACE_BY_KEY[change.section].label}: <span className="mono">{change.from ?? "Unavailable"} → {change.to ?? "Unavailable"}</span> · {change.transition.replaceAll("-", " ")}</li>)}
      {diff.familyComparisons.scores.comparison === "comparable" && diff.scoreChanges.filter(change => change.comparison === "comparable").map(change => <li key={change.aspect}>{SCORE_SURFACE_BY_KEY[change.aspect].label}: <span className="mono">{change.fromValue ?? "Unavailable"} → {change.toValue ?? "Unavailable"}</span> · {change.transition.replaceAll("-", " ")}</li>)}
      {diff.familyComparisons.targets.comparison === "comparable" && diff.targetChanges.filter(change => change.comparison === "comparable").map(change => <li key={change.scenario}>{change.scenario} target: <span className="mono">{trace(change.from)} → {trace(change.to)}</span> · {change.transition.replaceAll("-", " ")}</li>)}
      {diff.verdictChange?.comparison === "comparable" && diff.familyComparisons.verdict.comparison === "comparable" && <li>Thesis changed; read both versions in the full comparison.</li>}
    </ul>
  </section>;
}
