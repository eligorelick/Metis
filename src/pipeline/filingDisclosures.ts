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
import type { DataBundle, ExtractedSection } from "@/pipeline/types";
import type { FetchResult } from "@/types/core";
import type { FmpCashFlowRow, FmpIncomeStatementRow, FmpRawRow } from "@/providers/fmp";
import type { CurrentReports, EarningsReleaseRecord } from "@/providers/currentReports";
import type { GuidanceItem, ReconciliationFact } from "@/edgar/currentReports";
import {
  parseBusinessCombinationFacts,
  parseCommitmentFacts,
  parseInvestmentFacts,
  parseOfficerChanges,
  parseSayOnPay,
  parseStatementFacts,
  parseTradingArrangements,
  type FilingFact,
} from "@/edgar/filingFacts";
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
  /**
   * D-60: guided GAAP (or unspecified-basis) effective tax rate midpoint from
   * the same release — the guided quarter's when given, else the fiscal
   * year's — with its period label; null when the release gives none.
   */
  taxRatePct?: number | null;
  taxRatePeriod?: string | null;
  /** D-60: low end of the guided GAAP gross margin for the same quarter, percent. */
  grossMarginLowPct?: number | null;
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
  const taxItems = release.guidance.items.filter((i) => i.metric === "tax-rate" && i.unit === "%" && (i.basis === "gaap" || i.basis === "unspecified"));
  const tax = taxItems.find((i) => i.period.label === item.period.label) ?? taxItems.find((i) => i.period.fiscalQuarter === null);
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
    taxRatePct: tax?.mid ?? null,
    taxRatePeriod: tax?.period.label ?? null,
    grossMarginLowPct: gm?.low ?? null,
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

/**
 * D-63: one three-month reconciliation value per quarter end across the
 * releases (newest release first), read in the statements' currency only.
 */
function quarterReconciliation(releases: readonly EarningsReleaseRecord[], currency: string | null, metric: ReconciliationFact["metric"], periodEnd: string): number | null {
  for (const release of releases) {
    const fact = (release.reconciliation ?? []).find((f) => f.metric === metric && f.months === 3 && daysApart(f.periodEnd, periodEnd) <= 3);
    if (fact && currency !== null && symbolCurrency(fact.symbol, currency) === currency) return fact.value;
  }
  return null;
}

function quarterlyTrend(bundle: DataBundle, releases: readonly EarningsReleaseRecord[] = [], currency: string | null = null): FilingDisclosures["quarterlyTrend"] {
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
      ...(releases.length === 0 ? {} : {
        equitySecuritiesGains: quarterReconciliation(releases, currency, "equity-securities-gains", d),
        nonGaapEpsDiluted: quarterReconciliation(releases, currency, "non-gaap-diluted-eps", d),
      }),
    };
  });
}

/** D-63: the disclosure for segment cells filled as the quarter's total less the axis's other rows. */
export function residualNote(axisLabel: string, cells: number): string {
  return `Segment XBRL, ${axisLabel}: ${cells} quarter value${cells === 1 ? " is" : "s are"} the quarter's total revenue less the axis's other ` +
    "top-level rows (the rows sum to the total in the latest quarter); this carries a member renamed between filings or a quarter no filing tags.";
}

