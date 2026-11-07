import { describe, expect, it } from "vitest";
import { figureValueText } from "@/report/presentation";
import { executiveCardClaims } from "@/report/executiveDecisions";
import { filingFactTables } from "@/report/filingSupplementPresentation";
import { reportToPrintBody } from "@/report/export/printHtml";
import { reportToMarkdown } from "@/report/export/markdown";
import { loadTask28Fixture } from "./helpers/task28Report";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import type { FilingDisclosures } from "@/report/schema";
import { projectionDisplayAssumptions } from "@/report/surfaceManifest";
import { financialCompositionFacts } from "@/pipeline/financialComposition";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { confirmFixtureIssuer } from "./helpers/edgarIdentity";

const source = { form: "10-K", accession: "0000000042-26-000001", exhibit: null, filingDate: "2026-10-01", url: "https://www.sec.gov/Archives/example.htm?a=1&b=2" };
const fact = (key: string, label: string) => ({ key, label, value: 12e6, unit: "currency" as const, asOf: "2026-09-30", period: null, qualifier: null, computed: null, source, text: "Reported balance." });

it("preserves distinct canonical sources when deduplicating company actions", () => {
  const executive = loadTask28Fixture().leadership.executives[0];
  const card = { label: "FACT" as const, text: "The company acquired Cedar.", source: "SEC filing", sourceId: "https://www.sec.gov/Archives/card.htm", asOf: "2026-05-04" };
  const shared = { ...card, sourceId: "https://www.sec.gov/Archives/company.htm" };
  expect(executiveCardClaims(executive, [card], [shared])).toEqual([card]);
  expect(executiveCardClaims(executive, [card], [card])).toEqual([]);
});

it("formats the actual lowercase TATA producer source without rounding to zero", () => {
  expect(figureValueText({ value: 0.0408, unit: "x", source: "computed.forensics.beneish.indices.tata" })).toBe("0.041");
});

