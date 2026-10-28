import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { quantityDirection } from "@/pipeline/stageC/consistency";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import { assembleContextPayload, type ContextPayload } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import { factualValidationText } from "@/report/auditTables";
import type { Leadership, SourcedClaim } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

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
    expect(result.coverage.factualValidation).toEqual({ cited: 1, validated: 0, unchecked: 0, contradicted: 1, qualitative: 0, total: 1, rate: 0 });
    expect(result.log[0]?.sourceSpans?.[0]).toMatchObject({ source, asOf, text: "Consolidated operating margin was 31%." });
  });

  it("validates an unambiguous material figure and preserves its original source span", async () => {
    const text = "Revenue grew.\nConsolidated operating margin was 31%.\nOutlook remains uncertain.";
    const result = await verify(text, "Consolidated operating margin was 31%.");
    expect(result.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "validated", numericSupportStatus: "validated", claimSupportStatus: "numeric-only" });
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
    // NVDA report 34: 60 of 89 "unchecked" claims stated no figure at all.
    expect(result.coverage.factualValidation?.qualitative).toBe(1);
    expect(factualValidationText(result.coverage)).toContain("1 qualitative claims cited but not machine-checkable");
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
    expect(result.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "validated", numericSupportStatus: "validated", claimSupportStatus: "numeric-only" });
    expect(result.log[0]?.sourceSpans).toHaveLength(2);
  });

  it("reads all numeric prose against a typed cited record rather than validating only the tag", async () => {
    const provenanceRegistry = [{ id: source, label: "Operating margin", kind: "provider" as const, value: 31, unit: "percent" as const,
      currency: null, period: "2026-06-30", asOf, origin: source, formulaVersion: null, displayPrecision: 2 }];
    const bad = await verify("", "Operating margin was 99%.", { provenanceRegistry });
    expect(bad.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "contradicted", reason: "value-mismatch" });
    const good = await verify("", "Operating margin was 31%.", { provenanceRegistry });
    expect(good.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "validated", numericSupportStatus: "validated", claimSupportStatus: "numeric-only" });
    const extra = await verify("", "Operating margin was 31% and net margin was 99%.", { provenanceRegistry });
    expect(extra.log[0]?.outcome).toBe("unverified");
  });

  it("does not bind a number by borrowing the name of a different metric later in its clause", async () => {
    const result = await verify("Revenue was $99 billion, while operating margin was 31%.", "Revenue was 31%.");
    expect(result.log[0]?.outcome).toBe("unverified");
  });

  it("retains signed amounts and explicit currencies without inferring dollars", async () => {
    const correct = await verify("Operating income was EUR -31 billion.", "Operating income was EUR -31 billion.");
    expect(correct.log[0]).toMatchObject({ outcome: "unverified", numericSupportStatus: "validated", claimSupportStatus: "numeric-only" });
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

  it("leaves a prose period unchecked, not contradicted, when the cited record carries no period", async () => {
    // The NVDA final rerun's record and sentence, verbatim.
    const context = { id: source, label: "DCF base-case year-one revenue growth over TTM", kind: "computed" as const, value: 82.1353, unit: "percent" as const,
      currency: null, asOf, origin: source, formulaVersion: null, displayPrecision: 4, period: null };
    // D-66: "trailing" names the TTM window the record's own label states
    // ("… over TTM"), so the verbatim sentence now validates; a period the
    // label does not state (a month) is still left unchecked, never contradicted.
    const verbatim = await verify("", "DCF base-case year-one revenue growth over trailing revenue is 82.1353%.", { provenanceRegistry: [context] });
    expect(verbatim.log[0]?.validationStatus).toBe("validated");
    const periodless = await verify("", "DCF base-case year-one revenue growth over trailing revenue in March 2026 is 82.1353%.", { provenanceRegistry: [context] });
    const base = { id: source, label: "Operating margin", kind: "provider" as const, value: 31, unit: "percent" as const,
      currency: null, asOf, origin: source, formulaVersion: null, displayPrecision: 2 };
    expect(periodless.log[0]).toMatchObject({ outcome: "unverified", reason: "period-mismatch" });
    expect(periodless.log[0]?.validationStatus).not.toBe("contradicted");
    const dated = await verify("", "Q1 FY2026 operating margin was 31%.", { provenanceRegistry: [{ ...base, period: "2026-06-30", fiscalPeriod: "Q2 FY2026" }] });
    expect(dated.log[0]).toMatchObject({ reason: "period-word-mismatch", validationStatus: "unchecked" });
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
    expect(result.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "validated", numericSupportStatus: "validated", claimSupportStatus: "numeric-only" });
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
    expect(result.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "validated", numericSupportStatus: "validated", claimSupportStatus: "numeric-only" });
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

  describe("relation: a hedge, or 'an increase of', keeps a change a change (AI-401)", () => {
    const dirOf = (sentence: string, figure: string) => {
      const start = sentence.indexOf(figure);
      expect(start).toBeGreaterThanOrEqual(0);
      return quantityDirection(sentence, start, start + figure.length, [{ start, end: start + figure.length }]);
    };
    it.each([
      ["had an increase of $66.1 billion", "$66.1 billion", "change"],
      ["increased by about $27.5 billion", "$27.5 billion", "change"],
      ["revenue grew around 12%", "12%", "change"],
      ["had an increase of about $66.1 billion", "$66.1 billion", "change"],
      ["recorded a gain of $1.2 billion", "$1.2 billion", "unknown"],
      // Controls that read the same before and after the fix.
      ["increased by approximately $27.5 billion", "$27.5 billion", "change"],
      ["increased to $27.5 billion", "$27.5 billion", "level"],
      ["increased to about $27.5 billion", "$27.5 billion", "level"],
      ["Revenue was 31% lower.", "31%", "change"],
    ])("relation of %s", (sentence, figure, relation) => {
      expect(dirOf(sentence, figure)?.relation).toBe(relation);
    });

    /** The source text goes through a registry whose one statements record gives the filing its reporting currency (USD), so "$" in the source is established. */
    const verifyFrom = (id: string, text: string, claim: string) => {
      const registered = { ...payload(text),
        provenanceRegistry: [{ id: "payload.statements.income.revenue", kind: "provider", value: 1, unit: "currency",
          currency: "USD", period: asOf, asOf, origin: "edgar", formulaVersion: null, displayPrecision: 0 }],
        citationRegistry: [{ id, asOf, origin: id, kind: "payload-text" }],
        filings: [{ source: id, asOf, text, title: "Quarterly review", truncated: false, originalChars: text.length }] } as unknown as ContextPayload;
      return runVerifyPass({} as PassDeps, registered, { commentary: [{ label: "FACT", text: claim, source: id, asOf }] });
    };
    const AMZN = "Free cash flow decreased to an outflow of $7.6 billion for the trailing twelve months, driven primarily by a year-over-year increase of $66.1 billion in purchases of property and equipment, net of proceeds from sales and incentives.";
    it.each([
      ["Operating income had an increase of USD 27.5 billion.", "Operating income increased to USD 27.5 billion."],
      ["Capital expenditures increased by about USD 27.5 billion.", "Capital expenditures increased to USD 27.5 billion."],
      ["Capital expenditures increased to about USD 27.5 billion.", "Capital expenditures increased by about USD 27.5 billion."],
      ["Capital expenditures increased more than USD 27.5 billion.", "Capital expenditures increased to more than USD 27.5 billion."],
    ])("a change is not validated as a level, nor a level as a change: %#", async (text, claim) => {
      const result = await verify(text, claim);
      expect(result.log[0]?.validationStatus).not.toBe("validated");
    });
    it.each([
      "Purchases of property and equipment, net of proceeds from sales and incentives, increased to USD 66.1 billion for the trailing twelve months.",
      "Free cash flow had a decrease of USD 7.6 billion for the trailing twelve months.",
    ])("the AMZN sentence's change is not validated as a level, nor its level as a change: %#", async (claim) => {
      const result = await verifyFrom(source, AMZN, claim);
      expect(result.log[0]?.validationStatus).not.toBe("validated");
    });
    it("a transcript change is not validated as a level", async () => {
      const result = await verifyFrom("fmp:earning-call-transcript", "Data center revenue grew around 12% sequentially.", "Data center revenue grew to 12% sequentially.");
      expect(result.log[0]?.validationStatus).not.toBe("validated");
    });
    it.each([
      ["Capital expenditures increased by USD 27.5 billion.", "Capital expenditures increased by USD 27.5 billion."],
      ["Capital expenditures increased by about USD 27.5 billion.", "Capital expenditures increased by about USD 27.5 billion."],
      ["Operating income had an increase of USD 27.5 billion.", "Operating income had an increase of USD 27.5 billion."],
      ["Capital expenditures increased to about USD 27.5 billion.", "Capital expenditures increased to about USD 27.5 billion."],
    ])("the same relation on both sides still validates: %#", async (text, claim) => {
      const result = await verify(text, claim);
      expect(result.log[0]?.validationStatus).toBe("validated");
    });
    it("the AMZN level claim on its own level validates (control)", async () => {
      const result = await verifyFrom(source, AMZN, "Free cash flow decreased to an outflow of USD 7.6 billion for the trailing twelve months.");
      expect(result.log[0]?.validationStatus).toBe("validated");
    });
    it("the AMZN change claim on the 'increase of' source validates (recall pin, AI-401 review)", async () => {
      const result = await verifyFrom(source, AMZN, "Purchases of property and equipment, net of proceeds from sales and incentives, increased by USD 66.1 billion for the trailing twelve months.");
      expect(result.log[0]?.validationStatus).toBe("validated");
    });
    it("a transcript with the same hedged wording on both sides validates", async () => {
      const result = await verifyFrom("fmp:earning-call-transcript", "Data center revenue grew around 12% sequentially.", "Data center revenue grew around 12% sequentially.");
      expect(result.log[0]?.validationStatus).toBe("validated");
    });
    it("increased by is not validated against increased to", async () => {
      const result = await verify("Capital expenditures increased to USD 27.5 billion.", "Capital expenditures increased by USD 27.5 billion.");
      expect(result.log[0]?.validationStatus).not.toBe("validated");
    });
  });

  describe("apposition: a direction word after a comma describes a comparison, not the figure (AI-401-V1)", () => {
    const EX99 = readFileSync("fixtures/edgar/nvda-current-reports/q2fy27-ex99-2.txt", "utf8");
    const TAX = "GAAP effective tax rate for the second quarter was 16.5%, an increase from a year ago, primarily due to higher revenue.";
    const dirOf = (sentence: string, figure: string) => {
      const start = sentence.indexOf(figure);
      expect(start).toBeGreaterThanOrEqual(0);
      return quantityDirection(sentence, start, start + figure.length, [{ start, end: start + figure.length }]);
    };
    /** The excerpt is registered under an edgar id, with one statements record that fixes the reporting currency (USD). */
    const verifyAt = (id: string, text: string, claim: string, at: string) => {
      const registered = { ...payload(text),
        provenanceRegistry: [{ id: "payload.statements.income.revenue", kind: "provider", value: 1, unit: "currency",
          currency: "USD", period: at, asOf: at, origin: "edgar", formulaVersion: null, displayPrecision: 0 }],
        citationRegistry: [{ id, asOf: at, origin: id, kind: "payload-text" }],
        filings: [{ source: id, asOf: at, text, title: "Quarterly review", truncated: false, originalChars: text.length }] } as unknown as ContextPayload;
      return runVerifyPass({} as PassDeps, registered, { commentary: [{ label: "FACT", text: claim, source: id, asOf: at }] });
    };
    const EDGAR = "edgar:8-K EX-99.2";
    it("the fixture holds the tax-rate sentence exactly once", () => {
      expect(EX99.split(TAX)).toHaveLength(2);
    });
    it.each([
      [TAX, "16.5%", null],
      // A comma, dash or parenthesis between the figure and the word makes the word an apposition.
      ["Inventory was USD 31.6 billion, up sequentially from USD 25.8 billion.", "USD 31.6 billion", null],
      ["Inventory was USD 31.6 billion – down slightly – from USD 35.0 billion.", "USD 31.6 billion", null],
      ["Inventory was USD 31.6 billion (up sequentially).", "USD 31.6 billion", null],
      // Controls that read the same before and after the fix.
      ["Revenue was 31% lower.", "31%", "change"],
      ["Revenue was USD 46.7 billion, up 56% from a year ago.", "56%", "change"],
      ["Revenue rose 31%, driven by data center.", "31%", "change"],
      ["Inventory was USD 31.6 billion, up from USD 25.8 billion.", "USD 25.8 billion", "level"],
    ])("direction of %s at %s", (sentence, figure, relation) => {
      const direction = dirOf(sentence, figure);
      if (relation === null) expect(direction).toBeNull();
      else expect(direction?.relation).toBe(relation);
    });
    it.each([
      "GAAP effective tax rate for the second quarter increased by 16.5% from a year ago.",
      "GAAP effective tax rate for the second quarter rose 16.5% from a year ago.",
    ])("a change claim is not validated by the apposition sentence: %s", async (claim) => {
      const result = await verifyAt(EDGAR, TAX, claim, "2026-07-26");
      expect(result.log[0]?.validationStatus).not.toBe("validated");
    });
    it("the level claim on the apposition sentence validates", async () => {
      const result = await verifyAt(EDGAR, TAX, "GAAP effective tax rate for the second quarter was 16.5%.", "2026-07-26");
      expect(result.log[0]?.validationStatus).toBe("validated");
    });
    it.each([
      ["Inventory was USD 31.6 billion, up sequentially from USD 25.8 billion.", "Inventory increased by USD 31.6 billion."],
      ["Inventory was USD 31.6 billion, down slightly from USD 35.0 billion.", "Inventory decreased by USD 31.6 billion."],
      // Controls: not validated before the fix either.
      ["Gross margin was 72.4%, a decrease from 75.1% a year ago.", "Gross margin decreased by 72.4%."],
      ["Inventory was USD 31.6 billion, up from USD 25.8 billion.", "Inventory increased by USD 31.6 billion."],
      ["Revenue was USD 46.7 billion, up 56% from a year ago.", "Revenue increased by USD 46.7 billion."],
    ])("a level with an apposition is not validated as a change: %#", async (text, claim) => {
      const result = await verifyAt(source, text, claim, asOf);
      expect(result.log[0]?.validationStatus).not.toBe("validated");
    });
    it("the D-63 level claim still validates (control)", async () => {
      const result = await verifyAt(source, "Inventory was USD 31.6 billion, up from USD 25.8 billion.", "Inventory was USD 31.6 billion.", asOf);
      expect(result.log[0]?.validationStatus).toBe("validated");
    });
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
    expect(result.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "validated", numericSupportStatus: "validated", claimSupportStatus: "numeric-only" });
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
    expect(result.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "validated", numericSupportStatus: "validated", claimSupportStatus: "numeric-only" });
  });

  it("preserves source-side definitions and accounting signs when using typed records", async () => {
    const provenanceRegistry = [{ id: source, label: "Non-GAAP operating margin", kind: "provider" as const, value: 31, unit: "percent" as const,
      currency: null, period: null, asOf, origin: source, formulaVersion: null, displayPrecision: 2 }];
    const differentDefinition = await verify("", "GAAP operating margin was 31%.", { provenanceRegistry });
    expect(differentDefinition.log[0]?.outcome).toBe("unverified");
    const differentSign = await verify("", "Non-GAAP operating margin was (31%).", { provenanceRegistry });
    expect(differentSign.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "contradicted", reason: "value-mismatch" });
  });

  // NVDA report 34 (2026-10-15) printed "0/90 validated; 1 contradicted". These
  // are its exact sentences and registry shapes.
  const nvda = (record: Partial<NumericProvenanceRecord>, text: string) => {
    const typed = { id: "computed.current-capital.operating-cash-flow", kind: "computed" as const, unit: "currency" as const, currency: "USD",
      asOf: "2026-07-26", origin: "computed.capital.current", formulaVersion: "stage-b-v1", displayPrecision: 4, value: 0, period: null, ...record };
    return runVerifyPass({} as PassDeps, { provenanceRegistry: [typed], citationRegistry: [], filings: [] } as unknown as ContextPayload,
      { commentary: [{ label: "FACT", text, source: typed.id, asOf: typed.asOf }] });
  };
  it.each([
    ["a date at the end of its trailing window", { label: "operating cash flow", value: 134.36e9, period: "ttm: 2025-07-27 to 2026-07-26" },
      "Operating cash flow for the trailing period ended 2026-07-26 was USD 134.360 billion."],
    ["the issuer's fiscal quarter", { id: "payload.statements.cash-flow-quarterly.2026-07-26.operating-cash-flow", kind: "provider", label: "operating cash flow",
      value: 24.077e9, period: "2026-07-26", fiscalPeriod: "Q2 FY2027", origin: "fmp:cash-flow(quarter)", formulaVersion: null },
    "Operating cash flow for the quarter ended 2026-07-26 was USD 24.077 billion."],
  ] as const)("validates NVDA report-34 prose naming %s", async (_case, record, text) => {
    const result = await nvda(record, text);
    expect(result.checks.period?.failed ?? 0).toBe(0);
    expect(result.log[0]).toMatchObject({ validationStatus: "validated" });
    expect(result.coverage.factualValidation).toMatchObject({ validated: 1, contradicted: 0 });
  });

  it("still contradicts a trailing figure stated for another window end or for one quarter", async () => {
    const ttm = { label: "operating cash flow", value: 134.36e9, period: "ttm: 2025-07-27 to 2026-07-26" };
    expect((await nvda(ttm, "Operating cash flow for the trailing period ended 2026-04-26 was USD 134.360 billion.")).log[0]?.validationStatus).not.toBe("validated");
    expect((await nvda(ttm, "Operating cash flow for the quarter ended 2026-07-26 was USD 134.360 billion.")).log[0]?.validationStatus).not.toBe("validated");
  });

  it("validates current-capital bridge prose against the label the payload itself registers", async () => {
    const bundle = completeCurrencyBundle({});
    const context = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    const record = context.provenanceRegistry!.find(entry => entry.origin === "computed.capital.current.debtBridge.totalDebtIncludingLeases" && entry.id.startsWith("computed.current-capital."))!;
    expect(record).toBeDefined();
    const text = `Total debt including leases was ${record.currency} ${(record.value / 1e6).toFixed(3)} million at the latest quarter end.`;
    const result = await runVerifyPass({} as PassDeps, context, { commentary: [{ label: "FACT", text, source: record.id, asOf: record.asOf }] });
    expect(result.log[0]).toMatchObject({ validationStatus: "validated" });
  });

  it.each(["capitalAllocation", "guidanceVsActuals"] as const)("retains a validated execution grade independently of the %s bucket", async (field) => {
    const record = { id: "payload.statements.cash-flow-annual.2026-01-25.operating-cash-flow", label: "operating cash flow", kind: "provider" as const,
      value: 102.718e9, unit: "currency" as const, currency: "USD", period: "2026-01-25", fiscalPeriod: "FY2026", asOf: "2026-01-25",
      origin: "fmp:cash-flow(annual)", formulaVersion: null, displayPrecision: 4 };
    const evidence: SourcedClaim = { label: "FACT", text: "Jen-Hsun Huang: operating cash flow for FY2026 was USD 102.718 billion.", source: record.id, asOf: record.asOf };
    const leadership: Leadership = {
      graded: { grade: "B", oneLineWhy: "Evidence is being checked.", reasoning: [], confidence: "low", keyNumbers: [] },
      executives: [{ name: "Jen-Hsun Huang", title: "President and CEO", tenureYears: null, grade: "B", credibilityGrade: "B", reasoning: [],
        evidence: { [field]: [evidence] } }],
      insiderSummary: [], governanceNotes: [],
    };
    const result = await runVerifyPass({} as PassDeps, { provenanceRegistry: [record], citationRegistry: [], filings: [] } as unknown as ContextPayload, { leadership });
    expect(result.log.find(entry => entry.path === `leadership.executives[0].evidence.${field}[0]`)).toMatchObject({ validationStatus: "validated", executiveEvidenceKind: "execution" });
    // Execution is evidenced; guidance credibility is not, so only that grade is withdrawn.
    expect(result.verifiedReport.leadership.executives[0]).toMatchObject({ grade: "B", credibilityGrade: "not-assessed" });
  });

  it.each(["guidanceVsActuals", "capitalAllocation"] as const)("does not treat validated compensation in %s as an executive performance record", async (field) => {
    const record = { id: "payload.leadership.comp-jane-doe-ceo-fy2026", label: "total compensation", kind: "provider" as const,
      value: 1e6, unit: "currency" as const, currency: "USD", period: "FY2026", asOf: "2026-06-30", origin: "edgar:DEF 14A", formulaVersion: null, displayPrecision: 4 };
    const evidence: SourcedClaim = { label: "FACT", text: "Jane Doe: total compensation for FY2026 was USD 1 million.", source: record.id, asOf: record.asOf };
    const leadership: Leadership = { graded: { grade: "B", oneLineWhy: "Evidence is being checked.", reasoning: [], confidence: "low", keyNumbers: [] },
      executives: [{ name: "Jane Doe", title: "CEO", tenureYears: null, grade: "A", credibilityGrade: "A", reasoning: [], evidence: { [field]: [evidence] } }], insiderSummary: [], governanceNotes: [] };
    const context = { provenanceRegistry: [record], citationRegistry: [], filings: [] } as unknown as ContextPayload;
    const result = await runVerifyPass({} as PassDeps, context, { leadership });
    expect(result.log.find((entry) => entry.path === `leadership.executives[0].evidence.${field}[0]`)).toMatchObject({ validationStatus: "validated" });
    expect(result.verifiedReport.leadership.executives[0]).toMatchObject({ grade: "not-assessed", credibilityGrade: "not-assessed" });
  });

  it("leaves an unlabeled typed amount unchecked because its metric definition is unavailable", async () => {
    const provenanceRegistry = [{ id: source, kind: "provider" as const, value: 31, unit: "percent" as const,
      currency: null, period: null, asOf, origin: source, formulaVersion: null, displayPrecision: 2 }];
    const result = await verify("", "GAAP operating margin was 31%.", { provenanceRegistry });
    expect(result.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "unchecked", reason: "text-context-mismatch" });
  });
});
