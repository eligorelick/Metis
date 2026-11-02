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
    expect(pe.basis).toContain("denominator 100000000 USD");
    for (const [date, value] of [["2025-06-30", 16000000], ["2025-09-30", 19000000], ["2025-12-31", 27000000], ["2026-03-31", 38000000]]) {
      expect(pe.basis).toContain(`${date}: ${value} USD`);
      for (const surface of Object.values(surfaces)) expect(surface).toContain(`${date}: ${value} USD`);
    }
    expect(pe.basis).toContain("fy-minus-ytd");
    expect(pe.basis).toContain("10-K fictional-1, filed 2026-02-20");
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
