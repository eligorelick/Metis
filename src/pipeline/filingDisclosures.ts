/**
 * The bundle's 8-K, segment-XBRL and quarterly-statement evidence assembled
 * into the report's deterministic `filingDisclosures` block and the
 * payload's issuer-filing sections (NVDA report #34 audit, P1-1, P1-2, P1-3,
 * P0-11, P1-11).
 *
 * Currency rule: a "$" printed in an 8-K exhibit is the issuer's own
 * statement currency when the statements agree on one (the same rule the
 * verifier applies to excerpt numbers, D-45); "US$" is USD. A printed symbol
 * naming any other currency is not converted — its figures are left out and
 * the omission is noted.
 *
 * Pure: no network, no clock.
 */
import type { DataBundle } from "@/pipeline/types";
import type { FmpCashFlowRow, FmpIncomeStatementRow, FmpRawRow } from "@/providers/fmp";
import type { CurrentReports, EarningsReleaseRecord } from "@/providers/currentReports";
import type { GuidanceItem } from "@/edgar/currentReports";
import { noBuySellHold, type FilingDisclosures, type FilingRef, type GuidanceCheck } from "@/report/schema";

const SYMBOL_CURRENCY: Readonly<Record<string, string>> = { "US$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY" };
const TREND_QUARTERS = 8;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** "80.0 billion" — a note is prose, not a table cell with a formatter. */
function scaledMoney(value: number): string {
  const abs = Math.abs(value);
  return abs >= 1e9 ? `${(value / 1e9).toFixed(1)} billion` : abs >= 1e6 ? `${(value / 1e6).toFixed(1)} million` : String(value);
}

function round(v: number | null, dp = 4): number | null {
  return v === null ? null : Number(v.toFixed(dp));
}

function rowsOf<T extends FmpRawRow>(f: { ok: boolean; value?: { data: { rows: T[] } } } | undefined): T[] {
  return f?.ok && f.value ? f.value.data.rows : [];
}

function day(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/** The one ISO currency the quarterly and annual statement rows agree on, else null. */
export function statementReportingCurrency(bundle: DataBundle): string | null {
  const codes = new Set<string>();
  for (const row of [...rowsOf(bundle.statements?.incomeQuarterly).slice(0, 8), ...rowsOf(bundle.statements?.incomeAnnual).slice(0, 2)]) {
    const code = typeof row.reportedCurrency === "string" ? row.reportedCurrency.trim().toUpperCase() : "";
    if (/^[A-Z]{3}$/.test(code)) codes.add(code);
  }
  return codes.size === 1 ? [...codes][0]! : null;
}

function symbolCurrency(symbol: string | null, statementCurrency: string | null): string | null {
  if (symbol === null) return null;
  if (symbol === "$") return statementCurrency;
  return SYMBOL_CURRENCY[symbol] ?? null;
}

/** Issuer text shown on the report must pass the same rating-language gate as the report. */
function safeText(text: string, fallback: string): string {
  return noBuySellHold(text) ? text : fallback;
}

function currentReportsOf(bundle: DataBundle): CurrentReports | null {
  const res = bundle.edgar?.currentReports;
  return res?.ok ? res.value.data : null;
}

function releaseRef(release: EarningsReleaseRecord, exhibit: "EX-99.1" | "EX-99.2" | null): FilingRef {
  return {
    form: "8-K",
    accession: release.accession,
    exhibit,
    filingDate: release.filingDate,
    url: exhibit === "EX-99.2" ? release.commentaryUrl : release.releaseUrl,
  };
}

/**
 * Next-period revenue guidance for valuation anchoring (DCF work package 2):
 * the newest release's quarterly revenue outlook, in base units of the
 * statement currency. Null when no release carries one, when its currency
 * cannot be bound to the statements, or when it guides a full year only.
 */
export interface RevenueGuidanceAnchor {
  periodLabel: string;
  fiscalYear: number;
  fiscalQuarter: 1 | 2 | 3 | 4;
  low: number;
  mid: number;
  high: number;
  currency: string;
  filingDate: string;
  accession: string;
  /** End of the quarter the same release reported (the guided quarter follows it). */
  basePeriodEnd: string | null;
  /**
   * The guided quarter's end. Releases do not print it: a calendar quarter
   * ends three month-ends after a month-end base; a 52/53-week quarter ends
   * 13 weeks after its base (a 14-week fourth quarter would end a week later).
   */
  periodEnd: string | null;
  periodEndBasis: "calendar-quarter" | "13-week-quarter" | null;
  /**
   * Guided GAAP gross margin less guided GAAP operating expenses over guided
   * revenue (midpoints), percent; null unless all three are guided for the
   * same quarter in the statement currency.
   */
  impliedOperatingMarginPct: number | null;
}

function guidedQuarterEnd(base: string | null): Pick<RevenueGuidanceAnchor, "periodEnd" | "periodEndBasis"> {
  if (base === null || !/^\d{4}-\d{2}-\d{2}$/.test(base)) return { periodEnd: null, periodEndBasis: null };
  const d = new Date(`${base}T00:00:00Z`);
  const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() === d.getUTCDate();
  if (monthEnd) {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 4, 0));
    return { periodEnd: next.toISOString().slice(0, 10), periodEndBasis: "calendar-quarter" };
  }
  return { periodEnd: new Date(d.getTime() + 91 * 86_400_000).toISOString().slice(0, 10), periodEndBasis: "13-week-quarter" };
}

