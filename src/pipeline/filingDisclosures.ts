/**
 * The bundle's 8-K, segment-XBRL and quarterly-statement evidence assembled
 * into the report's deterministic `filingDisclosures` block and the
 * payload's issuer-filing sections (NVDA report #34 audit, P1-1, P1-2, P1-3,
 * P0-11, P1-11).
 *
 * Currency rule: a "$" printed in an 8-K exhibit is the issuer's own
 * statement currency established for that filing's reporting period; "US$"
 * is USD. Only figures compatible with the current reporting currency are
 * shown under the shared currency. A printed symbol
 * naming any other currency is not converted — its figures are left out and
 * the omission is noted.
 *
 * Pure: no network, no clock.
 */
import type { DataBundle, ExtractedSection } from "@/pipeline/types";
import type { FetchResult } from "@/types/core";
import type { FmpCashFlowRow, FmpIncomeStatementRow, FmpRawRow } from "@/providers/fmp";
import { admittedStatementRow } from "@/providers/fmp";
import type { CurrentReports, EarningsFactSource, EarningsReleaseRecord } from "@/providers/currentReports";
import type { EdgarFiling } from "@/providers/edgar";
import { establishedCurrencyOn, statementCurrencyEvidence } from "@/pipeline/compute";
import { normalizeQuarterRows } from "@/pipeline/stageB/quarterWindows";
import { orderedEarningsReleases } from "@/providers/currentReports";
import { materialCreditSupportClauses, moneyMentions, parseCommitmentTables, splitSentences, summarizeItem, type GuidanceItem, type ReconciliationFact } from "@/edgar/currentReports";
import { withoutLegacyPrincipalAnnotation } from "@/report/principalAggregationSafety";
import { formatFinancialValue } from "@/report/format";
import type { FilingRef as EdgarFilingRef, OriginalValue } from "@/edgar/statements";
import { parseSegmentPerformance } from "@/edgar/segmentPerformance";
import { selectedGeographyNotes } from "@/edgar/annualGeography";
import { financialCompositionFacts } from "@/pipeline/financialComposition";
import {
  parseBusinessCombinationFacts,
  parseCommitmentFacts,
  parseCompletedOfferingFacts,
  parseCustomerConcentrationFacts,
  parseInvestmentFacts,
  parseOfficerChanges,
  parseSayOnPay,
  parseStatementFacts,
  parseTradingArrangements,
  type FilingFact,
} from "@/edgar/filingFacts";
import { CommitmentPaymentTimingSchema, noBuySellHold, type FilingDisclosures, type FilingRef, type GuidanceCheck } from "@/report/schema";

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
  return f?.ok && f.value ? f.value.data.rows.map(admittedStatementRow) : [];
}

function day(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/** Current normalized income statement currency; historical currencies do not override it. */
export function statementReportingCurrency(bundle: DataBundle): string | null {
  const quarterly = rowsOf(bundle.statements?.incomeQuarterly);
  const normalized = normalizeQuarterRows(quarterly.length > 0 ? quarterly : rowsOf(bundle.statements?.incomeAnnual));
  const latest = normalized.rows[0];
  if (!latest || normalized.rejected.some((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.period) && r.period >= latest.date!)) return null;
  return establishedCurrencyOn([latest], day(latest.date), statementCurrencyEvidence(bundle));
}

function symbolCurrency(symbol: string | null, statementCurrency: string | null): string | null {
  if (symbol === null) return null;
  if (symbol === "$") return statementCurrency;
  return SYMBOL_CURRENCY[symbol] ?? null;
}

/** Historical filing dollars belong to that reporting period, not today's currency. */
function periodReportingCurrency(bundle: DataBundle, end: string | null): string | null {
  if (end === null) return null;
  const quarterly = rowsOf(bundle.statements?.incomeQuarterly).filter((r) => day(r.date) === end);
  const normalized = normalizeQuarterRows(quarterly.length > 0 ? quarterly : rowsOf(bundle.statements?.incomeAnnual).filter((r) => day(r.date) === end));
  return establishedCurrencyOn(normalized.rows, end, statementCurrencyEvidence(bundle));
}

/**
 * The one currency every dated income row (quarterly and annual) is
 * established in, and the oldest row's date; null when any row is unknown,
 * in conflict, or in another currency.
 */
function singleCurrencyHistory(bundle: DataBundle): { currency: string; since: string } | null {
  const income = [...rowsOf(bundle.statements?.incomeQuarterly), ...rowsOf(bundle.statements?.incomeAnnual)].filter((row) => day(row.date) !== null);
  if (income.length === 0) return null;
  const evidence = statementCurrencyEvidence(bundle);
  const codes = new Set(income.map((row) => establishedCurrencyOn([row], day(row.date), evidence)));
  const currency = codes.size === 1 ? [...codes][0] : null;
  return currency === null || currency === undefined ? null : { currency, since: income.map((row) => day(row.date)!).sort()[0]! };
}

function releaseReportingCurrency(bundle: DataBundle, release: EarningsReleaseRecord): string | null {
  // Commentary-only exhibits may state the quarter end only in their table
  // headers. Those parsed three-month column dates are source evidence too.
  const end = release.reported.periodEnd ?? [...release.freeCashFlow, ...(release.reconciliation ?? [])]
    .filter((f) => f.months === 3).map((f) => f.periodEnd).sort().at(-1) ?? null;
  const covered = end !== null && [...rowsOf(bundle.statements?.incomeQuarterly), ...rowsOf(bundle.statements?.incomeAnnual)].some((row) => day(row.date) === end);
  if (end === null || !covered) {
    // Audit 2026-10-22 B-27: a release whose quarter no statement row covers
    // yet (its 10-Q is not filed or not in the statements), or that states no
    // quarter end, reports in the statements' currency when every income row
    // since before its period is established in that one currency.
    const history = singleCurrencyHistory(bundle);
    if (history !== null && history.since < (end ?? release.filingDate)) return history.currency;
  }
  return periodReportingCurrency(bundle, end);
}

function releaseCurrencyMatches(bundle: DataBundle, release: EarningsReleaseRecord, symbol: string | null, currency: string | null): boolean {
  return currency !== null && symbolCurrency(symbol, releaseReportingCurrency(bundle, release)) === currency;
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
  const documentType = exhibit === "EX-99.2" ? release.commentaryExhibit : exhibit === "EX-99.1" ? release.releaseExhibit : null;
  return {
    form: release.form ?? "8-K",
    accession: release.accession,
    exhibit: documentType === undefined ? exhibit : documentType,
    filingDate: release.filingDate,
    url: exhibit === "EX-99.2" ? release.commentaryUrl : release.releaseUrl,
  };
}

/**
 * Days past the newest statement period end before a release's own period
 * end is a later quarter: a 52/53-week calendar moves an end by days, a
 * quarter by about 91.
 */
const LATER_PERIOD_DAYS = 45;

/** The newest dated income-statement row, quarterly or annual. */
function newestStatementRow(bundle: DataBundle): FmpIncomeStatementRow | undefined {
  return [...rowsOf<FmpIncomeStatementRow>(bundle.statements?.incomeQuarterly), ...rowsOf<FmpIncomeStatementRow>(bundle.statements?.incomeAnnual)]
    .filter((row) => day(row.date) !== null).sort((a, b) => day(b.date)!.localeCompare(day(a.date)!))[0];
}

const PERIODIC_FORMS: ReadonlySet<string> = new Set(["10-Q", "10-K", "20-F", "40-F"]);

/**
 * Audit 2026-10-22 B-23: the newest periodic report on file whose period ends
 * a quarter or more after every statement row. Where its XBRL instance was
 * read, its facts were merged into companyfacts and the statements already
 * reach it, so this is null; otherwise the statements, TTM and multiples end
 * before a filing the issuer has made.
 */
export function newerPeriodicFiling(bundle: DataBundle): { filing: EdgarFiling; statementsEnd: string } | null {
  const newest = newestStatementRow(bundle);
  if (newest === undefined) return null;
  const statementsEnd = day(newest.date)!;
  const builtDay = bundle.builtAt.slice(0, 10);
  const filing = [bundle.edgar?.latestTenQ, bundle.edgar?.latestTenK]
    .flatMap((r) => r?.ok ? [r.value.data] : [])
    .filter((f) => PERIODIC_FORMS.has(f.form) && day(f.reportDate) !== null && day(f.filingDate) !== null && f.filingDate <= builtDay)
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0];
  if (filing === undefined) return null;
  const periodEnd = day(filing.reportDate)!;
  return periodEnd > statementsEnd && daysApart(periodEnd, statementsEnd) > LATER_PERIOD_DAYS ? { filing, statementsEnd } : null;
}

