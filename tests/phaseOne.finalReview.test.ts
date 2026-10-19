import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { enrichIncomeClassification } from "@/edgar/incomeClassification";
import type { CompanyFacts } from "@/edgar/xbrl";
import { runStageB } from "@/pipeline/compute";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { ReportView } from "@/components/report/ReportView";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { discoverCompanyIrMaterialEvents } from "@/providers/companyIr";
import { readFileSync } from "node:fs";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const at = "2026-10-19T00:00:00Z";
function source(filedGrossProfit = false): CompanyFacts {
  const periods = [
    { start: "2025-01-01", end: "2025-12-31", filed: "2026-02-15", form: "10-K", fy: 2025, fp: "FY", accn: "2025" },
    { start: "2024-01-01", end: "2024-12-31", filed: "2025-02-15", form: "10-K", fy: 2024, fp: "FY", accn: "2024" },
    { start: "2026-01-01", end: "2026-03-31", filed: "2026-04-30", form: "10-Q", fy: 2026, fp: "Q1", accn: "quarter" },
  ];
  const values = { Assets: 200, Revenues: 100, CostOfServices: 20, OperatingIncomeLoss: 30, NetIncomeLoss: 20, ...(filedGrossProfit ? { GrossProfit: 35 } : {}) };
  return { cik: 1, entityName: "Example", facts: { "us-gaap": Object.fromEntries(Object.entries(values).map(([tag,val]) => [tag, { units: { USD: periods.map(p => ({ ...p, start: tag === "Assets" ? undefined : p.start, val: val * 1e6 })) } }])) } };
}
function built(direct = false) {
  return buildStatementsFromCompanyFacts(source(direct), { symbol: "EXMP", cik: "1", asOf: "2026-10-19", factsObservedAt: at, annualPeriods: 3, quarterlyPeriods: 5,
    vendorSplits: { status: "retrieved", source: "fixture", events: [], coverage: [{ from: "1900-01-01", to: "2026-10-19" }] } });
}
function payload<T>(rows: T[], provider: "edgar" | "fmp" = "edgar") { return { ok: true as const, value: { source: provider, data: { rows, raw: structuredClone(rows) }, asOf: "2026-03-31", fetchedAt: at, endpoint: "fixture" } }; }

describe("independent final review P1 canonical gross-profit scope", () => {
  it("does not construct a gross-profit subtotal from the CostOfServices component", () => {
    const result = built();
    expect(result.incomeAnnual.rows[0]?.grossProfit).toBeNull();
    expect(result.incomeQuarterly.rows[0]?.grossProfit).toBeNull();
    expect(result.incomeAnnual.rows[0]?.fieldConflicts?.grossProfit).toMatchObject({ usable: false });
  });
  it("preserves a directly filed GP despite partial cost metadata", () => {
    expect(built(true).incomeAnnual.rows[0]?.grossProfit).toBe(35e6);
    expect(built(true).incomeQuarterly.rows[0]?.grossProfit).toBe(35e6);
  });
  it("revalidates a legacy EDGAR-derived subtotal instead of skipping the envelope", () => {
    const original = payload([{ cik: "1", date: "2026-03-31", reportedCurrency: "USD", revenue: 100e6, costOfRevenue: 20e6, grossProfit: 80e6 }]);
    const result = enrichIncomeClassification(original, source(), "quarter", at);
    expect(result.income).toMatchObject({ ok: true, value: { data: { rows: [{ grossProfit: null, fieldConflicts: { grossProfit: { usable: false } } }] } } });
    expect(original.value.data.rows[0]?.grossProfit).toBe(80e6);
  });
  it.each(["edgar", "mixed-backfill"])("keeps %s rows unavailable through growth, forensics and trends after serialization", mode => {
    const b = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    const normalized = built();
    const annual = normalized.incomeAnnual.rows.map(row => ({ ...row, source: "edgar", sourceEndpoint: "fixture", sourceFetchedAt: at }));
    const quarter = normalized.incomeQuarterly.rows.map(row => ({ ...row, source: "edgar", sourceEndpoint: "fixture", sourceFetchedAt: at }));
    b.statements.incomeAnnual = payload(mode === "edgar" ? annual : [{ ...annual[0], revenue: 110e6, grossProfit: 44e6, source: "fmp", fieldConflicts: undefined, fieldProvenance: undefined }, ...annual.slice(1)], mode === "edgar" ? "edgar" : "fmp");
    b.statements.incomeQuarterly = payload(quarter, mode === "edgar" ? "edgar" : "fmp");
    const serialized = JSON.parse(JSON.stringify(b));
    const computed = runStageB(serialized);
    const refusedDates = new Set((mode === "edgar" ? annual : annual.slice(1)).map(row => row.date));
    expect(computed.growth.margins.gross.series.filter(p => refusedDates.has(p.date)).every(p => p.pct === null)).toBe(true);
    if (!computed.forensics.beneish || !computed.forensics.piotroski) throw Error("Expected forensic models for the fixture");
    expect(computed.forensics.beneish.neutralized).toContain("GMI");
    expect(computed.forensics.piotroski.signals.marginUp.value).toBeNull();
    expect(buildFilingDisclosures(serialized)?.quarterlyTrend[0]?.grossMarginPct).toBeNull();
  });
});