export function nextPeriodRevenueGuidance(bundle: DataBundle): RevenueGuidanceAnchor | null {
  const reports = currentReportsOf(bundle);
  const release = reports?.releases.find((r) => (r.guidance?.items.length ?? 0) > 0);
  if (!release || !release.guidance) return null;
  const item = release.guidance.items.find((i) => i.metric === "revenue" && i.period.fiscalQuarter !== null && i.basis !== "non-gaap");
  if (!item || item.period.fiscalQuarter === null) return null;
  const currency = symbolCurrency(item.symbol, statementReportingCurrency(bundle));
  if (currency === null || currency !== statementReportingCurrency(bundle)) return null;
  const sameQuarter = (metric: GuidanceItem["metric"]): GuidanceItem | undefined =>
    release.guidance!.items.find((i) => i.metric === metric && i.period.label === item.period.label && (i.basis === "gaap" || i.basis === "unspecified"));
  const gm = sameQuarter("gross-margin");
  const opex = sameQuarter("operating-expenses");
  const opexOk = opex !== undefined && symbolCurrency(opex.symbol, currency) === currency;
  return {
    periodLabel: item.period.label,
    fiscalYear: item.period.fiscalYear,
    fiscalQuarter: item.period.fiscalQuarter,
    low: item.low,
    mid: item.mid,
    high: item.high,
    currency,
    filingDate: release.filingDate,
    accession: release.accession,
    basePeriodEnd: release.reported.periodEnd,
    ...guidedQuarterEnd(release.reported.periodEnd),
    impliedOperatingMarginPct: gm !== undefined && opexOk && item.mid > 0 ? round(gm.mid - (opex.mid / item.mid) * 100, 2) : null,
  };
}

type GuidanceRows = NonNullable<FilingDisclosures["guidance"]>["rows"];

function guidanceRows(items: readonly GuidanceItem[], currency: string | null, notes: string[]): GuidanceRows {
  const rows: GuidanceRows = [];
  for (const item of items) {
    if (item.unit !== "%") {
      const itemCurrency = symbolCurrency(item.symbol, currency);
      if (itemCurrency === null || itemCurrency !== currency) {
        notes.push(`Guidance for ${item.period.label} ${item.metric} printed in "${item.symbol ?? "no symbol"}" was left out: that currency is not the statements' (${currency ?? "unestablished"}).`);
        continue;
      }
    }
    rows.push({ period: item.period.label, metric: item.metric, basis: item.basis, unit: item.unit, low: item.low, mid: item.mid, high: item.high, form: item.form });
  }
  return rows;
}

