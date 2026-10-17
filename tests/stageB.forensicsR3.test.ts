/**
 * D-68 (NVDA final-report audit, forensics round 3).
 *
 * - Repurchase timing: the final live run printed "Repurchase timing is
 *   unavailable" although NVIDIA tags the shares and cost of every year's
 *   buybacks. The executions were found; the year-average price was not,
 *   because every keyless market-cap day had been withheld (the evening-fetch
 *   basis bug fixed in afbed58). The note blamed the tags.
 * - Forensic context: the accrual growth note said "over the same two years"
 *   of a one-year comparison, and neither the accrual nor the Beneish text
 *   said that goodwill from an acquisition, strategic investments and an
 *   inventory charge carry the NOA growth, AQI and GMI.
 * - Methodology notes are notes, not "low" flags.
 */

import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { computeCapital, type CapitalCashFlowRow, type CapitalIncomeRow, type MarketCapPoint } from "@/pipeline/stageB/capital";
import { repurchaseExecutionsFromFacts } from "@/pipeline/stageB/repurchaseExecutions";
import { computeAccruals, computeBeneish, type ForensicsPeriod } from "@/pipeline/stageB/forensics";
import { eodBasisSession, seriesCountOn, sharePointOnOrBefore, sharesOutstandingSeries } from "@/pipeline/keyless";
import { applyFinancialDiagnostics } from "@/report/financialDiagnostics";
import { ReportSchema } from "@/report/schema";
import type { ComputedMetrics } from "@/pipeline/compute";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { StockSplits } from "@/edgar/splits";

interface TimingFixture {
  companyFacts: CompanyFacts;
  shareBasis: { splits: StockSplits; basisDay: string };
  eodPrices: { fetchedAt: string; closes: [string, number][] };
  cashflowAnnual: { date: string; commonStockRepurchased: number; reportedCurrency: string }[];
  incomeAnnual: { date: string; weightedAverageShsOut: number; weightedAverageShsOutDil: number }[];
}

describe("buyback timing on NVDA's frozen inputs (2026-10-16T04:20Z run)", () => {
  const fx = JSON.parse(fs.readFileSync("fixtures/financial/nvda-buyback-timing-20261016.json", "utf8")) as TimingFixture;
  const income: CapitalIncomeRow[] = fx.incomeAnnual;
  const cashFlow: CapitalCashFlowRow[] = fx.cashflowAnnual.map((r) => ({ date: r.date, commonStockRepurchased: r.commonStockRepurchased }));
  const executions = repurchaseExecutionsFromFacts({
    companyFacts: fx.companyFacts,
    shareBasis: fx.shareBasis,
    fiscalYearEnds: fx.cashflowAnnual.map((r) => r.date),
    reportedCurrency: "USD",
  });
  /** keyless.ts deriveMarketCaps: close × the cover count in force, put on the closes' basis session. */
  const marketCaps = (basisSession: string): MarketCapPoint[] => {
    const series = sharesOutstandingSeries(fx.companyFacts).points;
    return fx.eodPrices.closes.flatMap(([date, close]) => {
      const point = sharePointOnOrBefore(series, date);
      const onBasis = point === null ? null : seriesCountOn(fx.shareBasis.splits, point, basisSession);
      return onBasis === null || "withheld" in onBasis ? [] : [{ date, marketCap: close * onBasis.value }];
    });
  };
  const run = (caps: MarketCapPoint[]) =>
    computeCapital(income, cashFlow, [], caps, { price: 217.23 }, {
      reportedCurrency: "USD", quoteCurrency: "USD", isAdr: false, repurchaseExecutions: executions.rows,
    });

  it("finds the tagged shares and cost of every year's repurchases on the current share basis", () => {
    // NVIDIA tags StockRepurchasedAndRetiredDuringPeriodShares/Value. FY2024's
    // pair is re-tagged post-split in the FY2025 10-K; FY2023's last pair was
    // filed before the 10-for-1 split of June 2024, FY2019's before the 4-for-1
    // of 2021 as well. Nothing is withheld for its share basis.
    expect(executions.notes).toEqual([]);
    expect(executions.rows.map((r) => [r.periodEnd, r.basisFactor])).toEqual([
      ["2026-01-25", 1], ["2025-01-26", 1], ["2024-01-28", 1], ["2023-01-29", 10], ["2019-01-27", 40],
    ]);
  });

  it("measures timing once the closes are dated by their newest session (afbed58)", () => {
    const newest = fx.eodPrices.closes.reduce((d, [date]) => (date > d ? date : d), "");
    const session = eodBasisSession(newest, fx.eodPrices.fetchedAt);
    expect(session).toBe("2026-10-15");
    const caps = marketCaps(session!);
    expect(caps).toHaveLength(fx.eodPrices.closes.length);
    const bb = run(caps).buybackPriceAnalysis;
    // NVDA paid 15.93, 46.41, 109.73 and 143.22 against year averages of
    // 17.95, 39.33, 113.97 and 156.62 (D-61 replay: +5.2%, 100% covered).
    expect(bb.timingCoveragePct).toBeCloseTo(100, 10);
    expect(bb.timingPct!).toBeCloseTo(5.1791, 3);
    expect(bb.years.map((y) => Number(y.actualPricePaid?.toFixed(2)))).toEqual([15.93, 46.41, 109.73, 143.22]);
  });

  it("says the year-average price, not the tags, is missing when the market-cap history is (the live run)", () => {
    // Before afbed58 the closes were dated by the fetch's UTC day, 2026-10-16,
    // which the split list (through 2026-10-15) cannot cover: every day withheld.
    expect(marketCaps("2026-10-16")).toEqual([]);
    const capital = run([]);
    expect(capital.buybackPriceAnalysis.timingPct).toBeNull();
    const note = capital.notes.find((n) => n.startsWith("buyback timing not measured")) ?? "";
    expect(note).toMatch(/tagged repurchase prices were found for 4 of 4 fiscal years/);
    expect(note).toMatch(/no year-average price/);
    expect(note).toMatch(/no market-cap history inside the fiscal window/);
    expect(note).not.toMatch(/no tagged repurchase share count/);
  });
});

