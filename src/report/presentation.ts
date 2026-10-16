/**
 * Reader-facing presentation rules shared by the Markdown export, the print
 * export and the live report (D-62). The three surfaces call these helpers so
 * a label, a rounding rule or a key-data row reads the same everywhere.
 *
 * Pure and deterministic: no I/O, no clock, no locale-dependent output other
 * than the fixed en-US number grouping the formatters already use. Nothing
 * here changes a stored value; it only decides how a stored value is named,
 * rounded and grouped for a reader. The registry ids, raw values and the full
 * verification record stay in the separate audit export
 * (src/report/export/auditMarkdown.ts).
 */

import { parseSubscriptionModel } from "@/ai/contracts";
import type { ReportCompletenessPresentation } from "@/report/completeness";
import { reportSection } from "@/report/sectionManifest";
import {
  formatCostUsd,
  roundedDisplayedCostTotal,
  formatFinancialAmount,
  formatLargeNumber,
  formatMoneyAmount,
  formatMultiple,
  formatNumber,
  formatPct,
  numericCitationTraceLabel,
  tracedPeriodLabel,
  unitLabel,
  establishedCurrency,
} from "@/report/format";
import type { ManifestEntry } from "@/types/core";
import type {
  MoatAssessment,
  ProvenanceCoverage,
  Report,
  ScoreSignal,
  SourcedClaim,
  TracedNumber,
} from "@/report/schema";

/* ======================================================================== *
 * Human labels for registry ids
 * ======================================================================== */

const WORD_FIXES: Record<string, string> = {
  ebitda: "EBITDA", ebit: "EBIT", fcf: "FCF", fcff: "FCFF", sbc: "SBC", roic: "ROIC",
  wacc: "WACC", dcf: "DCF", eps: "EPS", ttm: "TTM", rsi: "RSI", macd: "MACD", spy: "SPY",
  noa: "NOA", gaap: "GAAP", yoy: "YoY", qoq: "QoQ", ev: "EV", us: "US", ai: "AI",
  cfo: "CFO", cfi: "CFI", ceo: "CEO", evp: "EVP", pct: "%", vs: "vs", sma: "SMA",
  pettm: "P/E (TTM)", pricetofcf: "price / FCF", operatingmargin: "operating margin",
  balancesheet: "balance sheet", capex: "capex", ppe: "PP&E", cagr: "CAGR", pp: "pp",
};

/** Split a registry segment (kebab, snake or camel case) into display words; ISO dates survive intact. */
function segmentWords(segment: string): string[] {
  const dates: string[] = [];
  const guarded = segment.replace(/\d{4}-\d{2}-\d{2}/g, (date) => {
    dates.push(date);
    return `\u0000${dates.length - 1}\u0000`;
  });
  return guarded
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[-_\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.replace(/\u0000(\d+)\u0000/g, (_, index: string) => dates[Number(index)] ?? ""))
    .map((word) => {
      const lower = word.toLowerCase();
      if (WORD_FIXES[lower] !== undefined) return WORD_FIXES[lower];
      if (/^q[1-4]$/.test(lower)) return lower.toUpperCase();
      if (/^fy\d{2,4}$/.test(lower)) return `FY${lower.slice(2)}`;
      if (/^\d+w$/.test(lower)) return `${lower.slice(0, -1)}-week`;
      if (/^\d+m$/.test(lower)) return lower.toUpperCase();
      if (/^sma\d+$/.test(lower)) return `SMA ${lower.slice(3)}`;
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      return lower;
    });
}

