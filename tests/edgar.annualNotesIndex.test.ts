import { describe, expect, it } from "vitest";
import { extractAnnualNotesFromIndex, extractSection } from "@/edgar/extract";
import { annualNotesIndexFixture } from "./helpers/annualNotesIndexFixture";

describe("source-derived annual appendix index (synthetic markup)", () => {
  it.each([
    "See Note 1 for details in another document.",
    "Refer to Note 1 in the incorporated financial statements.",
    "Additional details appear in Note 1 elsewhere.",
    "Note 1 is described in another document.",
    '<span>See </span><a href="#other">Note 1</a> for details elsewhere.',
  ])("requires an actual first-note opening, not %s", reference => {
    const html = annualNotesIndexFixture().replace("Note 1 - Organization.", reference);
    expect(extractAnnualNotesFromIndex(html)).toBeNull();
  });

  it.each([
    '<p>Note 1 - Organization.',
    '<p><span>Note 1</span><span> - Organization.</span>',
    '<h3>NOTE 1</h3><p>Organization.',
    '<h3>Note 1 Organization</h3><p>Our organization.',
    '<p>Note One: Organization.',
    '<p>Note A. Organization.',
    '<p>(1) Organization.',
    '<p>1. Organization.',
  ])("retains a genuine first-note opening in original blocks: %s", opening => {
    const html = annualNotesIndexFixture().replace("<p>Note 1 - Organization.", opening);
    expect(extractAnnualNotesFromIndex(html)?.text).toContain("LATER_NOTE_SENTINEL");
  });

  it.each(["SCHEDULE II Valuation and Qualifying Accounts", "Schedule II valuation and qualifying accounts", "schedule ii: valuation and qualifying accounts"])("excludes standalone %s in both source intervals", title => {
    const appendix = `<h2>${title}</h2><p>UNLINKED_SCHEDULE_BODY</p>`;
    const notesHtml = annualNotesIndexFixture().replace('<h2 id="schedule">', `${appendix}<h2 id="schedule">`);
    expect(extractAnnualNotesFromIndex(notesHtml)).toBeNull();
    const prefixHtml = annualNotesIndexFixture().replace('<h2 id="notes">', `${appendix}<h2 id="notes">`);
    const result = extractAnnualNotesFromIndex(prefixHtml);
    expect(result?.text).toContain("LATER_NOTE_SENTINEL");
    expect(result?.statementsText).toBeUndefined();
    expect(result?.evidence.statements).toBeUndefined();
  });

  it.each(["SCHEDULE II Valuation and Qualifying Accounts", "Schedule II: Valuation and Qualifying Accounts"])("keeps full-title prose with the same %s prefix", title => {
    const reference = `<p>${title} provides additional detail elsewhere in this annual report.</p>`;
    const html = annualNotesIndexFixture().replace('<h2 id="schedule">', `${reference}<h2 id="schedule">`).replace('<h2 id="notes">', `${reference}<h2 id="notes">`);
    const result = extractAnnualNotesFromIndex(html);
    expect(result?.text).toContain("LATER_NOTE_SENTINEL");
    expect(result?.text).toContain("provides additional detail elsewhere");
    expect(result?.statementsText).toContain("STATEMENTS_START");
    expect(result?.statementsText).toContain("provides additional detail elsewhere");
  });
  it.each(["SCHEDULE II", "Schedule II", "schedule ii"])("bounds notes at the linked %s heading, not prose/running headers", (heading) => {
    const html = annualNotesIndexFixture().replace('>SCHEDULE II</h2>', `>${heading}</h2>`);
    expect(extractSection(html, { form: "10-K", item: "8" }).ok).toBe(false);
    const item15 = extractSection(html, { form: "10-K", item: "15" }, { stubMinChars: 1 });
    expect(item15.ok).toBe(true);
    if (item15.ok) expect(item15.text).not.toContain("ITEM16_SENTINEL");
    const result = extractAnnualNotesFromIndex(html);
    expect(result).not.toBeNull();
    expect(result?.text).toContain("LATER_NOTE_SENTINEL");
    expect(result?.text).toContain("See Schedule II, Exhibit Index and Item 16 for details.");
    expect(result?.text).not.toMatch(/ITEM16_SENTINEL|SIGNATURE_SENTINEL|SCHEDULE_SENTINEL|EXHIBIT_SENTINEL/);
    expect(result?.method).toBe("annual-notes-index-redirect");
    expect(result?.evidence).toMatchObject({ coordinateSystem: "original-html-characters", notes: { target: "notes", page: { namespace: "F", number: 8 } }, schedule: { target: "schedule", page: { namespace: "S", number: 1 } } });
    expect(result?.statementsText).toContain("STATEMENTS_START");
    expect(result?.statementsText).not.toMatch(/SIGNATURE|Item 15|Item 16/);
    expect(html.slice(result!.evidence.notes.start, result!.evidence.schedule.start)).toContain("LATER_NOTE_SENTINEL");
  });

  const refusals: [string, (html: string) => string][] = [
    ["broken notes", h => h.replaceAll('href="#notes"', 'href="#missing"')],
    ["broken schedule", h => h.replaceAll('href="#schedule"', 'href="#missing"')],
    ["duplicate notes", h => h.replace('</body>', '<div id="notes"></div></body>')],
    ["duplicate schedule", h => h.replace('</body>', '<div name="schedule"></div></body>')],
    ["data-id is not an anchor", h => h.replace('id="notes"', 'data-id="notes"')],
    ["duplicate id attributes", h => h.replace('id="notes"', 'id="notes" id="notes"')],
    ["wrong notes heading", h => h.replace('id="notes">Notes to Consolidated Financial Statements', 'id="notes">Other discussion')],
    ["wrong schedule heading", h => h.replace('>SCHEDULE II</h2>', '>See Schedule II for details</h2>')],
    ["missing first note", h => h.replace('Note 1 - Organization.', 'Organization.')],
    ["external link", h => h.replaceAll('href="#notes"', 'href="https://example.test/#notes"')],
    ["sibling link", h => h.replaceAll('href="#notes"', 'href="other.htm#notes"')],
    ["reversed page namespaces", h => h.replace('href="#notes">F-', 'href="#notes">S-')],
    ["conflicting fragment targets", h => h.replace('href="#notes">8', 'href="#schedule">8')],
    ["competing notes rows", h => h.replace('<table id="financial-index">', '<table id="financial-index"><tr><td>Notes to Consolidated Financial Statements</td><td><a href="#other">F-9</a></td></tr>')],
    ["competing schedule rows", h => h.replace('<table id="financial-index">', '<table id="financial-index"><tr><td>Schedule II</td><td><a href="#other">S-2</a></td></tr>')],
    ["earlier target reference", h => h.replace('<h2 id="notes">', '<h2>').replace('<h2>Item 8.', '<p id="notes">See notes</p><h2>Item 8.')],
    ["missing authority end", h => h.replace('<h2>Item 16. Form 10-K Summary</h2>', '')],
    ["missing schedule target", h => h.replace('id="schedule"', 'id="unlinked"')],
    ["hidden index", h => h.replace('<table id="financial-index">', '<table hidden id="financial-index">')],
    ["hidden heading", h => h.replace('id="notes"', 'hidden id="notes"')],
    ["hidden container", h => h.replace('<body>', '<body hidden>')],
    ["HTML nonvoid self-close cannot terminate hidden scope", h => h.replace('<body>', '<body><div hidden/>')],
    ["inline hidden", h => h.replace('id="notes"', 'style="display:none" id="notes"')],
    ["quoted hidden erasure", h => h.replace('id="notes"', 'title="<!--" hidden data-end="-->" id="notes"')],
    ["attribute-origin notes title", h => h.replace('id="notes">Notes to Consolidated Financial Statements', 'id="notes" title=">Notes to Consolidated Financial Statements">')],
    ["attribute-origin first note", h => h.replace('<p>Note 1 - Organization.', '<p title=">Note 1 - Organization.">')],
    ["attribute-origin index", h => h.replace('<td>Notes to Consolidated Financial Statements', '<td title=">Notes to Consolidated Financial Statements">')],
    ["attribute-origin schedule title", h => h.replace('>SCHEDULE II</h2>', ' title=">SCHEDULE II"></h2>')],
    ["hidden first note", h => h.replace('Note 1 - Organization.', '<span hidden>Note 1 - Organization.</span>')],
    ["reversed target order", h => h.replace('<h2 id="schedule">SCHEDULE II</h2>', '').replace('<h2 id="notes">', '<h2 id="schedule">SCHEDULE II</h2><h2 id="notes">')],
    ["short notes body", h => h.replace(/<p>Note 1[\s\S]*?<h2 id="schedule">/, '<p>Note 1 - Organization. Short pointer.</p><h2 id="schedule">')],
    ["unlinked global notes", h => h.replace(/<table id="financial-index">[\s\S]*?<\/table>/, '')],
  ];
  it.each(refusals)("refuses %s without a whole-document fallback", (_name, change) => {
    expect(extractAnnualNotesFromIndex(change(annualNotesIndexFixture()))).toBeNull();
  });

  it("omits an unproved statement prefix and accepts one element with identical id/name", () => {
    const html = annualNotesIndexFixture().replace('id="notes"', 'id="notes" name="notes"').replace('id="statements"', 'id="unproved"');
    const result = extractAnnualNotesFromIndex(html);
    expect(result?.text).toContain("LATER_NOTE_SENTINEL");
    expect(result?.statementsText).toBeUndefined();
  });
  it("keeps the FIRST 12000 statement characters from the separately linked appendix", () => {
    const result = extractAnnualNotesFromIndex(annualNotesIndexFixture("Statement context. ".repeat(1000)));
    expect(result?.statementsText).toHaveLength(12000);
    expect(result?.statementsText).toContain("STATEMENTS_START");
    expect(result?.statementsText).not.toContain("STATEMENTS_END");
  });
  it("does not impose the unrelated guidance collector's 2M source cap", () => {
    const result = extractAnnualNotesFromIndex(annualNotesIndexFixture().replace('<body>', `<body><!--${"x".repeat(2_000_001)}-->`));
    expect(result?.text).toContain("LATER_NOTE_SENTINEL");
  });
  it.each(["xmp", "iframe", "noembed", "noframes", "noscript", "plaintext"])("does not interpret %s raw/fallback contents as appendix proof", tag => {
    const html = annualNotesIndexFixture().replace('<body>', `<body><${tag}>`).replace('</body>', `</${tag}></body>`);
    expect(extractAnnualNotesFromIndex(html)).toBeNull();
  });
  it("refuses a target wrapper whose heading is beyond the bounded immediate target context", () => {
    const html = annualNotesIndexFixture().replace('<h2 id="notes">', `<div id="notes">${" ".repeat(1200)}<h2>`).replace('<h2 id="schedule">', '</div><h2 id="schedule">');
    expect(extractAnnualNotesFromIndex(html)).toBeNull();
  });
  it.each(["SCHEDULE II", "SIGNATURES", "Exhibit Index"])("does not swallow an earlier unlinked %s appendix", title => {
    const html = annualNotesIndexFixture().replace('<h2 id="schedule">', `<h2>${title}</h2><p>OTHER_APPENDIX_SENTINEL</p><h2 id="schedule">`);
    expect(extractAnnualNotesFromIndex(html)).toBeNull();
  });
  it("refuses a second real Item 15 authority heading", () => {
    const html = annualNotesIndexFixture().replace('<h2>Item 15.', '<h2>Item 15. Exhibits and Financial Statement Schedules</h2><h2>Item 15.');
    expect(extractAnnualNotesFromIndex(html)).toBeNull();
  });
  it("requires the notes and schedule rows to be in the same index", () => {
    const html = annualNotesIndexFixture().replace('<tr><td>Schedule II', '</table><table><tr><td>Schedule II');
    expect(extractAnnualNotesFromIndex(html)).toBeNull();
  });
  it("accepts an empty named anchor immediately followed by a p heading", () => {
    const html = annualNotesIndexFixture().replace('<h2 id="notes">Notes to Consolidated Financial Statements</h2>', '<a name="notes"></a><div><p>Notes to Consolidated Financial Statements</p></div>');
    expect(extractAnnualNotesFromIndex(html)?.text).toContain("LATER_NOTE_SENTINEL");
  });
  it.each(["<!--", "<script>", "<style>"])("rejects hidden proof even after the quoted %s marker", marker => {
    const ending = marker === "<!--" ? "-->" : marker.replace("<", "</");
    const html = annualNotesIndexFixture().replace('id="notes"', `title="${marker}" HIDDEN data-end="${ending}" id="notes"`);
    expect(extractAnnualNotesFromIndex(html)).toBeNull();
  });
  it.each(["Schedule II - Valuation and Qualifying Accounts", "Item 16. Form 10-K Summary", "Exhibit Index"])("keeps a paragraph beginning with the full %s title reference", title => {
    const html = annualNotesIndexFixture().replace('<h2 id="schedule">', `<p>${title} provides additional detail elsewhere in this annual report.</p><h2 id="schedule">`);
    const result = extractAnnualNotesFromIndex(html);
    expect(result?.text).toContain("LATER_NOTE_SENTINEL");
    expect(result?.text).toContain("provides additional detail elsewhere");
  });
  it("does not retain statements when signatures intervene before the notes", () => {
    const html = annualNotesIndexFixture().replace('<h2 id="notes">', '<h2>SIGNATURES</h2><p>SIGNATURE_PREFIX_SENTINEL</p><h2 id="notes">');
    const result = extractAnnualNotesFromIndex(html);
    expect(result?.text).toContain("LATER_NOTE_SENTINEL");
    expect(result?.statementsText).toBeUndefined();
  });
});
