import { describe, expect, it } from "vitest";
import { annualNotesToFinancialStatements, extractForeignAnnualNotes, extractSection, notesToFinancialStatements } from "@/edgar/extract";

const prose = "The company consolidates subsidiaries and eliminates intercompany balances. ".repeat(45);
const opening = "Notes to Consolidated Financial Statements Note 1 - Basis of presentation ";

describe("substantive notes boundaries", () => {
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
