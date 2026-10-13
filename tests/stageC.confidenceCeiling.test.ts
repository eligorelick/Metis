import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GradeReasoning } from "@/components/report/primitives";
import { applyConfidenceCeilings, confidenceCeilingFor } from "@/pipeline/stageC/confidenceCeiling";
import { ReportSchema } from "@/report/schema";
import { task28SentinelReport } from "./helpers/task28Report";

// D-50: the rule table (minimum wins) and its application to the report.
describe("confidence ceiling (D-50)", () => {
  it("applies the rule table and lowers only labels above the ceiling", () => {
    const report = task28SentinelReport();
    const aspects = report.scores!.aspects;
    aspects.fundamentals = { ...aspects.fundamentals, score: 70, band: "B", dataCompleteness: 1 };
    aspects.quality = { ...aspects.quality, score: 70, band: "B", dataCompleteness: 0.6 };
    aspects.leadership = { ...aspects.leadership, score: 70, band: "B", dataCompleteness: 0.4 };
    aspects.moat = { ...aspects.moat, score: null, band: null, dataCompleteness: 0 };
    aspects.valuation = { ...aspects.valuation, score: 70, band: "B", dataCompleteness: 1 };
    report.fairValue = report.fairValue && { ...report.fairValue, status: "suppressed", method: null, perShare: null };

    expect(confidenceCeilingFor("fundamentals", report)).toEqual({ ceiling: "high", reason: null });
    expect(confidenceCeilingFor("quality", report).ceiling).toBe("medium");
    expect(confidenceCeilingFor("leadership", report).ceiling).toBe("low");
    expect(confidenceCeilingFor("moat", report).ceiling).toBe("low");
    if (report.fairValue) expect(confidenceCeilingFor("valuation", report).ceiling).toBe("medium");
    // A legacy report without deterministic scores has nothing measured to cap with.
    expect(confidenceCeilingFor("quality", { ...report, scores: undefined }).ceiling).toBe("high");

    report.fundamentals.graded = { ...report.fundamentals.graded, confidence: "high" };
    report.quality.graded = { ...report.quality.graded, confidence: "high" };
    report.leadership.graded = { ...report.leadership.graded, confidence: "low" };
    report.competitive.moatGraded = {
      ...report.competitive.moatGraded,
      confidence: "medium",
      // A model-emitted cap is pipeline-owned and recomputed.
      confidenceCap: { from: "high", to: "medium", reason: "forged" },
    };
    const capped = applyConfidenceCeilings(report);

    expect(capped.fundamentals.graded.confidence).toBe("high");
    expect(capped.fundamentals.graded.confidenceCap).toBeUndefined();
    expect(capped.quality.graded.confidence).toBe("medium");
    expect(capped.quality.graded.confidenceCap).toMatchObject({ from: "high", to: "medium" });
    expect(capped.leadership.graded.confidence).toBe("low"); // lower model label kept
    expect(capped.leadership.graded.confidenceCap).toBeUndefined();
    expect(capped.competitive.moatGraded.confidence).toBe("low");
    expect(capped.competitive.moatGraded.confidenceCap?.reason).toBe("the deterministic moat score is unscored");
    // Idempotent: re-assembly keeps the model's original label as `from`.
    expect(applyConfidenceCeilings(capped).quality.graded).toEqual(capped.quality.graded);
    expect(ReportSchema.safeParse(capped).success).toBe(true);
    // Input untouched; reports stored without the field still parse.
    expect(report.quality.graded.confidence).toBe("high");
    expect(ReportSchema.safeParse(task28SentinelReport()).success).toBe(true);

    const html = renderToStaticMarkup(createElement(GradeReasoning, { title: "Quality", block: capped.quality.graded }));
    expect(html).toContain("Confidence capped at medium: the deterministic quality score rests on under three quarters of its intended inputs");
  });
});
