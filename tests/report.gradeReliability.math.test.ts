import { describe, expect, it } from "vitest";
import { attributeGradeReliability } from "@/report/gradeReliability";

describe("attribute missing-input sensitivity", () => {
  it("does not cross a grade boundary because of arithmetic machine-precision tails", () => {
    expect(attributeGradeReliability({ score: 75, applicableCompleteness: 11 / 15, notApplicableReason: null })).toMatchObject({ status: "available", lowBand: "C" });
    expect(attributeGradeReliability({ score: 35, applicableCompleteness: 12 / 13, notApplicableReason: null })).toMatchObject({ status: "available", highBand: "D" });
    expect(attributeGradeReliability({ score: 54.9995, applicableCompleteness: 1, notApplicableReason: null })).toMatchObject({ status: "available", lowBand: "D", highBand: "D" });
  });
  it.each([
    { score: 80, coverage: .5, lowBand: "D", highBand: "A" },
    { score: 80, coverage: 0, lowBand: "F", highBand: "A" },
    { score: 39.999, coverage: 1, lowBand: "F", highBand: "F" },
    { score: 40, coverage: 1, lowBand: "D", highBand: "D" },
    { score: 54.999, coverage: 1, lowBand: "D", highBand: "D" },
    { score: 55, coverage: 1, lowBand: "C", highBand: "C" },
    { score: 69.999, coverage: 1, lowBand: "C", highBand: "C" },
    { score: 70, coverage: 1, lowBand: "B", highBand: "B" },
    { score: 84.999, coverage: 1, lowBand: "B", highBand: "B" },
    { score: 85, coverage: 1, lowBand: "A", highBand: "A" },
    { score: 9.999, coverage: .5, lowBand: "F", highBand: "D" },
    { score: 10, coverage: .5, lowBand: "F", highBand: "C" },
  ])("maps exact endpoints to conditional $lowBand–$highBand bands for score $score at coverage $coverage", ({ score, coverage, lowBand, highBand }) => {
    expect(attributeGradeReliability({ score, applicableCompleteness: coverage, notApplicableReason: null })).toMatchObject({ status: "available", lowBand, highBand });
  });

  it.each([
    { score: 80, coverage: .5, low: 40, high: 90 },
    { score: 80, coverage: 1, low: 80, high: 80 },
    { score: 80, coverage: 0, low: 0, high: 100 },
    { score: 25, coverage: .8, low: 20, high: 40 },
    { score: 0, coverage: .25, low: 0, high: 75 },
    { score: 100, coverage: .25, low: 25, high: 100 },
  ])("bounds score $score with coverage $coverage at $low–$high", ({ score, coverage, low, high }) => {
    const result = attributeGradeReliability({ score, applicableCompleteness: coverage, notApplicableReason: null });
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Expected a numerical sensitivity");
    expect(result.low).toBeCloseTo(low, 12);
    expect(result.high).toBeCloseTo(high, 12);
  });

  it("excludes route-suppressed inputs by using applicable coverage rather than legacy total coverage", () => {
    const aspect = { score: 80, applicableCompleteness: 1, dataCompleteness: .25, notApplicableReason: null };
    const before = structuredClone(aspect);
    expect(attributeGradeReliability(aspect)).toMatchObject({ status: "available", low: 80, high: 80 });
    expect(aspect).toEqual(before);
  });

  it("never infers legacy applicable coverage from total evidence", () => {
    expect(attributeGradeReliability({ score: 80, dataCompleteness: 1, notApplicableReason: null } as Parameters<typeof attributeGradeReliability>[0])).toEqual({ status: "unavailable", reason: "unknown-coverage" });
  });

  it("withholds route-inapplicable and unscored attributes even if other values look complete", () => {
    expect(attributeGradeReliability({ score: 80, applicableCompleteness: null, notApplicableReason: null })).toEqual({ status: "unavailable", reason: "route-inapplicable" });
    expect(attributeGradeReliability({ score: null, applicableCompleteness: 1, notApplicableReason: null })).toEqual({ status: "unavailable", reason: "unscored" });
  });

  it("does not read applicable data-gap prose as a route exclusion", () => {
    expect(attributeGradeReliability({ score: null, applicableCompleteness: 0, notApplicableReason: "applicable signals unavailable (data gap) — aspect not scored" })).toEqual({ status: "unavailable", reason: "unscored" });
    expect(attributeGradeReliability({ score: 80, notApplicableReason: "Legacy reason with no route coverage" })).toEqual({ status: "unavailable", reason: "unknown-coverage" });
  });

  it.each([NaN, Infinity, -.1, 1.1])("rejects malformed recorded coverage %s without clamping it", applicableCompleteness => {
    expect(attributeGradeReliability({ score: 80, applicableCompleteness, notApplicableReason: null })).toEqual({ status: "unavailable", reason: "invalid-coverage" });
  });

  it.each([NaN, Infinity, -1, 101])("rejects malformed recorded score %s", score => {
    expect(attributeGradeReliability({ score, applicableCompleteness: .5, notApplicableReason: null })).toEqual({ status: "unavailable", reason: "invalid-score" });
  });
});