/**
 * Audit 2026-10-22 B-24: the newest results release reporting a period later
 * than the newest statement period. Statements come from XBRL filings, so a
 * quarter whose results 8-K is out before its 10-Q is in no statement, TTM or
 * multiple. The period is the release's stated quarter end, else its fiscal
 * label against the newest statement row's; a stated end four quarters
 * before the label's quarter is the year-ago comparison and is set aside, so
 * the label decides and the notice names no end. A release that states no results
 * (a deliveries or operational update) never counts.
 */
export function newerResultsRelease(bundle: DataBundle): { release: EarningsReleaseRecord; statementsEnd: string; reportedPeriodEnd: string | null } | null {
  const reports = currentReportsOf(bundle);
  if (reports === null) return null;
  const newest = newestStatementRow(bundle);
  if (newest === undefined) return null;
  const statementsEnd = day(newest.date)!;
  const fiscalYear = Number(newest.fiscalYear);
  const quarter = /^Q([1-4])$/.exec(String(newest.period ?? ""))?.[1] ?? (newest.period === "FY" ? "4" : null);
  const statementOrder = Number.isInteger(fiscalYear) && fiscalYear > 1900 && quarter !== null ? fiscalYear * 4 + Number(quarter) : null;
  for (const release of orderedEarningsReleases(reports.releases)) {
    if (release.reportsResults !== true || day(release.filingDate) === null || release.filingDate <= statementsEnd) continue;
    const { fiscal } = release.reported;
    const fiscalAhead = fiscal !== null && statementOrder !== null ? fiscal.fiscalYear * 4 + (fiscal.fiscalQuarter ?? 4) - statementOrder : null;
    // A stated end exactly four quarters before the quarter the fiscal label
    // implies is the year-ago comparison, not the release's own quarter end.
    const yearAgo = release.reported.periodEnd !== null && fiscalAhead !== null &&
      Math.round((Date.parse(`${release.reported.periodEnd}T00:00:00Z`) - Date.parse(`${statementsEnd}T00:00:00Z`)) / 86_400_000 / 91.3) === fiscalAhead - 4;
    const periodEnd = yearAgo ? null : release.reported.periodEnd;
    const later = periodEnd !== null ? periodEnd > statementsEnd && daysApart(periodEnd, statementsEnd) > LATER_PERIOD_DAYS
      : fiscalAhead !== null && fiscalAhead > 0;
    if (later) return { release, statementsEnd, reportedPeriodEnd: periodEnd };
  }
  return null;
}

/**
 * The notice's content. The release's headline revenue and diluted EPS are
 * shown only when both were read and their currency is established: an
 * explicit "US$", or "$" while the statements report in US dollars. They are
 * the issuer's unaudited figures and never enter a statement, TTM or multiple.
 */
function newerResultsNotice(bundle: DataBundle, currency: string | null): FilingDisclosures["newerResults"] | null {
  const found = newerResultsRelease(bundle);
  if (found === null) return null;
  const { release, statementsEnd } = found;
  const usd = (symbol: string): boolean => symbol === "US$" || (symbol === "$" && currency === "USD");
  const headline = release.headline;
  const shown = headline?.revenue && headline.epsDiluted && usd(headline.revenue.symbol) && usd(headline.epsDiluted.symbol) ? headline : null;
  return {
    source: releaseRef(release, release.resultsExhibit ?? (release.releaseUrl === null && release.commentaryUrl !== null ? "EX-99.2" : "EX-99.1")),
    reportedPeriod: release.reported.fiscal?.label ?? null,
    reportedPeriodEnd: found.reportedPeriodEnd,
    statementsEnd,
    revenue: shown?.revenue?.value ?? null,
    epsDiluted: shown?.epsDiluted?.value ?? null,
    currency: shown === null ? null : "USD",
  };
}

