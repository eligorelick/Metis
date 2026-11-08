import { expect, it } from "vitest";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { createEdgarClient, type EdgarTransport } from "@/providers/edgar";
import { createFmpClient } from "@/providers/fmp";
import { capitalHtml } from "./helpers/primaryCapital";
import { annualNotesIndexFixture } from "./helpers/annualNotesIndexFixture";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { assembleReport } from "@/pipeline/stageC/passes";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { ReportSchema, type JudgeOutput } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

async function acquire(form: "10-K" | "10-Q" | "20-F", html: string, exhibit?: string) {
  const requested: string[] = [];
  const response = (body: string, status = 200) => ({ status, body, fetchedAt: "2026-07-06T00:00:00.000Z", fromCache: true, stale: false });
  const transport: EdgarTransport = { async fetchText(url) {
    requested.push(url);
    if (url.includes("company_tickers.json")) return response(JSON.stringify({ "0": { cik_str: 1234567, ticker: "EXMP", title: "Example Industries, Inc." } }));
    if (url.includes("submissions/")) return response(JSON.stringify({ cik: "0001234567", name: "Example Industries, Inc.", tickers: ["EXMP"], exchanges: ["TEST"], filings: { files: [], recent: {
      accessionNumber: ["0001234567-26-000001"], filingDate: ["2026-03-01"], reportDate: ["2025-12-31"], form: [form], primaryDocument: ["annual.htm"],
    } } }));
    if (url.includes("companyfacts/")) return response(JSON.stringify({ cik: 1234567, entityName: "Example Industries, Inc.", facts: {} }));
    if (url.endsWith("/annual.htm")) return response(html);
    if (url.endsWith("/annual-exhibit.htm")) return exhibit ? response(exhibit) : response("unavailable", 404);
    return response("not available", 404);
  } };
  const unavailable = async () => new Response("unavailable", { status: 404 });
  const bundle = await buildDataBundle("EXMP", { now: () => new Date("2026-07-06T00:00:00.000Z"), edgarSectionBudgetMs: 60000,
    fmp: createFmpClient({ apiKey: "" }), edgar: createEdgarClient({ transport, maxRps: 10000 }), keyless: false, companyIr: false,
    fred: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 }, finnhub: { fetchImpl: unavailable, retryDelaysMs: [] }, finra: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 } });
  return { bundle, requested };
}

const statementHtml = () => capitalHtml().replace('<p>Earlier', '<h2>Consolidated Balance Sheets</h2><table><tr><td>December 31, 2025</td><td>December 31, 2024</td></tr><tr><td>Cash and cash equivalents</td><td>120</td><td>110</td></tr><tr><td>Total assets</td><td>300</td><td>280</td></tr></table><p>Earlier');

it.each(["10-K", "10-Q"] as const)("keeps source-bound %s capital rows after the unchanged statement text cap", async form => {
  const html = form === "10-K" ? statementHtml() : statementHtml().replace("Item 8. Financial Statements and Supplementary Data", "Item 1. Financial Statements").replace("Item 9. Changes in and Disagreements With Accountants", "Item 2. Management's Discussion and Analysis");
  const { bundle, requested } = await acquire(form, html);
  const result = form === "10-K" ? bundle.edgar.tenKNotes : bundle.edgar.tenQNotes;
  expect(result?.ok).toBe(true);
  if (!result?.ok) throw new Error("Missing notes");
  const section = result.value.data;
  expect(section.primaryCapitalEvidence?.cash[0]?.amount).toBe(40_000_000);
  expect(section.primaryCapitalEvidence?.executions[1]?.shares).toBe(2_000_000);
  expect(section.statementsText?.length).toBe(12000);
  expect(section.statementsText).not.toContain("Repurchases of common stock");
  expect(section.text).not.toContain("Earlier statement information");
  expect(section.primaryCapitalEvidence?.source.documentUrl).toBe(section.documentUrl);
  expect(requested.filter(url => url.endsWith("/annual.htm"))).toHaveLength(1);
  expect(JSON.parse(JSON.stringify(section)).primaryCapitalEvidence).toEqual(section.primaryCapitalEvidence);
});

