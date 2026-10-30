import { describe, expect, it } from "vitest";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { buildSyntheticRouteBundle, runResearchRoutePanel } from "./helpers/researchRoutePanel";

describe("FIN-106/310 financial route metric dates", () => {
  it("dates insurer P/TBV rows and writer figures at the tangible-equity balance", () => {
    const bundle = buildSyntheticRouteBundle("insurer");
    const { computed, report, validation } = runResearchRoutePanel(bundle);
    const date = computed.returns.rote!.asOf;
    expect(date).toBe("2025-12-31");
    for (const key of ["pTbv", "justifiedPTbv", "premiumToJustified"]) {
      expect(report.routeMetrics!.metrics.find(m => m.key === key)!.asOf).toBe(date);
    }
    const figures = assembleContextPayload(bundle, computed, validation).computed.flatMap(s => s.figures ?? []);
    expect(figures.find(f => f.label === "P/TBV")?.asOf).toBe(date);
    const row = report.routeMetrics!.metrics.find(m => m.key === "pTbv")!;
    expect(row.basis).toContain(`tangible common equity at ${date}`);
    expect(row.value).toBe(25);
  });

  it("dates and sources the bank ROTE row from its trailing return window", () => {
    const bundle = buildSyntheticRouteBundle("bank");
    const { computed, report, validation } = runResearchRoutePanel(bundle);
    expect(computed.returns.commonReturnTtm!.asOf).toBe("2026-03-31");
    const row = report.routeMetrics!.metrics.find(m => m.key === "rote")!;
    expect(row.asOf).toBe(computed.returns.commonReturnTtm!.asOf);
    expect(row.sources).toEqual(["computed.returns.commonReturnTtm"]);
    expect(row.value).toBe(40.476190476190474);
    const figure = assembleContextPayload(bundle, computed, validation).computed.flatMap(s => s.figures ?? []).find(f => f.label === "ROTE (the return P/TBV is read against)");
    expect(figure).toMatchObject({ asOf: "2026-03-31", source: "computed.returns.commonReturnTtm", value: 40.476190476190474 });
  });

  it("preserves the bank P/TBV value, agreement with multiples and block header date", () => {
    const { computed, report } = runResearchRoutePanel(buildSyntheticRouteBundle("bank"));
    const value = report.routeMetrics!.metrics.find(m => m.key === "pTbv")!.value;
    expect(value).toBe(23.80952380952381);
    expect(value).toBe(computed.valuation.multiples!.multiples.find(m => m.key === "priceToTbv")!.current);
    expect(report.routeMetrics!.asOf).toBe("2026-03-31");
  });
});
