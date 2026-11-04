import { expect, it } from "vitest";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { createEdgarClient, type EdgarTransport } from "@/providers/edgar";
import { createFmpClient } from "@/providers/fmp";

const prose = "The consolidated financial statements include subsidiaries and eliminate intercompany balances. ".repeat(40);
const appendix = `<html><body><h2>Item 18. Financial Statements</h2><h2>Notes to Consolidated Financial Statements</h2><h3>1. General</h3><p>${prose}</p><h2>Item 19. Exhibits</h2><p>Exhibits.</p></body></html>`;

async function acquire(form: "20-F" | "10-Q", html: string, exhibit?: string) {
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

it.each([true, false])("follows only an explicit incorporated exhibit and retains missing-source reasons (%s)", async available => {
  const html = `<html><body><h2>Item 18 Financial Statements</h2><p>The financial statements accompany this report in our Annual Report (see Item 19).</p><h2>Item 19 Exhibits</h2><table><tr><td><a href="annual-exhibit.htm">15.1</a></td><td>The Registrant's Annual Report. Incorporated by reference for Item 18.</td></tr></table></body></html>`;
  const bundle = await acquire("20-F", html, available ? appendix : undefined);
  expect(bundle.edgar.tenKNotes?.ok).toBe(available);
  if (bundle.edgar.tenKNotes?.ok) expect(bundle.edgar.tenKNotes.value.data.documentUrl).toMatch(/\/annual-exhibit.htm$/);
  else expect(bundle.edgar.tenKNotes?.gap.reason).toMatch(/annual-exhibit.htm.*(?:fetch|404)|(?:fetch|404).*annual-exhibit.htm/i);
});

it("withholds a quarterly whole-item fallback without a substantive notes opening", async () => {
  const bundle = await acquire("10-Q", `<html><body><h2>Item 1. Financial Statements</h2><p>${prose}</p><h2>Item 2. Management's Discussion and Analysis</h2><p>${prose}</p><h2>Item 3. Quantitative and Qualitative Disclosures</h2></body></html>`);
  expect(bundle.edgar.tenQNotes?.ok).toBe(false);
  if (bundle.edgar.tenQNotes && !bundle.edgar.tenQNotes.ok) expect(bundle.edgar.tenQNotes.gap.reason).toMatch(/substantive notes.*opening/i);
});
