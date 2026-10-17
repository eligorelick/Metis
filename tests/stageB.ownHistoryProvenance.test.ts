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

it("withholds aggregate historical cap ratios after resolving current multi-class equity while preserving current price/EPS", () => {
  const args = input();
  args.quote = { ...args.quote, priceAsOf: "2026-10-14", issuerId: "issuer", securityId: "common", marketCapSecurityBasis: "quoted-security" };
  args.securityBasisAsOf = "2026-10-15";
  args.economicShareEvidence = [{ issuerId: "issuer", securityId: "common", asOf: "2025-12-31", filed: "2026-02-06", effectiveFrom: "2025-12-31", effectiveTo: null, complete: true, sourceHash: "counts-and-rights", sourceIds: ["filing:counts-and-rights"], classes: [
    { classId: "common", shares: 100, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" },
    { classId: "other", shares: 20, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "economic-equivalence-proxy" },
  ] }];
  args.quarterlyFundamentals = dates.map(date => ({ date, revenue: 25, operatingIncome: 5, depreciationAndAmortization: 1, netIncome: 4, operatingCashFlow: 6, capitalExpenditure: -1, totalStockholdersEquity: 100, totalDebt: 0, cashAndShortTermInvestments: 0 }));
  args.enterpriseValuesHistory = dates.map(date => ({ date, marketCapitalization: 1000, enterpriseValue: 1000 }));
  args.keyMetricsHistory = dates.map(date => ({ date, evToSales: 10, priceToEarningsRatio: 62.5, priceToBookRatio: 10 }));
  const result = multiplesFramework("general", args);
  expect(result.enterpriseValue.equityScope?.marketCap).toBe(12000);
  expect(result.multiples.every(row => row.ownHistory === null)).toBe(true);
  expect(result.multiples.find(row => row.key === "peTtm")?.current).toBe(25);
  expect(result.multiples.find(row => row.key === "priceToBook")?.current).toBe(120);
  expect(result.gaps.some(gap => gap.field === "valuation.multiples.ownHistory.economicClassBasis" && /price\/EPS/.test(gap.reason))).toBe(true);
  // A positive restoration uses only inventories known by each historical
  // market day and its own sourced price/currency; no current count multiplier.
  const ordered = [...dates].reverse();
  const historical = ordered.map((date, index) => ({ issuerId: "issuer", securityId: "common", asOf: `${Number(date.slice(0, 4)) - 1}-12-31`, filed: date, effectiveFrom: date,
    effectiveTo: ordered[index + 1] ?? "2025-12-31", complete: true, sourceHash: `historic-counts:${date}`, sourceIds: [`historic:counts:${date}`], classes: [
      { classId: "common", shares: 100, countBasis: "outstanding" as const, economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" as const },
      { classId: "other", shares: 20, countBasis: "outstanding" as const, economicUnitsPerQuotedShare: 1, priceBasis: "economic-equivalence-proxy" as const },
    ] }));
  // The latest historical inventory ends when the current one becomes active.
  historical.pop();
  args.economicShareEvidence.push(...historical);
  args.enterpriseValuesHistory = dates.map(date => ({ date, stockPrice: 10, priceCurrency: "USD", sourceId: `historic:price:${date}`, marketCapitalization: 1000, enterpriseValue: 1000 }));
  const restored = multiplesFramework("general", args);
  expect(restored.multiples.find(row => row.key === "priceToBook")?.ownHistory?.p50).toBe(12);
  expect(restored.multiples.find(row => row.key === "evToSales")?.ownHistory?.p50).toBe(12);
  expect(restored.multiples.find(row => row.key === "peTtm")?.ownHistory).toBeNull();
  args.quarterlyFundamentals = args.quarterlyFundamentals.map(row => ({ ...row, epsDiluted: 1, epsSecurityBasis: "quoted" }));
  const restoredPe = multiplesFramework("general", args).multiples.find(row => row.key === "peTtm")?.ownHistory;
  expect(restoredPe?.p50).toBe(2.5);
  expect(restoredPe?.basis).toContain("historical quoted price / sum of four quoted-unit diluted EPS observations");
  args.enterpriseValuesHistory = args.enterpriseValuesHistory.map(row => ({ ...row, priceCurrency: "EUR" }));
  expect(multiplesFramework("general", args).multiples.every(row => row.ownHistory === null)).toBe(true);
  args.enterpriseValuesHistory = args.enterpriseValuesHistory.map(row => ({ ...row, priceCurrency: null }));
  expect(multiplesFramework("general", args).multiples.every(row => row.ownHistory === null)).toBe(true);
});

it("does not admit unknown common-income ownership in historical or vendor PE beside signed negative NCI", () => {
  const args = input();
  args.balance!.minorityInterest = -30;
  args.incomeTtm!.netIncomeOwnershipBasis = "parent";
  args.quarterlyFundamentals = dates.map(date => ({ date, revenue: 25, operatingIncome: 5, depreciationAndAmortization: 1, netIncome: 4, operatingCashFlow: 6, capitalExpenditure: -1, totalStockholdersEquity: 100, totalDebt: 0, cashAndShortTermInvestments: 0 }));
  args.enterpriseValuesHistory = dates.map(date => ({ date, marketCapitalization: 1000, enterpriseValue: 1000 }));
  args.keyMetricsHistory = dates.map(date => ({ date, priceToEarningsRatio: 62.5 }));
  const result = multiplesFramework("general", args);
  expect(result.multiples.find(row => row.key === "peTtm")?.ownHistory).toBeNull();
});

it("rejects historical P/FCF windows with outside cash scope without suppressing a later ordinary current ratio", () => {
  const args=input();args.incomeTtm!.date="2027-06-30";args.cashFlowTtm!.date="2027-06-30";args.balance!.date="2027-06-30";
  args.quarterlyFundamentals=dates.map(date=>({date,revenue:25,operatingIncome:5,depreciationAndAmortization:1,netIncome:4,operatingCashFlow:6,capitalExpenditure:-1,totalStockholdersEquity:100,totalEquity:130,minorityInterest:30,totalDebt:0,cashAndShortTermInvestments:0}));
  args.enterpriseValuesHistory=dates.map(date=>({date,marketCapitalization:1000,enterpriseValue:1000}));
  args.keyMetricsHistory=dates.map(date=>({date,priceToFreeCashFlowRatio:50}));
  const result=multiplesFramework("general",args).multiples.find(row=>row.key==="priceToFcf")!;
  expect(result.current).toBe(75);expect(result.ownHistory).toBeNull();expect(result.basis).toContain("historical cash-flow attribution");
  args.quarterlyFundamentals=args.quarterlyFundamentals.map(row=>({...row,minorityInterest:0,totalEquity:100}));
  expect(multiplesFramework("general",args).multiples.find(row=>row.key==="priceToFcf")?.ownHistory?.p50).toBe(50);
});
it("checks every matching current TTM quarter for outside cash ownership, including a divested interest", () => {
  const args=input();args.balance!.minorityInterest=0;
  args.quarterlyFundamentals=dates.map((date,index)=>({date,revenue:25,operatingIncome:5,depreciationAndAmortization:1,netIncome:4,operatingCashFlow:6,capitalExpenditure:-1,totalStockholdersEquity:100,totalEquity:index===1?130:100,minorityInterest:index===1?30:0,totalDebt:0,cashAndShortTermInvestments:0}));
  expect(multiplesFramework("general",args).multiples.find(row=>row.key==="priceToFcf")?.current).toBeNull();
  args.quarterlyFundamentals=args.quarterlyFundamentals.map((row,index)=>({...row,totalEquity:index===5?130:100,minorityInterest:index===5?30:0}));
  expect(multiplesFramework("general",args).multiples.find(row=>row.key==="priceToFcf")?.current).toBe(75);
});

it.each(["preferredStock", "preferredDividendsPaid"] as const)("checks historical and matching current cash quarters for preferred claims (%s)", field => {
  const args=input();args.incomeTtm!.date="2027-06-30";args.cashFlowTtm!.date="2027-06-30";args.balance!.date="2027-06-30";
  args.quarterlyFundamentals=dates.map(date=>({date,revenue:25,operatingIncome:5,depreciationAndAmortization:1,netIncome:4,operatingCashFlow:6,capitalExpenditure:-1,totalStockholdersEquity:100,minorityInterest:0,preferredStock:field==="preferredStock"?10:0,preferredDividendsPaid:field==="preferredDividendsPaid"?-1:0,totalDebt:0,cashAndShortTermInvestments:0}));
  args.enterpriseValuesHistory=dates.map(date=>({date,marketCapitalization:1000,enterpriseValue:1000}));
  args.keyMetricsHistory=dates.map(date=>({date,priceToFreeCashFlowRatio:50}));
  const historical=multiplesFramework("general",args).multiples.find(row=>row.key==="priceToFcf")!;
  expect(historical.current).toBe(75);expect(historical.ownHistory).toBeNull();expect(historical.basis).toContain("preferred claims");
  args.incomeTtm!.date=dates[0];args.cashFlowTtm!.date=dates[0];args.balance!.date=dates[0];
  expect(multiplesFramework("general",args).multiples.find(row=>row.key==="priceToFcf")?.current).toBeNull();
  args.quarterlyFundamentals=args.quarterlyFundamentals.map(row=>({...row,preferredStock:0,preferredDividendsPaid:0}));
  const ordinary=multiplesFramework("general",args).multiples.find(row=>row.key==="priceToFcf")!;
  expect(ordinary.current).toBe(75);expect(ordinary.ownHistory?.p50).toBe(50);
});
