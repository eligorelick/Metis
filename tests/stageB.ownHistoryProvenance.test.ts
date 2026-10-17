import { expect, it } from "vitest";
import { multiplesFramework, type MultiplesFrameworkInputs } from "@/pipeline/stageB/valuation";
import { applyMultiples } from "@/pipeline/stageC/passes";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { ReportSchema, judgeOutputToJsonSchema } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";
import { reportToMarkdown } from "@/report/export/markdown";
import { ownHistoryRankLabel } from "@/report/ownHistoryPresentation";

it("keeps unavailable percentile and sample size explicit", () => {
  expect(ownHistoryRankLabel(null, 18)).toBe("n/a");
  expect(ownHistoryRankLabel(Number.NaN, 18)).toBe("n/a");
  expect(ownHistoryRankLabel(6)).toBe("empirical percentile 6/100 (sample size unavailable)");
  expect(ownHistoryRankLabel(6, Number.NaN)).toContain("sample size unavailable");
});

const dates = Array.from({ length: 12 }, (_, index) => `${2025 - Math.floor(index / 4)}-${["12-31", "09-30", "06-30", "03-31"][index % 4]}`);
const input = (): MultiplesFrameworkInputs => ({
  quote: { price: 100, marketCap: 1500, currency: "USD" }, reportedCurrency: "USD",
  incomeTtm: { date: dates[0], revenue: 100, operatingIncome: 20, depreciationAndAmortization: 4, netIncome: 16, epsDiluted: 4 },
  cashFlowTtm: { date: dates[0], operatingCashFlow: 24, capitalExpenditure: -4 },
  balance: { date: dates[0], totalDebt: 0, cashAndShortTermInvestments: 0, totalStockholdersEquity: 100, minorityInterest: 0, preferredStock: 0, goodwill: 0, intangibleAssets: 0 },
});

it("retains each derived sample date, value and market-cap provenance behind the empirical percentile", () => {
  const args = input();
  args.quarterlyFundamentals = dates.map(date => ({ date, revenue: 25, operatingIncome: 5, depreciationAndAmortization: 1, netIncome: 4, operatingCashFlow: 6, capitalExpenditure: -1, totalStockholdersEquity: 100, totalDebt: 0, cashAndShortTermInvestments: 0 }));
  args.enterpriseValuesHistory = dates.map((date, index) => ({ date, marketCapitalization: 1000 + index * 100, enterpriseValue: 0, sourceId: `market-cap:${date}` }));
  const history = multiplesFramework("general", args).multiples.find(row => row.key === "evToSales")?.ownHistory;
  expect(history?.percentileRank).toBe(62.5);
  expect(history?.observationDetails).toHaveLength(9);
  expect(history?.observationDetails?.[0]).toMatchObject({ periodEnd: dates[0], marketDate: dates[0], value: 10, source: "raw-statements", marketCapSourceId: `market-cap:${dates[0]}` });
  expect(history?.basis).toContain("empirical percentile rank");
  const report = loadTask28Fixture();
  report.valuation = applyMultiples(report.valuation, { kind: "dcf-suppressed", route: "general", multiples: multiplesFramework("general", args), notes: [], gaps: [] });
  const stored = ReportSchema.parse(report);
  expect(stored.valuation.multiples.find(row => row.name === "EV/Sales")?.ownHistoryDetails).toEqual(history?.observationDetails);
  const audit = reportToAuditMarkdown(stored);
  expect(audit).toContain("Historical multiple sample observations");
  expect(audit).toContain(`market-cap:${dates[0]}`);
  expect(audit).toContain("raw-statements");
  expect(stored.valuation.multiples.find(row => row.name === "EV/Sales")?.ownHistoryBasis).toBe(history?.basis);
  expect(audit).toContain("empirical percentile rank");
  expect(JSON.stringify(judgeOutputToJsonSchema())).not.toContain('"ownHistoryDetails"');
});

it("labels the normalized percentile separately from sample size", () => {
  const report = loadTask28Fixture();
  report.valuation.multiples = [{ name: "evToSales", current: 6, peerMedian: null, own5yPercentile: 6, ownHistoryObservations: 18, sectorAppropriate: true }];
  expect(reportToMarkdown(report)).toContain("empirical percentile 6/100 (n = 18 quarters)");
});

it("identifies vendor-ratio sample dates without inventing underlying quote dates", () => {
  const args = input();
  args.keyMetricsHistory = dates.slice(0, 8).map((date, index) => ({ date, evToSales: index + 1 }));
  const history = multiplesFramework("general", args).multiples.find(row => row.key === "evToSales")?.ownHistory;
  expect(history?.observationDetails?.[0]).toMatchObject({ periodEnd: dates[0], marketDate: null, value: 1, source: "vendor-ratio" });
  expect(history?.observationDetails).toHaveLength(8);
});

it("does not zero-fill unknown NCI in historical EV or revive it through vendor fallback", () => {
  const args = input();
  args.quarterlyFundamentals = dates.map(date => ({ date, revenue: 25, operatingIncome: 5, depreciationAndAmortization: 1, netIncome: 4, operatingCashFlow: 6, capitalExpenditure: -1, totalStockholdersEquity: 100, totalEquity: 130, totalDebt: 0, cashAndShortTermInvestments: 0 }));
  args.enterpriseValuesHistory = dates.map(date => ({ date, marketCapitalization: 1000, enterpriseValue: 1000 }));
  args.keyMetricsHistory = dates.map(date => ({ date, evToSales: 10 }));
  const result = multiplesFramework("general", args);
  expect(result.multiples.find(row => row.key === "evToSales")?.ownHistory).toBeNull();
  expect(result.multiples.find(row => row.key === "priceToBook")?.ownHistory?.observations).toBe(9);
});