function sentence(words: readonly string[]): string {
  const text = words.join(" ").replace(/\s+%/g, " %").trim();
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

function titleWords(segment: string): string {
  return segmentWords(segment).map((word) => (word.length > 0 && /^[a-z]/.test(word) && !["and", "of", "the", "vs"].includes(word) ? word[0]!.toUpperCase() + word.slice(1) : word)).join(" ");
}

const ASPECT_LABEL: Record<string, string> = {
  fundamentals: "Fundamentals", valuation: "Valuation", quality: "Quality",
  balancesheet: "Balance-sheet", balanceSheet: "Balance-sheet", moat: "Moat",
  // D-61: the deterministic leadership score is a capital-stewardship proxy.
  leadership: "Leadership (capital stewardship)", technicals: "Technicals", composite: "Composite",
};

const EXACT_LABELS: Record<string, string> = {
  "payload.quote.price": "Share price",
  "computed.technicals.last-close": "Last close",
  "computed.technicals.sma50": "50-day moving average",
  "computed.technicals.sma200": "200-day moving average",
  "computed.technicals.rsi-14": "RSI (14-day)",
  "computed.technicals.macd-histogram": "MACD histogram",
  "computed.technicals.52w-high": "52-week high",
  "computed.technicals.52w-low": "52-week low",
  "computed.technicals.relative-strength-vs-spy-12-1-month-latest-month-skipped": "Relative strength vs SPY, 12-1 month",
  "computed.technicals.relative-strength-vs-spy-6-month": "Relative strength vs SPY, 6 month",
  "computed.technicals.read": "Technical read",
  "computed.valuation.dcf-per-share": "DCF value per share",
  "computed.returns.wacc": "WACC",
  "computed.valuation.reverse-dcf-implied-revenue-growth": "Reverse-DCF implied revenue growth",
  "computed.valuation.dcf-terminal-value-share": "Terminal value share of enterprise value",
  "computed.valuation.pettm-current": "P/E (TTM)",
  "computed.valuation.pricetofcf-current": "Price / FCF",
  "computed.scores.composite": "Composite score",
  "computed.capital.current": "Capital bridge",
  "computed.projections.scenarioWeights": "Scenario display weights",
  "computed.scenarioPresentation.sensitivity": "DCF sensitivity grid",
  "computed.forensics.beneish-m": "Beneish M-score",
  "computed.forensics.accruals": "Accrual ratios",
  "computed.forensics.absolute-cash-flow-versus-balance-sheet-accrual-divergence": "Accrual divergence (cash-flow vs balance-sheet)",
  "computed.forensics.accruals.noaCurrent": "Net operating assets (current year)",
  "computed.forensics.accruals.noaPrior": "Net operating assets (prior year)",
  "computed.forensics.accruals.scalerValue": "Average net operating assets",
  "computed.forensics.accrual-scaler-value": "Average net operating assets",
  "computed.forensics.accruals.cashFlowAccrualRatio": "Accrual ratio (cash-flow)",
  "computed.forensics.accruals.balanceSheetAccrualRatio": "Accrual ratio (balance-sheet)",
  "computed.forensics.accrual-ratio-cash-flow": "Accrual ratio (cash-flow)",
  "computed.forensics.accrual-ratio-balance-sheet": "Accrual ratio (balance-sheet)",
  "computed.forensics.accruals.aggregateAccrualsCashFlow": "Aggregate accruals (cash-flow)",
  "computed.forensics.accruals.aggregateAccrualsBalanceSheet": "Aggregate accruals (balance-sheet)",
  "computed.forensics.aggregate-accruals-cash-flow": "Aggregate accruals (cash-flow)",
  "computed.forensics.aggregate-accruals-balance-sheet": "Aggregate accruals (balance-sheet)",
};

const PATTERN_LABELS: ReadonlyArray<readonly [RegExp, (match: RegExpExecArray) => string]> = [
  [/^computed\.deterministic-aspect-scores\.([a-z]+)-score$/i, (m) => `${ASPECT_LABEL[m[1]!] ?? sentence(segmentWords(m[1]!))} score`],
  [/^computed\.scores\.([a-zA-Z]+)$/, (m) => `${ASPECT_LABEL[m[1]!] ?? sentence(segmentWords(m[1]!))} score`],
  [/^computed\.scores\.([a-zA-Z]+)\.([a-zA-Z0-9]+)$/, (m) => signalLabel(m[2]!)],
  [/^payload\.statements\.(income-statement|cash-flow|balance-sheet)-(quarterly|annual)\.(\d{4}-\d{2}-\d{2})\.(.+)$/, (m) =>
    `${sentence(segmentWords(m[4]!))} (${m[1] === "balance-sheet" ? "at" : m[2] === "quarterly" ? "quarter ended" : "year ended"} ${m[3]})`],
  [/^computed\.weighted-projections\.([a-z]+)-weighted-12m-ending-(\d{4}-\d{2}-\d{2})$/, (m) => `Weighted ${segmentWords(m[1]!).join(" ")}, 12M ending ${m[2]}`],
  [/^payload\.computed\.projections\.([a-z]+)\.([a-z]+)\.(.+)$/, (m) => `${sentence([m[2]!, "case", ...segmentWords(m[1]!)])}, ${segmentWords(m[3]!).join(" ")}`],
  [/^payload\.computed\.scenario-targets\.([a-z]+)\.per-share$/, (m) => `${sentence([m[1]!])} scenario value per share`],
  [/^payload\.computed\.fair-value\.per-share$/, () => "Model fair value per share"],
  [/^computed\.quarterly-trend\.(q[1-4]-fy\d{4})-(.+)$/, (m) => `${segmentWords(m[1]!).join(" ")} ${segmentWords(m[2]!).join(" ")}`],
  [/^payload\.segment-revenue\.(?:product-market-platform|reportable-segment|geography|geographic)-(.+)-revenue-quarter-ended-(\d{4}-\d{2}-\d{2})$/, (m) => `${titleWords(m[1]!)} revenue (quarter ended ${m[2]})`],
  [/^payload\.segments\.(product|geographic)-(.+)$/, (m) => `${titleWords(m[2]!)} revenue (annual ${m[1]} segment)`],
  [/^payload\.estimates\.est-(revenue|eps)-(\d{4}-\d{2}-\d{2})$/, (m) => `Consensus ${m[1] === "eps" ? "EPS" : "revenue"} estimate, fiscal year ending ${m[2]}`],
  [/^payload\.estimates\.price-target-(consensus|high|low|median)$/, (m) => `Analyst price target (${m[1]})`],
  [/^payload\.leadership\.comp-.+-(fy\d{4})$/, (m) => `Executive compensation record (${segmentWords(m[1]!).join(" ")})`],
  [/^payload\.peers\.([a-z0-9]+)-.+$/, (m) => `${m[1]!.toUpperCase()} market cap`],
  [/^payload\.macro\.([a-z0-9]+)-[a-z]+$/, (m) => `FRED ${m[1]!.toUpperCase()}`],
  [/^payload\.insiders\.mspr-(\d{4}-\d{2})$/, (m) => `Insider sentiment (MSPR), ${m[1]}`],
  [/^computed\.forensics\.accrual-operand-(.+)-(?:ni|cfo|cfi)$/, (m) => sentence(segmentWords(m[1]!))],
  [/^manifest\.(.+)$/, (m) => `Data-gap record: ${segmentWords(m[1]!.replace(/[.()]/g, " ")).join(" ")}`],
];

/** A short reader label for a computed signal id ("revenueCagr" → "Revenue CAGR"). */
export function signalLabel(id: string): string {
  const fixed: Record<string, string> = {
    revenueCagr: "Revenue CAGR", operatingMarginSlope: "Operating-margin slope", epsCagr: "EPS CAGR",
    fcfCagr: "FCF CAGR", dcfUpside: "DCF upside", reverseImpliedVsAchievable: "Reverse-DCF implied vs achievable growth",
    roicVsWaccSpread: "ROIC − WACC spread", piotroskiF: "Piotroski F (share of signals)",
    altmanZOriginalScale: "Altman Z (original scale)", accrualsRatioAbs: "Accruals ratio (absolute)",
    beneishM: "Beneish M-score", netDebtToEbitda: "Net debt / EBITDA", interestCoverage: "Interest coverage",
    fcfConversionBeforeSbc: "FCF conversion before SBC", sbcPctOfFcf: "SBC as % of FCF", roicLevel: "ROIC level",
    // D-61 signals; the retired ids stay readable for reports stored before it.
    roicFloor: "ROIC floor (worst year in window)", roteFloor: "ROTE floor (worst year in window)",
    buybackTiming: "Buyback timing (price paid vs the year's average)",
    beneishMSgiNeutral: "Beneish M-score (sales growth neutral)",
    roicStability: "ROIC stability (std. dev.)", grossMarginLevel: "Gross-margin level",
    buybackDiscipline: "Current price vs average repurchase price", capitalDeployment: "Capital deployment (ROIC − WACC)",
    shareCountTrend: "Share-count trend", relStrength12m1m: "Relative strength vs SPY, 12-1 month",
    pctFromHigh52w: "Distance from 52-week high", smaGap: "SMA 50 / SMA 200 gap",
  };
  return fixed[id] ?? sentence(segmentWords(id));
}

function genericRegistryLabel(source: string): string {
  const parts = source.split(".").filter((part) => part.length > 0);
  const body = parts.slice(1);
  if (body.length === 0) return source;
  let index = body.length - 1;
  let suffix = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(body[index]!) && index > 0) {
    suffix = ` (${body[index]})`;
    index -= 1;
  }
  // A generic tail ("median", "value", "series") names nothing on its own.
  const generic = /^(median|mean|value|current|series|total|rate|level|latest|perShare|per-share|amount)$/i;
  const words = generic.test(body[index]!) && index > 0
    ? [...segmentWords(body[index - 1]!), ...segmentWords(body[index]!)]
    : segmentWords(body[index]!);
  return `${sentence(words)}${suffix}`;
}

/**
 * A reader label for a figure's registry id. Unknown shapes (anything that is
 * not a computed/payload/manifest id or an SEC citation) are returned
 * unchanged, so a label the pipeline already wrote is never rewritten.
 */
export function metricLabel(source: string, unit = ""): string {
  const fromUnit = unitLabel(unit);
  if (fromUnit) return fromUnit[0]!.toUpperCase() + fromUnit.slice(1);
  const exact = EXACT_LABELS[source];
  if (exact !== undefined) return exact;
  for (const [pattern, label] of PATTERN_LABELS) {
    const match = pattern.exec(source);
    if (match) return label(match);
  }
  if (/^(computed|payload)\.[^\s]+$/.test(source)) return genericRegistryLabel(source);
  if (/^edgar:/.test(source)) return sourceLabel(source);
  return source;
}

/**
 * A reader label for a claim's citation ("edgar:10-Q item2" → "10-Q Item 2").
 * Computed and payload ids read as the figure they name; anything unknown is
 * returned verbatim.
 */
export function sourceLabel(source: string): string {
  const item = /^edgar:(10-K|10-Q|20-F|40-F|DEF 14A)\s+item\s*([0-9A-Za-z]+)$/i.exec(source);
  if (item) return `${item[1]!.toUpperCase()} Item ${item[2]!.toUpperCase()}`;
  const exhibit = /^edgar:(8-K|6-K|10-K|10-Q)\s+(EX-[0-9.]+)$/i.exec(source);
  if (exhibit) return `${exhibit[1]!.toUpperCase()} ${exhibit[2]!.toUpperCase()}`;
  const accession = /^edgar:(8-K|6-K|10-K|10-Q|DEF 14A|SC 13D|4)\s+(\d{10}-\d{2}-\d{6})$/i.exec(source);
  if (accession) return `${accession[1]!.toUpperCase()} ${accession[2]}`;
  const edgar = /^edgar:(.+)$/.exec(source);
  if (edgar) return `SEC ${edgar[1]}`;
  if (/^(computed|payload|manifest)\.[^\s]+$/.test(source)) return metricLabel(source);
  return source;
}

