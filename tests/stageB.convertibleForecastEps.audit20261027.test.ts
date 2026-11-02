import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { computeProjections, interestRunRate } from "@/pipeline/stageB/projections";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";

function project(reading: "claim" | "converted" | "unresolved", rate: number | null = 4) {
  const computed = runStageB(completeCurrencyBundle({ debt: 300 }));
  const v = computed.valuation;
  if (v.kind !== "dcf" || !v.dcf) throw new Error("fixture DCF");
  v.dcf.bridge.dilutedShares = (reading === "claim" ? 90 : 100) * M;
  v.dcf.bridge.convertibles = [{ kind: "notes", claim: 50 * M, conversionShares: 10 * M,
    reading, sharesRemoved: reading === "claim" ? 10 * M : 0, restored: reading === "converted" ? 50 * M : 0, basis: "filed" }];
  const projections = computeProjections({
    route: computed.route, valuation: v, waccPct: v.assumptions!.wacc.value, dilutedShares: 100 * M,
    incomeHistory: [2021,2022,2023,2024,2025].map(y => ({ date: `${y}-12-31`, revenue: 1000 * M, ebit: 300 * M, netIncome: 200 * M, epsDiluted: 2, interestExpense: 20 * M })),
    fcfHistory: [], shareCountAnnualizedPct: null, currency: "USD", asOf: "2026-07-06",
    interestRunRate: { value: 20 * M, ratePct: rate, basis: "filed effective debt rate" },
  });
  const eps = projections.series.find(s => s.metric === "epsDiluted")!;
  return { eps, rows: v.dcf.yearRows };
}

describe("FIN-302-V2: forecast EPS inherits the convertible reading", () => {
  it("the claim reading uses the valuation divisor in years one and five", () => {
    const { eps, rows } = project("claim");
    for (const i of [0, 4]) expect(eps.base[i].value.value).toBeCloseTo((rows[i].ebit - 20 * M) * (1 - rows[i].taxRatePct / 100) / (90 * M), 2);
  });
  it("converted notes remove interest on only the restored claim", () => {
    const { eps, rows } = project("converted");
    for (const i of [0, 4]) expect(eps.base[i].value.value).toBeCloseTo((rows[i].ebit - 18 * M) * (1 - rows[i].taxRatePct / 100) / (100 * M), 2);
    expect(eps.assumptions.join(" ")).toMatch(/convertible notes treated as converted/);
  });
  it("without an evidenced rate converted interest is retained and disclosed", () => {
    const { eps, rows } = project("converted", null);
    expect(eps.base[0].value.value).toBeCloseTo((rows[0].ebit - 20 * M) * (1 - rows[0].taxRatePct / 100) / (100 * M), 2);
    expect(eps.assumptions.join(" ")).toMatch(/interest retained.*rate.*unavailable/i);
  });
  it("unresolved notes retain both count and interest", () => {
    const { eps, rows } = project("unresolved");
    expect(eps.base[0].value.value).toBeCloseTo((rows[0].ebit - 20 * M) * (1 - rows[0].taxRatePct / 100) / (100 * M), 2);
  });
  it("returns the evidenced annual effective rate, and no invented rate on the fallback", () => {
    expect(interestRunRate({ date: "2026-03-31", interestExpense: 3 }, { date: "2026-03-31", debt: 300 }, { date: "2025-12-31", debt: 300 })?.ratePct).toBe(4);
    expect(interestRunRate({ date: "2026-03-31", interestExpense: 3 }, null, null)?.ratePct).toBeNull();
  });
});
