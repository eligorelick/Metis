import { describe, expect, it } from "vitest";
import { alignProjectionScenarios } from "@/pipeline/stageB/scenarioAlignment";
import type { Projections, ScenarioTargets } from "@/report/schema";

function projections(): Projections {
  const point = (scenario: string, value: number) => ({ period: "FY2027", value: { value, unit: "USD", asOf: "2026-10-13", source: `computed.projections.revenue.${scenario}`, verified: true } });
  return { horizonYears: 1, weightsVersion: "TEST", notApplicableReason: null, scenarioWeights: { bull: .3, base: .5, bear: .2 }, series: [{ metric: "revenue", unit: "USD", historical: [], bull: [point("bull", 120)], base: [point("base", 100)], bear: [point("bear", 80)], weighted: [point("weighted", 102)], assumptions: [], disclosures: [] }] };
}
function targets(inverted: boolean): ScenarioTargets {
  return { status: "available", targets: [{ name: "bull", growthDeltaPp: inverted ? -3 : 3 }, { name: "bear", growthDeltaPp: inverted ? 3 : -3 }] } as unknown as ScenarioTargets;
}
describe("scenario label alignment", () => {
  it("aligns paths and weights to value-ordered targets without changing the model or weighted projection", () => {
    const before = projections();
    const aligned = alignProjectionScenarios(before, targets(true));
    expect(aligned.series[0].bull[0].value.value).toBe(80);
    expect(aligned.series[0].bear[0].value.value).toBe(120);
    expect(aligned.series[0].bull[0].value.source).toBe("computed.projections.revenue.bull");
    expect(aligned.series[0].bear[0].value.source).toBe("computed.projections.revenue.bear");
    expect(aligned.scenarioWeights).toEqual({ bull: .2, base: .5, bear: .3 });
    expect(aligned.series[0].weighted).toEqual(before.series[0].weighted);
    expect(aligned.series[0].base).toEqual(before.series[0].base);
    expect(before.series[0].bull[0].value.value).toBe(120);
    expect(aligned.series[0].disclosures[0].reason).toContain("value");
  });
  it("leaves ordinary and suppressed target cases unchanged", () => {
    const input = projections();
    expect(alignProjectionScenarios(input, targets(false))).toEqual(input);
    expect(alignProjectionScenarios(input, { status: "suppressed" } as ScenarioTargets)).toEqual(input);
  });
  it("does not swap already-aligned paths a second time", () => {
    const aligned = alignProjectionScenarios(projections(), targets(true));
    expect(alignProjectionScenarios(aligned, targets(true))).toEqual(aligned);
  });
});
