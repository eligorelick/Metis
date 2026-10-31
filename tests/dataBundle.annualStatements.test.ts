import { describe, expect, it } from "vitest";
import { reconcileDebtPresentation } from "@/edgar/debtPresentation";
import { debtPresentationSections } from "@/edgar/financialEnrichment";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { createEdgarClient, type EdgarTransportResponse } from "@/providers/edgar";
import { createFmpClient } from "@/providers/fmp";
import { annualNotesIndexFixture } from "./helpers/annualNotesIndexFixture";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { runStageB } from "@/pipeline/compute";
import { buildDataCompleteness } from "@/report/completeness";

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

async function acquireAnnual(item: "8" | "15", options: { prefix?: string; omitNotes?: boolean; html?: string } = {}) {
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
    if (url === documentUrl) return Promise.resolve(response(options.html ?? html));
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
  it.each([
    '<p>Note 1 — as described in another document — is incorporated here by reference.',
    '<h3>Note 1 Is Described In Another Document</h3><p>',
  ])("retains the real producer warning for unproved punctuation/capitalization: %s", async opening => {
    const { bundle, calls } = await acquireAnnual("8", { html: annualNotesIndexFixture().replace("<p>Note 1 - Organization.", opening) });
    expect(bundle.edgar.tenKNotes).toMatchObject({ ok: false, gap: { severity: "warn" } });
    expect(debtPresentationSections(bundle.edgar)).toEqual([]);
    expect(calls.filter(url => url === documentUrl)).toHaveLength(1);
  });
  it.each(["Basis of Presentation", "Summary of Significant Accounting Policies"])("acquires the complete supported financial-note title %s through the producer", async title => {
    const { bundle, calls } = await acquireAnnual("8", { html: annualNotesIndexFixture().replace("Note 1 - Organization.", `Note 1 - ${title}.`) });
    expect(bundle.edgar.tenKNotes?.ok).toBe(true);
    if (!bundle.edgar.tenKNotes?.ok) throw new Error("Financial-note heading missing");
    expect(bundle.edgar.tenKNotes.value.data.text).toContain(`Note 1 - ${title}.`);
    expect(bundle.edgar.tenKNotes.value.data.text).toContain("LATER_NOTE_SENTINEL");
    expect(bundle.edgar.tenKNotes.value.data.method).toBe("annual-notes-index-redirect");
    expect(calls.filter(url => url === documentUrl)).toHaveLength(1);
  });
  it.each([
    ["reference-only first note", annualNotesIndexFixture().replace("Note 1 - Organization.", "See Note 1 for details in another document.")],
    ["unlinked full schedule in notes", annualNotesIndexFixture().replace('<h2 id="schedule">', '<h2>SCHEDULE II Valuation and Qualifying Accounts</h2><p>UNLINKED_SCHEDULE_BODY</p><h2 id="schedule">')],
  ])("keeps the actual producer's warning and no debt evidence for %s", async (_name, html) => {
    const { bundle, calls } = await acquireAnnual("8", { html });
    expect(bundle.edgar.tenKNotes).toMatchObject({ ok: false, gap: { severity: "warn" } });
    expect(debtPresentationSections(bundle.edgar)).toEqual([]);
    expect(calls.filter(url => url === documentUrl)).toHaveLength(1);
  });

  it.each(['<h3>NOTE 1</h3><p>Organization.', '<p><span>Note 1</span><span> - Organization.</span>', '<p>(1) Organization.'])("acquires genuine original-block first notes through the producer: %s", async opening => {
    const { bundle, calls } = await acquireAnnual("8", { html: annualNotesIndexFixture().replace("<p>Note 1 - Organization.", opening) });
    expect(bundle.edgar.tenKNotes?.ok).toBe(true);
    if (!bundle.edgar.tenKNotes?.ok) throw new Error("Genuine first notes missing");
    expect(bundle.edgar.tenKNotes.value.data.text).toContain("LATER_NOTE_SENTINEL");
    expect(bundle.edgar.tenKNotes.value.data.method).toBe("annual-notes-index-redirect");
    expect(calls.filter(url => url === documentUrl)).toHaveLength(1);
  });

  it("omits an actual producer statement prefix crossed by a full schedule title without a separator", async () => {
    const html = annualNotesIndexFixture().replace('<h2 id="notes">', '<h2>Schedule II Valuation and Qualifying Accounts</h2><p>UNLINKED_SCHEDULE_BODY</p><h2 id="notes">');
    const { bundle } = await acquireAnnual("8", { html });
    expect(bundle.edgar.tenKNotes?.ok).toBe(true);
    if (!bundle.edgar.tenKNotes?.ok) throw new Error("Notes should remain available");
    expect(bundle.edgar.tenKNotes.value.data.statementsText).toBeUndefined();
    expect(bundle.edgar.tenKNotes.value.data.text).not.toContain("UNLINKED_SCHEDULE_BODY");
    expect(debtPresentationSections(bundle.edgar).every(section => section.statementsText === undefined)).toBe(true);
  });
  it("preserves all Stage B figures and avoids a new Blocked state when newly acquired notes establish no monetary or lease scope", async () => {
    const admitted = await acquireAnnual("8", { html: annualNotesIndexFixture() });
    const refused = await acquireAnnual("8", { html: annualNotesIndexFixture().replace('id="schedule"', 'id="missing"') });
    expect(admitted.bundle.edgar.tenKNotes?.ok).toBe(true);
    expect(refused.bundle.edgar.tenKNotes?.ok).toBe(false);
    if (!admitted.bundle.edgar.tenKNotes?.ok || refused.bundle.edgar.tenKNotes?.ok !== false) throw new Error("Producer control failed");
    const notesGap = refused.bundle.edgar.tenKNotes.gap;
    // Only the real producer's notes member and its owned warn gap differ.
    // All other financial/market inputs are the same controlled fixture.
    const before = completeCurrencyBundle({ symbol: "EXMP", annualCurrency: "USD", debt: 250 });
    before.edgar.tenKNotes = refused.bundle.edgar.tenKNotes;
    before.gaps.push(notesGap);
    const after = structuredClone(before);
    after.edgar.tenKNotes = admitted.bundle.edgar.tenKNotes;
    after.gaps = after.gaps.filter(gap => gap.field !== notesGap.field);
    const beforeSnapshot = JSON.stringify(before), afterSnapshot = JSON.stringify(after);
    const original = runStageB(before), updated = runStageB(after);
    expect({ ...updated, gaps: [] }).toEqual({ ...original, gaps: [] });
    expect(updated.gaps).toEqual(original.gaps.filter(gap => gap.field !== "edgar.tenKNotes(EXMP)"));
    expect(buildDataCompleteness(original.gaps).state).not.toBe("blocked");
    expect(buildDataCompleteness(updated.gaps).state).not.toBe("blocked");
    expect(JSON.stringify(before)).toBe(beforeSnapshot);
    expect(JSON.stringify(after)).toBe(afterSnapshot);
  });
  it("acquires the validated same-document appendix without another fetch or signature debt evidence", async () => {
    const { bundle, calls } = await acquireAnnual("8", { html: annualNotesIndexFixture() });
    expect(bundle.edgar.tenKNotes?.ok).toBe(true);
    if (!bundle.edgar.tenKNotes?.ok) throw new Error("Annual appendix missing");
    const result = bundle.edgar.tenKNotes.value;
    expect(result).toMatchObject({ source: "edgar", asOf: "2025-12-31", fetchedAt: "2026-03-01T00:00:00.000Z",
      endpoint: `${documentUrl} (10-K notes via Item 15 same-document index)`,
      data: { form: "10-K", accession, filingDate: "2026-03-01", reportDate: "2025-12-31", documentUrl,
        method: "annual-notes-index-redirect", text: expect.stringContaining("LATER_NOTE_SENTINEL"),
        annualNotesRedirect: { notes: { page: { namespace: "F", number: 8 } }, schedule: { page: { namespace: "S", number: 1 } } } } });
    expect(result.data.text).not.toMatch(/SIGNATURE_SENTINEL|SCHEDULE_SENTINEL|EXHIBIT_SENTINEL|ITEM16_SENTINEL/);
    expect(result.data.statementsText).not.toMatch(/SIGNATURE|Item 15|Item 16/);
    expect(calls.filter(url => url === documentUrl)).toHaveLength(1);
    expect(result.data.chars).toBe(result.data.text.length);
  });
  it("keeps a warn-level notes gap and no debt evidence for an unproved appendix", async () => {
    const { bundle, calls } = await acquireAnnual("8", { html: annualNotesIndexFixture().replace('id="schedule"', 'id="missing"') });
    expect(bundle.edgar.tenKNotes).toMatchObject({ ok: false, gap: { severity: "warn" } });
    expect(debtPresentationSections(bundle.edgar)).toEqual([]);
    expect(calls.filter(url => url === documentUrl)).toHaveLength(1);
  });
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
