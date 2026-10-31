import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { computeFinancialMetrics } from "@/pipeline/stageB/financialMetrics";
import type { CompanyFacts } from "@/edgar/xbrl";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

function bankBundle(duplicate: boolean, opts: { stripRecency?: boolean; incomeDuplicate?: boolean } = {}) {
  const b = completeCurrencyBundle({ bank: true, symbol: "BNKR", sic: "6021" });
  // The synthetic restatement is available by acquisition, unlike the older probe's July date.
  b.builtAt = "2026-10-27T00:00:00.000Z";
  if (!b.statements.balanceAnnual.ok || !b.statements.incomeAnnual.ok) throw new Error("annual fixture required");
  const rows = b.statements.balanceAnnual.value.data.rows;
  const original = { ...rows[0]!, totalAssets: 10_000 * M, totalLiabilities: 9_500 * M,
    acceptedDate: "2026-02-15 16:00:00", filingDate: "2026-02-15" };
  const restated = { ...original, totalStockholdersEquity: 700 * M, totalEquity: 700 * M, totalLiabilities: 9_300 * M,
    acceptedDate: "2026-08-01 16:00:00", filingDate: "2026-08-01" };
  const prior = { ...rows[1]!, totalAssets: 9_500 * M, totalLiabilities: 9_050 * M,
    acceptedDate: "2025-02-15 16:00:00", filingDate: "2025-02-15" };
  b.statements.balanceAnnual.value.data.rows = duplicate ? [original, restated, prior] : [restated, prior];
  if (opts.incomeDuplicate) {
    const income = b.statements.incomeAnnual.value.data.rows;
    const old = { ...income[0]!, netInterestIncome: 100 * M, acceptedDate: "2026-02-15 16:00:00", filingDate: "2026-02-15" };
    const latest = { ...old, netInterestIncome: 200 * M, acceptedDate: "2026-08-01 16:00:00", filingDate: "2026-08-01" };
    b.statements.incomeAnnual.value.data.rows = [...(duplicate ? [old, latest] : [latest]), ...income.slice(1)];
  }
  if (opts.stripRecency) for (const result of [b.statements.balanceAnnual, b.statements.incomeAnnual]) {
    for (const row of result.value.data.rows) { delete row.acceptedDate; delete row.filingDate; }
  }
  const point = (end: string, val: number) => ({ end, val, accn: "0000000001-26-000001", form: "10-K", filed: "2026-02-15", fy: 2025, fp: "FY" });
  return withIssuerFacts(b, { cik: 1, entityName: "Synthetic bank", facts: { "us-gaap": {
    Deposits: { units: { USD: [point("2025-12-31", 8_000 * M), point("2024-12-31", 7_600 * M)] } },
    FinancingReceivableExcludingAccruedInterestBeforeAllowanceForCreditLoss: { units: { USD: [point("2025-12-31", 6_000 * M), point("2024-12-31", 5_600 * M)] } },
    FinancingReceivableExcludingAccruedInterestAllowanceForCreditLossWriteoffAfterRecovery: { units: { USD: [{ ...point("2025-12-31", 29 * M), start: "2025-01-01" }] } },
  } } } as unknown as CompanyFacts);
}
const bankRun = (duplicate: boolean, opts?: Parameters<typeof bankBundle>[1]) => runStageB(bankBundle(duplicate, opts), { evIncludeLeases: false });
const metric = (r: ReturnType<typeof runStageB>, key: string) => r.financialMetrics.metrics.find(m => m.key === key);

