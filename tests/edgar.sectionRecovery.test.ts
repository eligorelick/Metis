import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractSection, type SectionSpec } from "@/edgar/extract";

const sample = (name: string) => readFileSync(path.resolve("fixtures/edgar", name), "utf8");

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
    const result = extractSection(sample("q6-intc-sections.html"), { form: "10-K", item });
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
    ["TOC row", "<table><tr><td>Item 1A.</td><td>Risk Factors</td><td>9</td></tr></table>"],
    ["cross-reference index row", "<div>Form 10-K Cross-Reference Index</div><table><tr><td>Item 1A.</td><td>Risk Factors</td><td>Pages 9 - 12</td></tr></table>"],
    ["prose reference", "<p>Read Item 1A. Risk Factors for additional description of cybersecurity risks.</p>"],
    ["page header", "<div>Risk Factors</div>"],
  ])("refuses a %s followed by another item's long body", (_label, heading) => {
    const html = `${heading}<p>Item 1B. Unresolved Staff Comments</p><p>${"Another item's discussion. ".repeat(150)}</p><p>Item 2. Properties</p>`;
    expect(extractSection(html, { form: "10-K", item: "1A" }).ok).toBe(false);
  });

  it("refuses a missing section and a missing ending boundary", () => {
    const html = sample("q6-jnj-sections.html");
    expect(extractSection(html.replace("<div>Item 1A. Risk factors</div>", ""), { form: "10-K", item: "1A" }).ok).toBe(false);
    const missingEnd = sample("q6-cat-sections.html").replaceAll("Item 1A. Risk Factors.", "The next heading is unavailable.");
    expect(extractSection(missingEnd, { form: "10-K", item: "1" }).ok).toBe(false);
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
    const html = sample("q6-intc-sections.html").replace(from, to);
    expect(extractSection(html, { form: "10-K", item: "7" }).ok).toBe(false);
  });

  it("accepts an empty page target immediately before its page break", () => {
    const html = sample("q6-intc-sections.html").replace(
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
    const html = sample("q6-intc-sections.html").replace('<a href="#p29">32</a>', '<a href="#p29">29</a>');
    expect(extractSection(html, { form: "10-K", item: "7" }).ok).toBe(true);
  });

  it("refuses duplicate item headers in a linked index", () => {
    const row = "<tr><td>Item 7.</td><td>Management's Discussion and Analysis of Financial Condition and Results of Operations:</td><td/></tr>";
    const html = sample("q6-intc-sections.html").replace("<tr><td>Item 7A.</td>", row + "<tr><td>Item 7A.</td>");
    expect(extractSection(html, { form: "10-K", item: "7" }).ok).toBe(false);
  });

  it("refuses an earlier-page anchor separated from the next page by prose", () => {
    const html = sample("q6-intc-sections.html").replace(
      '<hr style="page-break-after:always"/>\n<div id="p18"></div>',
      '<div id="p18"></div><p>Text still on the earlier page.</p><hr style="page-break-after:always"/>\n',
    );
    expect(extractSection(html, { form: "10-K", item: "7" }).ok).toBe(false);
  });

  it("resolves a mapped page with an image-only footer label", () => {
    const html = sample("q6-intc-sections.html")
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
