import { describe, expect, it } from "vitest";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { FilingDisclosuresSchema } from "@/report/schema";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const header = "Three months ended March 31, Six months ended March 31, 2026 2025 % Change 2026 2025 % Change ($ in millions) ($ in millions)";
const revenue = `${header} Revenue by Segment Consumer $ 600 $ 500 20 % $ 1,000 $ 900 11 % Partner 300 200 50 % 600 500 20 % Other (Third-party revenue) 100 90 11 % 200 180 11 % Total revenue $ 1,000 $ 790 27 % $ 1,800 $ 1,580 14 %`;
const profit = `Adjusted EBITDA by Segment ${header} Consumer $ 120 $ 100 20 % $ 250 $ 200 25 % Partner 30 40 (25) % 80 90 (11) % Other 1 (6) N/A (6) (11) (52) % Segment Adjusted EBITDA 151 134 324 279 Unallocated corporate and other expenses (10) (12) (17) % (20) (24) (17) % Total Adjusted EBITDA $ 141 $ 122 16 % $ 304 $ 255 19 %`;
const text = `${revenue}\nRevenue increased with activity.\n${profit}\nAdjusted EBITDA is a non-GAAP measure and our primary segment operating metric.`;
const accession = "0000000042-26-000013";
const documentUrl = `https://www.sec.gov/Archives/edgar/data/42/${accession.replaceAll("-", "")}/issuer-20260331.htm`;
function bundleFor(body = text) {
  const bundle = completeCurrencyBundle({ annualCurrency: "USD", quarterCurrencies: ["USD", "USD", "USD", "USD"] });
  bundle.edgar.cik = { ok: true, value: { data: { cik: 42, cik10: "0000000042", ticker: bundle.symbol, title: "Generic Issuer" }, source: "edgar", asOf: "2026-07-06", endpoint: "https://www.sec.gov/files/company_tickers.json", fetchedAt: bundle.builtAt } };
  bundle.edgar.latestTenQ = { ok: true, value: { data: { form: "10-Q", reportDate: "2026-03-31", filingDate: "2026-05-05", accessionNumber: accession, primaryDocument: "issuer-20260331.htm" }, source: "edgar", asOf: "2026-03-31", endpoint: "https://data.sec.gov/submissions/CIK0000000042.json", fetchedAt: bundle.builtAt } };
  bundle.edgar.tenQMdna = { ok: true, value: { data: { text: body, chars: body.length, form: "10-Q", reportDate: "2026-03-31", filingDate: "2026-05-05", accession, documentUrl, method: "toc-anchor", sectionName: "tenQItem2" }, source: "edgar", asOf: "2026-03-31", endpoint: `${documentUrl} (10-Q Item 2)`, fetchedAt: bundle.builtAt } };
  return bundle;
}

