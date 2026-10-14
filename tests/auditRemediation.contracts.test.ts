import { describe, expect, it } from "vitest";
import { ExecutiveSchema, ProjectionPointSchema, ProvenanceCoverageSchema, VerificationLogEntrySchema } from "@/report/schema";

describe("audit evidence and period contracts", () => {
  it("allows an explicit unassessed executive without inventing a neutral grade", () => {
    const parsed = ExecutiveSchema.safeParse({ name: "Example Officer", title: "CFO", tenureYears: null, grade: "not-assessed", credibilityGrade: "not-assessed", assessmentReason: "No attributable execution or guidance record in the evidence.", reasoning: [], evidence: {} });
    expect(parsed.success).toBe(true);
  });

  it("preserves exact rolling forecast period identity", () => {
    const point = { period: "NTM ending 2027-06-30", periodStart: "2026-07-01", periodEnd: "2027-06-30", periodBasis: "rolling-12-month", value: { value: 100, unit: "currency", currency: "USD", source: "computed.forecast", asOf: "2026-10-14", verified: true } };
    expect(ProjectionPointSchema.safeParse(point).success).toBe(true);
    expect(ProjectionPointSchema.safeParse({ ...point, periodStart: "2027-07-01" }).success).toBe(false);
  });

  it("keeps cited evidence distinct from numeric validation with source spans", () => {
    const result = VerificationLogEntrySchema.safeParse({ claim: "Margin was 99%", outcome: "unverified", validationStatus: "contradicted", sourceSpans: [{ source: "edgar:10-Q item2", asOf: "2026-06-30", start: 0, end: 15, text: "Margin was 31%." }] });
    expect(result.success).toBe(true);
  });

  it("rejects impossible factual validation summaries", () => {
    const cited = { numeric: { supported: 0, total: 0, rate: null }, factualClaims: { supported: 2, total: 2, rate: 1 }, judgments: { cited: 0, total: 0, rate: null } };
    const validation = { cited: 2, validated: 1, unchecked: 0, contradicted: 1, total: 2, rate: 0.5 };
    expect(ProvenanceCoverageSchema.safeParse({ ...cited, factualValidation: validation }).success).toBe(true);
    expect(ProvenanceCoverageSchema.safeParse({ ...cited, factualValidation: { ...validation, validated: 2 } }).success).toBe(false);
  });
});
