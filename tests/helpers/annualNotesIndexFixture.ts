/** Source-derived structure ONLY; generic IDs/markup/body are synthetic, not retained QCOM HTML. */
export function annualNotesIndexFixture(prefix = ""): string {
  return `<html><body>
<table><tr><td><a href="#item8">Item 8</a></td><td><a href="#item8">Financial Statements and Supplementary Data</a></td></tr>
<tr><td><a href="#item9">Item 9</a></td><td><a href="#item9">Changes in and Disagreements with Accountants on Accounting and Financial Disclosure</a></td></tr>
<tr><td><a href="#item15">Item 15</a></td><td><a href="#item15">Exhibits and Financial Statement Schedules</a></td></tr>
<tr><td><a href="#item16">Item 16</a></td><td><a href="#item16">Form 10-K Summary</a></td></tr></table>
<a id="item8"></a>
<h2>Item 8. Financial Statements and Supplementary Data</h2><p>See Part IV, Item 15 for financial statements.</p>
<a id="item9"></a>
<h2>Item 9. Changes in and Disagreements with Accountants on Accounting and Financial Disclosure</h2><p>None.</p>
<a id="item15"></a>
<h2>Item 15. Exhibits and Financial Statement Schedules</h2>
<table id="financial-index"><tr><td>Consolidated Balance Sheets</td><td><a href="#statements">F-</a><a href="#statements">1</a></td></tr>
<tr><td>Notes to Consolidated Financial Statements</td><td><a href="#notes">F-</a><a href="#notes">8</a></td></tr>
<tr><td>Schedule II</td><td><a href="#schedule">S-</a><a href="#schedule">1</a></td></tr></table>
<a id="item16"></a><h2>Item 16. Form 10-K Summary</h2><p>ITEM16_SENTINEL</p><h2>SIGNATURES</h2><p>SIGNATURE_SENTINEL</p>
<h2 id="statements">Consolidated Balance Sheets</h2><p>STATEMENTS_START ${prefix} STATEMENTS_END</p>
<h2 id="notes">Notes to Consolidated Financial Statements</h2><p>Note 1 - Organization. ${"The company consolidates its subsidiaries. ".repeat(80)}
See Schedule II, Exhibit Index and Item 16 for details. <a href="#schedule">Schedule II</a></p>
<h2>Notes to Consolidated Financial Statements (continued)</h2><p>Note 12 - LATER_NOTE_SENTINEL ${"Accounting policies remain consistent. ".repeat(30)}</p>
<h2 id="schedule">SCHEDULE II</h2><p>SCHEDULE_SENTINEL</p><h2>Exhibit Index</h2><p>EXHIBIT_SENTINEL</p>
</body></html>`;
}
