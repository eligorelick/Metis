/**
 * D-61 (NVDA report #34 audit, WP5): forensic and grading signals that
 * measured the wrong thing.
 *
 * - Accruals: Richardson, Sloan, Soliman & Tuna (2005) treat short- and
 *   long-term investments as financial assets, outside net operating assets.
 *   NVDA's FY2026 investing cash flow (−$52.2B) was mostly purchases of
 *   marketable and strategic equity securities, which the old broad measure
 *   counted as accruals (0.91, "red").
 * - Beneish: the sales-growth index is a pressure proxy, not a fault; a flag
 *   that only SGI puts over the threshold is disclosed and graded without it.
 * - Buybacks: timing is the price actually paid against the same fiscal
 *   year's average price, not the price appreciation since.
 * - Piotroski and Beneish decompositions reach the rendered forensic table.
 */

import { describe, expect, it } from "vitest";

import { computeAccruals, computeBeneish, type ForensicsPeriod } from "@/pipeline/stageB/forensics";
import { computeCapital, type CapitalCashFlowRow, type CapitalIncomeRow } from "@/pipeline/stageB/capital";
import { repurchaseExecutionsFromFacts } from "@/pipeline/stageB/repurchaseExecutions";
import { applyForensicScores } from "@/pipeline/stageC/passes";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { StockSplits } from "@/edgar/splits";
import type { ComputedMetrics } from "@/pipeline/compute";
import type { JudgeOutput } from "@/report/schema";

/** NVDA FY2026 (10-K filed 2026-02-25) and FY2025 operands, USD millions, as FMP serves them. */
const nvdaCurrent: ForensicsPeriod = {
  income: { date: "2026-01-25", revenue: 215_938, netIncome: 120_067 },
  balance: {
    date: "2026-01-25",
    totalAssets: 206_803,
    cashAndShortTermInvestments: 62_556,
    longTermInvestments: 22_251,
    totalLiabilities: 49_510,
    totalDebt: 11_412,
  },
  cashFlow: {
    date: "2026-01-25",
    netIncome: 120_067,
    netCashProvidedByOperatingActivities: 102_718,
    netCashProvidedByInvestingActivities: -52_228,
    // XBRL: PaymentsToAcquireAvailableForSaleSecuritiesDebt 40,616 +
    // PaymentsToAcquireEquitySecuritiesFvNi 17,502.
    purchasesOfInvestments: -58_118,
    salesMaturitiesOfInvestments: 26_467,
    // XBRL: PaymentsToAcquireBusinessTwoNetOfCashAcquired — an acquisition.
    otherInvestingActivities: -13_000,
  },
};
const nvdaPrior: ForensicsPeriod = {
  income: { date: "2025-01-26", revenue: 130_497 },
  balance: {
    date: "2025-01-26",
    totalAssets: 111_601,
    cashAndShortTermInvestments: 43_210,
    longTermInvestments: 3_387,
    totalLiabilities: 32_274,
    totalDebt: 10_270,
  },
};

describe("accruals: Richardson et al. (2005) financial-asset adjustment", () => {
  it("removes investment purchases, sales and maturities from CFI and long-term investments from NOA", () => {
    const r = computeAccruals(nvdaCurrent, nvdaPrior);
    expect(r.definition).toBe("financial-asset-adjusted");
    expect(r.financialAssetCashFlow).toBe(-31_651);
    expect(r.operatingInvestingCashFlow).toBe(-20_577);
    // NOA_t = 206,803 − 62,556 − 22,251 − (49,510 − 11,412) = 83,898
    expect(r.noaCurrent).toBe(83_898);
    expect(r.noaPrior).toBe(43_000);
    // 120,067 − 102,718 − (−20,577): capex, acquisitions and the unclassified
    // other investing flow stay operating investment.
    expect(r.aggregateAccrualsCashFlow).toBe(37_926);
    expect(r.cashFlowAccrualRatio!).toBeCloseTo(37_926 / 63_449, 12);
    expect(r.investingCashFlow).toBe(-52_228);
    // The financial-asset noise was the cash-flow vs balance-sheet divergence.
    expect(Math.abs(r.cashFlowAccrualRatio! - r.balanceSheetAccrualRatio!)).toBeLessThan(0.1);
    expect(r.notes.join(" ")).toMatch(/Richardson/);
    // A fast grower's accruals are mostly NOA growth: said, not graded.
    expect(r.revenueGrowthPct!).toBeCloseTo((215_938 / 130_497 - 1) * 100, 10);
    expect(r.notes.join(" ")).toMatch(/Fairfield/);
  });

  it("falls back to operating accruals (NI − CFO) when the investment components are not reported, and says so", () => {
    const { purchasesOfInvestments: _p, salesMaturitiesOfInvestments: _s, ...cashFlow } = nvdaCurrent.cashFlow!;
    void _p; void _s;
    const r = computeAccruals({ ...nvdaCurrent, cashFlow }, nvdaPrior);
    expect(r.definition).toBe("operating");
    expect(r.aggregateAccrualsCashFlow).toBe(120_067 - 102_718);
    expect(r.notes.join(" ")).toMatch(/operating accruals \(NI − CFO\)/);
  });
});

