import { describe, expect, it } from "vitest";
import { createEdgarClient, type EdgarTransportResponse } from "@/providers/edgar";
import { createFmpClient, type FmpPayload, type FmpSegmentationRow } from "@/providers/fmp";
import { buildDataBundle } from "@/pipeline/dataBundle";
import type { FetchResult } from "@/types/core";
import { parseAnnualGeography, annualGeographyFallback, selectedGeographyNotes } from "@/edgar/annualGeography";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { enrichDataOnlyReport } from "@/pipeline/stageC/dataOnlyReport";
import { loadTask28Fixture } from "./helpers/task28Report";
import { ReportSchema } from "@/report/schema";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BusinessSegments } from "@/components/report/sections";
import { applySegmentShares } from "@/pipeline/stageC/passes";

const now = "2026-07-06T00:00:00.000Z";
const years = [2025, 2024, 2023];
const definition = "The following table presents revenue by geographic area based on the geographic location of our websites or points of sale with the exception of SearchUnit, which has all been allocated to Germany, the location of its corporate headquarters.";
export function annualGeographyHtml(): string {
  const fact = (value: number, year: number) => `<ix:nonFraction unitRef="usd" contextRef="c${year}" name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" scale="6">${value.toLocaleString("en-US")}</ix:nonFraction>`;
  const row = (name: string, values: number[]) => `<tr><td>${name}</td>${values.map((v, i) => `<td>$ ${fact(v, years[i]!)}</td>`).join("")}</tr>`;
  return `<html><body><xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
    ${years.map(year => `<xbrli:context id="c${year}"><xbrli:entity><xbrli:identifier>1234567</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>${year}-01-01</xbrli:startDate><xbrli:endDate>${year}-12-31</xbrli:endDate></xbrli:period></xbrli:context>`).join("")}
    <h2>Geographic Information</h2><p>${definition}</p><table><tr><td>Year Ended December 31,</td></tr>
    <tr>${years.map(y => `<td>${y}</td>`).join("")}</tr><tr><td>(In millions)</td></tr><tr><td>Revenue</td></tr>
    ${row("United States", [8710, 8372, 8147])}${row("All other countries", [6023, 5319, 4692])}${row("", [14733, 13691, 12839])}</table></body></html>`;
}

async function bundle(html = annualGeographyHtml(), vendor?: FetchResult<FmpPayload<FmpSegmentationRow>>) {
  const response = (body: string): EdgarTransportResponse => ({ status: 200, body, fetchedAt: now, fromCache: false, stale: false });
  const requests: string[] = [];
  const edgar = createEdgarClient({ transport: { fetchText: async url => {
    requests.push(url);
    if (url.includes("company_tickers.json")) return response(JSON.stringify({ "0": { cik_str: 1234567, ticker: "EXMP", title: "Example Issuer" } }));
    if (url.includes("submissions/")) return response(JSON.stringify({ cik: "0001234567", name: "Example Issuer", tickers: ["EXMP"], exchanges: ["TEST"], filings: { files: [], recent: {
      accessionNumber: ["0001234567-26-000001"], filingDate: ["2026-02-12"], reportDate: ["2025-12-31"], form: ["10-K"], primaryDocument: ["annual.htm"],
    } } }));
    if (url.includes("companyfacts/")) return response(JSON.stringify({ cik: 1234567, entityName: "Example Issuer", facts: {} }));
    return response(url.endsWith("annual.htm") ? html : "");
  } } });
  const fmp = createFmpClient({ apiKey: "" });
  if (vendor) fmp.revenueGeographicSegmentation = async () => vendor;
  const unavailable = async () => new Response("unavailable", { status: 404 });
  const result = await buildDataBundle("EXMP", { now: () => new Date(now), fmp, edgar, keyless: false,
    fred: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
    finra: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 }, finnhub: { fetchImpl: unavailable, retryDelaysMs: [] } });
  return { result, requests };
}

