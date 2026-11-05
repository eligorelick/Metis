import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { assembleReport } from "@/pipeline/stageC/passes";
import { fundamentalsChartDataFromBundle } from "@/components/charts/map";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { buildMarketData } from "@/pipeline/marketData";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

function fixture() {
  const b = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  if (!b.statements.balanceQuarterly.ok || !b.statements.incomeQuarterly.ok || !b.statements.cashflowQuarterly.ok) throw new Error("fixture");
  for (const row of b.statements.incomeQuarterly.value.data.rows) Object.assign(row, { fiscalYear: String(row.date).slice(0, 4), period: `Q${Math.ceil(Number(String(row.date).slice(5, 7)) / 3)}` });
  for (const row of b.statements.balanceQuarterly.value.data.rows) Object.assign(row, { netReceivables: 200 * M, inventory: 100 * M, propertyPlantEquipmentNet: 1000 * M, longTermInvestments: 200 * M });
  Object.assign(b.statements.balanceQuarterly.value.data.rows[0]!, { netReceivables: 0, inventory: 0, propertyPlantEquipmentNet: 0, longTermInvestments: 0, cashAndCashEquivalents: 0, otherAssets: 1980 * M });
  Object.assign(b.statements.incomeQuarterly.value.data.rows[1]!, { costOfRevenue: 150 * M, grossProfit: 90 * M, operatingIncome: 48 * M });
  Object.assign(b.statements.cashflowQuarterly.value.data.rows[1]!, { operatingCashFlow: 55 * M, netCashProvidedByInvestingActivities: -10 * M, netCashProvidedByFinancingActivities: 20 * M });
  Object.assign(b.statements.cashflowQuarterly.value.data.rows[0]!, { operatingCashFlow: 0, netCashProvidedByInvestingActivities: 0, netCashProvidedByFinancingActivities: 0, freeCashFlow: 0 });
  b.enterpriseValues = { ok: true, value: { ...b.statements.balanceQuarterly.value, data: { raw: [], rows: [{ date: "2026-03-31", enterpriseValue: 10_400 * M, marketCapitalization: 10_000 * M, addTotalDebt: 400 * M, minusCashAndCashEquivalents: 0 }] } } };
  return b;
}

function reports(b: ReturnType<typeof fixture>) {
  const computed = runStageB(b);
  const full = assembleReport({ symbol: b.symbol, bundle: b, computed, judgeOutput: loadTask28Fixture(), model: "synthetic-test", costEntries: [], verify: { verificationRate: null, log: [] } }, b.builtAt);
  const dataOnly = buildDataOnlyReport({ symbol: b.symbol, companyName: "Synthetic", generatedAt: b.builtAt, model: "none", costUsd: 0, bundle: b, computed, validation: { checks: [], flags: [], gaps: [] }, costBreakdown: [], reason: "offline regression" });
  return [full, dataOnly];
}

describe("admitted statements on reader surfaces", () => {
  it("admits rows when filing disclosures are built directly from the raw bundle", () => {
    expect(buildFilingDisclosures(fixture())?.quarterlyTrend[0]).toMatchObject({ operatingCashFlow: null, freeCashFlow: null });
  });

  it("excludes dependent provider EV when market data is built directly from the raw bundle", () => {
    expect(buildMarketData(fixture())?.enterpriseValue?.periodEnd).not.toBe("2026-03-31");
  });

  it("dates the observation rail from admitted statement rows", () => {
    const b = fixture();
    b.asOf = { ...b.asOf, "statements.balanceQuarterly": "2026-03-31", "statements.cashflowQuarterly": "2026-03-31" };
    for (const report of reports(b)) {
      expect(report.meta.asOfMap["statements.balanceQuarterly"]).toBe("2025-12-31");
      expect(report.meta.asOfMap["statements.cashflowQuarterly"]).toBe("2025-12-31");
    }
  });
  it("publishes missing cash flow rather than zeros in both quarterly report tables", () => {
    for (const report of reports(fixture())) {
      expect(report.filingDisclosures?.quarterlyTrend[0]).toMatchObject({ periodEnd: "2026-03-31", operatingCashFlow: null, freeCashFlow: null });
      expect(report.marketData?.enterpriseValue?.periodEnd).not.toBe("2026-03-31");
    }
  });

  it("omits a rejected income row from the report's quarterly table", () => {
    const b = fixture();
    if (!b.statements.incomeQuarterly.ok) throw new Error("fixture");
    b.statements.incomeQuarterly.value.asOf = "2026-03-31";
    Object.assign(b.statements.incomeQuarterly.value.data.rows[0]!, { costOfRevenue: 0, grossProfit: 0, operatingIncome: 0, epsDiluted: 0, weightedAverageShsOutDil: 0 });
    for (const report of reports(b)) {
      expect(report.filingDisclosures?.quarterlyTrend[0]?.periodEnd).toBe("2025-12-31");
      expect(report.sourceFactSummary?.status, report.sourceFactSummary?.reason ?? "missing summary").toBe("available");
      expect(report.sourceFactSummary?.rows.every(row => row.period === "2025-12-31" && row.asOf === row.period)).toBe(true);
    }
  });

  it("keeps an annual cash-flow skeleton out of chart datasets", () => {
    const b = fixture();
    if (!b.statements.cashflowAnnual.ok) throw new Error("fixture");
    const rows = b.statements.cashflowAnnual.value.data.rows;
    Object.assign(rows[1]!, { operatingCashFlow: 50 * M, netCashProvidedByInvestingActivities: -10 * M, netCashProvidedByFinancingActivities: 20 * M });
    Object.assign(rows[0]!, { operatingCashFlow: 0, netCashProvidedByInvestingActivities: 0, netCashProvidedByFinancingActivities: 0, freeCashFlow: 0 });
    expect(fundamentalsChartDataFromBundle(b, runStageB(b)).fcf.some(row => row.period === rows[0]?.date)).toBe(false);
  });
});