/** Null when the bundle carries none of this evidence (old bundles, fixtures). */
export function buildFilingDisclosures(bundle: DataBundle): FilingDisclosures | undefined {
  const reports = currentReportsOf(bundle);
  const segmentsRes = bundle.edgar?.quarterlySegments;
  const segments = segmentsRes?.ok ? segmentsRes.value.data : null;
  const currency = statementReportingCurrency(bundle);
  const releases = reports?.releases ?? [];
  const trend = quarterlyTrend(bundle, releases, currency);
  const { facts: filingFacts, outlook: commentaryOutlook } = filingFactRows(bundle, currency, releases);
  const officerChanges = officerChangeRows(reports, bundle);
  const sayOnPay = sayOnPayRow(reports);
  const tradingArrangements = tradingArrangementRows(bundle);
  if (reports === null && segments === null && trend.length === 0 && filingFacts.length === 0 && tradingArrangements.length === 0) return undefined;
  const notes: string[] = [];

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
        // D-62: the release's "approximately" travels with the amount. Bundles
        // parsed before the flag existed keep the sentence it was read from.
        ...(capital.returned && capitalCurrency(capital.returned.symbol) &&
          (capital.returned.approximate === true || capital.sentences.some((s) => /\breturned\b[^.]{0,40}?\b(?:approximately|about|around|roughly|nearly)\s+(?:US)?\$/i.test(s)))
          ? { returnedApproximate: true } : {}),
        ...(capital.authorizationRemaining && capitalCurrency(capital.authorizationRemaining.symbol) &&
          capital.sentences.some((s) => /\b(?:approximately|about|around|roughly|nearly)\s+(?:US)?\$\s?[\d.,]+\s*(?:billion|million) remaining under\b/i.test(s))
          ? { authorizationRemainingApproximate: true } : {}),
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
    ...(axis.residualCells > 0 ? { residualCells: axis.residualCells } : {}),
    sources: segments!.filings.map((f) => `${f.form} ${f.accession} (filed ${f.filingDate})`),
  }));
  if (segments && segments.notes.length > 0) notes.push(...segments.notes.map((n) => `Segment XBRL: ${n}`));
  for (const axis of segments?.axes ?? []) {
    if (axis.residualCells > 0) notes.push(residualNote(axis.axisLabel, axis.residualCells));
  }
  if (reports) notes.push(...reports.notes.slice(0, 6));

  // D-63: the latest release's reconciliation rows and the commitments and
  // guarantees tables, in the statements' currency only.
  const latestCurrencyOk = (symbol: string): boolean => currency !== null && symbolCurrency(symbol, currency) === currency;
  const reconciliation: NonNullable<FilingDisclosures["reconciliation"]> = latest
    ? (latest.reconciliation ?? []).filter((f) => latestCurrencyOk(f.symbol))
      .map((f) => ({ metric: f.metric, periodEnd: f.periodEnd, months: f.months, value: f.value, unit: f.unit, source: releaseRef(latest, null) }))
    : [];
  const commitmentRelease = releases.find((r) => (r.commitments ?? []).length > 0);
  const commitments: NonNullable<FilingDisclosures["commitments"]> = commitmentRelease && currency !== null
    ? (commitmentRelease.commitments ?? []).flatMap((table, index, all) => {
        const name = table.kind === "guarantees" ? "guarantees (maximum gross exposure)"
          : all.findIndex((t) => t.kind === "commitments") === index ? "future commitments" : "additional commitments";
        const source = releaseRef(commitmentRelease, commitmentRelease.commitmentsExhibit ?? "EX-99.1");
        return [
          ...table.rows.map((row) => ({ kind: table.kind, table: name, asOf: table.asOf, label: safeText(row.label, "(row label withheld)"), total: row.total, tableTotal: false, source })),
          ...(table.total === null ? [] : [{ kind: table.kind, table: name, asOf: table.asOf, label: "Total", total: table.total, tableTotal: true, source }]),
        ];
      })
    : [];
  const basisNote = releases.find((r) => typeof r.nonGaapBasisNote === "string")?.nonGaapBasisNote ?? null;
  // D-66: the notes', statements' and commentary's facts; officers and votes.

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
    ...(reconciliation.length === 0 ? {} : { reconciliation }),
    ...(commitments.length === 0 ? {} : { commitments }),
    ...(basisNote === null ? {} : { nonGaapBasisNote: safeText(basisNote, "The issuer's non-GAAP basis note is withheld from display by the rating-language filter; see the release.") }),
    ...(filingFacts.length === 0 ? {} : { filingFacts }),
    ...(commentaryOutlook.length === 0 ? {} : { commentaryOutlook }),
    ...(officerChanges.length === 0 ? {} : { officerChanges }),
    ...(sayOnPay === null ? {} : { sayOnPay }),
    ...(tradingArrangements.length === 0 ? {} : { tradingArrangements }),
    notes: notes.map((n) => safeText(n, "A disclosure note is withheld from display by the rating-language filter.")),
  };
}

type FilingFactRow = NonNullable<FilingDisclosures["filingFacts"]>[number];
type OutlookRow = NonNullable<FilingDisclosures["commentaryOutlook"]>[number];

