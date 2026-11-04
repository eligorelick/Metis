import { describe, it, expect } from 'vitest';
import { annualNotesToFinancialStatements, extractAnnualNotesFromIndex } from '@/edgar/extract';
const prose = 'The company consolidates subsidiaries and eliminates intercompany balances. '.repeat(70);
describe('closed annual notes recognition', () => {
    it('ends newly recognized notes at the auditor title and salutation', () => {
        const body = `NOTES TO FINANCI AL STATEMENTS NOTE 1 - ACCOUNTING POLICIES ${prose}`;
        expect(annualNotesToFinancialStatements(`${body}REPORT OF INDEPENDENT REGIST ERED PUBLIC ACCOUNTING FIRM To the Stockholders and the Board of Directors of Example Company Opinion on the Financial Statements AUDIT_SENTINEL`)?.text).toBe(body.trim());
    });
    it('recognizes a split financial word without rewriting text', () => { const t = `NOTES TO FINANCI AL STATEMENTS NOTE 1 - ACCOUNTING POLICIES ${prose}`; expect(annualNotesToFinancialStatements(t)?.text).toBe(t); });
    it('recognizes unnumbered policies with business and consolidation evidence', () => { const t = `Notes to Consolidated Financial Statements Summary of Significant Accounting Policies NATURE OF BUSINESS ${prose} CONSOLIDATION The Consolidated Financial Statements include ${prose}`; expect(annualNotesToFinancialStatements(t)?.text).toBe(t); });
    it.each(['Summary of Significant Accounting Policies is described elsewhere.', 'See Note 1 for policies.', 'Summary of Significant Accounting Policies NATURE OF BUSINESS Short stub.'])('rejects %s', opening => { expect(annualNotesToFinancialStatements(`NOTES TO FINANCI AL STATEMENTS ${opening}`)).toBeNull(); });
    it.each(['NOTE 1 - ACCOUNTING POLICIES 63 Note 2 - Debt 70 ', 'NOTE 1 - ACCOUNTING POLICIES F-3 Note 2 - Debt F-4 ', 'NOTE 1 - ACCOUNTING POLICIES ..... 63 ', 'NOTE 1 - ACCOUNTING POLICIES See another document. '])('rejects a long contents or reference opening %s', opening => {
        expect(annualNotesToFinancialStatements(`NOTES TO FINANCI AL STATEMENTS ${opening}${prose}`)).toBeNull();
    });
});
function fixture(namespace = '', firstNote = false) { const p = (n: number) => `${namespace}${n}`; return `<html><body><ix:header><link:schemaRef href="schema.xsd"/></ix:header><h2>Index to Financial Statements</h2><table><tr><td>Consolidated Balance Sheets</td><td><a href="#balance">${p(2)}</a></td></tr><tr><td>Notes to Consolidated Financial Statements</td><td>${firstNote ? '' : '<a href="#notes">' + p(3) + '</a>'}</td></tr>${firstNote ? `<tr><td>Note 1 - Basis of Presentation</td><td><a href="#notes">${p(3)}</a></td></tr>` : ''}</table><p>${p(1)}</p><div id="balance"></div><hr style="page-break-after:always"/><h2>Consolidated Balance Sheets</h2><p>Balance sheet.</p><p>${p(2)}</p><div id="notes"></div><hr style="page-break-after:always"/><h2>Notes to Consolidated Financial Statements</h2><p>Note 1 - Basis of Presentation</p><p>${prose}</p><p>${p(3)}</p></body></html>`; }
describe('printed-page financial index', () => {
    it('refuses an unlinked later numbered note row instead of silently dropping its proof', () => {
        const html = fixture('', true).replace('</table>', '<tr><td>Note 2 - Debt</td><td>3</td></tr></table>');
        expect(extractAnnualNotesFromIndex(html)).toBeNull();
    });
    it('proves a linked statement-group heading against its first numbered statement row', () => {
        const html = fixture('F-').replace('<table><tr>', '<table><tr><td><a href="#group">Consolidated Financial Statements</a></td><td></td></tr><tr>')
            .replace('<h2>Consolidated Balance Sheets</h2>', '<h2 id="group">Consolidated Financial Statements</h2><h2>Consolidated Balance Sheets</h2>');
        expect(extractAnnualNotesFromIndex(html)?.text).toContain(prose.trim());
        expect(extractAnnualNotesFromIndex(html.replace('href="#group"', 'href="#notes"'))).toBeNull();
    });
    it.each(['Schedule II Valuation and Qualifying Accounts', 'Schedule II - Valuation and Qualifying Accounts', 'SCHEDULE II'])('ends the notes at a same-page %s heading', heading => {
        const text = extractAnnualNotesFromIndex(fixture().replace('<p>3</p>', `<h2>${heading}</h2><p>SCHEDULE_DATA</p><p>3</p>`))?.text;
        expect(text).toContain(prose.trim());
        expect(text).not.toContain('SCHEDULE_DATA');
    });
    it.each([['Schedule II - Valuation and Qualifying Accounts', 'S-1'], ['Schedule II Valuation and Qualifying Accounts', 'S-1'], ['EXHIBIT INDEX', '']])('ends the notes at %s opening its own page', (heading, footer) => {
        const text = extractAnnualNotesFromIndex(fixture('F-').replace('<p>F-3</p>', `<p>F-3</p><hr style="page-break-after:always"/><h2>${heading}</h2><p>SCHEDULE_DATA</p>${footer ? `<p>${footer}</p>` : ''}`))?.text;
        expect(text).toContain(prose.trim());
        expect(text).not.toContain('SCHEDULE_DATA');
    });
    it('refuses an unnumbered notes page before the boundary rather than dropping it', () => {
        expect(extractAnnualNotesFromIndex(fixture('F-').replace('<p>F-3</p>', '<p>F-3</p><hr style="page-break-after:always"/><p>MORE_NOTES without a printed page.</p><hr style="page-break-after:always"/><h2>EXHIBIT INDEX</h2><p>List.</p>'))).toBeNull();
    });
    it('does not take a numeric table cell for the printed footer', () => {
        expect(extractAnnualNotesFromIndex(fixture().replace('<p>3</p>', '<table><tr><td>Debt maturity</td><td><p>3</p></td></tr></table>'))).toBeNull();
    });
    it.each([['', false], ['F-', false], ['', true]] as const)('recovers source-bound notes %s %s', (ns, first) => { expect(extractAnnualNotesFromIndex(fixture(ns, first))?.text).toContain(prose.trim()); });
    it.each([
        (h: string) => h.replace('href="#notes"', 'href="other.htm#notes"'),
        (h: string) => h.replace('id="notes"', 'id="missing"'),
        (h: string) => h.replace('id="notes"', 'id="notes"></div><div id="notes"'),
        (h: string) => h.replace('<p>3</p>', '<p>9</p>'),
        (h: string) => h.replace(prose, 'See Note 1 elsewhere.'),
        (h: string) => h.replace('href="#balance"', 'href="#notes"'),
        (h: string) => h.replace('</body></html>', ''),
    ])('rejects incomplete or contradictory source proof', change => { expect(extractAnnualNotesFromIndex(change(fixture()))).toBeNull(); });
});
