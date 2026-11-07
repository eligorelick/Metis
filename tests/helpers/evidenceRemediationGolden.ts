import { expect } from "vitest";
import type { ComputedMetrics } from "@/pipeline/compute";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import deltas from "../fixtures/evidence-remediation-deltas.json";

type Delta = { path: string; before?: unknown; after?: unknown; beforeMissing?: boolean; afterMissing?: boolean };

/** Compare the identical synthetic fixture on 3767acbe and this implementation.
 * Assert each reviewed change before restoring the historical byte-level pins. */
export function restoreEvidenceRemediationGolden<T extends { computed: ComputedMetrics; payload: ContextPayload }>(input: T): T {
  const result = structuredClone(input);
  for (const delta of deltas.changes as Delta[]) {
    const keys = delta.path.replace(/\[(\d+)\]/g, ".$1").split(".");
    let parent = result as unknown as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
    const key = keys.at(-1)!;
    if (delta.afterMissing) expect(Object.hasOwn(parent, key), delta.path).toBe(false);
    else expect(parent[key], delta.path).toEqual(delta.after);
    if (delta.beforeMissing) delete parent[key];
    else parent[key] = structuredClone(delta.before);
  }
  for (const name of ["provenanceRegistry", "citationRegistry"] as const) {
    const rows = result.payload[name]! as unknown as { id: string }[];
    const edits = deltas.registries[name] as {
      added: { id: string }[];
      changed: { id: string; before: { id: string }; after: { id: string } }[];
      removed: { index: number; value: { id: string } }[];
    };
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
  return result;
}
