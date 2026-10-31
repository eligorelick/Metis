import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

describe("B5 period scaling with B6 annual-revenue refusal", () => {
  it.each([true, false])("keeps period scaling and annual refusal independent (estimates=%s)", estimates => {
    const bundle = completeCurrencyBundle({ estimates });
    bundle.builtAt = "2026-10-27T00:00:00.000Z";
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("quarterly fixture required");
    bundle.statements.incomeQuarterly.value.data.rows = [
      ["2026-09-03", "2026-05-29", 140e6], ["2026-05-28", "2026-02-27", 100e6],
      ["2026-02-26", "2025-11-28", 100e6], ["2025-11-27", "2025-08-29", 100e6],
      ["2025-08-28", "2025-05-30", 100e6],
    ].map(([date, start, revenue]) => ({ date: String(date), revenue: Number(revenue),
      operatingIncome: Number(revenue) * .2, grossProfit: Number(revenue) * .4,
      incomeBeforeTax: Number(revenue) * .18, incomeTaxExpense: Number(revenue) * .04,
      netIncome: Number(revenue) * .14, reportedCurrency: "USD", weightedAverageShsOutDil: 100e6,
      fieldProvenance: { revenue: { source: "edgar", unit: "USD", periodStart: String(start),
        periodEnd: String(date), observedAt: "2026-10-01T00:00:00.000Z", tags: ["Revenues"], filings: [] } },
    }));
    const bytes = JSON.stringify(bundle);
    const clean = runStageB(bundle, { evIncludeLeases: false });
    const refused = runStageB(bundle, { evIncludeLeases: false }, { checks: [{
      id: "xbrlCrossCheck.revenue.FY.2025-12-31", name: "Revenue cross-check", status: "fail", detail: "unreconciled annual definitions",
    }], flags: [], gaps: [] });
    for (const [name, result] of [["clean", clean], ...(estimates ? [["refused", refused] as const] : [])] as const) {
      if (result.valuation.kind !== "dcf") throw new Error("industrial DCF fixture");
      expect(result.valuation.assumptions, `${name}: ${JSON.stringify(result.valuation.gaps)}`).not.toBeNull();
      expect(result.valuation.assumptions!.startRevenue.value).toBe(440e6 * 52 / 53);
      expect(result.valuation.assumptions!.revenueAnchor!.runRate!.latestQuarterAnnualized).toBe(520e6);
    }
    if (!estimates) {
      if (refused.valuation.kind !== "dcf") throw new Error("industrial DCF fixture");
      expect(refused.valuation.assumptions).toBeNull();
      expect(refused.valuation.gaps.some(g => g.field === "valuation.dcf.nearTermGrowth" && g.severity === "critical")).toBe(true);
    }
    expect(clean.projections.series.find(s => s.metric === "revenue")).toBeDefined();
    const refusedRevenue = refused.projections.series.find(s => s.metric === "revenue");
    expect(refusedRevenue?.historical.filter(p => p.value !== null) ?? []).toEqual([]);
    expect(refused.financialMetrics).toEqual(clean.financialMetrics);
    expect(refused.capital.current).toEqual(clean.capital.current);
    expect(refused.growth.fcfCagrs).toEqual(clean.growth.fcfCagrs);
    expect(JSON.stringify(bundle)).toBe(bytes);
  });
});
