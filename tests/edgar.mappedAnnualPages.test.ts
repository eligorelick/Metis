import { describe, expect, it } from "vitest";
import { extractSection } from "@/edgar/extract";

// Synthetic fixed-page layout and split index, shaped like integrated reports.
const discussion = (label: string) => `<p>${`${label} describes products, customers, demand and operating results. `.repeat(45)}</p>`;
const page = (number: number, body: string) =>
  `<div style="position:relative;height:600pt;width:800pt;overflow:hidden">` +
  `<table><tr><td>Example Annual Report 2025</td><td>${number}</td></tr></table>${body}</div>`;
const columns = "<tr><th>Item</th><th>Form 20-F caption</th><th>Location in this document</th><th>Page</th></tr>";
const mapping = (title: string, number: number, id = `p${number}`) =>
  `<tr><td></td><td></td><td>${title}</td><td><a href="#${id}">${number}</a></td></tr>`;
const integrated = () => page(6, `<h2>Business overview</h2><div id="p6"></div>${discussion("BUSINESS")}`) +
  page(20, `<h2>Operating results</h2><div id="p20"></div>${discussion("OPERATING")}`) +
  page(50, `<h2>Accounting policies</h2><div id="p50"></div>${discussion("POLICIES")}`) +
  page(60, `<h2>Unmapped chapter</h2>${discussion("UNRELATED")}`) +
  `<h2>Appendix - Reference table 20-F</h2><table>${columns}` +
  `<tr><td>4</td><td colspan="2">Information on the Company</td><td></td></tr>` + mapping("Business overview", 6) +
  `<tr><td>4A</td><td colspan="2">Unresolved Staff Comments</td><td></td></tr>` +
  `<tr><td>5</td><td colspan="2">Operating and Financial Review and Prospects</td><td></td></tr>` + mapping("Operating results", 20) +
  `</table><table>${columns}${mapping("Accounting policies", 50)}` +
  `<tr><td>6</td><td colspan="2">Directors, Senior Management and Employees</td><td></td></tr></table>`;
const navigation = `<div>${Array.from({ length: 100 }, () => '<a href="#p20">NAVIGATION_ONLY</a> Product overview').join(" ")}</div>`;

