/** AI-306: the diluted share-count change is labelled with the span it measured. */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { assembleContextPayload } from "@/pipeline/stageC/payload";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;

describe("share-count change span label (AI-306)", () => {
  it("labels a three-year share-count change as three years and says why", () => {
    const bundle = completeCurrencyBundle({});
    const computed = runStageB(bundle);
    expect(computed.capital.shareCount).toMatchObject({ actualYears: 3, startDate: "2022-12-31", endDate: "2025-12-31" });
    const capital = assembleContextPayload(bundle, computed, EMPTY_VALIDATION).computed.find((s) => s.title === "Capital & cash (computed)")!;
    const row = capital.figures.find((f) => f.label.startsWith("weighted-average diluted common-share change"))!;
    expect(row).toMatchObject({ label: "weighted-average diluted common-share change (3y total)", value: expect.closeTo(-2.9126, 4) }); // (100/103 - 1) x 100
    expect(capital.notes).toContain("Diluted share-count change: requested 5y window, only 3y of share history available (2022-12-31 to 2025-12-31).");
  });

  it("keeps the five-year label and adds no note when five years are measured", () => {
    const bundle = completeCurrencyBundle({});
    const income = (bundle.statements.incomeAnnual as { value: { data: { rows: object[] } } }).value.data.rows;
    income.push(
      { ...income[3], date: "2021-12-31", fiscalYear: "2021", weightedAverageShsOutDil: 104e6 },
      { ...income[3], date: "2020-12-31", fiscalYear: "2020", weightedAverageShsOutDil: 105e6 },
    );
    const capital = assembleContextPayload(bundle, runStageB(bundle), EMPTY_VALIDATION).computed.find((s) => s.title === "Capital & cash (computed)")!;
    expect(capital.figures.some((f) => f.label === "weighted-average diluted common-share change (5y total)")).toBe(true);
    expect(capital.notes.some((n) => n.startsWith("Diluted share-count change:"))).toBe(false);
  });

  // Four annual rows whose oldest is dated `oldest`, so the index span is three years and the date span is not.
  const gapCapital = (oldest: string) => {
    const bundle = completeCurrencyBundle({});
    const income = (bundle.statements.incomeAnnual as { value: { data: { rows: { date: string; fiscalYear?: string }[] } } }).value.data.rows;
    income[3] = { ...income[3], date: oldest, fiscalYear: oldest.slice(0, 4) };
    const computed = runStageB(bundle);
    const capital = assembleContextPayload(bundle, computed, EMPTY_VALIDATION).computed.find((s) => s.title === "Capital & cash (computed)")!;
    const label = capital.figures.find((f) => f.label.startsWith("weighted-average diluted common-share change"))!.label;
    return { years: computed.capital.shareCount.actualYears!, label, notes: capital.notes.filter((n) => n.startsWith("Diluted share-count change:")) };
  };

  it("labels an irregular gap with its date-based whole-year span and no contradictory 'only' line", () => {
    const { years, label, notes } = gapCapital("2019-12-31"); // index span 3, date span 6
    expect(Math.round(years)).toBe(6);
    expect(label).toBe("weighted-average diluted common-share change (6y total)");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("irregular fiscal spacing");
    expect(notes[0]).not.toContain("only");
  });

  it("labels an irregular five-year date span as 5y without saying only 5y is available", () => {
    const { years, label, notes } = gapCapital("2020-12-31"); // index span 3, date span 5.0
    expect(Math.round(years)).toBe(5);
    expect(label).toBe("weighted-average diluted common-share change (5y total)");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("irregular fiscal spacing");
    expect(notes[0]).not.toContain("only");
  });

  it("labels a fractional span to one decimal and keeps the shortfall line only when the window fell short", () => {
    const long = gapCapital("2020-06-30"); // date span about 5.5
    expect(long.label).toBe(`weighted-average diluted common-share change (${long.years.toFixed(1)}y total)`);
    expect(long.label).toMatch(/\(5\.\dy total\)/);
    expect(long.notes[0]).not.toContain("only");
    const short = gapCapital("2021-06-30"); // date span about 4.5
    expect(short.label).toMatch(/\(4\.\dy total\)/);
    expect(short.notes[0]).toContain("irregular fiscal spacing");
    expect(short.notes[0]).toMatch(/only 4\.\d+y of share history available/);
  });
});