describe("Beneish: a flag that only sales growth produces", () => {
  /** Every ratio index 1.0 and TATA 0 except sales, which doubles. */
  const year = (scale: number, date: string): ForensicsPeriod => ({
    income: {
      date, revenue: 1000 * scale, costOfRevenue: 500 * scale, grossProfit: 500 * scale,
      sellingGeneralAndAdministrativeExpenses: 100 * scale, netIncome: 100 * scale,
    },
    balance: {
      date, totalAssets: 2000 * scale, totalCurrentAssets: 1000 * scale, propertyPlantEquipmentNet: 500 * scale,
      accountsReceivables: 100 * scale, longTermDebt: 200 * scale, totalCurrentLiabilities: 300 * scale,
    },
    cashFlow: { date, netIncome: 100 * scale, netCashProvidedByOperatingActivities: 100 * scale, depreciationAndAmortization: 50 * scale },
  });

  it("is marked growth-led and carries the SGI-neutral M", () => {
    const r = computeBeneish(year(2, "2025-12-31"), year(1, "2024-12-31"), { revenueFloor: 0 });
    expect(r.indices.sgi).toBeCloseTo(2, 12);
    expect(r.verdict).toBe("flag");
    expect(r.sgiNeutralScore!).toBeCloseTo(r.score! - 0.892, 12);
    expect(r.growthLed).toBe(true);
    expect(r.notes.join(" ")).toMatch(/sales-growth index alone/i);
  });
});

describe("buyback timing: the price actually paid against the same year's average price", () => {
  const income: CapitalIncomeRow[] = [
    { date: "2025-12-31", revenue: 200, netIncome: 100, weightedAverageShsOut: 100, weightedAverageShsOutDil: 100 },
    { date: "2024-12-31", revenue: 180, netIncome: 90, weightedAverageShsOut: 100, weightedAverageShsOutDil: 100 },
  ];
  const cashFlow: CapitalCashFlowRow[] = [
    { date: "2025-12-31", netIncome: 100, operatingCashFlow: 110, capitalExpenditure: -30, commonStockRepurchased: -100 },
    { date: "2024-12-31", netIncome: 90, operatingCashFlow: 100, capitalExpenditure: -30, commonStockRepurchased: -50 },
  ];
  // Year average prices 10 (2025) and 16 (2024).
  const caps = [{ date: "2025-06-30", marketCap: 1000 }, { date: "2024-06-30", marketCap: 1600 }];
  const execution = (periodEnd: string, shares: number, value: number) => ({
    periodEnd, shares, value, sharesTag: "StockRepurchasedDuringPeriodShares", valueTag: "StockRepurchasedDuringPeriodValue",
    filed: "2026-02-20", accn: "0000000000-26-000001", basisFactor: 1,
  });

  it("scores savings against each year's average price, not appreciation to today's quote", () => {
    const r = computeCapital(income, cashFlow, [], caps, { price: 40 }, {
      reportedCurrency: "USD", quoteCurrency: "USD",
      repurchaseExecutions: [execution("2025-12-31", 11, 100), execution("2024-12-31", 3, 50)],
    });
    const bb = r.buybackPriceAnalysis;
    // 2025: paid 100/11 = 9.09 against 10; 2024: 50/3 = 16.67 against 16.
    // Same shares at each year's average: 11·10 + 3·16 = 158 for 150 spent.
    expect(bb.timingPct!).toBeCloseTo((158 / 150 - 1) * 100, 10);
    expect(bb.timingCoveragePct!).toBeCloseTo(100, 10);
    expect(bb.years.find((y) => y.date === "2025-12-31")?.actualPricePaid).toBeCloseTo(100 / 11, 10);
    // Appreciation to today's price is still shown, under its own name.
    expect(bb.premiumDiscountPct).not.toBeNull();
  });

  it("withholds a year whose paid price is implausibly far from the year's average (split basis) and without executions", () => {
    const off = computeCapital(income, cashFlow, [], caps, { price: 40 }, {
      reportedCurrency: "USD", quoteCurrency: "USD",
      repurchaseExecutions: [execution("2025-12-31", 1, 100)],
    }).buybackPriceAnalysis;
    expect(off.timingPct).toBeNull();
    expect(off.years.find((y) => y.date === "2025-12-31")?.note).toMatch(/basis/);
    const none = computeCapital(income, cashFlow, [], caps, { price: 40 }, { reportedCurrency: "USD", quoteCurrency: "USD" });
    expect(none.buybackPriceAnalysis.timingPct).toBeNull();
  });
});

