import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { validateBundle } from "@/pipeline/stageA/validate";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const scope = { cik: "0000000001", reportedCurrency: "USD", calendarYear: "2025", fiscalYear: "2025", period: "FY", filingDate: "2026-02-01",
  finalLink: "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/annual.htm" };

function fixture(bank = false) {
  const bundle = completeCurrencyBundle({ bank, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  bundle.edgar.companyFacts = { ok: false, gap: { field: "edgar.companyFacts", reason: "No facts in this annual adapter fixture", severity: "info" } };
  return bundle;
}

function annualBalance() {
  const bundle = fixture(true);
  if (!bundle.statements.balanceAnnual.ok) throw new Error("balance fixture missing");
  const template = { ...bundle.statements.balanceAnnual.value.data.rows[0], ...scope, goodwill: 0, intangibleAssets: 0, preferredStock: 0 };
  const stale = { ...template, date: "2025-12-31", acceptedDate: "2026-02-01 15:00:00", totalAssets: 2000e6, totalStockholdersEquity: 500e6, totalEquity: 500e6 };
  const latest = { ...template, date: "2025-12-28", acceptedDate: "2026-02-01 16:00:00", totalAssets: 1000e6, totalStockholdersEquity: 800e6, totalEquity: 800e6 };
  return { bundle, target: bundle.statements.balanceAnnual.value.data, stale, latest };
}

describe("annual fiscal identity survives Stage B adapters", () => {
  it("keeps the already normalized projection history consistent with the admitted income rows", () => {
    const bundle = fixture();
    if (!bundle.statements.incomeAnnual.ok) throw new Error("income fixture missing");
    const rows = bundle.statements.incomeAnnual.value.data.rows;
    const latest = { ...rows[0], ...scope, date: "2025-12-28", acceptedDate: "2026-02-01 16:00:00", revenue: 1200e6 };
    const superseded = { ...latest, date: "2025-12-31", acceptedDate: "2026-02-01 15:00:00", revenue: 1000e6 };
    // Hold the DCF's annual anchor fixed while checking the history adapter.
    bundle.statements.incomeAnnual.value.data.rows = [latest, superseded, ...rows.slice(1)];
    const alias = runStageB(bundle).projections;
    bundle.statements.incomeAnnual.value.data.rows = [latest, ...rows.slice(1)];
    const clean = runStageB(bundle).projections;
    expect(clean.series.length).toBeGreaterThan(0);
    expect(alias).toEqual(clean);
  });
  it.each(["aliases", "reversed", "one period", "exact-date restatement"])("uses the later accepted leverage observation: %s", mode => {
    const { bundle, target, stale, latest } = annualBalance();
    target.rows = mode === "one period" ? [latest] : mode === "reversed" ? [latest, stale]
      : mode === "exact-date restatement" ? [{ ...stale, date: latest.date }, latest] : [stale, latest];
    const before = JSON.stringify(bundle);
    const computed = runStageB(bundle, { evIncludeLeases: false });
    expect(computed.financialMetrics.metrics.find(m => m.key === "tangibleLeverage")).toMatchObject({ value: 80, asOf: "2025-12-28", withheldReason: null });
    expect(computed.scores.aspects.balanceSheet.drivers.some(d => d.value === 25)).toBe(false);
    expect(JSON.stringify(bundle)).toBe(before);
  });

  it.each([
    { cik: "2" }, { fiscalYear: "2024", calendarYear: "2024" }, { period: "Q4" },
    { filingDate: "2026-02-02" }, { accessionNumber: "0000000001-26-000099" },
    { finalLink: "https://www.sec.gov/Archives/edgar/data/1/000000000126000099/annual.htm" },
  ])("does not merge nearby rows with incompatible scope %j", change => {
    const { bundle, target, stale, latest } = annualBalance();
    target.rows = [{ ...stale, ...change }, latest];
    expect(runStageB(bundle).financialMetrics.metrics.find(m => m.key === "tangibleLeverage")).toMatchObject({ value: 25, asOf: "2025-12-31" });
  });

  it("keeps currency refusal rather than merging a nearby foreign-currency row", () => {
    const { bundle, target, stale, latest } = annualBalance();
    target.rows = [stale, { ...latest, reportedCurrency: "EUR" }];
    const computed = runStageB(bundle);
    expect(computed.financialMetrics.metrics.find(m => m.key === "tangibleLeverage")?.value).toBe(25);
    expect(computed.gaps.some(g => /currency/i.test(g.reason))).toBe(true);
  });

  it("withholds tied annual aliases and carries the ambiguity into the manifest", () => {
    const { bundle, target, stale, latest } = annualBalance();
    target.rows = [stale, { ...latest, acceptedDate: stale.acceptedDate }];
    const computed = runStageB(bundle);
    expect(computed.financialMetrics.metrics.find(m => m.key === "tangibleLeverage")?.value).toBeNull();
    expect(computed.financialMetrics.gaps.some(g => /ambiguous/.test(g.reason))).toBe(true);
  });

  it("preserves field-source recency refusals instead of selecting a mixed restatement", () => {
    const { bundle, target, stale, latest } = annualBalance();
    target.rows = [stale, { ...latest, fieldProvenance: { totalAssets: {
      source: "edgar", unit: "USD", periodStart: null, periodEnd: latest.date, observedAt: bundle.builtAt,
      tags: ["us-gaap/Assets"], filings: [{ filed: "2026-03-01", accn: "0000000001-26-000099", form: "10-K/A" }],
    } } }];
    const computed = runStageB(bundle);
    expect(computed.financialMetrics.metrics.find(m => m.key === "tangibleLeverage")?.value).toBeNull();
    expect(computed.financialMetrics.gaps.some(g => /value.*source|restat/i.test(g.reason))).toBe(true);
  });

  it("selects the matching annual income alias for financial ratios", () => {
    const { bundle, target, latest } = annualBalance();
    if (!bundle.statements.incomeAnnual.ok) throw new Error("income fixture missing");
    target.rows = [latest, { ...latest, date: "2024-12-29", totalAssets: 1000e6 }];
    const income = { ...bundle.statements.incomeAnnual.value.data.rows[0], ...scope };
    bundle.statements.incomeAnnual.value.data.rows = [
      { ...income, date: "2025-12-31", acceptedDate: "2026-02-01 15:00:00", netInterestIncome: 10e6 },
      { ...income, date: "2025-12-28", acceptedDate: "2026-02-01 16:00:00", netInterestIncome: 40e6 },
    ];
    expect(runStageB(bundle).financialMetrics.metrics.find(m => m.key === "niiToAverageAssets")).toMatchObject({ value: 4, asOf: "2025-12-28" });
  });

  it.each([false, true])("normalizes income and cash-flow growth before projection (reverse=%s)", reverse => {
    const bundle = fixture();
    if (!bundle.statements.incomeAnnual.ok || !bundle.statements.cashflowAnnual.ok) throw new Error("annual fixture missing");
    const income = { ...bundle.statements.incomeAnnual.value.data.rows[0], ...scope };
    const cash = { ...bundle.statements.cashflowAnnual.value.data.rows[0], ...scope };
    const prior = { date: "2024-12-29", fiscalYear: "2024", calendarYear: "2024", filingDate: "2025-02-01", acceptedDate: "2025-02-01 16:00:00" };
    bundle.statements.incomeAnnual.value.data.rows = [
      { ...income, date: "2025-12-31", acceptedDate: "2026-02-01 15:00:00", revenue: 1000e6 },
      { ...income, date: "2025-12-28", acceptedDate: "2026-02-01 16:00:00", revenue: 1200e6 },
      { ...income, ...prior, revenue: 1000e6 },
    ];
    bundle.statements.cashflowAnnual.value.data.rows = [
      { ...cash, date: "2025-12-31", acceptedDate: "2026-02-01 15:00:00", freeCashFlow: 100e6, operatingCashFlow: 140e6, capitalExpenditure: -40e6 },
      { ...cash, date: "2025-12-28", acceptedDate: "2026-02-01 16:00:00", freeCashFlow: 120e6, operatingCashFlow: 160e6, capitalExpenditure: -40e6 },
      { ...cash, ...prior, freeCashFlow: 100e6, operatingCashFlow: 140e6, capitalExpenditure: -40e6 },
    ];
    if (reverse) { bundle.statements.incomeAnnual.value.data.rows.reverse(); bundle.statements.cashflowAnnual.value.data.rows.reverse(); }
    const before = JSON.stringify(bundle);
    const validation = validateBundle(bundle, { now: new Date(bundle.builtAt) });
    const computed = runStageB(bundle, { evIncludeLeases: false }, validation);
    for (const series of [computed.growth.revenueCagrs, computed.growth.fcfCagrs]) {
      const point = series.find(p => p.windowYears === 1)!;
      expect.soft(point.cagrPct).toBeCloseTo(20);
      expect.soft(point).toMatchObject({ actualYears: 1, startDate: "2024-12-29", endDate: "2025-12-28" });
    }
    expect(computed.growth.margins.net.series.map(p => p.date)).toEqual(["2024-12-29", "2025-12-28"]);
    expect(computed.scores.aspects.fundamentals.signals?.find(s => s.id === "revenueCagr")?.raw).toBeCloseTo(20);
    const payload = assembleContextPayload(bundle, computed, validation);
    expect(payload.computed.flatMap(section => section.figures).some(f => f.source.includes("growth") && f.asOf === "2025-12-28")).toBe(true);
    expect(JSON.stringify(bundle)).toBe(before);
    // Removing only the superseded rows gives the same legitimate 364-day annual comparison.
    bundle.statements.incomeAnnual.value.data.rows = bundle.statements.incomeAnnual.value.data.rows.filter(row => row.date !== "2025-12-31");
    bundle.statements.cashflowAnnual.value.data.rows = bundle.statements.cashflowAnnual.value.data.rows.filter(row => row.date !== "2025-12-31");
    const clean = runStageB(bundle);
    expect(clean.growth.revenueCagrs.find(p => p.windowYears === 1)?.cagrPct).toBeCloseTo(20);
    expect(clean.growth.fcfCagrs.find(p => p.windowYears === 1)?.cagrPct).toBeCloseTo(20);
  });
});