/**
 * Each earlier release's quarterly revenue and gross-margin outlook against
 * the statements' actual for that quarter. The quarter is identified by the
 * later release that reported it (its title's fiscal quarter and its "quarter
 * ended" date); the actual comes from the statement row with that end date.
 */
function guidanceChecks(bundle: DataBundle, releases: readonly EarningsReleaseRecord[], currency: string | null): GuidanceCheck[] {
  const income = rowsOf<FmpIncomeStatementRow>(bundle.statements?.incomeQuarterly);
  const source = bundle.statements?.incomeQuarterly?.ok ? `${bundle.statements.incomeQuarterly.value.source}:income-statement(quarter)` : "statements";
  const checks: GuidanceCheck[] = [];
  for (const guide of releases) {
    for (const item of guide.guidance?.items ?? []) {
      if (item.period.fiscalQuarter === null || (item.metric !== "revenue" && item.metric !== "gross-margin")) continue;
      if (item.metric === "gross-margin" && item.basis !== "gaap") continue;
      if (item.metric === "revenue" && symbolCurrency(item.symbol, currency) !== currency) continue;
      const reporter = releases.find((r) => r.reported.fiscal?.label === item.period.label && r.reported.periodEnd !== null && r.filingDate > guide.filingDate);
      if (!reporter || reporter.reported.periodEnd === null) continue;
      const row = income.find((r) => day(r.date) !== null && daysApart(day(r.date)!, reporter.reported.periodEnd!) <= 3);
      const revenue = num(row?.revenue);
      const grossProfit = num(row?.grossProfit);
      const actual = item.metric === "revenue" ? revenue : revenue !== null && grossProfit !== null && revenue !== 0 ? (grossProfit / revenue) * 100 : null;
      if (actual === null) continue;
      const difference = item.metric === "revenue" ? (actual / item.mid - 1) * 100 : actual - item.mid;
      checks.push({
        period: item.period.label,
        periodEnd: reporter.reported.periodEnd,
        metric: item.metric,
        basis: item.basis,
        guidedLow: item.low,
        guidedMid: item.mid,
        guidedHigh: item.high,
        actual: round(actual, item.metric === "revenue" ? 0 : 2)!,
        difference: round(difference, 2)!,
        position: actual > item.high + 1e-9 ? "above" : actual < item.low - 1e-9 ? "below" : "within",
        guidance: releaseRef(guide, guide.guidanceExhibit),
        actualSource: source,
      });
    }
  }
  // Newest quarter first; revenue before gross margin within a quarter.
  return checks.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || (a.metric === b.metric ? 0 : a.metric === "revenue" ? -1 : 1));
}

