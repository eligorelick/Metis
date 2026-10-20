/**
 * Debt that the year's interest expense shows to be incomplete is withheld
 * (audit 2026-10-19, O-2). Realty Income's run published debt of $1.93bn
 * against $1.19bn of annual interest, a 62% implied rate, and scored the
 * resulting 0.27x leverage.
 */
import { describe, expect, it } from "vitest";
import { implausibleDebtReason } from "@/edgar/debtCompleteness";
import { runStageB } from "@/pipeline/compute";
import type { DataBundle } from "@/pipeline/types";
import { currencyBundle, M } from "./helpers/currencyBundle";

describe("implausibleDebtReason", () => {
  it("rejects O's lease-and-paper debt against its interest expense", () => {
    expect(implausibleDebtReason({ annualInterestExpense: 1_186.7 * M, financingDebt: 1_400 * M, priorFinancingDebt: 1_514 * M, totalAssets: 71_000 * M }))
      .toMatch(/^incomplete debt carrying value: annual interest expense .* implies 78\.4%/);
  });

  it("accepts ordinary rates, immaterial interest and missing interest", () => {
    expect(implausibleDebtReason({ annualInterestExpense: 1_186.7 * M, financingDebt: 29_289 * M, priorFinancingDebt: 28_000 * M, totalAssets: 71_000 * M })).toBeNull();
    expect(implausibleDebtReason({ annualInterestExpense: 8.3 * M, financingDebt: 0, priorFinancingDebt: null, totalAssets: 9_000 * M })).toBeNull();
    expect(implausibleDebtReason({ annualInterestExpense: null, financingDebt: 10 * M, priorFinancingDebt: null, totalAssets: null })).toBeNull();
    // A debt repaid during the year: the opening balance carried the interest.
    expect(implausibleDebtReason({ annualInterestExpense: 40 * M, financingDebt: 50 * M, priorFinancingDebt: 600 * M, totalAssets: 2_000 * M })).toBeNull();
  });

  it("does not judge resolved debt of zero, whose interest can come without borrowing", () => {
    expect(implausibleDebtReason({ annualInterestExpense: 40 * M, financingDebt: 0, priorFinancingDebt: 0, totalAssets: 2_000 * M })).toBeNull();
  });
});

const USD = ["USD", "USD", "USD", "USD"] as const;

describe("Stage B withholds implausible debt before any consumer reads it", () => {
  it("drops total and net debt, and EV, when interest implies a rate above 25%", () => {
    // 15 of annual interest (16 trailing) on 50 of debt is 30%.
    const out = runStageB(currencyBundle({ debt: 50, siblingQuarterCurrencies: USD }));
    expect(out.valuation.multiples?.enterpriseValue.value ?? null).toBeNull();
    expect(out.gaps.some((gap) => /statements\.balance\.2026-03-31\.totalDebt/.test(gap.field) && /implies 30.0%/.test(gap.reason))).toBe(true);
  });

  it("withholds the long-term component too, which the forensic leverage tests read on its own", () => {
    const bundle = currencyBundle({ debt: 50, siblingQuarterCurrencies: USD });
    for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
      const statement = bundle.statements[key];
      if (!statement.ok) throw new Error("fixture has balances");
      for (const row of statement.value.data.rows) row.longTermDebt = row.totalDebt;
    }
    const out = runStageB(bundle);
    for (const date of ["2025-12-31", "2026-03-31"]) {
      expect(out.gaps.some((gap) => gap.field === `statements.balance.${date}.longTermDebt` && /implies 30.0%/.test(gap.reason))).toBe(true);
    }
  });

  const rowsOf = (bundle: DataBundle, key: "incomeAnnual" | "incomeQuarterly" | "balanceAnnual") => {
    const statement = bundle.statements[key];
    if (!statement.ok) throw new Error("fixture has rows");
    return statement.value.data.rows as unknown as Record<string, unknown>[];
  };
  const judged = (out: ReturnType<typeof runStageB>, date: string) =>
    out.gaps.filter((gap) => gap.field === `statements.balance.${date}.totalDebt` && /on resolved financing debt/.test(gap.reason)).map((gap) => gap.reason);

  it("reads a zero annual interest as undisclosed, so the trailing quarters still judge the debt", () => {
    // 16 of trailing interest on 50 of debt is 32%; FMP's 0 must not win the smaller-basis choice.
    const bundle = currencyBundle({ debt: 50, siblingQuarterCurrencies: USD });
    for (const row of rowsOf(bundle, "incomeAnnual")) row.interestExpense = 0;
    expect(judged(runStageB(bundle), "2026-03-31").join()).toMatch(/implies 32\.0%/);
  });

  it("joins quarterly interest across a few days of fiscal-date drift", () => {
    const bundle = currencyBundle({ debt: 50, siblingQuarterCurrencies: USD });
    for (const row of rowsOf(bundle, "incomeAnnual")) row.interestExpense = null;
    for (const row of rowsOf(bundle, "incomeQuarterly")) row.date = new Date(Date.parse(String(row.date)) - 2 * 86_400_000).toISOString().slice(0, 10);
    expect(judged(runStageB(bundle), "2026-03-31").join()).toMatch(/implies 32\.0%/);
  });

  it("judges a year's interest against the debt its quarterly balances carried", () => {
    // Year-end debt of 50 against 15 of interest is 30%, but the quarters of
    // FY2025 carried 300, which explains it. FY2024 has no quarters in the bundle.
    const bundle = currencyBundle({ debt: 300, siblingQuarterCurrencies: USD });
    for (const row of rowsOf(bundle, "balanceAnnual")) { row.totalDebt = 50 * M; row.netDebt = -10 * M; }
    const out = runStageB(bundle);
    expect(judged(out, "2025-12-31")).toEqual([]);
    expect(judged(out, "2024-12-31").join()).toMatch(/implies 30\.0%/);
  });

  it("leaves ordinary debt alone", () => {
    const out = runStageB(currencyBundle({ siblingQuarterCurrencies: USD }));
    expect(out.gaps.some((gap) => /implies .* on resolved financing debt/.test(gap.reason))).toBe(false);
    expect(out.valuation.multiples?.enterpriseValue.value).not.toBeNull();
  });
});
