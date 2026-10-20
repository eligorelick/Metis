/**
 * AMZN audit 2026-10-20 finding 20: the forensic table listed Amazon's
 * failed Piotroski signals as "current ratio rose, asset turnover rose" when
 * both had fallen. The names were the tests' pass conditions, printed as if
 * they were the outcome. A failed signal now says what the figures did.
 */
import { describe, expect, it } from "vitest";

import { computePiotroski, piotroskiSignalOutcomes, type ForensicsPeriod } from "@/pipeline/stageB/forensics";
import { applyForensicScores } from "@/pipeline/stageC/passes";
import type { ComputedMetrics } from "@/pipeline/compute";
import type { JudgeOutput } from "@/report/schema";

/** Leverage up, current ratio down, gross margin flat (40% both years), asset turnover down. */
function periods(): { current: ForensicsPeriod; prior: ForensicsPeriod; prior2: ForensicsPeriod } {
  return {
    current: {
      income: { date: "2025-12-31", revenue: 110, grossProfit: 44, netIncomeFromContinuingOperations: 7 },
      balance: { date: "2025-12-31", totalAssets: 120, longTermDebt: 45, totalCurrentAssets: 57, totalCurrentLiabilities: 30 },
      cashFlow: { date: "2025-12-31", netCashProvidedByOperatingActivities: 9, commonStockIssuance: 0 },
    },
    prior: {
      income: { date: "2024-12-31", revenue: 100, grossProfit: 40, netIncomeFromContinuingOperations: 5 },
      balance: { date: "2024-12-31", totalAssets: 100, longTermDebt: 33, totalCurrentAssets: 60, totalCurrentLiabilities: 30 },
      cashFlow: { date: "2024-12-31", netCashProvidedByOperatingActivities: 8, commonStockIssuance: 0 },
    },
    prior2: { balance: { date: "2023-12-31", totalAssets: 80 } },
  };
}

describe("Piotroski failure wording follows the actual change", () => {
  it("names the direction each failed signal's figures moved", () => {
    const { current, prior, prior2 } = periods();
    const result = computePiotroski(current, prior, prior2);
    expect(result.score).toBe(5);
    expect(piotroskiSignalOutcomes(result).failed).toEqual([
      "leverage rose", "current ratio fell", "gross margin was unchanged", "asset turnover fell",
    ]);

    const quality = {
      graded: {}, flags: [],
      forensicScores: {
        altman: { variant: "x", score: null, zone: null }, beneish: { variant: "x", score: null, zone: null },
        piotroski: { variant: "x", score: null, zone: null }, accruals: { variant: "x", score: null, zone: null },
      },
    } as unknown as JudgeOutput["quality"];
    const forensics = { altmanSelection: { variant: "original", notes: [] }, altman: null, beneish: null, piotroski: result, accruals: null,
      flags: [], notes: [], gaps: [] } as unknown as ComputedMetrics["forensics"];
    const zone = applyForensicScores(quality, forensics).forensicScores.piotroski.zone;
    expect(zone).toBe("5/9; failed: leverage rose, current ratio fell, gross margin was unchanged, asset turnover fell");
    expect(zone).not.toMatch(/current ratio rose|asset turnover rose|gross margin rose|leverage fell/);
  });

  it("states the level tests' failures without the pass condition", () => {
    const { current, prior, prior2 } = periods();
    current.income!.netIncomeFromContinuingOperations = -4;
    current.cashFlow!.netCashProvidedByOperatingActivities = -6;
    current.cashFlow!.commonStockIssuance = 50;
    const failed = piotroskiSignalOutcomes(computePiotroski(current, prior, prior2)).failed;
    expect(failed).toEqual(expect.arrayContaining(["ROA was negative", "CFO was negative", "ROA fell", "CFO was below net income", "equity was issued"]));
    expect(failed.join(", ")).not.toMatch(/ROA > 0|CFO > 0|ΔROA > 0|CFO > net income|no equity issued/);
  });

  it("never prints a pass condition as the outcome of a stored signal that records no direction", () => {
    const failedSignal = { value: 0 as const, detail: "" };
    const passed = { value: 1 as const, detail: "" };
    const failed = piotroskiSignalOutcomes({ signals: {
      roaPositive: passed, cfoPositive: passed, roaImproved: failedSignal, accrualQuality: failedSignal, leverageDown: failedSignal,
      liquidityUp: failedSignal, noEquityIssuance: passed, marginUp: failedSignal, turnoverUp: failedSignal,
    } }).failed;
    expect(failed).toEqual(["ROA did not improve", "CFO did not exceed net income", "leverage did not fall", "current ratio did not rise",
      "gross margin did not rise", "asset turnover did not rise"]);
  });
});
