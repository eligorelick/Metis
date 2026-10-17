import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import { pickBalanceAnchor, runStageB } from "@/pipeline/compute";
import { currencyBundle, M } from "./helpers/currencyBundle";

function balances(scope: "restricted-cash" | "unknown-parent") {
  const dates = [{ end: "2025-12-31", filed: "2026-02-01", form: "10-K", accn: "0000000001-26-000001", fp: "FY" },
    { end: "2026-06-30", filed: "2026-08-01", form: "10-Q", accn: "0000000001-26-000002", fp: "Q2" }];
  const concept = (value: number, periods = dates) => ({ units: { USD: periods.map(p => ({ ...p, val: value * M, fy: 2026 })) } });
  const input: CompanyFacts = { cik: 1, entityName: "Ordinary issuer", facts: { "us-gaap": {
    Assets: concept(2000), LongTermDebtNoncurrent: concept(300), ShortTermInvestments: concept(50),
    StockholdersEquity: concept(100, scope === "unknown-parent" ? dates.slice(0, 1) : dates),
    CashAndCashEquivalentsAtCarryingValue: concept(100, scope === "restricted-cash" ? dates.slice(0, 1) : dates),
    ...(scope === "restricted-cash" ? { CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: concept(900, dates.slice(1)) }
      : { StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: concept(130, dates.slice(1)) }),
  } } };
  return buildStatementsFromCompanyFacts(input, { symbol: "TEST", cik: "0000000001", asOf: "2026-10-16", annualPeriods: 1, quarterlyPeriods: 1,
    vendorSplits: { status: "retrieved", source: "test", events: [], coverage: [{ from: "2020-01-01", to: "2026-10-16" }] } });
}

describe("parser refusals survive mixed quarterly and annual balance anchors", () => {
  it.each(["restricted-cash", "unknown-parent"] as const)("preserves the current %s limitation through Stage B", scope => {
    const built = balances(scope);
    const current = built.balanceQuarterly.rows[0]!;
    const annual = built.balanceAnnual.rows[0]!;
    expect(annual.cashAndShortTermInvestments).toBe(150 * M);
    expect(annual.totalStockholdersEquity).toBe(100 * M);
    expect(pickBalanceAnchor(current, annual)).toMatchObject({ row: current, basis: "quarter", fallback: null });
    const bundle = currencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    if (!bundle.statements.balanceAnnual.ok || !bundle.statements.balanceQuarterly.ok) throw new Error("missing fixture balances");
    bundle.statements.balanceAnnual.value.data.rows = [annual];
    bundle.statements.balanceQuarterly.value.data.rows = [current];
    if (bundle.statements.incomeQuarterly.ok) bundle.statements.incomeQuarterly.value.data.rows[0]!.date = "2026-06-30";
    if (bundle.statements.cashflowQuarterly.ok) bundle.statements.cashflowQuarterly.value.data.rows[0]!.date = "2026-06-30";
    const result = runStageB(bundle);
    expect(result.valuation.multiples?.enterpriseValue.value ?? null).toBeNull();
    if (scope === "unknown-parent") {
      expect(result.valuation.multiples?.multiples.find(row => row.key === "priceToBook")?.current ?? null).toBeNull();
      expect(result.valuation.gaps.some(g => /noncontrollingOwnership/.test(g.field))).toBe(true);
    }
    if (result.valuation.kind === "dcf") expect(result.valuation.dcf?.perShare ?? null).toBeNull();
    expect(result.valuation.gaps.some(g => /balance anchor.*lacks/.test(g.reason))).toBe(false);
  });
});
