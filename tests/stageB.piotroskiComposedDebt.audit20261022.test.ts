/**
 * Audit 2026-10-22 E-8: Realty Income and NNN compose long-term debt from
 * instrument-class totals (NotesPayable, LoansPayable) that may hold current
 * notes, so the forensic long-term debt is withheld and the Piotroski leverage
 * signal went null, renormalising the F-score over the rest. The direction of
 * leverage is still measurable when both years compose the figure from the
 * same classes; it is not when the class mix changes between them.
 */
import { describe, expect, it } from "vitest";

import { computePiotroski, type ForensicsPeriod } from "@/pipeline/stageB/forensics";

const NOTES_AND_LOANS = ["us-gaap/NotesPayable", "us-gaap/LoansPayable"];

function period(date: string, totalAssets: number, composed: { value: number; tags: string[] } | null, longTermDebt: number | null = null): ForensicsPeriod {
  return {
    income: { date, revenue: 100, grossProfit: 40, netIncomeFromContinuingOperations: 5 },
    balance: { date, totalAssets, longTermDebt, longTermDebtComposed: composed, totalCurrentAssets: 60, totalCurrentLiabilities: 30 },
    cashFlow: { date, netCashProvidedByOperatingActivities: 8, commonStockIssuance: 0 },
  };
}
const prior2: ForensicsPeriod = { balance: { date: "2023-12-31", totalAssets: 1_000 } };

describe("Piotroski leverage on a composed long-term debt (audit 2026-10-22 E-8)", () => {
  it("scores rising leverage 0 when both years compose debt from the same classes", () => {
    const r = computePiotroski(
      period("2025-12-31", 1_000, { value: 530, tags: NOTES_AND_LOANS }),
      period("2024-12-31", 1_000, { value: 500, tags: [...NOTES_AND_LOANS].reverse() }),
      prior2,
    );
    expect(r.signals.leverageDown.value).toBe(0);
    expect(r.signals.leverageDown.detail).toContain("50.00% → 53.00%");
    expect(r.signals.leverageDown.detail).toContain("NotesPayable + LoansPayable");
    expect(r.notes.some(n => /ΔLEVER: .*composed .*both years/.test(n))).toBe(true);
  });

  it("scores falling leverage 1 on the same basis", () => {
    const r = computePiotroski(
      period("2025-12-31", 1_000, { value: 470, tags: NOTES_AND_LOANS }),
      period("2024-12-31", 1_000, { value: 500, tags: NOTES_AND_LOANS }),
      prior2,
    );
    expect(r.signals.leverageDown.value).toBe(1);
  });

  it("withholds the signal, naming both tag sets, when the classes differ between years", () => {
    const r = computePiotroski(
      period("2025-12-31", 1_000, { value: 530, tags: NOTES_AND_LOANS }),
      period("2024-12-31", 1_000, { value: 500, tags: ["us-gaap/NotesPayable"] }),
      prior2,
    );
    expect(r.signals.leverageDown.value).toBeNull();
    expect(r.signals.leverageDown.detail).toMatch(/the tags differ between years \(NotesPayable \+ LoansPayable vs NotesPayable\)/);
  });

  it("withholds the signal when one year reports long-term debt alone and the other composes it", () => {
    const r = computePiotroski(
      period("2025-12-31", 1_000, { value: 530, tags: NOTES_AND_LOANS }),
      period("2024-12-31", 1_000, null, 500),
      prior2,
    );
    expect(r.signals.leverageDown.value).toBeNull();
    expect(r.signals.leverageDown.detail).toMatch(/the tags differ between years \(NotesPayable \+ LoansPayable vs long-term debt alone\)/);
  });
});
