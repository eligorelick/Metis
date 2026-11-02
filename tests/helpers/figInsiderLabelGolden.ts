import { expect } from "vitest";
import type { ContextPayload } from "@/pipeline/stageC/payload";

/** Restore only the reviewed Form 4 venue labels/IDs before historical pins.
 * Counts, units, periods, row order and all financial operands remain exact. */
export function restoreFigInsiderLabels(payload: ContextPayload): void {
  for (const word of ["purchase", "sale"]) {
    const matches = payload.insiders.figures.filter(f => f.label.startsWith(`insider ${word} transactions`));
    expect(matches).toHaveLength(1);
    const figure = matches[0]!;
    const id = figure.provenanceId!;
    const oldId = id.replace(`insider-${word}-transactions`, `insider-open-market-${word}-transactions`);
    expect(oldId).not.toBe(id);
    const records = payload.provenanceRegistry!.filter(r => r.id === id);
    expect(records).toHaveLength(1);
    records[0]!.id = oldId;
    expect(records[0]!.label).toBe(figure.label);
    records[0]!.label = figure.label.replace(`insider ${word} transactions`, `insider open-market ${word} transactions`);
    figure.provenanceId = oldId;
    figure.label = figure.label.replace(`insider ${word} transactions`, `insider open-market ${word} transactions`);
  }
  const note = "Purchase and sale figures count open-market or private transactions (Form 4 codes P and S), not shares; their venue and motive are not established. The share volumes cover every reported acquisition or disposition.";
  expect(payload.insiders.notes.join("\n").split(note)).toHaveLength(2);
  payload.insiders.notes = payload.insiders.notes.map(n => n.replace(note,
    "Purchase and sale figures count open-market transactions (Form 4 codes P and S), not shares; the share volumes cover every reported acquisition or disposition."));
}
