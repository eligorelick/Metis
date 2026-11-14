import { describe, expect, it } from "vitest";
import { parseGuidance } from "@/edgar/currentReports";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { buildFilingDisclosures, nextPeriodRevenueGuidance } from "@/pipeline/filingDisclosures";
import { FilingDisclosuresSchema } from "@/report/schema";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const table = "Business Outlook Metric Q3 2026 Gross Bookings $30 - $31B +5 - 7% Revenue $4.2 - $4.4B +5 - 8% Adjusted EBITDA** $1.1 - $1.2B Metric Full Year 2026 Previous Guidance Current Guidance Gross Bookings $120 - $122B +6 - 8% $123 - $125B +8 - 9% Revenue $15.1 - $15.3B +6 - 9% $15.5 - $15.7B +9 - 10% Adjusted EBITDA margin expansion** +1 - 1.25pts +1.5 - 1.75pts ** A reconciliation for the Adjusted EBITDA and Adjusted EBITDA margin expansion forecast is not provided because we cannot, without unreasonable effort, predict certain items, including foreign exchange gains or losses and minority investment gains or losses. Quarterly Dividend The board declared a dividend.";
const release = `Example Reports Financial Results for Second Quarter 2026. Quarter ended June 30, 2026. ${table}`;
function withRelease(text = release) {
  const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
  if (bundle.statements.incomeQuarterly.ok) bundle.statements.incomeQuarterly.value.data.rows.unshift({ date: "2026-06-30", reportedCurrency: "USD", revenue: 4e9 });
  const record = buildEarningsReleaseRecord({ filing: { accessionNumber: "guidance-source", filingDate: "2026-08-05" }, releaseUrl: "https://www.sec.gov/release.htm", commentaryUrl: null, releaseText: text, commentaryText: null, includeNarrative: true });
  bundle.edgar.currentReports = { ok: true, value: { data: { version: CURRENT_REPORTS_VERSION, releases: [record], events: [], notes: [] }, source: "edgar", asOf: "2026-08-05", endpoint: "https://www.sec.gov/release.htm", fetchedAt: "2026-10-13T00:00:00Z" } };
  return bundle;
}
describe("explicit previous/current guidance tables", () => {
  it("reads current quarter and annual money ranges while retaining previous guidance and growth separately", () => {
    const guidance = parseGuidance(table);
    expect(guidance?.items).toMatchObject([
      { metric: "revenue", period: { label: "Q3 FY2026" }, low: 4.2e9, high: 4.4e9, growth: { low: 5, high: 8 } },
      { metric: "adjusted-ebitda", basis: "non-gaap", low: 1.1e9, high: 1.2e9 },
      { metric: "revenue", period: { label: "FY2026" }, low: 15.5e9, high: 15.7e9, previous: { low: 15.1e9, high: 15.3e9 }, growth: { low: 9, high: 10 }, previousGrowth: { low: 6, high: 9 } },
      { metric: "adjusted-ebitda-margin-expansion", basis: "non-gaap", unit: "percentage-points", low: 1.5, high: 1.75, previous: { low: 1, high: 1.25 } },
    ]);
    expect(guidance?.qualifiers.join(" ")).toMatch(/reconciliation.*not provided.*unreasonable effort/i);
    for (const item of guidance?.items ?? []) {
      expect(item.span).toBeDefined();
      expect(table.slice(item.span!.start, item.span!.end)).toBe(item.span!.text);
      expect(item.headerSpan).toBeDefined();
      expect(item.headerSpan!.text).toMatch(/^Metric (?:Q3|Full Year) 2026/);
      expect(table.slice(item.headerSpan!.start, item.headerSpan!.end)).toBe(item.headerSpan!.text);
    }
  });
  it("carries table basis into deterministic presentation and never treats margin expansion as an operating margin", () => {
    const bundle = withRelease();
    const disclosures = buildFilingDisclosures(bundle);
    expect(FilingDisclosuresSchema.safeParse(disclosures).success).toBe(true);
    const expansion = disclosures?.guidance?.rows.find((r) => r.metric === "adjusted-ebitda-margin-expansion");
    expect(expansion).toMatchObject({ unit: "percentage-points", low: 1.5, previous: { low: 1 } });
    expect(filingDisclosureTables(disclosures, "outlook")[0]?.rows.find((r) => /margin expansion/.test(r[1]!))?.join(" ")).toMatch(/1\.5.*pp/);
    expect(nextPeriodRevenueGuidance(bundle)).toMatchObject({ low: 4.2e9, high: 4.4e9, impliedOperatingMarginPct: null });
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(payload.issuerFilings?.figures.filter((f) => /margin expansion/.test(f.label)).every((f) => f.unit === "pp" && f.currency === null)).toBe(true);
  });
  it("scales decimal billion guidance to exact monetary base units", () => {
    const guidance = parseGuidance(table.replace("$15.5 - $15.7B", "$16.05 - $16.22B"));
    expect(guidance?.items.find((r) => r.metric === "revenue" && r.period.fiscalQuarter === null)?.high).toBe(16_220_000_000);
  });
  it.each([
    table.replace("Previous Guidance Current Guidance", "Current Guidance Previous Guidance"),
    table.replace("$15.5 - $15.7B", "$15.7 - $15.5B"),
    table.replace("$15.5 - $15.7B", "€15.5 - €15.7B"),
  ])("does not invent an annual current money range from unsupported or inconsistent columns", (text) => {
    expect(parseGuidance(text)?.items.some((i) => i.metric === "revenue" && i.period.fiscalQuarter === null) ?? false).toBe(false);
  });
});

