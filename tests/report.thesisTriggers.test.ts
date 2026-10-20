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

  // AMZN audit 2026-10-20 finding 10: the price implied a 52.3% terminal margin
  // against a 12.1% base, and the report printed "Supported terminal operating
  // margin: below 52.30%" — a condition the base case already met.
  it("points the reverse threshold away from the base case", () => {
    const data = computed();
    if (data.valuation.kind !== "dcf") throw new Error("fixture");
    Object.assign(data.valuation.assumptions!, { growthPath: { value: [7, 5, 3], basis: "" }, ebitMarginPath: { value: [12.08, 12.08, 12.08], basis: "" } });
    data.valuation.reverseDcf = { method: "margin", impliedRevenueGrowthPct: null, impliedTerminalMarginPct: 52.3, notes: [], gaps: [] };
    const [rich] = buildThesisTriggers(data);
    expect(rich.comparator).toBe("above");
    expect(rich.consequence).toMatch(/terminal margin above this price-implied threshold/);
    data.valuation.reverseDcf = { method: "margin", impliedRevenueGrowthPct: null, impliedTerminalMarginPct: 8, notes: [], gaps: [] };
    expect(buildThesisTriggers(data)[0].comparator).toBe("below");
    data.valuation.reverseDcf = { method: "growth", impliedRevenueGrowthPct: 20, baseRevenueGrowthPct: 7, impliedTerminalMarginPct: null, notes: [], gaps: [] };
    const [growth] = buildThesisTriggers(data);
    expect(growth.comparator).toBe("above");
    expect(growth.consequence).toMatch(/point above this price-implied level/);
    data.valuation.reverseDcf.impliedRevenueGrowthPct = 4;
    expect(buildThesisTriggers(data)[0].comparator).toBe("below");
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

  it("suppresses monetary milestones without established currency and suppressed projections", () => {
    const data = computed({ projections: { notApplicableReason: null, series: [{ metric: "revenue", base: [{ period: "2027", value: { value: 125, unit: "currency", source: "x", asOf: null } }] }] } });
    expect(buildThesisTriggers(data).map((t) => t.id)).toEqual(["reverse-growth"]);
    data.projections.notApplicableReason = "thin evidence";
    expect(buildThesisTriggers(data).map((t) => t.id)).toEqual(["reverse-growth"]);
  });

  // Re-pinned for D-60: the first-year projection milestones restated the base path, so they are dropped.
  it("drops projection milestones that only restate the base path", () => {
    const trace = { value: 125000000, unit: "USD", currency: "USD", source: "computed.projections.revenue.base", asOf: "2026-10-13" };
    const data = computed({ projections: { notApplicableReason: null, series: [{ metric: "revenue", unit: "USD", base: [{ period: "12M ending 2027-06-30", periodStart: "2026-07-01", periodEnd: "2027-06-30", value: trace }] }] } });
    expect(buildThesisTriggers(data).map((t) => t.id)).toEqual(["reverse-growth"]);
  });

  it("adds observable checkpoints: the revenue the price implies and the guided quarter's low end", () => {
    const data = computed({ projections: { notApplicableReason: null, series: [{ metric: "revenue", unit: "USD", base: [] }] } });
    if (data.valuation.kind !== "dcf" || !data.valuation.assumptions) throw new Error("fixture");
    Object.assign(data.valuation.assumptions, {
      startRevenue: { value: 302.97e9, basis: "TTM" },
      forecastPeriod: { basis: "rolling-12-month", anchorEndDate: "2026-07-26", anchorStartDate: "2025-07-27" },
      revenueAnchor: { source: "consensus", yearOneRevenue: 551.81e9, yearOneGrowthPct: 82.1, yearTwoGrowthPct: 46.9, runRate: null, clampedFrom: null, basis: "",
        evidence: { guidedRunRate: 432e9, guidedPacePct: 58.7, consensusYearOne: 551.81e9, consensusYearTwo: 810.45e9, nearTermRateUsed: false,
          guidedQuarter: { periodEnd: "2026-10-25", revenueLow: 105.84e9, revenueMid: 108e9, grossMarginLowPct: 73.5, source: "sec:8-K EX-99.1 0001045810-26-000073", asOf: "2026-08-26" } } },
    });
    const triggers = buildThesisTriggers(data);
    const reverse = triggers.find((t) => t.id === "reverse-growth")!;
    // 302.97B × 1.0725: the first modeled year's revenue today's price requires.
    expect(reverse.horizon).toMatch(/equivalent to revenue of \$324\.94B for 12M ending 2027-07-26/);
    expect(reverse.horizon).toMatch(/consensus \$551\.81B/);
    const revenue = triggers.find((t) => t.id === "guided-quarter-revenue")!;
    expect(revenue.threshold).toMatchObject({ value: 105.84e9, unit: "USD", source: "sec:8-K EX-99.1 0001045810-26-000073" });
    expect(revenue.metric).toContain("2026-10-25");
    expect(triggers.find((t) => t.id === "guided-quarter-gross-margin")?.threshold).toMatchObject({ value: 73.5, unit: "%" });
  });
});
