import { describe, expect, it } from "vitest";
import { reconcileDebtPresentation } from "@/edgar/debtPresentation";
import { debtPresentationSections } from "@/edgar/financialEnrichment";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { createEdgarClient, type EdgarTransportResponse } from "@/providers/edgar";
import { createFmpClient } from "@/providers/fmp";

// A complete two-column annual statement, served through the normal filing
// transport and item extractor; deliberately not a prebuilt ExtractedSection.
const balance = `CONSOLIDATED BALANCE SHEETS (In millions, except par value amounts)
December 31, 2025 December 31, 2024
ASSETS Cash 50 40 Total assets 100 90
LIABILITIES AND STOCKHOLDERS' EQUITY Current liabilities:
Accounts payable 4 3 Short-term debt 2 1 Total current liabilities 6 4
Long-term debt 20 18 Other liabilities 4 3 Total liabilities 30 25
Stockholders' equity 70 65 Total liabilities and stockholders' equity 100 90`;
const notes = `Notes to Consolidated Financial Statements Note 1 - Organization ${"Our consolidated financial statements include all subsidiaries. ".repeat(55)}`.trim();
const accession = "0001234567-26-000001";
const documentUrl = "https://www.sec.gov/Archives/edgar/data/1234567/000123456726000001/annual.htm";
const noNetwork = (): Promise<Response> => Promise.resolve(new Response("unavailable in test", { status: 404 }));

async function acquireAnnual(item: "8" | "15", options: { prefix?: string; omitNotes?: boolean } = {}) {
  const calls: string[] = [];
  const financials = `${options.prefix ?? ""}${balance}<p>${options.omitNotes ? "No accounting note heading. ".repeat(150) : notes}</p>`;
  const html = `<html><body><h2>Item 8. Financial Statements and Supplementary Data</h2>
    ${item === "8" ? financials : `<p>${"The financial statements appear in Item 15. ".repeat(80)}</p>`}
    <h2>Item 9. Changes in and Disagreements with Accountants on Accounting and Financial Disclosure</h2><p>None.</p>
    <h2>Item 15. Exhibits and Financial Statement Schedules</h2>
    ${item === "15" ? financials : "No additional financial statements."}
    <h3>Exhibit Index</h3><p>EXHIBIT_SENTINEL</p><h2>Item 16. Form 10-K Summary</h2></body></html>`;
  const response = (body: string): EdgarTransportResponse => ({ status: 200, body, fetchedAt: "2026-03-01T00:00:00.000Z", fromCache: false, stale: false });
  const edgar = createEdgarClient({ transport: { fetchText(url) {
    calls.push(url);
    if (url.includes("company_tickers.json")) return Promise.resolve(response(JSON.stringify({ "0": { cik_str: 1234567, ticker: "EXMP", title: "Example" } })));
    if (url.includes("submissions/")) return Promise.resolve(response(JSON.stringify({ cik: "0001234567", name: "Example", tickers: ["EXMP"], exchanges: ["TEST"], filings: { files: [], recent: {
      accessionNumber: [accession], filingDate: ["2026-03-01"], reportDate: ["2025-12-31"], form: ["10-K"], primaryDocument: ["annual.htm"],
    } } })));
    if (url.includes("companyfacts/")) return Promise.resolve(response(JSON.stringify({ cik: 1234567, entityName: "Example", facts: {} })));
    if (url === documentUrl) return Promise.resolve(response(html));
    throw new Error(`Unexpected transport request: ${url}`);
  } } });
  const bundle = await buildDataBundle("EXMP", {
    now: () => new Date("2026-03-01T00:00:00.000Z"), fmp: createFmpClient({ apiKey: "" }), edgar, keyless: false,
    fred: { fetchImpl: noNetwork, retryDelaysMs: [], minRequestIntervalMs: 0 },
    finnhub: { fetchImpl: noNetwork, retryDelaysMs: [] },
    finra: { fetchImpl: noNetwork, retryDelaysMs: [], minRequestIntervalMs: 0 },
  });
  return { bundle, calls };
}

describe("normal annual filing acquisition retains debt presentation evidence", () => {
  it.each(["8", "15"] as const)("retains Item %s statements beside the bounded notes with exact filing identity", async (item) => {
    const { bundle, calls } = await acquireAnnual(item);
    const result = bundle.edgar.tenKNotes;
    expect(result?.ok, JSON.stringify(result)).toBe(true);
    if (!result?.ok) throw new Error("Annual notes were not acquired");
    expect(result.value.data).toMatchObject({ form: "10-K", accession, filingDate: "2026-03-01", reportDate: "2025-12-31", documentUrl,
      text: notes, statementsText: expect.stringContaining("Long-term debt 20 18") });
    expect(result.value.endpoint).toBe(`${documentUrl} (10-K Item ${item} notes)`);
    expect(result.value.data.text).not.toContain("EXHIBIT_SENTINEL");
    expect(result.value.data.chars).toBe(result.value.data.text.length);
    expect(calls.filter((url) => url === documentUrl)).toHaveLength(1);
    const sections = debtPresentationSections(bundle.edgar);
    expect(sections).toHaveLength(1);
    const section = sections[0]!;
    const reconciled = reconcileDebtPresentation({ text: section.statementsText ?? section.text,
      periodEnd: "2025-12-31", currency: "USD", tagValue: 20e6, currentMaturities: 2e6,
      source: section, tagSource: { cik: "0001234567", accession, filingDate: "2026-03-01", periodEnd: "2025-12-31", unit: "USD" } });
    expect(reconciled).toMatchObject({ status: "established", scope: "noncurrent", noncurrentDebt: 20e6, currentDebt: 2e6 });
    expect(reconciled.evidence?.filings).toEqual([{ accn: accession, filed: "2026-03-01", form: "10-K" }]);
  });

  it("keeps the existing statement-prefix bound and all notes when the prefix is long", async () => {
    const { bundle } = await acquireAnnual("8", { prefix: "Annual audit context. ".repeat(650) });
    if (!bundle.edgar.tenKNotes?.ok) throw new Error("Annual notes were not acquired");
    const section = bundle.edgar.tenKNotes.value.data;
    expect(section.statementsText).toHaveLength(12_000);
    expect(section.statementsText).not.toContain("Long-term debt");
    expect(section.text).toBe(notes);
  });

  it("keeps the disclosed annual-notes gap when neither item contains a notes heading", async () => {
    const { bundle } = await acquireAnnual("8", { omitNotes: true });
    expect(bundle.edgar.tenKNotes?.ok).toBe(false);
    if (bundle.edgar.tenKNotes?.ok === false) expect(bundle.edgar.tenKNotes.gap.reason).toMatch(/no notes.*Item 8|no notes.*Item 15/);
    expect(debtPresentationSections(bundle.edgar)).toEqual([]);
  });
});
