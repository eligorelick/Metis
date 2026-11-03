import { describe, expect, it } from "vitest";
import { runStageB, withFiscalYearEndBalance } from "@/pipeline/compute";
import type { ManifestEntry } from "@/types/core";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

// D-173. AAPL on 2026-11-02, hours after its 10-K: the provider's annual income and
// cash-flow feeds and its quarterly balance-sheet feed reached the year ended
// 2026-09-26, but the annual balance-sheet feed still ended at 2025-09-27, so the
// newest year had no balance sheet and Altman, Beneish, accruals and ROIC - WACC were
// withheld. The helper bundle's fiscal year ends 2025-12-31; its quarterly balance sheet
// has a row at that date. Provider rows carry their reporting currency and filing identity.
const LINKED = { balanceQuarterCurrencies: ["USD", "USD", "USD", "USD"], filingLinks: "shared" } as const;

function linkedBundle() {
  const bundle = completeCurrencyBundle(LINKED);
  const s = bundle.statements;
  if (!s.balanceAnnual.ok || !s.balanceQuarterly.ok || !s.incomeAnnual.ok) throw new Error("fixture requires statements");
  const closing = s.balanceQuarterly.value.data.rows.find(row => row.date === "2025-12-31");
  const income = s.incomeAnnual.value.data.rows.find(row => row.date === "2025-12-31");
  if (!closing || !income) throw new Error("fixture requires 2025-12-31 rows");
  // The 10-K carries the year's income statement and its closing balance sheet.
  Object.assign(income, { cik: closing.cik, acceptedDate: closing.acceptedDate });
  return { bundle, closing };
}

function laggingAnnualBalance() {
  const { bundle, closing } = linkedBundle();
  if (!bundle.statements.balanceAnnual.ok) throw new Error("fixture");
  bundle.statements.balanceAnnual.value.data.rows = bundle.statements.balanceAnnual.value.data.rows.filter(row => row.date !== "2025-12-31");
  return { bundle, closing };
}

const FIELD = "compute.balanceAnnual.fiscalYearEnd";
const row = (date: string, extra: Record<string, unknown> = {}) =>
  ({ date, reportedCurrency: "USD", acceptedDate: `${date.slice(0, 4)}-02-01 16:05:00`, totalAssets: 1, ...extra });

describe("fiscal-year-end balance when the annual balance feed lags (D-173)", () => {
  it("uses the quarterly balance sheet the annual income row's filing carries", () => {
    const computed = runStageB(laggingAnnualBalance().bundle);
    expect(computed.returns.roic.asOf).toBe("2025-12-31");
    expect(computed.forensics.gaps.some(gap => gap.field === "forensics.statementAlignment")).toBe(false);
    const fill = computed.gaps.find(gap => gap.field === FIELD);
    expect(fill).toMatchObject({ severity: "info" });
    expect(fill?.reason).toContain("2025-12-31");
  });

  it("matches the result of a complete annual feed with the same closing balance", () => {
    const lagging = runStageB(laggingAnnualBalance().bundle);
    const { bundle: complete, closing } = linkedBundle();
    if (!complete.statements.balanceAnnual.ok) throw new Error("fixture");
    complete.statements.balanceAnnual.value.data.rows = complete.statements.balanceAnnual.value.data.rows
      .map(annual => (annual.date === "2025-12-31" ? { ...closing } : annual));
    const reference = runStageB(complete);
    expect(reference.returns.roic.latestRoicPct).not.toBeNull();
    expect(lagging.returns.roic).toEqual(reference.returns.roic);
    expect(lagging.forensics.accruals).toEqual(reference.forensics.accruals);
    expect(lagging.forensics.piotroski).toEqual(reference.forensics.piotroski);
    expect(reference.gaps.some(gap => gap.field === FIELD)).toBe(false);
  });

  it("does not fill from another filing or an unlabelled row", () => {
    for (const change of [{ acceptedDate: "2026-02-20 16:05:00" }, { reportedCurrency: undefined }]) {
      const { bundle, closing } = laggingAnnualBalance();
      Object.assign(closing, change);
      expect(runStageB(bundle).gaps.some(gap => gap.field === FIELD)).toBe(false);
    }
  });

  it("leaves a complete, aliased or newer annual feed, and a missing closing quarter, untouched", () => {
    const annual = [row("2025-12-31"), row("2024-12-31", { totalAssets: 2 })];
    const quarterly = [row("2025-12-31", { totalAssets: 3 })];
    const gaps: ManifestEntry[] = [];
    expect(withFiscalYearEndBalance(annual, quarterly, [row("2025-12-31")], gaps)).toEqual(annual);
    expect(withFiscalYearEndBalance(annual, quarterly, [row("2024-12-31")], gaps)).toEqual(annual);
    expect(withFiscalYearEndBalance(annual.slice(1), [row("2025-09-30")], [row("2025-12-31")], gaps)).toEqual(annual.slice(1));
    expect(withFiscalYearEndBalance([], quarterly, [], gaps)).toEqual([]);
    // A 52/53-week alias dated a few days before the income period end is the same fiscal year.
    const alias = [row("2025-12-28", { totalAssets: 6 })];
    expect(withFiscalYearEndBalance(alias, quarterly, [row("2025-12-31")], gaps)).toEqual(alias);
    expect(withFiscalYearEndBalance(annual.slice(1), [row("2025-12-31", { reportedCurrency: "EUR" })], [row("2025-12-31")], gaps))
      .toEqual(annual.slice(1));
    expect(gaps).toEqual([]);
  });

  it("fills only the exact closing date, newest first, and says so once", () => {
    const gaps: ManifestEntry[] = [];
    const closing = row("2025-12-31", { totalAssets: 3 });
    const filled = withFiscalYearEndBalance([row("2024-12-31", { totalAssets: 2 })], [row("2026-03-31", { totalAssets: 5 }), closing],
      [row("2024-12-31"), row("2025-12-31")], gaps);
    expect(filled).toEqual([closing, row("2024-12-31", { totalAssets: 2 })]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ field: FIELD, severity: "info" });
  });
});
