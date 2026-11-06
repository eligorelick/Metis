import { describe, expect, it } from "vitest";
import * as assessment from "@/report/assessment";
import { runStageB } from "@/pipeline/compute";
import { ScoreAspectSchema, judgeOutputToJsonSchema, type GradeBlock, type Scoring } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { currentValuationUseFixture, unavailableValuationUseFixture } from "./helpers/valuationUse";
import { task28SentinelReport } from "./helpers/task28Report";

function fullyObserved(): Scoring {
  const scores = structuredClone(runStageB(completeCurrencyBundle({})).scores);
  for (const key of ScoreAspectSchema.options) Object.assign(scores.aspects[key], {
    score: 75, band: "B", weightPct: 100 / 7, dataCompleteness: 1, applicableCompleteness: 1, signals: [], notApplicableReason: null,
  });
  scores.composite.score = 75; scores.composite.band = "B";
  for (const key of ScoreAspectSchema.options) scores.composite.weights[key] = 100 / 7;
  if (scores.assessments) scores.assessments.evidenceCompleteness = 1;
  delete scores.qualification;
  return scores;
}
const qualify = (scores: Scoring, use = currentValuationUseFixture()) =>
  assessment.withAssessmentQualification(scores, { valuationUse: use, financialEvidence: [] });
const block = (): GradeBlock => ({ grade: "B", confidence: "high", oneLineWhy: "Recorded assessment", reasons: [], caveats: [] } as unknown as GradeBlock);

