import type { Projections, ScenarioTargets } from "@/report/schema";

const ALIGNMENT_FIELD = "projections.valueOrderedLabels";

/**
 * Targets order the two computed shocks by value. If the negative growth
 * shock produces the higher valuation, use those same labels on the operating
 * paths. No financial value changes; swap the weights with their paths so the
 * weighted path is invariant even if future display priors become asymmetric.
 * Called once on fresh Stage B outputs, before provenance is registered.
 */
export function alignProjectionScenarios(projections: Projections, targets: ScenarioTargets): Projections {
  if (targets.status !== "available" || projections.notApplicableReason !== null) return projections;
  const bull = targets.targets.find((target) => target.name === "bull");
  const bear = targets.targets.find((target) => target.name === "bear");
  if (!bull || !bear || bull.growthDeltaPp >= 0 || bear.growthDeltaPp <= 0) return projections;
  if (projections.series.some((series) => series.disclosures.some((entry) => entry.field === ALIGNMENT_FIELD))) return projections;
  return {
    ...projections,
    scenarioWeights: { ...projections.scenarioWeights, bull: projections.scenarioWeights.bear, bear: projections.scenarioWeights.bull },
    series: projections.series.map((series) => ({
      ...series,
      bull: series.bear.map((point) => ({ ...point, value: { ...point.value, source: `computed.projections.${series.metric}.bull` } })),
      bear: series.bull.map((point) => ({ ...point, value: { ...point.value, source: `computed.projections.${series.metric}.bear` } })),
      disclosures: [...series.disclosures, {
        field: ALIGNMENT_FIELD,
        reason: "Bull and bear operating paths are labeled by the value of their corresponding DCF scenarios. Here the lower-growth shock produces the higher valuation; the original paths and weighted projection are unchanged.",
        severity: "info" as const,
      }],
    })),
  };
}
