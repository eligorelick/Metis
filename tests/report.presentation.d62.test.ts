/**
 * D-62: the reader-facing presentation rules shared by the Markdown, print and
 * live surfaces, and the separate audit export. Focused on the defects the
 * NVDA report 34 audit (P0-7 headline, P1-12, P3) named.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportView } from "@/components/report/ReportView";
import { reportToPrintBody } from "@/report/export/printHtml";

import { parseCapitalReturn } from "@/edgar/currentReports";
import { buildMarketData } from "@/pipeline/marketData";
import type { DataBundle } from "@/pipeline/types";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { formatFinancialAmount, formatFinancialValue, formatLargeNumber, peerMetricKey } from "@/report/format";
import {
  claimCitation,
  figureRows,
  keyDataRows,
  metricLabel,
  priceTiming,
  pruneTable,
  trustHeadline,
} from "@/report/presentation";
import { ReportSchema, type Report, type TracedNumber } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

const traced = (source: string, value: number, unit: string): TracedNumber => ({ value, unit, currency: "USD", source, sourceId: source, asOf: "2026-07-26", verified: true });

describe("reader labels and one source marker", () => {
  it("names registry ids for a reader and leaves unknown labels untouched", () => {
    expect(metricLabel("computed.deterministic-aspect-scores.fundamentals-score")).toBe("Fundamentals score");
    expect(metricLabel("computed.current-capital.net-debt-to-ebitda")).toBe("Net debt to EBITDA");
    expect(metricLabel("computed.capital.current.debtBridge.totalDebtIncludingLeases")).toBe("Total debt including leases");
    expect(metricLabel("payload.statements.income-statement-quarterly.2026-07-26.revenue")).toBe("Revenue (quarter ended 2026-07-26)");
    expect(metricLabel("computed.technicals.rsi-14")).toBe("RSI (14-day)");
    expect(metricLabel("edgar:10-Q item2", "currency millions: Cash, cash equivalents")).toBe("Cash, cash equivalents");
    expect(metricLabel("FACT: Latest annual ROIC")).toBe("FACT: Latest annual ROIC");
    expect(claimCitation({ source: "edgar:10-Q item2", sourceId: "edgar:10-Q item2", asOf: "2026-07-26" })).toBe("10-Q Item 2 · 2026-07-26");
  });

  it("prints a figure the two capital registries both carry once", () => {
    const rows = figureRows([
      traced("computed.current-capital.interest-coverage", 426.7365, "x"),
      traced("computed.capital.current.interestCoverage", 426.7365010799136, "x"),
      traced("computed.current-capital.total-debt-including-leases", 38_860_000_000, "currency"),
      traced("computed.capital.current.debtBridge.totalDebtIncludingLeases", 38_860_000_000, "currency"),
    ]);
    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ["Interest coverage", "426.7×"],
      ["Total debt including leases", "$38.86B"],
    ]);
  });
});

describe("rounding and units", () => {
  it("rounds the decimal a filing printed, not its binary neighbour", () => {
    expect(formatLargeNumber(81_615_000_000)).toBe("81.62B");
    expect(formatLargeNumber(24_285_000_000)).toBe("24.29B");
    expect(formatFinancialValue(-7_350_000_000, "currency", "USD")).toBe("−$7.35B");
    expect(formatFinancialAmount(11_063, "currency millions: Cash", "USD")).toBe("$11.06B");
    expect(formatFinancialValue(95, "0-100")).toBe("95/100");
    expect(formatFinancialValue(40.2512, "index")).toBe("40.3");
    expect(formatFinancialValue(-1.132, "score")).toBe("-1.13");
  });

  it("keys a peer's market cap as one column, not one column per peer", () => {
    expect(peerMetricKey(traced("payload.peers.amd-advanced-micro-devices-inc", 9e11, "currency"))).toBe("Market cap");
  });

  it("drops always-empty columns and hides a table with no content", () => {
    expect(pruneTable(["Metric", "Value", "Note"], [["A", "1", "n/a"], ["B", "2", "—"]])).toEqual({ headers: ["Metric", "Value"], rows: [["A", "1"], ["B", "2"]] });
    expect(pruneTable(["Field", "Reason"], [["—", ""]])).toBeNull();
  });
});

describe("trust headline (P0-7)", () => {
  it("says what was verified instead of headlining 0/N validated", () => {
    const headline = trustHeadline({
      numeric: { supported: 286, total: 292, rate: 286 / 292 },
      factualClaims: { supported: 30, total: 30, rate: 1 },
      judgments: { cited: 70, total: 70, rate: 1 },
      factualValidation: { cited: 30, validated: 0, contradicted: 0, unchecked: 30, qualitative: 30, total: 30, rate: 0 },
    });
    expect(headline).toBe("286/292 (98%) figures traced to a cited source; 30/30 factual claims cited; no factual claim states a figure to validate; 0 contradicted; 30 qualitative claims cited, not machine-checkable");
  });
});

describe("page-1 key data and the audit export", () => {
  function report(): Report {
    const r = loadTask28Fixture();
    r.meta.evidenceTiming = {
      version: "1", cutoffAt: null, quote: { observedAt: "2026-10-15T19:56:00.000Z", acquiredAt: null, stale: false },
      financialPeriods: [], filings: [], publications: [], acquisitions: [], calculationAsOf: null, calculatedAt: null, reportGeneratedAt: null,
    };
    r.marketData = {
      version: "1", currency: "USD", estimateCurrency: "USD", estimateCurrencyBasis: null,
      quote: { price: 217.23, marketCap: 5.235e12, yearHigh: 243.37, yearLow: 164.27, volume: null, priceAvg50: null, priceAvg200: null, asOf: "2026-10-15" },
      shares: null, enterpriseValue: null,
      estimates: [{ fiscalYearEnd: "2027-01-25", revenueAvg: 4.098e11, revenueLow: null, revenueHigh: null, epsAvg: 9.278, epsLow: null, epsHigh: null, analystsRevenue: 41, analystsEps: 33 }],
      estimatesAsOf: "2026-10-15",
      priceTarget: { consensus: 339.17, median: null, high: 515, low: 210, asOf: "2026-10-15", lastMonthCount: null, lastMonthAverage: null, lastQuarterCount: null, lastQuarterAverage: null },
      gradeCounts: { strongPositive: 2, positive: 58, neutral: 16, negative: 3, strongNegative: 0, asOf: "2026-10-15" },
      shortInterest: null,
    };
    return r;
  }

  it("names an intraday quote and builds the box only from values the report holds", () => {
    const r = report();
    expect(priceTiming(r)).toEqual({ label: "Latest price", detail: "intraday, 15:56 ET", intraday: true });
    const rows = keyDataRows(r);
    const byLabel = new Map(rows.map((row) => [row.label, row.value]));
    expect(byLabel.get("Latest price (intraday, 15:56 ET)")).toBe("$217.23");
    expect(byLabel.get("Market cap")).toBe("$5.24T");
    expect(byLabel.get("Consensus price target")).toBe("$339.17 (+56.1% vs price)");
    expect(byLabel.get("Forward P/E (consensus EPS)")).toBe("23.4×");
    expect(byLabel.get("Analyst grades")).toBe("60 positive · 16 neutral · 3 negative");
    expect(rows.some((row) => /n\/a|undefined|NaN/.test(`${row.value} ${row.note ?? ""}`))).toBe(false);
    expect(rows.some((row) => /short interest/i.test(row.label))).toBe(false);
  });

  it("keeps raw audit leaves out of the report and in the audit export", () => {
    const r = report();
    const markdown = reportToMarkdown(r);
    expect(markdown).not.toMatch(/`source id: /);
    expect(markdown).not.toMatch(/\| n\/a \|/);
    expect(markdown).not.toContain("### As-of map");
    expect(markdown).toContain("### Key data");
    const audit = reportToAuditMarkdown(r);
    for (const heading of ["## Run execution", "## Verification", "### Score drivers", "## Projection audit trail", "## Missing-data manifest", "### As-of map"]) {
      expect(audit).toContain(heading);
    }
  });
});

describe("D-63 filing fields in their home sections", () => {
  it("renders the reconciliation, commitments and EPS columns where present on all three surfaces", () => {
    const r = loadTask28Fixture();
    const source = { form: "8-K", accession: "0001045810-26-000073", exhibit: "EX-99.1", filingDate: "2026-08-26", url: "https://www.sec.gov/x" };
    r.filingDisclosures = {
      version: "1.0.0", currency: "USD", currencyBasis: "statements in USD", guidance: null, guidanceChecks: [],
      freeCashFlow: [{ periodEnd: "2026-07-26", months: 3, value: 21_340_000_000, source }], freeCashFlowDefinition: null,
      capitalReturn: null, events: [], segments: [],
      quarterlyTrend: [{ periodEnd: "2026-07-26", fiscalLabel: "Q2 FY2027", revenue: 96_221_000_000, revenueYoyPct: 105.9, revenueQoqPct: 17.9, grossMarginPct: 75, operatingExpenses: 8.41e9, operatingMarginPct: 66.2, epsDiluted: 2.46, operatingCashFlow: 24.08e9, freeCashFlow: 21.4e9, equitySecuritiesGains: 7_771_000_000, nonGaapEpsDiluted: 2.21 }],
      reconciliation: [
        { metric: "operating-cash-flow", periodEnd: "2026-07-26", months: 3, value: 24_080_000_000, unit: "currency", source },
        { metric: "purchases-property-equipment", periodEnd: "2026-07-26", months: 3, value: -2_681_000_000, unit: "currency", source },
        { metric: "principal-payments-property-equipment", periodEnd: "2026-07-26", months: 3, value: -59_000_000, unit: "currency", source },
      ],
      commitments: [
        { kind: "commitments", table: "future commitments", asOf: "2026-07-26", label: "Supply and capacity", total: 279e9, tableTotal: false, source },
        { kind: "commitments", table: "future commitments", asOf: "2026-07-26", label: "Total", total: 366e9, tableTotal: true, source },
        { kind: "guarantees", table: "guarantees (maximum gross exposure)", asOf: "2026-07-26", label: "Residual value guarantees", total: 108.5e9, tableTotal: false, source },
      ],
      nonGaapBasisNote: "Non-GAAP results no longer exclude stock-based compensation.",
      notes: [],
    };
    const report = ReportSchema.parse(r);
    const outputs = [reportToMarkdown(report), reportToPrintBody(report), renderToStaticMarkup(createElement(ReportView, { report }))];
    for (const output of outputs) {
      for (const text of ["Issuer free-cash-flow reconciliation", "−$59.00M", "Commitments and guarantees", "$366.00B", "$108.50B", "Non-GAAP diluted EPS", "$7.77B", "no longer exclude stock-based compensation"]) {
        expect(output).toContain(text);
      }
    }
    delete report.filingDisclosures!.reconciliation;
    delete report.filingDisclosures!.commitments;
    for (const row of report.filingDisclosures!.quarterlyTrend) { delete row.equitySecuritiesGains; delete row.nonGaapEpsDiluted; }
    const without = reportToMarkdown(report);
    expect(without).not.toContain("Commitments and guarantees");
    expect(without).not.toContain("Equity-securities gains");
  });
});

describe("provider market data (pipeline)", () => {
  it("copies consensus and grade counts as served, without rating words", () => {
    const ok = <T,>(rows: T[]) => ({ ok: true, value: { data: { rows }, asOf: "2026-10-15", fetchedAt: "2026-10-15T00:00:00Z" } });
    const bundle = {
      profile: ok([{ currency: "USD", isAdr: false }]),
      quote: ok([{ price: 100, marketCap: 1e12, yearHigh: 120, yearLow: 80 }]),
      statements: { incomeAnnual: ok([{ date: "2026-01-25", reportedCurrency: "USD" }]) },
      analystEstimates: ok([{ date: "2025-01-26", revenueAvg: 1 }, { date: "2027-01-25", revenueAvg: 4e11, epsAvg: 9 }, { date: "2028-01-25", revenueAvg: 6e11, epsAvg: 15 }]),
      priceTargetConsensus: ok([{ targetConsensus: 150, targetHigh: 200, targetLow: 90 }]),
      priceTargetSummary: { ok: false },
      gradesConsensus: ok([{ strongBuy: 1, buy: 10, hold: 3, sell: 1, strongSell: 0, consensus: "Buy" }]),
      sharesFloat: { ok: false },
      enterpriseValues: { ok: false },
      shortInterest: { ok: false },
    } as unknown as DataBundle;
    const data = buildMarketData(bundle)!;
    expect(data.estimates.map((e) => e.fiscalYearEnd)).toEqual(["2027-01-25", "2028-01-25"]);
    expect(data.gradeCounts).toMatchObject({ strongPositive: 1, positive: 10, neutral: 3, negative: 1 });
    expect(JSON.stringify(data)).not.toMatch(/\b(buy|sell|hold)\b/i);
  });

  it("carries the release's approximately with the capital returned", () => {
    const facts = parseCapitalReturn("During the second quarter of fiscal 2027, NVIDIA returned approximately $26.0 billion to shareholders in the form of shares repurchased and cash dividends.");
    expect(facts.returned).toMatchObject({ value: 26_000_000_000, approximate: true });
  });
});
