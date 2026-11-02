import { describe, expect, it } from "vitest";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { buildSyntheticRouteBundle, runResearchRoutePanel } from "./helpers/researchRoutePanel";
import { M } from "./helpers/currencyBundle";

function panel() {
  const bundle = buildSyntheticRouteBundle("bank");
  if (!bundle.statements.incomeQuarterly.ok) throw new Error("fixture income required");
  for (const [i, row] of bundle.statements.incomeQuarterly.value.data.rows.slice(0, 4).entries()) {
    delete row.epsDiluted;
    row.netIncomeAvailableToCommon = [38, 27, 19, 16][i]! * M;
    row.fieldProvenance = { ...row.fieldProvenance, netIncomeAvailableToCommon: {
      source: "edgar", unit: "USD", periodStart: ["2026-01-01", "2025-10-01", "2025-07-01", "2025-04-01"][i]!,
      periodEnd: String(row.date), observedAt: bundle.builtAt,
      tags: ["us-gaap/NetIncomeLossAvailableToCommonStockholdersBasic"],
      filings: [{ accn: `fictional-${i}`, filed: i === 0 ? "2026-05-01" : "2026-02-20", form: i === 1 ? "10-K" : "10-Q" }],
      ...(i === 1 ? { derivation: "fy-minus-ytd" as const } : {}),
    } };
  }
  return { bundle, ...runResearchRoutePanel(bundle) };
}

describe("aggregate P/E common-income bridge", () => {
  it("shows the selected denominator and four filed quarters beside the multiple on all report surfaces", () => {
    const { computed, surfaces } = panel();
    if (computed.valuation.kind === "pre-revenue") throw new Error("fixture valuation required");
    const pe = computed.valuation.multiples.multiples.find(m => m.key === "peTtm")!;
    expect(pe.current).toBeGreaterThan(0);
    // Integration review (R6): the basis is the reader's table cell, so the
    // bridge reads as amounts, quarters, derivation and filing dates - no raw
    // digits, XBRL tag names or accession numbers.
    const bridge = "Common income 100M USD, TTM ended 2026-03-31 = 16M (quarter ended 2025-06-30; 10-Q filed 2026-02-20) + " +
      "19M (quarter ended 2025-09-30; 10-Q filed 2026-02-20) + 27M (quarter ended 2025-12-31; fiscal year less nine months; 10-K filed 2026-02-20) + " +
      "38M (quarter ended 2026-03-31; 10-Q filed 2026-05-01).";
    expect(pe.basis).toContain(bridge);
    expect(pe.basis).not.toMatch(/\d{7,} USD|us-gaap\/|fictional-\d/);
    for (const surface of Object.values(surfaces)) expect(surface).toContain("27M (quarter ended 2025-12-31; fiscal year less nine months; 10-K filed 2026-02-20)");
    expect(pe.basis).toContain("participating-security allocations");
    expect(pe.basis).toContain("no second preferred or NCI deduction");
  });

  it("registers denominator and quarter amounts as citable payload figures", () => {
    const { bundle, computed, validation } = panel();
    const p = assembleContextPayload(bundle, computed, validation);
    const figures = p.computed.flatMap(s => s.figures);
    expect(figures.find(f => f.label === "P/E common-income denominator")).toMatchObject({ value: 100000000, currency: "USD" });
    expect(figures.filter(f => f.label.startsWith("P/E common-income quarter"))).toHaveLength(4);
    expect(figures.find(f => f.label === "P/E common-income quarter ended 2025-12-31")).toMatchObject({ value: 27000000, period: "2025-12-31" });
  });
});