function quarterlyTrend(bundle: DataBundle): FilingDisclosures["quarterlyTrend"] {
  const byDate = <T extends FmpRawRow>(rows: T[]): Map<string, T> => {
    const out = new Map<string, T>();
    for (const r of rows) {
      const d = day(r.date);
      if (d !== null && !out.has(d)) out.set(d, r);
    }
    return out;
  };
  const income = byDate(rowsOf<FmpIncomeStatementRow>(bundle.statements?.incomeQuarterly));
  const cash = byDate(rowsOf<FmpCashFlowRow>(bundle.statements?.cashflowQuarterly));
  const dates = [...income.keys()].sort().reverse();
  const near = (target: string, lo: number, hi: number): FmpIncomeStatementRow | undefined => {
    const d = dates.find((x) => x < target && daysApart(x, target) >= lo && daysApart(x, target) <= hi);
    return d === undefined ? undefined : income.get(d);
  };
  return dates.slice(0, TREND_QUARTERS).map((d) => {
    const r = income.get(d)!;
    const c = cash.get(d);
    const revenue = num(r.revenue);
    const pct = (part: number | null): number | null => (part === null || revenue === null || revenue === 0 ? null : round((part / revenue) * 100));
    const growth = (prior: FmpIncomeStatementRow | undefined): number | null => {
      const base = num(prior?.revenue);
      return revenue === null || base === null || base <= 0 ? null : round((revenue / base - 1) * 100);
    };
    const ocf = num(c?.operatingCashFlow) ?? num(c?.netCashProvidedByOperatingActivities);
    const capex = num(c?.capitalExpenditure);
    const year = typeof r.fiscalYear === "number" ? String(r.fiscalYear) : r.fiscalYear;
    const period = typeof r.period === "string" ? r.period.trim().toUpperCase() : null;
    return {
      periodEnd: d,
      fiscalLabel: typeof year === "string" && /^\d{4}$/.test(year) && period !== null && /^Q[1-4]$/.test(period) ? `${period} FY${year}` : null,
      revenue,
      revenueYoyPct: growth(near(d, 350, 380)),
      revenueQoqPct: growth(near(d, 80, 100)),
      grossMarginPct: pct(num(r.grossProfit)),
      operatingExpenses: num(r.operatingExpenses),
      operatingMarginPct: pct(num(r.operatingIncome)),
      epsDiluted: num(r.epsDiluted),
      operatingCashFlow: ocf,
      freeCashFlow: ocf !== null && capex !== null ? ocf - Math.abs(capex) : num(c?.freeCashFlow),
    };
  });
}

