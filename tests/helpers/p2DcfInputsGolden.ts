import { expect } from "vitest";
import type { ComputedMetrics } from "@/pipeline/compute";
import type { ContextPayload } from "@/pipeline/stageC/payload";

/** FIN-402-V1/FIN-102: restore only separate terminal evidence in this unaffected
 * fixture. No shared stamp transition belongs to P2. All old byte pins remain. */
export function restoreP2DcfInputsGolden(input: { computed: ComputedMetrics; payload: ContextPayload }) {
  const computed = structuredClone(input.computed);
  for (const year of computed.returns.roic.series) {
    expect(year.operatingLoss).toBe(false);
    expect(year.terminalEvidenceRoicPct).toBeCloseTo(year.roicPct!, 10);
    delete year.terminalEvidenceRoicPct;
    delete year.operatingLoss;
  }
  return { computed, payload: input.payload };
}
