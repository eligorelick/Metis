import { expect, it } from "vitest";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { createEdgarClient, type EdgarTransport } from "@/providers/edgar";
import { createFmpClient } from "@/providers/fmp";

const prose = "The consolidated financial statements include subsidiaries and eliminate intercompany balances. ".repeat(40);
const appendix = `<html><body><h2>Item 18. Financial Statements</h2><h2>Notes to Consolidated Financial Statements</h2><h3>1. General</h3><p>${prose}</p><h2>Item 19. Exhibits</h2><p>Exhibits.</p></body></html>`;

async function acquire(form: "20-F" | "10-Q" | "10-K", html: string, exhibit?: string) {
  const response = (body: string, status = 200) => ({ status, body, fetchedAt: "2026-07-06T00:00:00.000Z", fromCache: true, stale: false });
  const transport: EdgarTransport = { async fetchText(url) {
    if (url.includes("company_tickers.json")) return response(JSON.stringify({ "0": { cik_str: 1234567, ticker: "EXMP", title: "Example" } }));
    if (url.includes("submissions/")) return response(JSON.stringify({ cik: "0001234567", name: "Example", tickers: ["EXMP"], exchanges: ["TEST"], filings: { files: [], recent: {
      accessionNumber: ["0001234567-26-000001"], filingDate: ["2026-03-01"], reportDate: ["2025-12-31"], form: [form], primaryDocument: ["annual.htm"],
    } } }));
    if (url.includes("companyfacts/")) return response(JSON.stringify({ cik: 1234567, entityName: "Example", facts: {} }));
    if (url.endsWith("/annual.htm")) return response(html);
    if (url.endsWith("/annual-exhibit.htm")) return exhibit ? response(exhibit) : response("missing saved exhibit", 404);
    return response("not available", 404);
  } };
  const unavailable = async () => new Response("unavailable", { status: 404 });
  return buildDataBundle("EXMP", { now: () => new Date("2026-07-06T00:00:00.000Z"), edgarSectionBudgetMs: 60000,
    fmp: createFmpClient({ apiKey: "" }), edgar: createEdgarClient({ transport, maxRps: 10000 }), keyless: false, companyIr: false,
    fred: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 }, finnhub: { fetchImpl: unavailable, retryDelaysMs: [] }, finra: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 } });
}

it("reads proved 20-F notes through acquisition with the actual filing form", async () => {
  const bundle = await acquire("20-F", appendix);
  expect(bundle.edgar.tenKNotes?.ok).toBe(true);
  if (bundle.edgar.tenKNotes?.ok) {
    expect(bundle.edgar.tenKNotes.value.data.form).toBe("20-F");
    expect(bundle.edgar.tenKNotes.value.data.text).toContain(prose.trim());
    expect(bundle.edgar.tenKNotes.value.endpoint).toContain("20-F");
  }
});

it.each(["10-K", "10-Q"] as const)("states a specific %s statement gap while retaining genuine notes after contents residue", async form => {
  const item = form === "10-Q" ? "1. Financial Statements" : "8. Financial Statements and Supplementary Data";
  const next = form === "10-Q" ? "2. Management's Discussion and Analysis" : "9. Changes in and Disagreements with Accountants on Accounting and Financial Disclosure";
  const bundle = await acquire(form, `<h2>Item ${item}</h2><p>Table of Contents Example Corporation</p><h2>Notes to Consolidated Financial Statements</h2><p>Note 1 - Organization. ${prose}</p><h2>Item ${next}</h2>`);
  const section = form === "10-Q" ? bundle.edgar.tenQNotes : bundle.edgar.tenKNotes;
  expect(section?.ok).toBe(true);
  if (!section?.ok) throw new Error("Genuine notes missing");
  expect(section.value.data.text).toContain(prose.trim());
  expect(section.value.data.statementsText).toBeUndefined();
  const field = `edgar.${form === "10-Q" ? "tenQNotes" : "tenKNotes"}.statementsText(EXMP)`;
  expect(bundle.gaps).toContainEqual(expect.objectContaining({ field, severity: "warn", reason: expect.stringMatching(/statement.*(?:row|body)|(?:row|body).*statement/i) }));
  expect(section.value.data.statementsTextGap).toMatch(/statement.*rows/i);
  expect(bundle.sourceManifest[field]).toBeUndefined();
});

