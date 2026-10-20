/**
 * AMZN audit 2026-10-20 finding 20: presentation nits in deterministic
 * report text.
 */
import { describe, expect, it } from "vitest";

import { computeAccruals, type ForensicsPeriod } from "@/pipeline/stageB/forensics";
import { metricLabel, sourceLabel } from "@/report/presentation";

describe("the accrual scaler's label", () => {
  it("does not name net operating assets when the scaler may be average total assets", () => {
    // Negative net operating assets: the house rule rescales by average total assets.
    const year = (date: string, totalAssets: number): ForensicsPeriod => ({
      income: { date, revenue: 100, netIncome: 5 },
      balance: { date, totalAssets, cashAndShortTermInvestments: totalAssets * 0.9, totalLiabilities: totalAssets * 0.8, totalDebt: 0 },
      cashFlow: { date, netIncome: 5, netCashProvidedByOperatingActivities: 9 },
    });
    const accruals = computeAccruals(year("2025-12-31", 120), year("2024-12-31", 100));
    expect(accruals.scaler).toBe("avgTotalAssets");
    for (const id of ["computed.forensics.accruals.scalerValue", "computed.forensics.accrual-scaler-value"]) {
      expect(metricLabel(id)).not.toMatch(/net operating assets/i);
      expect(sourceLabel(id)).toBe(metricLabel(id));
      expect(metricLabel(id)).toMatch(/^Accrual scaler/);
    }
  });
});
