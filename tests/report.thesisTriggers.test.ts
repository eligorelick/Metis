import { describe, expect, it } from "vitest";
import type { ComputedMetrics } from "@/pipeline/compute";
import { buildThesisTriggers } from "@/report/thesisTriggers";

function computed(overrides: Record<string, unknown> = {}): Pick<ComputedMetrics, "valuation" | "projections"> {
  return {
    valuation: {
      kind: "dcf", dcf: { perShare: 110 }, assumptions: { years: 10 },
      reverseDcf: { method: "growth", impliedRevenueGrowthPct: 7.25, impliedTerminalMarginPct: null, notes: [] },
    },
    projections: { notApplicableReason: null, series: [] },
    ...overrides,
  } as unknown as Pick<ComputedMetrics, "valuation" | "projections">;
}

describe("model-derived thesis revision triggers", () => {
  it("describes a fading reverse solve as starting growth rather than constant growth", () => {
    const data = computed();
    if (data.valuation.kind !== "dcf" || !data.valuation.reverseDcf) throw new Error("fixture");
    data.valuation.reverseDcf.growthPathFamily = "linear-fade-to-terminal";
    const [trigger] = buildThesisTriggers(data);
    expect(trigger.metric).toContain("starting");
    expect(trigger.horizon).toContain("fade");
    expect(trigger.horizon).not.toContain("no fade");
  });

  it.each(["12M ending 2027-06-30", "FY2027 ending 2027-06-30"])("retains an annual milestone with its exact model window: %s", (label) => {
    const trace = { value: 125, unit: "USD", source: "computed.projections.revenue.base", asOf: "2026-10-13" };
    const data = computed({ projections: { notApplicableReason: null, series: [{ metric: "revenue", base: [{ period: label, periodStart: "2026-07-01", periodEnd: "2027-06-30", value: trace }] }] } });
    const trigger = buildThesisTriggers(data).find((t) => t.id === "projection-revenue");
    expect(trigger?.horizon).toContain("2026-07-01 through 2027-06-30");
    expect(trigger?.threshold.value).toBe(125);
    data.projections.series[0].base[0].periodEnd = "2027-07-01";
    expect(buildThesisTriggers(data).some(t => t.id === "projection-revenue")).toBe(false);
  });

  it("states the actual constant-growth reverse-DCF horizon and fixed assumptions", () => {
    const [trigger] = buildThesisTriggers(computed());
    expect(trigger.id).toBe("reverse-growth");
    expect(trigger.threshold.value).toBe(7.25);
    expect(trigger.threshold.source).toBe("computed.valuation.reverseDcf");
    expect(trigger.metric).toContain("constant annual revenue growth");
    expect(trigger.horizon).toContain("10");
    expect(trigger.fixedAssumptions.join(" ")).toMatch(/discount rate/i);
    expect(trigger.consequence).toMatch(/recompute|reassess/i);
    expect(trigger.consequence).not.toMatch(/buy|sell|price will/i);
  });

  it("uses the margin fallback as a terminal margin, never as next-quarter growth", () => {
    const data = computed();
    if (data.valuation.kind !== "dcf") throw new Error("fixture");
    data.valuation.reverseDcf = { method: "margin", impliedRevenueGrowthPct: null, impliedTerminalMarginPct: 22, notes: [], gaps: [] };
    const [trigger] = buildThesisTriggers(data);
    expect(trigger.id).toBe("reverse-margin");
    expect(trigger.metric).toContain("terminal operating margin");
    expect(trigger.threshold.value).toBe(22);
    expect(trigger.fixedAssumptions.join(" ")).toMatch(/growth path/i);
  });

  it("preserves an economically possible negative implied growth rate", () => {
    const data = computed();
    if (data.valuation.kind !== "dcf" || !data.valuation.reverseDcf) throw new Error("fixture");
    data.valuation.reverseDcf.impliedRevenueGrowthPct = -2;
    expect(buildThesisTriggers(data)[0].threshold.value).toBe(-2);
  });

  it("withholds absent, nonfinite and unsolved reverse thresholds", () => {
    const data = computed();
    if (data.valuation.kind !== "dcf" || !data.valuation.reverseDcf) throw new Error("fixture");
    data.valuation.reverseDcf.impliedRevenueGrowthPct = Number.NaN;
    expect(buildThesisTriggers(data)).toEqual([]);
    data.valuation.reverseDcf.method = "none";
    data.valuation.reverseDcf.impliedRevenueGrowthPct = 12;
    expect(buildThesisTriggers(data)).toEqual([]);
  });

  it("does not fabricate DCF triggers for financial or unsupported routes", () => {
    expect(buildThesisTriggers(computed({ valuation: { kind: "excess-return" } }))).toEqual([]);
    expect(buildThesisTriggers(computed({ valuation: { kind: "pre-revenue" } }))).toEqual([]);
  });

  it("copies first-year operating milestones with their exact source, date and currency", () => {
    const trace = { value: 125000000, unit: "USD", currency: "USD", source: "computed.projections.revenue.base", asOf: "2026-10-13", period: "2027", verified: true };
    const data = computed({ projections: { notApplicableReason: null, series: [{ metric: "revenue", base: [{ period: "2027", periodStart: "2026-04-01", periodEnd: "2027-03-31", value: trace }] }] } });
    const trigger = buildThesisTriggers(data).find((t) => t.id === "projection-revenue");
    expect(trigger?.threshold).toEqual(trace);
    expect(trigger?.threshold).not.toBe(trace);
    expect(trigger?.horizon).toContain("2027");
    expect(trigger?.horizon).toContain("2026-04-01 through 2027-03-31");
    expect(trigger?.consequence).toMatch(/forecast/i);
    expect(trigger?.consequence).toMatch(/review/i);
  });

  it("suppresses monetary milestones without established currency and suppressed projections", () => {
    const data = computed({ projections: { notApplicableReason: null, series: [{ metric: "revenue", base: [{ period: "2027", value: { value: 125, unit: "currency", source: "x", asOf: null } }] }] } });
    expect(buildThesisTriggers(data).map((t) => t.id)).toEqual(["reverse-growth"]);
    data.projections.notApplicableReason = "thin evidence";
    expect(buildThesisTriggers(data).map((t) => t.id)).toEqual(["reverse-growth"]);
  });

  it("uses the earliest valid first projection period and does not mutate inputs", () => {
    const trace = (value: number) => ({ value, unit: "%", source: "computed.projections.operatingMargin.base", asOf: null });
    const data = computed({ projections: { notApplicableReason: null, series: [{ metric: "operatingMargin", base: [{ period: "2028", value: trace(30) }, { period: "2027", value: trace(20) }] }] } });
    const before = JSON.stringify(data);
    const trigger = buildThesisTriggers(data).find((t) => t.id === "projection-operatingMargin");
    expect(trigger?.threshold.value).toBe(20);
    expect(JSON.stringify(data)).toBe(before);
  });

  it("accepts the production FY labels and currency carried by the unit", () => {
    const data = computed({ projections: { notApplicableReason: null, series: [{ metric: "revenue", base: [{ period: "FY2027", value: { value: 125000000, unit: "USD", source: "computed.projections.revenue.base", asOf: "2026-10-13" } }] }] } });
    const trigger = buildThesisTriggers(data).find((t) => t.id === "projection-revenue");
    expect(trigger?.threshold.value).toBe(125000000);
    expect(trigger?.horizon).toContain("FY2027");
  });
});