describe("explicit integrated-report page excerpts", () => {
  it.each(["4", "5"] as const)("recovers Item %s from every mapped page without implying chapter completeness", item => {
    const result = extractSection(integrated(), { form: "20-F", item });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.method).toBe("reference-table-pages");
    expect(result.text).toMatch(/^20-F Item [45]: mapped-page excerpts/);
    expect(result.text).toContain("Chapters may continue beyond the referenced pages");
    expect(result.text).toContain(item === "4" ? "BUSINESS" : "OPERATING");
    expect(result.text.includes("POLICIES")).toBe(item === "5");
    expect(result.text).not.toContain("UNRELATED");
    expect(result.text).not.toContain("Form 20-F caption");
  });

  it.each([
    ["a missing mapped destination", (h: string) => h.replace('id="p50"', 'id="missing"')],
    ["a duplicate page number", (h: string) => page(50, discussion("DECOY")) + h],
    ["two different printed page numbers in one box", (h: string) => h.replace('<h2>Accounting policies</h2>', '<table><tr><td>Example Annual Report 2025</td><td>51</td></tr></table><h2>Accounting policies</h2>')],
    ["a target on the wrong printed page", (h: string) => h.replace('href="#p50"', 'href="#p6"')],
    ["an external reference", (h: string) => h.replace('href="#p50"', 'href="another.htm#p50"')],
    ["a contents page", (h: string) => h.replace("<h2>Accounting policies</h2>", "<h2>Table of Contents</h2>")],
    ["a contents heading inside a layout table", (h: string) => h.replace("<h2>Accounting policies</h2>", "<table><tr><td><h2>Table of Contents</h2></td></tr></table>")],
    ["an unaccounted table inside the item mapping", (h: string) => h.replace(`</table><table>${columns}${mapping("Accounting policies", 50)}`,
      `</table><table><tr><td>Reference note</td><td>See page 50</td></tr></table><table>${columns}${mapping("Accounting policies", 50)}`)],
    ["a headerless continuation with a missing destination", (h: string) => h.replace('id="p50"', 'id="missing"').replace(`</table><table>${columns}${mapping("Accounting policies", 50)}`,
      `</table><table>${mapping("Accounting policies", 50)}</table><table>${columns}`)],
    ["an unclosed item mapping", (h: string) => h.replace('<tr><td>6</td><td colspan="2">Directors, Senior Management and Employees</td><td></td></tr>', "")],
    ["an unmapped nonempty continuation row", (h: string) => h.replace(mapping("Accounting policies", 50), '<tr><td></td><td></td><td>See the annual report exhibit</td><td></td></tr>')],
  ] as const)("withholds the entire Item 5 for %s", (_label, change) => {
    expect(extractSection(change(integrated()), { form: "20-F", item: "5" }).ok).toBe(false);
  });

  it("reads a headerless continuation table and a page footer between index tables", () => {
    const html = integrated().replace(`</table><table>${columns}${mapping("Accounting policies", 50)}`,
      `</table><table><tr><td>Example Annual Report 2025</td><td>292</td></tr></table><table>${mapping("Accounting policies", 50)}</table><table>${columns}`);
    const result = extractSection(html, { form: "20-F", item: "5" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain("POLICIES");
  });

  it("keeps a page whose only Contents text is a running back-link", () => {
    const html = integrated().replace("<h2>Accounting policies</h2>", '<h2>Accounting policies</h2><div><a href="#p6">Contents</a></div>');
    const result = extractSection(html, { form: "20-F", item: "5" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain("POLICIES");
  });

  it("reports the unresolved reference rather than a generic missing section", () => {
    const html = integrated().replace('id="p50"', 'id="missing"');
    const result = extractSection(html, { form: "20-F", item: "5" });
    expect(!result.ok && result.error.kind).toBe("unresolved_reference");
    expect(!result.ok && result.error.message).toMatch(/page 50.*destination/i);
  });

  it("rejects a mapped navigation page even without a Contents heading", () => {
    const html = integrated().replace(discussion("BUSINESS"), navigation);
    expect(extractSection(html, { form: "20-F", item: "4" }).ok).toBe(false);
  });

  it("omits a resolved navigation page with a disclosure while retaining the other mapped narrative", () => {
    const html = integrated().replace(discussion("POLICIES"), navigation);
    const result = extractSection(html, { form: "20-F", item: "5" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain("OPERATING");
    expect(result.text).not.toContain("NAVIGATION_ONLY");
    expect(result.text).toContain("Navigation-only mapped pages omitted: 50");
  });
});

describe("explicitly shared 10-K page ranges", () => {
  it.each(["1", "7"] as const)("recovers every mapped range for Item %s when the filing incorporates pages into both items", item => {
    const printedPage = (number: number, label: string) => `<div id="p${number}"></div>${discussion(label)}` +
      `<table><tr><td>Business Review</td><td>${number}</td></tr></table><hr style="page-break-after:always"/>`;
    const html = printedPage(2, "BUSINESS") + printedPage(3, "SHARED") + printedPage(4, "LIQUIDITY") +
      `<div>Form 10-K Cross-Reference Index</div><table>` +
      `<tr><td>Item 1.</td><td>Business</td><td></td></tr>` +
      `<tr><td></td><td>Business description</td><td>Pages <a href="#p2">2</a> - <a href="#p3">3</a></td></tr>` +
      `<tr><td>Item 1A.</td><td>Risk Factors</td><td>Page 8</td></tr>` +
      `<tr><td>Item 7.</td><td>Management's Discussion and Analysis</td><td></td></tr>` +
      `<tr><td></td><td>Operating results</td><td>Pages <a href="#p3">3</a> - <a href="#p4">4</a></td></tr>` +
      `<tr><td>Item 7A.</td><td>Quantitative and Qualitative Disclosures About Market Risk</td><td>Page 9</td></tr></table>`;
    const result = extractSection(html, { form: "10-K", item });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.method).toBe("linked-index-redirect");
    expect(result.text).toContain("SHARED");
    expect(result.text.includes("BUSINESS")).toBe(item === "1");
    expect(result.text.includes("LIQUIDITY")).toBe(item === "7");
    expect(result.text).not.toContain("Form 10-K Cross-Reference Index");
    expect(result.diagnostics.notes.join(" ")).toContain("shared");
  });
});

describe("unresolved same-document financial-statement references", () => {
  it.each([
    ["8", "See Item 15. Exhibits and Financial Statement Schedules.", "Item 15"],
    ["8", "See Index to Financial Statements and Supplemental Data on page 67.", "page 67"],
    ["8", "The Consolidated Financial Statements listed in the Index to Financial Statements on page F-1 are filed as part of this report.", "page F-1"],
    ["15", "Financial Statements are included herein by reference to the pages indicated on the index appearing in Item 7. Management's Discussion and Analysis.", "Item 7"],
  ] as const)("preserves the source reference for Item %s instead of reporting an unexplained stub", (item, body, reference) => {
    const title = item === "8" ? "Financial Statements and Supplementary Data" : "Exhibits and Financial Statement Schedules";
    const html = `<h2>Item ${item}. ${title}</h2><p>${body}</p><h2>Item 16. Form 10-K Summary</h2>`;
    const result = extractSection(html, { form: "10-K", item });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("unresolved_reference");
    expect(result.error.message).toContain(reference);
    expect(result.error.message).toContain("no complete financial-statement section boundaries were proved");
  });
});

it.each(["1A", "7"] as const)("reports the exhibit-based 40-F structure for Item %s without treating its cover as a 10-K", item => {
  const result = extractSection("<h2>Form 40-F</h2><p>The annual report is incorporated as Exhibit 99.1.</p>", { form: "40-F", item });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.kind).toBe("unresolved_reference");
  expect(result.error.message).toContain("40-F");
  expect(result.error.message).toContain("filing index");
  expect(result.error.message).toContain("exhibit");
});