/** A periodic-filing section's provenance, when it was read. */
function sectionRef(res: FetchResult<ExtractedSection> | undefined): { ref: FilingRef; data: ExtractedSection } | null {
  if (!res?.ok) return null;
  const data = res.value.data;
  const filed = day(data.filingDate);
  return filed === null ? null : { ref: { form: data.form, accession: data.accession, exhibit: null, filingDate: filed, url: data.documentUrl }, data };
}

/** The last two fiscal-year-end values of an XBRL money tag, newest first (10-K facts only). */
function annualTagValues(bundle: DataBundle, tag: string, currency: string | null): { end: string; value: number; ref: FilingRef }[] {
  const facts = bundle.edgar?.companyFacts;
  if (!facts?.ok || currency === null) return [];
  const concept = facts.value.data.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown> } | undefined;
  const units = concept?.units?.[currency];
  const rows = Array.isArray(units) ? (units as Record<string, unknown>[]) : [];
  const byEnd = new Map<string, { end: string; value: number; ref: FilingRef }>();
  for (const row of rows) {
    const end = day(row.end);
    const filed = day(row.filed);
    if (row.form !== "10-K" || row.fp !== "FY" || typeof row.val !== "number" || !Number.isFinite(row.val) || end === null || filed === null || typeof row.accn !== "string") continue;
    const prior = byEnd.get(end);
    if (prior !== undefined && prior.ref.filingDate >= filed) continue;
    byEnd.set(end, { end, value: row.val, ref: { form: "10-K", accession: row.accn, exhibit: null, filingDate: filed, url: null } });
  }
  return [...byEnd.values()].sort((a, b) => b.end.localeCompare(a.end)).slice(0, 2);
}

/**
 * D-66: the facts the 10-Q statements and notes, the 10-Q MD&A, the 10-K
 * notes, the XBRL goodwill balance and the two newest CFO commentaries state,
 * in the statements' currency only (a fact in another currency is left out).
 */
function filingFactRows(bundle: DataBundle, currency: string | null, releases: readonly EarningsReleaseRecord[]): { facts: FilingFactRow[]; outlook: OutlookRow[] } {
  const facts: FilingFactRow[] = [];
  const add = (found: readonly FilingFact[], sourceTag: string, source: FilingRef): void => {
    for (const f of found) {
      if (f.unit === "currency" && (currency === null || symbolCurrency(f.symbol, currency) !== currency)) continue;
      // The MD&A repeats the notes' supply commitments: one row per fact.
      if (facts.some((row) => row.key === f.key && row.label === f.label && row.asOf === f.asOf && row.value === f.value)) continue;
      facts.push({ key: f.key, label: safeText(f.label, "(fact label withheld)"), value: f.value, unit: f.unit, asOf: f.asOf, period: f.period,
        qualifier: f.qualifier, computed: f.computed, sourceTag, source, text: safeText(f.text, "The source sentence is withheld from display by the rating-language filter.") });
    }
  };
  const notes = sectionRef(bundle.edgar?.tenQNotes);
  if (notes !== null) {
    add(parseStatementFacts(notes.data.statementsText ?? ""), "edgar:10-Q statements", notes.ref);
    add(parseInvestmentFacts(notes.data.text, day(notes.data.reportDate)), "edgar:10-Q notes", notes.ref);
    add(parseCommitmentFacts(notes.data.text), "edgar:10-Q notes", notes.ref);
  }
  const mdna = sectionRef(bundle.edgar?.tenQMdna);
  if (mdna !== null) add(parseCommitmentFacts(mdna.data.text), "edgar:10-Q item2", mdna.ref);
  const annual = sectionRef(bundle.edgar?.tenKNotes);
  if (annual !== null) add(parseBusinessCombinationFacts(annual.data.text, day(annual.data.reportDate)), "edgar:10-K notes", annual.ref);
  for (const goodwill of annualTagValues(bundle, "Goodwill", currency)) {
    facts.push({ key: "goodwill", label: "goodwill (balance sheet)", value: goodwill.value, unit: "currency", asOf: goodwill.end, period: null, qualifier: null,
      computed: null, sourceTag: "edgar:xbrl us-gaap/Goodwill", source: goodwill.ref, text: `us-gaap/Goodwill ${goodwill.value} ${currency} at ${goodwill.end} (10-K ${goodwill.ref.accession})` });
  }
  const outlook: OutlookRow[] = [];
  for (const release of releases.slice(0, 2)) {
    const wc = release.workingCapital;
    const periodEnd = release.reported.periodEnd;
    if (wc == null || periodEnd === null) continue;
    const source = releaseRef(release, release.commentaryUrl === null ? "EX-99.1" : "EX-99.2");
    const sourceTag = `edgar:8-K ${source.exhibit} ${release.reported.fiscal?.label ?? periodEnd} commentary`;
    const fiscal = release.reported.fiscal?.label ?? null;
    const text = wc.sentence ?? "";
    const rows: FilingFact[] = [];
    if (wc.dso !== null) rows.push({ key: "dso", label: "days sales outstanding (DSO)", value: wc.dso, unit: "days", symbol: null, asOf: periodEnd, period: fiscal, qualifier: null, computed: null, text });
    if (wc.priorDso !== null) {
      rows.push({ key: "dso-prior", label: `days sales outstanding (DSO), ${wc.comparison === "sequential" ? "prior quarter" : "year-ago quarter"} (as stated with ${fiscal ?? periodEnd})`,
        value: wc.priorDso, unit: "days", symbol: null, asOf: periodEnd, period: fiscal, qualifier: null, computed: null, text });
    }
    if (wc.receivables !== null) rows.push({ key: "accounts-receivable", label: "accounts receivable (CFO commentary)", value: wc.receivables, unit: "currency", symbol: wc.receivablesSymbol, asOf: periodEnd, period: fiscal, qualifier: null, computed: null, text });
    add(rows, sourceTag, source);
    if (wc.expectation !== null) outlook.push({ topic: `DSO outlook given with ${fiscal ?? `the quarter ended ${periodEnd}`} results`, text: safeText(wc.expectation, "(outlook withheld)"), source });
  }
  return { facts, outlook };
}