// D-272: annual table cells prove which range is current.
import { parseDocument } from "@/edgar/extract";
it.each([true, false])("reads annual current columns (revised=%s)", revised => {
  const html = `<p>The following table summarizes the company's full-year 2027 financial guidance:</p><table><tr><th></th>${revised ? "<th>Prior</th><th>Updated</th>" : "<th>2027 Guidance</th>"}</tr><tr><td>Revenue</td>${revised ? "<td>$10 to $11 billion</td>" : ""}<td>$12 to $13 billion</td></tr><tr><td>Performance Margin (1)</td>${revised ? "<td>40% to 41%</td>" : ""}<td>42% to 43%</td></tr></table><p>(1) Excludes acquired research costs.</p><h2>Conference Call</h2>`;
  const doc = parseDocument(html);
  expect(parseGuidance(doc.fullText, doc)?.items).toMatchObject([{metric:"revenue", low:12e9, high:13e9}, {metric:"performance-margin",low:42,high:43}]);
});
it("does not read an ambiguous annual table as current guidance", () => {
 const doc=parseDocument(`<p>The following table summarizes full-year 2027 financial guidance:</p><table><tr><th></th><th>A</th><th>B</th></tr><tr><td>Revenue</td><td>$10 to $11 billion</td><td>$12 to $13 billion</td></tr></table>`);
 expect(parseGuidance(doc.fullText,doc)?.items).toEqual([]);
});

import { releaseEvidenceTables } from "@/edgar/currentReports";
it("keeps complete product and clinical tables outside narrative with their own budget",()=>{
 const doc=parseDocument(`<h2>Non-GAAP Measures</h2><table><tr><td>Selected Products</td><td>Revenue (USD millions), quarter ended September 30, 2027</td></tr><tr><td>Launch A</td><td>120</td></tr></table><table><tr><td>Regulatory</td><td>Approved</td></tr><tr><td>Clinical</td><td>Phase 3</td></tr></table><table><tr><td>Balance sheet</td><td>200</td></tr></table>`);
 const tables=releaseEvidenceTables(doc);
 expect(tables).toHaveLength(2); expect(tables[0]).toContain("USD millions"); expect(tables[1]).toContain("Phase 3");
 expect(releaseEvidenceTables(parseDocument(`<div hidden>${doc.pre}</div>`))).toEqual([]);
 expect(releaseEvidenceTables(parseDocument(`<table><tr><td>Selected Products ${"x".repeat(16001)}</td></tr></table>`))).toEqual([]);
});

