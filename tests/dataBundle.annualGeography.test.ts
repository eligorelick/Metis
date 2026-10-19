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
import { pipelinePasses } from "@/pipeline/stageC/index";

const now = "2026-07-06T00:00:00.000Z";
const years = [2025, 2024, 2023];
const definition = "The following table presents revenue by geographic area based on the geographic location of our websites or points of sale with the exception of SearchUnit, which has all been allocated to Germany, the location of its corporate headquarters.";
export function annualGeographyHtml(): string {
  const fact = (value: number, year: number, scope: string) => `<ix:nonFraction unitRef="usd" contextRef="${scope}${year}" name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" scale="6">${value.toLocaleString("en-US")}</ix:nonFraction>`;
  const row = (name: string, values: number[], scope: string) => `<tr><td>${name}</td>${values.map((v, i) => `<td>$ ${fact(v, years[i]!, scope)}</td>`).join("")}</tr>`;
  return `<html><body><xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
    ${years.flatMap(year => ["c", "u", "o"].map(scope => `<xbrli:context id="${scope}${year}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">1234567</xbrli:identifier>${scope === "c" ? "" : `<xbrli:segment><xbrldi:explicitMember dimension="srt:StatementGeographicalAxis">${scope === "u" ? "country:US" : "us-gaap:NonUsMember"}</xbrldi:explicitMember></xbrli:segment>`}</xbrli:entity><xbrli:period><xbrli:startDate>${year}-01-01</xbrli:startDate><xbrli:endDate>${year}-12-31</xbrli:endDate></xbrli:period></xbrli:context>`)).join("")}
    <h2>Geographic Information</h2><p>${definition}</p><table><tr><td>Year Ended December 31,</td></tr>
    <tr>${years.map(y => `<td>${y}</td>`).join("")}</tr><tr><td>(In millions)</td></tr><tr><td>Revenue</td></tr>
    ${row("United States", [8710, 8372, 8147], "u")}${row("All other countries", [6023, 5319, 4692], "o")}${row("", [14733, 13691, 12839], "c")}</table></body></html>`;
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
  // This geography fixture represents a classified operating issuer. Instrument
  // admission is independent of whether geography or fundamentals are present.
  fmp.profile = async () => ({ ok: true, value: { data: { rows: [{ symbol: "EXMP", companyName: "Example Issuer", isEtf: false, isFund: false }], raw: {} },
    source: "fmp", endpoint: "profile", asOf: "2026-07-06", fetchedAt: now } });
  if (vendor) fmp.revenueGeographicSegmentation = async () => vendor;
  const unavailable = async () => new Response("unavailable", { status: 404 });
  const result = await buildDataBundle("EXMP", { now: () => new Date(now), fmp, edgar, keyless: false,
    fred: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
    finra: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 }, finnhub: { fetchImpl: unavailable, retryDelaysMs: [] } });
  return { result, requests };
}

