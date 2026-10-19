import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { ReportSchema } from "@/report/schema";
import { reportToMarkdown } from "@/report/export/markdown";
import { classifyInstrument } from "@/pipeline/keyless";
import { classifyInstrumentSupport } from "@/pipeline/stageB/instrumentSupport";
import { computeNareitFfo } from "@/pipeline/stageB/financialMetrics";
import { multiplesFramework, type MultiplesFrameworkInputs } from "@/pipeline/stageB/valuation";
import { normalizeSymbol } from "@/symbol";
import type { DataBundle } from "@/pipeline/types";
import type { YahooMeta } from "@/providers/yahoo";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

// These are controlled business-model probes, NOT financial captures of the
// named securities. Every financial row comes from the same synthetic fixture.
const cases = [
  { symbol: "AAPL", label: "profitable operating firm", sector: "Technology", industry: "Consumer Electronics", expected: "general", kind: "dcf" },
  { symbol: "CRM", label: "software", sector: "Technology", industry: "Software - Application", expected: "general", kind: "dcf" },
  { symbol: "RIVN", label: "cash-burning growth", sector: "Consumer Cyclical", industry: "Auto Manufacturers", expected: "general", kind: "dcf-suppressed", burning: true },
  { symbol: "PRE", label: "pre-revenue biotech", sector: "Healthcare", industry: "Biotechnology", expected: "general", kind: "pre-revenue", preRevenue: true },
  { symbol: "JPM", label: "bank", sector: "Financial Services", industry: "Banks - Diversified", expected: "bank", kind: "excess-return" },
  { symbol: "SCHW", label: "broker without deposit/loan evidence", sector: "Financial Services", industry: "Capital Markets", expected: "general", kind: "dcf" },
  { symbol: "AJG", label: "fee-based insurance broker", sector: "Financial Services", industry: "Insurance - Brokers", expected: "general", kind: "dcf" },
  { symbol: "MET", label: "life insurer", sector: "Financial Services", industry: "Insurance - Life", expected: "insurer", kind: "excess-return" },
  { symbol: "PGR", label: "P&C insurer", sector: "Financial Services", industry: "Insurance - Property & Casualty", expected: "insurer", kind: "excess-return" },
  { symbol: "PLD", label: "equity REIT", sector: "Real Estate", industry: "REIT - Industrial", expected: "reit", kind: "reit" },
  { symbol: "NLY", label: "mortgage REIT", sector: "Real Estate", industry: "REIT - Mortgage", expected: "reit-mortgage", kind: "excess-return" },
  { symbol: "NEE", label: "utility", sector: "Utilities", industry: "Utilities - Regulated Electric", expected: "general", kind: "dcf" },
  { symbol: "XOM", label: "energy", sector: "Energy", industry: "Oil & Gas Integrated", expected: "general", kind: "dcf" },
  { symbol: "CAT", label: "industrial cyclical", sector: "Industrials", industry: "Farm & Heavy Construction Machinery", expected: "general", kind: "dcf" },
  { symbol: "TSM", label: "ADR without quoted-share evidence", sector: "Technology", industry: "Semiconductors", expected: "general", kind: "dcf", adr: true },
  { symbol: "GOOGL", label: "dual-class label without economic-class evidence", sector: "Communication Services", industry: "Internet Content & Information", expected: "general", kind: "dcf" },
] as const;

function configured(c: typeof cases[number]): DataBundle {
  const b = completeCurrencyBundle({ symbol: c.symbol, burning: "burning" in c && c.burning });
  if (!b.profile.ok) throw new Error("profile absent");
  Object.assign(b.profile.value.data.rows[0]!, { sector: c.sector, industry: c.industry,
    isAdr: "adr" in c && c.adr, country: "adr" in c ? "TW" : "US" });
  if ("preRevenue" in c) {
    for (const result of [b.statements.incomeAnnual, b.statements.incomeQuarterly]) {
      if (result.ok) for (const row of result.value.data.rows) { row.revenue = 0; row.netIncome = -1_000_000; }
    }
  }
  return b;
}

