import { expect } from "vitest";
import type { ContextPayload } from "@/pipeline/stageC/payload";

/**
 * Q1: the per-person Form 4 code P/S summary is the only payload text this
 * change adds. On the general fixture (built 2026-07-06, one CEO sale) that is
 * one header and one person line; its tag repeats the detailed row's, so the
 * citation registry is unchanged. Restore only those two notes before the
 * historical pins.
 */
export function restoreQ1PersonTradesGolden<T extends { payload: ContextPayload }>(input: T): T {
  const header = "Form 4 purchases and sales by person (codes P and S, open-market or private), 2026-01-04 to 2026-07-06, " +
    "from all 1 selected provider row (the detailed rows below are the newest 1). Row totals may overlap across amendments or joint filings; " +
    "venue and motive are not established.";
  const line = "2026-06-01 Tim Cook (CEO): code S sales, 1 row on 2026-06-01, 50000 shares at 205 [fmp:insider-trades · 2026-06-01]";
  const notes = input.payload.insiders.notes;
  expect(notes.filter((note) => note === header)).toHaveLength(1);
  expect(notes.filter((note) => note === line)).toHaveLength(1);
  expect(notes.indexOf(line)).toBe(notes.indexOf(header) + 1);
  input.payload.insiders.notes = notes.filter((note) => note !== header && note !== line);
  return input;
}
