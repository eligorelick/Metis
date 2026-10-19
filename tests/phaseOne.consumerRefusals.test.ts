import { describe, expect, it } from "vitest";
import { payoutRatioPct3y, runStageB } from "@/pipeline/compute";
import { computeBeneish, computePiotroski } from "@/pipeline/stageB/forensics";
import { collectPersonRows, personTitleMatches, splitNameAndPosition } from "@/pipeline/stageC/consistency";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportView } from "@/components/report/ReportView";

const refusal = { usable: false as const, vendorValue: -30, secValue: -20, reason: "Same-scope conflict" };
describe("phase-one refusals survive consumers and serialization", () => {
  it("does not count explicitly refused repurchases as zero payout history", () => {
    const rows = ["2025", "2024", "2023"].map(year => ({ date: `${year}-12-31`, netIncome: 100, commonDividendsPaid: -10, commonStockRepurchased: -30 }));
    expect(payoutRatioPct3y(rows)).toBe(40);
    expect(payoutRatioPct3y(rows.map((row, i) => i < 2 ? { ...row, commonStockRepurchased: null, fieldConflicts: { commonStockRepurchased: refusal } } : row))).toBeNull();
    expect(payoutRatioPct3y(rows.map((row, i) => i === 0 ? { ...row, commonStockRepurchased: null, fieldConflicts: { commonStockRepurchased: refusal } } : row))).toBe(40);
  });
  it("marks buyback coverage incomplete and withholds timing for a refused year", () => {
    const bundle = completeCurrencyBundle({});
    if (!bundle.statements.cashflowAnnual.ok) throw Error("annual rows expected");
    const rows = bundle.statements.cashflowAnnual.value.data.rows;
    rows[0] = { ...rows[0], fieldConflicts: { commonStockRepurchased: refusal } };
    const result = JSON.parse(JSON.stringify(runStageB(bundle)));
    expect(result.capital.buybackPriceAnalysis.note).toMatch(/incomplete.*refus/i);
    expect(result.capital.buybackPriceAnalysis.timingCoveragePct).toBeNull();
    expect(result.capital.buybackPriceAnalysis.timingPct).toBeNull();
    expect(result.gaps.some((gap: { field: string }) => gap.field === "capital.buybackPriceAnalysis.coverage")).toBe(true);
    const report = buildDataOnlyReport({ symbol: bundle.symbol, companyName: "Fixture", generatedAt: bundle.builtAt, model: "none", costUsd: 0,
      bundle, computed: runStageB(bundle), validation: { checks: [], flags: [], gaps: [] } as unknown as ValidationReport, costBreakdown: [], reason: "Provider-free fixture" });
    expect(JSON.stringify(report)).toMatch(/incomplete.*refus/i);
    expect(reportToMarkdown(report)).toMatch(/incomplete.*refus/i);
    expect(reportToPrintBody(report)).toMatch(/incomplete.*refus/i);
    expect(renderToStaticMarkup(createElement(ReportView, { report }))).toMatch(/incomplete.*refus/i);
  });
  it("does not restore refused cash through combined cash or vendor net debt", () => {
    const bundle = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    for (const statement of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (!statement.ok) throw Error("balance rows expected");
      for (const row of statement.value.data.rows) {
        row.fieldConflicts = { cashAndCashEquivalents: { ...refusal, reason: "Same-instant cash conflict" } };
        row.cashAndShortTermInvestments = 120;
        row.netDebt = 1;
      }
    }
    const result = JSON.parse(JSON.stringify(runStageB(bundle)));
    expect(result.capital.netDebtToEbitda.netDebt).toBeNull();
    expect(result.valuation.multiples.enterpriseValue.value).toBeNull();
  });
  it("does not reconstruct refused gross profit inside GMI or Piotroski margin", () => {
    const income = { date: "2025-12-31", revenue: 100, costOfRevenue: 60, grossProfit: null,
      fieldConflicts: { grossProfit: { ...refusal, vendorValue: 40, secValue: 35 } } };
    const current = { income, balance: { date: income.date, totalAssets: 200 }, cashFlow: { date: income.date } };
    const prior = { ...current, income: { ...income, date: "2024-12-31", grossProfit: 40, fieldConflicts: undefined } };
    expect(computeBeneish(current, prior, { revenueFloor: 0 }).neutralized).toContain("GMI");
    expect(computePiotroski(current, prior).signals.marginUp.value).toBeNull();
  });
  it("can reconstruct gross margin from independently compatible filed operands", () => {
    const proof = { source: "edgar" as const, unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31", observedAt: "2026-01-31", tags: ["us-gaap/Revenues"], filings: [{ accn: "same", filed: "2026-01-31", form: "10-K" }] };
    const income = { date: "2025-12-31", revenue: 100, costOfRevenue: 60, grossProfit: null, fieldConflicts: { grossProfit: refusal },
      fieldProvenance: { revenue: proof, costOfRevenue: { ...proof, tags: ["us-gaap/CostOfRevenue"] } } };
    const current = { income, balance: { date: income.date, totalAssets: 200 }, cashFlow: { date: income.date } };
    const prior = { ...current, income: { ...income, date: "2024-12-31", grossProfit: 40, fieldConflicts: undefined } };
    expect(computeBeneish(current, prior, { revenueFloor: 0 }).neutralized).not.toContain("GMI");
    expect(computePiotroski(current, prior).signals.marginUp.value).toBe(0);
    const mixed = { ...current, income: { ...income, fieldProvenance: { ...income.fieldProvenance, costOfRevenue: { ...proof, periodStart: "2024-01-01" } } } };
    expect(computeBeneish(mixed, prior, { revenueFloor: 0 }).neutralized).toContain("GMI");
  });
  it.each(["component-tag", "wrong-row-end", "missing-start", "future-filing"])("does not reconstruct a refused margin from unsupported evidence: %s", change => {
    const proof = { source: "edgar" as const, unit: "USD", periodStart: change === "missing-start" ? null : "2025-01-01", periodEnd: change === "wrong-row-end" ? "2024-12-31" : "2025-12-31", observedAt: "2026-01-31", tags: ["us-gaap/Revenues"], filings: [{ accn: "same", filed: change === "future-filing" ? "2027-01-31" : "2026-01-31", form: "10-K" }] };
    const income = { date: "2025-12-31", revenue: 100, costOfRevenue: 60, grossProfit: null, fieldConflicts: { grossProfit: refusal },
      fieldProvenance: { revenue: proof, costOfRevenue: { ...proof, tags: [change === "component-tag" ? "us-gaap/CostOfServices" : "us-gaap/CostOfRevenue"] } } };
    const current = { income, balance: { date: income.date, totalAssets: 200 }, cashFlow: { date: income.date } };
    const prior = { ...current, income: { date: "2024-12-31", revenue: 100, grossProfit: 40 } };
    expect(computeBeneish(current, prior, { revenueFloor: 0 }).neutralized).toContain("GMI");
    expect(computePiotroski(current, prior).signals.marginUp.value).toBeNull();
  });
});

describe("recognized uppercase position boundaries", () => {
  it.each([
    ["Jane Doe CHIEF FINANCIAL OFFICER", "Jane Doe", "CHIEF FINANCIAL OFFICER"],
    ["JANE DOE CHIEF FINANCIAL OFFICER", "JANE DOE", "CHIEF FINANCIAL OFFICER"],
    ["Mary Callahan Erdoes Chief Financial Officer", "Mary Callahan Erdoes", "Chief Financial Officer"],
    ["Jane Doe, CFO", "Jane Doe", "CFO"],
    ["Jane Doe - CHIEF FINANCIAL OFFICER", "Jane Doe", "CHIEF FINANCIAL OFFICER"],
    ["Jane Doe Jr. CHIEF FINANCIAL OFFICER", "Jane Doe Jr.", "CHIEF FINANCIAL OFFICER"],
  ])("splits %s", (text, name, title) => expect(splitNameAndPosition(text)).toEqual({ name, title }));
  it("keeps unrecognized capitals and ambiguous offices restricted", () => {
    expect(splitNameAndPosition("JANE DOE ANALYST")).toEqual({ name: "JANE DOE ANALYST", title: null });
    for (const [claim, source] of [["Chief Accounting Officer", "CAO"], ["Chief Information Officer", "CIO"], ["Chief Marketing Officer", "CMO"], ["CFO", "CEO"]]) expect(personTitleMatches(claim, source)).toBe(false);
  });
  it("retains the compensation recipient and exact title in person rows", () => {
    expect(collectPersonRows({ leadershipFigures: [{ label: "comp Jane Doe CHIEF FINANCIAL OFFICER FY2025", source: "fmp:executive-compensation", asOf: "2025-12-31" }] })).toEqual([
      { tag: "fmp:executive-compensation", asOf: "2025-12-31", name: "Jane Doe", title: "CHIEF FINANCIAL OFFICER", anyOrder: false },
    ]);
  });
});
