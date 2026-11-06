import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { runStageB } from "@/pipeline/compute";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { assembleContextPayload, formatFigure, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { buildMarketData } from "@/pipeline/marketData";
import { consensusTables, keyDataRows } from "@/report/presentation";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { DataBundle } from "@/pipeline/types";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { confirmFixtureIssuer } from "./helpers/edgarIdentity";
import { matchProvenanceRecord } from "@/pipeline/stageC/provenance";

const at = "2026-11-01T12:00:00Z";
const validation = { checks: [], flags: [], gaps: [] };
const point = (val: number, start: string | undefined, end: string, filed = "2026-08-06", accn = "0000000042-26-000002", form = "10-Q") =>
  ({ val, start, end, filed, accn, form, fy: Number(end.slice(0, 4)), fp: "Q2" });
function facts(tags: Record<string, ReturnType<typeof point>[]>): CompanyFacts {
  return { cik: 42, entityName: "Example", facts: { "us-gaap": Object.fromEntries(Object.entries(tags).map(([tag, ps]) => [tag, { units: { USD: ps } }])) } };
}
function gaap(b: DataBundle) {
  if (!b.edgar.companyFacts.ok) throw Error("fixture facts");
  return b.edgar.companyFacts.value.data.facts["us-gaap"] as Record<string, { units: Record<string, ReturnType<typeof point>[]> }>;
}
function withFacts(b: DataBundle, f: CompanyFacts) {
  b.builtAt = at;
  confirmFixtureIssuer(b, 42);
  b.edgar.registrant = { cik10: "0000000042", name: "Example", tickers: [b.symbol], exchanges: ["Nasdaq"], sic: "6163", sicDescription: "Loan Brokers", fiscalYearEnd: "1231", stateOfIncorporation: "DE", forms: ["10-Q", "10-K"] };
  b.edgar.companyFacts = { ok: true, value: { data: f, source: "edgar", endpoint: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000000042.json", asOf: "2026-06-30", fetchedAt: at } };
  return b;
}
function report(b: DataBundle) {
  return buildDataOnlyReport({ symbol: b.symbol, companyName: "Example", generatedAt: b.builtAt, model: "none", costUsd: 0,
    bundle: b, computed: runStageB(b), validation, costBreakdown: [], reason: "offline" });
}
function incomeBundle() {
  const b = withFacts(completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] }), facts({
    Revenues: [point(167.007e6, "2026-01-01", "2026-03-31", "2026-05-06", "0000000042-26-000001")],
    OperatingIncomeLoss: [point(41.941e6, "2026-01-01", "2026-03-31", "2026-05-06", "0000000042-26-000001")],
  }));
  if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
  Object.assign(b.statements.incomeQuarterly.value.data.rows[0]!, { cik: "42", revenue: 167.007e6, operatingIncome: 58.830e6, operatingExpenses: 86.73e6,
    fieldProvenance: { revenue: { source: "edgar", unit: "USD", periodStart: "2026-01-01", periodEnd: "2026-03-31", observedAt: at,
      tags: ["us-gaap/Revenues"], filings: [{ accn: "0000000042-26-000001", filed: "2026-05-06", form: "10-Q" }] } } });
  return b;
}
function cumulativeBundle() {
  const ps = (annual: number, current: number, prior: number) => [
    point(annual, "2025-01-01", "2025-12-31", "2026-03-15", "0000000042-26-000010", "10-K"),
    point(current, "2026-01-01", "2026-06-30"), point(prior, "2025-01-01", "2025-06-30"),
  ];
  const b = withFacts(completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] }), facts({ ShareBasedCompensation: ps(62.364e6, 51.976e6, 5.261e6),
    NetCashProvidedByUsedInOperatingActivities: ps(62.568e6, -72.969e6, 76.089e6) }));
  const dates = ["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30"];
  for (const family of [b.statements.incomeQuarterly, b.statements.balanceQuarterly, b.statements.cashflowQuarterly]) {
    if (!family.ok) throw Error("fixture");
    family.value.data.rows.slice(0, 4).forEach((r, i) => Object.assign(r, { date: dates[i], cik: "42", period: `Q${[2, 1, 4, 3][i]}` }));
    family.value.data.rows = family.value.data.rows.slice(0, 4);
  }
  if (!b.statements.cashflowQuarterly.ok) throw Error("fixture");
  b.statements.cashflowQuarterly.value.data.rows.forEach((r, i) => Object.assign(r, { stockBasedCompensation: [26.098e6, 25.878e6, 39.634e6, 0][i] }));
  return b;
}
function lender() {
  const b = completeCurrencyBundle({ sic: "6163", siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  b.builtAt = at;
  if (!b.profile.ok || !b.statements.balanceQuarterly.ok) throw Error("fixture");
  Object.assign(b.profile.value.data.rows[0]!, { cik: "42", sector: "Financial Services", industry: "Financial - Capital Markets" });
  b.edgar.registrant = { cik10: "0000000042", name: "Example", tickers: [b.symbol], exchanges: ["Nasdaq"], sic: "6163", sicDescription: "Loan Brokers", fiscalYearEnd: "1231", stateOfIncorporation: "DE", forms: ["10-Q"] };
  Object.assign(b.statements.balanceQuarterly.value.data.rows[0]!, { totalDebt: 1474.457e6, operatingLeaseLiability: 4.776e6 });
  b.edgar.tenQNotes = { ok: true, value: { source: "edgar", endpoint: "filing:notes", asOf: "2026-03-31", fetchedAt: at,
    data: { sectionName: "tenQNotes", text: "Loan originations.", method: "toc-anchor", chars: 18, accession: "0000000042-26-000001", form: "10-Q", filingDate: "2026-05-06", reportDate: "2026-03-31", documentUrl: "https://www.sec.gov/Archives/edgar/data/42/000000004226000001/quarter.htm",
      statementsText: "CONSOLIDATED BALANCE SHEETS (in thousands) Payables to third-party loan owners 506,686 Debt, current 222,505 Debt, current to related parties 424,640 Debt, non-current 315,850 CONSOLIDATED STATEMENTS OF CASH FLOWS Operating activities: Originations of loans held for sale (2,600) Proceeds from loan sales 4,500 Net cash used in operating activities (450) Investing activities: Capex (10)" } } };
  return b;
}

describe("R2 FIGR deterministic figures", () => {
  it("F05 uses admitted filed operating income with filed revenue in trend and TTM", () => {
    const b = incomeBundle(); const before = JSON.stringify(b);
    expect(buildFilingDisclosures(b)?.quarterlyTrend[0]?.operatingMarginPct).toBeCloseTo(25.1133, 4);
    expect(runStageB(b).capital.current?.ebit).toBe(41.941e6 + 3 * 60e6);
    expect(JSON.stringify(b)).toBe(before);
  });
  it("F05 withholds a mixed-source operating margin when filed numerator is unavailable", () => {
    const b = incomeBundle();
    if (!b.edgar.companyFacts.ok) throw Error("fixture");
    delete b.edgar.companyFacts.value.data.facts["us-gaap"]!.OperatingIncomeLoss;
    expect(buildFilingDisclosures(b)?.quarterlyTrend[0]?.operatingMarginPct).toBeNull();
    expect(runStageB(b).capital.current?.ebit).toBeNull();
    expect(buildFilingDisclosures(b)?.notes.join(" ")).toMatch(/operating.*withheld.*basis/i);
  });
  it("F05 applies the same filed numerator policy to annual fundamentals", () => {
    const b = incomeBundle();
    if (!b.statements.incomeAnnual.ok || !b.edgar.companyFacts.ok) throw Error("fixture");
    const tags = gaap(b);
    const annual = (val: number) => point(val, "2025-01-01", "2025-12-31", "2026-03-15", "0000000042-26-000010", "10-K");
    tags.Revenues!.units.USD!.push(annual(1000e6));
    tags.OperatingIncomeLoss!.units.USD!.push(annual(100e6));
    expect(runStageB(b).growth.margins.operating.series.find(r => r.date === "2025-12-31")?.pct).toBe(10);
    expect(report(b).fundamentals.marginTrend.find(r => r.label === "Operating margin")?.values.find(v => v.period === "2025-12-31")?.value.value).toBe(10);
  });
  it.each(["currency", "issuer", "interval", "future"])("F05 never admits an incompatible filed operating numerator (%s)", change => {
    const b = incomeBundle();
    if (!b.statements.incomeQuarterly.ok || !b.edgar.companyFacts.ok) throw Error("fixture");
    const row = b.statements.incomeQuarterly.value.data.rows[0]!;
    if (change === "currency") row.reportedCurrency = "EUR";
    if (change === "issuer") row.cik = "99";
    if (change === "interval") row.periodStart = "2026-02-01";
    if (change === "future") gaap(b).OperatingIncomeLoss!.units.USD!.forEach(p => p.filed = "2027-01-01");
    expect(buildFilingDisclosures(b)?.quarterlyTrend[0]?.operatingMarginPct).toBeNull();
  });
  it("F04 constructs TTM cash-flow SBC from filed FY plus YTD less prior YTD", () => {
    const b = cumulativeBundle(); const c = runStageB(b);
    expect(c.capital.current?.cashBridge.stockBasedCompensation).toBe(109.079e6);
    expect(c.capital.current?.cashBridge.definition).toMatch(/ShareBasedCompensation.*fiscal year.*current YTD.*prior-year YTD/i);
    const p = assembleContextPayload(b, c, validation);
    expect(p.provenanceRegistry?.find(r => r.origin === "computed.capital.current.cashBridge.stockBasedCompensation")).toMatchObject({ value: 109.079e6 });
  });
  it("F04 replaces a vendor zero only with the proved canonical cumulative quarter", () => {
    const f = facts({ ShareBasedCompensation: [point(22.730e6, "2025-01-01", "2025-09-30", "2025-11-06", "0000000042-25-000003"), point(5.261e6, "2025-01-01", "2025-06-30", "2025-08-06", "0000000042-25-000002")] });
    const b = cumulativeBundle();
    if (!b.statements.cashflowQuarterly.ok) throw Error("fixture");
    const out = enrichFinancialFields(b.statements.balanceQuarterly, b.statements.cashflowQuarterly, f, "quarter", at);
    expect(out.cashflow.ok && out.cashflow.value.data.rows[3]?.fieldConflicts?.stockBasedCompensation).toMatchObject({ usable: true, vendorValue: 0, secValue: 17.469e6 });
    withFacts(b, f);
    const p = assembleContextPayload(b, runStageB(b), validation);
    // R9 names the accounting basis in the model-visible statement label.
    expect(p.statements.find(s => s.title.startsWith("Cash flow") && s.title.includes("quarterly"))?.lineItems.find(l => l.lineItem === "SBC, cash-flow add-back")?.byPeriod.find(c => c.period === "2025-09-30")?.value).toBe(17.469e6);
    expect(runStageB(b).capital.current?.cashBridge.stockBasedCompensation).toBe(109.079e6);
  });
  it.each(["different-filing", "different-period", "different-currency", "future"])("F04 does not invent a filed TTM identity from incompatible operands (%s)", change => {
    const b = cumulativeBundle();
    if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const tag = gaap(b).ShareBasedCompensation!;
    if (change === "different-filing") tag.units.USD![2]!.accn = "0000000042-26-000099";
    if (change === "different-period") tag.units.USD![2]!.start = "2025-02-01";
    if (change === "future") tag.units.USD![1]!.filed = "2027-01-01";
    if (change === "different-currency") { tag.units.EUR = tag.units.USD!; delete tag.units.USD; }
    expect(runStageB(b).capital.current?.cashBridge.stockBasedCompensation).not.toBe(109.079e6);
  });
  it("B12 labels the provider funding perimeter and separately registers cited filed borrowings", () => {
    const b = lender(); const c = runStageB(b); const p = assembleContextPayload(b, c, validation);
    expect(p.computed.flatMap(s => s.figures).find(f => f.source === "computed.capital.current.debtBridge.totalDebtIncludingLeases")?.label).toMatch(/provider debt perimeter.*includes payables to third-party loan owners/i);
    expect(p.provenanceRegistry?.find(r => /filed borrowings/i.test(r.label ?? ""))).toMatchObject({ value: 962.995e6, asOf: "2026-03-31" });
    expect(serializePayloadForPrompt(p)).toMatch(/222505000.*424640000.*315850000/);
    expect(serializePayloadForPrompt(p)).toContain("https://www.sec.gov/Archives/edgar/data/42/000000004226000001/quarter.htm");
    expect(keyDataRows(report(b)).find(r => /provider debt perimeter/i.test(r.label))?.label).toMatch(/includes payables to third-party loan owners/i);
  });
  it("B13 admits P/TBV on the evidenced lender route with tangible common equity basis", () => {
    const c = runStageB(lender());
    expect(c.valuation.multiples?.sectorAppropriate).toContain("priceToTbv");
    expect(c.valuation.multiples?.multiples.find(m => m.key === "priceToTbv")?.basis).toMatch(/common equity.*goodwill.*intangible/i);
  });
  it("F23 dates both operands wherever short interest is displayed as a float ratio", () => {
    const b = completeCurrencyBundle({}); const r = report(b);
    r.marketData = buildMarketData(b)!;
    r.marketData.shares = { outstanding: 185672150, float: 122844222, freeFloatPct: null, asOf: "2026-11-01", floatAsOf: "2026-11-01" };
    r.marketData.shortInterest = { shares: 21284003, settlementDate: "2026-10-15", daysToCover: 4.71, changePct: 19.61, averageDailyVolume: 4520281 };
    const key = keyDataRows(r).find(row => row.label === "Short interest")!;
    const table = consensusTables(r).flatMap(t => t.rows).find(row => row[0] === "Short interest")!;
    for (const text of [JSON.stringify(key), table.join(" ")]) {
      expect(text).toContain("2026-10-15"); expect(text).toContain("2026-11-01"); expect(text).toMatch(/derived/i);
    }
  });
  it("estimate registry as-of uses observation day, retaining the forecast reference and unknown publication vintage", () => {
    const b = completeCurrencyBundle({ estimates: true });
    if (!b.analystEstimates.ok) throw Error("fixture");
    b.analystEstimates.value.asOf = "2025-12-31";
    b.analystEstimates.value.fetchedAt = at;
    b.analystEstimates.value.data.estimateTiming = { version: "1", asOfRole: "forecast-period-end", acquisitionOrigin: "response", acquiredAt: at, fixtureLoadedAt: null, recordedAt: null, publishedAt: null };
    const p = assembleContextPayload(b, runStageB(b), validation);
    const f = p.estimates.figures.find(f => f.source === "fmp:analyst-estimates")!;
    expect(f.asOf).toBe("2026-11-01");
    expect(p.provenanceRegistry?.find(r => r.id === f.provenanceId)?.asOf).toBe("2026-11-01");
    expect(formatFigure(f)).toContain("publication/update vintage not established");
    expect(formatFigure(f)).toContain("forecast-period end 2025-12-31");
  });
  it("registers filed TTM CFO at the report's exact duration with its filed operands", () => {
    const b = cumulativeBundle(); const c = runStageB(b); const p = assembleContextPayload(b, c, validation);
    expect(c.capital.current?.cashBridge.operatingCashFlow).toBe(-86.490e6);
    const record = p.provenanceRegistry?.find(r => r.origin === "computed.capital.current.cashBridge.operatingCashFlow");
    expect(record).toMatchObject({ value: -86.490e6, periodContext: { kind: "duration", start: "2025-07-01", end: "2026-06-30", basis: "rolling-12-month" } });
    expect(matchProvenanceRecord({ value: -86.490e6, unit: "currency", currency: "USD", source: record!.id, asOf: "2026-06-30",
      period: "TTM to 2026-06-30 (2025-07-01 to 2026-06-30)" }, p.provenanceRegistry!)).toMatchObject({ ok: true });
    expect(serializePayloadForPrompt(p)).toMatch(/62568000.*-72969000.*76089000/);
  });
  it("withholds an unproved vendor operating-expense subset from the trend", () => {
    const b = incomeBundle();
    expect(buildFilingDisclosures(b)?.quarterlyTrend[0]?.operatingExpenses).toBeNull();
    expect(buildFilingDisclosures(b)?.notes.join(" ")).toMatch(/operating expenses.*withheld.*basis/i);
  });
});
