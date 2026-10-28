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
