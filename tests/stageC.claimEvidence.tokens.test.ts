/**
 * AI-304, AI-304-V1, AI-304-V3: scale, unit and currency-code tokens are whole
 * words in the prose quantity reader. The "M" of "Marketable" is not millions,
 * the "bps" of a record is basis points, and the AUD of "fraud" is no currency.
 */
import { describe, expect, it } from "vitest";
import { readProseQuantities, validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { TextExcerpt } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";

const guidance: NumericProvenanceRecord = {
  id: "computed.guidance.gross-margin-actual-vs-prior-guidance-midpoint", kind: "computed", label: "gross margin actual versus prior guidance midpoint",
  value: 0.08, unit: "percentage-points", currency: null, period: null, asOf: "2026-08-26", origin: "computed", formulaVersion: null, displayPrecision: 2,
};
const onRecord = (text: string) => validateClaimNumericSupport({ label: "FACT", text, source: guidance.id, asOf: guidance.asOf },
  { record: guidance, excerpts: [], sourceId: guidance.id, reportingCurrency: "USD" }).status;
const onExcerpt = (text: string, excerptText: string) => {
  const excerpt: TextExcerpt = { title: "10-Q", text: excerptText, source: "x:t", asOf: "2026-08-26", truncated: false, originalChars: excerptText.length };
  return validateClaimNumericSupport({ label: "FACT", text, source: "x:t", asOf: "2026-08-26" },
    { excerpts: [excerpt], sourceId: "x:t", reportingCurrency: "USD" }).status;
};
const HDR = "Jul 26, 2026 Jan 25, 2026 ($ in millions)";
const SHEET = "Jul 26, 2026 Jan 25, 2026 (In millions)";
const LIABILITIES = `${SHEET} Total liabilities $ 32,274 $ 22,750 Shareholders' equity 70,013 79,327`;

describe("AI-304 whole-word scale tokens", () => {
  it("does not read the M of Marketable as millions", () => {
    expect(onExcerpt("Cash and cash equivalents as of 2026-07-26 were USD 22.44 billion.",
      `${SHEET} Cash and cash equivalents $ 22,443 $ 10,605 Marketable debt securities 34,143 39,065`)).toBe("validated");
    // Control: the other row still resolves.
    expect(onExcerpt("Other debt securities as of 2026-07-26 were USD 5.0 billion.",
      `${SHEET} Cash and cash equivalents $ 22,443 $ 10,605 Other debt securities $ 5,000 $ 4,000`)).toBe("validated");
  });
  it.each([
    ["8 basis points", "The gross margin actual versus prior guidance midpoint was 8 basis points.", "validated"],
    ["8 bps", "The gross margin actual versus prior guidance midpoint was 8 bps.", "validated"],
    ["80 basis points", "The gross margin actual versus prior guidance midpoint was 80 basis points.", "contradicted"],
    ["0.08 percentage-point", "The gross margin actual versus prior guidance midpoint was 0.08 percentage-point.", "validated"],
    ["0.80 percentage-point", "The gross margin actual versus prior guidance midpoint was 0.80 percentage-point.", "contradicted"],
    ["a 0.08 percentage-point (beat is a content word the record does not name)", "The gross margin actual versus prior guidance midpoint was a 0.08 percentage-point beat.", "unchecked"],
    ["0.08 percentage points (control)", "The gross margin actual versus prior guidance midpoint was 0.08 percentage points.", "validated"],
  ])("reads %s on a percentage-point record", (_name, text, status) => {
    expect(onRecord(text)).toBe(status);
  });
});

describe("AI-304-V1 row labels", () => {
  it("binds a two-row sheet to the Total liabilities row", () => {
    expect(onExcerpt("Total liabilities as of 2026-01-25 were USD 22.75 billion.", LIABILITIES)).toBe("validated");
  });
  it("never contradicts a claim against a total-liabilities-and-equity row", () => {
    expect(onExcerpt("Total liabilities as of 2026-01-25 were USD 22.75 billion.",
      `${LIABILITIES} Total liabilities and shareholders' equity $ 102,287 $ 102,077`)).not.toBe("contradicted");
  });
  it("treats 'Percentages' like any other word after the figure", () => {
    const sheet = (word: string) => `${SHEET} Total revenue $ 26,063 $ 25,111 ${word} of revenue 100 100`;
    const claim = "Total revenue as of 2026-01-25 was USD 25.11 billion.";
    expect(onExcerpt(claim, sheet("Percentages"))).toBe(onExcerpt(claim, sheet("Ratios")));
  });
  it("keeps the Stockholders' two-row and sheet variants (control)", () => {
    const rows = `${SHEET} Total liabilities $ 32,274 $ 22,750 Stockholders' equity 70,013 79,327`;
    expect(onExcerpt("Total liabilities as of 2026-01-25 were USD 22.75 billion.", rows)).toBe("validated");
    expect(onExcerpt("Total liabilities as of 2026-01-25 were USD 22.75 billion.",
      `${rows} Total liabilities and stockholders' equity $ 102,287 $ 102,077`)).not.toBe("contradicted");
  });
});

describe("AI-304-V3 currency codes are whole words", () => {
  it.each([
    ["fraud", "Accrued liabilities for fraud as of 2026-07-26 were USD 1.23 billion.", `${HDR} Accrued liabilities for fraud 1,234 1,100 Other accrued liabilities 900 800`, "validated"],
    ["crude oils", "Inventories of crude oils as of 2026-07-26 were USD 1.23 billion.", `${HDR} Inventories of crude oils 1,234 1,100 Other inventories 900 800`, "validated"],
    ["accrued fraud liabilities (control)", "Accrued fraud liabilities as of 2026-07-26 were USD 1.23 billion.", `${HDR} Accrued fraud liabilities 1,234 1,100 Other accrued liabilities 900 800`, "validated"],
    ["crude oil (control)", "Inventories of crude oil as of 2026-07-26 were USD 1.23 billion.", `${HDR} Inventories of crude oil 1,234 1,100 Other inventories 900 800`, "validated"],
    ["crude oilx (control)", "Inventories of crude oilx as of 2026-07-26 were USD 1.23 billion.", `${HDR} Inventories of crude oilx 1,234 1,100 Other inventories 900 800`, "validated"],
  ])("%s", (_name, claim, table, status) => {
    expect(onExcerpt(claim, table)).toBe(status);
  });
});

describe("token readings", () => {
  const first = (text: string) => readProseQuantities(text)[0]!;
  it.each([
    ["$5M", 5e6, "currency", null],
    ["$5B", 5e9, "currency", null],
    ["5 bn", 5e9, null, null],
    ["5%", 5, "percent", null],
    ["5 percent", 5, "percent", null],
    ["5 shares", 5, "shares", null],
    ["10 days", 10, "days", null],
    ["EUR5bn", 5e9, "currency", "EUR"],
    ["AUD 5 million", 5e6, "currency", "AUD"],
  ])("reads %s", (text, value, unit, currency) => {
    const quantity = first(text);
    expect(quantity.value).toBe(value);
    expect(quantity.unit).toBe(unit);
    expect(quantity.currency).toBe(currency);
  });
  it("reads the x of 1.2x-1.5x as a unit (a hyphen before a digit is allowed)", () => {
    // The range's upper bound stays unread, as before: its "-" follows a letter, so it is no figure.
    expect(readProseQuantities("1.2x-1.5x").map((quantity) => [quantity.value, quantity.unit])).toEqual([[1.2, "ratio"]]);
  });
  it("does not read a hyphenated compound as a unit", () => {
    expect(first("1,234 Share-based compensation").unit).toBeNull();
  });
  it("keeps period phrases out of the quantity list", () => {
    expect(readProseQuantities("Revenue for the trailing 12 months was $165.2 billion.")).toHaveLength(1);
    expect(readProseQuantities("Revenue for the 6 months ended June 30, 2026 was $5.0 billion.")).toHaveLength(1);
  });
  it("reads a count before an m/b/k-initial word as a quantity", () => {
    const quantities = readProseQuantities("Revenue grew 12% across 5 key products.");
    expect(quantities.map((quantity) => [quantity.value, quantity.unit])).toEqual([[12, "percent"], [5, null]]);
  });
});

describe("AI-304 review round 1", () => {
  it.each(["Inventory covers 1.5 months of sales.", "Inventory covers 12.5 months of sales.", "Revenue came from a 120 months lease term."])(
    "reads no figure in the period phrase: %s", (text) => {
      expect(readProseQuantities(text)).toEqual([]);
    });
  it("keeps a figure beside a period phrase", () => {
    expect(readProseQuantities("In the 12 months revenue was $5.").map((quantity) => quantity.value)).toEqual([5]);
  });
  it.each([
    ["$5 mn", 5e6], ["$5mn", 5e6], ["€5 mln", 5e6], ["USD 5 Mn", 5e6], ["$5 mil", 5e6], ["5 mio", 5e6], ["$5 bln", 5e9], ["5 million", 5e6],
    ["5 markets", 5], ["$5 mils", 5], ["5 milestones", 5],
  ])("reads the scale of %s", (text, value) => {
    expect(readProseQuantities(text)[0]?.value).toBe(value);
  });
  it("reads basis points across a no-break space and a hyphen", () => {
    expect(readProseQuantities("a margin of 8 basis points")[0]).toMatchObject({ value: 0.08, unit: "percentage-points" });
    expect(readProseQuantities("a 25 basis-point cut")[0]).toMatchObject({ value: 0.25, unit: "percentage-points" });
  });
  it.each([["10x-ish", 10], ["5x-based", 5]])("keeps the ratio of %s", (text, value) => {
    expect(readProseQuantities(text).map((quantity) => [quantity.value, quantity.unit])).toEqual([[value, "ratio"]]);
  });
});
