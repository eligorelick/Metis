import { describe, expect, it } from "vitest";
import { assembleContextPayload, reverseDcfContextFigures } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import type { RevenueAnchor } from "@/pipeline/stageB/valuation";
import { metricLabel } from "@/report/presentation";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function anchorWith(evidence: Partial<NonNullable<RevenueAnchor["evidence"]>>): RevenueAnchor {
  return { source: "guidance", yearOneRevenue: 850e9, yearOneGrowthPct: 11, yearTwoGrowthPct: 8, runRate: null, clampedFrom: null, basis: "",
    evidence: { guidedRunRate: null, guidedPacePct: null, guidedYoyPct: null, guidedFloor: null, guidedSeasonalFactor: null,
      consensusYearOne: 860e9, consensusYearTwo: 900e9, nearTermRateUsed: false, ...evidence } };
}

describe("like-for-like reverse-DCF context (D136/R2)", () => {
  it("gives the guided YoY and keeps base, consensus and latest-quarter comparisons", () => {
    const rows = reverseDcfContextFigures(anchorWith({ guidedYoyPct: 10.7294, guidedPacePct: -2.1871, guidedRunRate: 800e9 }), 767.4e9, "2026-09-30");
    expect(rows.find(r => r.source === "computed.valuation.reverseDcfContext.guidedYoy")).toMatchObject({ value: 10.7294, label: "guided-quarter revenue growth, year over year" });
    expect(rows.find(r => r.source === "computed.valuation.reverseDcfContext.consensusYearOne")!.value).toBeCloseTo((860 / 767.4 - 1) * 100);
    expect(rows.find(r => r.source.endsWith("baseYearOne"))!.value).toBe(11);
    expect(rows.some(r => /run-rate|sequential|× 4/.test(r.label))).toBe(false);
  });
  it("sends no sequential substitute when no year-ago quarter exists", () => {
    const rows = reverseDcfContextFigures(anchorWith({ guidedPacePct: 58.72 }), 302.97e9, "2026-07-26");
    expect(rows.some(r => /run-rate|sequential|× 4/.test(r.label))).toBe(false);
    expect(rows.find(r => r.source.endsWith("guidedYoy"))).toBeUndefined();
    expect(reverseDcfContextFigures(undefined, null, null)).toEqual([]);
  });
  it("names the guided YoY in the assembled context note", () => {
    const bundle = completeCurrencyBundle({});
    const computed = runStageB(bundle);
    if (computed.valuation.kind !== "dcf" || !computed.valuation.assumptions || !computed.valuation.reverseDcf) throw new Error("DCF fixture");
    computed.valuation.reverseDcf.impliedRevenueGrowthPct = 12;
    computed.valuation.assumptions.revenueAnchor = anchorWith({ guidedYoyPct: 10.7294 });
    const section = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] }).computed.find(s => s.title === "Valuation (computed)")!;
    const note = section.notes.find(n => n.startsWith("Reverse-DCF context"))!;
    expect(note).toMatch(/the guided quarter's year-over-year growth/);
    expect(note).not.toMatch(/guided run-rate/);
    expect(section.figures.find(r => r.source.endsWith("guidedYoy"))!.value).toBe(10.7294);
  });
  it("labels the new registry id and preserves both D67 stored-report labels", () => {
    expect(metricLabel("computed.valuation.guided-quarter-revenue-growth-year-over-year")).toBe("Guided-quarter revenue growth, year over year");
    expect(metricLabel("computed.valuation.guided-run-rate-growth-over-ttm-next-quarter-guidance-4")).toBe("Guided run-rate growth over TTM (next-quarter guidance × 4)");
    expect(metricLabel("computed.valuation.guided-sequential-pace-annualized")).toBe("Guided sequential pace, annualized");
  });
});