describe("independent controlled cross-company coverage audit", () => {
  const observations: unknown[] = [];
  it.each(cases)("$symbol: $label (synthetic inputs)", c => {
    const r = runStageB(configured(c));
    expect(r.route.base).toBe(c.expected);
    expect(r.valuation.kind).toBe(c.kind);
    if (["bank", "insurer", "reit-mortgage"].includes(c.expected)) {
      expect(r.valuation.kind).not.toBe("dcf");
      if (r.valuation.kind !== "pre-revenue") {
        expect(r.valuation.multiples?.multiples.find(m => m.key === "evToEbitda")?.current).toBeNull();
      }
    }
    if ("adr" in c && c.adr && r.valuation.kind === "dcf") expect(r.valuation.dcf?.perShare).toBeNull();
    observations.push({ symbol: c.symbol, label: c.label, synthetic: true, route: r.route.base,
      overlays: r.route.overlays, valuation: r.valuation.kind,
      valuationGaps: r.valuation.gaps, scoring: r.scores });
  });
  it("covers every controlled business-model case", () => {
    expect(observations).toHaveLength(cases.length);
  });
  it.each(["SPY", "QQQ", "VTI"])("rejects known ETF %s when classified", symbol => {
    const b = completeCurrencyBundle({ symbol });
    if (!b.profile.ok) throw new Error("profile absent");
    b.profile.value.data.rows[0]!.isEtf = true;
    expect(() => runStageB(b)).toThrow(/ETF analysis is not supported/);
  });
  it.each(["../AAPL", "AAPL/US", "", "^GSPC", "BTC-USD", "BRK.B", "BRK-B", "ZZZZINVALID"])("records lexical symbol boundary: %s", symbol => {
    const actual = normalizeSymbol(symbol);
    if (["../AAPL", "AAPL/US", "", "^GSPC"].includes(symbol)) expect(actual).toBeNull();
    else expect(actual).toBe(symbol);
  });
});

