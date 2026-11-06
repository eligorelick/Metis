/**
 * Section-extraction tests built from compact SEC filing excerpts under
 * fixtures/edgar/, assembled into synthetic full documents where needed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeEntities,
  detectStub,
  extractFromExhibit,
  extractSection,
  findHeaderCandidates,
  financialStatementText,
  htmlToText,
  mergedAnchors,
  normalizeTitle,
  notesToFinancialStatements,
  parseCrossRefIndex,
  parseDocument,
  parseQuotedTitles,
  parseTocEntries,
  resolveAnchor,
  stripHiddenBlocks,
} from "@/edgar/extract";

const SAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "edgar");
const sample = (name: string): string => readFileSync(path.join(SAMPLES, name), "utf8");

/** Padded filler with a grep-able marker so slices can be asserted in/out. */
function para(n: number, tag: string): string {
  const sentence = `${tag} The Company faces a variety of business and market risks that could materially affect results of operations. `;
  let s = "";
  while (s.length < n) s += sentence;
  return `<div><span style="font-weight:400">${s}</span></div>`;
}

/** JPM/AAPL-style TOC row: item-number link + title link, SAME target. */
const itemRow = (href: string, num: string, title: string): string =>
  `<tr><td><a href="#${href}">${num}</a></td><td><a href="#${href}">${title}</a></td><td colspan="3"/></tr>`;

/** JPM 10-Q style row (F3): item number as PLAIN text, only the title is linked. */
const itemRowPlain = (href: string, num: string, title: string): string =>
  `<tr><td colspan="3"><div><span>${num}</span></div></td><td colspan="3"><div><span><a href="#${href}">${title}</a></span></div></td><td colspan="3"/></tr>`;

/** MXC-style row: title-only link, no item number anywhere. */
const titleOnlyRow = (href: string, title: string): string => `<tr><td><a href="#${href}">${title}</a></td><td>9</td></tr>`;

/** Citi-style contents row: bold un-linked title, page number is the link text. */
const citiRow = (href: string, title: string, page: number): string =>
  `<tr><td colspan="3" style="padding:0 1pt"/><td colspan="3"><span style="font-weight:700">${title}</span></td><td colspan="3"><div style="text-align:right"><a href="#${href}">${page}</a></div></td></tr>`;

const partRow = (label: string): string => `<tr><td colspan="6"><span>${label}</span></td></tr>`;

