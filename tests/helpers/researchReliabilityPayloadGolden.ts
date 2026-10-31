import { expect } from "vitest";
import type { ComputedMetrics } from "@/pipeline/compute";
import { payloadFingerprint, serializePayloadForPrompt, type ContextPayload } from "@/pipeline/stageC/payload";

/** D-139: one sensitivity-scope sentence changes; all financial and provenance pins remain enforced. */
export function restoreResearchReliabilityGolden(input: { computed: ComputedMetrics; payload: ContextPayload }) {
  const payload = structuredClone(input.payload);
  expect(payloadFingerprint(payload)).toBe("1.55.0:6b2bcd41");
  expect(Buffer.byteLength(serializePayloadForPrompt(payload))).toBe(148590);
  const figures = payload.computed.flatMap(section => section.figures).filter(figure => figure.source === "computed.scenarioPresentation.sensitivity");
  expect(figures).toHaveLength(1);
  const current = "The WACC × terminal-growth and year-one growth × sustained-margin grids are assessed; missing or invalid cells cannot support robustness";
  const prior = "The WACC × terminal-growth and year-one growth × sustained-margin grids are assessed (growth × margin cells withheld above the scenario margin ceiling are excluded)";
  const value = figures[0].value;
  if (typeof value !== "string") throw new Error("Expected the owned sensitivity conclusion");
  expect(value.split(current)).toHaveLength(2);
  figures[0].value = value.replace(current, prior);
  expect(payloadFingerprint(payload)).toBe("1.55.0:7c555e2d");
  expect(Buffer.byteLength(serializePayloadForPrompt(payload))).toBe(148619);
  return { computed: input.computed, payload };
}
