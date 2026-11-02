import { describe, expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload, TextExcerpt } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import frozen from "./fixtures/r7-figr-xhigh.json";

const row = (id: number) => frozen.rows.find(row => row.row === id)!;
const record = (id: number) => frozen.records.find(record => record.id === row(id).source)! as NumericProvenanceRecord;
const check = (id: number, text = row(id).claim, cited = record(id)) => validateClaimNumericSupport(
  { label: "FACT", text, source: row(id).source, asOf: cited.asOf },
  { record: cited, excerpts: frozen.filings as TextExcerpt[], sourceId: row(id).source, reportingCurrency: "USD" });

describe("R7 FIGR record vocabulary", () => {
  it.each([21, 44, 45, 53, 54, 58, 59, 72, 79, 81, 89, 91, 93, 94, 121, 122, 123, 125, 176, 189])(
    "matches the real metric and quantity in frozen row %i", id => {
      expect(check(id).status).toBe("validated");
      expect(check(id, row(id).claim, { ...record(id), value: record(id).value + Math.abs(record(id).value) * 0.2 + 1000 }).status).not.toBe("validated");
      const wrongDate = /202[56]-\d\d-\d\d|2026-10/.test(row(id).claim)
        ? row(id).claim.replace(/202[56]-\d\d-\d\d|2026-10/, "2024-01-01") : `For FY2024, ${row(id).claim}`;
      expect(check(id, wrongDate).status).not.toBe("validated");
      expect(check(id, row(id).claim, { ...record(id), unit: "days" }).status).not.toBe("validated");
    });
  it.each([
    [58, "Filed current assets to related parties at 2026-06-30 were USD 424.64 million."],
    [58, "Filed non-current debt to related parties at 2026-06-30 was USD 424.64 million."],
    [59, "Receivables from third-party loan owners at 2026-06-30 were USD 506.69 million."],
    [59, "Payables to related-party loan owners at 2026-06-30 were USD 506.69 million."],
    [21, "Trailing common earnings to market capitalization was 24.9x at the 2026-11-02 quote."],
    [21, "Market capitalization to forward common earnings was 24.9x at the 2026-11-02 quote."],
    [45, "Revenue CAGR over three years to 2025-12-31 was 48.7%."],
    [45, "Earnings CAGR over one year to 2025-12-31 was 48.7%."],
    [93, "Insider purchase transactions (Form 4 code S) numbered 104 in the four calendar quarters ended 2026-09-30."],
    [93, "Insider sale transactions (Form 4 code P) numbered 104 in the four calendar quarters ended 2026-09-30."],
    [93, "Insider sale transactions (Form 4 code) numbered 104 in the four calendar quarters ended 2026-09-30."],
    [93, "Insider sale transactions were discussed; purchase transactions numbered 104 in the four calendar quarters ended 2026-09-30."],
    [121, "Insider shares acquired, including awards and gifts received, totalled 764,604 shares in the four calendar quarters ended 2026-09-30."],
    [122, "Insider shares disposed, including open-market sales and gifts, totalled 9,787,254 shares in the four calendar quarters ended 2026-09-30."],
    [72, "The capex-to-revenue slope to 2025-12-31 was -2.1 percentage points."],
    [79, "Tangible book value to price was 3.5x at the 2026-11-02 quote."],
    [189, "The investment-grade option-adjusted spread was 3.44% on 2026-10-30."],
  ])("refuses a nearby but different metric in row %i: %s", (id, text) => {
    expect(check(id as number, text as string).status).not.toBe("validated");
  });
  it("converts an explicitly declared fraction and retains its value and unit", () => {
    expect(check(44, "Fundamentals evidence completeness was 65% as a fraction as of 2026-11-02.").status).toBe("validated");
    for (const value of ["66%", "0.65%", "65", "0.65x"])
      expect(check(44, `Fundamentals evidence completeness was ${value} as a fraction as of 2026-11-02.`).status).not.toBe("validated");
    expect(check(44, "Fundamentals evidence completeness was 65%.", { ...record(44), unitScale: undefined }).status).not.toBe("validated");
  });
  it("binds below-high distance to the signed producer without treating it as a bound", () => {
    expect(check(22).status).toBe("validated");
    for (const text of [
      row(22).claim.replace("71.9", "72.9"), row(22).claim.replace("below", "above"),
      row(22).claim.replace("high", "low"), row(22).claim.replace("52-week", "26-week"),
      row(22).claim.replace("2026-11-02", "2026-10-02"), row(22).claim.replace("was", "was not"),
      "The share price fell 71.9% from its 52-week high as of 2026-11-02.",
    ]) expect(check(22, text).status).not.toBe("validated");
  });
  it("retains a scope qualifier that the real claim omits", () => {
    expect(check(80).status).not.toBe("validated"); // economic-price approximation omitted
    expect(check(124).status).not.toBe("validated"); // selected rows may overlap omitted
  });
});