describe("annual primary-filing geography fallback", () => {
  it("admits exact primary geography through full assembly and numeric verification while retaining its reader URL", async () => {
    const { result: input } = await bundle();
    const computed = runStageB(input, { evIncludeLeases: false });
    const payload = pipelinePasses.assembleContextPayload(input, computed, { checks: [], flags: [], gaps: [] });
    const figure = payload.segments.figures.find(f => f.label === "geographic: United States")!;
    expect(figure.period).toBe("2025-12-31");
    const verified = await pipelinePasses.runVerifyPass({ analysisModel: "claude-opus-4-8", payload }, loadTask28Fixture());
    for (const row of verified.verifiedReport.business.segments.geographic) {
      const record = payload.provenanceRegistry!.find(r => r.label === `geographic: ${row.name}`)!;
      expect(row.revenue).toMatchObject({ source: record.origin, sourceId: record.id, value: record.value, verified: true,
        currency: "USD", period: "2025-12-31", asOf: "2025-12-31", verificationNote: expect.stringContaining(definition) });
      expect(record.origin).toContain("/1234567/000123456726000001/annual.htm");
      expect(verified.verifiedReport.appendix.verificationLog?.find(entry => entry.path === `business.segments.geographic[${verified.verifiedReport.business.segments.geographic.indexOf(row)}].revenue`)?.reason).toBe("supported");
    }
  });

  it.each([
    ["foreign-identifier-scheme", (h: string) => h.replaceAll('scheme="http://www.sec.gov/CIK"', 'scheme="urn:example:foreign-entity-id"')],
    ["missing-identifier-scheme", (h: string) => h.replaceAll(' scheme="http://www.sec.gov/CIK"', "")],
    ["business-segment-scope", (h: string) => h.replaceAll("</xbrli:identifier>", '</xbrli:identifier><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">ex:B2BMember</xbrldi:explicitMember></xbrli:segment>').replace("The following table presents revenue", "The following table presents B2B segment revenue")],
    ["product-scope", (h: string) => h.replaceAll("</xbrli:identifier>", '</xbrli:identifier><xbrli:segment><xbrldi:explicitMember dimension="srt:ProductOrServiceAxis">ex:ProductMember</xbrldi:explicitMember></xbrli:segment>')],
    ["scenario-scope", (h: string) => h.replaceAll("</xbrli:period>", '</xbrli:period><xbrli:scenario><xbrldi:explicitMember dimension="ex:ScenarioAxis">ex:ForecastMember</xbrldi:explicitMember></xbrli:scenario>')],
    ["typed-scope", (h: string) => h.replaceAll("</xbrli:identifier>", '</xbrli:identifier><xbrli:segment><xbrldi:typedMember dimension="ex:CustomAxis"><ex:Scope>B2B</ex:Scope></xbrldi:typedMember></xbrli:segment>')],
    ["dimensioned-total", (h: string) => h.replaceAll('contextRef="c', 'contextRef="u')],
    ["undimensioned-geography", (h: string) => h.replaceAll(/<xbrli:segment>[\s\S]*?<\/xbrli:segment>/g, "")],
    ["inconsistent-geographic-member", (h: string) => h.replace('contextRef="u2024"', 'contextRef="o2024"')],
    ["duplicate-geographic-scope", (h: string) => h.replace('<xbrldi:explicitMember dimension="srt:StatementGeographicalAxis">country:US</xbrldi:explicitMember>', '<xbrldi:explicitMember dimension="srt:StatementGeographicalAxis">country:US</xbrldi:explicitMember><xbrldi:explicitMember dimension="srt:StatementGeographicalAxis">country:US</xbrldi:explicitMember>')],
  ] as const)("withholds %s instead of promoting a partial scope to company geography", async (_name, change) => {
    const { result } = await bundle(change(annualGeographyHtml()));
    expect(result.edgar.annualGeography?.ok).toBe(false);
    expect(result.segmentation.geographic.ok).toBe(false);
  });

  it.each([
    ["geographic-label-member-mismatch", (h: string) => h.replaceAll('>country:US</xbrldi:explicitMember>', '>ex:B2BMember</xbrldi:explicitMember>')],
    ["same-end-quarter-duration", (h: string) => h.replaceAll(/(\d{4})-01-01/g, "$1-10-01")],
    ["different-annual-start", (h: string) => h.replace(/(<xbrli:context id="o2025">[\s\S]*?<xbrli:startDate>)2025-01-01/, (_match, prefix: string) => `${prefix}2025-01-02`)],
  ] as const)("requires %s compatibility", async (_name, change) => {
    const { result } = await bundle(change(annualGeographyHtml()));
    expect(result.edgar.annualGeography?.ok).toBe(false);
    expect(result.segmentation.geographic.ok).toBe(false);
  });

  it.each([
    "The following table presents B2B segment revenue by geographic area based on customer location.",
    "The following table presents B2B revenue by geographic area based on customer location.",
    "The following table presents revenue from our corporate customers by geographic area based on customer location.",
    "The following table presents revenue for the Consumer division by geographic area based on customer location.",
    "The following table presents Product A product revenue by geographic area based on customer location.",
    "The following table presents revenue by geographic area based on customer location for the B2B business unit.",
    "The following table presents revenue by geographic area, for our corporate customers, based on customer location.",
    "The following table presents revenue by geographic area, the United States and Canada, based on customer location.",
  ])("withholds explicitly narrowed prose even with contradictory consolidated XBRL: %s", async narrowed => {
    const { result } = await bundle(annualGeographyHtml().replace(definition, narrowed));
    expect(result.edgar.annualGeography?.ok).toBe(false);
    expect(result.segmentation.geographic.ok).toBe(false);
  });

  it.each([
    definition.replace("by geographic area based", "by geographic area, the United States and all other countries, based"),
    definition.replace("The following table presents revenue", "Our revenue"),
    definition.replace("SearchUnit, which", "our SearchUnit brand, which"),
  ])("keeps a supported whole-issuer definition and its allocation exception: %s", async supported => {
    const { result } = await bundle(annualGeographyHtml().replace(definition, supported));
    expect(result.edgar.annualGeography?.ok).toBe(true);
    expect(result.segmentation.geographic.ok).toBe(true);
    expect(selectedGeographyNotes(result.segmentation.geographic).join(" ")).toContain(supported);
  });

  it("accepts a consistent 53-week annual window and matching custom geographic members", async () => {
    const html = annualGeographyHtml().replaceAll(/(\d{4})-01-01/g, (_match, year: string) => `${Number(year) - 1}-12-26`)
      .replaceAll("country:US", "example:EuropeMember").replaceAll("United States", "Europe")
      .replaceAll("srt:StatementGeographicalAxis", "us-gaap:StatementGeographicalAxis");
    const { result } = await bundle(html);
    expect(result.segmentation.geographic.ok).toBe(true);
    if (result.segmentation.geographic.ok) expect(result.segmentation.geographic.value.data.rows[0]?.data).toHaveProperty("Europe", 8710000000);
  });

  it.each([
    ["cross-issuer", { origin: "https://www.sec.gov/Archives/edgar/data/9999999/000999999926000001/annual.htm" }],
    ["cross-document", { origin: "https://www.sec.gov/Archives/edgar/data/1234567/000123456726000002/other.htm" }],
    ["cross-period", { period: "2024-12-31" }],
    ["cross-unit", { unit: "shares" }],
    ["cross-currency", { currency: "EUR" }],
    ["cross-value", { value: 1 }],
    ["cross-date", { asOf: "2024-12-31" }],
  ] as const)("does not admit %s geography evidence merely because a filing URL is present", async (_name, change) => {
    const { result: input } = await bundle();
    const payload = pipelinePasses.assembleContextPayload(input, runStageB(input), { checks: [], flags: [], gaps: [] });
    const record = payload.provenanceRegistry!.find(r => r.label === "geographic: United States")!;
    Object.assign(record, change);
    const verified = await pipelinePasses.runVerifyPass({ analysisModel: "claude-opus-4-8", payload }, loadTask28Fixture());
    const number = verified.verifiedReport.business.segments.geographic.find(row => row.name === "United States")!.revenue;
    expect(number.verified).toBe(false);
    expect(number.sourceId).not.toBe(record.id);
    expect(number.source).toContain("/1234567/000123456726000001/annual.htm");
  });

  it("keeps primary geography unverified without a numeric payload record", async () => {
    const { result: input } = await bundle();
    const payload = pipelinePasses.assembleContextPayload(input, runStageB(input), { checks: [], flags: [], gaps: [] });
    payload.provenanceRegistry = payload.provenanceRegistry!.filter(r => !r.id.startsWith("payload.segments.geographic-"));
    const verified = await pipelinePasses.runVerifyPass({ analysisModel: "claude-opus-4-8", payload }, loadTask28Fixture());
    expect(verified.verifiedReport.business.segments.geographic.every(row => row.revenue.verified === false)).toBe(true);
    const logs = (verified.verifiedReport.appendix.verificationLog ?? []).filter(entry => /^business\.segments\.geographic\[\d+\]\.revenue$/.test(entry.path ?? ""));
    expect(logs).toHaveLength(2);
    expect(logs.every(entry => entry.reason === "unknown-source")).toBe(true);
  });

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
    ["wrong-issuer", (h: string) => h.replaceAll(">1234567</xbrli:identifier>", ">9999999</xbrli:identifier>")],
    ["duplicate-context-identity", (h: string) => h.replace("<h2>", `${h.match(/<xbrli:context id="u2025">[\s\S]*?<\/xbrli:context>/)![0].replace(">1234567</xbrli:identifier>", ">9999999</xbrli:identifier>")}<h2>`)],
    ["mismatched-total", (h: string) => h.replace("14,733", "14,734")],
    ["property-table", (h: string) => h.replace("<td>Revenue</td>", "<td>Property and equipment, net</td>")],
    ["duplicate-table", (h: string) => h + h],
  ] as const)("retains the gap for %s evidence", async (_name, change) => {
    const { result } = await bundle(change(annualGeographyHtml()));
    expect(result.segmentation.geographic.ok).toBe(false);
  });
});


