import { describe, expect, it } from "vitest";
import { annualNotesToFinancialStatements, extractForeignAnnualNotes, extractSection, financialStatementsAndNotes, notesToFinancialStatements, parseDocument } from "@/edgar/extract";

const prose = "The company consolidates subsidiaries and eliminates intercompany balances. ".repeat(45);
const opening = "Notes to Consolidated Financial Statements Note 1 - Basis of presentation ";

describe("substantive notes boundaries", () => {
  it("does not relabel a later-note fragment as the complete financial item", () => {
    const source = parseDocument(`<html><body><h2>Note 21: Employee Benefits</h2><p>${prose}</p><h2>Note 22: Debt</h2><p>${prose}</p></body></html>`);
    expect(financialStatementsAndNotes(source.fullText, source, 8)).toBeNull();
  });
  it.each([
    "Notes to Consolidated Condensed Financial Statements",
    "Notes to the Interim Condensed Consolidated Financial Statements (Unaudited)",
    "NOTES TO CONDENSED CONSOLID ATED FINANCIAL STATEMENTS",
  ])("recognizes the standalone %s title in original markup", title => {
    const body = `${title} Note 1: Basis of Presentation ${prose}`;
    const source = parseDocument(`<html><body><p>STATEMENTS BEFORE NOTES</p><h2>${title}</h2><h3>Note 1: Basis of Presentation</h3><p>${prose}</p></body></html>`);
    expect(notesToFinancialStatements(source.fullText, source)?.text).toBe(body.trimEnd());
  });

  it("starts at the real first-note body after a complete notes contents list", () => {
    const contents = "Note 1 Summary of Significant Accounting Policies 61 Note 2 Property and Equipment 67 Note 3 Debt 70";
    const body = `NOTE 1 — SUMMARY OF SIGNIFICANT ACCOUNTING POLICIES DESCRIPTION OF BUSINESS ${prose}`;
    const source = parseDocument(`<html><body><h2>NOTES TO THE UNAUDITED CONDENSED CONSOLIDATED FINANCIAL STATEMENTS</h2><table><tr><td>${contents}</td></tr></table><h2>NOTE 1 — SUMMARY OF SIGNIFICANT ACCOUNTING POLICIES</h2><h3>DESCRIPTION OF BUSINESS</h3><p>${prose}</p></body></html>`);
    expect(annualNotesToFinancialStatements(source.fullText, source)?.text).toBe(body.trimEnd());
  });

  it("rejects a real contents list with no substantive first-note body after it", () => {
    const source = parseDocument(`<html><body><h2>NOTES TO THE UNAUDITED CONDENSED CONSOLIDATED FINANCIAL STATEMENTS</h2><table><tr><td>Note 1 Summary of Significant Accounting Policies 61</td></tr><tr><td>Note 2 Property and Equipment 67</td></tr></table><p>${prose}</p></body></html>`);
    expect(annualNotesToFinancialStatements(source.fullText, source)).toBeNull();
  });

  it.each([true, false])("retains a proved notes title and introductory prose before its first subsection (%s)", numbered => {
    const intro = "The accompanying condensed consolidated financial statements are unaudited and include all normal recurring adjustments. ".repeat(5);
    const first = numbered ? "1. Revenue from Contracts with Customers" : "Basis of Presentation";
    const title = "NOTES TO CONDENSED CONSOLIDATED FINANCIAL STATEMENTS (UNAUDITED)";
    const source = parseDocument(`<html><body><h2>${title}</h2><p>${intro}</p><h3>${first}</h3><p>${prose}</p></body></html>`);
    expect(notesToFinancialStatements(source.fullText, source)?.text).toBe(`${title} ${intro}${first} ${prose}`.trimEnd());
  });

  it("allows an issuer banner after a foreign notes title without accepting the index", () => {
    const html = `<html><body><h2>Item 18 Financial Statements</h2><h2>Notes to Consolidated Financial Statements</h2><p>Example Corporation and Consolidated Subsidiaries</p><h3>1. Reporting entity</h3><p>${prose}</p><h2>Item 19 Exhibits</h2></body></html>`;
    const result = extractForeignAnnualNotes(html);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain("1. Reporting entity");
  });

  it("treats nested table markup as one proved foreign financial-item boundary", () => {
    const html = `<html><body><table><tr><td><h2>Item 18 Financial Statements</h2></td></tr></table><p>${prose}</p><table><tr><td><h2>Item 19 Exhibits</h2></td></tr></table><p>OUTSIDE_ITEM</p></body></html>`;
    const result = extractForeignAnnualNotes(html);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.financialTextScope).toBe("statements-and-notes");
      expect(result.text).toContain(prose.trim());
      expect(result.text).not.toContain("OUTSIDE_ITEM");
    }
  });

  it.each([annualNotesToFinancialStatements, notesToFinancialStatements])("stops every recognition path at an external auditor or reviewer report", extract => {
    const body = opening + prose;
    for (const conclusion of ["Opinion on the Financial Statements", "Results of Review of Interim Financial Information"]) {
      expect(extract(`${body}Report of Independent Registered Public Accounting Firm To the Shareowners and Board of Directors of Example ${conclusion} AUDIT_TEXT`)?.text).toBe(body.trimEnd());
    }
  });

  it("skips the contents listing and retains the substantive first note", () => {
    const contents = "Notes to consolidated financial statements: Page Note 1 - Basis of presentation 170 Note 2 - Fair value measurement 174 ";
    const body = opening + prose;
    expect(annualNotesToFinancialStatements(contents + prose + body)?.text).toBe(body);
    expect(annualNotesToFinancialStatements(contents + prose)).toBeNull();
  });

  it("recognizes quarterly title font splits and excludes the statements before it", () => {
    const body = `NOTES TO FINANCI AL STATEMENTS (Unaudited) NOTE 1 - ACCOUNTING POLICIES ${prose}`;
    expect(notesToFinancialStatements(`INCOME STATEMENTS ${prose}${body}`)?.text).toBe(body);
  });

  it("ends notes at a following supplementary-information section", () => {
    const body = opening + prose;
    expect(annualNotesToFinancialStatements(`${body}Supplementary Information: Distribution of assets and liabilities SUPPLEMENTARY_TEXT`)?.text).toBe(body.trimEnd());
  });

  it("rejects a numeric first-note contents listing", () => {
    expect(annualNotesToFinancialStatements(`Notes to the Consolidated Financial Statements 46 1. Description of Business 46 2. Basis of Presentation 46 ${prose}`)).toBeNull();
  });

  it.each(["are an integral part of these statements.", "(unaudited) are an integral part of these statements.", ". See Note 24 for segment information.", ", tagged as blocks of text."])("skips a statement reference ending %s", reference => {
    const body = opening + prose;
    expect(annualNotesToFinancialStatements(`Notes to Consolidated Financial Statements ${reference} 12 Table of Contents ${body}`)?.text).toBe(body);
  });

  it("ends at the actual signature declaration", () => {
    const body = opening + prose;
    expect(annualNotesToFinancialStatements(`${body}SIGNATURES Pursuant to the requirements of the Securities Exchange Act of 1934 SIGNED_TEXT`)?.text).toBe(body.trimEnd());
  });

  it("ends before insurance schedules that follow the final note", () => {
    const body = opening + prose;
    expect(annualNotesToFinancialStatements(`${body}SCHEDULE III — SUPPLEMENTARY INSURANCE INFORMATION SCHEDULE_TEXT`)?.text).toBe(body.trimEnd());
  });

  it("ends before a separately titled auditor report on financial statement schedules", () => {
    const body = opening + prose;
    expect(annualNotesToFinancialStatements(`${body}Report of Independent Registered Public Accounting Firm on Financial Statement Schedules To the Board of Directors and Shareholders of Example Our audits of the consolidated financial statements also included these schedules. AUDIT_TEXT`)?.text).toBe(body.trimEnd());
  });

  it.each([
    "REPORT OF MANAGEMENT Management’s Responsibility for the Financial Statements Management of the Company is responsible for the financial statements.",
    "Management's Reports Management's Report for Financial Statements—Example Company Management of Example Company is responsible for the financial statements.",
    "Schedule I Consolidated Summary of Investments — Other Than Investments in Related Parties INVESTMENT_TABLE",
    "Schedule II Condensed Financial Information (Parent Company Only) PARENT_TABLE",
  ])("stops at the separate section %s", heading => {
    const body = opening + prose;
    expect(annualNotesToFinancialStatements(body + heading)?.text).toBe(body.trimEnd());
  });

  it("keeps full appendix titles used in explanatory prose", () => {
    const body = opening + prose + "Schedule II Valuation and Qualifying Accounts provides additional detail. The Exhibit Index describes other exhibits. See Schedule I Consolidated Summary of Investments for details. " + prose;
    expect(annualNotesToFinancialStatements(body)?.text).toBe(body);
  });

  it.each(["Glossary of Common Terms and Acronyms", "Acronyms", "Supplemental Financial Information", "Management’s Assessment of Internal Control Over Financial Reporting", "Item 9. Changes in and Disagreements with Accountants on Accounting and Financial Disclosure", "UNREGISTERED SALES OF EQUITY SECURITIES, REPURCHASES OF EQUITY SECURITIES AND DIVIDENDS"])("uses the original standalone %s block to close notes", heading => {
    const html = `<html><body><h2>Notes to Consolidated Financial Statements</h2><p>Note 1 - Basis of presentation ${prose}</p><h2>${heading}</h2><p>OUTSIDE_NOTES</p></body></html>`;
    const parsed = parseDocument(html);
    expect(annualNotesToFinancialStatements(parsed.fullText, parsed)?.text).toBe((opening + prose).trimEnd());
  });

  it("keeps a prose Item 7 or glossary mention when original blocks prove no heading", () => {
    const body = opening + prose + "We discuss Item 7. Management's Discussion and Analysis here. Our Glossary of Common Terms and Acronyms is available elsewhere. " + prose;
    const parsed = parseDocument(`<html><body><p>${body}</p></body></html>`);
    expect(annualNotesToFinancialStatements(parsed.fullText, parsed)?.text).toBe(body.trimEnd());
  });

  it("chooses the substantive title when a closing statement reference precedes it", () => {
    const body = opening + prose;
    expect(notesToFinancialStatements(`Notes to Consolidated Financial Statements. ${body}`)?.text).toBe(body);
  });

  it.each(["10-Q", "10-K"] as const)("keeps repeated current-item page furniture in %s notes", form => {
    const item = form === "10-Q" ? "1. Financial Statements" : "15. Exhibits and Financial Statement Schedules";
    const html = `<html><body><h2>Notes to Consolidated Financial Statements</h2><p>Note 1 - Basis of Presentation ${prose}</p><h2>Item ${item}</h2><p>CONTINUED_NOTE_BODY</p></body></html>`;
    const parsed = parseDocument(html);
    const result = form === "10-Q" ? notesToFinancialStatements(parsed.fullText, parsed) : annualNotesToFinancialStatements(parsed.fullText, parsed, "15");
    expect(result?.text).toContain("CONTINUED_NOTE_BODY");
  });

  it("maps a closing source heading across dense attribute markup", () => {
    const html = `<html><body><h2>Notes to Consolidated Financial Statements</h2><p>Note 1 - Basis of Presentation ${prose}<span data-layout="${"x".repeat(9000)}">End of the actual notes.</span></p><h2>Glossary of Common Terms and Acronyms</h2><p>OUTSIDE_NOTES</p></body></html>`;
    const parsed = parseDocument(html);
    expect(annualNotesToFinancialStatements(parsed.fullText, parsed)?.text).not.toContain("OUTSIDE_NOTES");
  });

  it("recognizes an unlinked section caption in a layout table", () => {
    const html = `<html><body><h2>Notes to Consolidated Financial Statements</h2><p>Note 1 - Basis of Presentation ${prose}</p><table><tr><td><p>Glossary of Common Terms and Acronyms</p></td></tr></table><p>OUTSIDE_NOTES</p></body></html>`;
    const parsed = parseDocument(html);
    expect(annualNotesToFinancialStatements(parsed.fullText, parsed)?.text).not.toContain("OUTSIDE_NOTES");
  });

  it("keeps a navigation caption whose enclosing anchor has an href", () => {
    const html = `<html><body><h2>Notes to Consolidated Financial Statements</h2><p>Note 1 - Basis of Presentation ${prose}</p><a href="#elsewhere"><p>Glossary of Common Terms and Acronyms</p></a><p>CONTINUED_NOTE_BODY</p></body></html>`;
    const parsed = parseDocument(html);
    expect(annualNotesToFinancialStatements(parsed.fullText, parsed)?.text).toContain("CONTINUED_NOTE_BODY");
  });

  it.each(["Supplemental Financial Information", "Glossary of Common Terms and Acronyms"])("keeps an unnumbered %s subheading when substantive notes continue", heading => {
    const html = `<html><body><h2>Notes to Consolidated Financial Statements</h2><p>Note 1 - Basis of Presentation ${prose}</p><h3>${heading}</h3><p>${prose}</p><h3>Note 2 - Borrowings</h3><p>LATER_NOTE_BODY ${prose}</p></body></html>`;
    const parsed = parseDocument(html);
    expect(annualNotesToFinancialStatements(parsed.fullText, parsed)?.text).toContain("LATER_NOTE_BODY");
  });

  it("does not mistake a later note reference for a continuing numbered note", () => {
    const html = `<html><body><h2>Notes to Consolidated Financial Statements</h2><p>Note 1 - Basis of Presentation ${prose}</p><h3>Supplemental Financial Information</h3><p>Note 9 to the consolidated financial statements explains these amounts.</p><p>OUTSIDE_NOTES</p></body></html>`;
    const parsed = parseDocument(html);
    expect(annualNotesToFinancialStatements(parsed.fullText, parsed)?.text).not.toContain("OUTSIDE_NOTES");
  });

  it("keeps prose mentioning an audit report, schedule or another item", () => {
    const body = opening + prose + "The report of independent registered public accounting firm is filed separately. See Item 7. Management's Discussion and Analysis for liquidity. Schedule II is discussed in this note. " + prose;
    expect(annualNotesToFinancialStatements(body)?.text).toBe(body);
  });
});