describe("R7 FIGR fiscal context", () => {
  const replay = async (id: number, text = row(id).claim, filings = frozen.filings) => {
    const cited = record(id);
    const payload = { provenanceRegistry: [cited], citationRegistry: [], filings } as unknown as ContextPayload;
    return (await runVerifyPass({} as PassDeps, payload, {
      claims: [{ label: "FACT", text, source: cited.id, asOf: cited.asOf }],
    })).log.find(entry => entry.path === "claims[0]")!;
  };
  it.each([23, 31, 88, 170, 171, 172, 174, 175])("uses the filed calendar fiscal basis for row %i", async id => {
    expect(await replay(id)).toMatchObject({ validationStatus: "validated", outcome: "unverified", claimSupportStatus: "numeric-only" });
    expect((await replay(id, row(id).claim.replace(/FY202\d|2025-12-31/, "FY2024"))).validationStatus).not.toBe("validated");
    expect((await replay(id, row(id).claim, [])).validationStatus).not.toBe("validated");
    expect((await replay(id, row(id).claim.replace(/886.33|1.17|1.40|512.30|1.15|was 3|12.3%/, "999"))).validationStatus).not.toBe("validated");
  });
  it("checks both Piotroski coverage counts and the variant", async () => {
    for (const text of [row(23).claim.replace("5 of the 9", "6 of the 9"), row(23).claim.replace("5 of the 9", "5 of the 8"), row(23).claim.replace("financial-variant", "industrial-variant")])
      expect((await replay(23, text)).validationStatus).not.toBe("validated");
  });
  it("does not derive a calendar fiscal basis from a filing date", async () => {
    const filings = frozen.filings.map(excerpt => ({ ...excerpt, title: "10-K filed 2025-12-31 (FY2025)" }));
    expect((await replay(31, row(31).claim, filings)).validationStatus).not.toBe("validated");
  });
  it("keeps conflicting fiscal metadata and another annual producer outside the reading", async () => {
    const conflicting = frozen.filings.map(excerpt => ({ ...excerpt, title: excerpt.title.replace("2025-12-31 (FY2025)", "2025-09-30 (FY2025)") }));
    expect((await replay(31, row(31).claim, conflicting)).validationStatus).not.toBe("validated");
    expect(check(23, row(23).claim, { ...record(23), period: "2026-06-30" }).status).not.toBe("validated");
  });
});

describe("R7 FIGR traced periods", () => {
  const traced = async (id: number, period: string, column?: string, filings = frozen.filings) => {
    const cited = record(id);
    const number = { value: cited.value, unit: cited.unit, currency: cited.currency, period, source: cited.id, asOf: cited.asOf, verified: null };
    const report = column ? { fundamentals: { growthTable: [{ label: cited.label, values: [{ period: column, value: number }] }] } } : { number };
    return (await runVerifyPass({} as PassDeps, { provenanceRegistry: [cited], citationRegistry: [], filings } as unknown as ContextPayload, report)).log.find(e => e.claim.startsWith(`${cited.value} `))!;
  };
  it.each([2, 3, 4, 5, 6, 7, 8, 9, 10])("establishes calendar fiscal columns from the filed annual basis for row %i", async id => {
    const date = record(id).period!;
    const column = `Q${Number(date.slice(5, 7)) / 3} FY${date.slice(0, 4)}`;
    expect((await traced(id, date, column)).validationStatus).toBe("validated");
    expect((await traced(id, date, column.replace(/Q\d/, "Q1").replace(/FY\d{4}/, "FY2024"))).validationStatus).not.toBe("validated");
    expect((await traced(id, date, column, [])).validationStatus).not.toBe("validated");
  });
  it.each([18, 19])("matches both endpoints and the TTM basis in the real cash bridge row %i", async id => {
    const period = "ttm: 2025-07-01 to 2026-06-30";
    expect((await traced(id, period)).validationStatus).toBe("validated");
    for (const wrong of [period.replace("2025-07-01", "2025-06-01"), period.replace("2026-06-30", "2026-09-30"), "ttm: 2026-06-30 to 2025-07-01", period.replace("ttm", "ytd")])
      expect((await traced(id, wrong)).validationStatus).not.toBe("validated");
  });
  it("retains the previously matched quarterly year-over-year growth claim", () => {
    expect(check(4, "Revenue growth year over year for the quarter ended 2026-06-30 was 112.7%.").status).toBe("validated");
  });
});

