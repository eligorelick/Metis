import { describe, expect, it } from "vitest";
import { failedPassNote, type ExecutionMetadataEntry } from "@/report/execution";
import { runSummary } from "@/report/presentation";
import { deriveReportModelEvidence } from "@/report/modelEvidence";
import { loadTask28Fixture } from "./helpers/task28Report";

function entry(step: string, overrides: Partial<ExecutionMetadataEntry> = {}): ExecutionMetadataEntry {
  return { step, requestedModel: "claude-sonnet-5-5", effectiveModel: "claude-sonnet-5-5",
    requestedEffort: "high", effectiveEffort: "high", fallbackUsed: false, adjustments: [], ...overrides };
}

describe("saved report model evidence", () => {
  it("derives saved requests, recorded failed models and report completion independently", () => {
    const report = loadTask28Fixture();
    report.meta.model = "unavailable";
    report.meta.execution = ["bull attempt 1", "bull attempt 2", "bear"].map(step => entry(step, { note: failedPassNote(step) }));
    const before = JSON.stringify(report);
    const evidence = deriveReportModelEvidence(report);
    expect(evidence.requestedConfiguration).toEqual([
      { step: "bull attempt 1", model: "claude-sonnet-5-5", effort: "high" },
      { step: "bull attempt 2", model: "claude-sonnet-5-5", effort: "high" },
      { step: "bear", model: "claude-sonnet-5-5", effort: "high" },
    ]);
    expect(evidence.attempts.map(attempt => [attempt.step, attempt.models, attempt.modelEvidence, attempt.completion])).toEqual([
      ["bull attempt 1", ["claude-sonnet-5-5"], "recorded", "failed"],
      ["bull attempt 2", ["claude-sonnet-5-5"], "recorded", "failed"],
      ["bear", ["claude-sonnet-5-5"], "recorded", "failed"],
    ]);
    expect(evidence.analysisCompletion).toBe("not-completed");
    expect(evidence.legacyModelLabel).toBeNull();
    expect(JSON.stringify(report)).toBe(before);
  });

  it("retains API, subscription and mixed recorded models without excluding either route", () => {
    const report = loadTask28Fixture();
    report.meta.execution = [entry("bull"), entry("bear", { requestedModel: "chatgpt/requested", effectiveModel: "chatgpt/reported" }),
      entry("synthesize", { requestedModel: "gemini/auto", effectiveModel: "gemini/multiple-models", observedModels: ["gemini-fast", "gemini-pro"] }),
      entry("verify", { requestedModel: "deterministic", effectiveModel: "deterministic" })];
    const evidence = deriveReportModelEvidence(report);
    expect(evidence.attempts.map(attempt => attempt.models)).toEqual([["claude-sonnet-5-5"], ["chatgpt/reported"], ["gemini/gemini-fast", "gemini/gemini-pro"]]);
    expect(evidence.requestedConfiguration.map(config => config.model)).toEqual(["claude-sonnet-5-5", "chatgpt/requested", "gemini/auto"]);
    expect(evidence.analysisCompletion).toBe("completed");
  });

  it.each(["unknown", "unavailable", "", "gemini/multiple-models"])("keeps an unobserved effective value %s unknown without copying the requested model", effectiveModel => {
    const report = loadTask28Fixture();
    report.meta.execution = [entry("bull", { effectiveModel, effectiveEffort: null })];
    const evidence = deriveReportModelEvidence(report);
    expect(evidence.attempts[0]).toMatchObject({ models: [], modelEvidence: "unknown" });
    expect(evidence.requestedConfiguration[0].model).toBe("claude-sonnet-5-5");
    expect(runSummary(report)).toContain("model observation unknown");
    expect(runSummary(report)).not.toContain("on claude-sonnet-5-5");
  });

  it.each([false, true])("never attributes a model to an attempt that was not called (explicit rejection: %s)", rejected => {
    const report = loadTask28Fixture();
    report.meta.execution = [entry("bull", { effectiveModel: rejected ? "claude-sonnet-5-5" : "none", adjustments: rejected ? ["model-rejected"] : [], observedModels: ["must-not-attribute"] })];
    expect(deriveReportModelEvidence(report).attempts[0]).toMatchObject({ models: [], modelEvidence: "not-called", completion: "not-called" });
    expect(deriveReportModelEvidence(report).analysisCompletion).toBe("not-completed");
    expect(runSummary(report)).not.toContain("on claude-sonnet-5-5");
  });

  it.each([undefined, []])("keeps absent/empty legacy execution unknown", execution => {
    const report = loadTask28Fixture();
    report.meta.model = "legacy-model";
    report.meta.execution = execution;
    expect(deriveReportModelEvidence(report)).toMatchObject({ requestedConfiguration: [], attempts: [], legacyModelLabel: "legacy-model", analysisCompletion: "unknown" });
  });

  it("does not call deterministic verification analyst completion or requested model evidence", () => {
    const report = loadTask28Fixture();
    report.meta.execution = [entry("verify", { effectiveModel: "deterministic", requestedModel: "deterministic" })];
    expect(deriveReportModelEvidence(report)).toMatchObject({ requestedConfiguration: [], attempts: [], analysisCompletion: "unknown" });
  });

  it("identifies failed saved attempts without presenting them as completed analysis", () => {
    const report = loadTask28Fixture();
    report.meta.model = "unavailable";
    report.meta.execution = ["bull attempt 1", "bull attempt 2", "bear"].map(step => entry(step, { note: failedPassNote(step) }));
    const text = runSummary(report);
    expect(text).toContain("bull attempt 1");
    expect(text).toContain("claude-sonnet-5-5");
    expect(text).toContain("no usable analysis was completed");
    expect(text).not.toContain("bull attempt 1, bull attempt 2 and bear on");
  });

  it("does not present an unobserved requested model or a pre-call rejection as a model that ran", () => {
    const report = loadTask28Fixture();
    report.meta.execution = [entry("bull", { effectiveModel: "unknown", effectiveEffort: null }),
      entry("bear", { effectiveModel: "none", effectiveEffort: null, adjustments: ["model-rejected"] })];
    const text = runSummary(report);
    expect(text).toContain("model observation unknown");
    expect(text).toContain("rejected before a model call");
    expect(text).not.toContain("on none");
    expect(text).not.toMatch(/\bon unknown\b/);
  });

  it("preserves completed model and effort summaries", () => {
    const report = loadTask28Fixture();
    report.meta.execution = ["bull", "bear", "synthesize"].map(step => entry(step));
    expect(runSummary(report)).toBe("bull, bear and judge on claude-sonnet-5-5 (high effort)");
  });

  it("preserves the valid aggregate label for a completed multi-model subscription pass", () => {
    const report = loadTask28Fixture();
    report.meta.execution = [entry("synthesize", { requestedModel: "gemini/auto", effectiveModel: "gemini/multiple-models",
      effectiveEffort: null, observedModels: ["gemini-fast", "gemini-pro"] })];
    expect(runSummary(report)).toBe("judge on gemini/multiple-models");
  });

  it("retains saved requested speed but omits request sentinels and unobserved model arrays", () => {
    const report = loadTask28Fixture();
    report.meta.model = "unknown";
    report.meta.execution = [entry("bull", { requestedModel: "chatgpt/requested", requestedEffort: null, requestedServiceTier: "fast",
      effectiveModel: "unknown", observedModels: ["must-not-attribute"] }), entry("bear", { requestedModel: "unavailable", effectiveModel: "unknown" })];
    const evidence = deriveReportModelEvidence(report);
    expect(evidence.requestedConfiguration).toEqual([{ step: "bull", model: "chatgpt/requested", effort: null, serviceTier: "fast" }]);
    expect(evidence.attempts.map(attempt => attempt.models)).toEqual([[], []]);
    expect(evidence.analysisCompletion).toBe("partial");
  });

  it.each(["unknown", "unavailable"])("does not turn an absent legacy model %s into a model request", model => {
    const report = loadTask28Fixture();
    report.meta.model = model;
    delete report.meta.execution;
    expect(deriveReportModelEvidence(report).requestedConfiguration).toEqual([]);
    expect(deriveReportModelEvidence(report).legacyModelLabel).toBeNull();
    expect(runSummary(report)).toContain("unknown");
    expect(runSummary(report)).not.toContain("on unavailable");
  });

  it("labels a legacy model-only field as a saved label with unknown execution", () => {
    const report = loadTask28Fixture();
    report.meta.model = "legacy-model";
    delete report.meta.execution;
    expect(runSummary(report)).toContain("legacy-model");
    expect(runSummary(report)).toContain("execution unknown");
  });
});
