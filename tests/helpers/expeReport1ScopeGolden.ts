import { expect } from "vitest";
import type { ComputedMetrics } from "@/pipeline/compute";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import deltas from "../fixtures/expe-report1-scope-deltas.json";

type Delta = { path: string; before?: unknown; after?: unknown; beforeMissing?: boolean; afterMissing?: boolean };

function restoreLeaves(root: unknown, changes: Delta[], prefix: string): void {
  for (const delta of changes) {
    expect(delta.path.startsWith(prefix)).toBe(true);
    const keys = delta.path.slice(prefix.length).replace(/\[(\d+)\]/g, ".$1").split(".");
    let parent = root as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
    const key = keys.at(-1)!;
    if (delta.afterMissing) expect(Object.hasOwn(parent, key), delta.path).toBe(false);
    else expect(parent[key], delta.path).toEqual(delta.after);
    if (delta.beforeMissing) delete parent[key];
    else parent[key] = structuredClone(delta.before);
  }
}

/**
 * D-212: compare the same frozen fixtures against HEAD 0cb2af94's financial
 * modules. This fixture lacks proved consolidated quarterly earnings, so its
 * current conversion signal must disappear. Assert every resulting score,
 * evidence and date change, then preserve the preceding byte-level pins.
 * Registry edits are keyed by identity so three removals do not conceal their
 * meaning among thousands of shifted positional leaves.
 */
export function restoreExpeReport1ScopeGolden<T extends { computed: ComputedMetrics; payload: ContextPayload }>(input: T): T {
  const result = structuredClone(input);
  restoreLeaves(result.computed, deltas.computed, "aapl.computed.");
  restoreLeaves(result.payload, deltas.payload, "aapl.payload.");
  for (const name of ["provenanceRegistry", "citationRegistry"] as const) {
    const rows = result.payload[name]! as unknown as { id: string }[];
    const edits = deltas.registries[name];
    for (const added of edits.added) {
      expect(rows.filter(row => row.id === added.id)).toEqual([added]);
      rows.splice(rows.findIndex(row => row.id === added.id), 1);
    }
    for (const changed of edits.changed) {
      expect(rows.filter(row => row.id === changed.id)).toEqual([changed.after]);
      rows[rows.findIndex(row => row.id === changed.id)] = structuredClone(changed.before);
    }
    for (const removed of edits.removed) {
      expect(rows.some(row => row.id === removed.value.id)).toBe(false);
      rows.splice(removed.index, 0, structuredClone(removed.value));
    }
  }
  const shareGap = result.payload.computed.flatMap(section => section.figures)
    .filter(figure => figure.label === "weighted-average diluted/basic share gap");
  expect(shareGap).toHaveLength(1);
  expect(shareGap[0].value).toBeNull();
  shareGap[0].label = "dilution overhang (diluted vs basic shares)";
  return result;
}

export function restoreExpeReport1ForensicDate(computed: ComputedMetrics): ComputedMetrics {
  const result = structuredClone(computed);
  restoreLeaves(result, deltas.forensic, "forensic.");
  return result;
}