describe("R7 FIGR excerpt bindings", () => {
  const excerptCheck = (id: number, text = row(id).claim, filings = frozen.filings) => {
    const excerpt = filings.find(excerpt => excerpt.source === row(id).source)!;
    return validateClaimNumericSupport({ label: "FACT", text, source: excerpt.source, asOf: excerpt.asOf },
      { excerpts: filings as TextExcerpt[], sourceId: excerpt.source, reportingCurrency: "USD", ignoreWords: ["Figure", "FIGR"] });
  };
  it("binds was/down-from levels to the same explicit net-take-rate row", () => {
    expect(excerptCheck(29).status).toBe("validated");
    for (const text of [row(29).claim.replace("3.6%", "3.7%"), row(29).claim.replace("down", "up"), row(29).claim.replace("Q2 2026", "Q1 2026"), row(29).claim.replace("net take rate", "net margin"), row(29).claim.replace("was", "was not")])
      expect(excerptCheck(29, text).status).not.toBe("validated");
  });
  it("binds preliminary volume with its explicit quarter column, scale and exclusion footnote", () => {
    expect(excerptCheck(28).status).toBe("validated");
    for (const text of [row(28).claim.replace("5.12", "5.22"), row(28).claim.replace("billion", "million"), row(28).claim.replace("Q3 2026", "Q2 2026"), row(28).claim.replace("excluding", "including"), row(28).claim.replace("volume", "revenue"), row(28).claim.replace("reported", "did not report")])
      expect(excerptCheck(28, text).status).not.toBe("validated");
  });
  it.each([98, 178])("keeps the period in equivalent operating-update attribution for row %i", id => {
    expect(excerptCheck(id).status).toBe("validated");
    for (const text of [row(id).claim.replace("5,119", "5,219"), row(id).claim.replace("Q3 2026", "Q2 2026"), row(id).claim.replace("excluding", "including"), row(id).claim.replace("Volume", "Revenue")])
      expect(excerptCheck(id, text).status).not.toBe("validated");
  });
  it.each([34, 37, 48, 50, 57, 66, 139])("reads filing attribution without changing the metric in row %i", id => {
    expect(excerptCheck(id).status).toBe("validated");
    const text = row(id).claim;
    expect(excerptCheck(id, text.replace(/57,572|556|27.0|77.8|8,395|4,676|119,379|2.9|95,887|49,068|561,006|65%|54.4/, "999999")).status).not.toBe("validated");
    expect(excerptCheck(id, text.replace(/2026|2025/g, "2024")).status).not.toBe("validated");
  });
  it("reads an accounting negative percent with the sign and filed fiscal year intact", () => {
    expect(excerptCheck(46).status).toBe("validated");
    for (const text of [row(46).claim.replace("(18.1)%", "18.1%"), row(46).claim.replace("18.1", "19.1"), row(46).claim.replace("FY2025", "FY2024"), row(46).claim.replace("effective tax rate", "operating margin"), row(46).claim.replace("(18.1)%", "(18.1) percentage points")])
      expect(excerptCheck(46, text).status).not.toBe("validated");
  });
  it.each([40, 42, 49, 67, 68, 140])("withholds support when source dimensions or qualifiers cannot bind row %i", id => {
    expect(excerptCheck(id).status).not.toBe("validated");
  });
  it.each([
    [34, "The 10-Q reports sale of loans, net, of $57,572 thousand for the three months ended June 30, 2026."],
    [50, "The 10-Q reports GAAP EBITDA of $119,379 thousand for the three months ended June 30, 2026."],
    [48, "The 10-Q reports a change in debt valuation inputs and assumptions of $8,395 thousand for the three months ended June 30, 2026."],
    [57, "The 10-Q states that at June 30, 2026 the company recorded repurchase obligations of $2.9 billion."],
    [66, "Restricted cash at June 30, 2026 increased $95,887 thousand."],
    [139, "The Q2 2024 release states that Figure Connect reached 65% of Consumer Loan Marketplace volume in the quarter."],
  ])("retains the definition and relation of excerpt row %i: %s", (id, text) => {
    expect(excerptCheck(id as number, text as string).status).not.toBe("validated");
  });
  it("refuses malformed operating headers, missing exclusion evidence and conflicting scales", () => {
    const update = frozen.filings.find(e => e.source === row(28).source)!;
    for (const transform of [
      (text: string) => text.replace("Q3 2026 Q2 2026 Q/Q Change Q3 2025", "Q3 2026 Q3 2026 Q/Q Change Q3 2025"),
      (text: string) => text.replace("1 Excludes volume originated", "1 Includes volume originated"),
      (text: string) => text.replace("Y/Y Change Consumer Loan Marketplace Volume 1 $ 5,119", "Y/Y Change (In thousands) Consumer Loan Marketplace Volume 1 $ 5,119"),
    ]) {
      const text = transform(update.text);
      const filings = frozen.filings.map(e => e.source === update.source ? { ...e, text, spans: [{ start: 0, end: text.length, text }] } : e);
      expect(excerptCheck(28, row(28).claim, filings).status).not.toBe("validated");
    }
  });
  it("does not prefer a table value over a conflicting narrative restatement", () => {
    const source = frozen.filings.find(e => e.source === "edgar:8-K EX-99.1")! as TextExcerpt;
    const text = source.text.replace("Consumer Loan Marketplace volume was $4.3 billion", "Consumer Loan Marketplace volume was $8.3 billion");
    const excerpt = { ...source, text, spans: [{ start: 0, end: text.length, text }] };
    const result = validateClaimNumericSupport({ label: "FACT", text: "Consumer Loan Marketplace volume was USD 4.259 billion in Q2 2026.", source: source.source, asOf: source.asOf },
      { excerpts: [excerpt], sourceId: source.source, reportingCurrency: "USD", ignoreWords: ["Figure", "FIGR"] });
    expect(result.status).toBe("unchecked");
  });
});

