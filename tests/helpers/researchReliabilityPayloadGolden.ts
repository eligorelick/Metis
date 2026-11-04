import { expect } from "vitest";
import type { ComputedMetrics } from "@/pipeline/compute";
import { payloadFingerprint, serializePayloadForPrompt, type ContextPayload } from "@/pipeline/stageC/payload";
import { restoreCapexBasisGolden } from "./capexBasisGolden";
import { restoreFigInsiderLabels } from "./figInsiderLabelGolden";

/** D-139: one sensitivity-scope sentence changes; all financial and provenance pins remain enforced. */
export function restoreResearchReliabilityGolden(input: { computed: ComputedMetrics; payload: ContextPayload }) {
  // FIG live test: restore only the reviewed capex-basis disclosure before
  // the historical byte/hash pins. No financial operand or value is changed.
  // N2 P/TBV: only the deduction disclosure changes on this missing-intangible
  // fixture. Pin the exact new text and its two occurrences, then retain ALL
  // earlier financial, registry, byte and hash assertions unchanged.
  const n2Current = "marketCap / (common equity - goodwill - intangibleAssets); deducts goodwill unavailable and intangibleAssets unavailable (source monetary units; vendor composition unverified unless stated).  (";
  const n2Prior = "marketCap / (common equity - goodwill - intangibleAssets) (";
  const restoreN2 = <T,>(value: T): T => {
    const text = JSON.stringify(value);
    expect(text.split(n2Current)).toHaveLength(2);
    return JSON.parse(text.replace(n2Current, n2Prior)) as T;
  };
  const computed = restoreCapexBasisGolden(restoreN2(input.computed), 1);
  const payload = restoreCapexBasisGolden(restoreN2(input.payload), 1);
  restoreFigInsiderLabels(payload);
  // F-01/F-02: this valid-issuer fixture changes only its payload stamp.
  // Restore the previous stamp before every existing financial/byte/hash pin.
  // P0 M-1/L-2 and AI-407: 1.59.0 -> 1.60.0, the FIGR paid-run round 1.60.0 -> 1.61.0 and the extra-high audit
  // round 1.61.0 -> 1.62.0 the priority fixes 1.62.0 -> 1.63.0 D-173 1.63.0 -> 1.64.0 the Q round 1.64.0 -> 1.65.0 D-184 1.65.0 -> 1.66.0 D-188 1.66.0 -> 1.67.0 D-189 1.67.0 -> 1.68.0 D-191 1.68.0 -> 1.69.0 D-192 1.69.0 -> 1.70.0 D-194 1.70.0 -> 1.71.0 D-193 1.71.0 -> 1.72.0 and D-195 1.72.0 -> 1.73.0 are stamp-only here.
  expect(payload.payloadVersion).toBe("1.73.0");
  payload.payloadVersion = "1.56.0";
  // D-140: retain every older pin.
  expect(payloadFingerprint(payload)).toBe("1.56.0:f9b1277c");
  expect(Buffer.byteLength(serializePayloadForPrompt(payload))).toBe(148590);
  payload.payloadVersion = "1.55.0";
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
  return { computed, payload };
}