it("retains a short genuine balance sheet prefix byte for byte", async () => {
  const prefix = "Item 1. Financial Statements Consolidated Balance Sheets (in millions) Cash and cash equivalents 120 110 Total assets 300 280 Long-term debt 90 80 ";
  const bundle = await acquire("10-Q", `<h2>Item 1. Financial Statements</h2><h2>Consolidated Balance Sheets</h2><p>(in millions) Cash and cash equivalents 120 110 Total assets 300 280 Long-term debt 90 80</p><h2>Notes to Consolidated Financial Statements</h2><p>Note 1 - Organization. ${prose}</p><h2>Item 2. Management's Discussion and Analysis</h2>`);
  expect(bundle.edgar.tenQNotes?.ok).toBe(true);
  if (bundle.edgar.tenQNotes?.ok) expect(bundle.edgar.tenQNotes.value.data.statementsText).toBe(prefix);
});

it("recovers the complete item before a repeated page heading without losing later notes", async () => {
  const bundle = await acquire("10-Q", `<table><tr><td><a href="#notes">Notes to Consolidated Financial Statements</a></td></tr><tr><td><a href="#next">Management's Discussion and Analysis</a></td></tr></table>
    <h2>Item 1. Financial Statements</h2><p>Consolidated Balance Sheets Cash 120 110 Total assets 300 280</p>
    <div id="notes">Table of Contents</div><h2>Notes to Consolidated Financial Statements</h2><p>Note 1 - Organization. ${prose}</p>
    <h3>Item 1. Financial Statements (continued)</h3><p>Note 12 - Debt. LATER_NOTE_SENTINEL ${prose}</p>
    <h2 id="next">Item 2. Management's Discussion and Analysis</h2><p>OUTSIDE_NOTES</p>`);
  expect(bundle.edgar.tenQNotes?.ok).toBe(true);
  if (!bundle.edgar.tenQNotes?.ok) throw new Error("Notes missing");
  expect(bundle.edgar.tenQNotes.value.data.text).toContain("LATER_NOTE_SENTINEL");
  expect(bundle.edgar.tenQNotes.value.data.text).not.toContain("OUTSIDE_NOTES");
  expect(bundle.edgar.tenQNotes.value.data.statementsText).toContain("Cash 120 110");
  expect(bundle.edgar.tenQNotes.value.data.statementsTextGap).toBeUndefined();
});

it.each([true, false])("follows only an explicit incorporated exhibit and retains missing-source reasons (%s)", async available => {
  const html = `<html><body><h2>Item 18 Financial Statements</h2><p>The financial statements accompany this report in our Annual Report (see Item 19).</p><h2>Item 19 Exhibits</h2><table><tr><td><a href="annual-exhibit.htm">15.1</a></td><td>The Registrant's Annual Report. Incorporated by reference for Item 18.</td></tr></table></body></html>`;
  const bundle = await acquire("20-F", html, available ? appendix : undefined);
  expect(bundle.edgar.tenKNotes?.ok).toBe(available);
  if (bundle.edgar.tenKNotes?.ok) expect(bundle.edgar.tenKNotes.value.data.documentUrl).toMatch(/\/annual-exhibit.htm$/);
  else expect(bundle.edgar.tenKNotes?.gap.reason).toMatch(/annual-exhibit.htm.*(?:fetch|404)|(?:fetch|404).*annual-exhibit.htm/i);
});