describe("evidence-backed reader remediation", () => {
  it("produces neutral tax-balance qualifications without suggesting unreported receivables", () => {
    const bundle = completeCurrencyBundle({ symbol: "DEMO" });
    bundle.builtAt = "2026-11-07T00:00:00Z";
    confirmFixtureIssuer(bundle, 42);
    const url = "https://www.sec.gov/Archives/edgar/data/42/000000004226000001/annual.htm";
    bundle.edgar.companyFacts = { ok: true, value: { source: "edgar", endpoint: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000000042.json", asOf: "2026-09-30", fetchedAt: bundle.builtAt, data: { cik: 42, entityName: "Synthetic issuer", facts: { "us-gaap": { AccruedIncomeTaxesCurrent: { units: { USD: [{ val: 12e6, end: "2026-09-30", filed: "2026-10-01", accn: source.accession, form: "10-K" }] } } } } } } };
    bundle.edgar.tenKNotes = { ok: true, value: { source: "edgar", endpoint: url, asOf: "2026-09-30", fetchedAt: bundle.builtAt, data: { sectionName: "tenKNotes", text: "Synthetic financial notes.", chars: 26, method: "toc-anchor", form: "10-K", accession: source.accession, reportDate: "2026-09-30", filingDate: "2026-10-01", documentUrl: url } } };
    const facts = financialCompositionFacts(bundle, "USD");
    expect(facts).toHaveLength(1);
    expect(facts[0]!.text).not.toMatch(/occupancy-tax|receivable/);
    expect(facts[0]!.text).toContain("legal netting and jurisdiction matching are unestablished");
    expect(facts[0]!.value).toBe(12e6);
  });
  it("preserves a signed TATA accrual coefficient at battery precision", () => {
    expect(figureValueText({ value: 0.0408, unit: "x", source: "computed.forensics.beneish-index-tata" })).toBe("0.041");
    expect(figureValueText({ value: -0.0408, unit: "x", source: "computed.forensics.beneish-index-tata" })).toBe("-0.041");
    expect(figureValueText({ value: 2.5, unit: "x", source: "computed.valuation.evtoebitda-current" })).toBe("2.5×");
  });
  it("uses the actual filing rows for headings and scope caveats", () => {
    const payable = { ...fact("composition-tax-payable", "Current income taxes payable"), text: "Income-tax balances shown gross, not an occupancy-tax pair; legal netting and jurisdiction matching are unestablished. The receivable tag alone does not establish maturity. No net liquidity amount is inferred." };
    const tables = filingFactTables({ currency: "USD", filingFacts: [payable, fact("composition-sbc-recognized", "SBC recognized expense"), fact("goodwill", "Goodwill")] });
    const text = JSON.stringify(tables);
    expect(text).not.toMatch(/occupancy-tax|gross receivable|customer.*investment|capitalization/);
    expect(tables.map(t => t.heading)).toEqual(["SBC composition: recognized expense", "Income-tax balances: current payable", "Filing notes: goodwill"]);
    expect(text).toContain("do not establish legal netting");
  });
  it("renders clickable escaped print citations and source URLs with appendix navigation", () => {
    const report = loadTask28Fixture();
    report.business.whatTheySell = [{ label: "FACT", text: "Source-linked business.", source: source.url, asOf: source.filingDate }];
    report.appendix.sources[0]!.endpoint = source.url;
    const html = reportToPrintBody(report);
    expect(html).toContain('href="https://www.sec.gov/Archives/example.htm?a=1&amp;b=2"');
    expect(html).toContain('href="#report-appendix"');
    expect(html).toContain('id="report-sources"');
    expect(html).not.toContain('href="javascript:');
    report.business.whatTheySell[0]!.source = 'javascript:alert(1)" onmouseover="alert(1)';
    report.appendix.sources[0]!.endpoint = 'data:text/html,<script>alert(1)</script>';
    const unsafe = reportToPrintBody(report);
    expect(unsafe).not.toMatch(/href="(?:javascript:|data:)|<script>|onmouseover="alert/);
  });
  it("keeps dated historical geography and referenced annual products inspectable beside quarterly segments", () => {
    const report = loadTask28Fixture();
    report.business.segments.geographic = [{ name: "Historical region", revenue: { value: 12e6, unit: "currency", currency: "USD", source: "fmp:geographic", period: "FY2023", asOf: "2023-09-30", verified: null }, sharePct: 50 }];
    report.business.concentrationRisks = [{ label: "FACT", text: "The geographic table and annual product categories are historical context.", source: "fmp:geographic", asOf: "2023-09-30" }];
    report.business.segments.product[0]!.name = "Referenced annual product";
    report.filingDisclosures = { version: "1.0.0", currency: "USD", currencyBasis: "USD", guidance: null, guidanceChecks: [], freeCashFlow: [], freeCashFlowDefinition: null, capitalReturn: null, events: [], quarterlyTrend: [], reconciliation: [], commitments: [], notes: [], segments: [{ axis: "BusinessSegments", axisLabel: "Business", currency: "USD", quarters: ["2026-03-31"], rows: [{ label: "Quarterly segment", childOf: null, values: [100] }], total: [100], priorPresentation: [], derivedCells: 0, sources: ["10-Q"] }] };
    for (const text of [reportToMarkdown(report), reportToPrintBody(report)]) {
      expect(text).toContain("Historical region");
      expect(text).toContain("2023-09-30");
      expect(text).toContain("Referenced annual product");
      const row = text.includes("<tr>") ? text.match(/<tr>[^]*?Historical region[^]*?<\/tr>/)?.[0]?.split("<tr>").at(-1) : text.split("\n").find(line => line.includes("Historical region"));
      expect(row).toContain("2023-09-30");
    }
  });
  it("labels separately averaged scenario metrics without claiming a reconciling income statement", () => {
    const series = loadTask28Fixture().projections!.series[0]!;
    expect(projectionDisplayAssumptions(series).join(" ")).toContain("Weighted rows are independently averaged scenario metrics");
    expect(projectionDisplayAssumptions({ ...series, weighted: [] }).join(" ")).not.toContain("Weighted rows are independently averaged scenario metrics");
  });
  it("shows same-basis segment dollar contributions without adding nested components twice", () => {
    const disclosure = { quarterlyTrend: [], guidance: null, guidanceChecks: [], segments: [{ axis: "Products", axisLabel: "Product", currency: "USD", quarters: ["2026-09-30", "2025-09-30"], rows: [{ label: "Legacy", childOf: null, values: [60e6, 80e6] }, { label: "Growth", childOf: null, values: [30e6, 20e6] }, { label: "Growth subcategory", childOf: "Growth", values: [10e6, 5e6] }], total: [95e6, 105e6], priorPresentation: [], derivedCells: 0, sources: ["10-K"] }], notes: [] } as unknown as FilingDisclosures;
    const table = filingDisclosureTables(disclosure, "business").find(t => t.heading.startsWith("Segment revenue by quarter"))!;
    const delta = table.headers.indexOf("YoY revenue change");
    expect(delta).toBeGreaterThan(-1);
    expect(table.rows.find(r => r[0] === "Legacy")![delta]).toBe("−$20M");
    expect(table.rows.find(r => r[0] === "Growth")![delta]).toBe("+$10M");
    expect(table.rows.find(r => r[0] === "Total revenue")![delta]).toBe("−$10M");
    expect(table.note).toContain("component rows are not added again");
    disclosure.segments[0]!.rows[0]!.earlierPresentationAt = [1];
    disclosure.segments[0]!.totalEarlierPresentationAt = [1];
    const refused = filingDisclosureTables(disclosure, "business").find(t => t.heading.startsWith("Segment revenue by quarter"))!;
    expect(refused.rows.find(r => r[0] === "Legacy")![delta]).toBe("—");
    expect(refused.rows.find(r => r[0] === "Total revenue")![delta]).toBe("—");
    disclosure.segments[0]!.quarters[1] = "2025-06-30";
    const wrongPeriod = filingDisclosureTables(disclosure, "business").find(t => t.heading.startsWith("Segment revenue by quarter"))!;
    expect(wrongPeriod.rows.every(r => r[delta] === "—")).toBe(true);
  });
});