type OfficerChangeRow = NonNullable<FilingDisclosures["officerChanges"]>[number];

/** D-66: Item 5.02 officer and director changes, newest filing first, in effect when dated on or before the bundle date. */
function officerChangeRows(reports: CurrentReports | null, bundle: DataBundle): OfficerChangeRow[] {
  const asOf = day(bundle.builtAt) ?? day(bundle.asOf?.["quote"]) ?? null;
  const out: OfficerChangeRow[] = [];
  for (const event of reports?.events ?? []) {
    const filed = day(event.filingDate);
    if (filed === null) continue;
    for (const section of event.sections.filter((s) => s.item === "5.02")) {
      for (const change of parseOfficerChanges(section.text)) {
        out.push({
          kind: change.kind, person: change.person, role: safeText(change.role, "(role withheld)"), board: change.board, announced: change.announced,
          effective: change.effective, anticipated: change.anticipated, inEffect: change.effective !== null && asOf !== null && change.effective <= asOf,
          note: change.note === null ? null : safeText(change.note, "(note withheld)"),
          package: change.package.filter((p) => p.symbol === "$").map((p) => ({ component: p.component, value: p.value })),
          source: { form: event.form, accession: event.accession, exhibit: null, filingDate: filed, url: event.url },
        });
      }
    }
  }
  return out;
}

/** D-66: the newest Item 5.07's say-on-pay vote. */
function sayOnPayRow(reports: CurrentReports | null): NonNullable<FilingDisclosures["sayOnPay"]> | null {
  for (const event of reports?.events ?? []) {
    const filed = day(event.filingDate);
    const section = event.sections.find((s) => s.item === "5.07");
    if (filed === null || section === undefined) continue;
    const vote = parseSayOnPay(section.text);
    if (vote === null) continue;
    const cast = vote.votesFor + vote.votesAgainst + vote.abstentions;
    return { ...vote, supportPct: cast > 0 ? Number(((vote.votesFor / cast) * 100).toFixed(4)) : 0,
      source: { form: event.form, accession: event.accession, exhibit: null, filingDate: filed, url: event.url } };
  }
  return null;
}

/** D-66: the 10-Q Part II Item 5 trading arrangements. */
function tradingArrangementRows(bundle: DataBundle): NonNullable<FilingDisclosures["tradingArrangements"]> {
  const other = sectionRef(bundle.edgar?.tenQOther);
  if (other === null) return [];
  return parseTradingArrangements(other.data.text).map((t) => ({ ...t, role: safeText(t.role, "(role withheld)"), source: other.ref }));
}
