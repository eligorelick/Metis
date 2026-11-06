import type { FairValue, GradeQualification, Report, ValuationUse } from "./schema";
import { ScoreAspectSchema } from "./schema";
import { applyReportAssessmentStatus, withAssessmentQualification } from "./assessment";
import { classifyValuationDateUse, valuationUseExplanation } from "@/pipeline/stageB/valuationUse";
import { summarizeExcessReturnGrid, summarizeSensitivity } from "./scenarioPresentation";
import { projectionAvailability } from "./surfaceManifest";

const dependsOnCurrentPrice = (trigger: NonNullable<Report["thesisTriggers"]>[number]): boolean =>
  trigger.threshold.source === "computed.valuation.reverseDcf" || trigger.threshold.source.startsWith("computed.valuation.reverseDcf.");

/** Immutable reader policy, applied after the existing source/class/bridge guards. */
export function withValuationUseSafety(report: Report): Report {
  const view = structuredClone(report), old = view.fairValue;
  const raw = old?.perShare ?? view.valuation.dcf.perShare;
  let use: ValuationUse;
  if (old?.currentUse) {
    use = old.currentUse;
    if (old.status !== "available" && old.status !== "dated-reference" && (use.status === "current" || use.status === "dated-reference")) {
      use = { ...use, status: "unestablished", reason: "model-unavailable" };
    }
  } else {
    const bridge = view.valuation.dcf.bridge;
    use = classifyValuationDateUse({ statementDate: bridge?.asOf ?? null,
      quoteDate: view.valuation.marketValueScope?.priceAsOf ?? null, rolledTo: bridge?.valuationDate ?? null,
      elapsedYears: null });
    // Legacy reports retain a factor but no typed rate/elapsed-time authority.
    // A display date or plausible factor cannot certify their roll arithmetic.
    if (bridge?.valuationDate !== undefined || bridge?.rollForwardFactor !== undefined) use = { ...use, status: "unestablished", reason: "invalid-roll-forward" };
    if (old?.status !== "available" || old.method !== "fcff-dcf" || view.valuation.dcf.perShare === null) {
      use = { ...use, status: "unestablished", reason: "model-unavailable" };
    }
  }
  if (old || raw || view.scenarioPresentation || view.thesisTriggers?.some(dependsOnCurrentPrice) ||
    view.valuation.reverseDcf.impliedValue !== null || view.valuation.scenarios.some(s => s.priceTarget !== null)) {
    const fairValue: FairValue = old ?? { status: "suppressed", method: null, methodVersion: "legacy-date-view",
      perShare: null, upsidePct: null, basis: [], reasons: [] };
    fairValue.currentUse = use;
    if (use.status === "current" && fairValue.perShare) {
      fairValue.perShare.asOf = use.valueDate;
      if (view.valuation.dcf.perShare) view.valuation.dcf.perShare.asOf = use.valueDate;
    }
    else if (use.status !== "current") {
      fairValue.auditValuation ??= structuredClone({ scenarios: view.valuation.scenarios, reverseDcf: view.valuation.reverseDcf,
        ...(view.scenarioTargets ? { scenarioTargets: view.scenarioTargets } : {}) });
      if (view.scenarioPresentation) fairValue.auditValuation.scenarioPresentation ??= structuredClone(view.scenarioPresentation);
      if (view.thesisTriggers) fairValue.auditValuation.thesisTriggers ??= structuredClone(view.thesisTriggers);
      if (raw && fairValue.auditValue === undefined) fairValue.auditValue = structuredClone(raw);
      const detail = valuationUseExplanation(use);
      if ((fairValue.status === "available" || fairValue.status === "dated-reference" || (!old && raw)) && !fairValue.reasons.some(r => r.field === "valuation.currentUse")) fairValue.reasons.push({ field: "valuation.currentUse", severity: "warn", reason: detail });
      if (use.status === "dated-reference" && raw && use.valueDate && use.quoteDate) {
        fairValue.status = "dated-reference";
        fairValue.reference ??= { perShare: { ...raw, asOf: use.valueDate }, valuationDate: use.valueDate, quoteDate: use.quoteDate, basis: [...fairValue.basis, detail] };
      } else if (fairValue.status === "available") fairValue.status = "suppressed";
      if (use.status !== "dated-reference") delete fairValue.reference;
      fairValue.perShare = null; fairValue.upsidePct = null; delete fairValue.alternative;
    }
    view.fairValue = fairValue;
  }
  if (use.status !== "current") {
    view.valuation.dcf.perShare = null; view.valuation.dcf.upsidePct = null;
    view.valuation.reverseDcf.impliedValue = null;
    if (view.scenarioTargets?.status === "available") {
      view.scenarioTargets.status = "suppressed"; view.scenarioTargets.targets = [];
      if (!view.scenarioTargets.missingReasons.some(r => r.field === "valuation.currentUse")) view.scenarioTargets.missingReasons.push({
        field: "valuation.currentUse", severity: "warn", reason: valuationUseExplanation(use),
      });
    }
    for (const scenario of view.valuation.scenarios) { scenario.priceTarget = null; }
    if (view.scenarioPresentation) {
      const dcf = view.valuation.dcf;
      const entityAvailable = typeof dcf.bridge?.enterpriseValue === "number" && Number.isFinite(dcf.bridge.enterpriseValue) && (dcf.forecastRows?.length ?? 0) > 0;
      const availability = entityAvailable
        ? `${projectionAvailability(view.projections?.series ?? []).forward ? "Entity DCF and numerical operating scenario paths are available" : "Entity DCF is available; numerical operating scenario paths are unavailable"}; per-share scenario targets are withheld. `
        : "";
      view.scenarioPresentation = { ...view.scenarioPresentation,
        interpretation: `${availability}${valuationUseExplanation(use)} Recorded scenario inputs remain audit diagnostics; no current price comparison or per-share target is admitted.`,
        sensitivity: dcf.sensitivityGrid.length === 0 && dcf.excessReturnGrid
          ? summarizeExcessReturnGrid(dcf.excessReturnGrid, null)
          : summarizeSensitivity(dcf.sensitivityGrid, null, dcf.growthMarginGrid),
      };
    }
    if (view.thesisTriggers) view.thesisTriggers = view.thesisTriggers.filter(trigger => !dependsOnCurrentPrice(trigger));
  }
  if (view.scores) {
    if (!view.scores.qualification) {
      view.scores = withAssessmentQualification(view.scores, { valuationUse: use, financialEvidence: [] });
      const qualification = view.scores.qualification!;
      for (const key of ScoreAspectSchema.options) if (qualification.aspects[key].status === "supported") qualification.aspects[key] = unknownQualification(key);
      if (qualification.composite.status === "supported") qualification.composite = unknownQualification(null);
    } else if (use.status !== "current" && use.status !== "not-applicable" && view.scores.composite.weights.valuation > 0 && view.scores.aspects.valuation.applicableCompleteness !== null) {
      const qualification = view.scores.qualification, reason: GradeQualification["reasons"][number] = {
        code: "current-valuation-unavailable", aspect: "valuation", field: "valuation.currentUse", detail: valuationUseExplanation(use),
      };
      for (const target of [qualification.composite, qualification.aspects.valuation]) {
        target.status = "provisional";
        if (!target.reasons.some(r => r.code === reason.code && r.aspect === "valuation")) target.reasons.push(reason);
      }
    }
  }
  return applyReportAssessmentStatus(view);
}

function unknownQualification(aspect: GradeQualification["reasons"][number]["aspect"]): GradeQualification {
  return { status: "unknown", reasons: [{ code: "legacy-qualification-unknown", aspect, field: null,
    detail: "This stored assessment has no recorded evidence qualification; its grade is retained for audit." }] };
}
