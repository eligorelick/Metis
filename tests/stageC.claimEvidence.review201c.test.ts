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
  expect(run("Revenue was $24.4 billion.", "Revenue was $24.4 billion.")).toBe("validated");
});

// Review round 3 reproductions: change verbs no list covers, a comparison without a verb, and a count scale
// stated in an earlier heading line or sentence.
it.each([
  ...["eroded", "eased", "dipped", "slid", "softened", "rebounded", "recovered", "slowed", "accelerated", "shifted", "added", "edged", "strengthened", "weakened", "worsened", "lifted"]
    .map(verb => [`Gross margin percentage ${verb} 2.1.`, `Gross margin percentage ${verb} 2.1%.`] as [string, string]),
  ["Gross margin percentage was 2.1 above the prior year.", "Gross margin percentage was 2.1% above the prior year."],
  ["Key metrics (millions)\nSubscriber count 260", "Subscriber count was 260."],
  ["Key metrics, in millions. Subscriber count was 260.", "Subscriber count was 260."],
])("never infers a unit from wording or a distant scale: %s", (excerpt, claim) => {
  expect(["validated", "contradicted"]).not.toContain(run(excerpt, claim));
});

// Review round 5 reproduction: a count cell under a declared table scale has no established unit, whether the
// header scales counts or excepts them, so neither a confirmation nor a contradiction can follow.
it.each(["(In thousands, except subscriber counts)", "(In millions)"])("never confirms or contradicts a count cell under %s", header => {
  const table = `Three Months Ended Six Months Ended Jul 26, 2026 Jul 27, 2025 Jul 26, 2026 Jul 27, 2025 ${header} Paid subscribers 260 250 255 245 Revenue $ 96,221 $ 46,743 $ 177,837 $ 90,805`;
  for (const claim of ["Paid subscribers for the three months ended July 26, 2026 were 260 subscribers.", "Paid subscribers for the three months ended July 26, 2026 were 260 thousand subscribers.", "Paid subscribers for the three months ended July 26, 2026 were 260 million subscribers."])
    expect(["validated", "contradicted"]).not.toContain(run(table, claim));
});
