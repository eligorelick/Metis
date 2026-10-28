/** AI-410: the capex/D&A average names how many years it averaged. */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import type { ValidationReport } from "@/pipeline/stageA/validate";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;

type CashRow = Record<string, unknown> & { date: string };
const cashRows = (bundle: ReturnType<typeof completeCurrencyBundle>) =>
  (bundle.statements.cashflowAnnual as { value: { data: { rows: CashRow[] } } }).value.data.rows;

function labelled(bundle: ReturnType<typeof completeCurrencyBundle>) {
  const computed = runStageB(bundle);
  const report = buildDataOnlyReport({
    symbol: bundle.symbol, companyName: "Test General Co", generatedAt: "2026-07-06T12:00:00.000Z", model: "none", costUsd: 0,
    bundle, validation: EMPTY_VALIDATION, computed, costBreakdown: [], reason: "no analysis",
  });
  const avg = report.balanceSheet.capexTrajectory.numbers.find((n) => n.period?.startsWith("capex / D&A,") && n.period.endsWith("average"));
  return { computed, avg };
}

describe("capex/D&A average span (AI-410)", () => {
  it("counts and labels the years the capex/D&A average covers (short window)", () => {
    const { computed, avg } = labelled(completeCurrencyBundle({}));
    expect(computed.capital.maintenanceVsGrowthCapex).toMatchObject({ capexToDA5yAvg: expect.closeTo(0.839815, 5), capexToDAAvgYears: 3 });
    expect(avg).toMatchObject({ value: expect.closeTo(0.839815, 5), period: "capex / D&A, 3y average" });
  });

  it("keeps the five-year label when five years are averaged (full window)", () => {
    const bundle = completeCurrencyBundle({});
    const cash = cashRows(bundle);
    cash.push({ ...cash[2], date: "2022-12-31", capitalExpenditure: -30e6, depreciationAndAmortization: 35e6 },
              { ...cash[2], date: "2021-12-31", capitalExpenditure: -28e6, depreciationAndAmortization: 30e6 });
    const { computed, avg } = labelled(bundle);
    expect(computed.capital.maintenanceVsGrowthCapex.capexToDAAvgYears).toBe(5);
    expect(avg?.period).toBe("capex / D&A, 5y average");
  });

  it("counts the values averaged, not the calendar span, when spacing is irregular or a year has no D&A", () => {
    const bundle = completeCurrencyBundle({});
    const cash = cashRows(bundle);
    // Fourth year dated six years before the newest (a gap), with no D&A so it yields no ratio: three values remain.
    cash.push({ ...cash[2], date: "2019-12-31", capitalExpenditure: -30e6, depreciationAndAmortization: null });
    const gap = labelled(bundle);
    expect(gap.computed.capital.maintenanceVsGrowthCapex).toMatchObject({ capexToDA5yAvg: expect.closeTo(0.839815, 5), capexToDAAvgYears: 3 });
    expect(gap.avg?.period).toBe("capex / D&A, 3y average");
    // The same gap year with D&A present is a fourth averaged value, whatever the dates span.
    const bundle2 = completeCurrencyBundle({});
    const cash2 = cashRows(bundle2);
    cash2.push({ ...cash2[2], date: "2019-12-31", capitalExpenditure: -30e6, depreciationAndAmortization: 35e6 });
    const dated = labelled(bundle2);
    expect(dated.computed.capital.maintenanceVsGrowthCapex.capexToDAAvgYears).toBe(4);
    expect(dated.avg?.period).toBe("capex / D&A, 4y average");
  });

  it("gives no count and no average figure when no year has a ratio", () => {
    const bundle = completeCurrencyBundle({});
    for (const r of cashRows(bundle)) r.depreciationAndAmortization = null;
    const { computed, avg } = labelled(bundle);
    expect(computed.capital.maintenanceVsGrowthCapex).toMatchObject({ capexToDA5yAvg: null, capexToDAAvgYears: null });
    expect(avg).toBeUndefined();
  });
});