describe("annual geography complete evidence-block scope", () => {
  const html = annualGeographyHtml();
  const narrow = "These amounts include only the B2B segment.";
  const whole = definition.split(" with the exception of")[0]!;
  const propertyTable = '<table><tr><td>As of December 31, 2025 2024 (In millions)</td></tr><tr><td>Property and equipment</td><td><ix:nonFraction name="us-gaap:PropertyPlantAndEquipmentNet" unitRef="usd" contextRef="c2025" scale="6">100</ix:nonFraction></td><td><ix:nonFraction name="us-gaap:PropertyPlantAndEquipmentNet" unitRef="usd" contextRef="c2024" scale="6">90</ix:nonFraction></td></tr></table>';
  const cases: { name: string; html: string; expected: boolean }[] = [
    { name: "population-exclusion-exception", html: html.replace(definition, `${whole} with the exception of B2B revenue, which is excluded from these amounts.`), expected: false },
    { name: "subsidiary-omission-exception", html: html.replace(definition, `${whole} except for subsidiary revenue, which is omitted.`), expected: false },
    { name: "unknown-selected-operations-exception", html: html.replace(definition, `${whole} except for selected operations.`), expected: false },
    { name: "exclusion-without-exception-keyword", html: html.replace(definition, `${whole}, excluding revenue from selected operations.`), expected: false },
    { name: "inline-anaphoric-exclusion", html: html.replace(definition, `${whole}, but these amounts exclude consumer revenue.`), expected: false },
    { name: "unqualified-whole-company", html, expected: true },
    { name: "same-paragraph-scope-after-definition", html: html.replace(definition, `${definition} ${narrow}`), expected: false },
    { name: "separate-paragraph-before-table", html: html.replace(`</p><table>`, `</p><p>${narrow}</p><table>`), expected: false },
    { name: "separate-paragraph-before-definition", html: html.replace(`<p>${definition}`, `<p>${narrow}</p><p>${definition}`), expected: false },
    { name: "adjacent-scope-after-table", html: html.replace("</table></body>", `</table><p>${narrow}</p></body>`), expected: false },
    { name: "adjacent-scope-before-heading", html: html.replace("<h2>Geographic", `<p>${narrow}</p><h2>Geographic`), expected: false },
    { name: "unknown-channel-qualification", html: html.replace(definition, `${definition} These amounts cover only customers booked through one channel.`), expected: false },
    { name: "ambiguous-population-qualification", html: html.replace(definition, `${definition} The scope of this table differs from consolidated revenue.`), expected: false },
    { name: "excluded-population-after-table", html: html.replace("</table></body>", "</table><p>These figures exclude revenue from outside this business.</p></body>"), expected: false },
    { name: "positive-consolidated-qualifier-after-table", html: html.replace("</table></body>", "</table><p>These amounts include all consolidated revenue.</p></body>"), expected: true },
    { name: "heading-is-not-an-ownership-fence", html: html.replace("</table></body>", `</table><h2>Other disclosure</h2><p>${narrow}</p></body>`), expected: false },
    { name: "narrow-before-next-table-introduction", html: html.replace("</table></body>", `</table><p>${narrow}</p><p>The following table presents property and equipment:</p><table></table></body>`), expected: false },
    { name: "separate-next-data-table", html: html.replace("</table></body>", `</table><p>The following table presents property and equipment:</p>${propertyTable}</body>`), expected: true },
    { name: "xbrl-block-does-not-erase-anaphoric-qualification", html: html.replace("<h2>Geographic", `<p>${narrow}</p><ix:nonNumeric name="us-gaap:ScheduleOfRevenueFromExternalCustomersAttributedToForeignCountriesByGeographicAreaTextBlock" contextRef="c2025"><h2>Geographic`).replace("</table></body>", "</table></ix:nonNumeric></body>"), expected: false },
    { name: "post-table-layout-qualifier", html: html.replace("</table></body>", `</table><table><tr><td>${narrow}</td></tr></table></body>`), expected: false },
    { name: "pre-heading-layout-qualifier", html: html.replace("<h2>Geographic", `<table><tr><td>${narrow}</td></tr></table><h2>Geographic`), expected: false },
    { name: "scope-heading-refers-back", html: html.replace("</table></body>", `</table><h4>Scope of the amounts above</h4><p>${narrow}</p></body>`), expected: false },
    { name: "neutral-paragraph-does-not-sever-limit", html: html.replace("<h2>Geographic", `<p>${narrow}</p><p>These amounts include all consolidated revenue.</p><h2>Geographic`), expected: false },
    { name: "selected-operations-without-scope-noun", html: html.replace(definition, `${definition} These amounts represent selected operations.`), expected: false },
    { name: "forward-reference-before-xbrl-block", html: html.replace("<h2>Geographic", '<p>The figures below exclude consumer revenue.</p><ix:nonNumeric name="us-gaap:ScheduleOfRevenueFromExternalCustomersAttributedToForeignCountriesByGeographicAreaTextBlock" contextRef="c2025"><h2>Geographic').replace("</table></body>", "</table></ix:nonNumeric></body>"), expected: false },
    { name: "scope-after-xbrl-block-close", html: html.replace("<h2>Geographic", '<ix:nonNumeric name="us-gaap:ScheduleOfRevenueFromExternalCustomersAttributedToForeignCountriesByGeographicAreaTextBlock" contextRef="c2025"><h2>Geographic').replace("</table></body>", `</table></ix:nonNumeric><p>${narrow}</p></body>`), expected: false },
  ];
  it.each(cases)("$name", async test => {
    const { result } = await bundle(test.html);
    expect(result.edgar.annualGeography?.ok).toBe(test.expected);
    expect(result.segmentation.geographic.ok).toBe(test.expected);
    const extracted = result.edgar.annualGeography;
    if (test.expected && extracted?.ok) {
      expect(extracted.value.data.periods[0]).toMatchObject({ end: "2025-12-31", total: 14733000000,
        values: { "United States": 8710000000, "All other countries": 6023000000 } });
      for (const span of extracted.value.data.spans) expect(span.html).toBe(test.html.slice(span.start, span.end));
      if (test.name === "positive-consolidated-qualifier-after-table") {
        expect(extracted.value.data.definition).toContain("These amounts include all consolidated revenue.");
        expect(extracted.value.data.spans.some(span => span.html.includes("These amounts include all consolidated revenue."))).toBe(true);
      }
    }
  });
});
