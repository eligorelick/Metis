import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { filingDisclosureTables, isQuarterlyTrendNote } from "@/report/filingDisclosurePresentation";
import type { DataBundle } from "@/pipeline/types";
import type { FilingDisclosures } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

/**
 * Integration review of R2 + R3 (FIGR paid audit). The paid report printed every
 * filing note, including the quarterly cash-flow derivations, after the
 * "Management guidance" table. R3 moved the cash-flow notes to the quarterly
 * trend and gave the rest a "Management guidance notes" table, but the trend's
 * own notes (rejected or currency-cut rows, withheld operating amounts and R2's
 * operating-expense basis) still landed under guidance. A note about the
 * quarterly trend is read beside the trend, including when no row is shown.
 */
function providerBundle(): DataBundle {
  const b = completeCurrencyBundle({});
  if (!b.statements.incomeQuarterly.ok || !b.statements.incomeAnnual.ok) throw new Error("fixture income required");
  for (const row of [...b.statements.incomeQuarterly.value.data.rows, ...b.statements.incomeAnnual.value.data.rows]) {
    row.grossProfit = Math.round((row.revenue as number) * 0.6);
    row.operatingExpenses = row.grossProfit - (row.operatingIncome as number);
  }
  return b;
}
const tableText = (d: FilingDisclosures, section: "fundamentals" | "outlook") =>
  JSON.stringify(filingDisclosureTables(d, section));

describe("R2/R3 review: quarterly-trend notes sit with the trend", () => {
  it("shows a repeated stored filing limitation once while preserving distinct dated evidence", () => {
    const d = buildFilingDisclosures(providerBundle())!;
    const note = "Operating margin withheld: no corroborated bridge is available.";
    d.notes = [note, note, `${note} Period 2026-03-31.`, `${note} Period 2025-12-31.`];
    const before = JSON.stringify(d);
    const table = filingDisclosureTables(d, "catalystsRisks").find(t => t.heading === "Filing review limitations and notes")!;
    expect(table.rows).toEqual([[note], [`${note} Period 2026-03-31.`], [`${note} Period 2025-12-31.`]]);
    expect(JSON.stringify(d)).toBe(before);
  });
  it("names the trend's own notes and nothing else", () => {
    for (const note of [
      "Quarterly income trend: a row has no period end.",
      "Quarterly cash-flow trend: a row has no period end.",
      "Quarterly trend left out: the current income statement's reporting currency is not established.",
      "Quarterly trend history stops before 2024-03-31: its reporting currency is unknown or differs from current USD; no currency conversion is assumed.",
      "Quarterly cash-flow amounts for 2024-03-31 left out: reporting currency is unknown or differs from current USD.",
      "Quarterly operating cash flow for 2026-06-30 is derived (ytd-difference) from cumulative filed operands across filings.",
      "Operating income and operating margin for 2026-03-31 withheld: a common revenue/operating-income source, period and filed basis is not established.",
      "Operating expenses for 2026-03-31 withheld: the provider amount does not bridge the row's gross profit to its operating income.",
      "Operating expenses not shown for 2026-03-31, 2025-12-31: the quarters shown mix rows built from SEC filings with provider rows; one column cannot state one basis.",
      "Operating expenses are the provider's subtotal on its own rows (gross profit less operating income), not a filed total.",
    ]) expect(isQuarterlyTrendNote(note), note).toBe(true);
    for (const note of [
      "Quarterly dividend raised from 0.10 to 0.12 USD per share (8-K 0000000000-26-000001, filed 2026-02-01).",
      "No structured quarterly guidance rows were extracted from the retained releases; separately sourced narrative guidance may still be available.",
      "Remaining repurchase authorization is dated 2026-06-30, from 10-Q 0000000000-26-000002, filed 2026-08-01; authority is discretionary and does not establish funded future repurchases.",
    ]) expect(isQuarterlyTrendNote(note), note).toBe(false);
  });

  it("prints R2's operating-expense basis beside the trend, not under management guidance", () => {
    const d = buildFilingDisclosures(providerBundle())!;
    expect(d.notes.some(n => n.startsWith("Operating expenses are the provider's subtotal"))).toBe(true);
    expect(tableText(d, "fundamentals")).toContain("Operating expenses are the provider's subtotal");
    expect(tableText(d, "outlook")).not.toContain("Operating expenses are the provider's subtotal");
  });

  it("prints withheld and mixed-basis operating notes beside the trend", () => {
    const b = providerBundle();
    if (!b.statements.incomeQuarterly.ok) throw new Error("fixture income required");
    for (const row of b.statements.incomeQuarterly.value.data.rows.slice(0, 2)) { row.source = "edgar"; delete row.operatingExpenses; }
    const d = buildFilingDisclosures(b)!;
    const mixed = d.notes.find(n => n.startsWith("Operating expenses not shown for "));
    expect(mixed).toBeDefined();
    expect(tableText(d, "fundamentals")).toContain("Operating expenses not shown for ");
    expect(tableText(d, "outlook")).not.toContain("Operating expenses not shown for ");
  });

  // Final data-only FIGR run (2026-11-02): Q4 FY2024's revenue stays refused (N4b) and
  // R2 withholds its operating expenses, so the row printed a dash in every column.
  it("names a quarter with no shown value as missing instead of printing an empty row", () => {
    const d = buildFilingDisclosures(providerBundle())!;
    expect(d.quarterlyTrend.length).toBeGreaterThan(3);
    const empty = d.quarterlyTrend[2]!;
    Object.assign(empty, { revenue: null, revenueYoyPct: null, revenueQoqPct: null, grossMarginPct: null, operatingExpenses: null,
      operatingMarginPct: null, epsDiluted: null, operatingCashFlow: null, freeCashFlow: null, equitySecuritiesGains: null, nonGaapEpsDiluted: null });
    const trend = filingDisclosureTables(d, "fundamentals").find(t => t.heading.startsWith("Quarterly trend"))!;
    expect(trend.rows.map(r => r[0])).not.toContain(empty.periodEnd);
    expect(trend.rows).toHaveLength(d.quarterlyTrend.length - 1);
    expect(trend.note).toMatch(new RegExp(`Missing quarters? within the displayed window: [^.]*${empty.periodEnd}`));
    // A quarter with any shown value keeps its row.
    const partial = d.quarterlyTrend[1]!;
    Object.assign(partial, { revenue: null, revenueYoyPct: null, revenueQoqPct: null, operatingExpenses: null, epsDiluted: null });
    expect(filingDisclosureTables(d, "fundamentals").find(t => t.heading.startsWith("Quarterly trend"))!.rows.map(r => r[0])).toContain(partial.periodEnd);
  });

  it("keeps a trend note visible in its own section when no quarterly row is shown", () => {
    const d = buildFilingDisclosures(providerBundle())!;
    const empty: FilingDisclosures = { ...d, quarterlyTrend: [],
      notes: ["Quarterly trend left out: the current income statement's reporting currency is not established.", ...d.notes.filter(n => !isQuarterlyTrendNote(n))] };
    expect(tableText(empty, "fundamentals")).toContain("Quarterly trend left out");
    expect(tableText(empty, "outlook")).not.toContain("Quarterly trend left out");
  });
});