it.each(["10-Q", "10-K", "20-F"] as const)("retains a bounded %s financial item with accurate combined scope when the notes opening is unproved", async form => {
  const item = form === "10-Q" ? "1. Financial Statements" : form === "10-K" ? "8. Financial Statements and Supplementary Data" : "18. Financial Statements";
  const next = form === "10-Q" ? "2. Management's Discussion and Analysis" : form === "10-K" ? "9. Changes in and Disagreements with Accountants on Accounting and Financial Disclosure" : "19. Exhibits";
  const bundle = await acquire(form, `<html><body><h2>Item ${item}</h2><p>${prose}</p><p>Report of Independent Registered Public Accounting Firm To the Board of Directors and Shareholders We have reviewed AUDITOR_OUTSIDE</p><h2>Item ${next}</h2><p>FOLLOWING_ITEM ${prose}</p></body></html>`);
  const section = form === "10-Q" ? bundle.edgar.tenQNotes : bundle.edgar.tenKNotes;
  expect(section?.ok).toBe(true);
  if (section?.ok) {
    expect(section.value.data).toMatchObject({ financialTextScope: "statements-and-notes" });
    expect(section.value.data.text).toContain(prose.trim());
    expect(section.value.data.text).not.toMatch(/AUDITOR_OUTSIDE|FOLLOWING_ITEM/);
  }
});

it("keeps a gap when neither a substantive notes opening nor an enclosing financial item is established", async () => {
  const bundle = await acquire("10-Q", `<html><body><h2>Item 1. Financial Statements</h2><p>See the Annual Report.</p></body></html>`);
  expect(bundle.edgar.tenQNotes?.ok).toBe(false);
  if (bundle.edgar.tenQNotes && !bundle.edgar.tenQNotes.ok) expect(bundle.edgar.tenQNotes.gap.reason).toMatch(/boundar|stub|reference/i);
});

it("retains the financial body after a leading annual auditor report without carrying that report", async () => {
  const bundle = await acquire("10-K", `<html><body><h2>Item 8. Financial Statements and Supplementary Data</h2><h2>Report of Independent Registered Public Accounting Firm</h2><p>To the Board of Directors and Shareholders We have audited AUDITOR_BEFORE</p><h2>Consolidated Balance Sheets</h2><p>${prose}</p><h2>Item 9. Changes in and Disagreements with Accountants on Accounting and Financial Disclosure</h2><p>FOLLOWING_ITEM</p></body></html>`);
  expect(bundle.edgar.tenKNotes?.ok).toBe(true);
  if (bundle.edgar.tenKNotes?.ok) {
    expect(bundle.edgar.tenKNotes.value.data).toMatchObject({ financialTextScope: "statements-and-notes" });
    expect(bundle.edgar.tenKNotes.value.data.text).toMatch(/^Consolidated Balance Sheets/);
    expect(bundle.edgar.tenKNotes.value.data.text).not.toMatch(/AUDITOR_BEFORE|FOLLOWING_ITEM/);
  }
});

it.each(["10-K", "10-Q"] as const)("uses original source blocks to keep a glossary out of %s notes", async form => {
  const item = form === "10-K" ? "8. Financial Statements and Supplementary Data" : "1. Financial Statements";
  const next = form === "10-K" ? "9. Changes in and Disagreements with Accountants on Accounting and Financial Disclosure" : "2. Management's Discussion and Analysis";
  const bundle = await acquire(form, `<html><body><h2>Item ${item}</h2><h3>Notes to Consolidated Financial Statements</h3><p>Note 1 - Basis of Presentation ${prose}</p><h3>Glossary of Common Terms and Acronyms</h3><p>OUTSIDE_NOTES</p><h2>Item ${next}</h2></body></html>`);
  const notes = form === "10-K" ? bundle.edgar.tenKNotes : bundle.edgar.tenQNotes;
  expect(notes?.ok).toBe(true);
  if (notes?.ok) expect(notes.value.data.text).not.toContain("OUTSIDE_NOTES");
});