// Integration of R7 with R8 and R9 (FIGR extra-high audit round).
describe("R7 readings after the R8 passages and the R9 SBC labels", () => {
  const item2 = frozen.filings.find(excerpt => excerpt.source === "edgar:10-Q item2")! as TextExcerpt;
  const ebitda = "The 10-Q reports non-GAAP Adjusted EBITDA of $119,379 thousand for the three months ended June 30, 2026.";
  const checkExcerpt = (excerpt: TextExcerpt) => validateClaimNumericSupport({ label: "FACT", text: ebitda, source: "edgar:10-Q item2", asOf: "2026-06-30" },
    { excerpts: [excerpt], sourceId: "edgar:10-Q item2", reportingCurrency: "USD" });
  // R8 keeps a table and its lettered footnotes as separate passages; the row marker "(H)" is still a footnote.
  it("reads a lettered row marker as a footnote when the footnote is its own passage", () => {
    expect(checkExcerpt(item2).status).toBe("validated");
    const split = { ...item2, spans: item2.spans!.flatMap(span => span.start !== 7723 ? [span]
      : [{ ...span, end: 8640, text: span.text.slice(0, 8640 - 7723) }, { start: 8640, end: span.end, text: span.text.slice(8640 - 7723) }]) };
    expect(split.spans.some(span => span.start === 8640 && span.text.startsWith("(A) Ecosystem Volume consists of"))).toBe(true);
    expect(checkExcerpt(split).status).toBe("validated");
    expect(validateClaimNumericSupport({ label: "FACT", text: ebitda.replace("119,379", "119,380"), source: "edgar:10-Q item2", asOf: "2026-06-30" },
      { excerpts: [split], sourceId: "edgar:10-Q item2", reportingCurrency: "USD" }).status).not.toBe("validated");
  });
  // R9 names the SBC basis in its labels; prose naming stock-based compensation still reads the cash-flow add-back.
  it.each([54, 86])("reads the basis-named current-capital SBC label (row %i)", id => {
    expect(check(id, row(id).claim, { ...record(id), label: "SBC, cash-flow add-back" }).status).toBe("validated");
  });
  it("reads the basis-named SBC revenue ratio and statement line", () => {
    expect(check(88, row(88).claim, { ...record(88), label: "SBC, cash-flow add-back / revenue" }).status).toBe("validated");
    expect(check(53, row(53).claim, { ...record(53), label: "SBC, cash-flow add-back" }).status).toBe("validated");
  });
  it("does not read the cash-flow add-back as allocated SBC expense", () => {
    expect(check(54, "Allocated stock-based compensation expense for the twelve months ended 2026-06-30 was USD 109.08 million.",
      { ...record(54), label: "SBC, cash-flow add-back" }).status).not.toBe("validated");
  });
});