describe("annual primary-filing geography fallback", () => {
  it("fills missing geography from one matched annual revenue table and retains the actual allocation basis", async () => {
    const { result, requests } = await bundle();
    const geo = result.segmentation.geographic;
    expect(geo.ok).toBe(true);
    if (!geo.ok) return;
    expect(geo.value.source).toBe("edgar");
    expect(geo.value.endpoint).toContain("/1234567/000123456726000001/annual.htm");
    expect(geo.value.data.rows[0]).toMatchObject({ date: "2025-12-31", reportedCurrency: "USD", data: { "United States": 8710000000, "All other countries": 6023000000 } });
    expect(JSON.stringify(geo.value.data.raw)).toContain(definition);
    expect(JSON.stringify(geo.value.data.raw)).toMatch(/sha256|contentHash/);
    expect(requests.filter(url => url.endsWith("annual.htm"))).toHaveLength(1);
  });

  it("keeps usable vendor geography and does not attach the primary filing's different basis", async () => {
    const vendor: FetchResult<FmpPayload<FmpSegmentationRow>> = { ok: true, value: { source: "fmp", endpoint: "vendor-geography", fetchedAt: now, asOf: "2025-12-31", data: { rows: [{ date: "2025-12-31", reportedCurrency: "USD", data: { Domestic: 123, Foreign: 456 } }], raw: [] } } };
    const { result } = await bundle(annualGeographyHtml(), vendor);
    expect(result.segmentation.geographic).toEqual(vendor);
    expect(JSON.stringify(result.segmentation.geographic)).not.toContain("SearchUnit");
    expect(selectedGeographyNotes(result.segmentation.geographic)).toEqual([]);
    if (vendor.ok) vendor.value.data.rows[0]!.reportedCurrency = " usd ";
    const primary = result.edgar.annualGeography;
    expect(annualGeographyFallback(vendor, primary)).toBe(vendor);
  });

  it("keeps allocation basis inseparable from the geography table in payload, live and exports", async () => {
    const { result } = await bundle();
    const computed = runStageB(result, { evIncludeLeases: false });
    const payload = assembleContextPayload(result, computed, { checks: [], flags: [], gaps: [] });
    expect(payload.segments.notes.join(" ")).toContain(definition);
    expect(payload.segments.figures.filter(f => f.label.startsWith("geographic:")).every(f => f.source.endsWith("annual.htm"))).toBe(true);
    const report = ReportSchema.parse(enrichDataOnlyReport(loadTask28Fixture(), { bundle: result, computed, reason: "Synthetic primary geography test" }));
    expect(report.business.segments.geographic[0]?.revenue).toMatchObject({ source: expect.stringContaining("/annual.htm"), verificationNote: expect.stringContaining(definition) });
    const live = renderToStaticMarkup(createElement(BusinessSegments, { business: report.business, index: 1 }));
    for (const surface of [live, reportToMarkdown(report), reportToPrintBody(report)]) {
      const at = surface.toLowerCase().indexOf("geographic segments");
      expect(at).toBeGreaterThanOrEqual(0);
      expect(surface.slice(at, at + 6000)).toContain(definition);
    }
    expect(reportToAuditMarkdown(report)).toContain(definition);
  });

  it("replaces model geography with exact primary rows and keeps vendor behavior separate", async () => {
    const { result } = await bundle();
    const business = loadTask28Fixture().business;
    business.segments.geographic = [{ name: "Invented traveler locations", revenue: { value: 999, unit: "currency", currency: "USD", source: "model-memory", asOf: "2025-12-31", verified: false }, sharePct: 100 }];
    const normalized = applySegmentShares(business, result);
    expect(normalized.segments.geographic.map(row => row.name)).toEqual(["United States", "All other countries"]);
    expect(normalized.segments.geographic[0]?.revenue).toMatchObject({ value: 8710000000, currency: "USD", asOf: "2025-12-31", period: "2025-12-31", source: expect.stringContaining("/annual.htm"), verificationNote: expect.stringContaining(definition) });
    expect(normalized.segments.geographic.map(row => row.sharePct)).toEqual([59.1, 40.9]);
    result.segmentation.geographic = { ok: true, value: { source: "fmp", endpoint: "vendor", asOf: "2025-12-31", fetchedAt: now, data: { rows: [{ date: "2025-12-31", reportedCurrency: "USD", data: { Domestic: 123, Foreign: 456 } }], raw: null } } };
    const vendor = applySegmentShares(business, result);
    expect(vendor.segments.geographic[0]?.name).toBe("Invented traveler locations");
    expect(vendor.segments.geographic[0]?.revenue.source).toBe("model-memory");
    expect(vendor.segments.geographic[0]?.revenue.verificationNote).toBeUndefined();
  });

  it("requires same-primary identity and current availability and retains exact source spans", () => {
    const html = annualGeographyHtml();
    const identity = { cik: "0001234567", filing: { form: "10-K", accessionNumber: "0001234567-26-000001", filingDate: "2026-02-12", reportDate: "2025-12-31", primaryDocument: "annual.htm" },
      documentUrl: "https://www.sec.gov/Archives/edgar/data/1234567/000123456726000001/annual.htm", fetchedAt: now, cutoff: "2026-07-06" };
    const parsed = parseAnnualGeography(html, identity);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    for (const span of parsed.value.data.spans) expect(span.html).toBe(html.slice(span.start, span.end));
    for (const wrong of [{ documentUrl: identity.documentUrl.replace("1234567/", "9999999/") }, { cutoff: "2026-01-01" }, { fetchedAt: "unknown" }, { filing: { ...identity.filing, form: "20-F" } }]) {
      expect(parseAnnualGeography(html, { ...identity, ...wrong }).ok).toBe(false);
    }
    const unusable: FetchResult<FmpPayload<FmpSegmentationRow>> = { ok: true, value: { source: "fmp", endpoint: "vendor", asOf: "2025-12-31", fetchedAt: now, data: { rows: [{ date: "2025-12-31", data: { Domestic: 100 } }], raw: null } } };
    expect(annualGeographyFallback(unusable, parsed).ok).toBe(true);
    expect(annualGeographyFallback(unusable, undefined)).toBe(unusable);
    expect(selectedGeographyNotes(undefined)).toEqual([]);
  });

  it.each([
    ["missing-definition", (h: string) => h.replace(definition, "Revenue by geography.")],
    ["wrong-year", (h: string) => h.replace("<td>2025</td>", "<td>2026</td>")],
    ["wrong-unit", (h: string) => h.replace('unitRef="usd"', 'unitRef="missing"')],
    ["wrong-scale", (h: string) => h.replace('scale="6"', 'scale="3"')],
    ["wrong-issuer", (h: string) => h.replaceAll("<xbrli:identifier>1234567", "<xbrli:identifier>9999999")],
    ["mismatched-total", (h: string) => h.replace("14,733", "14,734")],
    ["property-table", (h: string) => h.replace("<td>Revenue</td>", "<td>Property and equipment, net</td>")],
    ["duplicate-table", (h: string) => h + h],
  ] as const)("retains the gap for %s evidence", async (_name, change) => {
    const { result } = await bundle(change(annualGeographyHtml()));
    expect(result.segmentation.geographic.ok).toBe(false);
  });
});
