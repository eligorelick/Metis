import { describe, expect, it } from "vitest";
import { computeTechnicals, maxDrawdown, type OhlcvRow } from "@/pipeline/stageB/technicals";

const DAY_MS = 86_400_000;
const bar = (date: string, close = 100): OhlcvRow => ({ date, close, open: close, high: close, low: close, volume: 1_000 });

function dense(years: number): OhlcvRow[] {
  const rows: OhlcvRow[] = [];
  for (let time = Date.parse(`${2026 - years}-10-16T00:00:00Z`); time <= Date.parse("2026-10-16T00:00:00Z"); time += DAY_MS) {
    const date = new Date(time);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) rows.push(bar(date.toISOString().slice(0, 10)));
  }
  return rows;
}

describe("drawdowns disclose actual trailing-window observation coverage", () => {
  it("does not describe an isolated recent observation and an old bar as a complete year", () => {
    const result = maxDrawdown([bar("2025-03-28", 200), bar("2026-10-16", 100)], 1);
    expect(result.depthPct).toBe(0);
    expect(result.insufficientHistory).toBe(true);
    expect(result.coverageIssue).toContain("start");
    expect(result.rowsUsed).toBe(1);
  });

  it("keeps an observed partial decline while rejecting monthly sampling as complete coverage", () => {
    const rows = Array.from({ length: 13 }, (_, index) => bar(new Date(Date.UTC(2025, 9 + index, 16)).toISOString().slice(0, 10), 200 - index * 5));
    const result = maxDrawdown(rows, 1);
    expect(result.depthPct).toBe(30);
    expect(result.insufficientHistory).toBe(true);
    expect(result.coverageIssue).toContain("13");
  });

  it("marks a multi-week interior hole partial despite more than 200 annual observations", () => {
    const rows = dense(1).filter(row => row.date < "2026-03-01" || row.date > "2026-03-20");
    expect(rows.length).toBeGreaterThan(200);
    const result = maxDrawdown(rows, 1);
    expect(result.depthPct).toBe(0);
    expect(result.insufficientHistory).toBe(true);
    expect(result.coverageIssue).toContain("interior gap");
  });

  it.each([1, 3, 5])("preserves densely observed complete %s-year windows", years => {
    const result = maxDrawdown(dense(years), years);
    expect(result.depthPct).toBe(0);
    expect(result.insufficientHistory).toBe(false);
    expect(result.coverageIssue).toBeUndefined();
  });

  it.each([1, 3, 5])("uses the disclosed 200-per-year coverage floor for %s years", years => {
    const rows = dense(years);
    for (const count of [200 * years - 1, 200 * years]) {
      const sample = Array.from({ length: count }, (_, index) => rows[Math.round(index * (rows.length - 1) / (count - 1))]);
      expect(maxDrawdown(sample, years).insufficientHistory).toBe(count < 200 * years);
    }
  });

  it("keeps partial depth independent of an unavailable benchmark and carries its qualifier into read and gaps", () => {
    const rows = Array.from({ length: 13 }, (_, index) => bar(new Date(Date.UTC(2025, 9 + index, 16)).toISOString().slice(0, 10), 200 - index * 10));
    const withoutReference = computeTechnicals(rows, [], [], null);
    const withReference = computeTechnicals(rows, dense(1), [], null);
    expect(withoutReference.drawdowns).toEqual(withReference.drawdowns);
    expect(withoutReference.drawdowns[0].depthPct).toBe(60);
    expect(withoutReference.drawdowns[0].insufficientHistory).toBe(true);
    expect(withoutReference.gaps.find(gap => gap.field === "technicals.drawdown.1y")?.reason).toContain("partial");
    expect(withoutReference.notes.some(note => note.includes("partial observed drawdown") && note.includes("13"))).toBe(true);
    expect(withoutReference.read.flags.find(flag => /drawdown/i.test(flag))).toContain("partial");
  });
});
