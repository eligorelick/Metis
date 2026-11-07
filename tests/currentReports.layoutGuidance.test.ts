import { describe, expect, it } from "vitest";
import { parseDocument } from "@/edgar/extract";
import { parseGuidance } from "@/edgar/currentReports";

// Synthetic layout cells, financial values and issuer; no retained source HTML.
const row = (label: string, value: string) => `<tr><td></td><td colspan="3">${label}</td><td style="display:none"></td><td colspan="3">${value}</td><td></td></tr>`;
const markup = `<html><body><h2>Business Outlook</h2><p>The following statements are forward looking, and actual results may differ materially.</p>
<p>The following table summarizes GAAP and Non-GAAP guidance based on the current outlook.</p>
<table><tr><td></td><td></td><td colspan="6">Current Guidance <div>Q2 FY28 Est.<sup>1</sup></div></td></tr>
${row("Revenues", "$6.4B - $6.8B")}${row("Supplemental Revenue Information", "")}${row("Components revenues", "$4.0B - $4.2B")}
${row("GAAP diluted EPS", "$1.10 - $1.30")}${row("Less diluted EPS attributable to other items", "($0.20)")}${row("Non-GAAP diluted EPS", "$1.30 - $1.50")}
</table><p>(1) Our outlook includes expected pending business combinations.</p><h2>Conference Call</h2></body></html>`;
const parse = (html = markup) => { const document = parseDocument(html); return { document, guidance: parseGuidance(document.fullText, document) }; };

describe("source-bound guidance with decorative filing layout cells", () => {
  it("retains consolidated ranges, explicit EPS bases and the complete fiscal label across supplemental rows", () => {
    const { document, guidance } = parse();
    expect(guidance?.items.map(i => [i.metric, i.basis, i.period.label, i.low, i.high])).toEqual([
      ["revenue", "unspecified", "Q2 FY2028", 6.4e9, 6.8e9], ["eps", "gaap", "Q2 FY2028", 1.1, 1.3], ["eps", "non-gaap", "Q2 FY2028", 1.3, 1.5],
    ]);
    for (const item of guidance!.items) {
      expect(document.fullText.slice(item.span!.start, item.span!.end)).toBe(item.span!.text);
      expect(document.fullText.slice(item.headerSpan!.start, item.headerSpan!.end)).toBe(item.headerSpan!.text);
    }
    expect(guidance?.qualifiers.join(" ")).toContain("pending business combinations");
  });
  it.each([
    (scope: string) => `<p>${scope}</p>`,
    (scope: string) => `<table><tr><td>(2)</td><td>${scope}</td></tr></table>`,
    (scope: string) => `<ix:nonNumeric name="ex:ScopeTextBlock">${scope}</ix:nonNumeric>`,
  ])("refuses trailing restricted populations through presentation wrappers", wrap => {
    for (const scope of ["These figures cover only the Components segment.", "The guidance excludes the Services business.", "The table above reports guidance for our Network division."]) {
      expect(parse(markup.replace("</table><p>(1)", `</table>${wrap(scope)}<p>(1)`)).guidance?.items ?? []).toEqual([]);
    }
  });
  it("retains ordinary footnotes through layout tables and tagged prose", () => {
    const footnotes = `<table><tr><td>(2)</td><td>Our estimate includes $0.15 per share of acquisition costs.</td></tr></table><ix:nonNumeric name="ex:ScopeTextBlock">The outlook assumes stable currency rates.</ix:nonNumeric>`;
    const result = parse(markup.replace("<h2>Conference Call", footnotes + "<h2>Conference Call")).guidance;
    expect(result?.items).toHaveLength(3);
    expect(result?.qualifiers.join(" ")).toContain("includes $0.15 per share of acquisition costs");
    expect(result?.qualifiers.join(" ")).toContain("assumes stable currency rates");
  });
  it("stops at a separate disclosure but retains restrictions before it", () => {
    const next = `<h2>Segment Results</h2><table><tr><th>Metric</th><th>Q1 FY28</th></tr><tr><td>Revenues</td><td>$4.2 billion</td></tr></table><p>These figures cover only the Components segment.</p>`;
    expect(parse(markup.replace("<h2>Conference Call</h2>", next)).guidance?.items).toHaveLength(3);
    expect(parse(markup.replace("<h2>Conference Call</h2>", `<p>The above guidance covers only the Components segment.</p>${next}`)).guidance?.items ?? []).toEqual([]);
  });
  it("keeps footnote headings and unintroduced numeric layout cells inside scope", () => {
    const note = `<h3>Guidance Footnotes</h3><table><tr><td>FY2028 assumptions</td><td>$0.20 acquisition expenses</td></tr></table><p>These figures cover only our Network division.</p>`;
    expect(parse(markup.replace("<h2>Conference Call</h2>", note)).guidance?.items ?? []).toEqual([]);
  });
  it("refuses an unresolved qualification window instead of truncating it", () => {
    expect(parse(markup.replace("<h2>Conference Call</h2>", "<p>" + "Unresolved scope. ".repeat(1000) + "</p>")).guidance?.items ?? []).toEqual([]);
  });
  it.each([
    ["extra value column", (h: string) => h.replace("$6.4B - $6.8B</td>", "$6.4B - $6.8B</td><td>$7B - $8B</td>")],
    ["duplicate consolidated row", (h: string) => h.replace("</table>", row("Revenues", "$7B - $8B") + "</table>")],
    ["segment scope", (h: string) => h.replace("<table>", "<h3>Components</h3><table>")],
    ["paragraph segment before introduction", (h: string) => h.replace('<p>The following table', '<p>Components</p><p>The following table')],
    ["segment table caption", (h: string) => h.replace('<table>', '<table><caption>Components segment</caption>')],
    ["segment label with colon", (h: string) => h.replace('<p>The following table', '<p>Components:</p><p>The following table')],
    ["segment restriction before introduction", (h: string) => h.replace('<p>The following table', '<p>The guidance below relates only to our Components segment.</p><p>The following table')],
    ["business-only restriction before introduction", (h: string) => h.replace('<p>The following table', '<p>The table below reports guidance for our Components business only.</p><p>The following table')],
    ["hidden scope", (h: string) => h.replace("<body>", "<body hidden>")],
    ["multiple periods", (h: string) => h.replace("Current Guidance ", "Previous Guidance Q1 FY28 Current Guidance ")],
    ["rowspan", (h: string) => h.replace('colspan="3"', 'rowspan="2"')],
  ] as const)("refuses %s without rescuing flattened amounts", (_label, change) => {
    expect(parse(change(markup)).guidance?.items ?? []).toEqual([]);
  });
});
