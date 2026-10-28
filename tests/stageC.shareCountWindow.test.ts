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
});