/**
 * The single source marker a claim carries (D-62): the citation, the
 * registry id only when it differs from the citation, and the as-of date.
 * Replaces the duplicated "`source id: X` `src: X`" pair.
 */
export function claimCitation(claim: Pick<SourcedClaim, "source" | "sourceId" | "asOf">): string {
  const parts = [sourceLabel(claim.source)];
  if (claim.sourceId && claim.sourceId !== claim.source) parts.push(`id ${claim.sourceId}`);
  if (claim.asOf) parts.push(claim.asOf);
  return parts.join(" · ");
}

/* ======================================================================== *
 * Figure rows: human label, rounded value, deduplication
 * ======================================================================== */

export interface FigureRow {
  label: string;
  value: string;
  /** The measurement window, or null when the figure did not supply one. */
  period: string | null;
  asOf: string | null;
  /** "✓", "untraced" or "not checked". */
  cited: string;
  trace: TracedNumber;
}

export function citedMark(verified: TracedNumber["verified"]): string {
  return verified === true ? "✓" : numericCitationTraceLabel(verified);
}

export function figureRow(n: TracedNumber, label?: string): FigureRow {
  const period = tracedPeriodLabel(n.period, n.periodContext).replace(/^not supplied; /, "");
  return {
    label: label ?? metricLabel(n.source, n.unit),
    value: formatFinancialAmount(n.value, n.unit, n.currency),
    period: period === "not supplied" ? null : period,
    asOf: n.asOf,
    cited: citedMark(n.verified),
    trace: n,
  };
}

/**
 * Identities of a figure for de-duplication: the exact stored value and unit
 * (not for small integers, which coincide by chance), and the reader label
 * with the displayed value — the two registries round the same figure to
 * different stored precision.
 */
function figureIdentities(row: FigureRow): string[] {
  const v = row.trace.value;
  const trivial = Number.isInteger(v) && Math.abs(v) < 100;
  const byLabel = `${row.label.toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim()}|${row.value}`;
  return trivial ? [byLabel] : [`${v}|${row.trace.unit}`, byLabel];
}

/**
 * Figure rows with exact duplicates removed (D-62): the capital bridge and the
 * forensic battery register the same figure under two ids
 * (`computed.current-capital.*` and `computed.capital.current.*`), and the
 * report printed both. `seen` carries identities across the tables of one
 * section. The first occurrence wins; a later duplicate only contributes a
 * measurement window the first one lacked.
 */
export function dedupeFigureRows(rows: readonly FigureRow[], seen: Map<string, FigureRow> = new Map()): FigureRow[] {
  const out: FigureRow[] = [];
  for (const row of rows) {
    const identities = figureIdentities(row);
    const prior = identities.map((identity) => seen.get(identity)).find((entry) => entry !== undefined);
    if (prior) {
      if (prior.period === null && row.period !== null) prior.period = row.period;
      continue;
    }
    const copy = { ...row };
    for (const identity of identities) seen.set(identity, copy);
    out.push(copy);
  }
  return out;
}

export function figureRows(numbers: readonly TracedNumber[], seen?: Map<string, FigureRow>): FigureRow[] {
  return dedupeFigureRows(numbers.map((n) => figureRow(n)), seen);
}

/* ======================================================================== *
 * Tables: hide empty ones, drop always-empty columns
 * ======================================================================== */

const EMPTY_CELL = new Set(["", "n/a", "—", "-", "not supplied", "unavailable", "unknown"]);

function isEmptyCell(cell: string): boolean {
  return EMPTY_CELL.has(cell.replace(/<[^>]*>/g, "").trim().toLowerCase());
}

/**
 * Drop columns whose every cell is empty ("n/a", "—", "not supplied"), and
 * hide the table (null) when no row has any content beyond its first cell.
 * The first column is the row label and is never dropped. `keep` names
 * columns that stay even when empty.
 */
export function pruneTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  keep: readonly string[] = [],
): { headers: string[]; rows: string[][] } | null {
  const contentRows = rows.filter((row) => row.some((cell, index) => (index === 0 ? !isEmptyCell(cell) : !isEmptyCell(cell))));
  if (contentRows.length === 0) return null;
  const keepIndex = headers.map((header, index) =>
    index === 0 || keep.includes(header) || contentRows.some((row) => !isEmptyCell(row[index] ?? "")));
  return {
    headers: headers.filter((_, index) => keepIndex[index]),
    rows: contentRows.map((row) => row.filter((_, index) => keepIndex[index])),
  };
}

/* ======================================================================== *
 * Display text for repeated pipeline strings
 * ======================================================================== */

/**
 * Raw base-unit integers inside stored sentences ("starting revenue
 * 302969000000 reporting-currency units", "diluted shares 24285000000") shown
 * compactly ("302.97B"). Display only; ten or more digits, so years, counts
 * and accession numbers are untouched.
 */
export function compactLongIntegers(text: string): string {
  return text.replace(/(^|[^\d.,\-])(-?\d{10,})(?!\d|[.,]\d|-\d)/g, (_, lead: string, digits: string) => `${lead}${formatLargeNumber(Number(digits))}`)
    .replace(/([\dKMBT])\s+reporting-currency units/g, "$1 (reporting currency)")
    .replace(/\(reporting-currency units\)/g, "(reporting currency)");
}

/**
 * Lines common to every list are stated once (D-62): the three scenario
 * cards and the four projection series each repeated the same assumption
 * block. Order follows the first list.
 */
export function splitCommonLines(lists: readonly (readonly string[])[]): { common: string[]; specific: string[][] } {
  if (lists.length < 2) return { common: [], specific: lists.map((list) => [...list]) };
  const [first, ...rest] = lists;
  const common = first!.filter((line) => rest.every((list) => list.includes(line)));
  const commonSet = new Set(common);
  return { common, specific: lists.map((list) => list.filter((line) => !commonSet.has(line))) };
}

/** Display name for a geographic segment ("TAIWAN, PROVINCE OF CHINA" → "Taiwan"). */
export function geographyLabel(name: string): string {
  const fixed: Record<string, string> = {
    "TAIWAN, PROVINCE OF CHINA": "Taiwan",
    "TAIWAN": "Taiwan",
    "CHINA": "China (incl. Hong Kong)",
    "UNITED STATES": "United States",
    "KOREA, REPUBLIC OF": "South Korea",
    "UNITED KINGDOM": "United Kingdom",
  };
  const upper = name.trim().toUpperCase();
  if (fixed[upper] !== undefined) return fixed[upper];
  if (name === upper && /[A-Z]/.test(name)) {
    return name.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  }
  return name;
}

const MOAT_SOURCE: Record<MoatAssessment["source"], string> = {
  switchingCosts: "Switching costs",
  networkEffects: "Network effects",
  scale: "Scale",
  brand: "Brand",
  ip: "Intellectual property",
};

/** "Scale — narrow" rather than the raw enums "scale (narrow)". */
export function moatHeading(m: Pick<MoatAssessment, "source" | "strength">): string {
  return `${MOAT_SOURCE[m.source] ?? m.source} — ${m.strength}`;
}

export function moatSourceLabel(source: MoatAssessment["source"]): string {
  return MOAT_SOURCE[source] ?? source;
}

/**
 * The heading of an annual provider segment table. When quarterly XBRL
 * segment tables are shown beside it, it says it is the prior-year annual
 * presentation (D-62) instead of reading as current mix.
 */
export function annualSegmentHeading(kind: "Product" | "Geographic", rows: readonly { revenue: TracedNumber }[], quarterlyShown: boolean): string {
  if (!quarterlyShown) return `${kind} segments`;
  const asOf = rows.find((row) => row.revenue.asOf)?.revenue.asOf;
  return `${kind} segments — annual${asOf ? `, fiscal year ended ${asOf}` : ""} (prior presentation)`;
}