describe("header item closing proof", () => {
  it("stops before the next item even when its body refers to a page", () => {
    const html = `<h2>PART II</h2><h3>Item 5. Other Information.</h3><p>${prose}</p><h3>Item 6. Exhibits.</h3><p>See exhibit index beginning on page 52.</p><p>EXHIBIT_TABLE</p>`;
    const result = extractSection(html, { form: "10-Q", item: "5" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe(`Item 5. Other Information. ${prose.trimEnd()}`);
  });

  it("withholds an item without a proved closing boundary and explains why", () => {
    const result = extractSection(`<h2>Item 7. Management's Discussion and Analysis</h2><p>${prose}</p><p>Unclassified appendix.</p>`, { form: "10-K", item: "7" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/boundary|closing/i);
  });
});

function foreignAppendix(first = "(IN.1) Basis for Preparation") {
  return `<html><body><h2>ITEM 18. FINANCIAL STATEMENTS</h2><p>The consolidated financial statements are included herein on pages F-1 through F-3.</p><h2>ITEM 19. EXHIBITS</h2><table><tr><td>Consolidated Statements of Financial Position</td><td>F-1</td></tr><tr><td>Notes to the Consolidated Financial Statements</td><td><a href="#notes">F-2 to F-3</a></td></tr></table><div><h2>Consolidated Statements of Financial Position</h2><p>Assets and liabilities.</p><p>F-1</p></div><div><h2 id="notes">Notes to the Consolidated Financial Statements</h2><h3>${first}</h3><p>${prose}</p><p>F-2</p></div><div><h3>Note 2 - Debt</h3><p>${prose}</p><p>F-3</p></div></body></html>`;
}

describe("proved same-primary foreign notes", () => {
  it.each(["(IN.1) Basis for Preparation", "1 . GENERAL"])("reads %s from a proved financial appendix", first => {
    const result = extractForeignAnnualNotes(foreignAppendix(first));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain(first);
      expect(result.text).toContain("Note 2 - Debt");
      expect(result.text).not.toContain("Assets and liabilities");
    }
  });

  it("resolves a page anchor preceding the issuer banner and notes title", () => {
    const html = foreignAppendix().replace('<h2 id="notes">', '<a id="notes"></a><p>EXAMPLE SE AND SUBSIDIARIES</p><h2>');
    expect(extractForeignAnnualNotes(html).ok).toBe(true);
  });

  it("does not confuse another exhibit's annual-report cross-reference with the annual-report exhibit row", () => {
    const html = `<html><body><h2>ITEM 18 FINANCIAL STATEMENTS</h2><p>The financial statements accompany this report in our Annual Report (see Item 19).</p><h2>ITEM 19 EXHIBITS</h2><table><tr><td>8.1</td><td>Subsidiaries; see Annual Report filed as Exhibit 15.1.</td></tr><tr><td><a href="annual-exhibit.htm">15.1</a></td><td>The Registrant's Annual Report. Incorporated by reference for Item 18.</td></tr></table></body></html>`;
    const result = extractForeignAnnualNotes(html);
    expect(!result.ok && result.exhibit?.filename).toBe("annual-exhibit.htm");
  });

  it("reads a notes title that shares its block with an issuer banner", () => {
    const html = foreignAppendix("1. General").replace('<h2 id="notes">Notes to the Consolidated Financial Statements</h2>', '<h2 id="notes">EXAMPLE HOLDING LIMITED NOTES TO THE CONSOLIDATED FINANCIAL STATEMENTS FOR THE YEARS ENDED 2024, 2025 AND 2026</h2>');
    expect(extractForeignAnnualNotes(html).ok).toBe(true);
  });

  it("refuses an unnumbered physical page between the mapped notes pages", () => {
    const box = '<div style="position:relative;height:792pt;overflow:hidden">';
    const html = foreignAppendix().replaceAll("<div>", box).replace(`${box}<h3>Note 2`, `${box}<p>Unnumbered physical page.</p></div>${box}<h3>Note 2`);
    expect(extractForeignAnnualNotes(html).ok).toBe(false);
  });

  it("requires a financial statement index, rather than a solitary notes contents row", () => {
    const html = foreignAppendix().replace('<tr><td>Consolidated Statements of Financial Position</td><td>F-1</td></tr>', "");
    expect(extractForeignAnnualNotes(html).ok).toBe(false);
  });

  it("keeps a prose exhibit-index reference inside a proved foreign appendix", () => {
    const result = extractForeignAnnualNotes(foreignAppendix().replace(prose, `The Exhibit Index describes the exhibits. ${prose}`));
    expect(result.ok && result.text).toContain("Note 2 - Debt");
  });

  it("does not follow an annual-report link without its Item 18 incorporation", () => {
    const html = `<html><body><p>The financial statements are discussed in the Annual Report.</p><table><tr><td><a href="annual-exhibit.htm">15.1</a></td><td>Annual Report.</td></tr></table></body></html>`;
    const result = extractForeignAnnualNotes(html);
    expect(!result.ok && result.exhibit).toBeUndefined();
  });

  it.each([
    (h: string) => h.replace("<p>F-3</p>", "<p>F-4</p>"),
    (h: string) => h.replace('id="notes"', 'id="wrong"'),
    (h: string) => h.replace('id="notes"', 'id="notes"></h2><h2 id="notes"'),
    (h: string) => h.replace('href="#notes"', 'href="elsewhere.htm#notes"'),
    (h: string) => h.replace("</body></html>", ""),
    (h: string) => h.replace("(IN.1) Basis for Preparation", "Note 1 - Basis 2 Note 2 - Debt 3"),
    (h: string) => h.replace("<p>F-3</p>", "<p>F-3</p><p>Unclassified section after the notes.</p>"),
  ])("withholds incomplete or conflicting appendix proof", change => {
    const result = extractForeignAnnualNotes(change(foreignAppendix()));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(20);
  });

  it("retains the filing's explicit incorporated annual-report exhibit reference", () => {
    const html = `<html><body><h2>ITEM 18 FINANCIAL STATEMENTS</h2><p>The financial statements accompany this report in our Annual Report (see Item 19).</p><h2>ITEM 19 EXHIBITS</h2><table><tr><td><a href="annual-exhibit.htm">15.1</a></td><td>The Registrant's Annual Report. Incorporated by reference for Item 18.</td></tr></table></body></html>`;
    const result = extractForeignAnnualNotes(html);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.exhibit?.filename).toBe("annual-exhibit.htm");
  });
});
