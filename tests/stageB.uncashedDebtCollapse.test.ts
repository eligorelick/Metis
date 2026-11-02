import { describe, expect, it } from "vitest";
import { uncashedDebtCollapseReason } from "@/edgar/debtCompleteness";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

// D-174. AAPL on 2026-11-02, hours after its FY2026 10-K: the provider's year-end quarter
// reported long-term debt 0 and total debt 1.997B (the prior quarter's commercial paper)
// against 84.31B at 2026-06-27, with zero net debt issuance in the quarter's cash flow.
// Apple discloses no interest expense, so the interest-based tests could not judge it and
// the report published net debt of -54.73B. Total liabilities rose from 275.746B to 292.455B
// and equity from 107.520B to 112.093B: the debt had not left the balance sheet.
const apple = {
  annualInterestExpense: 0, financingDebt: 1_997_000_000, previousFinancingDebt: 84_310_000_000, previousDate: "2026-06-27",
  netDebtIssuance: 0, totalAssets: 404_548_000_000,
  totalLiabilities: 292_455_000_000, previousTotalLiabilities: 275_746_000_000, equity: 112_093_000_000, previousEquity: 107_520_000_000,
};
const noBalanceEvidence = { totalLiabilities: null, previousTotalLiabilities: null, equity: null, previousEquity: null };

describe("debt collapse without usable interest expense (D-174)", () => {
  it("withholds a material collapse the period's debt cash flow does not explain", () => {
    const reason = uncashedDebtCollapseReason(apple);
    expect(reason).toContain("fell from 84310000000 at 2026-06-27 to 1997000000");
    expect(reason).toContain("net debt issuance of 0, total liabilities up 16709000000, equity up 4573000000");
    expect(uncashedDebtCollapseReason({ ...apple, annualInterestExpense: null })).not.toBeNull();
    expect(uncashedDebtCollapseReason({ ...apple, financingDebt: 0 })).not.toBeNull();
    expect(uncashedDebtCollapseReason({ ...apple, netDebtIssuance: null, debtRepayment: -1_000_000_000 })).toContain("debt repayments of -1000000000");
  });

  it("accepts a collapse the cash flow explains, and judges nothing without debt cash flow", () => {
    expect(uncashedDebtCollapseReason({ ...apple, netDebtIssuance: -42_000_000_000 })).toBeNull();
    expect(uncashedDebtCollapseReason({ ...apple, netDebtIssuance: null, debtRepayment: -60_000_000_000 })).toBeNull();
    expect(uncashedDebtCollapseReason({ ...apple, ...noBalanceEvidence, netDebtIssuance: null, debtRepayment: null })).toBeNull();
    // Without any cash flow the balance sheet alone still shows the debt never left.
    expect(uncashedDebtCollapseReason({ ...apple, netDebtIssuance: null, debtRepayment: null })).toContain("no debt cash flow disclosed");
  });

  it("accepts debt that left the balance sheet or turned into equity without cash", () => {
    // A repayment the provider files under another financing line: liabilities fall with the debt.
    expect(uncashedDebtCollapseReason({ ...apple, totalLiabilities: 233_000_000_000 })).toBeNull();
    // Convertible notes converted into shares: equity rises by the carrying amount.
    expect(uncashedDebtCollapseReason({ ...apple, equity: 150_000_000_000 })).toBeNull();
  });

  it("leaves small falls, immaterial debt and judgeable interest to the other tests", () => {
    expect(uncashedDebtCollapseReason({ ...apple, financingDebt: 40_000_000_000 })).toBeNull();
    expect(uncashedDebtCollapseReason({ ...apple, previousFinancingDebt: 10_000_000_000 })).toBeNull();
    expect(uncashedDebtCollapseReason({ ...apple, totalAssets: null })).toBeNull();
    expect(uncashedDebtCollapseReason({ ...apple, annualInterestExpense: 3_000_000_000 })).toBeNull();
    // Interest too small to judge the debt by leaves the cash-flow test in charge.
    expect(uncashedDebtCollapseReason({ ...apple, annualInterestExpense: 1_000_000 })).not.toBeNull();
  });
});

function collapsedQuarter(netDebtIssuance: number) {
  const bundle = completeCurrencyBundle({ debt: 300, balanceQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  const s = bundle.statements;
  if (!s.incomeAnnual.ok || !s.incomeQuarterly.ok || !s.balanceQuarterly.ok || !s.cashflowQuarterly.ok) throw new Error("fixture");
  for (const row of [...s.incomeAnnual.value.data.rows, ...s.incomeQuarterly.value.data.rows]) row.interestExpense = 0;
  const latest = s.balanceQuarterly.value.data.rows[0]!;
  const debt = latest.totalDebt as number;
  Object.assign(latest, { totalDebt: debt / 150, netDebt: debt / 150 - (latest.cashAndCashEquivalents as number) });
  Object.assign(s.cashflowQuarterly.value.data.rows[0]!, { netDebtIssuance });
  return { bundle, date: latest.date as string, debt, latest };
}

describe("Stage B withholds the collapsed quarter (D-174)", () => {
  it("withholds total and net debt when interest is undisclosed and no repayment explains the fall", () => {
    const { bundle, date } = collapsedQuarter(0);
    const gaps = runStageB(bundle).gaps.filter(gap => gap.field.startsWith(`statements.balance.${date}.`));
    expect(gaps.map(gap => gap.field)).toEqual(expect.arrayContaining([`statements.balance.${date}.totalDebt`, `statements.balance.${date}.netDebt`]));
    expect(gaps[0]?.reason).toContain("a debt component is missing");
  });

  it("keeps a fall the quarter's net debt repayment explains", () => {
    const { bundle, date, debt } = collapsedQuarter(0);
    if (!bundle.statements.cashflowQuarterly.ok) throw new Error("fixture");
    bundle.statements.cashflowQuarterly.value.data.rows[0]!.netDebtIssuance = -debt;
    expect(runStageB(bundle).gaps.some(gap => gap.field === `statements.balance.${date}.totalDebt`)).toBe(false);
  });

  it("keeps a fall that converted into equity", () => {
    const { bundle, date, debt, latest } = collapsedQuarter(0);
    Object.assign(latest, { totalStockholdersEquity: (latest.totalStockholdersEquity as number) + debt,
      totalEquity: (latest.totalEquity as number) + debt, totalLiabilities: (latest.totalLiabilities as number) - debt });
    expect(runStageB(bundle).gaps.some(gap => gap.field === `statements.balance.${date}.totalDebt`)).toBe(false);
  });
});
