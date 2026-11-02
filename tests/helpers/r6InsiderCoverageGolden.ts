import { expect } from "vitest";
import type { ContextPayload } from "@/pipeline/stageC/payload";

/**
 * R6 (FIGR paid audit, B-21): restore only the reviewed insider-coverage text
 * before the historical pins. On the general fixture R6 adds the coverage
 * figure, the no-post-window-rows note and each trade line's filing date and
 * form; counts, shares, prices, periods and every financial operand stay exact.
 */
export function restoreR6InsiderCoverageGolden<T extends { payload: ContextPayload }>(input: T): T {
  const payload = input.payload;
  const coverage = payload.insiders.figures.filter((f) => f.label === "Insider filing coverage");
  expect(coverage).toHaveLength(1);
  expect(String(coverage[0]!.value)).toMatch(/^Last Form 4 filing date inspected: unavailable\. .*Form 144 proposed-sale notices are not collected/);
  payload.insiders.figures = payload.insiders.figures.filter((f) => f !== coverage[0]);
  const coverageId = coverage[0]!.provenanceId;
  if (coverageId !== undefined && payload.provenanceRegistry !== undefined) {
    expect(payload.provenanceRegistry.filter((r) => r.id === coverageId)).toHaveLength(1);
    payload.provenanceRegistry = payload.provenanceRegistry.filter((r) => r.id !== coverageId);
  }
  // Its source is the one citation the coverage figure adds.
  expect(payload.citationRegistry?.filter((r) => r.id === "pipeline:insider-coverage")).toHaveLength(1);
  payload.citationRegistry = payload.citationRegistry!.filter((r) => r.id !== "pipeline:insider-coverage");
  const noRows = "No dated post-window Form 4 rows are available in the selected provider rows after 2026-03-31; this does not establish no activity.";
  expect(payload.insiders.notes.filter((n) => n === noRows)).toHaveLength(1);
  const filed = "; filed unknown, form unavailable [fmp:insider-trades";
  expect(payload.insiders.notes.filter((n) => n.includes(filed))).toHaveLength(1);
  payload.insiders.notes = payload.insiders.notes.filter((n) => n !== noRows).map((n) => n.replace(filed, " [fmp:insider-trades"));
  return input;
}