describe("deterministic score-neutral qualification", () => {
  it("annotates a clone without changing any score, band, signal, weight or source byte", () => {
    const source = fullyObserved(), before = JSON.stringify(source), result = qualify(source);
    expect(result.qualification?.composite).toEqual({ status: "supported", reasons: [] });
    expect(result).not.toBe(source);
    const numeric = structuredClone(result); delete numeric.qualification;
    expect(JSON.stringify(numeric)).toBe(before); expect(JSON.stringify(source)).toBe(before);
  });
  it("labels an improved grade provisional when adverse valuation evidence disappears", () => {
    const bundle = completeCurrencyBundle({});
    if (!bundle.quote.ok) throw Error("fixture quote");
    bundle.quote.value.data.rows[0]!.timestamp = Date.parse("2026-07-05T20:00:00Z") / 1000;
    const before = runStageB(bundle);
    const missing = structuredClone(bundle);
    if (!missing.quote.ok) throw Error("fixture quote");
    delete missing.quote.value.data.rows[0]!.timestamp;
    const after = runStageB(missing);
    expect(after.scores.composite.score!).toBeGreaterThan(before.scores.composite.score!);
    const annotated = qualify(after.scores, after.fairValue.currentUse!);
    expect(annotated.composite).toEqual(after.scores.composite);
    expect(annotated.qualification?.composite.status).toBe("provisional");
    expect(annotated.qualification?.composite.reasons.some(r => r.code === "current-valuation-unavailable")).toBe(true);
  });
  it("qualifies missing weighted evidence but ignores zero-weight and route-inapplicable aspects", () => {
    for (const excluded of [false, "zero", "route"] as const) {
      const scores = fullyObserved(), aspect = scores.aspects.valuation;
      Object.assign(aspect, { score: null, band: null, dataCompleteness: 0, applicableCompleteness: excluded === "route" ? null : 0 });
      if (excluded === "zero") scores.composite.weights.valuation = 0;
      const result = qualify(scores);
      expect(result.qualification?.composite.status).toBe(excluded ? "supported" : "provisional");
      expect(result.qualification?.aspects.valuation.status).toBe(excluded ? "not-applicable" : "provisional");
    }
  });
  it("does not treat 75 percent multi-signal evidence alone as provisional", () => {
    const scores = fullyObserved();
    Object.assign(scores.aspects.quality, { dataCompleteness: .75, applicableCompleteness: .75, signals: [{}, {}] });
    expect(qualify(scores).qualification?.composite.status).toBe("supported");
  });
  it("retains the single partial signal limit and the stronger grade withhold", () => {
    const scores = fullyObserved();
    Object.assign(scores.aspects.quality, { dataCompleteness: .75, applicableCompleteness: .75, signals: [{}] });
    const qualified = qualify(scores), report = task28SentinelReport(); report.scores = qualified;
    const view = assessment.applyReportAssessmentStatus(report);
    expect(qualified.qualification?.aspects.quality.status).toBe("provisional");
    expect(assessment.gradeForDisplay(view.verdict.gradeStrip.quality)).toBeNull();
  });
  it("preserves the 0.4999 evidence floor", () => {
    const scores = fullyObserved(); scores.assessments!.evidenceCompleteness = .4999;
    expect(assessment.compositeDisplayForReader(qualify(scores, unavailableValuationUseFixture)).grade).toBeNull();
  });
  it("distinguishes deliberate route policy from missing current valuation", () => {
    const scores = fullyObserved();
    expect(qualify(scores, { ...unavailableValuationUseFixture, status: "not-applicable", reason: "route-policy" }).qualification?.composite.status).toBe("supported");
    expect(qualify(scores, unavailableValuationUseFixture).qualification?.aspects.valuation.status).toBe("provisional");
  });
  it("uses structured critical blockers and the selected WACC operand, never warning prose", () => {
    const gaps = [{ field: "returns.wacc.beta", severity: "critical" as const, reason: "Exact source refusal" },
      { field: "valuation.dcf", severity: "critical" as const, reason: "Expected route", expected: true },
      { field: "statements.old", severity: "info" as const, reason: "unverified consolidated operating scope" }];
    const evidence = { status: "unverified-derivation" as const, asOf: "2025-12-31", field: "statements.income.2025-12-31.waccOperatingIncome", usedInDiscountRate: false };
    const plain = assessment.financialEvidenceQualifications(gaps, evidence);
    expect(plain).toHaveLength(1); expect(plain[0]?.detail).toBe("Exact source refusal");
    const used = assessment.financialEvidenceQualifications(gaps, { ...evidence, usedInDiscountRate: true });
    const result = assessment.withAssessmentQualification(fullyObserved(), { valuationUse: currentValuationUseFixture(), financialEvidence: used });
    expect(result.qualification?.aspects.quality.reasons.some(r => r.code === "selected-operating-scope-unverified")).toBe(true);
    expect(result.qualification?.aspects.technicals.status).toBe("supported");
  });
  it("shows provisional status and reasons without replacing the raw eligible grade", () => {
    const scores = qualify(fullyObserved(), unavailableValuationUseFixture), report = task28SentinelReport(); report.scores = scores;
    const view = assessment.applyReportAssessmentStatus(report), grade = { ...block(), qualification: scores.qualification!.aspects.valuation };
    expect(view.verdict.gradeStrip.valuation.qualification).toEqual(scores.qualification!.aspects.valuation);
    expect(view.valuation.graded.qualification).toEqual(scores.qualification!.aspects.valuation);
    expect(assessment.gradeForDisplay(grade)).toBe("B");
    expect(assessment.gradeDisplayLabel(grade)).toBe("B — Provisional");
    expect(assessment.compositeDisplayForReader(scores).label).toBe("B — Provisional");
    expect(assessment.compositeNote(scores)).toMatch(/current valuation/i);
    expect(JSON.stringify(judgeOutputToJsonSchema())).not.toContain('"qualification"');
  });
  it("marks absent legacy qualification unknown without changing recorded scores", () => {
    const report = task28SentinelReport(); report.scores = fullyObserved();
    const before = JSON.stringify(report), view = assessment.applyReportAssessmentStatus(report);
    expect(view.verdict.gradeStrip.valuation.qualification?.status).toBe("unknown");
    expect(assessment.gradeDisplayLabel(view.verdict.gradeStrip.valuation)).toContain("Qualification unknown");
    expect(view.scores?.composite).toEqual(report.scores.composite); expect(JSON.stringify(report)).toBe(before);
  });
});
