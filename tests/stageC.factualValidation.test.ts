import { describe, expect, it } from "vitest";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import type { Leadership, SourcedClaim } from "@/report/schema";

const source = "edgar:10-Q item2";
const asOf = "2026-06-30";
function payload(text: string): ContextPayload {
  return {
    provenanceRegistry: [],
    citationRegistry: [{ id: source, asOf, origin: source, kind: "payload-text" }],
    filings: [{ source, asOf, text, title: "Quarterly review", truncated: false, originalChars: text.length }],
  } as unknown as ContextPayload;
}
async function verify(text: string, claim: string, overrides: Partial<ContextPayload> = {}) {
  return runVerifyPass({} as PassDeps, { ...payload(text), ...overrides }, {
    commentary: [{ label: "FACT", text: claim, source, asOf }],
  });
}

describe("factual prose numeric validation", () => {
  it("rejects the audit's 99 percent claim against a clearly bound 31 percent source", async () => {
    const result = await verify("Consolidated operating margin was 31%.", "Consolidated operating margin was 99%.");
    expect(result.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "contradicted", reason: "value-mismatch" });
    expect(result.coverage.factualClaims).toEqual({ supported: 1, total: 1, rate: 1 });
    expect(result.coverage.factualValidation).toEqual({ cited: 1, validated: 0, unchecked: 0, contradicted: 1, total: 1, rate: 0 });
    expect(result.log[0]?.sourceSpans?.[0]).toMatchObject({ source, asOf, text: "Consolidated operating margin was 31%." });
  });

  it("validates an unambiguous material figure and preserves its original source span", async () => {
    const text = "Revenue grew.\nConsolidated operating margin was 31%.\nOutlook remains uncertain.";
    const result = await verify(text, "Consolidated operating margin was 31%.");
    expect(result.log[0]).toMatchObject({ outcome: "verified", validationStatus: "validated" });
    expect(result.coverage.factualValidation?.validated).toBe(1);
    const span = result.log[0]?.sourceSpans?.[0];
    expect(span).toBeDefined();
    expect(text.slice(span!.start, span!.end)).toBe(span!.text);
    expect(span!.text).toContain("operating margin was 31%");
  });

  it("does not claim factual validation for citation-only qualitative prose or fetched URL numbers", async () => {
    const result = await verify("The company faces competition.", "The company faces competition.");
    expect(result.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "cited", traceKind: "source-cited" });
    expect(result.coverage.factualValidation?.unchecked).toBe(1);
    const web = await runVerifyPass({} as PassDeps, payload(""), {
      commentary: [{ label: "FACT", text: "Operating margin was 99%.", source: "https://example.com/release", asOf }],
    }, { fetchedUrls: ["https://example.com/release"] });
    expect(web.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "unchecked", traceKind: "source-cited" });
  });

  it.each([
    ["Operating margin was 31% in 2026 and 43% in 2025.", "Operating margin was 31% in 2025."],
    ["Operating margin was 31%; gross margin was 99%.", "Operating margin was 99%."],
    ["Operating margin was 31%, while gross margin was 99%.", "Operating margin was 99%."],
    ["Operating margin was 31% and 43% in the periods shown.", "Operating margin was 31%."],
    ["Revenue was EUR 31 billion.", "Revenue was USD 31 billion."],
    ["Revenue was $31 billion.", "Revenue was $31 billion."],
    ["Operating margin was 31%.", "Operating margin was 31% and net margin was 99%."],
  ])("never validates a period, metric, multi-number or currency ambiguity: %s", async (text, claim) => {
    const result = await verify(text, claim);
    expect(result.log[0]?.outcome).toBe("unverified");
    expect(result.coverage.factualValidation?.validated).toBe(0);
  });

  it("validates each number only against its own metric and period", async () => {
    const result = await verify(
      "Operating margin was 31% in 2026; operating margin was 43% in 2025.",
      "Operating margin was 31% in 2026; operating margin was 43% in 2025.",
    );
    expect(result.log[0]).toMatchObject({ outcome: "verified", validationStatus: "validated" });
    expect(result.log[0]?.sourceSpans).toHaveLength(2);
  });

  it("reads all numeric prose against a typed cited record rather than validating only the tag", async () => {
    const provenanceRegistry = [{ id: source, label: "Operating margin", kind: "provider" as const, value: 31, unit: "percent" as const,
      currency: null, period: "2026-06-30", asOf, origin: source, formulaVersion: null, displayPrecision: 2 }];
    const bad = await verify("", "Operating margin was 99%.", { provenanceRegistry });
    expect(bad.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "contradicted", reason: "value-mismatch" });
    const good = await verify("", "Operating margin was 31%.", { provenanceRegistry });
    expect(good.log[0]).toMatchObject({ outcome: "verified", validationStatus: "validated" });
    const extra = await verify("", "Operating margin was 31% and net margin was 99%.", { provenanceRegistry });
    expect(extra.log[0]?.outcome).toBe("unverified");
  });

  it("does not bind a number by borrowing the name of a different metric later in its clause", async () => {
    const result = await verify("Revenue was $99 billion, while operating margin was 31%.", "Revenue was 31%.");
    expect(result.log[0]?.outcome).toBe("unverified");
  });

  it("retains signed amounts and explicit currencies without inferring dollars", async () => {
    const correct = await verify("Operating income was EUR -31 billion.", "Operating income was EUR -31 billion.");
    expect(correct.log[0]?.outcome).toBe("verified");
    const wrong = await verify("Operating income was EUR -31 billion.", "Operating income was EUR 31 billion.");
    expect(wrong.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "contradicted" });
  });

  it("fails closed on a future date or an explicit quarter unsupported by a typed record", async () => {
    const result = await runVerifyPass({} as PassDeps, payload("Operating margin was 31%."), {
      commentary: [{ label: "FACT", text: "Operating margin was 31%.", source, asOf: "2026-07-01" }],
    });
    expect(result.log[0]).toMatchObject({ outcome: "unverified", reason: "date-mismatch" });
    const provenanceRegistry = [{ id: source, label: "Operating margin", kind: "provider" as const, value: 31, unit: "percent" as const,
      currency: null, period: "2026-06-30", asOf, origin: source, formulaVersion: null, displayPrecision: 2 }];
    const wrong = await verify("", "Q1 FY2026 operating margin was 31%.", { provenanceRegistry });
    expect(wrong.log[0]).toMatchObject({ outcome: "unverified", reason: "period-mismatch" });
  });

  it("never joins separated retained source passages into a synthetic numeric sentence", async () => {
    const sourceText = "Operating margin was ";
    const tail = "99%.";
    const excerpts = [{ source, asOf, text: sourceText + tail, title: "review", truncated: true, originalChars: 1000,
      spans: [{ start: 0, end: sourceText.length, text: sourceText }, { start: 996, end: 1000, text: tail }] }];
    const result = await verify("", "Operating margin was 99%.", { filings: excerpts });
    expect(result.log[0]?.outcome).toBe("unverified");
  });

  it("rejects a structured excerpt number whose supplied period contradicts its source span", async () => {
    const text = "Operating margin in FY2026 was 31.5%.";
    const result = await runVerifyPass({} as PassDeps, payload(text), {
      metrics: [{ label: "Operating margin", values: [{ period: "FY2025", value: {
        value: 31.5, unit: "%", period: "FY2025", source, asOf, verified: null,
      } }] }],
    });
    expect(result.verifiedReport.metrics[0]?.values[0]?.value.verified).toBe(false);
    expect(result.log[0]).toMatchObject({ outcome: "unverified", reason: "period-mismatch" });
  });

  it("reads the date from an exact legacy citation without losing numeric source support", async () => {
    const result = await runVerifyPass({} as PassDeps, payload("Operating margin was 31%."), {
      commentary: [{ label: "FACT", text: "Operating margin was 31%.", source: `${source} · ${asOf}`, asOf: null }],
    });
    expect(result.log[0]).toMatchObject({ outcome: "verified", validationStatus: "validated" });
  });

  it.each([
    ["Operating margin was 31% on February 30, 2026.", "Operating margin was 31% on February 30, 2026."],
    ["Operating margin was 31% on 02/04/2026.", "Operating margin was 31% on 03/04/2026."],
  ])("leaves invalid or locale-ambiguous exact periods unchecked: %s", async (text, claim) => {
    const result = await verify(text, claim);
    expect(result.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "unchecked" });
  });

  it("leaves excess precision unchecked when the printed rounding intervals overlap", async () => {
    const result = await verify("Operating margin was 31%.", "Operating margin was 31.4%.");
    expect(result.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "unchecked", reason: "text-ambiguous" });
  });

  it("does not verify another metric merely because its number matches the typed source value", async () => {
    const provenanceRegistry = [{ id: source, label: "Operating margin", kind: "provider" as const, value: 31, unit: "percent" as const,
      currency: null, period: "2026-06-30", asOf, origin: source, formulaVersion: null, displayPrecision: 2 }];
    const result = await verify("", "Gross margin was 31%.", { provenanceRegistry });
    expect(result.log[0]?.outcome).toBe("unverified");
  });

  it("does not label a numeric claim validated when its direction contradicts the bound change", async () => {
    const id = "computed.growth.revenue-growth";
    const provenanceRegistry = [{ id, label: "Revenue growth", kind: "computed" as const, value: 31, unit: "percent" as const,
      currency: null, period: null, asOf, origin: id, formulaVersion: "test-v1", displayPrecision: 2 }];
    const result = await runVerifyPass({} as PassDeps, { ...payload(""), provenanceRegistry }, {
      commentary: [{ label: "FACT", text: "Revenue growth fell 31%.", source: id, asOf }],
    });
    expect(result.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "contradicted", reason: "direction-mismatch" });
    expect(result.coverage.factualClaims.supported).toBe(1);
    expect(result.coverage.factualValidation?.contradicted).toBe(1);
  });

  it("treats an unestablished source unit as unchecked instead of a contradiction", async () => {
    const result = await verify("Operating margin was 31.5.", "Operating margin was 31.5%.");
    expect(result.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "unchecked", reason: "text-ambiguous" });
  });

  it("validates a correct explicit fiscal quarter using the issuer's typed period identity", async () => {
    const provenanceRegistry = [{ id: source, label: "Operating margin", kind: "provider" as const, value: 31, unit: "percent" as const,
      currency: null, period: "2026-06-30", fiscalPeriod: "Q2 FY2026", asOf, origin: source, formulaVersion: null, displayPrecision: 2 }];
    const result = await verify("", "Operating margin was 31% in Q2 FY2026.", { provenanceRegistry });
    expect(result.log[0]).toMatchObject({ outcome: "verified", validationStatus: "validated" });
  });

  it.each([
    ["Gross profit margin was 31%.", "Operating profit margin was 31%."],
    ["Adjusted net profit margin was 31%.", "Reported net profit margin was 31%."],
    ["Diluted earnings per share were USD 3.10.", "Basic earnings per share were USD 3.10."],
    ["Recurring operating profit margin was 31%.", "Exceptional operating profit margin was 31%."],
  ])("does not substitute differentiated metric modifiers: %s", async (text, claim) => {
    const result = await verify(text, claim);
    expect(result.log[0]?.outcome).toBe("unverified");
    expect(result.coverage.factualValidation?.validated).toBe(0);
  });

  it.each([
    ["Revenue fell 31%.", "Revenue rose 31%."],
    ["Revenue declined by 31%.", "Revenue increased by 31%."],
    ["Revenue was 31% lower.", "Revenue was 31% higher."],
    ["Operating margin rose to 31%.", "Operating margin fell to 31%."],
    ["Operating margin was 31%.", "Operating margin increased to 31%."],
    ["Revenue fell 31%.", "Revenue was 31%."],
    ["Revenue did not fall 31%.", "Revenue fell 31%."],
  ])("does not validate unsupported or contradictory directional relations: %s", async (text, claim) => {
    const result = await verify(text, claim);
    expect(result.log[0]?.outcome).toBe("unverified");
    expect(result.coverage.factualValidation?.validated).toBe(0);
  });

  it.each([
    ["Operating margin was 31% in January 2026.", "Operating margin was 31% in June 2026."],
    ["Operating margin was 31% on January 15, 2026.", "Operating margin was 31% on June 15, 2026."],
    ["Operating margin was 31% for the first quarter of 2026.", "Operating margin was 31% for the second quarter of 2026."],
  ])("preserves named-month, exact-day and quarter distinctions: %s", async (text, claim) => {
    const result = await verify(text, claim);
    expect(result.log[0]?.outcome).toBe("unverified");
    expect(result.coverage.factualValidation?.validated).toBe(0);
  });

  it.each([
    ["Operating margin was 31% in January 2026.", "Operating margin was 31% in Jan. 2026."],
    ["Operating margin was 31% on January 15, 2026.", "Operating margin was 31% on 2026-01-15."],
    ["Revenue fell 31%.", "Revenue declined 31%."],
    ["Operating margin rose to 31%.", "Operating margin increased to 31%."],
  ])("retains supported metric, direction and equivalent period identities: %s", async (text, claim) => {
    const result = await verify(text, claim);
    expect(result.log[0]).toMatchObject({ outcome: "verified", validationStatus: "validated" });
  });

  it("removes executive A grades after nonempty evidence arrays fail final verification", async () => {
    const unsupported: SourcedClaim[] = [
      { label: "FACT", text: "Jane Roe met guidance.", source: "unknown", asOf },
      { label: "FACT", text: "No guidance record is available for Jane Roe.", source, asOf },
      { label: "FACT", text: "Jane Roe delivered operating margin of 99%.", source, asOf },
    ];
    const leadership: Leadership = {
      graded: { grade: "A", oneLineWhy: "Evidence is being checked.", reasoning: [], confidence: "high", keyNumbers: [] },
      executives: [{
        name: "Jane Roe", title: "CEO", tenureYears: null, grade: "A", credibilityGrade: "A", reasoning: [],
        evidence: { guidanceVsActuals: unsupported, capitalAllocation: structuredClone(unsupported) },
      }],
      insiderSummary: [], governanceNotes: [],
    };
    const result = await runVerifyPass({} as PassDeps, payload("Jane Roe delivered operating margin of 31%."), { leadership });

    expect(result.verifiedReport.leadership.executives[0]).toMatchObject({
      grade: "not-assessed", credibilityGrade: "not-assessed", assessmentReason: expect.any(String),
    });
    expect(leadership.executives[0]).toMatchObject({ grade: "A", credibilityGrade: "A" });
    for (const field of ["guidanceVsActuals", "capitalAllocation"]) {
      expect(result.log.find(entry => entry.path === `leadership.executives[0].evidence.${field}[2]`)).toMatchObject({
        outcome: "unverified", validationStatus: "contradicted", reason: "value-mismatch",
      });
    }
    expect(result.coverage.factualValidation?.validated).toBe(0);
  });

  it.each([
    ["Non-GAAP operating margin was 31%.", "GAAP operating margin was 31%."],
    ["Non-recurring operating profit margin was 31%.", "Recurring operating profit margin was 31%."],
    ["Adjusted operating margin was 31%.", "Operating margin was 31%."],
    ["Gross operating profit margin was 31%.", "Operating profit margin was 31%."],
    ["Operating margin excluding compensation was 31%.", "Operating margin was 31%."],
    ["Operating margin was not 31%.", "Operating margin was 31%."],
    ["Operating margin was 31% year-to-date.", "Operating margin was 31% for the year."],
    ["Operating margin was 31% quarter-to-date.", "Operating margin was 31% for the quarter."],
    ["Operating margin was 31% YTD.", "Operating margin was 31%."],
    ["Operating margin was (31%).", "Operating margin was 31%."],
    ["Operating margin was 31%.", "Operating margin was (31%)."],
    ["Operating income was (EUR 31 billion).", "Operating income was EUR 31 billion."],
  ])("preserves source-side definition, negation, window and accounting sign: %s", async (text, claim) => {
    const result = await verify(text, claim);
    expect(result.log[0]?.outcome).toBe("unverified");
    expect(result.coverage.factualValidation?.validated).toBe(0);
  });

  it.each([
    ["Non-GAAP operating margin was 31%.", "Non-GAAP operating margin was 31%."],
    ["Non-recurring operating margin was 31%.", "Non recurring operating margin was 31%."],
    ["Operating margin was 31% year-to-date.", "Operating margin was 31% YTD."],
    ["Operating margin was (31%).", "Operating margin was -31%."],
  ])("retains established definition, window and accounting-sign equivalents: %s", async (text, claim) => {
    const result = await verify(text, claim);
    expect(result.log[0]).toMatchObject({ outcome: "verified", validationStatus: "validated" });
  });

  it("preserves source-side definitions and accounting signs when using typed records", async () => {
    const provenanceRegistry = [{ id: source, label: "Non-GAAP operating margin", kind: "provider" as const, value: 31, unit: "percent" as const,
      currency: null, period: null, asOf, origin: source, formulaVersion: null, displayPrecision: 2 }];
    const differentDefinition = await verify("", "GAAP operating margin was 31%.", { provenanceRegistry });
    expect(differentDefinition.log[0]?.outcome).toBe("unverified");
    const differentSign = await verify("", "Non-GAAP operating margin was (31%).", { provenanceRegistry });
    expect(differentSign.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "contradicted", reason: "value-mismatch" });
  });

  it("leaves an unlabeled typed amount unchecked because its metric definition is unavailable", async () => {
    const provenanceRegistry = [{ id: source, kind: "provider" as const, value: 31, unit: "percent" as const,
      currency: null, period: null, asOf, origin: source, formulaVersion: null, displayPrecision: 2 }];
    const result = await verify("", "GAAP operating margin was 31%.", { provenanceRegistry });
    expect(result.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "unchecked", reason: "text-context-mismatch" });
  });
});
