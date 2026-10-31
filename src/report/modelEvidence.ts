import { parseSubscriptionModel, validModelId } from "@/ai/contracts";
import { executionCompleted, type ExecutionMetadataEntry } from "@/report/execution";
import type { Report } from "@/report/schema";

export interface ReportModelAttempt extends ExecutionMetadataEntry {
  /** Recorded execution labels, never backfilled from a requested model. */
  models: string[];
  modelEvidence: "recorded" | "unknown" | "not-called";
  completion: "completed" | "failed" | "not-called";
}

export interface ReportModelEvidence {
  requestedConfiguration: Array<{ step: string; model: string; effort: ExecutionMetadataEntry["requestedEffort"]; serviceTier?: "default" | "fast" }>;
  attempts: ReportModelAttempt[];
  /** A legacy report-wide label does not establish a request or execution. */
  legacyModelLabel: string | null;
  analysisCompletion: "completed" | "partial" | "not-completed" | "unknown";
}

const UNKNOWN_LABELS = new Set(["", "unknown", "unavailable", "none", "deterministic"]);
const knownLabel = (model: string): boolean => !UNKNOWN_LABELS.has(model.trim().toLowerCase());

/** Saved evidence only: callers cannot supply next-run settings as a fallback. */
export function deriveReportModelEvidence(report: Pick<Report, "meta">): ReportModelEvidence {
  const entries = (report.meta.execution ?? []).filter(entry => entry.effectiveModel !== "deterministic" && entry.requestedModel !== "deterministic");
  const requestedConfiguration = entries.filter(entry => knownLabel(entry.requestedModel)).map(entry => ({
    step: entry.step, model: entry.requestedModel, effort: entry.requestedEffort,
    ...(entry.requestedServiceTier === undefined ? {} : { serviceTier: entry.requestedServiceTier }),
  }));
  const attempts: ReportModelAttempt[] = entries.map(entry => {
    const notCalled = entry.effectiveModel === "none" || entry.adjustments.includes("model-rejected");
    const subscription = parseSubscriptionModel(entry.effectiveModel);
    const observed = entry.observedModels?.filter(model => validModelId(model) && knownLabel(model)) ?? [];
    const models = notCalled || !knownLabel(entry.effectiveModel) ? []
      : subscription?.model === "multiple-models"
        ? observed.map(model => `${subscription.provider}/${model}`)
        : [entry.effectiveModel];
    return { ...entry, models: [...new Set(models)],
      modelEvidence: notCalled ? "not-called" : models.length === 0 ? "unknown" : "recorded",
      completion: notCalled ? "not-called" : executionCompleted(entry) ? "completed" : "failed" };
  });
  const completed = new Set(attempts.filter(attempt => attempt.completion === "completed").map(attempt => attempt.step.replace(/ attempt \d+$/, "")));
  const dataOnly = report.meta.model === "unavailable";
  return { requestedConfiguration, attempts,
    legacyModelLabel: entries.length === 0 && knownLabel(report.meta.model) ? report.meta.model : null,
    analysisCompletion: dataOnly ? "not-completed"
      : ["bull", "bear", "synthesize"].every(step => completed.has(step)) ? "completed"
        : completed.size > 0 ? "partial" : attempts.length > 0 ? "not-completed" : "unknown" };
}
