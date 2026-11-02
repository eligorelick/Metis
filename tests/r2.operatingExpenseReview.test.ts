import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import type { DataBundle } from "@/pipeline/types";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

/**
 * Integration review of R2 (FIGR paid audit, trend opex). R2 withheld every
 * provider operating-expense amount without a filed OperatingExpenses total.
 * On the owner's six saved real-data snapshots that removed 10-34 amounts per
 * issuer (QCOM 34 -> 0, AMZN 34 -> 0, NVDA 34 -> 5, META 10 -> 0) and added one
 * appendix gap each, although the provider amount equals gross profit less
 * operating income on 31 of 34 QCOM, 33 of 34 NVDA and 33 of 34 AMZN rows. A
 * provider amount that bridges its own row's gross profit to its operating
 * income is a complete total on that row's operating basis; one that does not
 * (FIGR Q1 2026 after the filed operating income replaced the provider's
 * pre-interest numerator) is withheld.
 */
function providerBundle(): DataBundle {
  const b = completeCurrencyBundle({});
  if (!b.statements.incomeQuarterly.ok || !b.statements.incomeAnnual.ok) throw new Error("fixture income required");
  for (const row of [...b.statements.incomeQuarterly.value.data.rows, ...b.statements.incomeAnnual.value.data.rows]) {
    const revenue = row.revenue as number, operatingIncome = row.operatingIncome as number;
    row.grossProfit = Math.round(revenue * 0.6);
    row.operatingExpenses = row.grossProfit - operatingIncome;
  }
  return b;
}
const quarterly = (b: DataBundle) => {
  if (!b.statements.incomeQuarterly.ok) throw new Error("fixture income required");
  return b.statements.incomeQuarterly.value.data.rows;
};
const annual = (b: DataBundle) => {
  if (!b.statements.incomeAnnual.ok) throw new Error("fixture income required");
  return b.statements.incomeAnnual.value.data.rows;
};

describe("R2 review: operating expenses on a stated basis", () => {
  it("keeps a provider amount that bridges its row's gross profit to its operating income", () => {
    const b = providerBundle();
    const expected = quarterly(b).map(r => r.operatingExpenses);
    const after = withIncomeOperatingBasis(b);
    expect(quarterly(after).map(r => r.operatingExpenses)).toEqual(expected);
    expect(after.gaps.filter(g => g.field.endsWith(".operatingExpenses"))).toEqual([]);
  });

  it("withholds a provider amount that does not bridge them, saying why", () => {
    const b = providerBundle();
    const row = quarterly(b)[1]!;
    row.operatingExpenses = (row.operatingExpenses as number) + Math.round((row.revenue as number) * 0.05);
    const after = withIncomeOperatingBasis(b);
    expect(quarterly(after)[1]!.operatingExpenses).toBeUndefined();
    expect(quarterly(after)[0]!.operatingExpenses).toBe(quarterly(b)[0]!.operatingExpenses);
    const gaps = after.gaps.filter(g => g.field.endsWith(".operatingExpenses"));
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.reason).toMatch(/^Operating expenses for \d{4}-\d{2}-\d{2} withheld: .*does not bridge.*gross profit.*operating income.*basis/);
  });

  it("shows provider amounts in the trend with their basis stated once", () => {
    const b = providerBundle();
    const d = buildFilingDisclosures(b)!;
    expect(d.quarterlyTrend.length).toBeGreaterThan(0);
    for (const row of d.quarterlyTrend) expect(row.operatingExpenses).toBe(quarterly(b).find(r => r.date === row.periodEnd)!.operatingExpenses);
    expect(d.notes.filter(n => n.includes("provider's subtotal"))).toHaveLength(1);
  });

  it("withholds provider cells, with one note, when the shown quarters mix rows built from SEC filings", () => {
    const b = providerBundle();
    const rows = quarterly(b);
    for (const row of rows.slice(0, 2)) { row.source = "edgar"; delete row.operatingExpenses; }
    const d = buildFilingDisclosures(b)!;
    expect(d.quarterlyTrend.every(row => row.operatingExpenses === null)).toBe(true);
    const mixed = d.notes.filter(n => n.startsWith("Operating expenses not shown for "));
    expect(mixed).toHaveLength(1);
    expect(mixed[0]).toContain("mix rows built from SEC filings");
    expect(d.notes.some(n => n.includes("provider's subtotal"))).toBe(false);
  });

  it("notes only the shown quarters' withheld amounts, not annual rows on the same dates", () => {
    const b = providerBundle();
    const fy = annual(b)[0]!;
    fy.operatingExpenses = (fy.operatingExpenses as number) + Math.round((fy.revenue as number) * 0.05);
    const d = buildFilingDisclosures(b)!;
    expect(d.notes.filter(n => /^Operating expenses for .* withheld/.test(n))).toEqual([]);
    expect(withIncomeOperatingBasis(b).gaps.filter(g => g.field.endsWith(".operatingExpenses"))).toHaveLength(1);
  });
});
