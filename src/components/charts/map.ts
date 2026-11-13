import { withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import { withCashFlowSbcBasis } from "@/pipeline/cashFlowBasis";
import { withFilerShareUnits } from "@/pipeline/shareUnits";
/**
 * Chart-data mapping — pure, server-safe adapters that turn the pipeline's rich
 * types (DataBundle, ComputedMetrics) and persisted Report tables into the small
 * row/series props each chart component consumes.
 *
 * No "use client", no React, no charting-library imports: this module is imported
 * from server components (the /company/[symbol] and /report/sample pages) to build
 * the plain-object props, which are then handed to the client chart components.
 *
 * The chart components define their own local row types (RevenueRow, PriceBar, …);
 * here we produce structurally-compatible objects. Missing inputs degrade to empty
 * arrays — the charts render their own "no data" placeholder rather than crashing.
 */

import { balanceIntegrityView } from "@/pipeline/balanceIntegrity";
import type { DataBundle } from "@/pipeline/types";
import type { ComputedMetrics } from "@/pipeline/compute";
import { deriveFcf } from "@/pipeline/stageB/financialValues";
import type { Report } from "@/report/schema";
import type {
  FmpCashFlowRow,
  FmpEodBarRow,
  FmpIncomeStatementRow,
  FmpRawRow,
} from "@/providers/fmp";

import type { PriceBar, CrossMarker } from "./PriceChart";
import { admitMarketBars } from "@/pipeline/stageB/marketAdmission";
import type { RsSeries } from "./RelativeStrengthChart";
import type {
  RevenueRow,
  MarginRow,
  FcfRow,
  ShareCountRow,
  FundamentalsChartData,
} from "./FundamentalsCharts";

// ---------------------------------------------------------------------------
// Small unwrap helpers (mirror compute.ts, kept local to stay server-safe)
// ---------------------------------------------------------------------------

function rowsOf<TRow extends FmpRawRow>(f: {
  ok: boolean;
  value?: { data: { rows: TRow[] } };
}): TRow[] {
  return f.ok && f.value ? f.value.data.rows : [];
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isoDay(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 10) : "";
}

/** Ascending-by-date copy (statements arrive DESC; charts read left→right = oldest→newest). */
function ascByDate<T extends { date?: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    return da < db ? -1 : da > db ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Price chart props
// ---------------------------------------------------------------------------

/** Map FMP EOD bars → PriceChart PriceBar rows (the chart re-sorts/de-dups defensively). */
export function toPriceBars(rows: readonly FmpEodBarRow[]): PriceBar[] {
  const out: PriceBar[] = [];
  for (const r of rows) {
    const date = isoDay(r.date);
    const open = num(r.open);
    const high = num(r.high);
    const low = num(r.low);
    const close = num(r.close);
    if (!date || open === null || high === null || low === null || close === null) {
      continue;
    }
    const volume = num(r.volume);
    out.push({
      date,
      open,
      high,
      low,
      close,
      volume: volume !== null && volume >= 0 ? volume : null,
    });
  }
  return out;
}

/** The single latest SMA golden/death cross, if the technicals module found one. */
export function toCrossMarkers(computed: ComputedMetrics): CrossMarker[] {
  const { lastCrossDate, lastCrossType } = computed.technicals.smaCross;
  if (lastCrossDate && lastCrossType) {
    return [{ date: isoDay(lastCrossDate), type: lastCrossType }];
  }
  return [];
}

/** Full PriceChart props from the bundle + computed metrics. */
export function priceChartPropsFromBundle(
  bundle: DataBundle,
  computed: ComputedMetrics,
): { rows: PriceBar[]; crosses: CrossMarker[] } {
  return {
    rows: admitMarketBars(toPriceBars(rowsOf(bundle.eodPrices)).map(r=>({...r,date:r.date ?? r.time ?? ""})), "symbol", bundle.builtAt).rows,
    crosses: toCrossMarkers(computed),
  };
}

// ---------------------------------------------------------------------------
// Relative-strength series
// ---------------------------------------------------------------------------

function toRsRows(rows: readonly FmpEodBarRow[], analysisAt: string): { date: string; close: number }[] {
  return admitMarketBars(toPriceBars(rows).map(r => ({...r, date: r.date ?? r.time ?? ""})), "relative strength", analysisAt)
    .rows.map(({date, close}) => ({date, close}));
}

/**
 * Build the rebased relative-strength series: the symbol (primary/accent) vs SPY
 * and (when routed) the sector ETF. Series with no rows are dropped.
 */
export function relativeStrengthSeriesFromBundle(bundle: DataBundle): RsSeries[] {
  const series: RsSeries[] = [];

  const symbolRows = toRsRows(rowsOf(bundle.eodPrices), bundle.builtAt);
  if (symbolRows.length > 0) {
    series.push({ label: bundle.symbol, rows: symbolRows, role: "primary" });
  }

  const spyRows = toRsRows(rowsOf(bundle.benchmarkPrices.spy), bundle.builtAt);
  if (spyRows.length > 0) {
    series.push({ label: "SPY", rows: spyRows, role: "benchmark" });
  }

  const sectorSymbol = bundle.benchmarkPrices.sectorEtfSymbol;
  const sectorRows = toRsRows(rowsOf(bundle.benchmarkPrices.sectorEtf), bundle.builtAt);
  if (sectorSymbol && sectorRows.length > 0) {
    series.push({ label: sectorSymbol, rows: sectorRows, role: "benchmark" });
  }

  return series;
}

// ---------------------------------------------------------------------------
// Fundamentals charts — from the rich statements + computed growth
// ---------------------------------------------------------------------------

/** Revenue bars + YoY growth line, oldest→newest, from annual income statements. */
export function revenueRowsFromStatements(
  incomeAnnual: readonly FmpIncomeStatementRow[],
): RevenueRow[] {
  const asc = ascByDate(incomeAnnual);
  const out: RevenueRow[] = [];
  // A "YoY" label is only honest when the adjacent row really is ~1 fiscal year
  // older — a skipped year (fiscal-year change, restatement hole) would silently
  // present a multi-year growth rate as annual (fix-review).
  const YEAR_GAP_MS: readonly [number, number] = [270 * 86_400_000, 460 * 86_400_000];
  for (let i = 0; i < asc.length; i++) {
    const r = asc[i];
    const revenue = num(r.revenue);
    const prior = i > 0 ? num(asc[i - 1].revenue) : null;
    const gapMs =
      i > 0 ? Date.parse(isoDay(r.date) ?? "") - Date.parse(isoDay(asc[i - 1].date) ?? "") : Number.NaN;
    const gapIsAnnual = Number.isFinite(gapMs) && gapMs >= YEAR_GAP_MS[0] && gapMs <= YEAR_GAP_MS[1];
    const yoy =
      revenue !== null && prior !== null && prior !== 0 && gapIsAnnual
        ? ((revenue - prior) / Math.abs(prior)) * 100
        : null;
    out.push({ period: isoDay(r.date), revenue, yoyGrowthPct: yoy });
  }
  return out;
}

/**
 * Margin lines (gross / operating / net), oldest→newest. Prefers the computed
 * calculation-view margin series. Missing computed series stay missing; raw
 * source rows cannot establish a replacement operating basis.
 */
export function marginRowsFromComputed(
  computed: ComputedMetrics,
): MarginRow[] {
  const g = computed.growth.margins;
  const dates = [...new Set([g.gross, g.operating, g.net].flatMap(m => m.series.map(p => p.date)))].sort();
  const byDate = (points: { date: string; pct: number | null }[]) => new Map(points.map(p => [p.date, p.pct]));
  const gross = byDate(g.gross.series), operating = byDate(g.operating.series), net = byDate(g.net.series);
  const intervals=[...new Map([g.gross,g.operating,g.net].flatMap(m=>m.missingIntervals??[]).map(p=>[p.label,p])).values()];
  return dates.flatMap(date => [...intervals.filter(p=>p.before===date).map(p=>({period:`${p.fiscalYears.map(y=>`FY ${y}`).join(", ")} (missing; between ${p.after} and ${p.before})`,grossPct:null,operatingPct:null,netPct:null})),
    { period: isoDay(date), grossPct: gross.get(date) ?? null, operatingPct: operating.get(date) ?? null, netPct: net.get(date) ?? null }]);
}

/** FCF bars + conversion (FCF / net income) line, oldest→newest. */
export function fcfRowsFromStatements(
  cashflowAnnual: readonly FmpCashFlowRow[],
  incomeAnnual: readonly FmpIncomeStatementRow[],
): FcfRow[] {
  const netByDate = new Map<string, number | null>();
  for (const r of incomeAnnual) netByDate.set(isoDay(r.date), num(r.netIncome));
  const asc = ascByDate(cashflowAnnual);
  return asc.map((r) => {
    const date = isoDay(r.date);
    const fcf =
      num(r.freeCashFlow) ?? deriveFcf(r.operatingCashFlow, r.capitalExpenditure);
    const ni = netByDate.get(date) ?? null;
    const conversion =
      fcf !== null && ni !== null && ni !== 0 ? (fcf / ni) * 100 : null;
    return { period: date, fcf, conversionPct: conversion };
  });
}

/** Diluted share-count bars (buyback vs dilution coloring is done in the chart). */
export function shareCountRowsFromStatements(
  incomeAnnual: readonly FmpIncomeStatementRow[],
): ShareCountRow[] {
  const asc = ascByDate(incomeAnnual);
  return asc.map((r) => ({
    period: isoDay(r.date),
    dilutedShares: num(r.weightedAverageShsOutDil),
  }));
}

/**
 * The one ISO currency every charted statement row reports in, or null when a
 * row carries none or the rows disagree — the money charts then say so rather
 * than printing dollars.
 */
function statementsCurrency(rows: readonly { reportedCurrency?: unknown }[]): string | null {
  const codes = new Set(
    rows.map((r) => (typeof r.reportedCurrency === "string" ? r.reportedCurrency.trim().toUpperCase() : "")),
  );
  const [code] = codes;
  return codes.size === 1 && code !== undefined && /^[A-Z]{3}$/.test(code) ? code : null;
}

/** All four fundamentals chart datasets from the bundle + computed metrics. */
export function fundamentalsChartDataFromBundle(
  bundle: DataBundle,
  computed: ComputedMetrics,
): FundamentalsChartData {
  // D-239: the FCF bars read the same admitted cash-flow rows as the report (a provider zero capex is not a figure).
  bundle = bundle.edgar ? withCashFlowSbcBasis(withIncomeOperatingBasis(withFilerShareUnits(bundle))) : bundle;
  bundle = balanceIntegrityView(bundle);
  const incomeAnnual = rowsOf<FmpIncomeStatementRow>(bundle.statements.incomeAnnual);
  const cashflowAnnual = rowsOf<FmpCashFlowRow>(bundle.statements.cashflowAnnual);
  return {
    revenue: revenueRowsFromStatements(incomeAnnual),
    margins: marginRowsFromComputed(computed),
    fcf: fcfRowsFromStatements(cashflowAnnual, incomeAnnual),
    shareCount: shareCountRowsFromStatements(incomeAnnual),
    currency: statementsCurrency([...incomeAnnual, ...cashflowAnnual]),
  };
}

// ---------------------------------------------------------------------------
// Sensitivity heatmap — the DCF grid is structurally identical in the schema
// ---------------------------------------------------------------------------

/** Pull the flat sensitivity-grid cells from a persisted Report's DCF block. */
export function sensitivityCellsFromReport(
  report: Report,
): Report["valuation"]["dcf"]["sensitivityGrid"] {
  return report.valuation.dcf.sensitivityGrid;
}