describe("independent final review P1 immutable refusal-aware disclosures", () => {
  it.each(["grossProfit", "revenue"])("does not publish guidance actuals from a refused %s", field => {
    const b = completeCurrencyBundle({});
    const releases = [
      ["q2fy27-ex99-1.txt", "2026-08-26", "0001045810-26-000073"],
      ["q1fy27-ex99-1.txt", "2026-05-20", "0001045810-26-000052"],
    ].map(([file, date, accession]) => buildEarningsReleaseRecord({ filing: { accessionNumber: accession!, filingDate: date!, acceptanceDateTime: undefined },
      releaseUrl: `https://www.sec.gov/Archives/edgar/data/1045810/${file}.htm`, commentaryUrl: null, releaseText: readFileSync(`fixtures/edgar/nvda-current-reports/${file}`, "utf8"), commentaryText: null, includeNarrative: true }));
    b.edgar.currentReports = { ok: true, value: { source: "edgar", endpoint: "fixture", asOf: "2026-08-26", fetchedAt: at, data: { version: CURRENT_REPORTS_VERSION, releases, events: [], notes: [] } } };
    if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
    b.statements.incomeQuarterly.value.data.rows.unshift({ date: "2026-07-26", reportedCurrency: "USD", revenue: 95e9, grossProfit: 45e9,
      fieldConflicts: { [field]: { usable: false, vendorValue: 45e9, secValue: null, reason: "Explicit guidance actual refusal" } } });
    const result = buildFilingDisclosures(JSON.parse(JSON.stringify(b)))!;
    expect(result.guidanceChecks.some(check => check.metric === "gross-margin")).toBe(false);
    if (field === "revenue") expect(result.guidanceChecks.some(check => check.metric === "revenue")).toBe(false);
  });
  it.each(["grossProfit", "revenue", "operatingExpenses", "operatingCashFlow", "netCashProvidedByOperatingActivities"])("does not resurrect refused %s or aliases in serialized report surfaces", field => {
    const b = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    if (!b.statements.incomeQuarterly.ok || !b.statements.cashflowQuarterly.ok) throw Error("fixture");
    const income = b.statements.incomeQuarterly.value.data.rows[0]!;
    const cash = b.statements.cashflowQuarterly.value.data.rows[0]!;
    Object.assign(income, { revenue: 100, grossProfit: 43.219876, operatingExpenses: 99.87654 });
    Object.assign(cash, { operatingCashFlow: 17.89123, netCashProvidedByOperatingActivities: 18.98765, freeCashFlow: 16.87654, capitalExpenditure: -1 });
    const refusal = { usable: false as const, vendorValue: 43.219876, secValue: null, reason: "Explicit source refusal" };
    if (field.includes("Cash") || field.startsWith("netCash")) cash.fieldConflicts = { [field]: refusal };
    else income.fieldConflicts = { [field]: refusal };
    const frozen = JSON.parse(JSON.stringify(b)); const before = JSON.stringify(frozen);
    const result = buildFilingDisclosures(frozen)!;
    const row = result.quarterlyTrend[0]!;
    if (field === "grossProfit" || field === "revenue") expect(row.grossMarginPct).toBeNull();
    if (field === "revenue") expect(row.revenue).toBeNull();
    if (field === "operatingExpenses") expect(row.operatingExpenses).toBeNull();
    if (field.includes("Cash") || field.startsWith("netCash")) expect(row).toMatchObject({ operatingCashFlow: null, freeCashFlow: null });
    expect(JSON.stringify(frozen)).toBe(before);
    if (field !== "grossProfit") return;
    const report = buildDataOnlyReport({ symbol: frozen.symbol, companyName: "Fixture", generatedAt: frozen.builtAt, model: "none", costUsd: 0, bundle: frozen, computed: runStageB(frozen), validation: { checks: [], flags: [], gaps: [] } as unknown as ValidationReport, costBreakdown: [], reason: "fixture" });
    expect(report.filingDisclosures?.quarterlyTrend[0]?.grossMarginPct).toBeNull();
    for (const rendered of [JSON.stringify(report), reportToMarkdown(report), reportToPrintBody(report), reportToAuditMarkdown(report), renderToStaticMarkup(createElement(ReportView, { report }))]) expect(rendered).not.toContain("43.22%");
  });
});

describe("independent final review P2 Unicode datelines", () => {
  it.each(["-", "\u2013", "\u2014", "Today,"])("retains supported acquisition grammar after %s", async separator => {
    const pages: Record<string,string> = {
      "https://example.com/": '<a href="https://ir.example.com/">Investor Relations</a>',
      "https://ir.example.com/": '<a href="/deal">Example Group acquires Journey</a>',
      "https://ir.example.com/deal": `<meta property="article:published_time" content="2026-07-31"><h1>Material announcement</h1><p>${separator === "Today," ? "Today," : `Seattle ${separator}`} Example Group completed its acquisition of Journey.</p>`,
    };
    const result = await discoverCompanyIrMaterialEvents("https://example.com/", "EXMP", "2026-10-19", { issuer: { cik: "1", canonicalName: "Example Group Inc.", verifiedWebsite: "https://example.com/" }, now: () => new Date(at), lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: (async input => new Response(pages[String(input)] ?? "missing", { status: pages[String(input)] ? 200 : 404, headers: { "content-type": "text/html" } })) as typeof fetch });
    expect(result).toMatchObject({ ok: true, value: { data: { events: [{ status: "issuer-stated-completed" }] } } });
  });
});
