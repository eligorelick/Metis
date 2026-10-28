/**
 * AI-409: a figure the source states as a bound ("less than 1%", "over $76.7 billion")
 * supports only a claim that states the same kind of bound. The excerpt path compares
 * `Quantity.bound`; the record path is unchanged.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readProseQuantities, validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { TextExcerpt } from "@/pipeline/stageC/payload";

const EX99 = readFileSync("fixtures/edgar/nvda-current-reports/q2fy27-ex99-2.txt", "utf8");
const ITEM1 = readFileSync("fixtures/edgar/nvda-periodic-sections/nvda-10k-fy2026-item1.txt", "utf8");
const onExcerpt = (claim: string, text: string, source: string, asOf: string, ignoreWords: readonly string[] = []) => {
  const excerpt: TextExcerpt = { title: "Quarterly review", text, source, asOf, truncated: false, originalChars: text.length };
  return validateClaimNumericSupport({ label: "FACT", text: claim, source, asOf },
    { excerpts: [excerpt], sourceId: source, reportingCurrency: "USD", ignoreWords });
};
const hopper = (claim: string) => onExcerpt(claim, EX99, "edgar:8-K EX-99.2", "2026-07-26");
const rnd = (claim: string) => onExcerpt(claim, ITEM1, "edgar:10-K item1", "2026-01-25", ["NVIDIA"]);

describe("AI-409 reader", () => {
  it.each([
    ["up to $110 million", "upper"],
    ["over $76.7 billion", "lower"],
    ["no more than 5%", "upper"],
    ["more than 5%", "lower"],
    ["less than 1%", "upper"],
    ["at least USD 40 billion", "lower"],
    ["$5 billion", null],
    ["increased over the quarter by 5%", null],
  ])("reads the bound of %s", (text, bound) => {
    expect(readProseQuantities(text)[0].bound).toBe(bound);
  });
});

describe("AI-409 a source bound is not the exact figure", () => {
  it.each([
    ["Shipments of Data Center Hopper products to China during the quarter were 1% of Data Center revenue.", "unvalidated"],
    ["Shipments of Data Center Hopper products to China during the quarter were more than 1% of Data Center revenue.", "unvalidated"],
    ["Shipments of Data Center Hopper products to China during the quarter were less than 1% of Data Center revenue.", "validated"],
  ])("Hopper: %s", (claim, expected) => {
    const status = hopper(claim).status;
    if (expected === "validated") expect(status).toBe("validated");
    else expect(status).not.toBe("validated");
  });
  it.each([
    ["NVIDIA has invested USD 76.7 billion in research and development since its inception.", "unvalidated"],
    ["NVIDIA has invested more than USD 76.7 billion in research and development since its inception.", "unvalidated"],
    ["NVIDIA has invested over USD 76.7 billion in research and development since its inception.", "validated"],
  ])("R&D: %s", (claim, expected) => {
    const status = rnd(claim).status;
    if (expected === "validated") expect(status).toBe("validated");
    else expect(status).not.toBe("validated");
  });
  it.each([
    // [source, claim, expected]: the source states a bound and the claim an exact figure.
    ["The program has more than USD 25 billion of commitments.", "The program has USD 25 billion of commitments.", "unvalidated"],
    ["Liquidity was at least USD 40 billion.", "Liquidity was USD 40 billion.", "unvalidated"],
    ["Churn was at most 5%.", "Churn was 5%.", "unvalidated"],
    // The claim states a bound the source does not (also unvalidated before the fix, by D-63's word test).
    ["The program has USD 25 billion of commitments.", "The program has more than USD 25 billion of commitments.", "unvalidated"],
    ["Severance costs will be $110 million.", "Severance costs will be no more than $110 million.", "unvalidated"],
    // Same comparator on both sides, and exact on both sides (controls).
    ["The program has more than USD 25 billion of commitments.", "The program has more than USD 25 billion of commitments.", "validated"],
    ["Liquidity was at least USD 40 billion.", "Liquidity was at least USD 40 billion.", "validated"],
    ["Churn was at most 5%.", "Churn was at most 5%.", "validated"],
    ["Severance costs will be no more than $110 million.", "Severance costs will be no more than $110 million.", "validated"],
    ["Liquidity was USD 40 billion.", "Liquidity was USD 40 billion.", "validated"],
  ])("synthetic: source %s, claim %s", (source, claim, expected) => {
    const status = onExcerpt(claim, source, "x:synthetic", "2026-07-26").status;
    if (expected === "validated") expect(status).toBe("validated");
    else expect(status).not.toBe("validated");
  });
});

// Fix round 1 (review of AI-409): hedges, symbols, "greater than" and negations.
describe("AI-409 round 1 spellings", () => {
  it.each([
    ["at least about $5 billion", "lower"],
    ["at least approximately $5 billion", "lower"],
    ["more than about $5 billion", "lower"],
    ["less than roughly $5 billion", "upper"],
    ["no more than around $5 billion", "upper"],
    ["≥ $5 billion", "lower"],
    ["> $5 billion", "lower"],
    [">$5 billion", "lower"],
    ["greater than $5 billion", "lower"],
    ["≤ $5 billion", "upper"],
    ["< $5 billion", "upper"],
    ["not more than $5 billion", "upper"],
    ["no more than $5 billion", "upper"],
    ["not less than 5%", "lower"],
    ["no less than $5 billion", "lower"],
    ["no fewer than 5 million users", "lower"],
    // Controls that read the same as before.
    ["more than $5 billion", "lower"],
    ["less than $5 billion", "upper"],
    ["about $5 billion", null],
    ["about 5 billion", null],
  ])("reads the bound of %s", (text, bound) => {
    expect(readProseQuantities(text)[0].bound).toBe(bound);
  });
  it("keeps the bound the same figure value", () => {
    expect(readProseQuantities("≥ $5 billion")[0].value).toBe(5e9);
  });
  const SPELLINGS = ["at least about", "at least approximately", "more than about", "≥", ">", "greater than", "≤", "<",
    "not more than", "no less than", "not less than", "no fewer than"];
  it.each(SPELLINGS)("an exact claim is not validated against a source stating the bound spelled: %s", (spelling) => {
    expect(onExcerpt("Revenue was $5 billion.", `Revenue was ${spelling} $5 billion.`, "x:synthetic", "2026-07-26").status).not.toBe("validated");
  });
  it.each(["at least about", "≥", "greater than", "not more than", "no less than", "up to"])(
    "control: the same-spelling bound validates against its source: %s", (spelling) => {
      const text = `Revenue was ${spelling} $5 billion.`;
      expect(onExcerpt(text, text, "x:synthetic", "2026-07-26").status).toBe("validated");
    });
  it("control: exact against exact validates", () => {
    expect(onExcerpt("Revenue was $5 billion.", "Revenue was $5 billion.", "x:synthetic", "2026-07-26").status).toBe("validated");
  });
  // Fix round 2: strict and inclusive bounds. A strict source bound implies a strict or inclusive claim
  // bound of the same direction; an inclusive source bound implies only an inclusive claim bound.
  it.each([
    ["more than", true], ["over", true], ["above", true], ["exceeding", true], ["in excess of", true], ["greater than", true], [">", true],
    ["at least", false], ["a minimum of", false], ["no less than", false], ["not less than", false], ["no fewer than", false], ["≥", false],
    ["less than", true], ["under", true], ["below", true], ["fewer than", true], ["<", true],
    ["up to", false], ["at most", false], ["no more than", false], ["not more than", false], ["a maximum of", false], ["not to exceed", false], ["≤", false],
  ])("reads the strictness of %s", (spelling, strict) => {
    expect(readProseQuantities(`${spelling} $5 billion`)[0].strict).toBe(strict);
  });
  it("a point figure is not strict", () => {
    expect(readProseQuantities("$5 billion")[0].strict).toBe(false);
  });
  it.each([
    ["more than", "at least", "unvalidated"],
    [">", "≥", "unvalidated"],
    // Phrases with different words stay unchecked: D-63's word test still needs the claim's words in the source clause
    // ("at least" is not in "more than"; "up" is a direction word). The implication rule is exercised by the symbol pairs.
    ["at least", "more than", "unvalidated"],
    ["≥", ">", "validated"],
    ["up to", "less than", "unvalidated"],
    ["less than", "up to", "unvalidated"],
    ["≤", "<", "validated"],
    ["<", "≤", "unvalidated"],
    // Opposite directions never validate.
    ["at least", "up to", "unvalidated"],
    ["less than", "more than", "unvalidated"],
  ])("claim %s against source %s", (claimWord, sourceWord, expected) => {
    const status = onExcerpt(`Revenue was ${claimWord} $5 billion.`, `Revenue was ${sourceWord} $5 billion.`, "x:synthetic", "2026-07-26").status;
    if (expected === "validated") expect(status).toBe("validated");
    else expect(status).not.toBe("validated");
  });
  it("reads a long padded tail in under 250 ms", () => {
    const t0 = performance.now();
    readProseQuantities(`at least ${" ".repeat(50_000)}$5 billion ${"x ".repeat(5_000)} more than ${" ".repeat(50_000)}about${" ".repeat(50_000)}$6`);
    expect(performance.now() - t0).toBeLessThan(250);
  });
});

// Final review (2026-10-28, AI-409): a bound states no value, so a bound claim whose figure differs from the source bound's is
// unverified, never contradicted. On NVIDIA's 10-K Item 1 "over $76.7 billion" implies the true "over USD 70 billion", which the
// value check marked contradicted. An exact claim against an exact source is unchanged.
describe("final review: a bound claim is never contradicted by a value difference (AI-409)", () => {
  it.each([
    ["NVDA R&D: a lower figure the source implies", "NVIDIA has invested over USD 70 billion in research and development since its inception."],
    ["NVDA R&D: a higher figure the source does not settle", "NVIDIA has invested over USD 80 billion in research and development since its inception."],
  ])("%s", (_name, claim) => {
    expect(rnd(claim)).toMatchObject({ status: "unchecked", reason: "text-context-mismatch" });
  });
  it.each([
    ["forward-looking", "Revenue is expected to be more than USD 90 billion.", "Revenue is expected to be more than $100 billion."],
    ["forward-looking with its quarter", "Revenue is expected to be more than USD 90 billion in Q3 FY2027.",
      "Revenue is expected to be more than $100 billion in the third quarter of fiscal 2027."],
    ["an upper bound", "Customer A accounted for less than 20% of revenue.", "Customer A accounted for less than 10% of revenue."],
  ])("synthetic, %s: not contradicted", (_name, claim, source) => {
    expect(onExcerpt(claim, source, "x:synthetic", "2026-07-26").status).toBe("unchecked");
  });
  it("control: a same-value bound validates", () => {
    expect(rnd("NVIDIA has invested over USD 76.7 billion in research and development since its inception.").status).toBe("validated");
    expect(onExcerpt("Revenue is expected to be more than USD 100 billion.", "Revenue is expected to be more than $100 billion.", "x:synthetic", "2026-07-26").status)
      .toBe("validated");
  });
  it("control: an exact claim against an exact source with another value is still contradicted", () => {
    expect(onExcerpt("Revenue was USD 6.2 billion.", "Revenue was $5.0 billion.", "x:synthetic", "2026-07-26")).toMatchObject({ status: "contradicted", reason: "value-mismatch" });
  });
});
