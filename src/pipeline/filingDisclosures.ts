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
import type { CurrentReports, EarningsFactSource, EarningsReleaseRecord } from "@/providers/currentReports";
import { establishedCurrencyOn, statementCurrencyEvidence } from "@/pipeline/compute";
import { normalizeQuarterRows } from "@/pipeline/stageB/quarterWindows";
import { orderedEarningsReleases } from "@/providers/currentReports";
import { materialCreditSupportClauses, parseCommitmentTables, splitSentences, summarizeItem, type GuidanceItem, type ReconciliationFact } from "@/edgar/currentReports";
import { withoutLegacyPrincipalAnnotation } from "@/report/principalAggregationSafety";
import {
  parseBusinessCombinationFacts,
  parseCommitmentFacts,
  parseCustomerConcentrationFacts,
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

function releaseReportingCurrency(bundle: DataBundle, release: EarningsReleaseRecord): string | null {
  // Commentary-only exhibits may state the quarter end only in their table
  // headers. Those parsed three-month column dates are source evidence too.
  const end = release.reported.periodEnd ?? [...release.freeCashFlow, ...(release.reconciliation ?? [])]
    .filter((f) => f.months === 3).map((f) => f.periodEnd).sort().at(-1) ?? null;
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
  const item = release.guidance.items.find((i) => i.metric === "revenue" && i.period.fiscalQuarter !== null && i.basis !== "non-gaap" && forwardGuidance(i, releases));
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

function forwardGuidance(item: GuidanceItem, releases: readonly EarningsReleaseRecord[]): boolean {
  const latest = releases.find((release) => release.reported.fiscal !== null)?.reported.fiscal;
  if (!latest) return true;
  return item.period.fiscalQuarter === null ? item.period.fiscalYear > latest.fiscalYear ||
    (item.period.fiscalYear === latest.fiscalYear && latest.fiscalQuarter !== null && latest.fiscalQuarter < 4)
    : item.period.fiscalYear * 4 + item.period.fiscalQuarter > latest.fiscalYear * 4 + (latest.fiscalQuarter ?? 4);
}

function guidanceRows(items: readonly GuidanceItem[], currency: string | null, sourceCurrency: string | null, notes: string[]): GuidanceRows {
  const rows: GuidanceRows = [];
  for (const item of items) {
    if (item.unit !== "%") {
      const itemCurrency = symbolCurrency(item.symbol, sourceCurrency);
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
  const income = normalizeQuarterRows(rowsOf<FmpIncomeStatementRow>(bundle.statements?.incomeQuarterly)).rows;
  const evidence = statementCurrencyEvidence(bundle);
  const source = bundle.statements?.incomeQuarterly?.ok ? `${bundle.statements.incomeQuarterly.value.source}:income-statement(quarter)` : "statements";
  const checks: GuidanceCheck[] = [];
  for (const guide of releases) {
    for (const item of guide.guidance?.items ?? []) {
      if (item.period.fiscalQuarter === null || (item.metric !== "revenue" && item.metric !== "gross-margin")) continue;
      if (item.metric === "gross-margin" && item.basis !== "gaap") continue;
      if (item.metric === "revenue" && !releaseCurrencyMatches(bundle, guide, item.symbol, currency)) continue;
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
    const fact = (release.reconciliation ?? []).find((f) => f.metric === metric && f.months === 3 && daysApart(f.periodEnd, periodEnd) <= 3);
    if (fact && releaseCurrencyMatches(bundle, release, fact.symbol, currency)) return fact.value;
  }
  return null;
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
  const notes: string[] = [];
  const trend = quarterlyTrend(bundle, releases, currency, notes);
  const { facts: filingFacts, outlook: commentaryOutlook } = filingFactRows(bundle, currency, releases, notes);
  const officerChanges = officerChangeRows(reports, bundle);
  const sayOnPay = sayOnPayRow(reports);
  const tradingArrangements = tradingArrangementRows(bundle);
  if (reports === null && segments === null && trend.length === 0 && filingFacts.length === 0 && tradingArrangements.length === 0 && notes.length === 0) return undefined;

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
        rows: guidanceRows(guided.guidance.items.filter((i) => forwardGuidance(i, releases)), currency, releaseReportingCurrency(bundle, guided), notes),
        qualifiers: guided.guidance.qualifiers.map((q) => safeText(q, "An issuer outlook caveat is withheld from display by the rating-language filter; see the release.")),
      }
    : null;
  if (releases.length > 0 && guided === undefined) notes.push("No quarterly outlook could be read from the latest earnings releases; no guidance is shown.");

  const latest = releases[0];
  // A dated issuer production statement remains visible even if model prose
  // chooses a weaker or earlier roadmap description. Keep the source wording.
  for (const sentence of splitSentences(latest?.releaseNarrative ?? "").filter((s) => /\bnow in full production\b/i.test(s)).slice(0, 2)) {
    if (sentence.length <= 500) notes.push(`Issuer production milestone (8-K EX-99.1 ${latest!.accession}, filed ${latest!.filingDate}): ${sentence}`);
  }
  const freeCashFlow = latest
    ? latest.freeCashFlow
      .filter((f) => releaseCurrencyMatches(bundle, latest, f.symbol, currency))
      .filter((f, i, all) => all.findIndex((g) => g.periodEnd === f.periodEnd && g.months === f.months) === i)
      .map((f) => ({ periodEnd: f.periodEnd, months: f.months, value: f.value, source: earningsFactRef(latest, f.source) }))
    : [];
  const capital = latest?.capitalReturn;
  const capitalCurrency = (symbol: string | undefined, release = latest): boolean => release !== undefined && releaseCurrencyMatches(bundle, release, symbol ?? "$", currency);
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
        dividendChangeFrom: capital.dividendChange && capitalCurrency(capital.dividendChange.symbol) ? capital.dividendChange.from : null,
        dividendChangeTo: capital.dividendChange && capitalCurrency(capital.dividendChange.symbol) ? capital.dividendChange.to : null,
      }
    : null;
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
    ? (latest.reconciliation ?? []).filter((f) => releaseCurrencyMatches(bundle, latest, f.symbol, currency))
      .map((f) => ({ metric: f.metric, periodEnd: f.periodEnd, months: f.months, value: f.value, unit: f.unit, source: earningsFactRef(latest, f.source) }))
    : [];
  const commitmentRelease = releases.find((r) => (r.commitments ?? []).length > 0);
  const commitments: NonNullable<FilingDisclosures["commitments"]> = commitmentRelease && releaseCurrencyMatches(bundle, commitmentRelease, "$", currency)
    ? (commitmentRelease.commitments ?? []).flatMap((table, index, all) => {
        const name = table.kind === "guarantees" ? "guarantees (maximum gross exposure)"
          : all.findIndex((t) => t.kind === "commitments") === index ? "future commitments" : "additional commitments";
        const source = releaseRef(commitmentRelease, commitmentRelease.commitmentsExhibit ?? "EX-99.1");
        // Saved bundles may carry the former parser's date borrowed from an
        // adjacent commitments table. Re-establish guarantee dates from the
        // same exhibit's own table, including during deterministic replay.
        const sourceNarrative = commitmentRelease.commitmentsExhibit === "EX-99.2"
          ? commitmentRelease.commentaryNarrative : commitmentRelease.releaseNarrative;
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
  const basisNote = releases.find((r) => typeof r.nonGaapBasisNote === "string")?.nonGaapBasisNote ?? null;
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