/** A technical indicator's label, naming an intraday quote "latest price" rather than "last close". */
export function indicatorLabel(n: TracedNumber, timing: { intraday: boolean; detail: string | null }): string {
  if (n.source === "computed.technicals.last-close" && timing.intraday) return `Latest price (${timing.detail})`;
  return metricLabel(n.source, n.unit);
}

/** The reverse-DCF implied value with the unit its metric names. */
export function reverseDcfValueText(metric: string, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return /growth|margin|rate|return|cagr/i.test(metric) ? formatPct(value) : formatNumber(value, 1);
}

/* ======================================================================== *
 * Price timing: "last close" versus an intraday quote
 * ======================================================================== */

/** New York wall-clock parts of an ISO instant, or null when it does not parse. */
function newYorkClock(iso: string): { weekday: string; minutes: number; hhmm: string } | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { weekday: get("weekday"), minutes: hour * 60 + minute, hhmm: `${get("hour")}:${get("minute")}` };
}

/**
 * How to name the quoted price (audit P3): "last close" when the quote was
 * observed at or after the 16:00 New York close (or on a weekend), "latest
 * price" with the time when it was observed during the session.
 */
export function priceTiming(report: Pick<Report, "meta">): { label: string; detail: string | null; intraday: boolean } {
  const observed = report.meta.evidenceTiming?.quote.observedAt ?? null;
  if (observed === null) return { label: "Price", detail: null, intraday: false };
  const clock = newYorkClock(observed);
  if (clock === null) return { label: "Price", detail: null, intraday: false };
  const weekend = clock.weekday === "Sat" || clock.weekday === "Sun";
  if (!weekend && clock.minutes >= 9 * 60 + 30 && clock.minutes < 16 * 60) {
    return { label: "Latest price", detail: `intraday, ${clock.hhmm} ET`, intraday: true };
  }
  return { label: "Last close", detail: null, intraday: false };
}

/* ======================================================================== *
 * Key-data box (page 1)
 * ======================================================================== */

export interface KeyDataRow {
  label: string;
  value: string;
  note?: string;
}

/** Every TracedNumber in the report body (the verification log excluded), in document order. */
function collectTraces(report: Report): TracedNumber[] {
  const out: TracedNumber[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (depth > 12 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const record = node as Record<string, unknown>;
    if (typeof record.value === "number" && typeof record.unit === "string" && typeof record.source === "string") {
      out.push(record as unknown as TracedNumber);
      return;
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === "appendix" || key === "verificationLog") continue;
      visit(value, depth + 1);
    }
  };
  visit(report, 0);
  return out;
}

function firstTrace(traces: readonly TracedNumber[], pattern: RegExp): TracedNumber | null {
  return traces.find((trace) => pattern.test(trace.source) && Number.isFinite(trace.value)) ?? null;
}

function money(value: number, currency: string | null, perShare = false): string {
  return perShare ? formatMoneyAmount(value, currency, 2) : formatFinancialAmount(value, "currency", currency);
}

/** "$9.28" for a per-share amount, "$409.80B" for a total, in the established currency. */
function perShareOrTotal(value: number, currency: string | null, perShare: boolean): string {
  return money(value, currency, perShare);
}

/**
 * The page-1 key-data box (audit P1-12), built ONLY from values already in
 * the report: the provider market data block (D-62) when present, else the
 * traced quote, technicals and DCF bridge. A row whose inputs are absent is
 * omitted, never printed as "n/a". Derived rows (enterprise value at the
 * quote, forward P/E, dividend yield, short interest as a share of float)
 * say how they were derived.
 */
