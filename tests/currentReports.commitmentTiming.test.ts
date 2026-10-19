import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCommitmentTables } from "@/edgar/currentReports";
import { buildEarningsReleaseRecord } from "@/providers/currentReports";

const table = (body: string, columns = "Remainder of 2027 2028 2029 and thereafter Total", scale = "millions") =>
  `Future commitments by fiscal year as of July 26, 2026, were as follows: ${columns} (In ${scale}) ${body}`;

describe("commitment payment timing from the same source table", () => {
  it.each([
    "Guarantees of these commitments may be cancelled without substantial penalty.",
    "These Guarantees of commitments may be cancelled without substantial penalty.",
    "Additional Commitments may be cancelled without substantial penalty.",
    "Future commitments by fiscal year as of the next reporting date may be cancelled without substantial penalty.",
  ])("retains an ambiguous section-like token inside a qualification: %s", qualifier => {
    const text = table(`Supply $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ 6 ${qualifier}`);
    const result = parseCommitmentTables(text)[0]!;
    expect(result.paymentTiming?.sourceText).toBe(text);
    expect(result.paymentTiming?.coverage).toBe("incomplete");
    expect(result.paymentTiming?.reason).toMatch(/context|qualif/i);
    expect(result.total).toBe(6e6);
  });

  it.each([" ", "\n"])("separates a demonstrated guarantee-table caption after a heading with %j whitespace", separator => {
    const commitments = table("Supply $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ 6");
    const guarantee = "The following table summarizes maximum gross exposure related to our guarantees (in millions): Partner guarantees $ 105 Total $ 105";
    const result = parseCommitmentTables(`${commitments}${separator}Guarantees${separator}${guarantee}`);
    expect(result.map(record => [record.kind, record.total])).toEqual([["commitments", 6e6], ["guarantees", 105e6]]);
    expect(result[0]?.paymentTiming).toMatchObject({ sourceText: commitments, coverage: "complete" });
    expect(result[1]?.asOf).toBeNull();
  });

  it("retains ambiguous heading/prose context before an independently demonstrated guarantee table", () => {
    const qualifier = "Guarantees of these commitments may be cancelled without substantial penalty.";
    const text = `${table(`Supply $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ 6 ${qualifier}`)} The following table summarizes maximum gross exposure related to our guarantees (in millions): Partner guarantees $ 105 Total $ 105`;
    const result = parseCommitmentTables(text);
    expect(result.map(record => [record.kind, record.total])).toEqual([["commitments", 6e6], ["guarantees", 105e6]]);
    expect(result[0]?.paymentTiming?.coverage).toBe("incomplete");
    expect(result[0]?.paymentTiming?.sourceText).toContain(qualifier);
    expect(result[0]?.paymentTiming?.sourceText).not.toContain("Partner guarantees");
  });

  it.each([
    "Supply $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ 6 Total $ 2 $ 3 $ 4 $ 9",
    "Supply $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ 6 Cloud $ 4 $ 5 $ 6 $ 15",
    "Total $ 1 $ 2 $ 3 $ 6 Supply $ 1 $ 2 $ 3 $ 6",
  ])("withholds conflicting or out-of-order rows after retaining the whole table: %s", body => {
    const result = parseCommitmentTables(table(body))[0]!;
    expect(result.paymentTiming?.coverage).toBe("unavailable");
    expect(result.paymentTiming?.sourceText).toBe(table(body));
    expect(result.total).toBeNull();
    expect(result.rows).toEqual([]);
    expect(result.paymentTiming?.reason).toMatch(/Total|boundar|order/i);
  });

  it.each([
    "These commitments are subject to cancellation without substantial penalty.",
    "Payments of $ 3 million are contingent on performance conditions being met.",
  ])("retains post-table qualifications without certifying unconditional timing: %s", qualifier => {
    const body = `Supply $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ 6 ${qualifier}`;
    const result = parseCommitmentTables(table(body))[0]!;
    expect(result.paymentTiming?.sourceText).toBe(table(body));
    expect(result.paymentTiming?.coverage).toBe("incomplete");
    expect(result.paymentTiming?.reason).toMatch(/context|qualif|condition/i);
    expect(result.total).toBe(6e6);
    expect(result.rows).toEqual([{ label: "Supply", total: 6e6 }]);
  });

  it("does not certify coverage when trailing context exceeds the retained source bound", () => {
    const body = `Supply $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ 6 ${"Conditions apply. ".repeat(150)} Cancellation is permitted.`;
    const result = parseCommitmentTables(table(body))[0]!;
    expect(result.paymentTiming?.coverage).toBe("incomplete");
    expect(result.paymentTiming?.sourceText.length).toBe(2000);
    expect(result.paymentTiming?.reason).toMatch(/bound|truncat/i);
  });

  it.each(["unsupported-header", "invalid-date"])("keeps unsupported commentary and a separately sourced release aggregate: %s", diagnostic => {
    const releaseText = table("Supply $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ 6");
    const commentaryText = diagnostic === "unsupported-header"
      ? table("Cloud $ 1 $ 2 $ 3 $ 6", "2027 through 2029 Total")
      : releaseText.replace("July 26, 2026", "February 30, 2026");
    const result = buildEarningsReleaseRecord({
      filing: { accessionNumber: "0000000001-26-000001", filingDate: "2026-08-01" },
      releaseUrl: "https://example.test/release", commentaryUrl: "https://example.test/commentary",
      releaseText, commentaryText, includeNarrative: false,
    });
    expect(result.commitmentsExhibit).toBe("EX-99.1");
    expect(result.commitments).toHaveLength(2);
    expect(result.commitments).toEqual(expect.arrayContaining([
      expect.objectContaining({ total: 6e6, sourceTableIndex: 0, source: expect.objectContaining({ exhibit: "EX-99.1", url: "https://example.test/release" }) }),
      expect.objectContaining({ paymentTiming: expect.objectContaining({ coverage: "unavailable", sourceText: commentaryText }),
        sourceTableIndex: 0, source: expect.objectContaining({ exhibit: "EX-99.2", url: "https://example.test/commentary" }) }),
    ]));
  });

  it("continues to prefer supported commentary totals when bucket dashes leave timing incomplete", () => {
    const result = buildEarningsReleaseRecord({
      filing: { accessionNumber: "0000000001-26-000001", filingDate: "2026-08-01" },
      releaseUrl: "https://example.test/release", commentaryUrl: "https://example.test/commentary",
      releaseText: table("Supply $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ 6"),
      commentaryText: table("Cloud $ - $ 2 $ 3 $ 5 Total $ - $ 2 $ 3 $ 5"), includeNarrative: false,
    });
    expect(result.commitmentsExhibit).toBe("EX-99.2");
    expect(result.commitments).toHaveLength(1);
    expect(result.commitments?.[0]).toMatchObject({ total: 5e6, paymentTiming: { coverage: "incomplete" },
      sourceTableIndex: 0, source: { exhibit: "EX-99.2" } });
  });

  it("retains fiscal labels, source cells, scaling and the independently printed total", () => {
    const result = parseCommitmentTables(table("Supply and capacity $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ 6"))[0]!;
    expect(result.asOf).toBe("2026-07-26");
    expect(result.rows[0]?.total).toBe(6e6);
    expect(result.rows).toEqual([{ label: "Supply and capacity", total: 6e6 }]);
    expect(result.paymentTiming).toMatchObject({
      coverage: "complete", scale: 1e6, currencySymbol: "$", reason: null,
      rows: [{ label: "Supply and capacity", tableTotal: false, total: 6e6, totalRaw: "6", buckets: [
        { label: "Remainder of 2027", amount: 1e6, raw: "1" },
        { label: "2028", amount: 2e6, raw: "2" },
        { label: "2029 and thereafter", amount: 3e6, raw: "3" },
      ], reconciliation: { status: "reconciled-as-printed", bucketSum: 6e6, residual: 0 } },
      { label: "Total", tableTotal: true, total: 6e6 }],
    });
    expect(result.paymentTiming!.sourceHeader).toContain("Remainder of 2027 2028 2029 and thereafter Total");
    expect(result.paymentTiming!.sourceText).toBe(table("Supply and capacity $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ 6"));
  });

  it("keeps a zero numeric cell distinct from an unexplained dash", () => {
    const result = parseCommitmentTables(table("Supply $ 0 $ - $ 3 $ 3 Total $ 0 $ - $ 3 $ 3"))[0]!;
    expect(result.paymentTiming).toMatchObject({
      coverage: "incomplete",
      rows: [{ buckets: [
        { label: "Remainder of 2027", amount: 0, raw: "0" },
        { label: "2028", amount: null, raw: "-" },
        { label: "2029 and thereafter", amount: 3e6, raw: "3" },
      ],
      reconciliation: { status: "unknown", bucketSum: null, residual: null } }, { tableTotal: true }],
    });
    expect(result.rows[0]?.total).toBe(3e6);
  });

  it("retains a mismatched total and residual instead of changing a payment bucket", () => {
    const result = parseCommitmentTables(table("Supply $ 1 $ 2 $ 3 $ 8 Total $ 1 $ 2 $ 3 $ 8"))[0]!;
    expect(result.rows[0]?.total).toBe(8e6);
    expect(result.paymentTiming).toMatchObject({
      coverage: "incomplete",
      rows: [{ buckets: [{ amount: 1e6 }, { amount: 2e6 }, { amount: 3e6 }],
      reconciliation: { status: "mismatch", bucketSum: 6e6, residual: -2e6 } }, { tableTotal: true }],
    });
  });

  it("reconciles source decimals without hiding a one-unit printed mismatch", () => {
    const exact = parseCommitmentTables(table("Supply $ 0.1 $ 0.2 $ 0.0 $ 0.3 Total $ 0.1 $ 0.2 $ 0.0 $ 0.3"))[0]!;
    expect(exact.paymentTiming?.rows[0]?.reconciliation).toEqual({ status: "reconciled-as-printed", bucketSum: 300000, residual: 0 });
    const mismatch = parseCommitmentTables(table("Supply $ 0.1 $ 0.2 $ 0.0 $ 0.300001 Total $ 0.1 $ 0.2 $ 0.0 $ 0.300001"))[0]!;
    expect(mismatch.paymentTiming?.rows[0]?.reconciliation).toEqual({ status: "mismatch", bucketSum: 300000, residual: -1 });
  });

  it.each(["2027 2027 2029 Total", "2027 through 2029 Total", "Remainder of 2027 Calendar 2028 2029 Total", "2027 Total 2028 Total"])("retains unknown evidence for an unsupported header: %s", header => {
    const result = parseCommitmentTables(table("Supply $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ 6", header))[0]!;
    expect(result.paymentTiming?.coverage).toBe("unavailable");
    expect(result.paymentTiming?.sourceHeader).toContain(header);
    expect(result.paymentTiming?.sourceText).toContain("Supply");
    expect(result.paymentTiming?.rows).toEqual([]);
    expect(result.paymentTiming?.reason).toMatch(/header|column/i);
  });

  it.each(["Supply $ 1 $ 3 $ 4", "Supply $ 1 $ 2 $ 3 $ 4 $ 10"])("does not shift missing or extra cells into totals: %s", body => {
    const result = parseCommitmentTables(table(body))[0]!;
    expect(result.rows).toEqual([]);
    expect(result.total).toBeNull();
    expect(result.paymentTiming?.coverage).toBe("unavailable");
    expect(result.paymentTiming?.sourceText).toContain(body);
    expect(result.paymentTiming?.reason).toMatch(/row|cell|truncat/i);
  });

  it("keeps complete preceding rows and marks category coverage incomplete for a truncated next row", () => {
    const result = parseCommitmentTables(table("Supply $ 1 $ 2 $ 3 $ 6 Cloud services $ 2 $ 3"))[0]!;
    expect(result.rows).toEqual([{ label: "Supply", total: 6e6 }]);
    expect(result.total).toBeNull();
    expect(result.paymentTiming?.coverage).toBe("incomplete");
    expect(result.paymentTiming?.sourceText).toContain("Cloud services $ 2 $ 3");
  });

  it("does not turn an unexplained dash total into zero", () => {
    const result = parseCommitmentTables(table("Supply $ 0 $ 0 $ 0 $ - Total $ 0 $ 0 $ 0 $ -"))[0]!;
    expect(result.rows).toEqual([]);
    expect(result.total).toBeNull();
    expect(result.paymentTiming?.rows[0]).toMatchObject({ total: null, totalRaw: "-", reconciliation: { status: "unknown" } });
  });

  it("keeps main/additional schedules and undated guarantees separate", () => {
    const text = `${table("Supply $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ 6")} Additional Commitments ${table("Cloud $ 4 $ 5 $ 6 $ 15 Total $ 4 $ 5 $ 6 $ 15", "Remainder of 2027 2028 2029 and thereafter Total", "billions")} Guarantees The following table summarizes maximum gross exposure related to our guarantees (in billions): Partner guarantees $ 105 Total $ 105`;
    const result = parseCommitmentTables(text);
    expect(result.map(row => row.total)).toEqual([6e6, 15e9, 105e9]);
    expect(result[0]?.paymentTiming?.sourceText).not.toContain("Cloud");
    expect(result[1]?.paymentTiming?.rows[0]?.buckets[0]?.amount).toBe(4e9);
    expect(result[2]?.asOf).toBeNull();
    expect(result[2]?.paymentTiming).toBeUndefined();
  });

  it("does not borrow cells from the next table to finish an incomplete table", () => {
    const text = `${table("Supply $ 1 $ 2")} ${table("Cloud $ 4 $ 5 $ 6 $ 15 Total $ 4 $ 5 $ 6 $ 15")}`;
    const result = parseCommitmentTables(text);
    expect(result).toHaveLength(2);
    expect(result[0]?.rows).toEqual([]);
    expect(result[0]?.paymentTiming?.coverage).toBe("unavailable");
    expect(result[1]?.rows).toEqual([{ label: "Cloud", total: 15e6 }]);
  });

  it("bounds retained malformed source text", () => {
    const result = parseCommitmentTables(table(`Supply $ 1 $ 2 ${"unparsed ".repeat(500)}`))[0]!;
    expect(result.paymentTiming?.sourceText.length).toBeLessThanOrEqual(2000);
    expect(result.paymentTiming?.coverage).toBe("unavailable");
  });

  it("does not mix printed currencies into a usable payment schedule", () => {
    const result = parseCommitmentTables(table("Supply $ 1 € 2 $ 3 $ 6 Total $ 1 € 2 $ 3 $ 6"))[0]!;
    expect(result.paymentTiming?.coverage).toBe("unavailable");
    expect(result.paymentTiming?.currencySymbol).toBeNull();
    expect(result.paymentTiming?.reason).toMatch(/currency|symbol/i);
    expect(result.rows).toEqual([]);
    expect(result.total).toBeNull();
  });

  it("retains explicit US dollars and does not invent a dollar symbol when none is printed", () => {
    const usd = parseCommitmentTables(table("Supply US$ 1 US$ 2 US$ 3 US$ 6 Total US$ 1 US$ 2 US$ 3 US$ 6"))[0]!;
    expect(usd.paymentTiming?.currencySymbol).toBe("US$");
    expect(usd.paymentTiming?.coverage).toBe("complete");
    const missing = parseCommitmentTables(table("Supply 1 2 3 6 Total 1 2 3 6"))[0]!;
    expect(missing.paymentTiming?.currencySymbol).toBeNull();
    expect(missing.paymentTiming?.coverage).toBe("unavailable");
  });

  it("retains unsupported foreign symbols as evidence without a usable schedule", () => {
    const result = parseCommitmentTables(table("Supply € 1 € 2 € 3 € 6 Total € 1 € 2 € 3 € 6"))[0]!;
    expect(result.paymentTiming?.currencySymbol).toBe("€");
    expect(result.paymentTiming?.coverage).toBe("unavailable");
    expect(result.rows).toEqual([]);
    expect(result.total).toBeNull();
  });

  it.each(["(1", "1)"])("refuses a malformed numeric token rather than inventing its sign: %s", cell => {
    const result = parseCommitmentTables(table(`Supply $ ${cell} $ 2 $ 3 $ 4 Total $ ${cell} $ 2 $ 3 $ 4`))[0]!;
    expect(result.paymentTiming?.coverage).toBe("unavailable");
    expect(result.rows).toEqual([]);
    expect(result.paymentTiming?.sourceText).toContain(cell);
  });

  it("does not select the first of conflicting duplicate category rows", () => {
    const result = parseCommitmentTables(table("Supply $ 1 $ 2 $ 3 $ 6 Supply $ 4 $ 5 $ 6 $ 15 Total $ 5 $ 7 $ 9 $ 21"))[0]!;
    expect(result.paymentTiming?.coverage).toBe("unavailable");
    expect(result.paymentTiming?.rows).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.paymentTiming?.reason).toMatch(/duplicate|conflict/i);
  });

  it("does not admit a schedule with a repeated header inside its category rows", () => {
    const result = parseCommitmentTables(table("Supply $ 1 $ 2 $ 3 $ 6 Remainder of 2027 2028 2029 and thereafter Total Cloud $ 4 $ 5 $ 6 $ 15 Total $ 5 $ 7 $ 9 $ 21"))[0]!;
    expect(result.paymentTiming?.coverage).toBe("unavailable");
    expect(result.paymentTiming?.rows).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("marks category completeness unresolved when category totals differ from the independently printed Total row", () => {
    const result = parseCommitmentTables(table("Supply $ 1 $ 2 $ 3 $ 6 Cloud $ 4 $ 5 $ 6 $ 15 Total $ 10 $ 20 $ 30 $ 60"))[0]!;
    expect(result.total).toBe(60e6);
    expect(result.rows).toEqual([{ label: "Supply", total: 6e6 }, { label: "Cloud", total: 15e6 }]);
    expect(result.paymentTiming?.coverage).toBe("incomplete");
    expect(result.paymentTiming?.reason).toMatch(/category|row totals/i);
  });

  it("does not certify crossed category columns merely because the grand totals agree", () => {
    const result = parseCommitmentTables(table("Supply $ 1 $ 2 $ 3 $ 6 Cloud $ 4 $ 5 $ 6 $ 15 Total $ 6 $ 6 $ 9 $ 21"))[0]!;
    expect(result.total).toBe(21e6);
    expect(result.paymentTiming?.rows.every(row => row.reconciliation.status === "reconciled-as-printed")).toBe(true);
    expect(result.paymentTiming?.coverage).toBe("incomplete");
    expect(result.paymentTiming?.reason).toMatch(/category|column/i);
  });

  it("does not certify timing with an invalid printed snapshot date", () => {
    const text = table("Supply $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ 6").replace("July 26, 2026", "February 30, 2026");
    const result = parseCommitmentTables(text)[0]!;
    expect(result.asOf).toBeNull();
    expect(result.paymentTiming?.coverage).toBe("unavailable");
    expect(result.paymentTiming?.reason).toMatch(/date/i);
    expect(result.paymentTiming?.sourceText).toBe(text);
  });

  it.each(["Supply $ 1 $ $ 2 $ 3 $ 6", "Supply $ 1 $ 2 $ 3 $ 6 $"])("does not ignore an empty printed currency cell: %s", body => {
    const result = parseCommitmentTables(table(`${body} Total $ 1 $ 2 $ 3 $ 6`))[0]!;
    expect(result.rows).toEqual([]);
    expect(result.paymentTiming?.coverage).toBe("unavailable");
    expect(result.paymentTiming?.sourceText).toContain(body);
  });

  it("does not turn the first truncated digit of a Total amount into a valid reported total", () => {
    const prefix = table("Supply $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ ");
    const label = "x".repeat(2000 - prefix.length - 1);
    const text = prefix.replace("Supply", `${label}Supply`) + "600000";
    // The retained source limit falls within the final reported numeric token.
    expect(text.slice(0, 2000).endsWith("6")).toBe(true);
    const result = parseCommitmentTables(text)[0]!;
    expect(result.total).toBeNull();
    expect(result.paymentTiming?.coverage).not.toBe("complete");
    expect(result.paymentTiming?.rows.some(row => row.tableTotal)).toBe(false);
    expect(result.paymentTiming?.sourceText.length).toBeLessThanOrEqual(2000);
  });

  it.each(["TOTAL", "total"])("preserves the printed %s label while keeping it check-only", totalLabel => {
    const result = parseCommitmentTables(table(`Supply $ 1 $ 2 $ 3 $ 6 ${totalLabel} $ 1 $ 2 $ 3 $ 6`))[0]!;
    expect(result.rows).toEqual([{ label: "Supply", total: 6e6 }]);
    expect(result.total).toBe(6e6);
    expect(result.paymentTiming?.rows.at(-1)).toMatchObject({ label: totalLabel, tableTotal: true });
    expect(result.paymentTiming?.coverage).toBe("complete");
  });

  it.each(["\u22121", "+1", "1e2", "1,2", "1.", "1%", "USD1", "2026-07-26"])("does not swallow the unsupported numeric-like cell %s into a category label", cell => {
    const text = table(`Supply ${cell} 1 2 3 6 Total $ 1 2 3 6`);
    const result = parseCommitmentTables(text)[0]!;
    expect(result.paymentTiming?.coverage).toBe("unavailable");
    expect(result.paymentTiming?.rows).toEqual([]);
    expect(result.paymentTiming?.reason).toMatch(/numeric|ambig|cell/i);
    expect(result.paymentTiming?.sourceText).toBe(text);
  });

  it.each(["Tier-1 cloud services", "Scope3 equipment supply", "ISO-2027 infrastructure"])("preserves an unambiguous numbered category label: %s", label => {
    const result = parseCommitmentTables(table(`${label} $ 1 $ 2 $ 3 $ 6 Total $ 1 $ 2 $ 3 $ 6`))[0]!;
    expect(result.paymentTiming?.coverage).toBe("complete");
    expect(result.paymentTiming?.rows[0]?.label).toBe(label);
    expect(result.rows).toEqual([{ label, total: 6e6 }]);
  });

  it.each(["\u2212", "+", "CAD", "CHF", "USD", "EUR"])("does not swallow a standalone sign or currency token %s before the numeric run", cell => {
    const text = table(`Supply ${cell} 1 2 3 6 Total $ 1 2 3 6`);
    const result = parseCommitmentTables(text)[0]!;
    expect(result.paymentTiming?.coverage).toBe("unavailable");
    expect(result.paymentTiming?.rows).toEqual([]);
    expect(result.paymentTiming?.reason).toMatch(/numeric|ambig|cell|currency/i);
    expect(result.paymentTiming?.sourceText).toBe(text);
    expect(result.rows).toEqual([]);
  });

  it.each(["AUD", "INR", "SEK", "CAD1", "CHF1", "AUD1", "A$1", "ZZZ", "ZZZ1", "CPU", "CAD-1", "CHF+1", "ZZZ\u22121", "A\u20b91"])("withholds lexical unit/category ambiguity without a currency spelling allowlist: %s", token => {
    const text = table(`Supply ${token} 1 2 3 6 Total $ 1 2 3 6`);
    const result = parseCommitmentTables(text)[0]!;
    expect(result.paymentTiming?.coverage).toBe("unavailable");
    expect(result.paymentTiming?.rows).toEqual([]);
    expect(result.paymentTiming?.reason).toMatch(/unit|category|ambig/i);
    expect(result.paymentTiming?.sourceText).toBe(text);
    expect(result.rows).toEqual([]);
  });

  it.each(["(1)", "-1"])("keeps the supported signed numeric cell %s in its payment column", cell => {
    const result = parseCommitmentTables(table(`Supply $ ${cell} $ 2 $ 3 $ 4 Total $ ${cell} $ 2 $ 3 $ 4`))[0]!;
    expect(result.paymentTiming?.coverage).toBe("complete");
    expect(result.paymentTiming?.rows[0]?.buckets.map(bucket => bucket.amount)).toEqual([-1e6, 2e6, 3e6]);
    expect(result.paymentTiming?.rows[0]?.reconciliation).toEqual({ status: "reconciled-as-printed", bucketSum: 4e6, residual: 0 });
  });

  it.each(["–", "—"])("retains an unexplained %s dash token as unknown", dash => {
    const result = parseCommitmentTables(table(`Supply $ 0 $ ${dash} $ 3 $ 3 Total $ 0 $ ${dash} $ 3 $ 3`))[0]!;
    expect(result.paymentTiming?.rows[0]?.buckets[1]).toEqual({ label: "2028", amount: null, raw: dash });
    expect(result.paymentTiming?.coverage).toBe("incomplete");
  });

  it("retains primary-source labels and totals while unexplained dashes remain unknown", () => {
    const source = readFileSync("fixtures/edgar/nvda-current-reports/q2fy27-ex99-2.txt", "utf8");
    const result = parseCommitmentTables(source);
    expect(result.map(row => [row.kind, row.total])).toEqual([["commitments", 366e9], ["commitments", 56e9], ["guarantees", 108.5e9]]);
    expect(result[0]?.paymentTiming?.rows[0]?.buckets.map(bucket => bucket.label)).toEqual(["Remainder of 2027", "2028", "2029", "2030", "2031", "2032 and thereafter"]);
    expect(result[0]?.paymentTiming?.rows[0]?.buckets.map(bucket => bucket.amount)).toEqual([92e9, 87e9, 88e9, 6e9, 5e9, 1e9]);
    expect(result[0]?.paymentTiming?.rows[0]?.reconciliation.status).toBe("reconciled-as-printed");
    expect(result[0]?.paymentTiming?.coverage).toBe("incomplete");
    expect(result[1]?.paymentTiming?.coverage).toBe("incomplete");
  });
});