describe("cross-company safety invariants", () => {
  it("withholds industrial DCF while deposit-funded business evidence conflicts with a nonbank financial label", () => {
    const b = completeCurrencyBundle({ symbol: "CREDIT" });
    if (!b.profile.ok) throw new Error("profile absent");
    Object.assign(b.profile.value.data.rows[0]!, { sector: "Financial Services", industry: "Credit Services" });
    const point = (val: number) => ({ units: { USD: [{ end: "2025-12-31", val,
      accn: "0000000001-26-000001", form: "10-K", filed: "2026-02-15", fy: 2025, fp: "FY" }] } });
    b.edgar.companyFacts = { ok: true, value: { data: { cik: 1, entityName: "Synthetic deposit-funded credit company",
      facts: { "us-gaap": { Deposits: point(1_000_000_000), LoansAndLeasesReceivableNetReportedAmount: point(1_200_000_000) } } },
      source: "edgar", endpoint: "synthetic-companyfacts", asOf: "2026-02-15", fetchedAt: b.builtAt } };
    const conflicted = runStageB(b);
    expect(conflicted.route.gaps.some(g => g.field === "route.evidence.conflict")).toBe(true);
    b.profile.value.data.rows[0]!.industry = "Capital Markets";
    const resolved = runStageB(b);
    expect(resolved.route.base).toBe("bank");
    expect(resolved.valuation.kind).toBe("excess-return");
    // A warning identifies uncertainty; it does not establish FCFF applicability.
    expect(conflicted.valuation.kind).toBe("ineligible");
    expect(conflicted.fairValue.perShare).toBeNull();
    expect(conflicted.returns.roic.latestRoicPct).toBeNull();
    expect(conflicted.returns.wacc.waccPct).toBeNull();
    expect(conflicted.capital.netDebtToEbitda.value).toBeNull();
    expect(conflicted.capital.current?.netDebtToEbitda).toBeNull();
    expect(conflicted.scores.aspects.valuation.score).toBeNull();
    expect(conflicted.valuation.multiples?.multiples).toEqual([]);
    b.profile.value.data.rows[0]!.industry = "Credit Services";
    const report = buildDataOnlyReport({ symbol: b.symbol, companyName: "Synthetic credit company", generatedAt: b.builtAt,
      model: "none", costUsd: 0, bundle: b, computed: conflicted, validation: { checks: [], flags: [], gaps: [] },
      costBreakdown: [], reason: "Offline applicability regression" });
    expect(ReportSchema.safeParse(report).success).toBe(true);
    expect(report.valuation.dcf.perShare).toBeNull();
    expect(report.valuation.scenarios.every(s => s.priceTarget === null)).toBe(true);
    expect(reportToMarkdown(report)).toMatch(/Model applicability unresolved/);
  });
  it("does not admit explicit Yahoo non-equity types as company instruments", () => {
    const types = ["INDEX", "CRYPTOCURRENCY", "CURRENCY", "FUTURE", "OPTION"];
    const results = types.map(instrumentType => {
      const c = classifyInstrument({ instrumentType } as YahooMeta);
      return { instrumentType, classification: c, support: classifyInstrumentSupport(c) };
    });
    expect(results.every(r => !r.support.supported)).toBe(true);
  });
  it("does not publish a company DCF for a fund candidate whose type flags are unavailable", () => {
    const b = completeCurrencyBundle({ symbol: "SPY" });
    if (!b.profile.ok) throw new Error("profile absent");
    delete b.profile.value.data.rows[0]!.isEtf;
    delete b.profile.value.data.rows[0]!.isFund;
    b.profile.value.data.rows[0]!.companyName = "Unclassified fund candidate (synthetic)";
    expect(() => runStageB(b)).toThrow(/security type.*not established/i);
  });
  it("does not rank recurring-capex AFFO against an all-capex AFFO history", () => {
    const point = (val: number) => ({ units: { USD: [{ start: "2025-01-01", end: "2025-12-31", val,
      accn: "0000000001-26-000001", form: "10-K", filed: "2026-02-15", fy: 2025, fp: "FY" }] } });
    const ffo = computeNareitFfo({ periodEnd: "2025-12-31", reportedCurrency: "USD", netIncome: 40,
      depreciationAndAmortization: 83, capitalExpenditure: -20,
      companyFacts: { ok: true, value: { data: { cik: 1, entityName: "Synthetic REIT", facts: { "us-gaap": {
        NetIncomeLoss: point(40), DepreciationAndAmortization: point(83), PaymentsForCapitalImprovements: point(10),
        StraightLineRent: point(0),
      } } }, source: "edgar", endpoint: "synthetic-companyfacts", asOf: "2026-02-15", fetchedAt: "2026-07-06T00:00:00Z" } } });
    expect(ffo.ffo).toBe(123); // Matches NI and D&A of the latest four quarters below.
    expect(ffo.affo).toBe(113); // 123 minus recurring 10, NOT all capex 20.
    expect(ffo.netIncomePlusTotalDa).toBe(true);
    const dates = Array.from({ length: 24 }, (_, i) => `${2025 - Math.floor(i / 4)}-${["12-31", "09-30", "06-30", "03-31"][i % 4]}`);
    const inputs = {
      quote: { price: 12, marketCap: 1200, currency: "USD" }, reportedCurrency: "USD",
      incomeTtm: { date: dates[0], revenue: 400, operatingIncome: 120, netIncome: 40, depreciationAndAmortization: 83, epsDiluted: 1 },
      cashFlowTtm: { date: dates[0], operatingCashFlow: 112, capitalExpenditure: -20 },
      balance: { date: dates[0], totalDebt: 0, cashAndShortTermInvestments: 0, totalStockholdersEquity: 500, goodwill: 0, intangibleAssets: 0, preferredStock: 0, minorityInterest: 0 },
      quarterlyFundamentals: dates.map((date, i) => ({ date, revenue: 100, operatingIncome: 30, netIncome: 10,
        depreciationAndAmortization: 20 + i % 3, incomeDepreciationAndAmortization: 20 + i % 3, operatingCashFlow: 28,
        capitalExpenditure: -5, totalStockholdersEquity: 500, totalDebt: 0, cashAndShortTermInvestments: 0, preferredStock: 0, minorityInterest: 0 })),
      enterpriseValuesHistory: dates.map(date => ({ date, marketCapitalization: 1200, enterpriseValue: 1200 })),
      ffoApprox: ffo.ffo, affoApprox: ffo.affo, ffoHistoryComparable: ffo.netIncomePlusTotalDa,
      affoHistoryComparable: ffo.affoHistoryComparable === true,
    } as MultiplesFrameworkInputs;
    const result = multiplesFramework("reit", inputs);
    const affo = result.multiples.find(m => m.key === "priceToAffo")!;
    const allCapexControl = multiplesFramework("reit", { ...inputs, affoApprox: 103, affoHistoryComparable: true })
      .multiples.find(m => m.key === "priceToAffo")!;
    expect(allCapexControl.current).toBeCloseTo(1200 / 103, 8);
    expect(allCapexControl.ownHistory?.percentileRank).toBeGreaterThan(50);
    expect(affo.current).toBeCloseTo(1200 / 113, 8);
    expect(affo.ownHistory).toBeNull();
  });
});