export function keyDataRows(report: Report): KeyDataRow[] {
  const traces = collectTraces(report);
  const md = report.marketData;
  const rows: KeyDataRow[] = [];
  const bridge = report.valuation.dcf.bridge;
  const dcf = report.valuation.dcf.perShare;
  const modelCurrency = dcf ? establishedCurrency(dcf.unit, dcf.currency) : bridge?.currency ?? null;
  const priceTrace = firstTrace(traces, /^payload\.quote\.price$/) ?? firstTrace(traces, /^computed\.technicals\.last-close$/);
  const priceCurrency = md?.currency ?? (priceTrace ? establishedCurrency(priceTrace.unit, priceTrace.currency) ?? modelCurrency : modelCurrency);
  const timing = priceTiming(report);
  const price = md?.quote?.price ?? priceTrace?.value ?? null;
  const priceAsOf = md?.quote?.asOf ?? priceTrace?.asOf ?? null;
  if (price !== null) {
    rows.push({ label: `${timing.label}${timing.detail ? ` (${timing.detail})` : ""}`, value: money(price, priceCurrency, true), note: priceAsOf ? `as of ${priceAsOf}` : undefined });
  }
  const high = md?.quote?.yearHigh ?? firstTrace(traces, /^computed\.technicals\.52w-high$/)?.value ?? null;
  const low = md?.quote?.yearLow ?? firstTrace(traces, /^computed\.technicals\.52w-low$/)?.value ?? null;
  if (high !== null && low !== null) rows.push({ label: "52-week range", value: `${money(low, priceCurrency, true)} – ${money(high, priceCurrency, true)}` });

  const quotedCap = md?.quote?.marketCap ?? firstTrace(traces, /^payload\.quote\.market-?cap$/)?.value ?? null;
  const dilutedShares = bridge?.dilutedShares ?? null;
  const marketCap = quotedCap ?? (price !== null && dilutedShares !== null && dilutedShares > 0 ? price * dilutedShares : null);
  if (marketCap !== null) rows.push({ label: "Market cap", value: money(marketCap, priceCurrency), note: quotedCap !== null ? "quote" : "price × diluted shares" });
  if (marketCap !== null && bridge && bridge.netDebt !== null) {
    const ev = marketCap + bridge.netDebt + (bridge.minorityInterest ?? 0) + (bridge.preferredEquity ?? 0);
    rows.push({ label: "Enterprise value", value: money(ev, priceCurrency), note: `market cap + net debt${bridge.asOf ? ` at ${bridge.asOf}` : ""} from the DCF bridge` });
  }
  const outstanding = md?.shares?.outstanding ?? null;
  if (outstanding !== null && outstanding > 0) {
    rows.push({ label: "Shares outstanding", value: formatLargeNumber(outstanding), note: md?.shares?.freeFloatPct != null ? `${formatPct(md.shares.freeFloatPct, 1)} free float` : undefined });
  } else if (dilutedShares !== null && dilutedShares > 0) {
    rows.push({ label: "Diluted shares", value: formatLargeNumber(dilutedShares), note: bridge?.asOf ? `at ${bridge.asOf}` : undefined });
  }

  const capitalReturn = report.filingDisclosures?.capitalReturn ?? null;
  if (capitalReturn?.dividendPerShare != null && price !== null && price > 0) {
    rows.push({
      label: "Dividend yield",
      value: formatPct(((capitalReturn.dividendPerShare * 4) / price) * 100, 2),
      note: `${money(capitalReturn.dividendPerShare, report.filingDisclosures?.currency ?? priceCurrency, true)} quarterly, annualized`,
    });
  }

  // Consensus: the provider block first, else any consensus figure the analysis cited.
  const estCurrency = md?.estimateCurrency ?? null;
  const target = md?.priceTarget?.consensus ?? firstTrace(traces, /^payload\.estimates\.price-target-consensus$/)?.value ?? null;
  if (target !== null && (md === undefined || estCurrency !== null)) {
    const lowT = md?.priceTarget?.low ?? firstTrace(traces, /^payload\.estimates\.price-target-low$/)?.value ?? null;
    const highT = md?.priceTarget?.high ?? firstTrace(traces, /^payload\.estimates\.price-target-high$/)?.value ?? null;
    const upside = price !== null && price > 0 ? ` (${formatPct((target / price - 1) * 100, 1, true)} vs price)` : "";
    rows.push({
      label: "Consensus price target",
      value: `${money(target, estCurrency ?? priceCurrency, true)}${upside}`,
      note: lowT !== null && highT !== null ? `range ${money(lowT, estCurrency ?? priceCurrency, true)} – ${money(highT, estCurrency ?? priceCurrency, true)}` : undefined,
    });
  }
  const grades = md?.gradeCounts;
  if (grades) {
    const total = grades.strongPositive + grades.positive + grades.neutral + grades.negative + grades.strongNegative;
    if (total > 0) rows.push({ label: "Analyst grades", value: `${grades.strongPositive + grades.positive} positive · ${grades.neutral} neutral · ${grades.negative + grades.strongNegative} negative`, note: `${total} analysts${grades.asOf ? `, as of ${grades.asOf}` : ""}` });
  }
  const estimates = estCurrency !== null ? md?.estimates ?? [] : [];
  estimates.forEach((e, index) => {
    const label = `Consensus FY+${index + 1} (year ending ${e.fiscalYearEnd})`;
    const parts = [
      e.revenueAvg !== null ? `revenue ${perShareOrTotal(e.revenueAvg, estCurrency, false)}` : null,
      e.epsAvg !== null ? `EPS ${perShareOrTotal(e.epsAvg, estCurrency, true)}` : null,
    ].filter((part): part is string => part !== null);
    if (parts.length > 0) rows.push({ label, value: parts.join(" · "), note: e.analystsRevenue !== null ? `${e.analystsRevenue} revenue / ${e.analystsEps ?? "?"} EPS estimates` : undefined });
  });
  if (md === undefined) {
    const consensusRevenue = firstTrace(traces, /^payload\.estimates\.est-revenue-\d{4}-\d{2}-\d{2}$/);
    if (consensusRevenue) rows.push({ label: metricLabel(consensusRevenue.source), value: formatFinancialAmount(consensusRevenue.value, consensusRevenue.unit, consensusRevenue.currency) });
  }

  const pe = report.valuation.multiples.find((m) => /^P\/E/i.test(m.name) && m.current !== null);
  if (pe) rows.push({ label: pe.name, value: formatMultiple(pe.current) });
  const forward = estimates.find((e) => e.epsAvg !== null && e.epsAvg > 0);
  const tracedEps = md === undefined ? firstTrace(traces, /^payload\.estimates\.est-eps-\d{4}-\d{2}-\d{2}$/) : null;
  if (forward && price !== null) {
    rows.push({ label: "Forward P/E (consensus EPS)", value: formatMultiple(price / forward.epsAvg!), note: `year ending ${forward.fiscalYearEnd}` });
  } else if (tracedEps && tracedEps.value > 0 && price !== null) {
    rows.push({ label: "Forward P/E (consensus EPS)", value: formatMultiple(price / tracedEps.value) });
  }
  const epsSeries = report.projections?.series.find((s) => s.metric === "epsDiluted");
  const nextEps = epsSeries?.base[0];
  if (nextEps && price !== null && nextEps.value.value > 0) {
    rows.push({ label: "Forward P/E (model base-case EPS)", value: formatMultiple(price / nextEps.value.value), note: nextEps.period });
  }
  const evEbitda = report.valuation.multiples.find((m) => /^EV\/EBITDA/i.test(m.name) && m.current !== null);
  if (evEbitda) rows.push({ label: `${evEbitda.name} (TTM)`, value: formatMultiple(evEbitda.current) });

  const si = md?.shortInterest;
  if (si) {
    const float = md?.shares?.float ?? null;
    const ofFloat = float !== null && float > 0 ? `${formatPct((si.shares / float) * 100, 2)} of float` : null;
    rows.push({
      label: "Short interest",
      value: `${formatLargeNumber(si.shares)} shares${ofFloat ? ` (${ofFloat})` : ""}`,
      note: [`settled ${si.settlementDate}`, si.daysToCover !== null ? `${formatNumber(si.daysToCover, 1)} days to cover` : null].filter(Boolean).join("; "),
    });
  }

  if (dcf) {
    rows.push({
      label: "Model fair value (DCF)",
      value: formatFinancialAmount(dcf.value, dcf.unit, dcf.currency),
      note: report.valuation.dcf.upsidePct === null ? undefined : `${formatPct(report.valuation.dcf.upsidePct, 1, true)} vs price`,
    });
  }
  const bear = report.valuation.scenarios.find((s) => s.name === "bear")?.priceTarget ?? null;
  const bull = report.valuation.scenarios.find((s) => s.name === "bull")?.priceTarget ?? null;
  if (bear && bull) {
    rows.push({ label: "Scenario range (bear – bull, model)", value: `${formatFinancialAmount(bear.value, bear.unit, bear.currency)} – ${formatFinancialAmount(bull.value, bull.unit, bull.currency)}` });
  }
  const composite = report.scores?.composite;
  if (composite && composite.score !== null) {
    rows.push({ label: "Composite grade", value: `${composite.band ?? "—"} (${Math.round(composite.score)}/100)` });
  }
  return rows;
}

/**
 * The "Consensus and market" tables (D-62): FY+1/FY+2 consensus with ranges
 * and the forward P/E at the quote, then price targets, grade counts, short
 * interest and the provider's period-end enterprise value. Empty when the
 * report carries no provider market data.
 */
export function consensusTables(report: Report): BodyTable[] {
  const md = report.marketData;
  if (!md) return [];
  const tables: BodyTable[] = [];
  const cur = md.estimateCurrency;
  const price = md.quote?.price ?? null;
  if (md.estimates.length > 0 && cur !== null) {
    const cell = (v: number | null, perShare: boolean) => (v === null ? "—" : money(v, cur, perShare));
    const range = (lowV: number | null, highV: number | null, perShare: boolean) => (lowV === null || highV === null ? "—" : `${money(lowV, cur, perShare)} – ${money(highV, cur, perShare)}`);
    tables.push({
      heading: "Consensus estimates",
      headers: ["Item", ...md.estimates.map((e, i) => `FY+${i + 1} (ending ${e.fiscalYearEnd})`)],
      rows: [
        ["Revenue (mean)", ...md.estimates.map((e) => cell(e.revenueAvg, false))],
        ["Revenue (low – high)", ...md.estimates.map((e) => range(e.revenueLow, e.revenueHigh, false))],
        ["Diluted EPS (mean)", ...md.estimates.map((e) => cell(e.epsAvg, true))],
        ["Diluted EPS (low – high)", ...md.estimates.map((e) => range(e.epsLow, e.epsHigh, true))],
        ["Estimates (revenue / EPS)", ...md.estimates.map((e) => `${e.analystsRevenue ?? "—"} / ${e.analystsEps ?? "—"}`)],
        ["P/E at the quoted price", ...md.estimates.map((e) => (price !== null && e.epsAvg !== null && e.epsAvg > 0 ? formatMultiple(price / e.epsAvg) : "—"))],
      ],
      note: `Provider consensus${md.estimatesAsOf ? ` as of ${md.estimatesAsOf}` : ""}; fiscal years after the latest reported year.${md.estimateCurrencyBasis ? ` Currency ${md.estimateCurrencyBasis}.` : ""} Consensus is other analysts' forecast, not this report's.`,
    });
  }
  const rows: string[][] = [];
  if (md.priceTarget && cur !== null) {
    const pt = md.priceTarget;
    if (pt.consensus !== null) {
      const parts = [pt.median !== null ? `median ${money(pt.median, cur, true)}` : null, pt.low !== null && pt.high !== null ? `range ${money(pt.low, cur, true)} – ${money(pt.high, cur, true)}` : null].filter(Boolean);
      rows.push(["Consensus price target", `${money(pt.consensus, cur, true)}${parts.length ? ` (${parts.join("; ")})` : ""}`]);
    }
    const recent = [
      pt.lastMonthCount !== null ? `${pt.lastMonthCount} in the last month${pt.lastMonthAverage !== null ? ` (mean ${money(pt.lastMonthAverage, cur, true)})` : ""}` : null,
      pt.lastQuarterCount !== null ? `${pt.lastQuarterCount} in the last quarter${pt.lastQuarterAverage !== null ? ` (mean ${money(pt.lastQuarterAverage, cur, true)})` : ""}` : null,
    ].filter(Boolean);
    if (recent.length > 0) rows.push(["Recent price targets", recent.join("; ")]);
  }
  if (md.gradeCounts) {
    const g = md.gradeCounts;
    rows.push(["Analyst grades (count)", `${g.strongPositive} strongly positive · ${g.positive} positive · ${g.neutral} neutral · ${g.negative} negative · ${g.strongNegative} strongly negative`]);
  }
  if (md.shortInterest) {
    const si = md.shortInterest;
    const float = md.shares?.float ?? null;
    rows.push(["Short interest", [
      `${formatLargeNumber(si.shares)} shares at settlement ${si.settlementDate}`,
      float !== null && float > 0 ? `${formatPct((si.shares / float) * 100, 2)} of float` : null,
      si.daysToCover !== null ? `${formatNumber(si.daysToCover, 1)} days to cover` : null,
      si.changePct !== null ? `${formatPct(si.changePct, 1, true)} vs prior settlement` : null,
    ].filter(Boolean).join("; ")]);
  }
  if (md.quote?.marketCap != null) rows.push(["Market cap (quote)", `${money(md.quote.marketCap, md.currency)}${md.quote.asOf ? ` as of ${md.quote.asOf}` : ""}`]);
  if (md.shares?.outstanding != null) rows.push(["Shares outstanding", `${formatLargeNumber(md.shares.outstanding)}${md.shares.float !== null ? `; float ${formatLargeNumber(md.shares.float)}` : ""}`]);
  if (md.enterpriseValue) rows.push(["Enterprise value (provider, period end)", `${money(md.enterpriseValue.value, md.currency)} at ${md.enterpriseValue.periodEnd} (market cap + debt − cash at that date)`]);
  if (rows.length > 0) tables.push({ heading: "Market data and positioning", headers: ["Item", "Value"], rows });
  return tables;
}