describe("repurchase executions from companyfacts", () => {
  const point = (start: string, end: string, val: number, filed: string, accn: string) => ({ start, end, val, filed, accn, form: "10-K", fy: 0, fp: "FY" });
  const facts: CompanyFacts = {
    cik: 1045810,
    entityName: "NVIDIA",
    facts: {
      "us-gaap": {
        StockRepurchasedAndRetiredDuringPeriodShares: { units: { shares: [
          // FY2023 as filed before the 10-for-1 split of June 2024.
          point("2022-01-31", "2023-01-29", 63_000_000, "2023-02-24", "a-23"),
          point("2025-01-27", "2026-01-25", 282_000_000, "2026-02-25", "a-26"),
        ] } },
        StockRepurchasedAndRetiredDuringPeriodValue: { units: { USD: [
          point("2022-01-31", "2023-01-29", 10_039_000_000, "2023-02-24", "a-23"),
          // A later 10-K re-tags the cost but not the count (NVDA's FY2025
          // 10-K does): the pair still comes from the one filing tagging both.
          point("2022-01-31", "2023-01-29", 10_039_000_000, "2025-02-26", "a-25"),
          point("2025-01-27", "2026-01-25", 40_388_000_000, "2026-02-25", "a-26"),
        ] } },
      },
    },
  };
  const splits: StockSplits = {
    asOf: "2026-10-15",
    vendor: { status: "retrieved", source: "fmp" },
    coverage: [{ from: "1999-01-01", to: "2026-10-15" }],
    events: [{
      date: "2024-06-10", ratio: 10, tagged: 10, evidence: null, contextDates: [], announced: null,
      firstAdjustedSession: "2024-06-10", sessionWindow: { from: "2024-06-10", to: "2024-06-10" },
      legalFrom: "2024-06-07", sources: ["vendor"],
    }],
    unresolved: [],
    notes: [],
  };

  it("puts each fiscal year's repurchased shares on the current share basis", () => {
    const r = repurchaseExecutionsFromFacts({
      companyFacts: facts,
      shareBasis: { splits, basisDay: "2026-10-15" },
      fiscalYearEnds: ["2026-01-25", "2025-01-26", "2023-01-29"],
      reportedCurrency: "USD",
    });
    expect(r.rows.map((row) => [row.periodEnd, row.shares, row.value])).toEqual([
      ["2026-01-25", 282_000_000, 40_388_000_000],
      ["2023-01-29", 630_000_000, 10_039_000_000],
    ]);
    const unresolved = repurchaseExecutionsFromFacts({
      companyFacts: facts, shareBasis: null, fiscalYearEnds: ["2026-01-25"], reportedCurrency: "USD",
    });
    expect(unresolved.rows).toEqual([]);
    expect(unresolved.notes.join(" ")).toMatch(/split basis/);
  });
});

describe("the rendered forensic table carries the decompositions", () => {
  it("names every Beneish index, the growth-led reading and the failed Piotroski signals", () => {
    const quality = {
      graded: {},
      flags: [],
      forensicScores: {
        altman: { variant: "x", score: null, zone: null },
        beneish: { variant: "x", score: null, zone: null },
        piotroski: { variant: "x", score: null, zone: null },
        accruals: { variant: "x", score: null, zone: null },
      },
    } as unknown as JudgeOutput["quality"];
    const pass = (value: 0 | 1) => ({ value, detail: "" });
    const forensics = {
      altmanSelection: { variant: "original", notes: [] },
      altman: null,
      beneish: {
        score: -1.5, verdict: "flag", sgiNeutralScore: -2.39, growthLed: true,
        indices: { dsri: 1.01, gmi: 1.06, aqi: 1.57, sgi: 2, depi: 1.06, sgai: 0.79, tata: 0.084, lvgi: 0.81 },
        tataBalanceSheet: null, neutralized: [], clamped: [], notes: [], gaps: [], asOf: { current: "2025-12-31", prior: "2024-12-31" },
      },
      piotroski: {
        score: 4, outOf: 9, variant: "standard", label: "Piotroski F (9 signals)", notes: [], gaps: [],
        asOf: { current: null, prior: null, prior2: null },
        signals: {
          roaPositive: pass(1), cfoPositive: pass(1), roaImproved: pass(0), accrualQuality: pass(0), leverageDown: pass(1),
          liquidityUp: pass(0), noEquityIssuance: pass(1), marginUp: pass(0), turnoverUp: pass(0),
        },
      },
      accruals: null,
      flags: [], notes: [], gaps: [],
    } as unknown as ComputedMetrics["forensics"];
    const out = applyForensicScores(quality, forensics).forensicScores;
    for (const index of ["DSRI 1.01", "GMI 1.06", "AQI 1.57", "SGI 2.00", "DEPI 1.06", "SGAI 0.79", "TATA 0.084", "LVGI 0.81"]) {
      expect(out.beneish.variant).toContain(index);
    }
    expect(out.beneish.zone).toMatch(/growth-led/);
    expect(out.piotroski.zone).toMatch(/^4\/9/);
    expect(out.piotroski.zone).toMatch(/failed: .*ΔROA.*CFO > net income.*current ratio.*gross margin.*asset turnover/);
  });
});
