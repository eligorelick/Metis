import { describe, expect, it } from "vitest";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { dcfGuidance } from "@/pipeline/compute";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { buildDcfAssumptions, type DcfAssumptionInputs } from "@/pipeline/stageB/valuation";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const B = 1e9;
// Exact current revenue intervals retained from the SEC Q2 2026 release.
const releaseUrl = "https://www.sec.gov/Archives/edgar/data/1324424/000132442426000051/earningsrelease-q22026.htm";
function fixture() {
  const bundle = completeCurrencyBundle({});
  const record = buildEarningsReleaseRecord({ filing: { accessionNumber: "0001324424-26-000051", filingDate: "2026-08-05" }, releaseUrl, commentaryUrl: null,
    releaseText: "Company Reports Financial Results for Second Quarter 2026. Quarter ended June 30, 2026. Business Outlook Metric Q3 2026 Revenue $4.65 - $4.75B +5 - 8% Metric Full Year 2026 Previous Guidance Current Guidance Revenue $15.6 - $16.0B +6 - 9% $16.05 - $16.22B +9 - 10% Quarterly Dividend", commentaryText: null, includeNarrative: true });
  if (bundle.statements.incomeQuarterly.ok) bundle.statements.incomeQuarterly.value.data.rows.unshift({ date: "2026-06-30", revenue: 4.32 * B, reportedCurrency: "USD" });
  bundle.edgar.currentReports = { ok: true, value: { source: "edgar", endpoint: releaseUrl, fetchedAt: bundle.builtAt, asOf: record.filingDate,
    data: { version: CURRENT_REPORTS_VERSION, releases: [record], events: [], notes: [] } } };
  const annual = record.guidance!.items.find(i => i.metric === "revenue" && i.period.fiscalQuarter === null)!;
  return { bundle, record, annual };
}
function inputs(guidance: DcfAssumptionInputs["guidance"], extra: Partial<DcfAssumptionInputs> = {}): DcfAssumptionInputs {
  return { revenueCagr3yPct: 8, revenueCagr5yPct: 8, analystEstimates: null, waccPct: 10, riskFreePct: 4,
    incomeTtm: { date: "2026-06-30", basis: "ttm", revenue: 15.7 * B, operatingIncome: 2 * B, incomeBeforeTax: 1.8 * B, incomeTaxExpense: 0.36 * B },
    incomeHistory: [2023, 2024, 2025].map(year => ({ date: `${year}-12-31`, revenue: (year - 2010) * B, operatingIncome: 1.8 * B, incomeBeforeTax: 1.6 * B, incomeTaxExpense: 0.32 * B })),
    balance: { date: "2026-06-30", basis: "quarter", totalDebt: 4 * B, totalStockholdersEquity: 5 * B, cashAndShortTermInvestments: 3 * B },
    quarterRevenue: { latest: { date: "2026-06-30", revenue: 4.32 * B }, yearAgo: { date: "2025-06-30", revenue: 3.79 * B }, guidedYearAgo: { date: "2025-09-30", revenue: 4.41 * B } },
    marketCap: 20 * B, domicileCountry: "US", guidance, ...extra };
}
const assumptions = (i: DcfAssumptionInputs) => buildDcfAssumptions(i).assumptions!;

describe("quarterly guidance and annual-period comparability", () => {
  it("withholds a seasonal quarter's annual floor, pace and level while retaining both management outlook periods", () => {
    const { bundle } = fixture();
    const guide = dcfGuidance(bundle, "USD")!;
    const result = assumptions(inputs(guide));
    const ordinary = assumptions(inputs(null));
    expect(result.revenueAnchor?.source).toBe("run-rate");
    expect(result.revenueAnchor?.yearOneRevenue).toBe(ordinary.revenueAnchor?.yearOneRevenue);
    expect(result.revenueAnchor?.evidence).toMatchObject({ guidedRunRate: null, guidedPacePct: null, guidedQuarter: { revenueMid: 4.7 * B, periodEnd: "2026-09-30" } });
    expect(result.revenueAnchor?.basis).toMatch(/independent house comparability guard/i);
    expect(result.revenueAnchor?.basis).toMatch(/18\.6B.*19B.*16\.05B.*16\.22B/);
    expect(result.revenueAnchor?.basis).toMatch(/not.*next-twelve-month|not.*NTM/i);
    const rows = buildFilingDisclosures(bundle)?.guidance?.rows.filter(r => r.metric === "revenue");
    expect(rows?.map(r => [r.period, r.low, r.high])).toEqual([["Q3 FY2026", 4.65 * B, 4.75 * B], ["FY2026", 16_050_000_000, 16_220_000_000]]);
  });
  it("does not reject calendarized consensus using the refused seasonal quarter floor", () => {
    const guide = dcfGuidance(fixture().bundle, "USD")!;
    const consensus = [{ date: "2026-12-31", revenueAvg: 16 * B }, { date: "2027-12-31", revenueAvg: 18 * B }];
    const result = assumptions(inputs(guide, { analystEstimates: consensus }));
    expect(result.revenueAnchor?.source).toBe("consensus");
    expect(result.revenueAnchor?.yearOneRevenue).toBe(assumptions(inputs(null, { analystEstimates: consensus })).revenueAnchor?.yearOneRevenue);
  });
  it.each(["absent", "other-year", "other-currency", "overlap"])("preserves existing D60 extrapolation when annual context is %s", mode => {
    const { bundle, record, annual } = fixture();
    if (mode === "absent") record.guidance!.items = record.guidance!.items.filter(i => i !== annual);
    if (mode === "other-year") annual.period = { ...annual.period, fiscalYear: 2027, label: "FY2027" };
    if (mode === "other-currency") annual.symbol = "EUR";
    if (mode === "overlap") Object.assign(annual, { low: 18 * B, mid: 19 * B, high: 20 * B });
    const result = assumptions(inputs(dcfGuidance(bundle, "USD")));
    expect(result.revenueAnchor?.source).toBe("guidance");
    // 2026-10-29 D-136 / OD-1: preserve this guard-admission case with a filed year-ago quarter.
    expect(result.revenueAnchor?.basis).toMatch(/trailing twelve months carried twelve months at the guided year-over-year pace 6\.58%/);
    expect(result.revenueAnchor?.evidence?.guidedPacePct).not.toBeNull();
  });
  it.each(["source", "date"])("does not apply comparison evidence from a different %s", mode => {
    const guide = dcfGuidance(fixture().bundle, "USD")!;
    if (mode === "source") guide.annualRevenueComparison!.source = "another filing";
    else guide.annualRevenueComparison!.asOf = "2026-05-01";
    expect(assumptions(inputs(guide)).revenueAnchor?.source).toBe("guidance");
  });
  it("also withholds an entirely below-range quarterly annualization and preserves an independently compatible operating margin", () => {
    const guide = dcfGuidance(fixture().bundle, "USD")!;
    Object.assign(guide, { revenue: 1.05 * B, revenueLow: B, revenueHigh: 1.1 * B, operatingMarginPct: 14 });
    const result = assumptions(inputs(guide));
    expect(result.revenueAnchor?.source).toBe("run-rate");
    expect(result.ebitMarginPath.value[0]).toBe(14);
    expect(result.revenueAnchor?.evidence?.guidedQuarter?.revenueMid).toBe(1.05 * B);
  });
});
