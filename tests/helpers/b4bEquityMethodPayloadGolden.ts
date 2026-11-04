import { expect } from "vitest";
import type { ComputedMetrics } from "@/pipeline/compute";
import type { ContextPayload } from "@/pipeline/stageC/payload";

/** FIN-401 / FIN-401-V1: this fixture has no equity-method stake; only the header and method stamps change. */
export function restoreB4bEquityMethodGolden(input: { computed: ComputedMetrics; payload: ContextPayload }) {
  expect(input.payload.payloadVersion).toBe("1.70.0");
  const restore = <T>(value: T, scenarioOccurrences: number): T => {
    let bytes = JSON.stringify(value);
    for (const [current, previous, occurrences] of [
      ["FAIR_VALUE_2026_11_LATEST_BOOK_46", "FAIR_VALUE_2026_10_D135", 1],
      ["SCENARIO_TARGETS_2026_11_LATEST_BOOK_46", "SCENARIO_TARGETS_2026_10_D135", scenarioOccurrences],
    ] as const) {
      expect(bytes.split(current), current).toHaveLength(occurrences + 1);
      bytes = bytes.replaceAll(current, previous);
    }
    return JSON.parse(bytes) as T;
  };
  const computed = restore(input.computed, 1);
  const payload = restore(input.payload, 3);
  // The payload stamp stays at the shared 1.70.0: P0 moved 1.59.0 -> 1.60.0 first on
  // integration, the FIGR paid-run round moved it to 1.61.0, the extra-high audit round to 1.62.0 the priority fixes to 1.63.0, D-173 to 1.64.0, the Q round to 1.65.0 D-184 to 1.66.0, D-188 to 1.67.0, D-189 to 1.68.0, D-191 to 1.69.0 and D-192 to 1.70.0, and restoreResearchReliabilityGolden (the next helper) restores it.
  return { computed, payload };
}