describe("FIN-122: financial metrics use the provably latest annual filing", () => {
  it("duplicate FY2025 balances produce the restated-only metrics and grade", () => {
    const dup = bankRun(true), ref = bankRun(false);
    expect(metric(dup, "tangibleLeverage")!.value).toBeCloseTo(metric(ref, "tangibleLeverage")!.value!, 6);
    expect(metric(dup, "ncoToAverageLoans")!.value).toBeCloseTo(0.5, 6);
    expect(dup.scores.aspects.balanceSheet.score).toBeCloseTo(ref.scores.aspects.balanceSheet.score!, 6);
    expect(dup.financialMetrics.notes.join(" ")).toMatch(/1 restated\/duplicate annual balance period collapsed to the latest filing/);
  });
  it("duplicate income uses its own latest filing, without positional selection", () => {
    const dup = bankRun(true, { incomeDuplicate: true }), ref = bankRun(false, { incomeDuplicate: true });
    expect(metric(ref, "niiToAverageAssets")!.value).not.toBeNull();
    expect(metric(dup, "niiToAverageAssets")!.value).toBeCloseTo(metric(ref, "niiToAverageAssets")!.value!, 6);
    expect(dup.financialMetrics.notes.join(" ")).toMatch(/1 restated\/duplicate annual income period collapsed to the latest filing/);
  });
  it("drops ambiguous periods with a warning, without claiming a latest filing was selected", () => {
    const amb = bankRun(true, { stripRecency: true, incomeDuplicate: true });
    for (const statement of ["balance", "income"]) expect(amb.financialMetrics.gaps.some(g =>
      g.field === `financialMetrics.${statement}.period` && g.severity === "warn" && /2025-12-31.*ambiguous/.test(g.reason))).toBe(true);
    expect(amb.financialMetrics.notes.join(" ")).not.toMatch(/collapsed to the latest filing/);
  });
  it("the capital adapter preserves filing recency so its duplicate collapses too", () => {
    const dup = bankRun(true);
    expect(dup.capital.gaps.some(g => g.field === "capital.balance.period")).toBe(false);
    expect(dup.capital.notes.join(" ")).toMatch(/restated\/duplicate annual balance period collapsed/);
  });
  it("control: a restated-only bank keeps its exact ratios", () => {
    const ref = bankRun(false);
    expect(ref.route.base).toBe("bank");
    expect(metric(ref, "tangibleLeverage")!.value).toBeCloseTo(650 / 9950 * 100, 10);
    expect(metric(ref, "ncoToAverageLoans")!.value).toBe(0.5);
    expect(ref.financialMetrics.gaps.some(g => /period/.test(g.field))).toBe(false);
  });
  it("normalization preserves caller rows and independently selected share input", () => {
    const b = bankBundle(true);
    if (!b.statements.balanceAnnual.ok || !b.statements.incomeAnnual.ok) throw new Error("annual fixture required");
    const dated = <T extends { date?: string }>(row: T) => {
      if (!row.date) throw new Error("dated fixture row required");
      return { ...row, date: row.date };
    };
    const inputs = { companyFacts: b.edgar.companyFacts, balance: b.statements.balanceAnnual.value.data.rows.map(dated),
      income: b.statements.incomeAnnual.value.data.rows.map(dated), shares: 123 * M, sharesBasis: "independently selected test shares" };
    const before = JSON.stringify(inputs);
    const result = computeFinancialMetrics("reit-mortgage", inputs);
    expect(result.notes.join(" ")).toMatch(/collapsed to the latest filing/);
    expect(result.metrics.find(m => m.key === "bookValuePerShare")!.value).toBe(700 / 123);
    expect(result.metrics.find(m => m.key === "bookValuePerShare")!.basis).toContain("independently selected test shares");
    expect(JSON.stringify(inputs)).toBe(before);
  });
  it("does not raise financial-row warnings on a general route that consumes no financial metrics", () => {
    const duplicate = [{ date: "2025-12-31", totalAssets: 100 }, { date: "2025-12-31", totalAssets: 200 }];
    const r = computeFinancialMetrics("general", { companyFacts: null, balance: duplicate, income: [] });
    expect(r.metrics).toEqual([]);
    expect(r.gaps).toEqual([]);
    expect(r.notes).toEqual([]);
  });
});