/** Null when the bundle carries none of this evidence (old bundles, fixtures). */
export function buildFilingDisclosures(bundle: DataBundle): FilingDisclosures | undefined {
  const reports = currentReportsOf(bundle);
  const segmentsRes = bundle.edgar?.quarterlySegments;
  const segments = segmentsRes?.ok ? segmentsRes.value.data : null;
  const trend = quarterlyTrend(bundle);
  if (reports === null && segments === null && trend.length === 0) return undefined;
  const currency = statementReportingCurrency(bundle);
  const notes: string[] = [];
  const releases = reports?.releases ?? [];

  const guided = releases.find((r) => (r.guidance?.items.length ?? 0) > 0);
  const guidance: FilingDisclosures["guidance"] = guided && guided.guidance
    ? {
        source: releaseRef(guided, guided.guidanceExhibit),
        reportedPeriod: guided.reported.fiscal?.label ?? null,
        reportedPeriodEnd: guided.reported.periodEnd,
        rows: guidanceRows(guided.guidance.items, currency, notes),
        qualifiers: guided.guidance.qualifiers.map((q) => safeText(q, "An issuer outlook caveat is withheld from display by the rating-language filter; see the release.")),
      }
    : null;
  if (releases.length > 0 && guided === undefined) notes.push("No quarterly outlook could be read from the latest earnings releases; no guidance is shown.");

  const latest = releases[0];
  const fcfCurrencyOk = latest !== undefined && symbolCurrency("$", currency) === currency && currency !== null;
  const freeCashFlow = latest && fcfCurrencyOk
    ? latest.freeCashFlow
      .filter((f, i, all) => all.findIndex((g) => g.periodEnd === f.periodEnd && g.months === f.months) === i)
      .map((f) => ({ periodEnd: f.periodEnd, months: f.months, value: f.value, source: releaseRef(latest, "EX-99.1") }))
    : [];
  const capital = latest?.capitalReturn;
  const capitalCurrency = (symbol: string | undefined): boolean => symbol === undefined || symbolCurrency(symbol, currency) === currency;
  const capitalReturn: FilingDisclosures["capitalReturn"] = latest && capital && currency !== null &&
    (capital.returned || capital.authorizationRemaining || capital.dividendPerShare || capital.authorizationAdded)
    ? {
        source: releaseRef(latest, "EX-99.1"),
        returned: capital.returned && capitalCurrency(capital.returned.symbol) ? capital.returned.value : null,
        returnedPeriod: capital.returned?.periodText ?? null,
        authorizationRemaining: capital.authorizationRemaining && capitalCurrency(capital.authorizationRemaining.symbol) ? capital.authorizationRemaining.value : null,
        authorizationAdded: capital.authorizationAdded && capitalCurrency(capital.authorizationAdded.symbol) ? capital.authorizationAdded.value : null,
        dividendPerShare: capital.dividendPerShare && capitalCurrency(capital.dividendPerShare.symbol) ? capital.dividendPerShare.value : null,
        dividendPayDate: capital.dividendPerShare?.payDate ?? null,
        dividendRecordDate: capital.dividendPerShare?.recordDate ?? null,
        dividendChangeFrom: capital.dividendChange?.from ?? null,
        dividendChangeTo: capital.dividendChange?.to ?? null,
      }
    : null;
  // A dividend change or added authorization announced in an earlier release
  // of the window is still news the latest release does not repeat.
  for (const earlier of releases.slice(1)) {
    const change = earlier.capitalReturn.dividendChange;
    if (change && capitalReturn?.dividendChangeTo == null && capitalCurrency(change.symbol)) {
      notes.push(`Quarterly dividend raised from ${change.from} to ${change.to} ${currency ?? ""} per share (8-K ${earlier.accession}, filed ${earlier.filingDate}).`.replace("  ", " "));
    }
    const added = earlier.capitalReturn.authorizationAdded;
    if (added && capitalCurrency(added.symbol) && capitalReturn?.authorizationAdded == null) {
      notes.push(`Share repurchase authorization increased by ${scaledMoney(added.value)} ${currency ?? ""} (8-K ${earlier.accession}, filed ${earlier.filingDate}).`.replace("  ", " "));
    }
  }

  const events: FilingDisclosures["events"] = (reports?.events ?? []).map((e) => {
    const parts = e.sections
      .filter((s) => s.incorporates === null || e.sections.length === 1)
      .map((s) => `Item ${s.item}: ${s.summary}`);
    const joined = parts.join(" ").slice(0, 900);
    return {
      filingDate: e.filingDate,
      eventDate: e.eventDate,
      accession: e.accession,
      form: e.form,
      items: e.items,
      summary: safeText(joined || "No item text could be read from the filing.", "Summary withheld from display by the report's rating-language filter; see the filing."),
      url: e.url,
    };
  });

  const segmentTables: FilingDisclosures["segments"] = (segments?.axes ?? []).map((axis) => ({
    axis: axis.axis,
    axisLabel: axis.axisLabel,
    currency: axis.currency,
    quarters: axis.quarters.map((q) => q.end),
    rows: axis.rows.map((r) => ({
      label: safeText(r.label, "(member label withheld)"),
      childOf: r.childOf === null ? null : axis.rows.find((p) => p.member === r.childOf)?.label ?? null,
      values: r.values,
    })),
    total: axis.total,
    priorPresentation: axis.priorPresentation,
    derivedCells: axis.derivedCells,
    sources: segments!.filings.map((f) => `${f.form} ${f.accession} (filed ${f.filingDate})`),
  }));
  if (segments && segments.notes.length > 0) notes.push(...segments.notes.map((n) => `Segment XBRL: ${n}`));
  if (reports) notes.push(...reports.notes.slice(0, 6));

  return {
    version: "1.0.0",
    currency,
    currencyBasis: currency === null
      ? "The statements do not agree on one reporting currency, so no amount printed in an 8-K exhibit is given a currency; those amounts are left out."
      : `Amounts printed with "$" in the issuer's 8-K exhibits are read in the statements' reporting currency (${currency}); XBRL amounts carry their own ISO unit.`,
    guidance,
    guidanceChecks: guidanceChecks(bundle, releases, currency),
    freeCashFlow,
    freeCashFlowDefinition: latest?.freeCashFlow[0]?.definition ?? null,
    capitalReturn,
    events,
    segments: segmentTables,
    quarterlyTrend: trend,
    notes: notes.map((n) => safeText(n, "A disclosure note is withheld from display by the rating-language filter.")),
  };
}
