import { expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { TextExcerpt } from "@/pipeline/stageC/payload";

// D-274 review round 2 (lead fix, P3, P19): a unitless figure in a percentage-change statement is never read
// as percent, and a bare count whose sentence carries any scale word or marker is never read as a plain count.
const run = (text: string, claim: string) => {
  const ex: TextExcerpt = { title: "10-Q Item 2", source: "edgar:10-Q item2", asOf: "2026-06-30", text, truncated: false, originalChars: text.length };
  return validateClaimNumericSupport({ label: "FACT", text: claim, source: ex.source, asOf: ex.asOf }, { excerpts: [ex], sourceId: ex.source, reportingCurrency: "USD" }).status;
};

it.each([
  ["Gross margin percentage widened 2.1.", "Gross margin percentage widened 2.1%."],
  ["Gross margin percentage improved 2.1.", "Gross margin percentage improved 2.1%."],
  ["Gross margin percentage change was 2.1.", "Gross margin percentage change was 2.1%."],
  ["Gross margin percentage moved 2.1 from the prior year.", "Gross margin percentage moved 2.1% from the prior year."],
  ["Operating margin percentage compressed 2.1.", "Operating margin percentage compressed 2.1%."],
  ["Gross margin percentage widened 2.1%.", "Gross margin percentage widened 2.1."],
  ["Subscriber count, in millions, was 260.", "Subscriber count was 260."],
  ["Subscriber count, in millions, was 260.", "Subscriber count was 260 million."],
  ["Subscriber count (millions) was 260.", "Subscriber count was 260."],
  ["Subscriber count was 260 (in millions).", "Subscriber count was 260."],
  ["Subscriber count (000s) was 260.", "Subscriber count was 260."],
])("never confirms or contradicts from an inferred unit: %s / %s", (excerpt, claim) => {
  expect(["validated", "contradicted"]).not.toContain(run(excerpt, claim));
});

it("controls: an explicit unit on both sides still confirms", () => {
  expect(run("Gross margin percentage widened 2.1%.", "Gross margin percentage widened 2.1%.")).toBe("validated");
  expect(run("Subscriber count was 260 million.", "Subscriber count was 260 million.")).toBe("validated");
});