describe("matched segment adjusted-profit disclosures", () => {
  it("derives comparable segment margins from exact period, scale, currency and name matches", () => {
    const d = buildFilingDisclosures(bundleFor());
    expect(d?.segmentPerformance).toMatchObject([
      { segment: "Consumer", metric: "adjusted-ebitda", months: 3, periodEnd: "2026-03-31", comparisonPeriodEnd: "2025-03-31", currency: "USD", revenue: 600e6, priorRevenue: 500e6, profit: 120e6, priorProfit: 100e6, marginPct: 20, priorMarginPct: 20, changeBasisPoints: 0, source: { form: "10-Q", accession, url: documentUrl, filingDate: "2026-05-05" } },
      { segment: "Partner", revenue: 300e6, priorRevenue: 200e6, profit: 30e6, priorProfit: 40e6, marginPct: 10, priorMarginPct: 20, changeBasisPoints: -1000 },
    ]);
    expect(d?.segmentPerformance).toHaveLength(2);
    expect(FilingDisclosuresSchema.safeParse(d).success).toBe(true);
    for (const row of d?.segmentPerformance ?? []) for (const span of row.spans) expect(text.slice(span.start, span.end)).toBe(span.text);
    const table = filingDisclosureTables(d, "business").find((t) => /adjusted EBITDA margins/i.test(t.heading));
    expect(table?.rows[1]).toEqual(expect.arrayContaining(["Partner", "10.0%", "20.0%", "-1000.0 bp"]));
    expect(table?.note).toMatch(/not consolidated GAAP|not a consolidated GAAP/i);
    const bundle = bundleFor();
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(payload.filingFacts?.figures).toEqual(expect.arrayContaining([expect.objectContaining({ label: expect.stringContaining("Partner segment adjusted EBITDA margin"), value: 10, source: `edgar:10-Q item2 ${accession} ${documentUrl}` })]));
    expect(payload.filingFacts?.figures).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: expect.stringContaining("Partner prior segment revenue"), value: 200e6, period: "2025-03-31" }),
      expect.objectContaining({ label: expect.stringContaining("Partner prior segment adjusted EBITDA,"), value: 40e6, period: "2025-03-31" }),
    ]));
  });
  it.each(["vendor-source", "unrelated-url", "future-filing"])("does not promote %s section text into primary segment evidence or payload figures", (mutation) => {
    const bundle = bundleFor();
    if (!bundle.edgar.tenQMdna.ok) throw new Error("fixture section missing");
    if (mutation === "vendor-source") bundle.edgar.tenQMdna.value.source = "fmp";
    if (mutation === "unrelated-url") bundle.edgar.tenQMdna.value.data.documentUrl = "https://example.org/future.htm";
    if (mutation === "future-filing") bundle.edgar.tenQMdna.value.data.filingDate = "2027-05-05";
    expect(buildFilingDisclosures(bundle)?.segmentPerformance ?? []).toEqual([]);
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(payload.filingFacts?.figures.filter((f) => /segment (?:adjusted EBITDA|revenue)/.test(f.label)) ?? []).toEqual([]);
  });
  it.each([
    "missing-section", "missing-filing", "missing-identity", "vendor-filing", "vendor-identity", "wrong-issuer", "inconsistent-cik", "invalid-cik",
    "wrong-cik-url", "wrong-document", "wrong-accession", "invalid-accession", "unsafe-document", "wrong-form", "wrong-section", "wrong-report-date",
    "wrong-filing-date", "wrong-asof", "invalid-date", "period-after-filing", "invalid-cutoff", "invalid-fetch-date", "wrong-submissions", "wrong-section-endpoint",
  ])("requires complete primary-section identity (%s)", (mutation) => {
    const b = bundleFor();
    if (!b.edgar.tenQMdna.ok || !b.edgar.latestTenQ.ok || !b.edgar.cik.ok) throw new Error("fixture identity missing");
    const section = b.edgar.tenQMdna.value, filing = b.edgar.latestTenQ.value, identity = b.edgar.cik.value;
    switch (mutation) {
      case "missing-section": b.edgar.tenQMdna = { ok: false, gap: { field: "section", reason: "missing", severity: "info" } }; break;
      case "missing-filing": b.edgar.latestTenQ = { ok: false, gap: { field: "filing", reason: "missing", severity: "info" } }; break;
      case "missing-identity": b.edgar.cik = { ok: false, gap: { field: "identity", reason: "missing", severity: "info" } }; break;
      case "vendor-filing": filing.source = "fmp"; break;
      case "vendor-identity": identity.source = "fmp"; break;
      case "wrong-issuer": identity.data.ticker = "OTHER"; break;
      case "inconsistent-cik": identity.data.cik10 = "0000000043"; break;
      case "invalid-cik": identity.data.cik = 0; break;
      case "wrong-cik-url": section.data.documentUrl = documentUrl.replace("/42/", "/43/"); break;
      case "wrong-document": section.data.documentUrl = documentUrl.replace("issuer-20260331.htm", "other.htm"); break;
      case "wrong-accession": section.data.accession = "0000000042-26-000014"; break;
      case "invalid-accession": section.data.accession = filing.data.accessionNumber = "unverified"; break;
      case "unsafe-document": filing.data.primaryDocument = "../issuer-20260331.htm"; break;
      case "wrong-form": section.data.form = filing.data.form = "10-K"; break;
      case "wrong-section": section.data.sectionName = "tenQNotes"; break;
      case "wrong-report-date": filing.data.reportDate = "2025-12-31"; break;
      case "wrong-filing-date": filing.data.filingDate = "2026-05-06"; break;
      case "wrong-asof": section.asOf = "2026-06-30"; break;
      case "invalid-date": section.data.filingDate = filing.data.filingDate = "2026-02-30"; break;
      case "period-after-filing": section.data.filingDate = filing.data.filingDate = "2026-03-01"; break;
      case "invalid-cutoff": b.builtAt = "invalid"; break;
      case "invalid-fetch-date": section.fetchedAt = "unknown"; break;
      case "wrong-submissions": filing.endpoint = "https://data.sec.gov/submissions/CIK0000000043.json"; break;
      case "wrong-section-endpoint": section.endpoint = "https://example.org/section"; break;
    }
    expect(buildFilingDisclosures(b)?.segmentPerformance ?? []).toEqual([]);
  });
  it("admits a matching amended form and retains actual provenance in schema and payload", () => {
    const b = bundleFor();
    if (!b.edgar.tenQMdna.ok || !b.edgar.latestTenQ.ok) throw new Error("fixture identity missing");
    b.edgar.tenQMdna.value.data.form = b.edgar.latestTenQ.value.data.form = "10-Q/A";
    b.edgar.tenQMdna.value.endpoint = documentUrl;
    const d = FilingDisclosuresSchema.parse(buildFilingDisclosures(b));
    expect(d.segmentPerformance).toHaveLength(2);
    expect(d.segmentPerformance?.[0]?.source).toEqual({ form: "10-Q/A", accession, exhibit: null, filingDate: "2026-05-05", url: documentUrl });
    const p = assembleContextPayload(b, runStageB(b), { checks: [], flags: [], gaps: [] });
    expect(p.filingFacts?.figures.find((f) => f.label.startsWith("Partner segment adjusted EBITDA margin"))?.source).toBe(`edgar:10-Q/A item2 ${accession} ${documentUrl}`);
  });
  it("accepts an otherwise vendor-supplied CIK only after the matching SEC registrant confirms the requested ticker", () => {
    const b = bundleFor();
    if (!b.edgar.cik.ok) throw new Error("fixture identity missing");
    b.edgar.cik.value.source = "fmp";
    b.edgar.registrant = { name: "Generic Issuer", cik10: "0000000042", tickers: [b.symbol], exchanges: [], sic: null, sicDescription: null, fiscalYearEnd: null, stateOfIncorporation: null, forms: ["10-Q"] };
    expect(buildFilingDisclosures(b)?.segmentPerformance).toHaveLength(2);
    b.edgar.registrant.tickers = ["OTHER"];
    expect(buildFilingDisclosures(b)?.segmentPerformance ?? []).toEqual([]);
  });
  it.each([
    profit.replaceAll("March 31", "June 30"),
    profit.replaceAll("in millions", "in thousands"),
    profit.replaceAll("$ in", "EUR in"),
    profit.replace("Partner 30 40", "Consumer 30 40"),
    profit.replace(header, ""),
    profit.replace("2026 2025", "2026 2024"),
  ])("withholds ambiguous or noncomparable table pairs", (badProfit) => {
    expect(buildFilingDisclosures(bundleFor(`${revenue}\n${badProfit}`))?.segmentPerformance ?? []).toEqual([]);
  });
  it("does not calculate a margin with zero revenue or infer currency from the listing", () => {
    const d = buildFilingDisclosures(bundleFor(`${revenue.replace("Partner 300 200", "Partner 0 200")}\n${profit}`));
    expect(d?.segmentPerformance?.map((r) => r.segment)).toEqual(["Consumer"]);
    const bundle = bundleFor();
    if (bundle.statements.incomeQuarterly.ok) for (const row of bundle.statements.incomeQuarterly.value.data.rows) delete row.reportedCurrency;
    expect(buildFilingDisclosures(bundle)?.segmentPerformance ?? []).toEqual([]);
  });
  it("rejects a row whose explicit scale overflows its monetary operands", () => {
    const d = buildFilingDisclosures(bundleFor(`${revenue.replace("Partner 300 200", `Partner ${"9".repeat(304)} 200`)}\n${profit}`));
    expect(d?.segmentPerformance?.map((r) => r.segment)).toEqual(["Consumer"]);
  });
});