describe("financial item contents hierarchy", () => {
  describe("caption-owned statement proof", () => {
    const balanceRows = "<tr><td>Cash</td><td>12</td><td>11</td></tr><tr><td>Total assets</td><td>30</td><td>28</td></tr>";
    describe.each(["", "Audit context. ".repeat(1000)])("internal proof boundaries with front matter %s", front => {
      it.each([
        '<tr><td><b>Other information</b></td><td></td><td></td></tr>',
        '<tr><td>Other information</td></tr>',
        '<tr><td><b>Other information:</b></td><td></td><td></td></tr>',
        '<tr><td><b>Other:</b></td><td></td><td></td></tr>',
        '<tr><td>Unrelated section 2025</td></tr>',
      ])("refuses rows after an unrelated internal heading: %s", heading => {
        const source = parseDocument(`<p>${front}</p><h2>Consolidated Balance Sheets</h2><table><tr><th>December 31, 2025 2024</th></tr>${heading}${balanceRows}</table>`);
        const result = financialStatementText(source.fullText, 12_000, source);
        expect(result.statementsText).toBeUndefined();
        expect(result.statementsTextGap).toBeDefined();
      });
      it.each([
        '<tr><td><a href="#x">Cash</a></td><td><a href="#x">12</a></td><td><a href="#x">11</a></td></tr><tr><td><a href="#x">Total assets</a></td><td><a href="#x">30</a></td><td><a href="#x">28</a></td></tr>',
        '<tr><td><a href="#x">Cash</a></td><td>12</td><td>11</td></tr><tr><td><a href="#x">Total assets</a></td><td>30</td><td>28</td></tr>',
        '<tr><td>Cash</td><td><a href="#x">12</a></td><td><a href="#x">11</a></td></tr><tr><td>Total assets</td><td><a href="#x">30</a></td><td><a href="#x">28</a></td></tr>',
        '<tr><td>Cash</td><td><a href="#x">1</a>2</td><td>11</td></tr><tr><td>Total assets</td><td><a href="#x">3</a>0</td><td>28</td></tr>',
        '<tr><td>Cash <a href="#x">flows</a></td><td>12</td><td>11</td></tr><tr><td>Total assets</td><td>30</td><td>28</td></tr>',
      ])("does not use linked labels or amounts as proof: %s", rows => {
        const source = parseDocument(`<p>${front}</p><h2>Consolidated Balance Sheets</h2><table><tr><th>December 31, 2025 2024</th></tr>${rows}</table>`);
        const result = financialStatementText(source.fullText, 12_000, source);
        expect(result.statementsText).toBeUndefined();
        expect(result.statementsTextGap).toBeDefined();
      });
      it("keeps original proof and cap behavior with inline footnote links", () => {
        const source = parseDocument(`<p>${front}</p><h2>Consolidated Balance Sheets</h2><table><tr><th>December 31, 2025 2024</th></tr><tr><td>Cash<sup><a href="#note1">1</a></sup></td><td>12</td><td>11</td></tr><tr><td>Total assets<sup><a href="#note2">(a)</a></sup></td><td>30</td><td>28</td></tr></table>`);
        const result = financialStatementText(source.fullText, 12_000, source);
        expect(result.statementsText).toContain("Cash 1 12 11");
        expect(result.statementsText).toContain("Total assets (a) 30 28");
        expect(result.statementsTextGap).toBeUndefined();
      });
    });
    it.each(["Insurance and Other:", "Regional businesses:"])("preserves an explicit business subgroup in the amount-column grid: %s", label => {
      const source = parseDocument(`<h2>Consolidated Balance Sheets</h2><table><tr><th>December 31, 2025 2024</th></tr><tr><td><b>${label}</b></td><td></td><td></td></tr>${balanceRows}</table>`);
      expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBe(source.fullText);
    });
    describe.each(["", "Audit context. ".repeat(1000)])("superscript label semantics with front matter %s", front => {
      it.each([
        '<sup><a href="#n">1</a></sup>', '<sup>1</sup>', '<sup>(a)</sup>',
        '<sup><a href="#n">1</a></sup><sup><a href="#n2">2</a></sup>',
      ])("does not mistake footnoted cash flows for balance cash: %s", marker => {
        const source = parseDocument(`<p>${front}</p><h2>Consolidated Balance Sheets</h2><table><tr><td>Cash${marker} flows</td><td>12</td><td>11</td></tr><tr><td>Cash${marker} flows</td><td>30</td><td>28</td></tr></table>`);
        const result = financialStatementText(source.fullText, 12_000, source);
        expect(result.statementsText).toBeUndefined();
        expect(result.statementsTextGap).toBeDefined();
      });
      it("retains a real cash row with an unlinked superscript footnote", () => {
        const source = parseDocument(`<p>${front}</p><h2>Consolidated Balance Sheets</h2><table><tr><td>Cash<sup>1</sup> and cash equivalents</td><td>12</td><td>11</td></tr><tr><td>Total assets</td><td>30</td><td>28</td></tr></table>`);
        const result = financialStatementText(source.fullText, 12_000, source);
        expect(result.statementsText).toContain("Cash 1 and cash equivalents 12 11");
        expect(result.statementsText).toContain("Total assets 30 28");
        expect(result.statementsTextGap).toBeUndefined();
      });
    });
    it.each([
      "Jul 26, 2026 Jan 25, 2026",
      "Years Ended (In Millions, Except Per Share Amounts) Dec 27, 2025 Dec 28, 2024",
      "(Stated in millions, except per share amounts)",
      "(Dollars in millions, except per share amount) December 31, 2025 December 31, 2024",
    ])("keeps financial period and units rows as metadata: %s", context => {
      const title = context.startsWith("Years Ended") ? "Statements of Income" : "Balance Sheets";
      const rows = title === "Balance Sheets" ? balanceRows : '<tr><td>Revenue</td><td>12</td><td>11</td></tr><tr><td>Net income</td><td>3</td><td>2</td></tr>';
      const source = parseDocument(`<h2>Consolidated ${title}</h2><table><tr><td>${context}</td></tr>${rows}</table>`);
      expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBe(source.fullText);
    });
    it.each([
      "Investments:", "Inventories:", "Available-for-sale securities, at fair value:",
      "Equity securities, at fair value:", "Fixed maturity securities:",
      "Real estate held for investment, at cost:", "Short-term financing receivables:",
      "Accounts receivable", "Deferred credits and other liabilities", "Collateralized agreements:",
      "Assets (unaudited)", "Railroad, Utilities and Energy:",
    ])("preserves a financial label-column subgroup: %s", label => {
      const source = parseDocument(`<h2>Consolidated Balance Sheets</h2><table><tr><td>${label}</td><td></td><td></td></tr>${balanceRows}</table>`);
      expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBe(source.fullText);
    });
    it.each(["Revenues and Other Income", "Cost of revenues (1)(2):"])("preserves an income-statement subgroup: %s", label => {
      const source = parseDocument(`<h2>Consolidated Statements of Income</h2><table><tr><td>${label}</td><td></td><td></td></tr><tr><td>Revenue</td><td>12</td><td>11</td></tr><tr><td>Net income</td><td>3</td><td>2</td></tr></table>`);
      expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBe(source.fullText);
    });
    it.each([
      "Adjustments", "Adjustments to net income:",
      "Adjustments to reconcile net income (loss) to net cash provided by (used in) operating activities:",
      "Adjustments to reconcile net earnings to net cash used for operating activities:",
      "Adjustments to reconcile net income including noncontrolling interest to net cash provided by operating activities",
      "Adjustments to reconcile net income to net cash flows provided by operating activities:",
      "Changes in assets and liabilities:", "Changes in assets and liabilities, net of business combinations:",
      "Sales, maturities and repayments of:",
    ])("preserves a cash-flow reconciliation subgroup: %s", label => {
      const source = parseDocument(`<h2>Consolidated Statements of Cash Flows</h2><table><tr><td>${label}</td><td></td><td></td></tr><tr><td>Net income</td><td>12</td><td>11</td></tr><tr><td>Net cash provided by operating activities</td><td>30</td><td>28</td></tr></table>`);
      expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBe(source.fullText);
    });
    it.each([
      ["a second uncaptioned table", `<table><tr><td>Index</td><td>1</td></tr></table><table>${balanceRows}</table>`],
      ["two incomplete tables", "<table><tr><td>Cash</td><td>12</td><td>11</td></tr></table><table><tr><td>Total assets</td><td>30</td><td>28</td></tr></table>"],
      ["a peer heading before the first table", `<h3>Other information</h3><table>${balanceRows}</table>`],
      ["a heading inside the table", `<table><tr><th><h3>Other information</h3></th></tr>${balanceRows}</table>`],
      ["a bold peer block", `<div><b>Other information</b></div><table>${balanceRows}</table>`],
      ["plain blocks after a peer heading", "<h3>Other information</h3><p>Cash 12 11 Total assets 30 28</p>"],
      ["plain blocks after an unmarked peer", "<p>Other information</p><p>Cash 12 11 Total assets 30 28</p>"],
      ["a bold table boundary", `<table><tr><th><b>Other information</b></th></tr>${balanceRows}</table>`],
      ["a heading spanning the table columns", `<table><tr><td colspan="3"><b>Other information</b></td></tr>${balanceRows}</table>`],
      ["an index with two page columns", `<table><tr><td>Index: Page</td><td>Current</td><td>Prior</td></tr>${balanceRows}</table>`],
      ["duplicate row strings elsewhere", `<table><tr><td>Cash</td><td>12</td></tr><tr><td>11</td><td>Total assets</td><td>30</td></tr><tr><td>28</td></tr></table><h3>Other information</h3><table>${balanceRows}</table>`],
    ])("does not borrow proof from %s", (_name, body) => {
      const source = parseDocument(`<h2>Consolidated Balance Sheets</h2>${body}`);
      expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBeUndefined();
    });
    it.each([
      ["Balance Sheets", "Year ended December 31, 2025 2024", "Net income 12 11 Total comprehensive income 30 28"],
      ["Balance Sheets", "Year ended December 31, 2025 2024", "Operating activities: Accounts receivable 12 11 Accounts payable 30 28 Net cash provided by operating activities 42 39"],
      ["Statements of Operations", "Year ended December 31, 2025 2024", "Operating activities: Net income 12 11 Adjustments to reconcile net income to net cash provided by operating activities: Accounts payable 30 28"],
      ["Statements of Cash Flows", "December 31, 2025 2024", "Cash 12 11 Total assets 30 28"],
    ])("refuses incompatible data under %s", (title, period, rows) => {
      const source = parseDocument(`<h2>Consolidated ${title}</h2><table><tr><th>${period}</th></tr><tr><td>${rows}</td></tr></table>`);
      const result = financialStatementText(source.fullText, 12_000, source);
      expect(result.statementsText).toBeUndefined();
      expect(result.statementsTextGap).toBeDefined();
    });
    it("does not substitute another table's period even when its row values match", () => {
      const source = parseDocument(`<h2>Consolidated Balance Sheets</h2><table><tr><th>December 31, 2025 2024</th></tr>${balanceRows}</table><h2>Other information</h2><table><tr><th>December 31, 2023 2022</th></tr>${balanceRows}</table>`);
      expect(financialStatementText("Consolidated Balance Sheets December 31, 2023 2022 Cash 12 11 Total assets 30 28", 12_000, source).statementsText).toBeUndefined();
    });
    it("stops at an unrelated plain-text line", () => {
      const source = parseDocument("Consolidated Balance Sheets\nDecember 31, 2025 2024\nOther information\nCash 12 11\nTotal assets 30 28");
      expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBeUndefined();
    });
    it.each([
      "<p>(In millions, except number of shares, which are reflected in thousands, and par value)</p>",
      "<p>Example Corporation and Subsidiaries</p><p>(Dollars and shares in millions, except per-share data)</p>",
      "<p>Example Corporation (Parent Company)</p><p>(millions)</p>",
      "<p>(Expressed in US $ millions, except share amounts)</p>",
      "<p>(unaudited; in thousands, except share and per share values)</p>",
    ])("preserves adjacent issuer and units context: %s", context => {
      const source = parseDocument(`<h2>Consolidated Balance Sheets</h2>${context}<table><tr><th>December 31, 2025 2024</th></tr>${balanceRows}</table>`);
      expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBe(source.fullText);
    });
    it("binds spelled-out interim periods and financial subheadings inside one table", () => {
      const source = parseDocument(`<h2>Consolidated Statements of Income</h2><table><tr><th>Three Months Ended June 30, 2026 2025</th></tr><tr><td>Revenue</td><td>12</td><td>11</td></tr><tr><th>Costs and expenses:</th></tr><tr><td>Net income</td><td>3</td><td>2</td></tr></table>`);
      expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBe(source.fullText);
    });
    it("treats indentation around the same physical plain caption as formatting", () => {
      const source = parseDocument(`<div>\n  Consolidated Statements of Cash Flows\n  (In millions)\n</div><table><tr><th>Years ended 2025 2024</th></tr><tr><td>Net income</td><td>12</td><td>11</td></tr><tr><td>Net cash provided by operating activities</td><td>30</td><td>28</td></tr></table>`);
      expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBe(source.fullText);
    });
    it("distinguishes repeated captions using their original following boundary", () => {
      const good = `<h2>Consolidated Balance Sheets</h2><p>December 31, 2025 2024</p><table>${balanceRows}</table>`;
      const source = parseDocument(`${good}<h2>Consolidated Balance Sheets</h2><p>December 31, 2025 2024</p><h3>Other information</h3><p>Nothing to report.</p>`);
      expect(financialStatementText(parseDocument(good).fullText, 12_000, source).statementsText).toBe(parseDocument(good).fullText);
    });
    it.each(["Example Corporation and Subsidiaries", "ExampleSystems"])("binds a caption-only layout table with source-owned issuer %s", issuer => {
      const source = parseDocument(`<p><ix:nonNumeric name="dei:EntityRegistrantName">${issuer}</ix:nonNumeric></p><table><tr><th>Consolidated Balance Sheets</th><td>${issuer}</td></tr></table><table>${balanceRows}</table>`);
      expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBe(source.fullText);
    });
    it("does not skip a caption table carrying page numbers", () => {
      const source = parseDocument(`<table><tr><th>Consolidated Balance Sheets</th><td>12</td></tr></table><table>${balanceRows}</table>`);
      expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBeUndefined();
    });
    it.each([
      `<h2>Consolidated Balance Sheets</h2><table><tr><th>December 31, 2025 2024 (in millions)</th></tr>${balanceRows}</table>`,
      "<p>Consolidated Balance Sheets Cash 12 11 Total assets 30 28</p>",
      "Consolidated Balance Sheets\nDecember 31, 2025 2024\nCash 12 11\nTotal assets 30 28",
      `<table><tr><th>Consolidated Balance Sheets</th></tr><tr><th>December 31, 2025 2024</th></tr>${balanceRows}</table>`,
      `<h2>Consolidated Balance Sheets</h2><table>${balanceRows}<tr><td>Accumulated other comprehensive income</td><td>2</td><td>1</td></tr></table>`,
      `<div><span style="font-weight:700">Consolidated Balance Sheets</span><div>(in millions, except per share amounts) (unaudited)</div></div><table>${balanceRows}</table>`,
      `<div><table><tr><th>Consolidated Balance Sheets</th></tr><tr><td>(in millions)</td></tr></table></div><table>${balanceRows}</table>`,
      `<div>Consolidated Balance Sheets<table>${balanceRows}</table></div>`,
      `<h2>Consolidated Balance Sheets</h2><table><tr><th>December 31, 2025 2024</th></tr><tr><td><b>Regional businesses:</b></td><td></td><td></td></tr>${balanceRows}</table>`,
      "<h2>Consolidated Statements of Cash Flows</h2><table><tr><th>Years ended 2025 2024</th></tr><tr><td>Net cash provided by operating activities</td><td>12</td><td>11</td></tr><tr><td>Net cash used in investing activities</td><td>30</td><td>28</td></tr></table>",
      "<h2>Consolidated Statements of Income</h2><table><tr><th>Sales and revenues:</th></tr><tr><td>Sales</td><td>12</td><td>11</td></tr><tr><td>Net income</td><td>3</td><td>2</td></tr></table>",
      "<h2>Consolidated Statements of Income</h2><table><tr><th>Net interest income</th></tr><tr><th>Interest income</th></tr><tr><td>Total interest income</td><td>12</td><td>11</td></tr><tr><td>Interest expense</td><td>3</td><td>2</td></tr></table>",
    ])("preserves a source-owned short statement: %s", html => {
      const source = parseDocument(html);
      expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBe(source.fullText);
    });
    it("preserves repeated genuine captions inside the cap", () => {
      const html = `<h2>Consolidated Balance Sheets</h2><table>${balanceRows}</table>`;
      const source = parseDocument(html + html);
      expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBe(source.fullText);
    });
    it.each([`<a href="#contents">Consolidated Balance Sheets</a>`, '<span hidden>Consolidated Balance Sheets</span>'])("refuses a linked or hidden caption: %s", title => {
      const source = parseDocument(`<h2>${title}</h2><table>${balanceRows}</table>`);
      expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBeUndefined();
    });
  });
  it.each(["", "Audit context. ".repeat(1000)])("does not borrow rows from a separately headed table after a statement caption", front => {
    const source = parseDocument(`<p>${front}</p><h2>Consolidated Balance Sheets</h2>
      <table><tr><td>Index</td><td>1</td></tr></table><h2>Other information</h2>
      <table><tr><td>Net income</td><td>12</td><td>11</td></tr><tr><td>Total assets</td><td>30</td><td>28</td></tr></table>`);
    const result = financialStatementText(source.fullText, 12_000, source);
    expect(result.statementsText).toBeUndefined();
    expect(result.statementsTextGap).toBeDefined();
  });
  it.each([
    ["note index", "Notes index Accounts Receivable, Net 140 8. Other notes Long-Term Debt 143 12. Derivatives"],
    ["short management discussion", "Consolidated Results of Operations This section provides a comparative discussion of our results. Net income 120 110 Total assets 300 280"],
    ["segment discussion", "Segment performance: North segment Net income 120 110 South segment Total assets 300 280"],
    ["year references", "Net income in years 2026 2025 is discussed below. Total assets in years 2026 2025 are discussed below."],
  ])("does not treat paired numbers in %s as consolidated statement proof", (_name, text) => {
    const result = financialStatementText(text, 12_000, parseDocument(`<p>${text}</p>`));
    expect(result.statementsText).toBeUndefined();
    expect(result.statementsTextGap).toMatch(/no substantive financial-statement rows/);
  });
  it("does not recover an item from note titles and page numbers before genuine notes", () => {
    const html = `<table>${titleOnlyRow("notes", "Notes to Consolidated Financial Statements")}${titleOnlyRow("next", "Management's Discussion and Analysis")}</table>
      <h2>Item 1. Financial Statements</h2>
      <table><tr><td>7</td><td>Accounts Receivable, Net</td><td>140</td></tr><tr><td>8</td><td>Long-Term Debt</td><td>143</td></tr><tr><td>12</td><td>Net Income Per Share</td><td>162</td></tr></table>
      <h3 id="notes">Notes to Consolidated Financial Statements</h3><p>Note 1 - Organization. ${"Substantive accounting policies. ".repeat(100)}</p>
      <h2 id="next">Item 2. Management's Discussion and Analysis</h2>${para(2600, "OUTSIDE_ITEM")}`;
    const parsed = parseDocument(html);
    const result = extractSection(html, { form: "10-Q", item: "1", part: 1 }, { preparsed: parsed });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const notes = notesToFinancialStatements(result.text, parsed);
    expect(notes?.text).toContain("Substantive accounting policies.");
    expect(financialStatementText(result.text.slice(0, notes!.start), 12_000, parsed).statementsText).toBeUndefined();
    expect(result.text).not.toContain("OUTSIDE_ITEM");
  });
  it("does not join a page column to the next note number beneath an unlinked caption", () => {
    const source = parseDocument(`<h2>Consolidated Balance Sheets</h2><table>
      <tr><td>7</td><td>Accounts Receivable, Net</td><td>140</td></tr>
      <tr><td>8</td><td>Long-Term Debt</td><td>143</td></tr>
      <tr><td>12</td><td>Net Income Per Share</td><td>162</td></tr></table>`);
    expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBeUndefined();
    const genuine = parseDocument(`<h2>Consolidated Balance Sheets</h2><table>
      <tr><td>Cash</td><td>12</td><td>11</td></tr>
      <tr><td>Total assets</td><td>30</td><td>28</td></tr></table>`);
    expect(financialStatementText(genuine.fullText, 12_000, genuine).statementsText).toBe(genuine.fullText);
  });
  it.each([
    "<h2>Example and Subsidiaries Consolidated Balance Sheets</h2>",
    '<div><span style="font-weight:700">Consolidated Balance Sheets</span><span> (in millions)</span></div>',
  ])("preserves genuine source captions with issuer labels or inline formatting: %s", heading => {
    const source = parseDocument(`${heading}<table><tr><td>Cash</td><td>12</td><td>11</td></tr><tr><td>Total assets</td><td>30</td><td>28</td></tr></table>`);
    expect(financialStatementText(source.fullText, 12_000, source).statementsText).toBe(source.fullText);
  });
  it("rejects financial statement titles with page columns instead of monetary rows", () => {
    expect(financialStatementText("Consolidated Statements of Cash Flows 7 8 Consolidated Statements of Income 3 4").statementsText).toBeUndefined();
    expect(financialStatementText("Table of Contents Example Company ".repeat(100)).statementsText).toBeUndefined();
    expect(financialStatementText("Consolidated statements of cash flows for the years ended December 31, 2025, 2024 and 2023 ".repeat(2)).statementsText).toBeUndefined();
  });
  it("finds statement rows after long nonfinancial front matter rather than returning the front matter cap", () => {
    const body = "Consolidated Balance Sheets Cash 120 110 Total assets 300 280 Long-term debt 90 80 ";
    const prefix = "Annual audit context. ".repeat(650) + body;
    expect(financialStatementText(prefix, 12_000, parseDocument(`<p>${"Annual audit context. ".repeat(650)}</p><h2>Consolidated Balance Sheets</h2><p>Cash 120 110 Total assets 300 280 Long-term debt 90 80</p>`)).statementsText).toBe(body);
    expect(financialStatementText(prefix).statementsText).toBeUndefined();
    expect(financialStatementText("Front matter. ".repeat(1000) + "off-balance sheet lending commitments Net income 120 110 Total assets 300 280").statementsText).toBeUndefined();
    const prose = "Front matter. ".repeat(1000) + "Consolidated Balance Sheets and Cash Flows Analysis Net income 120 110 Total assets 300 280";
    expect(financialStatementText(prose, 12_000, parseDocument(`<p>${prose}</p>`)).statementsText).toBeUndefined();
  });
  it("recognizes results/earnings rows under a proved financial heading and preserves an existing capped beginning", () => {
    const title = "Consolidated Results of Operations for the Years Ended December 31,";
    const body = `${title} Sales 120 110 Revenues of financial products 30 20 Total sales and revenues 150 130 `;
    const front = "Management report context. ".repeat(430);
    const text = front + body + "Additional financial detail. ".repeat(100);
    const source = parseDocument(`<p>${front}</p><h2>${title}</h2><p>${body.slice(title.length + 1)}${"Additional financial detail. ".repeat(100)}</p>`);
    expect(financialStatementText(text, 12_000, source).statementsText).toBe(text.slice(0, 12_000));
    const earnings = "Consolidated Statements of Earnings Net sales 120 110 Net earnings 30 20 ";
    expect(financialStatementText("Front matter. ".repeat(1000) + earnings, 12_000,
      parseDocument(`<h2>Consolidated Statements of Earnings</h2><p>Net sales 120 110 Net earnings 30 20</p>`)).statementsText).toBe(earnings);
    expect(financialStatementText("Audit report. ".repeat(1000) + "Sales 120 110 Revenues of financial products 30 20", 12_000,
      parseDocument("<h2>Report of Independent Registered Public Accounting Firm</h2><p>Sales 120 110 Revenues of financial products 30 20</p>")).statementsText).toBeUndefined();
  });
  it("rejects a results-of-operations discussion rather than recovering it as statements", () => {
    const front = "Annual report context. ".repeat(650);
    const discussion = "Consolidated Results of Operations This section provides a comparative discussion of our results. Net income 120 110 Total assets 300 280";
    expect(financialStatementText(front + discussion, 12_000, parseDocument(`<p>${front}</p><h2>Consolidated Results of Operations</h2><p>${discussion.slice("Consolidated Results of Operations ".length)}</p>`)).statementsText).toBeUndefined();
  });
  const contents = `<table>${partRow("Part I. Financial Information")}
    ${titleOnlyRow("item1", "Item 1. Consolidated Financial Statements (Unaudited):")}
    ${titleOnlyRow("income", "Consolidated Statement of Income")}
    ${titleOnlyRow("balance", "Consolidated Balance Sheet")}
    ${titleOnlyRow("notes", "Notes to Consolidated Financial Statements")}
    ${titleOnlyRow("item2", "Item 2. Management's Discussion and Analysis")}</table>`;
  it("keeps child statement links inside a full-titled Item 1 until the next item", () => {
    const html = `${contents}<h2 id="item1">Item 1. Consolidated Financial Statements (Unaudited)</h2>
      <h2 id="income">Consolidated Statement of Income</h2>${para(2600, "INCOME_BODY")}
      <h2 id="balance">Consolidated Balance Sheet</h2><p>BALANCE_BODY Cash 120 110 Long-term debt 90 80</p>
      <h2 id="notes">Notes to Consolidated Financial Statements</h2><p>Note 1 - Organization. ${"Real notes describe the business. ".repeat(100)}</p>
      <h2 id="item2">Item 2. Management's Discussion and Analysis</h2>${para(2600, "OUTSIDE_ITEM")}`;
    const result = extractSection(html, { form: "10-Q", item: "1", part: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.text).toContain("INCOME_BODY");
    expect(result.text).toContain("BALANCE_BODY");
    expect(result.text).toContain("Real notes describe the business.");
    expect(result.text).not.toContain("OUTSIDE_ITEM");
  });
  it("does not turn a contents list without bodies into financial statements", () => {
    const html = `${contents}<h2 id="item1">Item 1. Consolidated Financial Statements</h2>
      <h2 id="income">Consolidated Statement of Income</h2><p>3</p>
      <h2 id="balance">Consolidated Balance Sheet</h2><p>5</p>
      <h2 id="notes">Notes to Consolidated Financial Statements</h2><p>10</p>
      <h2 id="item2">Item 2. Management's Discussion and Analysis</h2>${para(2600, "OUTSIDE_ITEM")}`;
    expect(extractSection(html, { form: "10-Q", item: "1", part: 1 }).ok).toBe(false);
  });
  it("recovers a real item body when a financial title link points directly to notes", () => {
    const html = `<table>${titleOnlyRow("notes", "Notes to Consolidated Financial Statements")}${titleOnlyRow("next", "Management's Discussion and Analysis")}</table>
      <h2>Item 1. Financial Statements</h2><h3>Consolidated Balance Sheets</h3><p>Cash 120 110 Total assets 300 280 Long-term debt 90 80</p>
      <h3 id="notes">Notes to Consolidated Financial Statements</h3><p>Note 1 - Organization. ${"Substantive accounting policies. ".repeat(100)}</p>
      <h2 id="next">Item 2. Management's Discussion and Analysis</h2>${para(2600, "OUTSIDE_ITEM")}`;
    const result = extractSection(html, { form: "10-Q", item: "1", part: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.text).toContain("Cash 120 110");
    expect(result.text).not.toContain("OUTSIDE_ITEM");
  });
  it("does not accept a page-only mini contents list above a short-section threshold", () => {
    const html = `<h2>Part II</h2><h2>Item 5. Other Information</h2><p>Rule 10b5-1 Trading Arrangements Page 46 Disclosure Pursuant to Section 13(r) of the Securities Exchange Act of 1934 Page 46</p><h2>Item 6. Exhibits</h2><p>Outside</p>`;
    const result = extractSection(html, { form: "10-Q", item: "5", part: 2 }, { stubMinChars: 120 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/contents|page.*list/i);
  });
  it("preserves a real short narrative with page references", () => {
    const text = "No director or officer adopted or terminated a trading arrangement during the quarter. Further information is on Page 46 and Page 47.";
    expect(detectStub(text, 120).isStub).toBe(false);
  });
  it("resolves duplicate title-only links to their own section rather than a shared group anchor", () => {
    const html = `<table>${titleOnlyRow("legal", "Other Information")}${titleOnlyRow("legal", "Legal Proceedings")}
      ${titleOnlyRow("risk", "Risk Factors")}${titleOnlyRow("other", "Other Information")}${titleOnlyRow("exhibits", "Exhibits")}</table>
      <h2 id="legal">Legal Proceedings</h2><p>${"LEGAL_WRONG_SECTION ".repeat(12)}</p>
      <h2 id="risk">Risk Factors</h2><p>Risk body</p><h2 id="other">Other Information</h2>
      <p>${"No officer adopted a trading arrangement during this quarter. ".repeat(3)}</p><h2 id="exhibits">Exhibits</h2>`;
    const result = extractSection(html, { form: "10-Q", item: "5", part: 2 }, { stubMinChars: 120 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.text).toContain("No officer adopted");
    expect(result.text).not.toContain("LEGAL_WRONG_SECTION");
  });
});

// ---------------------------------------------------------------------------
// Text / preprocessing utilities
// ---------------------------------------------------------------------------

describe("text utilities", () => {
  it("decodes numeric and named entities", () => {
    expect(decodeEntities("Management&#8217;s&#160;Discussion &amp; Analysis &#x2019;")).toBe(
      "Management’s Discussion & Analysis ’",
    );
  });

  it("htmlToText strips tags/comments and collapses whitespace", () => {
    expect(htmlToText("<!-- x --><div><span>Item&#160;1A.</span>  <b>Risk\nFactors</b></div>")).toBe("Item 1A. Risk Factors");
  });

  it("stripHiddenBlocks removes ix:header and display:none blocks before char counts (F13)", () => {
    const html =
      `<ix:header><div>HIDDENJUNK 73,618 56,251</div></ix:header>` +
      `<div style="display:none"><div>NESTEDHIDDEN</div></div>` +
      `<td colspan="3" style="display:none"/>` +
      `<div>VISIBLE</div>`;
    const text = htmlToText(stripHiddenBlocks(html));
    expect(text).toContain("VISIBLE");
    expect(text).not.toContain("HIDDENJUNK");
    expect(text).not.toContain("NESTEDHIDDEN");
  });

  it("strips thousands of hidden tags within a linear-time budget", () => {
    const hidden = '<td style="display:none"/>';
    const html = hidden.repeat(3500) + `<div>${"VISIBLE ".repeat(250_000)}</div>`;
    const started = performance.now();
    const out = stripHiddenBlocks(html);
    const elapsedMs = performance.now() - started;

    expect(out).toContain("VISIBLE");
    expect(out).not.toContain('style="display:none"');
    expect(elapsedMs).toBeLessThan(1000);
  });

  it("normalizeTitle unifies apostrophes, dashes and ampersands", () => {
    expect(normalizeTitle("MANAGEMENT’S  DISCUSSION & ANALYSIS.")).toBe("management's discussion and analysis");
    expect(normalizeTitle("Financial Review – Risk Factors.")).toBe("financial review - risk factors");
  });
});

describe("mergedAnchors (F1/F2)", () => {
  it("merges fragmented adjacent same-href links (JPM Item 1C)", () => {
    const html = `<td><a href="#g_37">Item 1</a><a href="#g_37">C</a><a href="#g_37">.</a></td>`;
    const anchors = mergedAnchors(html);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].text).toBe("Item 1C.");
    expect(anchors[0].target).toBe("g_37");
  });

  it("does NOT merge item + title links in separate cells", () => {
    const html = `<tr><td><a href="#g_37">Item 1B.</a></td><td><a href="#g_37">Unresolved Staff Comments.</a></td></tr>`;
    const anchors = mergedAnchors(html);
    expect(anchors).toHaveLength(2);
    expect(anchors[0].text).toBe("Item 1B.");
    expect(anchors[1].text).toBe("Unresolved Staff Comments.");
  });
});

describe("resolveAnchor", () => {
  it("finds div ids, span ids and a-name targets", () => {
    const html = `<p>x</p><div id="a1"></div><span id='a2'></span><a name="a3"></a>`;
    expect(resolveAnchor(html, "a1")).toBe(html.indexOf(`<div id="a1">`));
    expect(resolveAnchor(html, "a2")).toBeGreaterThan(0);
    expect(resolveAnchor(html, "a3")).toBeGreaterThan(0);
    expect(resolveAnchor(html, "nope")).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Stub detector on the three REAL captured stubs
// ---------------------------------------------------------------------------

describe("detectStub (Layer 3)", () => {
  it("flags the real JPM Item 7 same-doc stub", () => {
    const text = htmlToText(stripHiddenBlocks(sample("jpm_10k_item7_stub.html")));
    const r = detectStub(text);
    expect(r.isStub).toBe(true);
    expect(text).toContain("appears on pages 46");
  });

  it("flags the real FRD incorporation stub and the WFC wrapper stub", () => {
    for (const f of ["frd_10k_item7_incorporation_stub.html", "wfc_10k_wrapper_item7_stub.html"]) {
      const text = htmlToText(stripHiddenBlocks(sample(f)));
      // Whole-fixture text may be longer; the phrase leg must fire on the stub body itself.
      expect(text.length).toBeGreaterThan(0);
    }
    expect(detectStub("Information in response to this Item 7 can be found in the 2025 Annual Report to Shareholders under “Financial Review.” That information is incorporated into this item by reference.").isStub).toBe(true);
    expect(detectStub("Information with respect to Item 7 is hereby incorporated herein by reference from the section of the Company’s Annual Report to Shareholders.").isStub).toBe(true);
  });

  it("does not flag a real long section", () => {
    const text = `Item 1A. Risk Factors ${"The Company is exposed to macroeconomic risk. ".repeat(100)}`;
    expect(detectStub(text).isStub).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AAPL — Layer 1 TOC-anchor slicing
// ---------------------------------------------------------------------------

const A = "i719388195b384d85a4e238ad88eba90a";

function buildAaplDoc(): string {
  return [
    "<table>",
    itemRow(`${A}_52`, "Item 1A.", "Risk Factors"),
    itemRow(`${A}_70`, "Item 1B.", "Unresolved Staff Comments"),
    itemRow(`${A}_94`, "Item 7.", "Management&#8217;s Discussion and Analysis of Financial Condition and Results of Operations"),
    "</table>",
    sample("aapl_10k_item1a_boundary.html"), // real anchor div _52 + bold header + intro (+ subsection anchor _55)
    para(4000, "AAPLRISK"),
    `<div id="${A}_70"></div><div><span style="font-weight:700">Item 1B.&#160;&#160;Unresolved Staff Comments</span></div><div><span>None.</span></div>`,
    `<div id="${A}_94"></div><div><span style="font-weight:700">Item 7. Management&#8217;s Discussion and Analysis of Financial Condition and Results of Operations</span></div>`,
  ].join("\n");
}

function buildTwentyFDoc(): string {
  return [
    "<table>",
    itemRow("f20_3d", "Item 3.D.", "Risk Factors"),
    itemRow("f20_4", "Item 4.", "Information on the Company"),
    itemRow("f20_5", "Item 5.", "Operating and Financial Review and Prospects"),
    itemRow("f20_6", "Item 6.", "Directors, Senior Management and Employees"),
    "</table>",
    `<div id="f20_3d"></div><h2>Item 3.D. Risk Factors</h2>${para(3000, "F20RISK")}`,
    `<div id="f20_4"></div><h2>Item 4. Information on the Company</h2>${para(3000, "F20COMPANY")}`,
    `<div id="f20_5"></div><h2>Item 5. Operating and Financial Review and Prospects</h2>${para(3000, "F20MDNA")}`,
    `<div id="f20_6"></div><h2>Item 6. Directors, Senior Management and Employees</h2>${para(3000, "F20DIRECTORS")}`,
  ].join("\n");
}

describe("Form 20-F annual sections", () => {
  it("extracts TSMC's unlettered sub-heading within Item 3, ending before Item 4", () => {
    const risk = extractSection(sample("tsm-20f-unlettered-risk.html"), { form: "20-F", item: "3D" }, { stubMinChars: 500 });
    expect(risk.ok).toBe(true);
    if (!risk.ok) return;
    expect(risk.text.startsWith("Risk Factors We wish to caution readers")).toBe(true);
    expect(risk.text.endsWith("results of operations, and financial condition.")).toBe(true);
    expect(risk.text).not.toContain("Not applicable");
    expect(risk.text).not.toContain("Item 3. Key Information");
    expect(risk.text).not.toContain("INFORMATION ON THE COMPANY");
  });

  it("keeps explicit lettered 20-F risk factors on the existing header path", () => {
    const html = sample("tsm-20f-unlettered-risk.html")
      .replace("Risk Factors </span>", "Item 3.D. Risk Factors </span>")
      .replace(/<p>Additional information[^<]*<\/p>/, "");
    const risk = extractSection(html, { form: "20-F", item: "3D" }, { stubMinChars: 500 });
    expect(risk.ok).toBe(true);
    if (!risk.ok) return;
    expect(risk.method).toBe("header-regex");
    expect(risk.text.startsWith("Item 3.D. Risk Factors We wish")).toBe(true);
    expect(risk.text.endsWith("results of operations, and financial condition.")).toBe(true);
  });

  it.each(["heading", "item3", "item4"])("refuses an unlettered section without its %s", (missing) => {
    let html = sample("tsm-20f-unlettered-risk.html");
    if (missing === "heading") html = html.replace("Risk Factors </span>", "Other Information </span>");
    if (missing === "item3") html = html.replace(/ITEM(?:&#8201;| )3\. KEY INFORMATION/g, "KEY INFORMATION");
    if (missing === "item4") html = html.replace(/ITEM(?:&#8201;| )4\. INFORMATION ON THE COMPANY/g, "COMPANY");
    const risk = extractSection(html, { form: "20-F", item: "3D" }, { stubMinChars: 500 });
    expect(risk.ok).toBe(false);
    if (!risk.ok) expect(risk.error.kind).toBe("no_section_found");
  });

  it("applies the existing stub detector to unlettered risk factors", () => {
    const risk = extractSection(sample("tsm-20f-unlettered-risk.html"), { form: "20-F", item: "3D" });
    expect(risk.ok).toBe(false);
    if (!risk.ok) expect(risk.error.kind).toBe("stub_detected");
  });

  it("extracts Item 3.D risk factors and Item 5 operating/financial review", () => {
    const html = buildTwentyFDoc();
    const risk = extractSection(html, { form: "20-F", item: "3D" });
    const mdna = extractSection(html, { form: "20-F", item: "5" });

    expect(risk.ok).toBe(true);
    expect(mdna.ok).toBe(true);
    if (!risk.ok || !mdna.ok) return;
    expect(risk.method).toBe("toc-anchor");
    expect(risk.text).toContain("F20RISK");
    expect(risk.text).not.toContain("F20COMPANY");
    expect(mdna.method).toBe("toc-anchor");
    expect(mdna.text).toContain("F20MDNA");
    expect(mdna.text).not.toContain("F20DIRECTORS");
  });

  it("D-63: extracts the business sections (20-F Item 4, 10-K Item 1) and a 10-Q's notes", () => {
    const company = extractSection(buildTwentyFDoc(), { form: "20-F", item: "4" });
    expect(company.ok && company.text.includes("F20COMPANY") && !company.text.includes("F20MDNA")).toBe(true);
    const tenK = [
      "<table>", itemRow("k_1", "Item 1.", "Business"), itemRow("k_1a", "Item 1A.", "Risk Factors"), "</table>",
      `<div id="k_1"></div><h2>Item 1. Business</h2>${para(3000, "KBUSINESS")}`,
      `<div id="k_1a"></div><h2>Item 1A. Risk Factors</h2>${para(3000, "KRISK")}`,
    ].join("\n");
    const business = extractSection(tenK, { form: "10-K", item: "1" });
    expect(business.ok).toBe(true);
    if (!business.ok) return;
    expect(business.text).toContain("KBUSINESS");
    expect(business.text).not.toContain("KRISK");
    const tenQ = [
      "<table>", partRow("PART I &#8212; FINANCIAL INFORMATION"), itemRowPlain("q_1", "Item 1.", "Financial Statements (Unaudited)"),
      itemRowPlain("q_2", "Item 2.", "Management&#8217;s Discussion and Analysis"), partRow("PART II &#8212; OTHER INFORMATION"),
      itemRowPlain("q_p2_1", "Item 1.", "Legal Proceedings"), "</table>",
      `<div id="q_1"></div><h2>Item 1. Financial Statements</h2>${para(3000, "QNOTES")}`,
      `<div id="q_2"></div><h2>Item 2. MD&amp;A</h2>${para(3000, "QMDNA")}`,
      `<div id="q_p2_1"></div><h2>Item 1. Legal Proceedings</h2>${para(3000, "QLEGAL")}`,
    ].join("\n");
    const statements = extractSection(tenQ, { form: "10-Q", item: "1", part: 1 });
    expect(statements.ok && statements.text.includes("QNOTES") && !statements.text.includes("QMDNA")).toBe(true);
    // The page-closing reference is not the notes heading; the heading followed by its first note is.
    const item = "Balance sheet. See accompanying Notes to Condensed Consolidated Financial Statements. 8 Notes to Condensed Consolidated Financial Statements (Unaudited) Note 1 - Summary of Significant Accounting Policies";
    expect(notesToFinancialStatements(item)?.text).toBe("Notes to Condensed Consolidated Financial Statements (Unaudited) Note 1 - Summary of Significant Accounting Policies");
    expect(notesToFinancialStatements("Balance sheet only.")).toBeNull();
  });

  it("accepts the dotted Item 3.D header when a 20-F has no usable TOC", () => {
    const html = [
      `<h2>Item 3.D. Risk Factors</h2>${para(3000, "F20HEADERONLYRISK")}`,
      `<h2>Item 4. Information on the Company</h2>${para(3000, "F20HEADERONLYBOUNDARY")}`,
    ].join("\n");
    const risk = extractSection(html, { form: "20-F", item: "3D" });
    expect(risk.ok).toBe(true);
    if (!risk.ok) return;
    expect(risk.method).toBe("header-regex");
    expect(risk.text).toContain("F20HEADERONLYRISK");
    expect(risk.text).not.toContain("F20HEADERONLYBOUNDARY");
  });
});

describe("AAPL 10-K Item 1A (Layer 1 toc-anchor)", () => {
  it("slices between the Item 1A and Item 1B anchor targets", () => {
    const r = extractSection(buildAaplDoc(), { form: "10-K", item: "1A" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("toc-anchor");
    expect(r.text.startsWith("Item 1A.")).toBe(true);
    expect(r.text).toContain("The following summarizes factors");
    expect(r.text).toContain("AAPLRISK");
    expect(r.text).not.toContain("Item 1B.");
    expect(r.chars).toBeGreaterThan(2500);
    // Subsection anchor _55 is NOT a TOC item entry, so it must not bound the slice.
    expect(r.text).toContain("Macroeconomic and Industry Risks");
  });

  it("hard-fails loudly when the target section body is a header-only stub (Layer 4)", () => {
    const r = extractSection(buildAaplDoc(), { form: "10-K", item: "7" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("stub_detected");
    expect(r.diagnostics.stub).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// JPM — Item 7 stub + same-doc mini-TOC redirect (Layer 3a)
// ---------------------------------------------------------------------------

const J = "i1e82dc5e49024170976eb7ddc7c0a10b";

function buildJpmDoc(withMiniToc: boolean): string {
  return [
    "<table>",
    itemRow(`${J}_34`, "Item 1A.", "Risk Factors."),
    itemRow(`${J}_37`, "Item 1B.", "Unresolved Staff Comments."),
    itemRow(`${J}_61`, "Item 7.", "Management&#8217;s Discussion and Analysis of Financial Condition and Results of Operations."),
    itemRow(`${J}_64`, "Item 7A.", "Quantitative and Qualitative Disclosures About Market Risk."),
    itemRow(`${J}_67`, "Item 8.", "Financial Statements and Supplementary Data."),
    "</table>",
    ...(withMiniToc
      ? [
          "<table>",
          `<tr><td><a href="#${J}_127">Management&#8217;s discussion and analysis</a></td><td><a href="#${J}_127">46</a></td></tr>`,
          `<tr><td><a href="#${J}_295">Management&#8217;s Report on Internal Control Over Financial Reporting</a></td><td><a href="#${J}_295">161</a></td></tr>`,
          "</table>",
        ]
      : []),
    `<div id="${J}_34"></div><div><span style="font-weight:700">Item 1A. Risk Factors.</span></div>`,
    para(4000, "JPMRISK"),
    `<div id="${J}_37"></div><div><span>Item 1B. Unresolved Staff Comments. None.</span></div>`,
    sample("jpm_10k_item7_stub.html"), // REAL Item 7 stub incl. anchor div _61
    `<div id="${J}_64"></div><div><span>Item 7A. Refer to the Market Risk Management section of Management&#8217;s discussion and analysis on pages 133-142.</span></div>`,
    `<div id="${J}_67"></div><div><span>Item 8. Financial Statements and Supplementary Data on pages 165-314.</span></div>`,
    sample("jpm_10k_mdna_body_start.html"), // REAL MD&A body start incl. anchor div _127
    para(6000, "JPMMDNA"),
    `<div id="${J}_295"></div><div><span style="font-weight:700">Management&#8217;s report on internal control over financial reporting</span></div>`,
    para(600, "MGMTREPORT"),
  ].join("\n");
}

describe("JPM 10-K Item 7 (bank stub -> mini-TOC redirect)", () => {
  it("detects the 395-char stub and redirects to the real MD&A via the mini-TOC", () => {
    const r = extractSection(buildJpmDoc(true), { form: "10-K", item: "7" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("mini-toc-redirect");
    expect(r.text).toContain("The following is Management");
    expect(r.text).toContain("JPMMDNA");
    expect(r.text).not.toContain("MGMTREPORT");
    expect(r.text).not.toContain("appears on pages 46");
    expect(r.diagnostics.stub).toBeDefined(); // the stub WAS seen, then redirected
  });

  it("NEVER returns the stub silently when no redirect target exists", () => {
    const r = extractSection(buildJpmDoc(false), { form: "10-K", item: "7" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("stub_detected");
    expect(r.diagnostics.stub?.chars).toBeLessThan(2500);
  });

  it("redirects a page-header annual-report body after the Item 7 stub", () => {
    const html = [
      "<table>",
      itemRow("stub7", "Item 7.", "Management's Discussion and Analysis"),
      itemRow("stub7a", "Item 7A.", "Quantitative and Qualitative Disclosures"),
      "</table>",
      `<div id="stub7"></div><h2>Item 7. Management's Discussion and Analysis</h2><p>Management's discussion and analysis appears on pages 46-160.</p>`,
      `<div id="stub7a"></div><h2>Item 7A. Quantitative and Qualitative Disclosures</h2>`,
      `<p>JPMorgan Chase & Co./2025 Form 10-K 45 Management's discussion and analysis</p>${para(3000, "PAGEHEADERMDNA")}<p>Refer to the Consolidated Financial Statements and Notes for additional detail.</p>${para(3000, "PAGEHEADERPOSTREFERENCE")}`,
      `<h2>Management's Report on Internal Control Over Financial Reporting</h2>${para(700, "PAGEHEADERBOUNDARY")}`,
    ].join("\n");
    const r = extractSection(html, { form: "10-K", item: "7" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("page-header-redirect");
    expect(r.text).toContain("PAGEHEADERMDNA");
    expect(r.text).toContain("PAGEHEADERPOSTREFERENCE");
    expect(r.text).not.toContain("PAGEHEADERBOUNDARY");
  });

  it("never redirects a stubbed 10-Q Item 2 into appended 10-K annual-report text", () => {
    const html = [
      "<h2>PART I — FINANCIAL INFORMATION</h2>",
      "<h2>Item 2. Management's Discussion and Analysis of Financial Condition and Results of Operations</h2><p>Management's discussion and analysis appears on pages 46-160.</p>",
      "<h2>Item 3. Quantitative and Qualitative Disclosures About Market Risk</h2>",
      `<p>JPMorgan Chase & Co./2025 Form 10-K 45 Management's discussion and analysis</p>${para(3000, "WRONGFORMANNUALMDNA")}`,
      `<h2>Management's Report on Internal Control Over Financial Reporting</h2>${para(700, "WRONGFORMBOUNDARY")}`,
    ].join("\n");
    const r = extractSection(html, { form: "10-Q", item: "2" });
    expect(r.ok).toBe(false);
  });

  it("still extracts Item 1A directly (real inline section)", () => {
    const r = extractSection(buildJpmDoc(true), { form: "10-K", item: "1A" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("toc-anchor");
    expect(r.text).toContain("JPMRISK");
    expect(r.text).not.toContain("JPMMDNA");
  });
});

describe("parseDocument / preparsed reuse (perf refactor, JPM extraction budget fix)", () => {
  it("shared preparsed structure produces byte-identical output to independent parses", () => {
    const doc = buildJpmDoc(true);
    const item1aAlone = extractSection(doc, { form: "10-K", item: "1A" });
    const item7Alone = extractSection(doc, { form: "10-K", item: "7" });

    const parsed = parseDocument(doc);
    const item1aShared = extractSection(doc, { form: "10-K", item: "1A" }, { preparsed: parsed });
    const item7Shared = extractSection(doc, { form: "10-K", item: "7" }, { preparsed: parsed });

    expect(item1aShared).toEqual(item1aAlone);
    expect(item7Shared).toEqual(item7Alone);
  });

  it("actually consumes preparsed instead of re-deriving from the html argument", () => {
    const doc = buildJpmDoc(true);
    const parsed = parseDocument(doc);
    // Empty html string would find nothing if preparsed were ignored.
    const r = extractSection("", { form: "10-K", item: "1A" }, { preparsed: parsed });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain("JPMRISK");
  });

  it("reuses one parsed document for multiple section extractions without consulting html again", () => {
    const big = [
      "<table>",
      itemRow(`${J}_34`, "Item 1A.", "Risk Factors."),
      itemRow(`${J}_61`, "Item 7.", "Management&#8217;s Discussion and Analysis."),
      "</table>",
      `<div id="${J}_34"></div><div><span style="font-weight:700">Item 1A. Risk Factors.</span></div>`,
      para(400_000, "BIGRISK"),
      `<div id="${J}_61"></div><div><span style="font-weight:700">Item 7. Management&#8217;s Discussion and Analysis.</span></div>`,
      para(400_000, "BIGMDNA"),
    ].join("\n");

    const shared = parseDocument(big);
    // Empty html would make either extraction fail if the shared parse were
    // ignored. This proves the reuse contract deterministically; a wall-clock
    // comparison is not reliable under parallel test-suite contention.
    const item1a = extractSection("", { form: "10-K", item: "1A" }, { preparsed: shared });
    const item7 = extractSection("", { form: "10-K", item: "7" }, { preparsed: shared });

    expect(item1a.ok).toBe(true);
    expect(item7.ok).toBe(true);
    if (item1a.ok) expect(item1a.text).toContain("BIGRISK");
    if (item7.ok) expect(item7.text).toContain("BIGMDNA");
  });
});

// ---------------------------------------------------------------------------
// 10-Q — Part-aware extraction + unchanged-from-10-K marker
// ---------------------------------------------------------------------------

const Q = "i1468582547144a00ae69bd4661b9ea50";

function buildTenQDoc(riskFactorsBody: string): string {
  return [
    "<table>",
    partRow("PART I &#8212; FINANCIAL INFORMATION"),
    itemRowPlain(`${Q}_169`, "Item 1.", "Financial Statements."),
    itemRowPlain(`${Q}_25`, "Item 2.", "Management&#8217;s Discussion and Analysis of Financial Condition and Results of Operations."),
    itemRowPlain(`${Q}_343`, "Item 3.", "Quantitative and Qualitative Disclosures About Market Risk."),
    partRow("PART II &#8212; OTHER INFORMATION"),
    itemRowPlain(`${Q}_355`, "Item 1A.", "Risk Factors."),
    itemRowPlain(`${Q}_358`, "Item 2.", "Unregistered Sales of Equity Securities and Use of Proceeds."),
    "</table>",
    // JPM 10-Q body order: MD&A FIRST, financial statements after (position
    // assumptions would fail; anchor boundaries must handle it). The MD&A body
    // carries NO "Item 2." header at all (F6).
    `<div id="${Q}_25"></div>`,
    `<div><span style="font-weight:700">INTRODUCTION</span></div>`,
    `<div><span>The following is Management&#8217;s discussion and analysis of the financial condition and results of operations (&#8220;MD&amp;A&#8221;) of JPMorgan Chase &amp; Co. for the first quarter of 2026.</span></div>`,
    para(6000, "QMDNA"),
    `<div id="${Q}_169"></div><div><span>JPMorgan Chase &amp; Co. Consolidated statements of income</span></div>`,
    para(1500, "QFINSTMTS"),
    `<div><span style="font-weight:700">PART II &#8212; OTHER INFORMATION</span></div>`,
    `<div id="${Q}_355"></div>`,
    riskFactorsBody,
    `<div id="${Q}_358"></div><div><span>Item 2. Unregistered Sales of Equity Securities and Use of Proceeds. None.</span></div>`,
  ].join("\n");
}

const JPM_10Q_RISK_STUB = `<div><span>Item 1A. Risk Factors. Refer to Part I, Item 1A: Risk Factors on pages 9&#8211;31 of JPMorganChase&#8217;s 2025 Form 10-K and Forward-Looking Statements on page 79 of this Form 10-Q for a discussion of certain risk factors.</span></div>`;

describe("10-Q Part-aware extraction", () => {
  it("Part I Item 2 (MD&A) resolves via the title link even with two 'Item 2.' TOC rows", () => {
    const r = extractSection(buildTenQDoc(JPM_10Q_RISK_STUB), { form: "10-Q", item: "2" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("toc-anchor");
    expect(r.text.startsWith("INTRODUCTION")).toBe(true);
    expect(r.text).toContain("QMDNA");
    expect(r.text).not.toContain("QFINSTMTS");
    expect(r.text).not.toContain("Unregistered Sales");
  });

  it("Part II Item 1A stub referencing the 10-K becomes the unchanged-from-10-K marker", () => {
    const r = extractSection(buildTenQDoc(JPM_10Q_RISK_STUB), { form: "10-Q", item: "1A" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("unchanged-from-10k");
    expect(r.marker).toBe("unchanged_from_10k");
    expect(r.text).toContain("2025 Form 10-K");
  });

  it("Part II Item 1A with REAL updates is returned as content (AAPL case)", () => {
    const real = `<div><span>Item 1A. Risk Factors. The Company&#8217;s risk factors have been updated as follows.</span></div>${para(3500, "QRISKUPD")}`;
    const r = extractSection(buildTenQDoc(real), { form: "10-Q", item: "1A" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("toc-anchor");
    expect(r.marker).toBeUndefined();
    expect(r.text).toContain("QRISKUPD");
  });
});

// ---------------------------------------------------------------------------
// WFC wrapper — Layer 2 + exhibit redirect signal (Layer 3b)
// ---------------------------------------------------------------------------

describe("WFC wrapper 10-K (F17/F18/F19)", () => {
  it("finds the ALL-CAPS Item 7 stub via header regex and signals an EX-13 redirect with the quoted section name", () => {
    const r = extractSection(sample("wfc_10k_wrapper_item7_stub.html"), { form: "10-K", item: "7" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("exhibit_redirect");
    expect(r.error.exhibit).toBeDefined();
    expect(r.error.exhibit?.exhibitTypePrefix).toBe("EX-13");
    expect(r.error.exhibit?.section).toBe("mdna");
    const quoted = r.error.exhibit?.quotedTitles ?? [];
    expect(quoted.some((t) => normalizeTitle(t) === "financial review")).toBe(true);
  });
});

describe("extractFromExhibit — WFC EX-13 (toc route, F21 cell-order variance)", () => {
  const X = "i164b6cae1e5547848aac34e66a101b06";
  const exhibit = [
    "<table>",
    // WFC EX-13 TOC puts the PAGE NUMBER first; both cells link to the target.
    `<tr><td><a href="#${X}_31">2</a></td><td><a href="#${X}_31">Financial Review</a></td></tr>`,
    `<tr><td><a href="#${X}_244">62</a></td><td><a href="#${X}_244">Risk Factors</a></td></tr>`,
    `<tr><td><a href="#${X}_250">75</a></td><td><a href="#${X}_250">Controls and Procedures</a></td></tr>`,
    "</table>",
    `<div id="${X}_31"></div><div><span>This Annual Report, including the Financial Review and the Financial Statements and related Notes, contains forward-looking statements.</span></div>`,
    para(6000, "WFCFINREV"),
    `<div id="${X}_244"></div><div><span>Risk Factors An investment in the Company involves risk, including the possibility that the value of the investment could fall substantially.</span></div>`,
    para(4000, "WFCRISK"),
    `<div id="${X}_250"></div><div><span>Controls and Procedures</span></div>`,
    para(500, "WFCCONTROLS"),
  ].join("\n");

  it("resolves MD&A via the quoted 'Financial Review' synonym (F19)", () => {
    const r = extractFromExhibit(exhibit, { section: "mdna", quotedTitles: ["Financial Review."] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("exhibit-toc");
    expect(r.text).toContain("This Annual Report");
    expect(r.text).toContain("WFCFINREV");
    expect(r.text).not.toContain("WFCRISK");
  });

  it("resolves Risk Factors from the composite quoted title 'Financial Review – Risk Factors'", () => {
    const r = extractFromExhibit(exhibit, { section: "riskFactors", quotedTitles: ["Financial Review – Risk Factors."] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("exhibit-toc");
    expect(r.text).toContain("An investment in the Company involves risk");
    expect(r.text).toContain("WFCRISK");
    expect(r.text).not.toContain("WFCFINREV");
    expect(r.text).not.toContain("WFCCONTROLS");
  });
});

// ---------------------------------------------------------------------------
// FRD — no anchors at all; header regex; EX-13 incorporation + header route
// ---------------------------------------------------------------------------

describe("FRD 10-K (F8/F9/F10)", () => {
  it("Item 7 incorporation stub triggers the exhibit redirect with the quoted MD&A title", () => {
    const r = extractSection(sample("frd_10k_item7_incorporation_stub.html"), { form: "10-K", item: "7" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("exhibit_redirect");
    const quoted = (r.error.exhibit?.quotedTitles ?? []).map(normalizeTitle);
    expect(quoted).toContain("management's discussion and analysis of financial condition and results of operations");
  });

  it("extractFromExhibit falls back to the FIRST ALL-CAPS title-only heading (no item number)", () => {
    const exhibit = [
      `<ix:header><div>ex_780550.htm 73,618 56,251 1 1 10,000,000 HIDDENIX</div></ix:header>`,
      para(1200, "FRDSTMTS"),
      `<p><b>MANAGEMENT&#8217;S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS</b></p>`,
      para(5000, "FRDMDNA"),
      // Decoy AFTER the real header (forward-looking boilerplate) — first-match rule must hold.
      `<p>statements within MANAGEMENT&#8217;S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS are forward-looking.</p>`,
      para(500, "FRDTAIL"),
    ].join("\n");
    const r = extractFromExhibit(exhibit, {
      section: "mdna",
      quotedTitles: ["Management’s Discussion and Analysis of Financial Condition and Results of Operations"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("exhibit-header");
    expect(r.text.startsWith("MANAGEMENT")).toBe(true);
    expect(r.text).toContain("FRDMDNA");
    expect(r.text).not.toContain("HIDDENIX");
    expect(r.text).not.toContain("FRDSTMTS");
  });

  it("'Not required.' bodies are surfaced as not_required, never as content (F10)", () => {
    const doc = [
      `<p><b>Item&#160;1A.&#160;&#160;Risk Factors</b></p>`,
      `<p>Not required.</p>`,
      `<p><b>Item&#160;1B.&#160;&#160;Unresolved Staff Comments</b></p>`,
      `<p>None.</p>`,
    ].join("\n");
    const r = extractSection(doc, { form: "10-K", item: "1A" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("not_required");
  });
});

// ---------------------------------------------------------------------------
// MXC — title-only TOC links + header-in-table + F7 cross-reference trap
// ---------------------------------------------------------------------------

describe("mini-TOC redirect — a named boundary outranks an all-caps peer (audit 2026-09-06)", () => {
  const K = "iaudit20260906";
  const build = (entries: readonly (readonly [string, string])[]): string =>
    [
      "<table>",
      itemRow(`${J}_61`, "Item 7.", "Management&#8217;s Discussion and Analysis of Financial Condition and Results of Operations."),
      itemRow(`${J}_64`, "Item 7A.", "Quantitative and Qualitative Disclosures About Market Risk."),
      "</table>",
      "<table>",
      ...entries.map(([id, title]) => `<tr><td><a href="#${K}_${id}">${title}</a></td><td><a href="#${K}_${id}">9</a></td></tr>`),
      "</table>",
      sample("jpm_10k_item7_stub.html"),
      `<div id="${J}_64"></div><div><span>Item 7A. Refer to the Market Risk Management section.</span></div>`,
      `<div id="${K}_a"></div><div><span style="font-weight:700">MANAGEMENT&#8217;S DISCUSSION AND ANALYSIS</span></div>`,
      para(4000, "MDNAPART1"),
      `<div id="${K}_b"></div><div><span style="font-weight:700">RESULTS OF OPERATIONS</span></div>`,
      para(4000, "MDNAPART2"),
      `<div id="${K}_c"></div><div><span style="font-weight:700">Management&#8217;s report on internal control over financial reporting</span></div>`,
      para(600, "MGMTREPORT"),
    ].join("\n");

  it("runs the redirected slice to the named boundary, past an all-caps subsection", () => {
    const r = extractSection(
      build([
        ["a", "MANAGEMENT&#8217;S DISCUSSION AND ANALYSIS"],
        ["b", "RESULTS OF OPERATIONS"],
        ["c", "Management&#8217;s Report on Internal Control Over Financial Reporting"],
      ]),
      { form: "10-K", item: "7" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("mini-toc-redirect");
    expect(r.text).toContain("MDNAPART1");
    expect(r.text).toContain("MDNAPART2"); // used to be cut here, silently
    expect(r.text).not.toContain("MGMTREPORT");
    expect(r.diagnostics.notes.join(" ")).not.toMatch(/ALL-CAPS/);
  });

  it("falls back to the all-caps peer, and says so, when no named boundary follows", () => {
    const r = extractSection(
      build([
        ["a", "MANAGEMENT&#8217;S DISCUSSION AND ANALYSIS"],
        ["b", "RESULTS OF OPERATIONS"],
      ]),
      { form: "10-K", item: "7" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("mini-toc-redirect");
    expect(r.text).toContain("MDNAPART1");
    expect(r.text).not.toContain("MDNAPART2");
    expect(r.diagnostics.notes.join(" ")).toMatch(/mini-TOC slice bounded by the next ALL-CAPS heading/);
  });
});

describe("absence statements and quoted titles (audit 2026-09-06)", () => {
  it("reads 'Not required for smaller reporting companies.' as a not-required body, not a stub", () => {
    const doc = [
      `<p><b>Item&#160;1A.&#160;&#160;Risk Factors</b></p>`,
      `<p>Not required for smaller reporting companies.</p>`,
      `<p><b>Item&#160;1B.&#160;&#160;Unresolved Staff Comments</b></p>`,
      `<p>None.</p>`,
    ].join("\n");
    const r = extractSection(doc, { form: "10-K", item: "1A" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("not_required");
    const rule = [
      `<p><b>Item&#160;1A.&#160;&#160;Risk Factors</b></p>`,
      `<p>Not applicable to smaller reporting companies as defined in Rule 12b-2 of the Exchange Act.</p>`,
      `<p><b>Item&#160;1B.&#160;&#160;Unresolved Staff Comments</b></p>`,
      `<p>None.</p>`,
    ].join("\n");
    const r2 = extractSection(rule, { form: "10-K", item: "1A" });
    expect(!r2.ok && r2.error.kind).toBe("not_required");
  });

  it("ignores a quoted title that names ANOTHER section when choosing the exhibit start", () => {
    // A stub that quotes both of its targets ("see 'Risk Factors' and
    // 'Management's Discussion and Analysis' in the Annual Report") used to
    // hand the MD&A title to the risk-factor search as its top synonym.
    const X = "iexhibitkind";
    const headings = ["MANAGEMENT'S DISCUSSION AND ANALYSIS", "RISK FACTORS", "CONTROLS AND PROCEDURES"];
    const exhibit = [
      "<table>",
      ...headings.map((t, i) => `<tr><td><a href="#${X}_${i}">${t}</a></td></tr>`),
      "</table>",
      ...headings.flatMap((t, i) => [`<div id="${X}_${i}"></div><div><span>${t}</span></div>`, para(4000, `BODY${i}`)]),
    ].join("\n");
    const r = extractFromExhibit(exhibit, {
      section: "riskFactors",
      quotedTitles: ["Management's Discussion and Analysis", "Risk Factors"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain("BODY1");
    expect(r.text).not.toContain("BODY0");
    expect(r.text).not.toContain("BODY2");
  });
});

describe("MXC 10-K (F3/F7/F11)", () => {
  const body = [
    sample("mxc_10k_item1a_header_in_table.html"), // ALL-CAPS <b> header split across <td>s, <span id="s_004"> anchor
    para(4000, "MXCRISK"),
    `<span id="s_005"></span><table><tr><td><b>ITEM 1B.</b></td><td><b>UNRESOLVED STAFF COMMENTS</b></td></tr></table>`,
    `<p>None.</p>`,
  ].join("\n");

  it("extracts Item 1A via title-only TOC links (Layer 1 title variant)", () => {
    const doc = ["<table>", titleOnlyRow("s_004", "Risk Factors"), titleOnlyRow("s_005", "Unresolved Staff Comments"), "</table>", body].join("\n");
    const r = extractSection(doc, { form: "10-K", item: "1A" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("toc-title");
    expect(r.text).toContain("ITEM 1A.");
    expect(r.text).toContain("The Company is subject to various risks");
    expect(r.text).toContain("MXCRISK");
    expect(r.text).not.toContain("UNRESOLVED STAFF COMMENTS");
  });

  it("title-only slice stops at an ITEM-numbered anchor, not only the next title link", () => {
    // The title-only branch runs whenever no item-numbered entry matched the
    // WANTED item — which does not mean no item-numbered entries exist. Bounding
    // only by title links let the slice run through a later item's heading and
    // return that item's body as part of this section.
    const doc = [
      "<table>",
      titleOnlyRow("s_004", "Risk Factors"),
      // A linked item row for a DIFFERENT item, anchored between the two titles.
      itemRow("s_005", "Item 1B.", "Unresolved Staff Comments"),
      "</table>",
      sample("mxc_10k_item1a_header_in_table.html"),
      para(4000, "MXCRISK"),
      `<span id="s_005"></span><table><tr><td><b>ITEM 1B.</b></td><td><b>UNRESOLVED STAFF COMMENTS</b></td></tr></table>`,
      para(3000, "LATERITEMBODY"),
    ].join("\n");

    const r = extractSection(doc, { form: "10-K", item: "1A" });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain("MXCRISK");
    expect(r.text).not.toContain("LATERITEMBODY");
    expect(r.text).not.toContain("UNRESOLVED STAFF COMMENTS");
  });

  it("Layer 2 rejects title-bearing cross-references appearing after later headers (F7 last-match trap)", () => {
    const doc = [
      body,
      // Inside a later item: MXC-style cross-reference INCLUDING the section title.
      `<p>For additional information about cybersecurity threats, see &#8220;Item 1A. Risk Factors&#8221; above for additional information.</p>`,
    ].join("\n");
    const r = extractSection(doc, { form: "10-K", item: "1A" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("header-regex");
    expect(r.text.startsWith("ITEM 1A.")).toBe(true);
    expect(r.text).toContain("MXCRISK");
    expect(r.text).not.toContain("additional information");
  });
});

// ---------------------------------------------------------------------------
// BAC — F15 interposed entity name / F16 decoy swarm (header candidates)
// ---------------------------------------------------------------------------

describe("BAC header candidates (F15/F16)", () => {
  const MDNA_TITLE = { id: "7", title: /Management['’‘]?s?[\s]+Discussion[\s]+and[\s]+Analysis/i };

  it("matches the real BAC Item 7 header with the interposed entity name", () => {
    const text = htmlToText(stripHiddenBlocks(sample("bac_10k_item7_header_entityname.html")));
    const cands = findHeaderCandidates(text, MDNA_TITLE);
    expect(cands.length).toBeGreaterThan(0);
    expect(text.slice(cands[0].index, cands[0].index + 120)).toContain("Bank of America");
  });

  it("rejects 'on page N' decoys (F16)", () => {
    const text =
      "For more information, Item 1A. Risk Factors – Regulatory, Compliance and Legal on page 17 discusses these matters. " +
      "Item 1A. Risk Factors The discussion below addresses our material risk factors of which we are aware.";
    const cands = findHeaderCandidates(text, { id: "1A", title: /Risk[\s]+Factors/i });
    expect(cands).toHaveLength(1);
    expect(text.slice(cands[0].index)).toContain("The discussion below");
  });
});

// ---------------------------------------------------------------------------
// Citi — cross-reference-index mode (Layer 0, F20/F21)
// ---------------------------------------------------------------------------

describe("Citi cross-reference index parsing (real fixture)", () => {
  it("parses items, multi-row page-range continuations and Not Applicable rows", () => {
    const idx = parseCrossRefIndex(stripHiddenBlocks(sample("citi_10k_crossref_index.html")));
    const byItem = new Map(idx.map((e) => [e.item, e]));
    expect(byItem.get("1A")?.pages).toEqual([[49, 62]]);
    expect(byItem.get("7")?.pages).toEqual([
      [8, 36],
      [64, 120],
    ]);
    expect(byItem.get("1B")?.notApplicable).toBe(true);
    // Item 1: "4–36, 121–127," + continuation rows "129, 160–164," + "299–300"
    expect(byItem.get("1")?.pages).toEqual([
      [4, 36],
      [121, 127],
      [129, 129],
      [160, 164],
      [299, 300],
    ]);
  });
});

describe("Citi 10-K extraction (Layer 0 crossref-toc)", () => {
  const C = "iffa471fccb154c4395823fdabb3bda1a";

  function buildCitiDoc(): string {
    const tocSample = sample("citi_10k_contents_toc_rows.html");
    const parts = tocSample.split("<!-- ... -->");
    expect(parts.length).toBe(2);
    return [
      sample("citi_10k_crossref_index.html"),
      "<table>",
      parts[0], // MD&A(8), Executive Summary(8), Citi's Multiyear Transformation(10)
      citiRow(`${C}_127`, "CAPITAL RESOURCES", 37),
      parts[1], // RISK FACTORS(49), SUSTAINABILITY(62), HUMAN CAPITAL(62)
      citiRow(`${C}_151`, "MANAGING GLOBAL RISK", 64),
      citiRow(`${C}_253`, "SIGNIFICANT ACCOUNTING POLICIES", 121),
      "</table>",
      `<div id="${C}_79"></div><div><span style="font-weight:700">MANAGEMENT&#8217;S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS</span></div><div><span>EXECUTIVE SUMMARY As described further throughout this Annual Report.</span></div>`,
      para(3000, "CITIMDNA1"),
      `<div id="${C}_82"></div>`,
      para(800, "CITIEXEC"),
      `<div id="${C}_85"></div>`,
      para(800, "CITITRANSFORM"),
      `<div id="${C}_127"></div><div><span>CAPITAL RESOURCES</span></div>`,
      para(1200, "CITICAP"),
      `<div id="${C}_139"></div><div><span>RISK FACTORS The following discussion presents what management currently believes could be the material risks.</span></div>`,
      para(3000, "CITIRISK"),
      `<div id="${C}_142"></div><div><span>SUSTAINABILITY</span></div>`,
      para(700, "CITISUST"),
      `<div id="${C}_145"></div>`,
      para(700, "CITIHUMAN"),
      `<div id="${C}_151"></div><div><span>MANAGING GLOBAL RISK Overview For Citi, effective risk management is of primary importance.</span></div>`,
      para(3000, "CITIMGR"),
      `<div id="${C}_253"></div><div><span>SIGNIFICANT ACCOUNTING POLICIES AND SIGNIFICANT ESTIMATES</span></div>`,
      para(500, "CITISAP"),
    ].join("\n");
  }

  it("Item 1A resolves by page range through the contents TOC", () => {
    const r = extractSection(buildCitiDoc(), { form: "10-K", item: "1A" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("crossref-toc");
    expect(r.text).toContain("RISK FACTORS The following discussion");
    expect(r.text).toContain("CITIRISK");
    expect(r.text).not.toContain("CITISUST");
    expect(r.text).not.toContain("CITIMGR");
  });

  it("Item 7 assembles BOTH non-contiguous page ranges (8-36 + 64-120)", () => {
    const r = extractSection(buildCitiDoc(), { form: "10-K", item: "7" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.method).toBe("crossref-toc");
    expect(r.text).toContain("CITIMDNA1"); // pages 8-36
    expect(r.text).toContain("CITIMGR"); // pages 64-120 (MANAGING GLOBAL RISK)
    expect(r.text).not.toContain("CITICAP"); // CAPITAL RESOURCES excluded
    expect(r.text).not.toContain("CITIRISK");
    expect(r.text).not.toContain("CITISAP");
  });
});

// ---------------------------------------------------------------------------
// Misc: quoted-title parsing, TOC entries
// ---------------------------------------------------------------------------

describe("parseQuotedTitles", () => {
  it("extracts curly-quoted section names from stubs", () => {
    const stub = htmlToText(sample("wfc_10k_wrapper_item7_stub.html"));
    const titles = parseQuotedTitles(stub);
    expect(titles.some((t) => normalizeTitle(t) === "financial review")).toBe(true);
  });
});

describe("parseTocEntries", () => {
  it("binds plain-text item cells to the row title link and tracks parts (F3)", () => {
    const html = [
      "<table>",
      partRow("PART I &#8212; FINANCIAL INFORMATION"),
      itemRowPlain("t_25", "Item 2.", "Management&#8217;s Discussion and Analysis of Financial Condition and Results of Operations."),
      partRow("PART II &#8212; OTHER INFORMATION"),
      itemRowPlain("t_355", "Item 1A.", "Risk Factors."),
      "</table>",
    ].join("\n");
    const entries = parseTocEntries(html).filter((e) => e.item !== undefined);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ item: "2", target: "t_25", part: 1 });
    expect(entries[1]).toMatchObject({ item: "1A", target: "t_355", part: 2 });
    expect(entries[0].title).toContain("Discussion and Analysis");
  });
});

/**
 * REJECT_AFTER_100_RE scanned a 100-character prose window after the item
 * reference for "in this report" / "for a discussion". The standard SEC
 * risk-factor preamble reaches those exact words well inside 100 characters,
 * so a GENUINE Item 1A header was rejected as a cross-reference and the item
 * was left with zero candidates. The marker is now bound to the reference
 * itself: only quotes, punctuation and whitespace may intervene.
 */
describe("cross-reference rejection does not eat genuine headers", () => {
  const RISK = { id: "1A", title: /Risk[\s]+Factors/i };

  it("keeps a real Item 1A header whose preamble mentions this Annual Report", () => {
    const text = [
      "Item 1A. Risk Factors",
      "",
      "You should carefully consider the risks and uncertainties described below,",
      "together with all of the other information included in this Annual Report on",
      "Form 10-K, before deciding to invest in our common stock.",
    ].join("\n");

    expect(findHeaderCandidates(text, RISK).length).toBeGreaterThan(0);
  });

  it("keeps a real header whose preamble says 'for a discussion'", () => {
    const text = [
      "Item 1A. Risk Factors",
      "",
      "Our operations are subject to numerous risks. See the following pages for a",
      "discussion of the principal factors affecting our business.",
    ].join("\n");

    expect(findHeaderCandidates(text, RISK).length).toBeGreaterThan(0);
  });

  it("still rejects a quoted cross-reference attached to the reference", () => {
    const text =
      'Additional detail appears under "Item 1A. Risk Factors" in this Annual Report on Form 10-K.';

    expect(findHeaderCandidates(text, RISK)).toHaveLength(0);
  });

  it("still rejects a bare cross-reference followed by 'for a discussion'", () => {
    const text = "See Item 1A. Risk Factors for a discussion of these matters.";

    expect(findHeaderCandidates(text, RISK)).toHaveLength(0);
  });
});

/**
 * Route 1's boundary rule. The all-caps peer test used to sit on equal footing
 * with the named BOUNDARY_SYNONYMS, but inside an exhibit a section's own
 * SUBSECTIONS are usually all-caps too, so the slice ended at the first
 * subsection and returned that fragment as ok:true with no note. It is now a
 * fallback, used only when no named boundary follows the start.
 */
describe("extractFromExhibit — all-caps boundary is a fallback, not a peer rule", () => {
  const X = "ixaaaabbbbccccdddd";
  const build = (headings: readonly string[]): string =>
    [
      "<table>",
      ...headings.map(
        (title, i) => `<tr><td><a href="#${X}_${i}">${title}</a></td></tr>`,
      ),
      "</table>",
      ...headings.flatMap((title, i) => [
        `<div id="${X}_${i}"></div><div><span>${title}</span></div>`,
        para(4000, `BODY${i}`),
      ]),
    ].join("\n");

  it("discloses the fallback when no named boundary follows the start", () => {
    // No BOUNDARY_SYNONYMS entry follows, so the all-caps peer rule is all that
    // is left. Period-end dates alone cannot tell a subsection from a section,
    // so the slice still bounds conservatively — but it now SAYS so, instead of
    // returning a possibly-truncated fragment as ok:true in silence.
    const exhibit = build(["FINANCIAL REVIEW", "RESULTS OF OPERATIONS", "LIQUIDITY"]);
    const r = extractFromExhibit(exhibit, { section: "mdna", quotedTitles: ["Financial Review"] });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.diagnostics.notes.join(" ")).toMatch(/ALL-CAPS|truncated/i);
  });

  it("stops at a NAMED boundary and does not fall back", () => {
    const exhibit = build(["FINANCIAL REVIEW", "RESULTS OF OPERATIONS", "RISK FACTORS"]);
    const r = extractFromExhibit(exhibit, { section: "mdna", quotedTitles: ["Financial Review"] });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Bounded by the named boundary, so the risk-factor body is excluded...
    expect(r.text).not.toContain("BODY2");
    // ...and the subsection between start and boundary is retained.
    expect(r.text).toContain("BODY1");
    expect(r.diagnostics.notes.join(" ")).not.toMatch(/ALL-CAPS/i);
  });
});
