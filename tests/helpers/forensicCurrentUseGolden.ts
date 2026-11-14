import { expect } from "vitest";
import type { ComputedMetrics } from "@/pipeline/compute";
import deltas from "../fixtures/forensic-current-use-deltas.json";

/**
 * D-208: exact diff of the unchanged forensic fixture against integrated source
 * 0e600617. Its 2025 quote predates the 2026 model. Adverse valuation signals
 * disappear and the unchanged score formula moves 60.97 -> 65.87, provisionally.
 * Pin every admitted/refused field before restoring the historical full hash;
 * this never restores or certifies current evidence in production.
 */
export function restoreForensicCurrentUseGolden(computed: ComputedMetrics): ComputedMetrics {
  const result = structuredClone(computed);
  // D-261 adds only missing-score disclosures on this historical control.
  // Pin their purpose before removing them from the older whole-result hash;
  // the current frozen records and scoring regressions check the full entries.
  const scoreGaps = result.gaps.filter(gap => gap.field.startsWith("scores."));
  expect(scoreGaps.length).toBeGreaterThan(0);
  for (const gap of scoreGaps) expect(gap.reason).toMatch(/withheld:.*(missing|refused|establish|unavailable)/i);
  result.gaps = result.gaps.filter(gap => !gap.field.startsWith("scores."));
  const datedRoic = (field: string) => /^returns\.roic\.\d{4}-\d{2}-\d{2}$/.test(field);
  const roicGaps = result.returns.roic.gaps.filter(gap => datedRoic(gap.field));
  expect(roicGaps.map(gap => gap.field)).toEqual(["returns.roic.2022-12-31", "returns.roic.2023-12-31"]);
  for (const gap of roicGaps) expect(gap.reason).toMatch(/ROIC withheld because no balance sheet within 45d/);
  result.returns.roic.gaps = result.returns.roic.gaps.filter(gap => !datedRoic(gap.field));
  result.returns.gaps = result.returns.gaps.filter(gap => !datedRoic(gap.field));
  result.gaps = result.gaps.filter(gap => !datedRoic(gap.field));
  for (const delta of deltas) {
    const keys = delta.path.replace(/\[(\d+)\]/g, ".$1").split(".");
    let parent = result as unknown as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
    const key = keys.at(-1)!;
    if ("afterMissing" in delta) expect(Object.hasOwn(parent, key), delta.path).toBe(false);
    else expect(parent[key], delta.path).toEqual(delta.after);
    if ("beforeMissing" in delta) delete parent[key];
    else parent[key] = structuredClone(delta.before);
  }
  // The refused producer omits scenarioAssumptions. Restore its original key
  // position as well as its asserted value, because the old hash is byte based.
  const { scenarioAssumptions, status, method, methodVersion, ...tail } = result.scenarioTargets;
  result.scenarioTargets = { status, method, methodVersion, scenarioAssumptions, ...tail };
  return result;
}
