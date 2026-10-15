import { describe, expect, it } from "vitest";
import { selectMaterialEvidence } from "@/pipeline/stageC/evidenceSelection";

// Synthetic long MD&A: crowded numeric operating discussion, followed by
// separate earnings-quality and post-period funding disclosures. No live data.
const earningsBridge = "Other income (expense), net was $7.1 billion in Q2 2026 and $11.6 billion for the six months ended June 30, 2026, primarily from upward adjustments to preferred stock and reclassification of gains on convertible notes.";
const investmentContext = "We invested $8.7 billion in Example Robotics preferred stock for the six months ended June 30, 2026, including $3.2 billion in Q2 2026.";
const subsequentFunding = "Subsequent to June 30, 2026, we funded the remaining commitment amount of $2.3 billion.";
const boilerplate = "Forward-looking statements are subject to risks and uncertainties; see the general cautionary language elsewhere in this filing.";
function longMdna(): string {
  return [
    ...Array.from({ length: 100 }, (_, i) => `Operating income and revenue for business ${i} were $18 billion and $91 billion in Q2 2026, versus $16 billion and $85 billion in Q2 2025; gross margin was 41% versus 39% and operating margin was 21% versus 19%.`),
    "OTHER INCOME (EXPENSE), NET", earningsBridge,
    "LIQUIDITY AND CAPITAL RESOURCES", investmentContext, subsequentFunding,
    "We expect capital expenditures of $17 billion to $19 billion in 2026.",
    "Income tax expense was $4.2 billion for the six months ended June 30, 2026.",
    "Free cash flow was $3.4 billion for the twelve months ended June 30, 2026.",
    boilerplate,
  ].join("\n");
}

describe("bounded material filing evidence", () => {
  it("retains investment-driven earnings explanations amid dense operating results", () => {
    const selected = selectMaterialEvidence(longMdna(), 8_000);
    expect(selected.text).toContain(earningsBridge);
    expect(selected.coverage.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "earnings-quality", status: "retained" }),
    ]));
  });

  it("retains subsequent funding with the preceding investment referent and period", () => {
    const selected = selectMaterialEvidence(longMdna(), 8_000);
    expect(selected.text).toContain(investmentContext);
    expect(selected.text).toContain(subsequentFunding);
    expect(selected.coverage.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "subsequent-liquidity", status: "retained" }),
    ]));
  });

  it("preserves exact nonoverlapping source spans within the cap and excludes low-value boilerplate", () => {
    const original = longMdna();
    const selected = selectMaterialEvidence(original, 8_000);
    expect(selected.text.length).toBeLessThanOrEqual(8_000);
    expect(selected.truncated).toBe(true);
    expect(selected.text).not.toContain(boilerplate);
    let previousEnd = 0;
    for (const span of selected.spans) {
      expect(span.start).toBeGreaterThanOrEqual(previousEnd);
      expect(original.slice(span.start, span.end)).toBe(span.text);
      expect(selected.text).toContain(span.text);
      previousEnd = span.end;
    }
    expect(selected.coverage.retainedChars + selected.coverage.omittedChars).toBe(original.length);
    expect(selectMaterialEvidence(original, 8_000)).toEqual(selected);
  });

  it("preserves all short input and reports unavailable families without inferring their absence", () => {
    const original = "Revenue was $3 billion in Q2 2026.";
    const selected = selectMaterialEvidence(original, 1_000);
    expect(selected.text).toBe(original);
    expect(selected.truncated).toBe(false);
    expect(selected.spans).toEqual([{ start: 0, end: original.length, text: original }]);
    expect(selected.coverage.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "earnings-quality", status: "not-found" }),
      expect.objectContaining({ category: "subsequent-liquidity", status: "not-found" }),
    ]));
  });

  it("omits an unbound remaining commitment when its investment context cannot fit", () => {
    const original = `We invested $8.7 billion in preferred stock subject to ${"contractual terms ".repeat(45)}for the six months ended June 30, 2026.\n${subsequentFunding}`;
    const selected = selectMaterialEvidence(original, 400);
    expect(selected.text).not.toContain(subsequentFunding);
    expect(selected.text.length).toBeLessThanOrEqual(400);
    expect(selected.coverage.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "subsequent-liquidity", status: "omitted", retainedPassages: 0 }),
    ]));
  });

  it("keeps available business-risk narrative even without a numeric or material-family keyword", () => {
    const narrative = "We rely on a concentrated supplier base, and interruptions may delay deliveries to customers.";
    const original = `Management discussion.\n${narrative}\n${"Operational description without numeric claims. ".repeat(100)}`;
    expect(selectMaterialEvidence(original, 800).text).toContain(narrative);
  });

  it.each([0, 1, 30, 210, 500])("does not invent retained evidence in a %i-character budget", (budget) => {
    const original = longMdna();
    const selected = selectMaterialEvidence(original, budget);
    expect(selected.text.length).toBeLessThanOrEqual(budget);
    for (const span of selected.spans) {
      expect(original.slice(span.start, span.end)).toBe(span.text);
      expect(selected.text).toContain(span.text);
    }
  });
});