/* ======================================================================== *
 * Trust headline
 * ======================================================================== */

export interface TrustRow {
  label: string;
  value: string;
}

function ratio(supported: number, total: number, rate: number | null): string {
  return rate === null ? `${supported}/${total}` : `${supported}/${total} (${Math.round(rate * 100)}%)`;
}

/**
 * What was verified, one row per kind of check (P0-7). Qualitative claims are
 * counted as cited but not machine-checkable instead of being folded into a
 * "0/N validated" headline; the numeric-claim ratio covers only claims that
 * state a figure.
 */
export function trustRows(coverage: ProvenanceCoverage | undefined): TrustRow[] {
  if (!coverage) return [];
  const rows: TrustRow[] = [
    { label: "Figures traced to a cited source", value: ratio(coverage.numeric.supported, coverage.numeric.total, coverage.numeric.rate) },
    { label: "Factual claims carrying a citation", value: ratio(coverage.factualClaims.supported, coverage.factualClaims.total, coverage.factualClaims.rate) },
  ];
  const v = coverage.factualValidation;
  if (v) {
    const qualitative = v.qualitative ?? 0;
    const numericClaims = v.total - qualitative;
    const uncheckedNumeric = v.unchecked - qualitative;
    rows.push({
      label: "Numeric factual claims validated against their cited figure",
      value: numericClaims === 0
        ? "none to check — no factual claim states a figure"
        : `${v.validated}/${numericClaims}${uncheckedNumeric > 0 ? `; ${uncheckedNumeric} not matched to a cited figure` : ""}`,
    });
    rows.push({ label: "Claims contradicted by their cited source", value: String(v.contradicted) });
    if (v.qualitative !== undefined) rows.push({ label: "Qualitative factual claims (cited; not machine-checkable)", value: String(qualitative) });
  }
  if (coverage.judgments.total > 0) rows.push({ label: "Judgments carrying a citation", value: ratio(coverage.judgments.cited, coverage.judgments.total, coverage.judgments.rate) });
  return rows;
}

/** One-line header form of {@link trustRows}. */
export function trustHeadline(coverage: ProvenanceCoverage | undefined): string | null {
  if (!coverage) return null;
  const parts = [
    `${ratio(coverage.numeric.supported, coverage.numeric.total, coverage.numeric.rate)} figures traced to a cited source`,
    `${coverage.factualClaims.supported}/${coverage.factualClaims.total} factual claims cited`,
  ];
  const v = coverage.factualValidation;
  if (v) {
    const qualitative = v.qualitative ?? 0;
    const numericClaims = v.total - qualitative;
    parts.push(numericClaims === 0 ? "no factual claim states a figure to validate" : `${v.validated}/${numericClaims} numeric claims validated`);
    parts.push(`${v.contradicted} contradicted`);
    if (qualitative > 0) parts.push(`${qualitative} qualitative claims cited, not machine-checkable`);
  }
  return parts.join("; ");
}

/* ======================================================================== *
 * Header: run summary, usage, data state
 * ======================================================================== */

/* ======================================================================== *
 * One home per deterministic table
 * ======================================================================== */

/**
 * The deterministic filing table that already shows a figure, as a
 * cross-reference ("Management guidance (§11 Future Outlook)"), or null
 * (D-62). Guidance, issuer-defined FCF and results against prior guidance
 * were each printed in three to six places.
 */
export function filingTableHome(report: Pick<Report, "filingDisclosures">, source: string): string | null {
  const d = report.filingDisclosures;
  if (!d) return null;
  const where = (key: "fundamentals" | "outlook") => `§${reportSection(key).index} ${reportSection(key).printTitle}`;
  if (d.guidance && d.guidance.rows.length > 0 && /^payload\.issuer-filings\.[a-z0-9-]*guidance\b/.test(source)) return `Management guidance (${where("outlook")})`;
  if (d.freeCashFlow.length > 0 && /^payload\.issuer-filings\.issuer-defined-free-cash-flow/.test(source)) return `Issuer-reported free cash flow (${where("fundamentals")})`;
  if (d.guidanceChecks.length > 0 && /^computed\.quarterly-trend\.q[1-4]-fy\d{4}-[a-z0-9-]*vs-prior-guidance/.test(source)) return `Results against prior guidance (${where("outlook")})`;
  return null;
}

/** Figures not already in a deterministic table, plus the tables that hold the rest. */
export function withoutTabled(report: Pick<Report, "filingDisclosures">, numbers: readonly TracedNumber[]): { kept: TracedNumber[]; homes: string[] } {
  const homes: string[] = [];
  const kept = numbers.filter((n) => {
    const home = filingTableHome(report, n.source);
    if (home !== null && !homes.includes(home)) homes.push(home);
    return home === null;
  });
  return { kept, homes };
}

/** MetricRow groups with tabled values removed (rows left empty are dropped). */
export function metricRowsWithoutTabled<T extends { label: string; values: readonly { value: TracedNumber }[] }>(
  report: Pick<Report, "filingDisclosures">,
  rows: readonly T[],
): { kept: T[]; homes: string[] } {
  const homes: string[] = [];
  const kept = rows.flatMap((row) => {
    const values = row.values.filter((v) => {
      const home = filingTableHome(report, v.value.source);
      if (home !== null && !homes.includes(home)) homes.push(home);
      return home === null;
    });
    return values.length === 0 ? [] : [{ ...row, values }];
  });
  return { kept, homes };
}

