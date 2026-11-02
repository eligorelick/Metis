import { expect } from "vitest";
import type { ComputedMetrics } from "@/pipeline/compute";
import type { ContextPayload } from "@/pipeline/stageC/payload";

/** FIN-402-V1/FIN-102/FIN-113: these unaffected fixtures gain terminal evidence
 * and an honest approximate-window marker. Preserve all old numeric/byte pins.
 * P2 owns no shared stamp rollback. */
export function restoreP2ComputedGolden(input: ComputedMetrics) {
  const computed = structuredClone(input);
  for (const year of computed.returns.roic.series) {
    expect(year.operatingLoss).toBe(false);
    if (year.roicPct === null) expect(year.terminalEvidenceRoicPct ?? null).toBeNull();
    else expect(year.terminalEvidenceRoicPct).toBeCloseTo(year.roicPct, 10);
    delete year.terminalEvidenceRoicPct;
    delete year.operatingLoss;
  }
  if (computed.capital.current?.periodStartIsApproximate) delete computed.capital.current.periodStartIsApproximate;
  computed.returns.wacc.notes = computed.returns.wacc.notes.map(note => {
    if (note !== "no debt on the weighted latest balance \u2014 WACC = cost of equity") return note;
    expect(computed.returns.wacc.weightDebt).toBe(0);
    return "no debt (totalDebtAvg = 0) \u2014 WACC = cost of equity";
  });
  return computed;
}
export function restoreP2DcfInputsGolden(input: { computed: ComputedMetrics; payload: ContextPayload }) {
  const computed = restoreP2ComputedGolden(input.computed);
  const payload = structuredClone(input.payload);
  const section = payload.computed.find(section => section.title === "Current capital (computed)")!;
  expect(section.notes[0]).toBe("Current capital basis: ttm; approximate window 2025-03-29 through 2026-03-28.");
  section.notes[0] = "Current capital basis: ttm; exact window 2025-03-29 through 2026-03-28.";
  return { computed, payload };
}