/** Legacy merged facts establish the filing, not which of its exhibits supplied a row. */
function earningsFactRef(release: EarningsReleaseRecord, source: EarningsFactSource | undefined): FilingRef {
  return source === undefined ? { ...releaseRef(release, null), url: null } : { ...source };
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
  /** Same-release, same-fiscal-year annual outlook, for comparability only. */
  annualRevenueComparison?: { periodLabel: string; fiscalYear: number; low: number; high: number; currency: string };
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
  const releases = orderedEarningsReleases(reports?.releases ?? []);
  const release = releases.find((r) => r.guidance?.items.some((i) => i.metric === "revenue" && i.period.fiscalQuarter !== null && forwardGuidance(i, releases)));
  if (!release || !release.guidance) return null;
  const quarterly = release.guidance.items.filter((i) => i.metric === "revenue" && i.period.fiscalQuarter !== null && i.basis !== "non-gaap" && forwardGuidance(i, releases));
  // The first guided quarter's first plausible guide: an out-of-band reading
  // never anchors, and never hands the anchor to a later quarter either.
  const item = quarterly.find((i) => i.period.label === quarterly[0]?.period.label && implausibleRevenueGuide(bundle, release, i) === null);
  if (!item || item.period.fiscalQuarter === null) return null;
  const sourceCurrency = releaseReportingCurrency(bundle, release);
  const currency = symbolCurrency(item.symbol, sourceCurrency);
  if (currency === null || currency !== statementReportingCurrency(bundle)) return null;
  const sameQuarter = (metric: GuidanceItem["metric"]): GuidanceItem | undefined =>
    release.guidance!.items.find((i) => i.metric === metric && i.period.label === item.period.label && (i.basis === "gaap" || i.basis === "unspecified"));
  const gm = sameQuarter("gross-margin");
  const opex = sameQuarter("operating-expenses");
  const opexOk = opex !== undefined && symbolCurrency(opex.symbol, sourceCurrency) === currency;
  const taxItems = release.guidance.items.filter((i) => i.metric === "tax-rate" && i.unit === "%" && (i.basis === "gaap" || i.basis === "unspecified"));
  const tax = taxItems.find((i) => i.period.label === item.period.label) ?? taxItems.find((i) => i.period.fiscalQuarter === null);
  const annual = release.guidance.items.filter((i) => i.metric === "revenue" && i.unit === "currency" && i.period.fiscalQuarter === null &&
    i.period.fiscalYear === item.period.fiscalYear && i.basis !== "non-gaap" && symbolCurrency(i.symbol, sourceCurrency) === currency &&
    Number.isFinite(i.low) && Number.isFinite(i.high) && i.low > 0 && i.high >= i.low && forwardGuidance(i, releases) &&
    implausibleRevenueGuide(bundle, release, i) === null);
  const annualRanges = new Map(annual.map(i => [`${i.low}|${i.high}`, i]));
  const annualComparison = annualRanges.size === 1 ? [...annualRanges.values()][0]! : null;
  return {
    periodLabel: item.period.label,
    fiscalYear: item.period.fiscalYear,
    fiscalQuarter: item.period.fiscalQuarter,
    low: item.low,
    mid: item.mid,
    high: item.high,
    currency,
    ...(annualComparison === null ? {} : { annualRevenueComparison: { periodLabel: annualComparison.period.label,
      fiscalYear: annualComparison.period.fiscalYear, low: annualComparison.low, high: annualComparison.high, currency } }),
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

function forwardGuidance(item: GuidanceItem, releases: readonly EarningsReleaseRecord[]): boolean {
  const latest = releases.find((release) => release.reported.fiscal !== null)?.reported.fiscal;
  if (!latest) return true;
  return item.period.fiscalQuarter === null ? item.period.fiscalYear > latest.fiscalYear ||
    (item.period.fiscalYear === latest.fiscalYear && latest.fiscalQuarter !== null && latest.fiscalQuarter < 4)
    : item.period.fiscalYear * 4 + item.period.fiscalQuarter > latest.fiscalYear * 4 + (latest.fiscalQuarter ?? 4);
}

/**
 * Audit 2026-10-22 B-25: a revenue outlook lies within 0.2-5x the revenue of the
 * latest quarter its release could see (a full-year outlook within 0.2-5x four
 * such quarters). Outside that band the release reader lost or misread a scale
 * ("$73" for "$73-76 billion"), so the guide is left out of the DCF anchor, the
 * outlook table and the checks against actuals, with this reason. With no
 * reported quarter to compare, the guide stands.
 */
export const REVENUE_GUIDE_BAND = { low: 0.2, high: 5 } as const;

function lastReportedQuarterRevenue(bundle: DataBundle, release: EarningsReleaseRecord): number | null {
  const cutoff = release.reported.periodEnd ?? release.filingDate;
  const rows = normalizeQuarterRows(rowsOf<FmpIncomeStatementRow>(bundle.statements?.incomeQuarterly)).rows
    .filter((row) => day(row.date) !== null && day(row.date)! <= cutoff && (num(row.revenue) ?? 0) > 0)
    .sort((a, b) => day(b.date)!.localeCompare(day(a.date)!));
  return rows.length > 0 ? num(rows[0]!.revenue) : null;
}

function implausibleRevenueGuide(bundle: DataBundle, release: EarningsReleaseRecord, item: GuidanceItem): string | null {
  if (item.metric !== "revenue" || item.unit !== "currency") return null;
  const quarter = lastReportedQuarterRevenue(bundle, release);
  if (quarter === null) return null;
  const base = item.period.fiscalQuarter === null ? quarter * 4 : quarter;
  if (item.low >= base * REVENUE_GUIDE_BAND.low && item.high <= base * REVENUE_GUIDE_BAND.high) return null;
  return `${item.period.label} revenue guide of ${item.mid} (8-K ${release.accession}) was left out: it is outside ${REVENUE_GUIDE_BAND.low}-${REVENUE_GUIDE_BAND.high}x the last reported quarter's revenue (${quarter})${item.period.fiscalQuarter === null ? " times four for a full year" : ""}, so its scale was misread.`;
}

function guidanceRows(items: readonly GuidanceItem[], currency: string | null, sourceCurrency: string | null, notes: string[], implausible: (item: GuidanceItem) => string | null): GuidanceRows {
  const rows: GuidanceRows = [];
  for (const item of items) {
    // The currency first: a guide in another currency is not a misread scale.
    if (item.unit !== "%" && item.unit !== "percentage-points") {
      const itemCurrency = symbolCurrency(item.symbol, sourceCurrency);
      if (itemCurrency === null || itemCurrency !== currency) {
        // Audit 2026-10-22 B-27: an unestablished currency is not a mismatch.
        notes.push(`Guidance for ${item.period.label} ${item.metric} printed in "${item.symbol ?? "no symbol"}" was left out: ${itemCurrency === null
          ? `its currency is not established${currency === null ? "" : ` (the statements report in ${currency})`}`
          : `that currency (${itemCurrency}) is not the statements' (${currency ?? "unestablished"})`}.`);
        continue;
      }
    }
    const misread = implausible(item);
    if (misread !== null) {
      notes.push(misread);
      continue;
    }
    rows.push({ period: item.period.label, metric: item.metric, basis: item.basis, unit: item.unit, low: item.low, mid: item.mid, high: item.high, form: item.form,
      ...(item.previous ? { previous: item.previous } : {}), ...(item.growth ? { growth: item.growth } : {}), ...(item.previousGrowth ? { previousGrowth: item.previousGrowth } : {}), ...(item.span ? { span: item.span } : {}), ...(item.headerSpan ? { headerSpan: item.headerSpan } : {}) });
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
  const income = normalizeQuarterRows(rowsOf<FmpIncomeStatementRow>(bundle.statements?.incomeQuarterly)).rows;
  const evidence = statementCurrencyEvidence(bundle);
  const source = bundle.statements?.incomeQuarterly?.ok ? `${bundle.statements.incomeQuarterly.value.source}:income-statement(quarter)` : "statements";
  const checks: GuidanceCheck[] = [];
  for (const guide of releases) {
    for (const item of guide.guidance?.items ?? []) {
      if (item.period.fiscalQuarter === null || (item.metric !== "revenue" && item.metric !== "gross-margin")) continue;
      if (item.metric === "gross-margin" && item.basis !== "gaap") continue;
      if (item.metric === "revenue" && !releaseCurrencyMatches(bundle, guide, item.symbol, currency)) continue;
      if (implausibleRevenueGuide(bundle, guide, item) !== null) continue;
      const reporter = releases.find((r) => r.reported.fiscal?.label === item.period.label && r.reported.periodEnd !== null && r.filingDate > guide.filingDate);
      if (!reporter || reporter.reported.periodEnd === null) continue;
      const row = income.find((r) => day(r.date) !== null && daysApart(day(r.date)!, reporter.reported.periodEnd!) <= 3);
      if (item.metric === "revenue" && (currency === null || !row || establishedCurrencyOn([row], day(row.date), evidence) !== currency)) continue;
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
function quarterReconciliation(bundle: DataBundle, releases: readonly EarningsReleaseRecord[], currency: string | null, metric: ReconciliationFact["metric"], periodEnd: string): number | null {
  for (const release of releases) {
    const facts = (release.reconciliation ?? []).filter(f => f.metric === metric && f.months === 3 && daysApart(f.periodEnd, periodEnd) <= 3 && releaseCurrencyMatches(bundle, release, f.symbol, currency));
    if (facts.length === 0) continue;
    const unit = metric.endsWith("eps") ? "currency-per-share" : "currency";
    const validDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
    if (facts.some(f => f.unit !== unit || !Number.isFinite(f.value) || !validDay(f.periodEnd) ||
      !validDay(f.source?.filingDate ?? release.filingDate) || f.periodEnd > (f.source?.filingDate ?? release.filingDate))) return null;
    const values = [...new Set(facts.map(f => f.value))];
    return values.length === 1 ? values[0]! : null;
  }
  return null;
}

/** Canonical mapped fields and full source identity; distinct values remain separate. */
function distinctDisclosureObservations<T extends { source: FilingRef }>(facts: T[]): T[] {
  const seen = new Set<string>();
  return facts.filter(f => {
    const s = f.source;
    const key = JSON.stringify({ ...f, source: [s.form, s.accession, s.filingDate, s.exhibit, s.url] });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type RevenueRestatement = { restatedFiling: Pick<EdgarFilingRef, "form" | "filed"> };
type RevenueOriginal = Pick<OriginalValue, "value" | "form" | "filed">;
type RevenuePresentation = Pick<EdgarFilingRef, "form" | "filed"> & { represented: boolean };

/**
 * The revenue re-presentation flag and first-reported copy a builder row carries
 * (`restatement` and `original` are extra row keys, not declared on the FMP row
 * type). Anything not shaped as the builder writes it counts as absent, so a
 * malformed stored row falls back to plain arithmetic.
 */
function revenueBasis(row: FmpIncomeStatementRow | undefined): { restated: RevenueRestatement | null; original: RevenueOriginal | null; supplied: string | null; presentation: RevenuePresentation | null } {
  const extra = row as unknown as { restatement?: unknown; original?: unknown; revenuePresentation?: unknown } | undefined;
  const isStr = (v: unknown): v is string => typeof v === "string" && v !== "";
  const flag = Array.isArray(extra?.restatement)
    ? (extra.restatement as unknown[]).find((x): x is { field: "revenue"; restatedFiling: { form: string; filed: string } } => {
      const o = x as { field?: unknown; restatedFiling?: { form?: unknown; filed?: unknown } } | null;
      return o !== null && typeof o === "object" && o.field === "revenue" && isStr(o.restatedFiling?.filed) && isStr(o.restatedFiling?.form);
    })
    : undefined;
  const o = (extra?.original as { revenue?: { value?: unknown; filed?: unknown; form?: unknown } } | undefined)?.revenue;
  const original = o !== undefined && o !== null && typeof o.value === "number" && Number.isFinite(o.value) && isStr(o.filed) && isStr(o.form)
    ? { value: o.value, form: o.form, filed: o.filed } : null;
  const p = extra?.revenuePresentation as { form?: unknown; filed?: unknown; represented?: unknown } | null | undefined;
  const presentation = p !== null && typeof p === "object" && isStr(p.form) && isStr(p.filed) && typeof p.represented === "boolean"
    ? { form: p.form.trim(), filed: p.filed, represented: p.represented } : null;
  const filings = row?.fieldProvenance?.revenue?.filings;
  const filed = Array.isArray(filings) ? filings.map((f) => f?.filed).filter(isStr).sort() : [];
  return { restated: flag ? { restatedFiling: flag.restatedFiling } : null, original, supplied: filed.length === 0 ? null : filed[filed.length - 1]!, presentation };
}

/**
 * FIN-511-V1 (OD-6): a growth cell divides two quarters on one filed
 * presentation. Where the comparison quarter was re-presented after the printed
 * quarter's own supplying filing, the cell divides by its first-reported copy
 * when that copy is on the printed quarter's basis; where the printed quarter
 * was re-presented after the comparison's supplying filing, and nothing
 * re-presents the comparison, there is no rate. Rows without provenance or
 * flags (the FMP route) take plain arithmetic.
 */
function oneBasisGrowth(row: FmpIncomeStatementRow, prior: FmpIncomeStatementRow | undefined, label: "YoY" | "QoQ", currency: string): { pct: number | null; note: string | null } {
  const revenue = num(row.revenue);
  const base = num(prior?.revenue);
  const plain = { pct: revenue === null || base === null || base <= 0 ? null : round((revenue / base - 1) * 100), note: null };
  if (revenue === null || base === null || prior === undefined) return plain;
  const a = revenueBasis(row);
  const b = revenueBasis(prior);
  const aEnd = day(row.date) ?? String(row.date);
  const bEnd = day(prior.date) ?? String(prior.date);
  if (b.restated !== null && a.restated === null && a.supplied !== null && b.restated.restatedFiling.filed > a.supplied) {
    const re = b.restated.restatedFiling;
    if (b.original !== null && b.original.filed <= a.supplied) {
      const o = b.original;
      if (o.value <= 0) return { pct: null, note: `${label} not shown: ${bEnd}'s first-reported revenue (${o.form} ${o.filed}) is not positive, and the ${re.form} of ${re.filed} re-presented it.` };
      return {
        pct: round((revenue / o.value - 1) * 100),
        note: `${label} uses ${bEnd}'s first-reported revenue ${formatFinancialValue(o.value, "currency", currency)} (${o.form} ${o.filed}): the ${re.form} of ${re.filed} re-presented it and ${aEnd} is still on the earlier presentation.`,
      };
    }
    return { pct: null, note: `${label} not shown: ${bEnd} was re-presented in ${re.form} ${re.filed} and has no copy on ${aEnd}'s presentation.` };
  }
  if (a.restated !== null && b.restated === null && b.supplied !== null && a.restated.restatedFiling.filed > b.supplied) {
    const re = a.restated.restatedFiling;
    return { pct: null, note: `${label} not shown: ${aEnd} was re-presented in ${re.form} ${re.filed} and no filing re-presents ${bEnd}, so the two quarters are on different presentations.` };
  }
  // Task 7's rule (b) applied to the pair: the printed quarter's filing re-presented earlier periods of the concept
  // and the earlier filing that supplies the comparison did not, so the two quarters sit on different presentations.
  // Equal dates, both re-presenting, or neither leave the cell alone. A row without the marker keeps plain arithmetic.
  if (a.presentation !== null && b.presentation !== null && b.presentation.filed < a.presentation.filed && a.presentation.represented && !b.presentation.represented) {
    return {
      pct: null,
      note: `${label} not shown: the ${a.presentation.form} of ${a.presentation.filed} that supplies ${aEnd} re-presented earlier periods' revenue and the ${b.presentation.form} of ${b.presentation.filed} that supplies ${bEnd} did not, so the two quarters are on different presentations.`,
    };
  }
  return plain;
}

function quarterlyTrend(bundle: DataBundle, releases: readonly EarningsReleaseRecord[], currency: string | null, notes: string[]): FilingDisclosures["quarterlyTrend"] {
  const normalizedIncome = normalizeQuarterRows(rowsOf<FmpIncomeStatementRow>(bundle.statements?.incomeQuarterly));
  const normalizedCash = normalizeQuarterRows(rowsOf<FmpCashFlowRow>(bundle.statements?.cashflowQuarterly));
  for (const [label, normalized] of [["income", normalizedIncome], ["cash-flow", normalizedCash]] as const) {
    for (const rejection of normalized.rejected) notes.push(`Quarterly ${label} trend: ${rejection.reason}.`);
  }
  if (currency === null) {
    if (normalizedIncome.rows.length > 0) notes.push("Quarterly trend left out: the current income statement's reporting currency is not established.");
    return [];
  }
  const evidence = statementCurrencyEvidence(bundle);
  const compatibleIncome: FmpIncomeStatementRow[] = [];
  for (const row of normalizedIncome.rows) {
    if (establishedCurrencyOn([row], day(row.date), evidence) !== currency) {
      notes.push(`Quarterly trend history stops before ${row.date}: its reporting currency is unknown or differs from current ${currency}; no currency conversion is assumed.`);
      break;
    }
    compatibleIncome.push(row);
  }
  const byDate = <T extends FmpRawRow>(rows: T[]): Map<string, T> => {
    const out = new Map<string, T>();
    for (const r of rows) {
      const d = day(r.date);
      if (d !== null) out.set(d, r);
    }
    return out;
  };
  const income = byDate(compatibleIncome);
  const cash = byDate(normalizedCash.rows.filter((row) => {
    if (!income.has(row.date!)) return false;
    if (establishedCurrencyOn([row], day(row.date), evidence) === currency) return true;
    notes.push(`Quarterly cash-flow amounts for ${row.date} left out: reporting currency is unknown or differs from current ${currency}.`);
    return false;
  }));
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
    const growthNotes: string[] = [];
    const growth = (prior: FmpIncomeStatementRow | undefined, label: "YoY" | "QoQ"): number | null => {
      const g = oneBasisGrowth(r, prior, label, currency);
      if (g.note !== null) growthNotes.push(g.note);
      return g.pct;
    };
    const ocf = num(c?.operatingCashFlow) ?? num(c?.netCashProvidedByOperatingActivities);
    const capex = num(c?.capitalExpenditure);
    const year = typeof r.fiscalYear === "number" ? String(r.fiscalYear) : r.fiscalYear;
    const period = typeof r.period === "string" ? r.period.trim().toUpperCase() : null;
    let operatingExpenses = num(r.operatingExpenses);
    const source = bundle.statements.incomeQuarterly;
    const expenseProof = r.fieldProvenance?.operatingExpenses;
    // Old SEC adapter rows filled this field from whichever R&D/SG&A
    // components existed. Preserve the observations, but never promote that
    // unprovenanced subset into a complete total in a regenerated report.
    if (operatingExpenses !== null && source.ok && source.value.source === "edgar" &&
      (expenseProof?.source !== "edgar" || !expenseProof.tags.includes("us-gaap/OperatingExpenses") || expenseProof.periodEnd !== d || expenseProof.unit !== currency)) {
      notes.push(`Operating expenses for ${d} withheld: the retained SEC row does not establish a complete, period- and currency-matched total; R&D/SG&A components alone are insufficient.`);
      operatingExpenses = null;
    }
    return {
      periodEnd: d,
      fiscalLabel: typeof year === "string" && /^\d{4}$/.test(year) && period !== null && /^Q[1-4]$/.test(period) ? `${period} FY${year}` : null,
      revenue,
      revenueYoyPct: growth(near(d, 350, 380), "YoY"),
      revenueQoqPct: growth(near(d, 80, 100), "QoQ"),
      ...(growthNotes.length === 0 ? {} : { revenueGrowthNotes: growthNotes }),
      grossMarginPct: pct(num(r.grossProfit)),
      operatingExpenses,
      operatingMarginPct: pct(num(r.operatingIncome)),
      epsDiluted: num(r.epsDiluted),
      operatingCashFlow: ocf,
      freeCashFlow: ocf !== null && capex !== null ? ocf - Math.abs(capex) : num(c?.freeCashFlow),
      ...(releases.length === 0 ? {} : {
        equitySecuritiesGains: quarterReconciliation(bundle, releases, currency, "equity-securities-gains", d),
        nonGaapEpsDiluted: quarterReconciliation(bundle, releases, currency, "non-gaap-diluted-eps", d),
      }),
    };
  });
}

/** D-63: the disclosure for segment cells filled as the quarter's total less the axis's other rows. */
export function residualNote(axisLabel: string, cells: number): string {
  return `Segment XBRL, ${axisLabel}: ${cells} quarter value${cells === 1 ? " is" : "s are"} the quarter's total revenue less the axis's other ` +
    "top-level rows (the rows sum to the total in the latest quarter). Residuals require the total and known cells to share a filing presentation " +
    "that names the missing member; unmapped historical members and pooled cross-filing derivations do not establish that continuity.";
}

/** Null when the bundle carries none of this evidence (old bundles, fixtures). */
export function buildFilingDisclosures(bundle: DataBundle): FilingDisclosures | undefined {
  const reports = currentReportsOf(bundle);
  const segmentsRes = bundle.edgar?.quarterlySegments;
  const segments = segmentsRes?.ok ? segmentsRes.value.data : null;
  const currency = statementReportingCurrency(bundle);
  const releases = orderedEarningsReleases(reports?.releases ?? []);
  const notes: string[] = selectedGeographyNotes(bundle.segmentation?.geographic);
  const trend = quarterlyTrend(bundle, releases, currency, notes);
  const interim = segmentPrimarySection(bundle);
  const segmentCurrency = interim === null ? null : periodReportingCurrency(bundle, day(interim.data.reportDate));
  const segmentPerformance = interim !== null && segmentCurrency === currency
    ? parseSegmentPerformance(interim.data.text, day(interim.data.reportDate), segmentCurrency).map((row) => ({ ...row, source: interim.ref })) : [];
  const { facts: filingFacts, outlook: commentaryOutlook } = filingFactRows(bundle, currency, releases, notes);
  const officerChanges = officerChangeRows(reports, bundle);
  const sayOnPay = sayOnPayRow(reports);
  const tradingArrangements = tradingArrangementRows(bundle);
  const primaryStatements = bundle.companyIrMaterialEvents;
  const companyStatements: NonNullable<FilingDisclosures["companyStatements"]> = primaryStatements?.ok
    ? primaryStatements.value.data.events.filter((event) => event.symbol === bundle.symbol && day(event.publishedAt) !== null &&
      event.publishedAt.slice(0, 10) <= bundle.builtAt.slice(0, 10) && /^https:\/\/[^\s]+$/.test(event.url) && /^[a-f0-9]{64}$/.test(event.sourceHash) &&
      event.authorityChain.length >= 2 && event.authorityChain.at(-1) === event.url).slice(0, 3).map((event) => ({
        form: null, symbol: event.symbol, category: event.category, status: event.status, title: event.title, text: event.text,
        url: event.url, publishedAt: event.publishedAt, observedAt: event.observedAt, sourceHash: event.sourceHash,
        authorityChain: [...event.authorityChain], originalChars: event.originalChars, span: { ...event.span },
        consideration: null, funding: null,
        limitations: "Bounded official company statements, not a comprehensive transaction or leadership ledger. Completion is issuer-stated, not independently verified. Consideration and funding remain unestablished by this reader.",
      })) : [];
  if (reports === null && segments === null && trend.length === 0 && filingFacts.length === 0 && segmentPerformance.length === 0 && tradingArrangements.length === 0 && notes.length === 0 && companyStatements.length === 0 &&
    newerPeriodicFiling(bundle) === null) return undefined;

  for (const release of releases) {
    const sourceCurrency = releaseReportingCurrency(bundle, release);
    if (sourceCurrency === null || sourceCurrency !== currency) notes.push(`Implicit-dollar amounts from 8-K ${release.accession} (reported period ${release.reported.periodEnd ?? "unknown"}) are left out: that period's statement currency is ${sourceCurrency ?? "unestablished"}, rather than current ${currency ?? "unestablished"}. Explicit currency labels are checked separately.`);
  }

  const guided = releases.find((r) => r.guidance?.items.some((i) => forwardGuidance(i, releases)));
  const guidance: FilingDisclosures["guidance"] = guided && guided.guidance
    ? {
        source: releaseRef(guided, guided.guidanceExhibit),
        reportedPeriod: guided.reported.fiscal?.label ?? null,
        reportedPeriodEnd: guided.reported.periodEnd,
        rows: guidanceRows(guided.guidance.items.filter((i) => forwardGuidance(i, releases)), currency, releaseReportingCurrency(bundle, guided), notes,
          (item) => implausibleRevenueGuide(bundle, guided, item)),
        qualifiers: guided.guidance.qualifiers.map((q) => safeText(q, "An issuer outlook caveat is withheld from display by the rating-language filter; see the release.")),
      }
    : null;
  if (releases.length > 0 && guided === undefined) notes.push("No structured quarterly guidance rows were extracted from the retained releases; separately sourced narrative guidance may still be available.");

  const latest = releases[0];
  // A dated issuer production statement remains visible even if model prose
  // chooses a weaker or earlier roadmap description. Keep the source wording.
  for (const sentence of splitSentences(latest?.releaseNarrative ?? "").filter((s) => /\bnow in full production\b/i.test(s)).slice(0, 2)) {
    if (sentence.length <= 500) notes.push(`Issuer production milestone (8-K EX-99.1 ${latest!.accession}, filed ${latest!.filingDate}): ${sentence}`);
  }
  const freeCashFlow = latest
    ? distinctDisclosureObservations(latest.freeCashFlow
      .filter((f) => releaseCurrencyMatches(bundle, latest, f.symbol, currency))
      .map((f) => ({ periodEnd: f.periodEnd, months: f.months, value: f.value, source: earningsFactRef(latest, f.source) })))
    : [];
  const fcfDefinitions = new Set((latest?.freeCashFlow ?? [])
    .filter(f => releaseCurrencyMatches(bundle, latest!, f.symbol, currency)).map(f => f.definition));
  if (fcfDefinitions.size > 1) notes.push("Retained issuer FCF observations do not share a single definition; no common definition is asserted. Consult their supplying documents.");
  const capital = latest?.capitalReturn;
  const capitalCurrency = (symbol: string | undefined, release = latest): boolean => release !== undefined && releaseCurrencyMatches(bundle, release, symbol ?? "$", currency);
  let capitalReturn: FilingDisclosures["capitalReturn"] = latest && capital && currency !== null &&
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
        dividendChangeFrom: capital.dividendChange && capitalCurrency(capital.dividendChange.symbol) ? capital.dividendChange.from : null,
        dividendChangeTo: capital.dividendChange && capitalCurrency(capital.dividendChange.symbol) ? capital.dividendChange.to : null,
      }
    : null;
  // Reuse the strict issuer / primary-document / filing-date admission used
  // for quarterly segment facts. A retained dated MD&A balance is evidence
  // even when the earnings release did not repeat it. AMZN audit 2026-10-20
  // finding 20: the notes are read too, and "we have $X remaining under" is
  // the issuer's sentence as much as "$X remained under". Amazon states its
  // authorization only in the equity note, so the report showed the $6.1B
  // from the notes and also said no authorization was read from the filings.
  const sections = [segmentPrimarySection(bundle), segmentPrimarySection(bundle, "notes")].filter((s): s is NonNullable<typeof s> => s !== null);
  // Both are sections of the latest 10-Q, so they share its reference and period.
  const primary = sections[0];
  if (primary && currency !== null && periodReportingCurrency(bundle, primary.data.reportDate) === currency &&
    (capitalReturn?.authorizationRemaining == null || primary.ref.filingDate > capitalReturn.source.filingDate)) {
    const candidates = sections.flatMap(section => splitSentences(section.data.text)).flatMap(sentence => {
      const match = /\bAs of ([A-Z][a-z]+ \d{1,2}, 20\d{2}),? (?:(?:we|the company) (?:have|has|had) )?(?:a total of )?((?:US)?\$\s?[\d.,]+\s*(?:billion|million)) (?:remained|was remaining|remaining) under (?:our|the|its) (?:[A-Z][a-z]+ 20\d{2} )?(?:share |stock )?repurchase (?:authority|authorization|program)\b/i.exec(sentence);
      if (!match) return [];
      const stamp = Date.parse(match[1]!);
      const asOf = Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0,10) : null;
      const amount = moneyMentions(match[2]!)[0];
      return asOf === primary.data.reportDate && amount && symbolCurrency(amount.symbol, currency) === currency && amount.value >= 0
        ? [{ asOf, value: amount.value }] : [];
    });
    if (candidates.length && new Set(candidates.map(candidate => candidate.value)).size === 1) {
      const candidate=candidates[0]!;
      capitalReturn = { ...(capitalReturn ?? { source: primary.ref, returned: null, returnedPeriod: null, authorizationRemaining: null, authorizationAdded: null,
        dividendPerShare: null, dividendPayDate: null, dividendRecordDate: null, dividendChangeFrom: null, dividendChangeTo: null }),
        authorizationRemaining: candidate.value, authorizationRemainingAsOf: candidate.asOf, authorizationRemainingSource: primary.ref };
      delete capitalReturn.authorizationRemainingApproximate;
      notes.push(`Remaining repurchase authorization is dated ${candidate.asOf}, from ${primary.ref.form} ${primary.ref.accession}, filed ${primary.ref.filingDate}; authority is discretionary and does not establish funded future repurchases.`);
    }
  }
  // A dividend change or added authorization announced in an earlier release
  // of the window is still news the latest release does not repeat.
  for (const earlier of releases.slice(1)) {
    const change = earlier.capitalReturn.dividendChange;
    if (change && capitalReturn?.dividendChangeTo == null && capitalCurrency(change.symbol, earlier)) {
      notes.push(`Quarterly dividend raised from ${change.from} to ${change.to} ${currency ?? ""} per share (8-K ${earlier.accession}, filed ${earlier.filingDate}).`.replace("  ", " "));
    }
    const added = earlier.capitalReturn.authorizationAdded;
    if (added && capitalCurrency(added.symbol, earlier) && capitalReturn?.authorizationAdded == null) {
      notes.push(`Share repurchase authorization increased by ${scaledMoney(added.value)} ${currency ?? ""} (8-K ${earlier.accession}, filed ${earlier.filingDate}).`.replace("  ", " "));
    }
  }

  const events: FilingDisclosures["events"] = (reports?.events ?? []).map((e) => {
    let summaryCorrection: FilingDisclosures["events"][number]["summaryCorrection"];
    const parts = e.sections
      .filter((s) => s.incorporates === null || e.sections.length === 1)
      .flatMap((s) => {
        const stripped = withoutLegacyPrincipalAnnotation(s.summary);
        // Unaffected summaries may retain full-source sentences beyond the
        // cached text boundary. Re-derive only the exact legacy-marker cases.
        const rederive = stripped !== s.summary && s.incorporates === null && s.text.trim() !== "";
        const summary = rederive ? summarizeItem(s) : stripped;
        if (summary !== s.summary && stripped !== s.summary) summaryCorrection = rederive ? "source-principal-summary-rederived" : "legacy-principal-total-withheld";
        return [`Item ${s.item}: ${summary}`, ...materialCreditSupportClauses(s.text).filter((clause) => !summary.includes(clause)).map((clause) => `Item ${s.item}: ${clause}`)];
      });
    // Whole source clauses: never cut off a condition or turn an option into
    // a commitment. These terms are visible even when model prose omits them.
    const kept: string[] = [];
    for (const part of parts) if ([...kept, part].join(" ").length <= 1_400) kept.push(part);
    const joined = kept.join(" ");
    return {
      filingDate: e.filingDate,
      eventDate: e.eventDate,
      accession: e.accession,
      form: e.form,
      items: e.items,
      summary: safeText(joined || "No item text could be read from the filing.", "Summary withheld from display by the report's rating-language filter; see the filing."),
      ...(summaryCorrection === undefined ? {} : { summaryCorrection }),
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
  const reconciliation: NonNullable<FilingDisclosures["reconciliation"]> = latest
    ? distinctDisclosureObservations((latest.reconciliation ?? []).filter((f) => releaseCurrencyMatches(bundle, latest, f.symbol, currency))
      .map((f) => ({ metric: f.metric, periodEnd: f.periodEnd, months: f.months, value: f.value, unit: f.unit, source: earningsFactRef(latest, f.source) })))
    : [];
  const commitmentRelease = releases.find((r) => (r.commitments ?? []).length > 0);
  const validTimingDay = (value: string | null): value is string => value !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const cutoff = bundle.builtAt.slice(0, 10);
  const commitmentAvailable = commitmentRelease !== undefined && validTimingDay(commitmentRelease.filingDate) &&
    validTimingDay(cutoff) && commitmentRelease.filingDate <= cutoff;
  type CommitmentEvidence = NonNullable<EarningsReleaseRecord["commitments"]>[number];
  const commitmentRef = (table: CommitmentEvidence): FilingRef => table.source ??
    releaseRef(commitmentRelease!, commitmentRelease?.commitmentsExhibit ?? "EX-99.1");
  const commitmentNarrative = (table: CommitmentEvidence): string | null | undefined => {
    if (!table.source) return commitmentRelease?.commitmentsExhibit === "EX-99.2"
      ? commitmentRelease.commentaryNarrative : commitmentRelease?.releaseNarrative;
    const commentary = releaseRef(commitmentRelease!, "EX-99.2");
    const release = releaseRef(commitmentRelease!, "EX-99.1");
    if (table.source.exhibit === commentary.exhibit && table.source.url === commentary.url) return commitmentRelease?.commentaryNarrative;
    if (table.source.exhibit === release.exhibit && table.source.url === release.url) return commitmentRelease?.releaseNarrative;
    return null;
  };
  const sameAggregate = (candidate: NonNullable<EarningsReleaseRecord["commitments"]>[number], table: NonNullable<EarningsReleaseRecord["commitments"]>[number]): boolean =>
    candidate.kind === table.kind && candidate.asOf === table.asOf && candidate.total === table.total &&
    candidate.rows.length === table.rows.length && candidate.rows.every((row, index) =>
      row.label === table.rows[index]!.label && row.total === table.rows[index]!.total);
  const reproducedAggregate = (table: NonNullable<EarningsReleaseRecord["commitments"]>[number]) => {
    // An optional null/primitive/corrupt schedule cannot erase independently
    // reproducible aggregate evidence or supply an invented currency.
    const retainedText = table.paymentTiming?.sourceText;
    const sourceText = typeof retainedText === "string" && retainedText.length <= 2_000 ? retainedText : commitmentNarrative(table);
    if (typeof sourceText !== "string") return undefined;
    const explicitSymbol = table.paymentTiming?.currencySymbol;
    return parseCommitmentTables(sourceText).find(candidate => sameAggregate(candidate, table) &&
      (typeof explicitSymbol !== "string" || candidate.paymentTiming?.currencySymbol === explicitSymbol));
  };
  const timingSourceMatches = (table: CommitmentEvidence): boolean => {
    const sourceText = table.paymentTiming?.sourceText;
    if (typeof sourceText !== "string" || sourceText.length > 2_000) return false;
    const retained = CommitmentPaymentTimingSchema.safeParse(table.paymentTiming);
    if (!retained.success) return false;
    return parseCommitmentTables(sourceText).some(candidate => {
      if (candidate.kind !== table.kind || candidate.asOf !== table.asOf || candidate.total !== table.total ||
        candidate.paymentTiming?.currencySymbol !== table.paymentTiming?.currencySymbol ||
        candidate.rows.length !== table.rows.length || candidate.rows.some((row, index) =>
          row.label !== table.rows[index]!.label || row.total !== table.rows[index]!.total)) return false;
      const reconstructed = CommitmentPaymentTimingSchema.safeParse(candidate.paymentTiming);
      return retained.success && reconstructed.success && JSON.stringify(reconstructed.data) === JSON.stringify(retained.data);
    });
  };
  const commitmentName = (table: CommitmentEvidence, index: number, all: readonly CommitmentEvidence[]) =>
    table.kind === "guarantees" ? "guarantees (maximum gross exposure)"
      : all.findIndex(t => t.kind === "commitments" && commitmentRef(t).exhibit === commitmentRef(table).exhibit &&
        commitmentRef(t).url === commitmentRef(table).url) === index ? "future commitments" : "additional commitments";
  const commitments: NonNullable<FilingDisclosures["commitments"]> = commitmentRelease
    ? (commitmentRelease.commitments ?? []).flatMap((table, index, all) => {
        // New schedules retain the actual symbol. In particular, explicit US$
        // cannot be rebound to EUR merely because the issuer reports in EUR.
        // Legacy records keep their prior aggregate-only currency convention.
        const reproduced = table.paymentTiming === undefined ? undefined : reproducedAggregate(table);
        const symbol = table.paymentTiming === undefined ? "$" : reproduced?.paymentTiming?.currencySymbol ?? null;
        if (!releaseCurrencyMatches(bundle, commitmentRelease, symbol, currency)) return [];
        if (table.paymentTiming !== undefined && (!commitmentAvailable || !validTimingDay(table.asOf) ||
          table.asOf > commitmentRelease.filingDate || reproduced === undefined)) return [];
        const name = commitmentName(table, index, all);
        const source = commitmentRef(table);
        // Saved bundles may carry the former parser's date borrowed from an
        // adjacent commitments table. Re-establish guarantee dates from the
        // same exhibit's own table, including during deterministic replay.
        const sourceNarrative = commitmentNarrative(table);
        const localGuarantee = table.kind === "guarantees" ? parseCommitmentTables(sourceNarrative ?? "").find((candidate) =>
          candidate.kind === "guarantees" && candidate.total === table.total &&
          candidate.rows.length === table.rows.length && candidate.rows.every((row, i) =>
            row.label === table.rows[i]!.label && row.total === table.rows[i]!.total)) : undefined;
        const asOf = table.kind === "guarantees" ? localGuarantee?.asOf ?? null : table.asOf;
        if (table.kind === "guarantees" && localGuarantee !== undefined) {
          const header = /The following table summarizes the maximum gross exposure related to our guarantees[^:]{0,220}\(in (?:billions|millions)\)/i.exec(sourceNarrative ?? "")?.[0];
          if (header !== undefined) notes.push(`Guarantee table scope (${source.form} ${source.exhibit}, filed ${source.filingDate}): ${header}.`);
        }
        return [
          ...table.rows.map((row) => ({ kind: table.kind, table: name, asOf, label: safeText(row.label, "(row label withheld)"), total: row.total, tableTotal: false, source })),
          ...(table.total === null ? [] : [{ kind: table.kind, table: name, asOf, label: "Total", total: table.total, tableTotal: true, source }]),
        ];
      })
    : [];
  const commitmentPaymentTiming: NonNullable<FilingDisclosures["commitmentPaymentTiming"]> = commitmentRelease
    ? (commitmentRelease.commitments ?? []).flatMap((table, index, all) => {
        if (table.paymentTiming === undefined) return [];
        const parsed = CommitmentPaymentTimingSchema.safeParse(table.paymentTiming);
        if (!parsed.success) {
          notes.push("A retained commitment timing record has an invalid structure; its raw bundle evidence remains retained, but no schedule is admitted.");
          return [];
        }
        const timing = parsed.data;
        const compatibleCurrency = releaseCurrencyMatches(bundle, commitmentRelease, timing.currencySymbol, currency);
        const dated = commitmentAvailable && validTimingDay(table.asOf) && table.asOf <= commitmentRelease.filingDate;
        const sourceMatches = timingSourceMatches(table);
        const scopeReason = [
          compatibleCurrency ? null : "The table's monetary currency is not established on a compatible source-period basis; numeric payment timing is withheld.",
          dated ? null : "The table lacks a valid as-of/filing date available by the analysis date; numeric payment timing is withheld.",
          sourceMatches ? null : "Structured payment timing does not reproduce from the retained supplying table; numeric payment timing is withheld.",
        ].filter((reason): reason is string => reason !== null);
        const admitted = compatibleCurrency && dated && sourceMatches;
        return [{
          ...timing,
          kind: table.kind,
          table: commitmentName(table, index, all),
          tableIndex: table.sourceTableIndex ?? index,
          asOf: table.asOf,
          currency: compatibleCurrency ? currency : null,
          source: commitmentRef(table),
          coverage: admitted ? timing.coverage : "unavailable" as const,
          rows: admitted ? timing.rows : timing.rows.map(row => ({ ...row, total: null,
            buckets: row.buckets.map(bucket => ({ ...bucket, amount: null })),
            reconciliation: { status: "unknown" as const, bucketSum: null, residual: null },
          })),
          reason: [timing.reason, ...scopeReason].filter(Boolean).join(" ") || null,
        }];
      })
    : [];
  const basisNote = releases.find((r) => typeof r.nonGaapBasisNote === "string")?.nonGaapBasisNote ?? null;
  const newerResults = newerResultsNotice(bundle, currency);
  const newerFilingFound = newerPeriodicFiling(bundle);
  const newerFiling: FilingDisclosures["newerFiling"] | null = newerFilingFound === null ? null : {
    source: { form: newerFilingFound.filing.form, accession: newerFilingFound.filing.accessionNumber, exhibit: null, filingDate: newerFilingFound.filing.filingDate, url: null },
    periodEnd: day(newerFilingFound.filing.reportDate)!,
    statementsEnd: newerFilingFound.statementsEnd,
  };
  // D-66: the notes', statements' and commentary's facts; officers and votes.

  return {
    version: "1.0.0",
    currency,
    currencyBasis: currency === null
      ? "The current statement reporting currency is not established, so no amount printed in an 8-K exhibit is given a currency; those amounts are left out."
      : `Amounts printed with "$" in issuer filings are shown only when the source period's statement currency is established as current ${currency}; explicit currency labels are checked separately. XBRL amounts carry their own ISO unit.`,
    guidance,
    guidanceChecks: guidanceChecks(bundle, releases, currency),
    freeCashFlow,
    freeCashFlowDefinition: fcfDefinitions.size === 1 ? [...fcfDefinitions][0] ?? null : null,
    capitalReturn,
    events,
    ...(companyStatements.length === 0 ? {} : { companyStatements }),
    segments: segmentTables,
    ...(segmentPerformance.length === 0 ? {} : { segmentPerformance }),
    quarterlyTrend: trend,
    ...(reconciliation.length === 0 ? {} : { reconciliation }),
    ...(commitments.length === 0 ? {} : { commitments }),
    ...(commitmentPaymentTiming.length === 0 ? {} : { commitmentPaymentTiming }),
    ...(basisNote === null ? {} : { nonGaapBasisNote: safeText(basisNote, "The issuer's non-GAAP basis note is withheld from display by the rating-language filter; see the release.") }),
    ...(filingFacts.length === 0 ? {} : { filingFacts }),
    ...(commentaryOutlook.length === 0 ? {} : { commentaryOutlook }),
    ...(officerChanges.length === 0 ? {} : { officerChanges }),
    ...(sayOnPay === null ? {} : { sayOnPay }),
    ...(tradingArrangements.length === 0 ? {} : { tradingArrangements }),
    ...(newerResults === null ? {} : { newerResults }),
    ...(newerFiling === null ? {} : { newerFiling }),
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

/**
 * New segment margins require their own primary-document admission, not the
 * legacy section wrapper. `part` picks Item 2 (MD&A) or Item 1 (the notes) of
 * the same 10-Q, under the same admission.
 */
function segmentPrimarySection(bundle: DataBundle, part: "mdna" | "notes" = "mdna"): ReturnType<typeof sectionRef> {
  const edgar = bundle.edgar;
  const section = part === "mdna" ? edgar?.tenQMdna : edgar?.tenQNotes;
  const item = part === "mdna" ? { sectionName: "tenQItem2", label: "Item 2" } : { sectionName: "tenQNotes", label: "Item 1" };
  const filing = edgar?.latestTenQ;
  const identity = edgar?.cik;
  if (!section?.ok || section.value.source !== "edgar" || !filing?.ok || filing.value.source !== "edgar" || !identity?.ok) return null;
  const mapping = identity.value.data;
  if (!Number.isSafeInteger(mapping.cik) || mapping.cik <= 0 || !/^\d{10}$/.test(mapping.cik10) || mapping.cik10 !== String(mapping.cik).padStart(10, "0")) return null;
  const requested = bundle.symbol.trim().toUpperCase();
  const registrant = edgar.registrant;
  const mappedBySec = identity.value.source === "edgar" && mapping.ticker.trim().toUpperCase() === requested;
  const confirmedByRegistrant = registrant != null && registrant.cik10 === mapping.cik10 && registrant.tickers.some((ticker) => ticker.trim().toUpperCase() === requested);
  if (requested === "" || (!mappedBySec && !confirmedByRegistrant)) return null;
  const data = section.value.data, metadata = filing.value.data;
  const validDay = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const cutoff = bundle.builtAt.slice(0, 10);
  if (!validDay(cutoff) || !Number.isFinite(Date.parse(bundle.builtAt)) || !validDay(data.reportDate) || !validDay(data.filingDate) ||
    data.reportDate > data.filingDate || data.filingDate > cutoff || data.form !== metadata.form || !/^10-Q(?:\/A)?$/.test(data.form) ||
    data.sectionName !== item.sectionName || data.reportDate !== metadata.reportDate || data.filingDate !== metadata.filingDate ||
    section.value.asOf !== data.reportDate || data.accession !== metadata.accessionNumber || !/^\d{10}-\d{2}-\d{6}$/.test(data.accession) ||
    !/^[a-zA-Z0-9_.-]+\.html?$/i.test(metadata.primaryDocument) || !Number.isFinite(Date.parse(section.value.fetchedAt))) return null;
  const url = `https://www.sec.gov/Archives/edgar/data/${mapping.cik}/${data.accession.replaceAll("-", "")}/${metadata.primaryDocument}`;
  if (data.documentUrl !== url || (section.value.endpoint !== url && section.value.endpoint !== `${url} (${data.form} ${item.label})`) ||
    filing.value.endpoint !== `https://data.sec.gov/submissions/CIK${mapping.cik10}.json`) return null;
  return sectionRef(section);
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
function filingFactRows(bundle: DataBundle, currency: string | null, releases: readonly EarningsReleaseRecord[], omissionNotes: string[]): { facts: FilingFactRow[]; outlook: OutlookRow[] } {
  const facts: FilingFactRow[] = [];
  const add = (found: readonly FilingFact[], sourceTag: string, source: FilingRef, sourceCurrency: string | null): void => {
    for (const f of found) {
      if (f.unit === "currency" && (currency === null || symbolCurrency(f.symbol, sourceCurrency) !== currency)) {
        const omission = `Monetary facts from ${sourceTag} left out: source-period currency ${sourceCurrency ?? "unestablished"} or explicit symbol ${f.symbol ?? "none"} does not establish current ${currency ?? "unestablished"}.`;
        if (!omissionNotes.includes(omission)) omissionNotes.push(omission);
        continue;
      }
      // The MD&A repeats the notes' supply commitments: one row per fact.
      if (facts.some((row) => row.key === f.key && row.label === f.label && row.asOf === f.asOf && row.value === f.value)) continue;
      facts.push({ key: f.key, label: safeText(f.label, "(fact label withheld)"), value: f.value, unit: f.unit, asOf: f.asOf, period: f.period,
        qualifier: f.qualifier, computed: f.computed, sourceTag, source, text: safeText(f.text, "The source sentence is withheld from display by the rating-language filter.") });
    }
  };
  const concentrationScope = (section: ExtractedSection): { asOf: string | null; fiscalYear: number | null; quarter: number | null } => {
    const asOf = day(section.reportDate);
    const releaseFiscal = releases.find((r) => r.reported.periodEnd === asOf)?.reported.fiscal;
    const annualRows = bundle.statements.incomeAnnual;
    const annual = annualRows.ok ? annualRows.value.data.rows.find((r) => day(r.date) === asOf) : undefined;
    const annualYear = typeof annual?.fiscalYear === "string" && /^\d{4}$/.test(annual.fiscalYear) ? Number(annual.fiscalYear) : null;
    return { asOf, fiscalYear: releaseFiscal?.fiscalYear ?? annualYear, quarter: section.form === "10-K" ? null : releaseFiscal?.fiscalQuarter ?? null };
  };
  // Prefer MD&A's revenue paragraph: it also states the separate indirect-
  // customer estimate. Notes supply receivables shares and extended terms.
  const mdna = sectionRef(bundle.edgar?.tenQMdna);
  if (mdna !== null) add(parseCustomerConcentrationFacts(mdna.data.text, concentrationScope(mdna.data)), "edgar:10-Q item2", mdna.ref, periodReportingCurrency(bundle, day(mdna.data.reportDate)));
  const notes = sectionRef(bundle.edgar?.tenQNotes);
  if (notes !== null) {
    const sourceCurrency = periodReportingCurrency(bundle, day(notes.data.reportDate));
    add(parseCustomerConcentrationFacts(notes.data.text, concentrationScope(notes.data)), "edgar:10-Q notes", notes.ref, sourceCurrency);
    add(parseStatementFacts(notes.data.statementsText ?? ""), "edgar:10-Q statements", notes.ref, sourceCurrency);
    add(parseInvestmentFacts(notes.data.text, day(notes.data.reportDate)), "edgar:10-Q notes", notes.ref, sourceCurrency);
    add(parseCommitmentFacts(notes.data.text), "edgar:10-Q notes", notes.ref, sourceCurrency);
  }
  if (mdna !== null) add(parseCommitmentFacts(mdna.data.text), "edgar:10-Q item2", mdna.ref, periodReportingCurrency(bundle, day(mdna.data.reportDate)));
  const annual = sectionRef(bundle.edgar?.tenKNotes);
  if (annual !== null) {
    const sourceCurrency = periodReportingCurrency(bundle, day(annual.data.reportDate));
    add(parseBusinessCombinationFacts(annual.data.text, day(annual.data.reportDate)), "edgar:10-K notes", annual.ref, sourceCurrency);
    add(parseCustomerConcentrationFacts(annual.data.text, concentrationScope(annual.data)), "edgar:10-K notes", annual.ref, sourceCurrency);
  }
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
    add(rows, sourceTag, source, releaseReportingCurrency(bundle, release));
    if (wc.expectation !== null) outlook.push({ topic: `DSO outlook given with ${fiscal ?? `the quarter ended ${periodEnd}`} results`, text: safeText(wc.expectation, "(outlook withheld)"), source });
  }
  facts.push(...financialCompositionFacts(bundle, currency));
  const current = bundle.edgar?.currentReports;
  const mapping = bundle.edgar?.cik;
  if (current?.ok && current.value.source === "edgar" && mapping?.ok && mapping.value.source === "edgar" &&
      mapping.value.data.ticker.trim().toUpperCase() === bundle.symbol.trim().toUpperCase()) {
    const cik = mapping.value.data.cik;
    const cutoff = day(bundle.builtAt);
    const registrant = bundle.edgar?.registrant;
    const issuerName = registrant?.cik10 === mapping.value.data.cik10 && registrant.tickers.some(t => t.trim().toUpperCase() === bundle.symbol.trim().toUpperCase())
      ? registrant.name : mapping.value.data.title;
    for (const event of current.value.data.events) {
      const filed = day(event.filingDate);
      if (cutoff === null || !Number.isFinite(Date.parse(bundle.builtAt)) || filed === null || filed > cutoff || !/^8-K(?:\/A)?$/.test(event.form) ||
          !Number.isSafeInteger(cik) || cik <= 0 || mapping.value.data.cik10 !== String(cik).padStart(10, "0") ||
          typeof issuerName !== "string" || issuerName.trim() === "" || !/^\d{10}-\d{2}-\d{6}$/.test(event.accession)) continue;
      let sourceUrl: URL;
      try { sourceUrl = new URL(event.url); } catch { continue; }
      if (sourceUrl.protocol !== "https:" || sourceUrl.hostname !== "www.sec.gov" || sourceUrl.search !== "" || sourceUrl.hash !== "" ||
          !new RegExp(`^/Archives/edgar/data/${cik}/${event.accession.replaceAll("-", "")}/[A-Za-z0-9_.-]+\\.html?$`).test(sourceUrl.pathname)) continue;
      const source = { form: event.form, accession: event.accession, exhibit: null, filingDate: filed, url: event.url };
      for (const section of event.sections) {
        if (section.item !== "1.01" || section.incorporates !== null) continue;
        // New observations are optional on frozen legacy bundles. Do not try
        // to reconstruct a transaction from their already clipped narrative.
        const retained = section.financingFacts;
        if (!Array.isArray(retained) || retained.length !== 4 || retained.some(f => typeof f?.text !== "string" || f.text.length > 1000)) continue;
        const found = parseCompletedOfferingFacts(retained.slice(0, 3).map(f => f.text).join(" "), filed, issuerName);
        if (found.length !== 4 || found.some((f, i) => ["key", "label", "value", "symbol", "unit", "asOf", "period", "qualifier", "computed"].some(key =>
          f[key as keyof FilingFact] !== retained[i]![key as keyof FilingFact]))) continue;
        add(found, `edgar:8-K ${event.accession} item1.01`, source, currency);
      }
    }
  }
  return { facts, outlook };
}

type OfficerChangeRow = NonNullable<FilingDisclosures["officerChanges"]>[number];

/** Item 5.02 dates as specified by filings; elapsed dates do not prove completion. */
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
          ...(change.agreedDate === undefined ? {} : { agreedDate: change.agreedDate }),
          effective: change.effective, anticipated: change.anticipated, inEffect: change.effective !== null && asOf !== null && change.effective <= asOf,
          completionStatus: "unconfirmed",
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