function annualReviewDoc(extra="", before="", after="") { return parseDocument(`${before}<p>The following table summarizes the company's full-year 2027 financial guidance:</p><table><tr><th></th><th>2027 Guidance</th></tr><tr><td>Revenue</td><td>$12\u201313 billion</td></tr><tr><td>GAAP diluted EPS</td><td>$2 to $3</td></tr>${extra}</table>${after}<h2>Conference Call</h2>`); }
it.each(["", "<tr><td>Unsupported metric</td><td>$1 to $2</td></tr>"])("D-272 preserves quarterly prose beside a successful or refused annual table: %s", extra=>{
 const doc=annualReviewDoc(extra,"","<p>For the first quarter of 2027, the company expects revenue of $3.0 billion to $3.2 billion.</p>");
 const guidance=parseGuidance(doc.fullText,doc);
 expect(guidance?.items).toContainEqual(expect.objectContaining({metric:"revenue",period:expect.objectContaining({fiscalQuarter:1}),low:3e9,high:3.2e9}));
 if (!extra) expect(guidance?.items).toContainEqual(expect.objectContaining({metric:"revenue",period:expect.objectContaining({fiscalQuarter:null}),low:12e9,high:13e9}));
 else expect(guidance?.unparsed.join(" ")).toContain("Unsupported metric");
});
it("D-272 binds explicit GAAP basis to its row despite nearby non-GAAP discussion",()=>{
 const doc=annualReviewDoc("","<p>Non-GAAP adjusted earnings are discussed elsewhere.</p>","<p>The non-GAAP reconciliation follows.</p>");
 expect(parseGuidance(doc.fullText,doc)?.items.find(i=>i.metric==="eps")).toMatchObject({basis:"gaap",low:2,high:3});
});

it.each([null,2028,2027])("D-272 labels earlier guidance by covered period when newest outlook year is %s", year=>{
 const b=withRelease(); if (!b.edgar.currentReports?.ok) throw new Error("fixture");
 const earlier=b.edgar.currentReports.value.data.releases[0]!;
 earlier.guidance={period:{label:"FY2027",fiscalYear:2027,fiscalQuarter:null},items:[],qualifiers:[],unparsed:["The company expects revenue of $12 billion for full-year 2027."]};
 earlier.filingDate="2026-08-05";
 const latest={...earlier,accession:"newer-source",filingDate:"2026-09-05",guidance:year===null ? null : {period:{label:`FY${year}`,fiscalYear:year,fiscalQuarter:null},items:[],qualifiers:[],unparsed:[`The company expects revenue of $13 billion for full-year ${year}.`]}};
 b.edgar.currentReports.value.data.releases=[latest,earlier];
 const notes=buildFilingDisclosures(b)!.notes;
 expect(notes.join(" ")).toContain("Current outlook coverage gap: 8-K newer-source");
 const old=notes.find(n=>n.includes("outlook statement") && n.includes("8-K guidance-source"))!;
 expect(old).toContain(year===2027 ? "Earlier, superseded issuer" : "Earlier issuer");
 expect(old).not.toContain("Current issuer");
 if(year!==2027) expect(old).not.toContain("superseded");
});

it("D-272 merges independent quarterly document tables with annual rows",()=>{
 const doc=annualReviewDoc("","",`<h2>Business Outlook</h2><table><tr><th>Metric</th><th>Q1 FY27 Estimates</th></tr><tr><td>Revenues</td><td>$3.0B - $3.2B</td></tr></table>`);
 const guide=parseGuidance(doc.fullText,doc);
 expect(guide?.items.filter(i=>i.metric==="revenue")).toEqual(expect.arrayContaining([expect.objectContaining({low:12e9,period:expect.objectContaining({fiscalQuarter:null})}),expect.objectContaining({low:3e9,period:expect.objectContaining({fiscalQuarter:1})})]));
});

it.each(["\u2013","\u2014"])("D-272 accepts a source dash range separator %s",separator=>{
 const doc=annualReviewDoc();const changed=parseDocument(doc.pre.replace("$12\u201313 billion",`$12${separator}13 billion`));
 expect(parseGuidance(changed.fullText,changed)?.items.find(i=>i.metric==="revenue")).toMatchObject({low:12e9,high:13e9});
});
it("D-272 leaves unlabelled EPS basis unestablished beside unrelated non-GAAP prose",()=>{
 const doc=annualReviewDoc("","<p>Non-GAAP adjusted earnings from the prior quarter.</p>");
 const changed=parseDocument(doc.pre.replace("GAAP diluted EPS","EPS"));
 expect(parseGuidance(changed.fullText,changed)?.items.find(i=>i.metric==="eps")?.basis).toBe("unspecified");
});
