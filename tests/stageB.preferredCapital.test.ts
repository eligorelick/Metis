import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { quarterlyOpeningBook } from "@/pipeline/stageB/excessReturnBook";
import { buildSyntheticRouteBundle } from "./helpers/researchRoutePanel";
import type { CompanyFacts } from "@/edgar/xbrl";

const M = 1e6;
type Fact = { tag: string; val: number; end?: string; unit?: string; filed?: string };
function fixture(evidence: Fact[], route: "general" | "insurer" = "insurer") {
  const b = buildSyntheticRouteBundle(route);
  for (const result of [b.statements.balanceAnnual, b.statements.balanceQuarterly]) {
    if (!result.ok) throw new Error("fixture");
    for (const row of result.value.data.rows) row.preferredStock = 0;
  }
  const concepts: Record<string, { units: Record<string, unknown[]> }> = {};
  for (const f of evidence) {
    const c = concepts[f.tag] ??= { units: {} };
    (c.units[f.unit ?? "USD"] ??= []).push({ end: f.end ?? "2026-03-31", val: f.val,
      filed: f.filed ?? "2026-05-01", form: "10-Q", accn: "0000000042-26-000002", fy: 2026, fp: "Q1" });
  }
  b.edgar.cik = { ok: true, value: { data: { cik: 42, cik10: "0000000042", ticker: b.symbol },
    source: "edgar", endpoint: "synthetic", asOf: b.builtAt, fetchedAt: b.builtAt } } as typeof b.edgar.cik;
  b.edgar.companyFacts = { ok: true, value: { data: { cik: 42, entityName: "Synthetic", facts: { "us-gaap": concepts } } as CompanyFacts,
    source: "edgar", endpoint: "synthetic", asOf: b.builtAt, fetchedAt: b.builtAt } };
  return b;
}
const outstanding: Fact = { tag: "PreferredStockSharesOutstanding", unit: "shares", val: 24_600_000 };

describe("zero par does not establish zero preferred capital", () => {
  it("withholds the latest common book, fair value and targets when only an older preference exists", () => {
    const c = runStageB(fixture([outstanding,
      { tag: "PreferredStockLiquidationPreferenceValue", val: 50 * M, end: "2025-12-31" }]));
    expect(c.fairValue.perShare).toBeNull();
    expect(c.scenarioTargets.targets).toHaveLength(0);
    if (c.valuation.kind !== "excess-return") throw new Error("fixture");
    expect(c.valuation.excessReturn.openingBookValue.value).toBeNull();
    expect(c.valuation.gaps.map(g => g.reason).join(" ")).toMatch(/preferred.*2026-03-31.*same.*date/i);
  });
  it("uses a same-date filed carrying amount before the liquidation preference", () => {
    const c = runStageB(fixture([outstanding,
      { tag: "PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount", val: 80 * M },
      { tag: "PreferredStockLiquidationPreferenceValue", val: 50 * M }]));
    if (c.valuation.kind !== "excess-return") throw new Error("fixture");
    expect(c.valuation.excessReturn.openingBookValue.value).toBe(440 * M);
    expect(c.valuation.excessReturn.openingBookValue.basis).toMatch(/filed carrying amount/i);
  });
  it("uses and labels a same-date liquidation preference when carrying capital is unavailable", () => {
    const c = runStageB(fixture([outstanding, { tag: "PreferredStockLiquidationPreferenceValue", val: 50 * M }]));
    if (c.valuation.kind !== "excess-return") throw new Error("fixture");
    expect(c.valuation.excessReturn.openingBookValue.value).toBe(470 * M);
    expect(c.valuation.excessReturn.openingBookValue.basis).toMatch(/liquidation preference.*2026-03-31/i);
  });
  it("keeps a true zero with no preferred outstanding available", () => {
    const c = runStageB(fixture([]));
    if (c.valuation.kind !== "excess-return") throw new Error("fixture");
    expect(c.fairValue.perShare?.value).toBeGreaterThan(0);
    expect(c.valuation.excessReturn.openingBookValue.value).toBe(520 * M);
  });
  it("treats filed preferred dividends as evidence even without a shares tag", () => {
    const c = runStageB(fixture([{ tag: "PaymentsOfDividendsPreferredStockAndPreferenceStock", val: M }]));
    expect(c.fairValue.perShare).toBeNull();
  });
  it("does not use a preference filed after cutoff or denominated in another currency", () => {
    for (const extra of [{ filed: "2026-08-01" }, { unit: "EUR" }]) {
      const c = runStageB(fixture([outstanding, { tag: "PreferredStockLiquidationPreferenceValue", val: 50 * M, ...extra }]));
      expect(c.fairValue.perShare).toBeNull();
    }
  });
  it("also withholds a non-financial DCF equity bridge with an unresolved zero-par claim", () => {
    const c = runStageB(fixture([outstanding], "general"));
    expect(c.fairValue.perShare).toBeNull();
    expect(c.valuation.gaps.map(g => g.reason).join(" ")).toMatch(/preferred.*same.*date/i);
  });
  it("makes quarterly admission itself refuse a zero line with positive preferred shares", () => {
    const result = quarterlyOpeningBook({ row: { date: "2026-03-31", filingDate: "2026-05-01", reportedCurrency: "USD",
      totalStockholdersEquity: 520 * M, preferredStock: 0, ...{ preferredStockSharesOutstanding: 24_600_000 } },
    annualAsOf: "2025-12-31", basis: "common-equity", currency: "USD", cutoff: "2026-07-06T00:00:00Z",
    shareRow: { date: "2026-03-31", filingDate: "2026-05-01", reportedCurrency: "USD" }, dilutedShares: 100 * M });
    expect(result).toHaveProperty("reason");
  });
});