it.each(["10-K", "10-Q"] as const)("carries acquired %s identity through both strict report assembly paths", async form => {
  const html = form === "10-K" ? statementHtml() : statementHtml().replace("Item 8. Financial Statements and Supplementary Data", "Item 1. Financial Statements").replace("Item 9. Changes in and Disagreements With Accountants", "Item 2. Management's Discussion and Analysis");
  const { bundle: acquired } = await acquire(form, html);
  const bundle = completeCurrencyBundle({});
  bundle.symbol = acquired.symbol; bundle.edgar = acquired.edgar; bundle.builtAt = acquired.builtAt;
  if (!bundle.statements.cashflowAnnual.ok) throw Error("fixture");
  bundle.statements.cashflowAnnual.value.data.rows[0]!.commonStockRepurchased = -40_000_000;
  bundle.statements.cashflowAnnual.value.data.rows[1]!.commonStockRepurchased = -20_000_000;
  const computed = runStageB(bundle), validation = { checks: [], flags: [], gaps: [] };
  const payload = assembleContextPayload(bundle, computed, validation);
  const dataOnly = buildDataOnlyReport({ symbol: bundle.symbol, companyName: "Example Industries, Inc.", generatedAt: bundle.builtAt, model: "none", costUsd: 0,
    bundle, computed, validation, costBreakdown: [], reason: "Synthetic acquisition verification" });
  const analyst = assembleReport({ symbol: bundle.symbol, bundle, computed, judgeOutput: loadTask28Fixture() as JudgeOutput, model: "synthetic", costEntries: [], verify: { verificationRate: null, log: [] } }, bundle.builtAt);
  expect(payload.primaryCapitalEvidence?.cash[0]?.amount).toBe(40_000_000);
  for (const report of [dataOnly, analyst]) expect(ReportSchema.parse(report).primaryCapitalEvidence).toEqual(payload.primaryCapitalEvidence);
  expect(Object.keys(payload.primaryCapitalEvidence!.cash[0]!.source).sort()).toEqual(["accession", "cik", "documentUrl", "entityName", "filingDate", "form", "observedAt", "reportDate"]);
  expect(JSON.stringify(payload.primaryCapitalEvidence)).not.toContain("Earlier statement information");
});

it("binds incorporated evidence to the acquired exhibit and not the parent filing's HTML offsets", async () => {
  const html = `<html><body><h2>Item 18 Financial Statements</h2><p>The financial statements accompany this report in our Annual Report (see Item 19).</p><h2>Item 19 Exhibits</h2><table><tr><td><a href="annual-exhibit.htm">15.1</a></td><td>The Registrant's Annual Report. Incorporated by reference for Item 18.</td></tr></table></body></html>`;
  const exhibit = statementHtml().replace("Item 8. Financial Statements and Supplementary Data", "Item 18. Financial Statements").replace("Item 9. Changes in and Disagreements With Accountants", "Item 19. Exhibits");
  const { bundle } = await acquire("20-F", html, exhibit);
  if (!bundle.edgar.tenKNotes?.ok) throw new Error("Missing exhibit notes");
  const evidence = bundle.edgar.tenKNotes.value.data.primaryCapitalEvidence;
  expect(evidence?.source.documentUrl).toMatch(/\/annual-exhibit.htm$/);
  expect(evidence?.executions[1]?.shares).toBe(2_000_000);
  const row = evidence!.executions[1]!.proof.row;
  expect(exhibit.slice(row.start, row.end)).toContain("2,000,000 shares");
  expect(html.slice(row.start, row.end)).toBe("");
});

it("preserves source coordinates through the same-document financial-index redirect", async () => {
  const capital = capitalHtml().slice(capitalHtml().indexOf("<div>EXAMPLE"), capitalHtml().indexOf("<h2>Notes"));
  const html = annualNotesIndexFixture().replace('<h2 id="notes">', `${capital}<h2 id="notes">`);
  const { bundle } = await acquire("10-K", html);
  if (!bundle.edgar.tenKNotes?.ok) throw new Error("Missing redirected notes");
  const section = bundle.edgar.tenKNotes.value.data;
  expect(section.annualNotesRedirect).toBeDefined();
  expect(section.primaryCapitalEvidence?.executions[1]?.shares).toBe(2_000_000);
  const row = section.primaryCapitalEvidence!.executions[1]!.proof.row;
  expect(html.slice(row.start, row.end)).toContain("2,000,000 shares");
});
