import type { PrimaryCapitalIdentity } from "@/edgar/primaryCapital";

export const capitalIdentity: PrimaryCapitalIdentity = {
  cik: "1234567", entityName: "Example Industries, Inc.", accession: "0001234567-26-000001",
  form: "10-K", filingDate: "2026-03-01", reportDate: "2025-12-31",
  documentUrl: "https://www.sec.gov/Archives/edgar/data/1234567/000123456726000001/example.htm",
  observedAt: "2026-03-02T12:00:00.000Z",
};

export const capitalCashTable = `<table>
  <tr><td></td><td>Year Ended December 31,</td></tr>
  <tr><td></td><td>2025</td><td>2024</td></tr>
  <tr><td></td><td>(USD in millions)</td></tr>
  <tr><td>Repurchases of common stock</td><td>(40.0)</td><td>(20.0)</td></tr>
  <tr><td>Cash paid for shares withheld for taxes</td><td>(1.0)</td><td>(0.5)</td></tr>
</table>`;

export const capitalEquityTable = `<table>
  <tr><td></td><td>Common Stock</td><td>Additional Paid-in Capital</td><td>Retained Earnings</td><td>Treasury Stock</td><td>Non-controlling Interests</td><td>Total Equity</td></tr>
  <tr><td></td><td>(USD in millions, except common stock share data)</td></tr>
  <tr><td>Balances at December 31, 2023 (10,000,000 shares)</td><td>1</td><td>100</td><td>100</td><td>(1)</td><td>5</td><td>205</td></tr>
  <tr><td>Repurchases of common stock (1,000,000 shares)</td><td>—</td><td>—</td><td>—</td><td>(20.1)</td><td>—</td><td>(20.1)</td></tr>
  <tr><td>Balances at December 31, 2024 (9,000,000 shares)</td><td>1</td><td>100</td><td>100</td><td>(21.1)</td><td>5</td><td>184.9</td></tr>
  <tr><td>Repurchases of common stock (2,000,000 shares)</td><td>—</td><td>—</td><td>—</td><td>(40.2)</td><td>—</td><td>(40.2)</td></tr>
  <tr><td>Balances at December 31, 2025 (7,000,000 shares)</td><td>1</td><td>100</td><td>100</td><td>(61.3)</td><td>5</td><td>144.7</td></tr>
</table>`;

export function capitalHtml(cash = capitalCashTable, equity = capitalEquityTable): string {
  return `<html><body><h1>Item 8. Financial Statements and Supplementary Data</h1>
    <p>${"Earlier statement information. ".repeat(500)}</p>
    <div>EXAMPLE INDUSTRIES, INC. AND SUBSIDIARIES</div><div>CONSOLIDATED STATEMENTS OF CASH FLOWS</div>${cash}
    <div>EXAMPLE INDUSTRIES, INC. AND SUBSIDIARIES</div><div>CONSOLIDATED STATEMENTS OF TOTAL EQUITY</div>${equity}
    <h2>Notes to Consolidated Financial Statements</h2><p>Note 1. Organization and accounting policies. ${"The company prepares consolidated financial statements under US GAAP. ".repeat(60)}</p>
    <h1>Item 9. Changes in and Disagreements With Accountants</h1></body></html>`;
}

export function inlineCapitalHtml(): string {
  const fact = (value: string, year: number, shares = false) => `<ix:nonFraction unitRef="${shares ? "shares" : "usd"}" contextRef="${shares ? "shares" : "annual"}${year}" scale="${shares ? 0 : 6}" format="ixt:num-dot-decimal">${value}</ix:nonFraction>`;
  const contexts = [2024, 2025].flatMap(year => [false, true].map(shares => `<xbrli:context id="${shares ? "shares" : "annual"}${year}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0001234567</xbrli:identifier>${shares ? '<xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementEquityComponentsAxis">us-gaap:CommonStockMember</xbrldi:explicitMember></xbrli:segment>' : ""}</xbrli:entity><xbrli:period><xbrli:startDate>${year}-01-01</xbrli:startDate><xbrli:endDate>${year}-12-31</xbrli:endDate></xbrli:period></xbrli:context>`)).join("");
  const header = `<ix:header>${contexts}<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit><xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit></ix:header>`;
  const cash = capitalCashTable.replace("40.0", fact("40.0", 2025)).replace("20.0", fact("20.0", 2024));
  const equity = capitalEquityTable.replace("(1,000,000 shares)", `(${fact("1,000,000", 2024, true)} shares)`)
    .replace("(2,000,000 shares)", `(${fact("2,000,000", 2025, true)} shares)`)
    .replace("<td>(20.1)</td></tr>", `<td>(${fact("20.1", 2024)})</td></tr>`)
    .replace("<td>(40.2)</td></tr>", `<td>(${fact("40.2", 2025)})</td></tr>`);
  return capitalHtml(cash, equity).replace("<body>", `<body>${header}`).replaceAll("USD in millions", "In millions");
}
