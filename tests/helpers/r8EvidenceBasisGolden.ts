import { expect } from "vitest";
import type { ContextPayload } from "@/pipeline/stageC/payload";

/** R8: restore only the new insider and macro qualifications before historical
 * byte pins. Financial values, dates, ids and all other text stay pinned. The
 * coverage figure is removed by the existing R6 helper immediately afterward. */
export function restoreR8EvidenceBasisGolden<T extends { payload: ContextPayload }>(input: T): T {
  const { payload } = input;
  const qualification = "Per-code share totals for the aggregate window are not available; selected F-code rows do not establish the tax-withholding share of total dispositions. The provider's acquired-share subtotal can be incomplete, including option exercises; these are provider aggregates, not a complete SEC transaction inventory.";
  expect(payload.insiders.notes.filter(note => note.endsWith(qualification))).toHaveLength(1);
  payload.insiders.notes = payload.insiders.notes.map(note => note.replace(qualification, "The share volumes cover every reported acquisition or disposition."));
  const dateBasis = "FRED monthly series use the first day to label the observation month, not the release date; daily series retain their observation day.";
  const transform = "Transforms: CPIAUCSL: year-over-year %";
  expect(payload.macro.notes).toContain(dateBasis);
  expect(payload.macro.notes).toContain(transform);
  payload.macro.notes = payload.macro.notes.filter(note => note !== dateBasis && note !== transform);
  return input;
}
