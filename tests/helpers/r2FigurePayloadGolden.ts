import { expect } from "vitest";
import type { ComputedMetrics } from "@/pipeline/compute";
import type { ContextPayload } from "@/pipeline/stageC/payload";

/** R2 owns only four estimate observation dates and their retained references
 * in this fixture. Restore those counted leaves before all prior byte pins;
 * no numeric operand, registry identity, stamp or earlier assertion changes. */
export function restoreR2FigurePayloadGolden(input: { computed: ComputedMetrics; payload: ContextPayload }) {
  const payload = structuredClone(input.payload);
  const figures = payload.estimates.figures.filter(f => f.source === "fmp:analyst-estimates");
  const records = payload.provenanceRegistry!.filter(r => r.origin === "fmp:analyst-estimates");
  expect(figures).toHaveLength(4);
  expect(records).toHaveLength(4);
  for (const entry of [...figures, ...records]) {
    expect(entry.asOf).toBe("2026-07-06");
    expect(entry.estimateTiming?.envelopeReferenceOn).toBe("2026-07-01");
  }
  for (const entry of [...figures, ...records]) {
    entry.asOf = "2026-07-01";
    delete entry.estimateTiming!.envelopeReferenceOn;
  }
  return { ...input, payload };
}
