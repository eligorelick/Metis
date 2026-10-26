/**
 * Audit 2026-10-22 C-13: Capital One tags its FY2025 loan write-offs
 * (`FinancingReceivableExcludingAccruedInterestAllowanceForCreditLossWriteoff`,
 * 18,166M) but its recoveries only on the cash-flow statement
 * (`ProceedsFromRecoveriesOfLoanPreviouslyChargedOff`, 5,064M); the allowance
 * roll-forward's recovery total is a dimensional fact companyfacts drops. The
 * net charge-off rate was withheld, and the bank balance-sheet grade
 * renormalised without it. 18,166 − 5,064 = 13,102 is the filer's reported
 * net charge-offs.
 */
import { describe, expect, it } from "vitest";

import { computeFinancialMetrics, type FinancialMetricsInputs } from "@/pipeline/stageB/financialMetrics";
import type { CompanyFacts } from "@/edgar/xbrl";

const M = 1e6;
const FY = { start: "2025-01-01", end: "2025-12-31" };
interface Pt { end: string; val: number; start?: string; accn?: string }

function inputs(usGaap: Record<string, Pt[]>): FinancialMetricsInputs {
  const data: CompanyFacts = {
    cik: 927628,
    entityName: "Card Lender",
    facts: {
      "us-gaap": Object.fromEntries(Object.entries(usGaap).map(([tag, points]) => [tag, { label: tag, units: { USD: points.map(p => ({
        ...(p.start !== undefined ? { start: p.start } : {}), end: p.end, val: p.val, accn: p.accn ?? "0000927628-26-000024",
        fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-15" })) } }])),
    },
  } as CompanyFacts;
  return {
    companyFacts: { ok: true, value: { data, asOf: "2025-12-31", source: "edgar", endpoint: "xbrl/companyfacts", fetchedAt: "2026-07-06T00:00:00.000Z" } },
    balance: [
      { date: "2025-12-31", totalAssets: 670_000 * M, totalStockholdersEquity: 112_000 * M },
      { date: "2024-12-31", totalAssets: 490_000 * M, totalStockholdersEquity: 60_000 * M },
    ],
    income: [{ date: "2025-12-31", revenue: 50_000 * M, netIncome: 2_000 * M }],
  };
}
const loans = { FinancingReceivableExcludingAccruedInterestBeforeAllowanceForCreditLoss: [{ end: "2025-12-31", val: 453_622 * M }, { end: "2024-12-31", val: 327_775 * M }] };
const writeoff = { FinancingReceivableExcludingAccruedInterestAllowanceForCreditLossWriteoff: [{ ...FY, val: 18_166 * M }] };

describe("recoveries tagged on the cash-flow statement (audit 2026-10-22 C-13)", () => {
  it("nets write-offs against the cash-flow recoveries of the same year and filing", () => {
    const metric = computeFinancialMetrics("bank", inputs({ ...loans, ...writeoff, ProceedsFromRecoveriesOfLoanPreviouslyChargedOff: [{ ...FY, val: 5_064 * M }] }))
      .metrics.find(m => m.key === "ncoToAverageLoans")!;
    expect(metric.withheldReason).toBeNull();
    expect(metric.value).toBeCloseTo((13_102 / 390_698.5) * 100, 9);
    expect(metric.basis).toContain("FinancingReceivableExcludingAccruedInterestAllowanceForCreditLossWriteoff 18166000000 − ProceedsFromRecoveriesOfLoanPreviouslyChargedOff 5064000000");
    expect(metric.basis).toContain("cash-flow statement");
  });

  it("does not pair recoveries from another filing", () => {
    const metric = computeFinancialMetrics("bank", inputs({ ...loans, ...writeoff, ProceedsFromRecoveriesOfLoanPreviouslyChargedOff: [{ ...FY, val: 5_064 * M, accn: "0000927628-26-000099" }] }))
      .metrics.find(m => m.key === "ncoToAverageLoans")!;
    expect(metric.value).toBeNull();
  });
});