/** NVDA FY2026 (10-K filed 2026-02-25) and FY2025, USD, as the frozen run's statements carry them. */
const M = 1_000_000;
const nvdaFy2026: ForensicsPeriod = {
  income: {
    date: "2026-01-25", revenue: 215_938 * M, costOfRevenue: 62_475 * M, grossProfit: 153_463 * M,
    sellingGeneralAndAdministrativeExpenses: 4_579 * M, netIncome: 120_067 * M, netIncomeFromContinuingOperations: 120_067 * M,
    depreciationAndAmortization: 2_843 * M,
    // us-gaap:InventoryWriteDown, FY2026 10-K.
    inventoryWriteDown: 4_000 * M,
  },
  balance: {
    date: "2026-01-25", totalAssets: 206_803 * M, totalCurrentAssets: 125_605 * M, cashAndShortTermInvestments: 62_556 * M,
    accountsReceivables: 38_466 * M, inventory: 21_403 * M, propertyPlantEquipmentNet: 13_250 * M,
    goodwill: 20_832 * M, intangibleAssets: 3_306 * M, longTermInvestments: 22_251 * M,
    totalLiabilities: 49_510 * M, totalCurrentLiabilities: 32_163 * M, totalDebt: 11_412 * M, longTermDebt: 7_469 * M, shortTermDebt: 999 * M,
  },
  cashFlow: {
    date: "2026-01-25", netIncome: 120_067 * M, depreciationAndAmortization: 2_843 * M,
    netCashProvidedByOperatingActivities: 102_718 * M, netCashProvidedByInvestingActivities: -52_228 * M,
    purchasesOfInvestments: -58_118 * M, salesMaturitiesOfInvestments: 26_467 * M, otherInvestingActivities: -13_000 * M,
    acquisitionsNet: -1_535 * M,
    // us-gaap:PaymentsToAcquireBusinessTwoNetOfCashAcquired, which the vendor row carries in other investing.
    acquisitionsInOtherInvesting: -13_000 * M,
  },
};
const nvdaFy2025: ForensicsPeriod = {
  income: {
    date: "2025-01-26", revenue: 130_497 * M, costOfRevenue: 32_639 * M, grossProfit: 97_858 * M,
    sellingGeneralAndAdministrativeExpenses: 3_491 * M, netIncome: 72_880 * M, netIncomeFromContinuingOperations: 72_880 * M,
    depreciationAndAmortization: 1_864 * M, inventoryWriteDown: 1_600 * M,
  },
  balance: {
    date: "2025-01-26", totalAssets: 111_601 * M, totalCurrentAssets: 80_126 * M, cashAndShortTermInvestments: 43_210 * M,
    accountsReceivables: 23_065 * M, inventory: 10_080 * M, propertyPlantEquipmentNet: 8_076 * M,
    goodwill: 5_188 * M, intangibleAssets: 807 * M, longTermInvestments: 3_387 * M,
    totalLiabilities: 32_274 * M, totalCurrentLiabilities: 18_047 * M, totalDebt: 10_270 * M, longTermDebt: 8_463 * M, shortTermDebt: 0,
  },
  cashFlow: {
    date: "2025-01-26", netIncome: 72_880 * M, depreciationAndAmortization: 1_864 * M,
    netCashProvidedByOperatingActivities: 64_089 * M, netCashProvidedByInvestingActivities: -20_421 * M,
  },
};

