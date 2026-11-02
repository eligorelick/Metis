import { expect } from "vitest";
import type { ComputedMetrics } from "@/pipeline/compute";
import type { ContextPayload } from "@/pipeline/stageC/payload";

/** FIN-401 / FIN-401-V1: this fixture has no equity-method stake; only the header and method stamps change. */
export function restoreB4bEquityMethodGolden(input: { computed: ComputedMetrics; payload: ContextPayload }) {
  expect(input.payload.payloadVersion).toBe("1.60.0");
  const restore = <T>(value: T, scenarioOccurrences: number): T => {
    let bytes = JSON.stringify(value);
    for (const [current, previous, occurrences] of [
      ["FAIR_VALUE_2026_11_CLAUDE_REPAIRS_39", "FAIR_VALUE_2026_10_D135", 1],
      ["SCENARIO_TARGETS_2026_11_CLAUDE_REPAIRS_39", "SCENARIO_TARGETS_2026_10_D135", scenarioOccurrences],
    ] as const) {
      expect(bytes.split(current), current).toHaveLength(occurrences + 1);
      bytes = bytes.replaceAll(current, previous);
    }
    return JSON.parse(bytes) as T;
  };
  const computed = restore(input.computed, 1);
  const payload = restore(input.payload, 3);
  payload.payloadVersion = "1.59.0";
  return { computed, payload };
}