/** "See also: …" line for figures shown in their home table instead. */
export function seeAlsoText(homes: readonly string[]): string | null {
  return homes.length === 0 ? null : `Shown in ${homes.join("; ")}.`;
}

type ExecutionEntries = NonNullable<Report["meta"]["execution"]>;

/** Passes that called a model; the deterministic verify step is not one. */
function modelPasses(entries: ExecutionEntries | undefined): ExecutionEntries {
  return (entries ?? []).filter((entry) => entry.effectiveModel !== "deterministic" && entry.requestedModel !== "deterministic");
}

/**
 * Inline citations inside stored prose ("… [computed.valuation.dcf-per-share ·
 * 2026-10-15]") shown with the same reader label a claim's source marker uses
 * (D-62). Anything that is not a registry id or SEC citation is untouched.
 */
export function humanizeInlineCitations(text: string): string {
  return text.replace(/\[((?:computed|payload|manifest)\.[^\s\]·]+|edgar:[^\]·]+?)(\s+·\s+(\d{4}-\d{2}-\d{2}))?\]/g, (_match, id: string, _dated: string | undefined, date: string | undefined) =>
    `[${sourceLabel(id.trim())}${date ? ` · ${date}` : ""}]`);
}

/** "bull, bear and judge on chatgpt/gpt-6.1-sol (medium effort)" plus any fallback/floor/same-family note. */
export function runSummary(report: Pick<Report, "meta">): string {
  const m = report.meta;
  const execution = modelPasses(m.execution);
  if (execution.length === 0) return m.model;
  const stepName = (step: string) => (step === "synthesize" ? "judge" : step);
  const byModel = new Map<string, string[]>();
  for (const entry of execution) {
    const key = `${entry.effectiveModel}${entry.effectiveEffort ? ` (${entry.effectiveEffort} effort)` : ""}`;
    byModel.set(key, [...(byModel.get(key) ?? []), stepName(entry.step)]);
  }
  const list = (items: string[]) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  const parts = [...byModel.entries()].map(([model, steps]) => `${list(steps)} on ${model}`);
  const adjusted = execution.filter((entry) => entry.adjustments.length > 0).map((entry) => `${stepName(entry.step)}: ${entry.adjustments.join(", ")}`);
  if (adjusted.length > 0) parts.push(`adjusted — ${adjusted.join("; ")}`);
  if (m.judgeProtocol?.sharedModelFamily.shared) parts.push("the judge shares the analysts' model family");
  return parts.join("; ");
}

function total(values: readonly (number | undefined)[]): number | null {
  const present = values.filter((value): value is number => typeof value === "number");
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0);
}

/**
 * Tokens for plan-allowance runs, dollars for API runs (audit P3: "Cost
 * $0.000000" on a ChatGPT-plan run read as a free run).
 */
