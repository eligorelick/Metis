import { describe, expect, it } from "vitest";

import { annotateSharedModelFamily, buildExecutionMetadataEntry, formatExecutionMetadata, sharedModelFamilyOf, subscriptionExecutionModels, type ProviderExecution } from "@/report/execution";
import { ExecutionMetadataEntrySchema, ProviderExecutionSchema } from "@/report/schema";
import { explainAnalysisModel } from "@/settings/contracts";

describe("per-step execution metadata", () => {
  it("keeps requested subscription controls but does not turn unreported model and usage into observed execution", () => {
    const entry = buildExecutionMetadataEntry({ step: "bull", requestedModel: "chatgpt/gpt-6.1-sol", effectiveModel: "chatgpt/gpt-6.1-sol",
      requestedEffort: null, fallbackUsed: false, usage: { input_tokens: 0, output_tokens: 0 },
      execution: { requestedModel: "chatgpt/gpt-6.1-sol", requestedEffort: "high", effectiveEffort: null,
        requestedServiceTier: "fast", effectiveServiceTier: null, modelObserved: false, usageReported: false } });
    expect(entry.effectiveModel).toBe("unknown");
    expect(entry).not.toHaveProperty("inputTokens");
    expect(entry).not.toHaveProperty("outputTokens");
    expect(entry.note).toContain("ChatGPT plan");
    expect(entry.note).toContain("usage was not reported");
    expect(entry.note).not.toContain("allowance was used");
    expect(formatExecutionMetadata(entry)).toContain("effective unknown");
    expect(formatExecutionMetadata(entry)).not.toContain("tokens 0");
    expect(subscriptionExecutionModels([entry])).toEqual([]);
    expect(ProviderExecutionSchema.parse({ modelObserved: false, usageReported: false })).toEqual({ modelObserved: false, usageReported: false });
    expect(ExecutionMetadataEntrySchema.parse(entry).effectiveModel).toBe("unknown");
  });

  // D-116, NVDA report #50: synthesis's retry kept the verdict its cut-off
  // first request had written. Both attempts reported gpt-6.1-sol, yet the
  // report said the provider had reported no model and no usage.
  const resumedSynthesis = (carriedSections: NonNullable<ProviderExecution["carriedSections"]>, modelObserved = true) => buildExecutionMetadataEntry({
    step: "synthesize", requestedModel: "chatgpt/gpt-6.1-sol", effectiveModel: "chatgpt/gpt-6.1-sol",
    requestedEffort: null, fallbackUsed: false, usage: { input_tokens: 744_102, output_tokens: 99_406 },
    execution: { requestedModel: "chatgpt/gpt-6.1-sol", requestedEffort: "max", effectiveEffort: modelObserved ? "max" : null,
      requestedServiceTier: "default", effectiveServiceTier: null, modelObserved, usageReported: true, observedModels: ["gpt-6.1-sol"], carriedSections },
  });

  it("names the model of a resumed pass whose kept section's writer was observed, and says what its tokens cover", () => {
    const entry = resumedSynthesis([{ section: "verdict", digest: "a".repeat(64), modelObserved: true, usageReported: false }]);
    expect(entry).toMatchObject({ effectiveModel: "chatgpt/gpt-6.1-sol", effectiveEffort: "max", inputTokens: 744_102, outputTokens: 99_406, observedModels: ["gpt-6.1-sol"] });
    expect(entry.note).toContain("synthesize: ChatGPT plan allowance was used.");
    expect(entry.note).toContain("synthesize: the verdict section was kept from an earlier attempt; the token counts cover only this attempt's requests, and no usage was reported for it.");
    expect(entry.note).toContain("synthesize: requested reasoning max; provider reported max.");
    expect(entry.note).toContain("the applied service tier could not be established for the whole pass");
    expect(entry.note).not.toContain("did not report which model");
    expect(ExecutionMetadataEntrySchema.parse(JSON.parse(JSON.stringify(entry)))).toEqual(entry);
    // The judge's family is known again, so the shared-family sentence returns (D-20).
    const analyst = (step: string) => ({ ...resumedSynthesis([]), step, note: undefined });
    expect(annotateSharedModelFamily([analyst("bull"), analyst("bear"), entry]).at(-1)?.note).toContain("the same model family that wrote both analyst cases");
  });

  it("says a kept section without a saved writer, not the provider, leaves a resumed pass's model unknown", () => {
    const entry = resumedSynthesis([{ section: "verdict", digest: "a".repeat(64) }, { section: "business", digest: "b".repeat(64) }], false);
    expect(entry.effectiveModel).toBe("unknown");
    expect(entry.observedModels).toBeUndefined();
    expect(entry.note).toContain("synthesize: 2 sections were kept from an earlier attempt (verdict, business); no observed model was saved with them, so the model, reasoning effort and speed of the whole pass are not established; the token counts cover only this attempt's requests.");
    expect(entry.note).not.toContain("the provider did not report which model");
    expect(entry.note).not.toContain("no usage was reported");
    // One of two kept sections without a writer is named on its own.
    expect(resumedSynthesis([{ section: "verdict", digest: "a".repeat(64), modelObserved: true, usageReported: true }, { section: "business", digest: "b".repeat(64) }], false).note)
      .toContain("synthesize: 2 sections were kept from an earlier attempt (verdict, business); no observed model was saved with business, so");
    expect(ProviderExecutionSchema.safeParse({ carriedSections: [{ section: "verdict", digest: "short" }] }).success).toBe(false);
  });

  it("preserves an observed model even when usage was not reported", () => {
    const entry = buildExecutionMetadataEntry({ step: "bull", requestedModel: "gemini/auto-gemini-3", effectiveModel: "gemini/gemini-3-pro",
      requestedEffort: null, fallbackUsed: false, usage: { input_tokens: 0, output_tokens: 0 },
      execution: { modelObserved: true, usageReported: false } });
    expect(entry.effectiveModel).toBe("gemini/gemini-3-pro");
    expect(entry.inputTokens).toBeUndefined();
    expect(entry.note).not.toContain("allowance was used");
  });
  it("retains ChatGPT requested and reported reasoning, speed, and usage through stored report validation", () => {
    const entry = buildExecutionMetadataEntry({
      step: "bull", requestedModel: "chatgpt/gpt-6.1-sol", effectiveModel: "chatgpt/gpt-6.1-sol",
      requestedEffort: "low", fallbackUsed: false,
      execution: { requestedEffort: "xhigh", effectiveEffort: "high", requestedServiceTier: "fast", effectiveServiceTier: "priority" },
      usage: { input_tokens: 123, output_tokens: 456 },
    });
    const persisted = ExecutionMetadataEntrySchema.parse(JSON.parse(JSON.stringify(entry)));
    expect(persisted).toMatchObject({ requestedEffort: "xhigh", effectiveEffort: "high", requestedServiceTier: "fast", effectiveServiceTier: "priority", inputTokens: 123, outputTokens: 456, adjustments: [] });
    expect(formatExecutionMetadata(persisted)).toContain("speed requested fast, provider priority");
  });

  it("does not infer an applied OAuth setting when the provider omitted it", () => {
    const entry = buildExecutionMetadataEntry({
      step: "synthesize", requestedModel: "chatgpt/gpt-6.1-sol", effectiveModel: "chatgpt/gpt-6.1-sol",
      requestedEffort: "low", fallbackUsed: false,
      execution: { requestedEffort: "high", effectiveEffort: null, requestedServiceTier: "fast", effectiveServiceTier: null },
    });
    expect(entry.effectiveEffort).toBeNull();
    expect(entry.effectiveServiceTier).toBeNull();
    expect(entry.adjustments).not.toContain("effort-stripped");
    expect(formatExecutionMetadata(entry)).toContain("provider unknown");
  });

  it("discloses Gemini's observed models without treating an aggregate as the final-response model", () => {
    const entry = buildExecutionMetadataEntry({
      step: "bull", requestedModel: "gemini/auto", effectiveModel: "gemini/multiple-models",
      requestedEffort: "high", fallbackUsed: false,
      execution: { requestedEffort: null, effectiveEffort: null, observedModels: ["gemini-fast", "gemini-pro"] },
    });
    expect(ExecutionMetadataEntrySchema.parse(entry).observedModels).toEqual(["gemini-fast", "gemini-pro"]);
    expect(entry.note).toContain("combined usage is not attributed to a single model");
    expect(subscriptionExecutionModels([entry])).toEqual(["gemini/gemini-fast", "gemini/gemini-pro"]);
    expect(entry.requestedEffort).toBeNull();
    expect(sharedModelFamilyOf(["bull", "bear", "synthesize"].map((step) => ({ step, effectiveModel: "gemini/multiple-models" }))).shared).toBe(false);
  });

  it("records Haiku effort stripping instead of claiming the requested effort ran", () => {
    expect(
      buildExecutionMetadataEntry({
        step: "bull",
        requestedModel: "claude-haiku-4-5",
        effectiveModel: "claude-haiku-4-5",
        requestedEffort: "low",
        fallbackUsed: false,
      }),
    ).toMatchObject({
      requestedEffort: "low",
      effectiveEffort: null,
      adjustments: ["effort-stripped"],
    });
  });

  it("records the Sonnet judge floor separately from Haiku analyst passes", () => {
    expect(
      buildExecutionMetadataEntry({
        step: "synthesize",
        requestedModel: "claude-haiku-4-5",
        effectiveModel: "claude-sonnet-5-5",
        requestedEffort: "low",
        fallbackUsed: false,
      }),
    ).toMatchObject({
      requestedModel: "claude-haiku-4-5",
      effectiveModel: "claude-sonnet-5-5",
      requestedEffort: "low",
      effectiveEffort: "low",
      adjustments: ["model-floor"],
    });
  });

  /**
   * The floor is a synthesize-only rule keyed on the registry's
   * judgeFloorModelId; an analyst pass that somehow ran on Sonnet is not
   * "floored", and must not carry the judge's adjustment and note.
   */
  it("does not label an analyst pass with the judge floor", () => {
    expect(
      buildExecutionMetadataEntry({
        step: "bull",
        requestedModel: "claude-haiku-4-5",
        effectiveModel: "claude-sonnet-5-5",
        requestedEffort: null,
        fallbackUsed: false,
      }),
    ).toMatchObject({ adjustments: [] });
  });

  /**
   * D-02's disclosure clause: a stored model id the registry refuses degrades
   * the run to a data-only report, and the reason is named here rather than
   * living only in a transient step detail.
   */
  it("records a rejected model as its own adjustment, with the message", () => {
    const rejected = buildExecutionMetadataEntry({
      step: "bull",
      requestedModel: "claude-opus-5-20260115",
      effectiveModel: "none",
      requestedEffort: "high",
      fallbackUsed: false,
      rejectedReason: explainAnalysisModel("claude-opus-5-20260115") ?? "",
    });
    expect(rejected).toMatchObject({
      requestedModel: "claude-opus-5-20260115",
      effectiveModel: "none",
      requestedEffort: "high",
      effectiveEffort: null,
      adjustments: ["model-rejected"],
    });
    expect(rejected.note).toContain("dated snapshot ids do not exist");
    expect(rejected.note).toContain("claude-opus-5");
    // A rejection is not also an effort-stripping or a model floor.
    expect(rejected.adjustments).toHaveLength(1);
    // The report schema accepts the new adjustment.
    expect(ExecutionMetadataEntrySchema.parse(rejected)).toEqual(rejected);
  });
});
