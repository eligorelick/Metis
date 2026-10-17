import { describe, expect, it } from "vitest";
import { computeAccruals } from "@/pipeline/stageB/forensics";

describe("accrual reconciliation operands", () => {
  it("retains actual signed cash flows and does not charge an unseparated investing outflow as an accrual (D-61)", () => {
    const result = computeAccruals({
      income:{date:"2025-12-31",netIncome:60.458},
      cashFlow:{date:"2025-12-31",netIncome:60.458,netCashProvidedByOperatingActivities:115.8,netCashProvidedByInvestingActivities:-102.003},
      balance:{date:"2025-12-31",totalAssets:250,cashAndShortTermInvestments:50,totalLiabilities:100,totalDebt:80},
    }, { balance:{date:"2024-12-31",totalAssets:220,cashAndShortTermInvestments:40,totalLiabilities:100,totalDebt:60} });
    expect(result).toMatchObject({netIncome:60.458,operatingCashFlow:115.8,investingCashFlow:-102.003});
    expect(result.operatingAccruals).toBeCloseTo(-55.342);
    // The rows do not separate investment purchases from operating investment,
    // so the primary measure is operating accruals, NI − CFO — not the broad
    // NI − CFO − CFI (46.661), whose positive sign came from the investing outflow.
    expect(result.definition).toBe("operating");
    expect(result.aggregateAccrualsCashFlow).toBeCloseTo(-55.342);
    expect(result.cashFlowAccrualRatio).toBeLessThan(0);
  });
});