export function usageSummary(report: Pick<Report, "meta" | "appendix">): string {
  const execution = modelPasses(report.meta.execution);
  const input = total(execution.map((entry) => entry.inputTokens));
  const output = total(execution.map((entry) => entry.outputTokens));
  const tokens = input === null && output === null ? null
    : `${input === null ? "unknown" : formatNumber(input, 0)} input / ${output === null ? "unknown" : formatNumber(output, 0)} output tokens`;
  const plan = execution.length > 0 && execution.every((entry) => parseSubscriptionModel(entry.effectiveModel) ?? parseSubscriptionModel(entry.requestedModel));
  // The same figure the audit ledger totals: the sum of the displayed rows.
  const cost = roundedDisplayedCostTotal(report.appendix.costBreakdown.map((entry) => entry.costUsd));
  if (plan) {
    const provider = execution.some((entry) => /^gemini\//.test(entry.effectiveModel)) ? "Gemini CLI" : "ChatGPT plan";
    return `${tokens ?? "token usage not reported"} on the ${provider} allowance (no API charge recorded)`;
  }
  const dollars = `${formatCostUsd(cost)} API cost`;
  return tokens ? `${dollars}; ${tokens}` : dollars;
}

/**
 * The data-state sentence (audit P3: "Completeness confirmed: state
 * degraded" read as a contradiction). "Confirmed" described the metadata,
 * not the data; the sentence now leads with the data state.
 */
export function dataStateText(c: ReportCompletenessPresentation): string {
  if (c.metadataStatus !== "confirmed") return c.statusText;
  const state = c.state === "complete" ? "Complete" : c.state === "degraded" ? "Degraded" : c.state === "blocked" ? "Blocked" : "Unknown";
  const count = (n: number | "unknown", one: string, many: string) => (n === "unknown" ? `unknown ${many}` : `${n} ${n === 1 ? one : many}`);
  return `${state}: ${count(c.criticalCount, "critical gap", "critical gaps")}, ${count(c.warningCount, "warning", "warnings")}; EDGAR ${c.edgar}; XBRL ${c.xbrl}; forensics ${c.forensicValidation}.`;
}

/* ======================================================================== *
 * Appendix: data-gap summary and the methodology box
 * ======================================================================== */

const GAP_FAMILY: ReadonlyArray<readonly [RegExp, string]> = [
  [/^fmp\.planLimit|^statements\.backfill/, "Provider plan limits (history backfilled from SEC where possible)"],
  [/^fmp\.|^dataFallback|^keyless\.(?!stockSplits)/, "Provider endpoints unavailable or substituted"],
  [/^keyless\.stockSplits/, "Stock-split history notes"],
  [/^evidenceCoverage/, "Filing passages trimmed to the evidence budget"],
  [/^statements\./, "Statement fields enriched or withheld"],
  [/^valuation\./, "Valuation inputs and peer caveats"],
  [/^llm\./, "Analysis-pass disclosures"],
  [/^earningsCalendar/, "Earnings-date confirmation"],
  [/^analysis\.llm$/, "Analysis not completed"],
];

export interface GapSummaryRow {
  family: string;
  entries: number;
  highest: "critical" | "warn" | "info";
}

/** The missing-data manifest as counts by family (D-62); the full manifest is in the audit export. */
export function gapSummary(gaps: readonly ManifestEntry[]): GapSummaryRow[] {
  const rank = { critical: 3, warn: 2, info: 1 } as const;
  const families = new Map<string, GapSummaryRow>();
  for (const gap of gaps) {
    const family = GAP_FAMILY.find(([pattern]) => pattern.test(gap.field))?.[1] ?? "Other";
    const row = families.get(family) ?? { family, entries: 0, highest: "info" as const };
    row.entries += 1;
    if (rank[gap.severity] > rank[row.highest]) row.highest = gap.severity;
    families.set(family, row);
  }
  return [...families.values()].sort((a, b) => rank[b.highest] - rank[a.highest] || b.entries - a.entries || a.family.localeCompare(b.family));
}

/** "29 actionable gaps and 43 expected disclosures recorded." */
export function gapCountText(gaps: readonly ManifestEntry[]): string {
  if (gaps.length === 0) return "No missing-data entries recorded.";
  const expected = gaps.filter((gap) => gap.expected === true).length;
  const actionable = gaps.length - expected;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return `${plural(actionable, "actionable gap", "actionable gaps")}${expected > 0 ? ` and ${plural(expected, "expected disclosure", "expected disclosures")}` : ""} recorded.`;
}

/**
 * Critical and warning gaps with their reasons — the entries a reader needs
 * in the body (a withheld metric and why). Informational and expected entries
 * are counted by family; every entry is in the audit export.
 */
export function actionableGapTable(gaps: readonly ManifestEntry[]): BodyTable | null {
  const rows = gaps
    // The analysis.llm reason is the data-only banner; it is not repeated here.
    .filter((gap) => gap.expected !== true && gap.field !== "analysis.llm" && (gap.severity === "critical" || gap.severity === "warn"))
    .map((gap) => [gap.field, gap.severity, gap.reason]);
  return rows.length === 0 ? null : { heading: "Warnings and critical gaps", headers: ["Field", "Severity", "Reason"], rows };
}

/** The gaps a reader should see by name: critical and warning entries that are not expected omissions. */
export function actionableGapFields(gaps: readonly ManifestEntry[]): string[] {
  return gaps.filter((gap) => gap.expected !== true && (gap.severity === "critical" || gap.severity === "warn")).map((gap) => gap.field);
}

/**
 * The standard limitations, stated once (D-62) instead of as a negation on
 * every table: what the grades, targets, weights, projections, citations and
 * forensic screens are and are not.
 */
export function methodologyNotes(report: Pick<Report, "scores" | "projections" | "valuation" | "meta">): string[] {
  const notes = [
    "Grades and the composite score are deterministic house rules (bands, weights and signal transforms published in docs/METHODOLOGY.md). They have not been backtested against outcomes; a grade is a summary of the evidence shown, not a forecast.",
    "Intrinsic value, scenario values and projections are model ESTIMATEs computed from the disclosed inputs. They are not analyst price targets, guidance or predictions; the scenario display weights are a fixed prior, not probabilities.",
    "FACT, ESTIMATE and JUDGMENT labels mark what a statement is. A citation shows where a figure came from; it is a provenance check, not proof that a sentence's interpretation is correct.",
    "Forensic screens (Altman, Beneish, Piotroski, accruals) flag items to investigate. A flag is not a finding of misstatement, and a clean screen is not an audit.",
    "Peer, own-history and consensus comparisons are shown only where enough comparable observations exist; a dash means the comparison was withheld, not that it is neutral.",
    "Figures are rounded for display; calculations use full precision. The audit export carries every raw value, registry id, check and data gap.",
  ];
  if (report.meta.judgeProtocol?.sharedModelFamily.shared) {
    notes.push("The judge pass ran on the same model family that wrote the bull and bear cases, so the adjudication is not an independent second opinion.");
  }
  return notes;
}

/** Where the separate audit export lives for a persisted report. */
export function auditExportPath(report: Pick<Report, "meta">): string | null {
  const id = report.meta.reportId;
  return typeof id === "number" && Number.isSafeInteger(id) ? `/api/export/${id}?format=audit` : null;
}

/** A signal's raw value in its own unit ("66.9%", "426.7×", "0.66 frac" → "65.8%"). */
export function signalValueText(signal: Pick<ScoreSignal, "raw" | "unit">): string {
  switch (signal.unit.trim().toLowerCase()) {
    case "%": return formatPct(signal.raw);
    case "pp": return `${signal.raw >= 0 ? "+" : ""}${formatNumber(signal.raw, 1)} pp`;
    case "pp/yr": return `${signal.raw >= 0 ? "+" : ""}${formatNumber(signal.raw, 2)} pp/yr`;
    case "x": return formatMultiple(signal.raw);
    case "frac": case "fraction": return formatPct(signal.raw * 100);
    case "z": case "m": return formatNumber(signal.raw, 2);
    default: return formatNumber(signal.raw, 2);
  }
}

export function signedPoints(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;
}

/* ======================================================================== *
 * Body tables shared by the three surfaces
 * ======================================================================== */

export interface BodyTable {
  heading: string;
  headers: string[];
  rows: string[][];
  note?: string;
}

const SCORE_ASPECT_ORDER = ["fundamentals", "valuation", "quality", "balanceSheet", "moat", "leadership", "technicals"] as const;
const SCORE_ASPECT_LABEL: Record<(typeof SCORE_ASPECT_ORDER)[number], string> = {
  fundamentals: "Fundamentals", valuation: "Valuation", quality: "Quality", balanceSheet: "Balance Sheet",
  moat: "Moat", leadership: "Leadership (capital stewardship)", technicals: "Technicals",
};

/**
 * One row per aspect: score, band, weight and evidence, with what it
 * measures (D-62: replaces the separate weights and aspect-score tables).
 */
export function scorecardTable(scores: NonNullable<Report["scores"]>): BodyTable {
  return {
    heading: "Scorecard",
    headers: ["Aspect", "Score", "Band", "Weight", "Evidence", "What it measures"],
    rows: SCORE_ASPECT_ORDER.map((key) => {
      const aspect = scores.aspects[key];
      const weight = scores.composite.weights[key];
      return [
        SCORE_ASPECT_LABEL[key],
        aspect.score === null ? "—" : String(Math.round(aspect.score)),
        aspect.band ?? "—",
        `${formatNumber(weight, Number.isInteger(weight) ? 0 : 1)}%`,
        `${Math.round(aspect.dataCompleteness * 100)}%`,
        aspect.notApplicableReason ?? aspect.note,
      ];
    }),
  };
}

/** The business-quality / price-attractiveness split beside the composite, when recorded. */
export function assessmentLine(scores: NonNullable<Report["scores"]>): string | null {
  const a = scores.assessments;
  if (!a) return null;
  return [
    `Business quality ${a.businessQuality.score === null ? "—" : formatNumber(a.businessQuality.score, 0)} (${a.businessQuality.band ?? "—"})`,
    `price attractiveness ${a.valuation.score === null ? "—" : formatNumber(a.valuation.score, 0)} (${a.valuation.band ?? "—"})`,
    `evidence available for ${formatPct(a.evidenceCompleteness * 100, 0)} of the signal weight`,
  ].join(" · ");
}

/** A pass in one line: model, effort, tokens and any adjustment (the full record is in the audit export). */
export function passLine(entry: NonNullable<Report["meta"]["execution"]>[number]): string {
  const step = entry.step === "synthesize" ? "judge" : entry.step;
  const effort = entry.effectiveEffort ? `, ${entry.effectiveEffort} effort` : "";
  const tokens = entry.inputTokens === undefined && entry.outputTokens === undefined ? ""
    : `; ${entry.inputTokens === undefined ? "unknown" : formatNumber(entry.inputTokens, 0)} input / ${entry.outputTokens === undefined ? "unknown" : formatNumber(entry.outputTokens, 0)} output tokens`;
  const requested = entry.requestedModel !== entry.effectiveModel ? ` (requested ${entry.requestedModel})` : "";
  const adjusted = entry.adjustments.length > 0 ? `; ${entry.adjustments.join(", ")}` : "";
  return `${step}: ${entry.effectiveModel}${requested}${effort}${tokens}${adjusted}`;
}

/** Score drivers with reader labels, values in their own units and the points each adds. */
export function scoreDriverTable(scores: NonNullable<Report["scores"]>): BodyTable | null {
  const rows = SCORE_ASPECT_ORDER.flatMap((key) => (scores.aspects[key].signals ?? []).map((signal) => [
    SCORE_ASPECT_LABEL[key],
    signalLabel(signal.id),
    signalValueText(signal),
    signal.period ?? "—",
    formatNumber(signal.transformedScore, 0),
    formatPct(signal.effectiveCompositeWeightPct, 1),
    signedPoints(signal.contributionPoints),
    signal.fallbackReason ?? "—",
  ]));
  if (rows.length === 0) return null;
  return {
    heading: "Score drivers",
    headers: ["Aspect", "Signal", "Value", "Measured over", "Subscore", "Weight", "Points vs 50", "Fallback"],
    rows,
    note: "The composite is 50 plus the points column. Signals in the same factor family are not independent confirmations.",
  };
}

export function factorExposureTable(scores: NonNullable<Report["scores"]>): BodyTable | null {
  if (!scores.factorExposure || scores.factorExposure.length === 0) return null;
  return {
    heading: "Factor-family exposure",
    headers: ["Factor family", "Weight", "Points vs 50"],
    rows: scores.factorExposure.map((x) => [sentence(segmentWords(x.family)), formatPct(x.weightPct, 1), signedPoints(x.aboveNeutralPoints)]),
  };
}