describe("forensic text names what carries the NOA growth, AQI and GMI", () => {
  it("dates the accrual growth note to its one fiscal year", () => {
    const r = computeAccruals(nvdaFy2026, nvdaFy2025, { currency: "USD" });
    const growth = r.notes.find((n) => n.startsWith("Growth context")) ?? "";
    expect(growth).toMatch(/in the fiscal year ended 2026-01-25, revenue grew 65\.5% and net operating assets 95\.1%/);
    expect(growth).not.toMatch(/two years/);
  });

  it("says how much of the NOA increase is acquired goodwill and intangibles, with the cash paid", () => {
    const r = computeAccruals(nvdaFy2026, nvdaFy2025, { currency: "USD" });
    // ΔNOA 40,898: goodwill +15,644 and intangibles +2,499 = 18,143 (44.4%).
    expect(r.acquiredGoodwillAndIntangibles).toBe(18_143 * M);
    expect(r.acquisitionCashPaid).toBe(14_535 * M);
    const note = r.notes.find((n) => n.startsWith("Acquisitions in the fiscal year")) ?? "";
    expect(note).toMatch(/goodwill rose from USD 5\.19 billion to USD 20\.83 billion/);
    expect(note).toMatch(/USD 14\.54 billion paid for acquisitions, net of cash acquired/);
    expect(note).toMatch(/added goodwill and intangibles, USD 18\.14 billion, are 44% of the USD 40\.90 billion increase in net operating assets/);
    // The rest is named: receivables, inventory, PP&E and operating liabilities.
    const composition = r.notes.find((n) => n.startsWith("Net operating assets rose")) ?? "";
    expect(composition).toMatch(/receivables \+USD 15\.40 billion, inventory \+USD 11\.32 billion/);
    expect(composition).toMatch(/operating liabilities rose USD 16\.09 billion/);
    // No acquisition, no acquisition note.
    const organic = (p: ForensicsPeriod): ForensicsPeriod => ({
      ...p,
      balance: { ...p.balance!, goodwill: 5_188 * M, intangibleAssets: 807 * M },
      cashFlow: { ...p.cashFlow!, acquisitionsNet: null, acquisitionsInOtherInvesting: null },
    });
    expect(computeAccruals(organic(nvdaFy2026), nvdaFy2025).notes.some((n) => n.startsWith("Acquisitions"))).toBe(false);
  });

  it("decomposes AQI into goodwill, intangibles and long-term investments, and GMI with the inventory write-downs", () => {
    const b = computeBeneish(nvdaFy2026, nvdaFy2025, { currency: "USD" });
    expect(b.indices.aqi!).toBeCloseTo(1.567, 3);
    // Soft assets 23,399 (21.0% of TA) → 67,948 (32.9%); without goodwill,
    // intangibles and long-term investments 14,017 (12.6%) → 21,559 (10.4%).
    expect(b.aqiWithoutAcquiredAndInvestments!).toBeCloseTo((21_559 / 206_803) / (14_017 / 111_601), 10);
    expect(b.aqiContext).toMatch(/goodwill from USD 5\.19 billion to USD 20\.83 billion/);
    expect(b.aqiContext).toMatch(/long-term investments from USD 3\.39 billion to USD 22\.25 billion/);
    expect(b.aqiContext).toMatch(/the index is 0\.83/);
    // Gross margin 74.99% → 71.07%; with write-downs added back 76.21% → 72.92%.
    expect(b.gmiWithoutWriteDowns!).toBeCloseTo((99_458 / 130_497) / (157_463 / 215_938), 10);
    expect(b.gmiContext).toMatch(/gross margin fell from 75\.0% .* to 71\.1%/);
    expect(b.gmiContext).toMatch(/USD 4\.00 billion \(1\.9% of revenue\) against USD 1\.60 billion \(1\.2%\)/);
    expect(b.gmiContext).toMatch(/0\.6pp of the 3\.9pp decline/);
    expect(b.notes).toContain(b.aqiContext);
    expect(b.notes).toContain(b.gmiContext);
  });
});

describe("methodology notes are notes, not flags", () => {
  it("moves the accrual definition, bands and growth context out of the flags list", () => {
    const report = ReportSchema.parse(JSON.parse(fs.readFileSync("fixtures/report/DEMO-sample.json", "utf8")));
    const accruals = computeAccruals(nvdaFy2026, nvdaFy2025, { currency: "USD" });
    const beneish = computeBeneish(nvdaFy2026, nvdaFy2025, { currency: "USD" });
    const flagsBefore = report.quality.flags.length;
    const out = applyFinancialDiagnostics(report, { forensics: { accruals, beneish } } as unknown as ComputedMetrics);
    expect(out.quality.flags).toHaveLength(flagsBefore);
    expect(out.quality.flags.some((f) => f.source === "computed.forensics.accruals")).toBe(false);
    const notes = out.quality.notes ?? [];
    expect(notes.some((n) => /^Accruals are financial-asset-adjusted/.test(n))).toBe(true);
    expect(notes.some((n) => /^House-rule bands/.test(n))).toBe(true);
    expect(notes.some((n) => /^Acquisitions in the fiscal year/.test(n))).toBe(true);
    expect(notes).toContain(beneish.aqiContext);
    expect(ReportSchema.safeParse(out).success).toBe(true);
  });
});
