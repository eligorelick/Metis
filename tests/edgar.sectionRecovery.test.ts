import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { extractSection, parseDocument, type SectionSpec } from "@/edgar/extract";

const sample = (name: string) => readFileSync(path.resolve("fixtures/edgar", name), "utf8");
const safeIndex = () => sample("q6-intc-sections.html").replace(', <a href="#p18">18</a>', "");
// A deliberately short first-layer slice makes the structural retry observable.
const retryBody = (body: string, item = "1A", next = "1B", title = "Risk Factors") =>
  `<table><tr><td><a href="#stub">Item ${item}. ${title}</a></td></tr><tr><td><a href="#cut">Item ${next}.</a></td></tr></table>` +
  `<div id="stub">Short initial slice.</div><div id="cut"></div>${body}`;

describe("failed annual section recovery from filing structure", () => {
  it.each([
    ["q6-jnj-sections.html", { form: "10-K", item: "1A" }, "An investment in the Company", "Item 1B."],
    ["q6-cat-sections.html", { form: "10-K", item: "1" }, "Originally organized as Caterpillar", "Item 1A."],
    ["q6-sap-sections.html", { form: "20-F", item: "4" }, "Our legal corporate name is SAP SE", "ITEM 4A."],
    ["q6-sap-sections.html", { form: "20-F", item: "5" }, "principal sources of revenue", "ITEM 6."],
    ["q6-sony-sections.html", { form: "20-F", item: "5" }, "Consolidated Financial Results", "Item 6."],
    ["q6-nvo-sections.html", { form: "20-F", item: "3D" }, "potential risk on our business", "ITEM 4"],
    ["q6-baba-sections.html", { form: "20-F", item: "3D" }, "Summary of Risk Factors", "ITEM 4"],
  ] as const)("recovers %s %j without the next item", (file, spec, inside, outside) => {
    const result = extractSection(sample(file), spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.method).toBe("structured-item");
    expect(result.chars).toBeGreaterThanOrEqual(2500);
    expect(result.text).toContain(inside);
    expect(result.text).not.toContain(outside);
  });

  it("follows the 20-F reference-table risk mapping through continued pages", () => {
    const result = extractSection(sample("q6-asml-sections.html"), { form: "20-F", item: "3D" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.method).toBe("reference-table-redirect");
    expect(result.text).toMatch(/^Risk factors The risk factors outlined/);
    expect(result.text).toContain("Risk factors (continued)");
    expect(result.text).toContain("Our business depends significantly");
    expect(result.text).not.toContain("Security belongs");
    expect(result.text).not.toContain("Form 20-F caption");
  });

  it.each(["1", "7"] as const)("assembles linked 10-K index ranges for Item %s", item => {
    const result = extractSection(safeIndex(), { form: "10-K", item });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.method).toBe("linked-index-redirect");
    expect(result.chars).toBeGreaterThanOrEqual(2500);
    expect(result.text).not.toContain("Form 10-K Cross-Reference Index");
    expect(result.text).not.toContain("General development of business Pages");
    if (item === "7") {
      expect(result.text).toContain("Critical Accounting Estimates");
      // Results and liquidity share page 29: intervals must be merged.
      expect(result.text.match(/Liquidity and Capital Resources/g)).toHaveLength(1);
    }
  });

  it.each([
    ["TOC row", "<table><tr><td>Item 1A.</td><td>Risk Factors</td></tr><tr><td>Overview</td><td>9</td></tr></table>"],
    ["prose reference", "<p>Item 1A. Risk Factors describes the risks discussed elsewhere.</p>"],
    ["repeated page header", "<div>Item 1A. Risk Factors</div><p>Page furniture</p><div>Item 1A. Risk Factors</div>"],
  ])("refuses a %s as the start of another item's long body", (_label, heading) => {
    const html = retryBody(`${heading}<p>${"Another item's discussion. ".repeat(150)}</p><p>Item 1B. Unresolved Staff Comments</p>`);
    const result = extractSection(html, { form: "10-K", item: "1A" });
    expect(result.diagnostics.layersTried).toContain("annual-structure-recovery");
    expect(result.ok).toBe(false);
  });

  it("refuses a cross-reference index row without numeric destination links", () => {
    const html = safeIndex().replace('<a href="#p65">65</a>', "65");
    const result = extractSection(html, { form: "10-K", item: "7" });
    expect(result.diagnostics.layersTried).toContain("annual-structure-recovery");
    expect(result.ok).toBe(false);
  });

  it("refuses a missing section and a missing ending boundary", () => {
    const html = sample("q6-jnj-sections.html");
    expect(extractSection(html.replace("<div>Item 1A. Risk factors</div>", ""), { form: "10-K", item: "1A" }).ok).toBe(false);
    const missingEnd = sample("q6-cat-sections.html").replaceAll("Item 1A. Risk Factors.", "The next heading is unavailable.");
    expect(extractSection(missingEnd, { form: "10-K", item: "1" }).ok).toBe(false);
  });

  it.each(["Quantitative and Qualitative Disclosure About Market Risk", "Quantitative and Qualitative Disclosures About Market Risks", "Issuer-specific market exposure", "Issuer-specific market exposure ".repeat(10)])("ends Item 7 at the next item with title %s", title => {
    const html = retryBody(`<div>Item 7. Management's Discussion and Analysis</div><p>${"Operating results. ".repeat(180)}</p>` +
      `<div>Item 7A. ${title}</div><p>Foreign item text.</p><div>Item 8. Financial Statements and Supplementary Data</div>`, "7", "7A", "Management's Discussion and Analysis");
    const result = extractSection(html, { form: "10-K", item: "7" });
    expect(result.ok && result.method).toBe("structured-item");
    expect(result.ok && result.text).not.toContain("Foreign item text");
    expect(result.ok && result.text).not.toContain("Item 7A");
  });

  it("ends business before a three-cell Item 1A heading", () => {
    const html = sample("q6-cat-sections.html").replace('<div id="risk">Item 1A. Risk Factors.</div>',
      '<table><tr><td>Item 1A.</td><td>Risk Factors.</td><td></td></tr></table><p>Foreign risk text.</p><div>Item 2. Properties</div>');
    expect(html).not.toBe(sample("q6-cat-sections.html"));
    const result = extractSection(html, { form: "10-K", item: "1" });
    expect(result.ok && result.method).toBe("structured-item");
    expect(result.ok && result.text).not.toContain("Foreign risk text");
    expect(result.ok && result.text).not.toContain("Item 1A");
  });

  it("ends 20-F Item 5 before a nonstandard Item 6 title", () => {
    const html = retryBody(`<div>Item 5. Operating and Financial Review and Prospects</div><p>${"Operating results. ".repeat(180)}</p>` +
      '<div>Item 6. Directors and employees</div><p>Foreign governance text.</p><div>Item 7. Major Shareholders and Related Party Transactions</div>', "5", "6", "Operating and Financial Review and Prospects");
    const result = extractSection(html, { form: "20-F", item: "5" });
    expect(result.ok && result.method).toBe("structured-item");
    expect(result.ok && result.text).not.toContain("Foreign governance text");
  });

  it("withholds a linked risk mini-TOC inside Item 3", () => {
    const html = sample("q6-nvo-sections.html").replace('<div>D. RISK FACTORS</div>', '<p><a href="#d">D. Risk Factors</a></p><p>3.A through 3.C belong elsewhere.</p>');
    expect(html).not.toBe(sample("q6-nvo-sections.html"));
    expect(extractSection(html, { form: "20-F", item: "3D" }).ok).toBe(false);
  });

  it("preserves the EX-13 redirect ahead of structural recovery", () => {
    const html = retryBody(`<div>Item 7. Management's Discussion and Analysis</div><p>See Exhibit 13, incorporated by reference.</p>` +
      `<div>Item 7A. Market exposures</div><p>${"Foreign market-risk discussion. ".repeat(130)}</p><div>Item 8. Financial Statements and Supplementary Data</div>`,
      "7", "8", "Management's Discussion and Analysis").replace("Short initial slice.", 'See Exhibit 13, incorporated by reference.');
    const result = extractSection(html, { form: "10-K", item: "7" });
    expect(!result.ok && result.error.kind).toBe("exhibit_redirect");
    expect(result.diagnostics.layersTried).not.toContain("annual-structure-recovery");
  });

  it.each(["4", "5"] as const)("withholds dispersed integrated-report Item %s mappings", item => {
    expect(extractSection(sample("q6-asml-sections.html"), { form: "20-F", item }).ok).toBe(false);
  });

  it.each([
    ["4", "Information on the Company", "5"],
    ["5", "Operating and Financial Review and Prospects", "6"],
  ] as const)("withholds 20-F Item %s without a proved end", (item, title, next) => {
    const html = retryBody(`<div>Item ${item}. ${title}</div><p>${"Unbounded company discussion. ".repeat(150)}</p>`, item, next, title);
    const result = extractSection(html, { form: "20-F", item });
    expect(result.diagnostics.layersTried).toContain("annual-structure-recovery");
    expect(result.ok).toBe(false);
  });

  it.each([
    ["missing named section", /<div>Risk factors<\/div>/, "<div>Unknown section</div>"],
    ["missing named boundary", /<div>Information security<\/div>/, "<div>Unknown boundary</div>"],
    ["wrong reference-table title", /Risk - Risk factors/, "Risk - Another section"],
    ["duplicate destination", /<div id="risk"><\/div>/, '<div id="risk"></div><div id="risk"></div>'],
    ["hidden chapter title", /<div>Risk factors<\/div>/, "<div hidden>Risk factors</div>"],
    ["hidden ending title", /<div>Information security<\/div>/, '<div style="visibility:hidden">Information security</div>'],
    ["external map destination", /<td><a href="#risk">66<\/a><\/td><\/tr><tr><td>4/, '<td><a href="other.html#risk">66</a></td></tr><tr><td>4'],
    ["wrong parent item", /<td>3<\/td><td>Key information/, "<td>2</td><td>Key information"],
    ["text after a self-closing cell", /<td\/><td>D\. Risk Factors/, "<td/>Unowned prose<td>D. Risk Factors"],
  ] as const)("withholds an integrated report with %s", (_label, pattern, replacement) => {
    const html = sample("q6-asml-sections.html").replace(pattern, replacement);
    expect(extractSection(html, { form: "20-F", item: "3D" }).ok).toBe(false);
  });

  it("refuses ambiguous contents rows for an integrated-report mapping", () => {
    const row = '<tr><td>Risk factors</td><td><a href="#risk">66</a></td></tr>';
    const conflicting = `<table>${row}<tr><td>Unrelated chapter</td><td><a href="#other">67</a></td></tr></table>`;
    const html = sample("q6-asml-sections.html").replace("<div>Risk factors</div>", conflicting + "<div>Risk factors</div>")
      .replace("<div>Risk factors (continued)</div>", '<div id="other">Unrelated chapter</div><div>Risk factors (continued)</div>');
    expect(extractSection(html, { form: "20-F", item: "3D" }).ok).toBe(false);
  });

  it("uses the nearest following chapter destination in an out-of-order contents table", () => {
    const html = sample("q6-asml-sections.html")
      .replace('<tr><td>Information security</td>', '<tr><td>Later chapter</td><td><a href="#later">80</a></td></tr><tr><td>Information security</td>')
      .replace('<div>Appendix - Reference table 20-F</div>', '<div id="later">Later chapter</div><div>Appendix - Reference table 20-F</div>');
    const result = extractSection(html, { form: "20-F", item: "3D" });
    expect(result.ok && result.method).toBe("reference-table-redirect");
    expect(result.ok && result.text).not.toContain("Security belongs");
  });

  it("withholds contents whose indented subsection cannot prove the chapter end", () => {
    const html = sample("q6-asml-sections.html")
      .replace('<tr><td>Information security</td>', '<tr><td style="padding-left:20px">Risk detail</td><td><a href="#detail">68</a></td></tr><tr><td>Information security</td>')
      .replace('<div>Risk factors (continued)</div>', `<p>${"Risk discussion. ".repeat(180)}</p><div id="detail">Risk detail</div><div>Risk factors (continued)</div>`);
    const result = extractSection(html, { form: "20-F", item: "3D" });
    expect(result.ok).toBe(false);
  });

  it("ends an integrated-report chapter at the next destination on the same printed page", () => {
    const html = sample("q6-asml-sections.html").replace('href="#security">74</a>', 'href="#security">66</a>');
    const result = extractSection(html, { form: "20-F", item: "3D" });
    expect(result.ok && result.method).toBe("reference-table-redirect");
    expect(result.ok && result.text).not.toContain("Security belongs");
  });

  it("withholds a lower-level subsection heading as a chapter end", () => {
    const html = sample("q6-asml-sections.html").replace('<div>Information security</div>', '<h3>Information security</h3>');
    expect(extractSection(html, { form: "20-F", item: "3D" }).ok).toBe(false);
  });

  it("accepts equivalent reference-table column meanings", () => {
    const html = sample("q6-asml-sections.html").replace('Item</th><th>Form 20-F caption</th><th>Location in this document</th><th>Page',
      'Item number</th><th>Form 20-F description</th><th>Location in this report</th><th>Pages');
    expect(extractSection(html, { form: "20-F", item: "3D" }).ok).toBe(true);
  });

  it("accepts repeated contents entries that prove the same chapter bounds", () => {
    const row = '<tr><td>Risk factors</td><td><a href="#risk">66</a></td></tr>';
    const html = sample("q6-asml-sections.html").replace(row, row + row);
    expect(extractSection(html, { form: "20-F", item: "3D" }).ok).toBe(true);
  });

  it("refuses fragment spellings that require URL decoding", () => {
    const html = sample("q6-asml-sections.html").replaceAll('"#risk"', '"#risk%20factors"').replace('id="risk"', 'id="risk%20factors"');
    expect(extractSection(html, { form: "20-F", item: "3D" }).ok).toBe(false);
  });

  it.each([
    ["a missing printed page", '<td>35</td>', '<td>135</td>'],
    ["a missing target", 'href="#p65"', 'href="#missing"'],
    ["a wrong page target", 'href="#p65"', 'href="#p3"'],
    ["a duplicate printed page", '<td>35</td>', '<td>34</td>'],
    ["an unlinked range", '<a href="#p65">65</a>', '65'],
    ["an unresolved endpoint on an equal-page range", '<a href="#p29">32</a>', '<a href="#missing">29</a>'],
  ])("withholds the whole mapped item for %s", (_label, from, to) => {
    const html = safeIndex().replace(from, to);
    expect(extractSection(html, { form: "10-K", item: "7" }).ok).toBe(false);
  });

  it("withholds an item index split across two tables before its closing item", () => {
    const html = safeIndex().replace('<tr><td/><td>Results of operations</td>', '</table><table><tr><td/><td>Results of operations</td>')
      .replace('<div id="p29"></div>', `<div id="p29"></div><p>${"Liquidity discussion. ".repeat(150)}</p>`);
    expect(extractSection(html, { form: "10-K", item: "7" }).ok).toBe(false);
  });

  it("withholds mapped page text outside the final cell", () => {
    const html = safeIndex().replace('<td>Pages <a href="#p18">18</a> - <a href="#p29">29</a></td>',
      '<td>Pages <a href="#p18">18</a> - <a href="#p29">29</a></td><td/>');
    expect(extractSection(html, { form: "10-K", item: "7" }).ok).toBe(false);
  });

  it("withholds INTC business when MD&A also claims its endpoint page 18", () => {
    expect(extractSection(sample("q6-intc-sections.html"), { form: "10-K", item: "1" }).ok).toBe(false);
  });

  it("withholds Item 7 when Item 7A also claims its last liquidity page", () => {
    const html = safeIndex().replace('Page 33</td>', 'Page 32</td>');
    expect(extractSection(html, { form: "10-K", item: "7" }).ok).toBe(false);
  });

  it("accepts an empty page target immediately before its page break", () => {
    const html = safeIndex().replace(
      '<hr style="page-break-after:always"/>\n<div id="p18"></div>',
      '<div id="p18"></div><hr style="page-break-after:always"/>\n',
    );
    const result = extractSection(html, { form: "10-K", item: "7" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toMatch(/^Management's Discussion and Analysis/);
      expect(result.text).not.toContain("MD&A 18");
    }
  });

  it("accepts an equal-page range when both endpoints resolve", () => {
    const html = safeIndex().replace('<a href="#p29">32</a>', '<a href="#p29">29</a>');
    expect(extractSection(html, { form: "10-K", item: "7" }).ok).toBe(true);
  });

  it("refuses duplicate item headers in a linked index", () => {
    const row = "<tr><td>Item 7.</td><td>Management's Discussion and Analysis of Financial Condition and Results of Operations:</td><td/></tr>";
    const html = safeIndex().replace("<tr><td>Item 7A.</td>", row + "<tr><td>Item 7A.</td>");
    expect(extractSection(html, { form: "10-K", item: "7" }).ok).toBe(false);
  });

  it("refuses an earlier-page anchor separated from the next page by prose", () => {
    const html = safeIndex().replace(
      '<hr style="page-break-after:always"/>\n<div id="p18"></div>',
      '<div id="p18"></div><p>Text still on the earlier page.</p><hr style="page-break-after:always"/>\n',
    );
    expect(extractSection(html, { form: "10-K", item: "7" }).ok).toBe(false);
  });

  it("resolves a mapped page with an image-only footer label", () => {
    const html = safeIndex()
      .replace("<td>Overview and Our Strategy</td><td>3</td>", '<td><img alt="Company logo"/></td><td>3</td>');
    expect(html).not.toBe(sample("q6-intc-sections.html"));
    expect(extractSection(html, { form: "10-K", item: "1" }).ok).toBe(true);
  });

  it("retains the ordinary successful section byte for byte", () => {
    const body = `Item 1A. Risk Factors ${"Operating and competitive risks. ".repeat(100)}`;
    const html = `<p>${body}</p><p>Item 1B. Unresolved Staff Comments</p>`;
    const result = extractSection(html, { form: "10-K", item: "1A" });
    expect(result.ok && result.text).toBe(body.trim());
    expect(result.ok && result.method).toBe("header-regex");
  });

  it("can recover with the same parsed document after an interrupted structural parse", () => {
    const html = "<p>Layout padding.</p>".repeat(1_200) + sample("q6-cat-sections.html");
    const preparsed = parseDocument(html);
    const clock = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(2);
    try {
      const timedOut = extractSection(html, { form: "10-K", item: "1" }, { preparsed, recoveryDeadlineMs: 1 });
      expect(timedOut.ok).toBe(false);
      expect(timedOut.diagnostics.notes).toContain("annual recovery stopped at the filing extraction deadline");
      const recovered = extractSection(html, { form: "10-K", item: "1" }, { preparsed, recoveryDeadlineMs: 100 });
      expect(recovered.ok && recovered.method).toBe("structured-item");
      expect(recovered.ok && recovered.text).toContain("Originally organized as Caterpillar");
    } finally { clock.mockRestore(); }
  });

  it("does not apply the recovery deadline to an ordinary success", () => {
    const html = `<p>Item 1A. Risk Factors ${"Operating risks. ".repeat(200)}</p><p>Item 1B. Unresolved Staff Comments</p>`;
    expect(extractSection(html, { form: "10-K", item: "1A" }, { recoveryDeadlineMs: 0 }))
      .toEqual(extractSection(html, { form: "10-K", item: "1A" }));
  });

  it.each([
    { form: "10-K", item: "1A" },
    { form: "20-F", item: "3D" },
  ] satisfies SectionSpec[])("retains the substantive-body threshold for %j", spec => {
    const html = spec.form === "10-K"
      ? "<div>Item 1A. Risk Factors</div><p>Short body.</p><div>Item 1B. Unresolved Staff Comments</div>"
      : "<div>Item 3. Key Information</div><div>D. Risk Factors</div><p>Short body.</p><div>Item 4. Information on the Company</div>";
    expect(extractSection(html, spec).ok).toBe(false);
  });
});
