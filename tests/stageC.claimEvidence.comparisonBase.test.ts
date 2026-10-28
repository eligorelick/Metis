/**
 * AI-503 / AI-503-V1 / AI-503-V2: a figure the source introduces with "from", "compared with/to", "versus", "vs." or "against"
 * is a comparison base, and a base binds only a base. In "<direction word> from $A ... to $B" the metric and the direction
 * belong to $B, so "commitments increased to USD 279 billion" is read against $279 billion, not the $119 billion the move
 * started from. Where no direction word governs "from" (a range, "went from", a verb far from the figure) the end figure is
 * not given the metric and the claim stays unchecked.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readContextForTests, readProseQuantities, validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { TextExcerpt } from "@/pipeline/stageC/payload";

const ex = (text: string, title: string, source = "edgar:10-Q item2", asOf = "2026-07-26"): TextExcerpt =>
  ({ title, text, source, asOf, truncated: false, originalChars: text.length });
const onExcerpt = (claim: string, excerpt: TextExcerpt, ignoreWords: readonly string[] = []): string =>
  validateClaimNumericSupport({ label: "FACT", text: claim, source: excerpt.source, asOf: excerpt.asOf },
    { excerpts: [excerpt], sourceId: excerpt.source, reportingCurrency: "USD", ignoreWords }).status;

const squash = (text: string): string => text.replace(/\s+/g, " ");
const quoted = (file: string, first: string, last: string): string => {
  const text = squash(readFileSync(file, "utf8"));
  expect(text.indexOf(first)).toBeGreaterThanOrEqual(0);
  const sentence = text.slice(text.indexOf(first), text.indexOf(last, text.indexOf(first)) + last.length);
  expect(text.split(sentence)).toHaveLength(2);
  return sentence;
};
const CFO_TEXT = quoted("fixtures/edgar/nvda-current-reports/q2fy27-ex99-2.txt", "Our commitments increased from $119 billion", "procurement of memory.");
const MDA_TEXT = quoted("fixtures/edgar/nvda-periodic-sections/nvda-10q-q2fy27-item2.txt", "We have significantly increased our supply and capacity commitments from $119 billion", "to meet future demand.");
const CFO_TITLE = "8-K EX-99.2 — CFO commentary, Q2 FY2027, quarter ended 2026-07-26 (8-K 0001045810-26-000073; filed 2026-08-26)";
const MDA_TITLE = "10-Q Item 2 — MD&A (10-Q 0001045810-26-000075; reporting period ended 2026-07-26 (Q2 FY2027); filed 2026-08-26)";
const T = "10-Q Part I Item 2 — MD&A (reporting period ended 2026-07-26 (Q2 FY2027))";
const CFO = ex(CFO_TEXT, CFO_TITLE, "edgar:8-K EX-99.2", "2026-08-26");
const MDA = ex(MDA_TEXT, MDA_TITLE);
const AMZN = ex("• Operating income increased to $27.5 billion in the second quarter, compared with $19.2 billion in second quarter 2025. •",
  "8-K EX-99.1 - earnings release, quarter ended 2026-06-30 (8-K 0001018724-26-000024; filed 2026-07-30)", "edgar:8-K EX-99.1", "2026-07-30");

type Expect = "validated" | "unchecked" | "contradicted" | "!validated" | "!contradicted";
const holds = (status: string, expected: Expect): boolean => expected.startsWith("!") ? status !== expected.slice(1) : status === expected;

const CFO_SENTENCE = "Our commitments increased from $119 billion last quarter to $279 billion, primarily related to the procurement of memory.";
const INV = ex("Inventory increased from $25.8 billion in the prior quarter to $31.6 billion, reflecting new product ramps.", T);
const COMMIT_Q1 = ex("Our commitments increased from $119 billion at the end of the first quarter to $279 billion, primarily related to the procurement of memory.", T);
const INV_BARE = ex("Inventory increased from $25.8 billion to $31.6 billion, reflecting new product ramps.", T);
const INV_AGO = ex("Inventory increased from $25.8 billion a year ago to $31.6 billion, reflecting new product ramps.", T);
const INV_WENT = ex("Inventory went from $25.8 billion a year ago to $31.6 billion, reflecting new product ramps.", T);
const GM_IMPROVED = ex("Gross margin improved from 72.7% a year ago to 75.1%, reflecting a favorable mix.", T);
const GM_COLON = ex("Gross margin: from 72.7% in the prior quarter to 75.1% in the current quarter.", T);
const INV_TO_FIRST = ex("Inventory increased to $31.6 billion from $25.8 billion a year ago, reflecting new product ramps.", T);
const INV_COMPARED = ex("Inventory increased to $31.6 billion, compared with $25.8 billion a year ago.", T);
const RANGE = ex("Operating expenses are expected to range from $4.0 billion to $4.2 billion.", T);
const TWO_MOVES = ex("Operating income increased from $19.2 billion in Q2 2025 to $27.5 billion in Q2 2026, and increased from $37.6 billion for the six months ended June 30, 2025 to $51.3 billion for the six months ended June 30, 2026.", T);
const PROCEEDS = ex("Proceeds from $5.0 billion of senior notes were used to repay debt.", T);
const BALANCE = ex("Balance sheet: inventory increased from $25.8 billion in the prior quarter to $31.6 billion.", T);
const DATED = ex("Our commitments increased from $119 billion last quarter to $279 billion as of July 26, 2026.", T);
const SPACED = ex("Our commitments increased from $ 119 billion last quarter to $ 279 billion, primarily related to the procurement of memory.", CFO_TITLE, "edgar:8-K EX-99.2", "2026-08-26");

describe("AI-503 sources", () => {
  it("quotes the fixtures once", () => {
    expect(CFO_TEXT).toBe(CFO_SENTENCE);
    expect(MDA_TEXT).toBe("We have significantly increased our supply and capacity commitments from $119 billion last quarter to $279 billion as of July 26, 2026 to meet future demand.");
  });
});

describe("AI-503 / AI-503-V1 / AI-503-V2: a comparison base binds only a comparison base; a move's end takes the move's metric", () => {
  it.each(([
    [1, "CFO", CFO, "Our commitments increased to USD 279 billion.", [], "validated"],
    [2, "CFO", CFO, "NVIDIA's commitments rose to USD 279 billion.", ["NVIDIA"], "validated"],
    [3, "CFO", CFO, "Commitments increased to USD 279 billion in Q2 FY2027.", [], "validated"],
    [4, "CFO", CFO, "Our commitments increased to USD 119 billion.", [], "contradicted"],
    [5, "CFO", CFO, "Our commitments were USD 279 billion.", [], "unchecked"],
    [6, "CFO", CFO, "Our commitments increased from USD 119 billion.", [], "!contradicted"],
    [7, "CFO spaced dollar", SPACED, "Our commitments increased to USD 279 billion.", [], "validated"],
    [8, "MDA", MDA, "Supply and capacity commitments as of 2026-07-26 were USD 279 billion.", [], "unchecked"],
    [9, "MDA", MDA, "Supply and capacity commitments were USD 279 billion as of July 26, 2026.", [], "unchecked"],
    [10, "MDA", MDA, "Supply and capacity commitments as of 2026-07-26 were USD 119 billion.", [], "unchecked"],
    [11, "inventory prior quarter", INV, "Inventory increased to USD 31.6 billion.", [], "validated"],
    [12, "inventory prior quarter", INV, "Inventory increased to USD 25.8 billion.", [], "contradicted"],
    [13, "inventory prior quarter (control: a base claim binds the base)", INV, "Inventory increased from USD 25.8 billion.", [], "validated"],
    [14, "end of the first quarter", COMMIT_Q1, "Our commitments increased to USD 279 billion.", [], "validated"],
    [15, "end of the first quarter", COMMIT_Q1, "Our commitments increased to USD 119 billion.", [], "contradicted"],
    [16, "gross margin colon", GM_COLON, "Gross margin was 75.1%.", [], "unchecked"],
    [17, "gross margin colon", GM_COLON, "Gross margin was 72.7%.", [], "unchecked"],
    [18, "bare from-to", INV_BARE, "Inventory increased to USD 31.6 billion.", [], "validated"],
    [19, "bare from-to", INV_BARE, "Inventory increased to USD 25.8 billion.", [], "contradicted"],
    [20, "a year ago", INV_AGO, "Inventory increased to USD 31.6 billion.", [], "validated"],
    [21, "a year ago", INV_AGO, "Inventory increased to USD 25.8 billion.", [], "contradicted"],
    [22, "went from", INV_WENT, "Inventory was USD 31.6 billion.", [], "unchecked"],
    [22, "went from", INV_WENT, "Inventory was USD 25.8 billion.", [], "unchecked"],
    [23, "improved from", GM_IMPROVED, "Gross margin was 75.1%.", [], "unchecked"],
    [23, "improved from", GM_IMPROVED, "Gross margin was 72.7%.", [], "unchecked"],
    [24, "to-first (AI-503-V2)", INV_TO_FIRST, "Inventory increased from USD 25.8 billion.", [], "unchecked"],
    [25, "to-first (AI-503-V2)", INV_TO_FIRST, "Inventory increased from USD 31.6 billion.", [], "unchecked"],
    [26, "to-first control", INV_TO_FIRST, "Inventory increased to USD 31.6 billion.", [], "validated"],
    [26, "to-first control", INV_TO_FIRST, "Inventory was USD 31.6 billion.", [], "unchecked"],
    [27, "compared with", INV_COMPARED, "Inventory increased from USD 25.8 billion.", [], "unchecked"],
    [27, "compared with", INV_COMPARED, "Inventory increased to USD 31.6 billion.", [], "validated"],
    [28, "AMZN compared with", AMZN, "Operating income increased from USD 19.2 billion in second quarter 2025.", [], "!contradicted"],
    [28, "AMZN compared with", AMZN, "Operating income increased from USD 27.5 billion in second quarter 2025.", [], "!validated"],
    [29, "range", RANGE, "Operating expenses are expected to be USD 4.0 billion.", [], "!validated"],
    [29, "range", RANGE, "Operating expenses are expected to be USD 4.2 billion.", [], "!validated"],
    [30, "two moves", TWO_MOVES, "Operating income increased to USD 27.5 billion in Q2 2026.", [], "!contradicted"],
    [30, "two moves", TWO_MOVES, "Operating income increased to USD 19.2 billion in Q2 2026.", [], "!validated"],
    [31, "source from", PROCEEDS, "Proceeds were USD 5.0 billion.", [], "unchecked"],
    [32, "colon lead-in", BALANCE, "Inventory increased to USD 31.6 billion.", [], "validated"],
    [32, "colon lead-in", BALANCE, "Inventory increased to USD 25.8 billion.", [], "contradicted"],
    [33, "dated move end", DATED, "Our commitments increased to USD 279 billion as of July 26, 2026.", [], "validated"],
    [33, "dated move end", DATED, "Our commitments were USD 279 billion as of July 26, 2026.", [], "unchecked"],
  ] as const).map(([row, name, excerpt, claim, ignore, expected]) => [row, name, claim, excerpt, ignore, expected] as const))("row %i (%s): %s", (_row, _name, claim, excerpt, ignore, expected) => {
    const status = onExcerpt(claim, excerpt, ignore);
    expect(holds(status, expected), `${claim} -> ${status}, wanted ${expected}`).toBe(true);
  });

  it("reads the base flag on the source and on the claim", () => {
    const cfo = readProseQuantities(CFO_SENTENCE);
    expect(readContextForTests(CFO_SENTENCE, cfo[0]!, [...cfo], true).base).toBe(true);
    expect(readContextForTests(CFO_SENTENCE, cfo[1]!, [...cfo], true).base).toBe(false);
    const toFirst = "Inventory increased to $31.6 billion from $25.8 billion a year ago, reflecting new product ramps.";
    const inv = readProseQuantities(toFirst);
    expect(readContextForTests(toFirst, inv[1]!, [...inv], true).base).toBe(true);
    expect(readContextForTests(toFirst, inv[0]!, [...inv], true).base).toBe(false);
    for (const [claim, base] of [["Inventory increased from USD 25.8 billion.", true], ["Inventory increased to USD 25.8 billion.", false]] as const) {
      const q = readProseQuantities(claim);
      expect(readContextForTests(claim, q[0]!, [...q]).base).toBe(base);
    }
    const spacedText = "Commitments increased from $ 119 billion last quarter to $ 279 billion.";
    const spaced = readProseQuantities(spacedText);
    expect(readContextForTests(spacedText, spaced[0]!, [...spaced], true).base).toBe(true);
  });

  it("D-63 control: a level with a ', up from' comparison still validates", () => {
    const sentence = "Inventory was $31.6 billion, up from $25.8 billion sequentially, as we prepare for the next generation of products.";
    expect(onExcerpt("Inventory was USD 31.6 billion.", ex(sentence, T))).toBe("validated");
  });
});

// Fix round 1 (2026-10-28 rulings 1 and 2): a move end's description is the head plus only its own after-text, and the head is
// withheld unless the text between $A and "to" is only the time words listed in the code.
describe("AI-503 fix round 1: words that describe $A never describe $B, and a head needs a bare time-only between-text", () => {
  const inv = (text: string) => ex(text, T);
  it.each([
    ["ruling 1: last quarter", CFO, "Our commitments increased to USD 279 billion last quarter.", "!validated"],
    ["ruling 1: last quarter start", CFO, "Our commitments increased to USD 119 billion last quarter.", "!contradicted"],
    ["ruling 1: a year ago", INV_AGO, "Inventory increased to USD 31.6 billion a year ago.", "!validated"],
    ["ruling 1: a year ago start", INV_AGO, "Inventory increased to USD 25.8 billion a year ago.", "!contradicted"],
    ["ruling 1: rose a year ago", INV_AGO, "Inventory rose to USD 31.6 billion a year ago.", "!validated"],
    ["ruling 1: prior quarter", INV, "Inventory increased to USD 31.6 billion in the prior quarter.", "!validated"],
    ["ruling 1: prior quarter start", INV, "Inventory increased to USD 25.8 billion in the prior quarter.", "!contradicted"],
    ["ruling 1: first quarter", COMMIT_Q1, "Our commitments increased to USD 279 billion at the end of the first quarter.", "!validated"],
    ["ruling 1: first quarter start", COMMIT_Q1, "Our commitments increased to USD 119 billion at the end of the first quarter.", "!contradicted"],
    ["ruling 2: then fell", inv("Inventory rose from $25.8 billion, then fell to $20.1 billion."), "Inventory rose to USD 20.1 billion.", "!validated"],
    ["ruling 2: due to", inv("Revenue increased from $35.0 billion a year ago, primarily due to Data Center revenue growing to $41.1 billion."), "Revenue increased to USD 41.1 billion.", "!validated"],
    ["ruling 2: as grew", inv("Revenue increased from $35.0 billion, as Data Center revenue grew to $41.1 billion."), "Revenue increased to USD 41.1 billion.", "!validated"],
    ["ruling 2: driven by", inv("Revenue increased from $35.0 billion a year ago, driven by Data Center revenue that rose to $41.1 billion."), "Revenue increased to USD 41.1 billion.", "!validated"],
    ["ruling 2: memory rising", inv("Our commitments increased from $119 billion last quarter, with memory commitments rising to $160 billion."), "Our commitments increased to USD 160 billion.", "!validated"],
    ["ruling 2: before declining", inv("Inventory increased from $25.8 billion last quarter before declining to $20.1 billion."), "Inventory declined to USD 20.1 billion.", "!contradicted"],
    ["ruling 2: though declined", inv("Gross margin expanded from 72.7% last quarter, though it declined to 70.0%."), "Gross margin declined to 70.0%.", "!contradicted"],
    ["ruling 2: though declined false", inv("Gross margin expanded from 72.7% last quarter, though it declined to 70.0%."), "Gross margin expanded to 70.0%.", "!validated"],
    // Controls: these true move ends keep validating.
    ["control: decreased", inv("Inventory decreased from $31.6 billion a year ago to $25.8 billion, reflecting lower demand."), "Inventory decreased to USD 25.8 billion.", "validated"],
    ["control: percent", inv("Gross margin increased from 72.7% a year ago to 75.1%, reflecting a favorable mix."), "Gross margin increased to 75.1%.", "validated"],
    ["control: sequentially", inv("Inventory increased from $25.8 billion sequentially to $31.6 billion, reflecting new product ramps."), "Inventory increased to USD 31.6 billion.", "validated"],
  ] as const)("%s", (_name, excerpt, claim, expected) => {
    const status = onExcerpt(claim, excerpt);
    expect(holds(status, expected), `${claim} -> ${status}, wanted ${expected}`).toBe(true);
  });
});
