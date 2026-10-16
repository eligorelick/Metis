/**
 * Form 8-K current reports — pure parsers for the two things a 10-K/10-Q
 * reading never sees (NVDA report #34 audit, P1-1 / P0-11 / P1-11).
 *
 *   1. The earnings release (Item 2.02, EX-99.1) and the CFO commentary that
 *      some issuers furnish beside it (EX-99.2): next-period guidance, the
 *      issuer's own free-cash-flow figure and its capital-return facts.
 *   2. The material-event items of every other 8-K (1.01 agreements, 2.03
 *      off-balance-sheet obligations, 5.02 officer changes, 8.01 other events
 *      and their close relatives), as dated events.
 *
 * Every parser here reads the plain text `parseDocument(html).fullText` makes
 * of a filing and is deliberately conservative: a sentence is read only when
 * its numbers can be assigned without guessing (a "respectively" pairs values
 * with bases only when the counts agree; a scale word must be printed). What
 * cannot be read is left out and the caller discloses it — a wrong guidance
 * figure in a DCF anchor is worse than none.
 *
 * Money is returned in base units with the printed symbol kept separately:
 * "$" is not a currency until the caller binds it to the issuer's reporting
 * currency (payload currency rule, 1.4.0).
 *
 * Pure: no network, no clock.
 */

// ---------------------------------------------------------------------------
// Shared text helpers
// ---------------------------------------------------------------------------

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_DATE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i;
const ORDINAL_QUARTER: Record<string, 1 | 2 | 3 | 4> = { first: 1, second: 2, third: 3, fourth: 4 };
const SCALE: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };

/** Whitespace-normalized text: NBSP and runs of spaces collapse to one space. */
export function normalizeFilingText(text: string): string {
  return text.replace(/[   ]/g, " ").replace(/\s+/g, " ").trim();
}

/** "July 26, 2026" -> "2026-07-26"; null for anything that is not a real day. */
export function isoFromMonthDate(text: string): string | null {
  const m = MONTH_DATE.exec(text);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]!.toLowerCase()) + 1;
  const iso = `${m[3]}-${String(month).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

// Abbreviations a period does not end a sentence after ("Inc.", "Ajay K. Puri",
// "U.S.", "No. 333"); a decimal point never splits because no space follows it.
const NON_TERMINAL = /(?:\b(?:Inc|Corp|Co|Ltd|LLC|L\.P|N\.A|No|Nos|Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|approx|U\.S|U\.K|S\.A|e\.g|i\.e|Calif|Del)|\b[A-Z])\.$/;

/** Sentence split that survives "$0.25", "Inc." and middle initials. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?][”"’)]?\s+(?=[A-Z(“"•\d$])|\s+•\s+/g)) {
    const end = m.index + m[0].trimEnd().length;
    const candidate = text.slice(start, end).trim();
    if (m[0].trim() !== "•" && NON_TERMINAL.test(candidate)) continue;
    if (candidate.replace(/^•\s*/, "") !== "") out.push(candidate.replace(/^•\s*/, ""));
    start = m.index + m[0].length;
  }
  const tail = text.slice(start).trim().replace(/^•\s*/, "");
  if (tail !== "") out.push(tail);
  return out;
}

export interface MoneyMention {
  /** Base units (e.g. 108_000_000_000 for "$108.0 billion"). */
  value: number;
  /** Printed symbol: "$", "US$", "€", "£", "¥". */
  symbol: string;
  raw: string;
  index: number;
}

const MONEY_RE = /(US\$|\$|€|£|¥)\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(thousand|million|billion|trillion)\b)?/gi;

/** Money amounts with an explicit symbol; a bare number is never money. */
export function moneyMentions(text: string, defaultScale = 1): MoneyMention[] {
  return [...text.matchAll(MONEY_RE)].map((m) => {
    const scale = m[3] ? SCALE[m[3].toLowerCase()]! : defaultScale;
    return { value: round(Number(m[2]!.replace(/,/g, "")) * scale, 2), symbol: m[1]!.toUpperCase(), raw: m[0], index: m.index };
  });
}

function percentMentions(text: string): { value: number; index: number }[] {
  return [...text.matchAll(/(-?\d+(?:\.\d+)?)\s?%/g)].map((m) => ({ value: Number(m[1]), index: m.index }));
}

function round(value: number, dp = 6): number {
  return Number(value.toFixed(dp));
}

// ---------------------------------------------------------------------------
// Fiscal period phrases
// ---------------------------------------------------------------------------

export interface FiscalPeriod {
  /** "Q3 FY2027", or "FY2027" for a full fiscal year. */
  label: string;
  fiscalYear: number;
  /** null = full fiscal year. */
  fiscalQuarter: 1 | 2 | 3 | 4 | null;
}

function fiscalPeriod(fiscalYear: number, fiscalQuarter: 1 | 2 | 3 | 4 | null): FiscalPeriod {
  return { label: fiscalQuarter === null ? `FY${fiscalYear}` : `Q${fiscalQuarter} FY${fiscalYear}`, fiscalYear, fiscalQuarter };
}

/** "third quarter of fiscal 2027", "Q3 FY27", "fourth quarter of 2026". */
export function quarterPhrase(text: string): FiscalPeriod | null {
  const words = /\b(first|second|third|fourth)[ -]quarter(?: of)?(?: (?:fiscal|fiscal year|FY))? ?'?(\d{4})\b/i.exec(text);
  if (words) return fiscalPeriod(Number(words[2]), ORDINAL_QUARTER[words[1]!.toLowerCase()]!);
  const short = /\bQ([1-4])\s?(?:FY|fiscal )?'?(\d{4}|\d{2})\b/i.exec(text);
  if (short) {
    const year = short[2]!.length === 2 ? 2000 + Number(short[2]) : Number(short[2]);
    return fiscalPeriod(year, Number(short[1]) as 1 | 2 | 3 | 4);
  }
  return null;
}

function fullYearPhrase(text: string): FiscalPeriod | null {
  const m = /\bfull[ -](?:fiscal )?year(?: of)?(?: fiscal)?(?: year)? (\d{4})\b|\bfiscal (?:year )?(\d{4}) full[ -]year\b/i.exec(text);
  return m ? fiscalPeriod(Number(m[1] ?? m[2]), null) : null;
}

// ---------------------------------------------------------------------------
// Earnings release: guidance
// ---------------------------------------------------------------------------

export type GuidanceMetric =
  | "revenue"
  | "gross-margin"
  | "operating-expenses"
  | "operating-margin"
  | "operating-income"
  | "other-income"
  | "tax-rate"
  | "eps"
  | "capital-expenditures";
export type GuidanceBasis = "gaap" | "non-gaap" | "unspecified";

export interface GuidanceItem {
  metric: GuidanceMetric;
  basis: GuidanceBasis;
  period: FiscalPeriod;
  /** Money in base units of the printed symbol; percentages in percent points. */
  unit: "currency" | "currency-per-share" | "%";
  symbol: string | null;
  low: number;
  mid: number;
  high: number;
  /** How the issuer stated it: a point, an explicit range, a point ± tolerance, or "approximately". */
  form: "point" | "range" | "plus-minus" | "approximate";
  /** The issuer's sentence, bounded. */
  sentence: string;
}

export interface IssuerGuidance {
  /** The guided quarter named in the outlook heading; null when none was named. */
  period: FiscalPeriod | null;
  items: GuidanceItem[];
  /** Issuer caveats printed inside the outlook ("not assuming any Data Center compute revenue from China"). */
  qualifiers: string[];
  /** Outlook sentences carrying a number that no rule here could read. */
  unparsed: string[];
}

const METRIC_RULES: { metric: GuidanceMetric; pattern: RegExp; unit: GuidanceItem["unit"] }[] = [
  { metric: "gross-margin", pattern: /\bgross margins?\b/i, unit: "%" },
  { metric: "operating-margin", pattern: /\boperating margins?\b/i, unit: "%" },
  { metric: "operating-expenses", pattern: /\boperating expenses\b/i, unit: "currency" },
  { metric: "operating-income", pattern: /\boperating income\b/i, unit: "currency" },
  { metric: "tax-rate", pattern: /\btax rates?\b/i, unit: "%" },
  { metric: "other-income", pattern: /\bother income(?: and expense| \(expense\))?\b/i, unit: "currency" },
  { metric: "eps", pattern: /\b(?:diluted )?(?:earnings|net income) per (?:diluted )?share\b|\bEPS\b/i, unit: "currency-per-share" },
  { metric: "capital-expenditures", pattern: /\bcapital expenditures?\b|\bcapex\b/i, unit: "currency" },
  { metric: "revenue", pattern: /\b(?:total )?(?:revenues?|net sales)\b/i, unit: "currency" },
];

const OUTLOOK_HEADING = /\b(?:Business |Financial |Fiscal \d{4} )?(?:Outlook|Guidance)\b/g;
const OUTLOOK_STOP = /\b(?:Highlights|CFO Commentary|Conference Call|Non-GAAP Measures|For further information|Forward-Looking Statements|Certain statements in this|About [A-Z][A-Za-z]+|Data Center •|Reconciliation of)\b/;
const EXPECTATION = /\b(?:expect(?:s|ed)?|anticipat(?:e|es|ed)|outlook|guid(?:e|ance)|project(?:s|ed)|forecast)\b/i;

/** The outlook block: the first Outlook/Guidance heading followed by an expectation sentence. */
export function outlookBlock(text: string): string | null {
  for (const heading of text.matchAll(OUTLOOK_HEADING)) {
    const from = heading.index;
    const window = text.slice(from, from + 3_000);
    if (!/\bexpect/i.test(window.slice(0, 1_500))) continue;
    const stop = OUTLOOK_STOP.exec(window.slice(heading[0].length + 20));
    const end = stop ? heading[0].length + 20 + stop.index : window.length;
    return window.slice(0, end).trim();
  }
  return null;
}

function basesOf(sentence: string): GuidanceBasis[] {
  if (/\bGAAP and non-GAAP\b/i.test(sentence)) return ["gaap", "non-gaap"];
  if (/\bnon-GAAP\b/i.test(sentence)) return ["non-gaap"];
  if (/\bGAAP\b/.test(sentence)) return ["gaap"];
  return ["unspecified"];
}

type Bound = { low: number; mid: number; high: number; form: GuidanceItem["form"]; symbol: string | null };

/**
 * Read one guidance sentence. Values come only from the clause after the
 * expectation verb, cut before "inclusive of" / "excluding" asides, so an
 * included SBC amount is never read as the guided figure.
 */
export function parseGuidanceSentence(sentence: string, defaultPeriod: FiscalPeriod | null): GuidanceItem[] {
  if (!EXPECTATION.test(sentence)) return [];
  const rule = METRIC_RULES.find((r) => r.pattern.test(sentence));
  if (!rule) return [];
  const period = fullYearPhrase(sentence) ?? quarterPhrase(sentence) ?? defaultPeriod;
  if (period === null) return [];
  const verb = /\b(?:(?:is|are) expected to (?:be|range|total)|expects?\b[^.]{0,120}?\bto (?:be|range|total)|to be|of)\b/i.exec(sentence);
  if (!verb) return [];
  let clause = sentence.slice(verb.index + verb[0].length);
  clause = clause.split(/\b(?:inclusive of|including|excluding|exclusive of|which includes|reflecting)\b/i)[0]!;

  // A tolerance applies to every value it follows: "± 2%" scales a money
  // point; "± 50 basis points" widens a percentage by 0.5pp.
  const tolPct = /plus or minus (\d+(?:\.\d+)?)\s?%/i.exec(clause);
  const tolBp = /plus or minus (\d+(?:\.\d+)?) basis points/i.exec(clause);
  const valueClause = clause.replace(/,?\s*plus or minus [^,;.]*(?:basis points|%)/gi, " ");
  const approximate = /\b(?:approximately|about|around|roughly)\b/i.test(valueClause);

  const values: { value: number; symbol: string | null }[] = rule.unit === "%"
    ? percentMentions(valueClause).map((p) => ({ value: p.value, symbol: null }))
    : moneyMentions(valueClause).map((m) => ({ value: m.value, symbol: m.symbol }));
  if (values.length === 0) return [];

  const pointBound = (v: { value: number; symbol: string | null }): Bound => {
    if (tolBp && rule.unit === "%") {
      const w = Number(tolBp[1]) / 100;
      return { low: round(v.value - w), mid: v.value, high: round(v.value + w), form: "plus-minus", symbol: v.symbol };
    }
    if (tolPct && rule.unit !== "%") {
      const w = Number(tolPct[1]) / 100;
      return { low: round(v.value * (1 - w), 2), mid: v.value, high: round(v.value * (1 + w), 2), form: "plus-minus", symbol: v.symbol };
    }
    return { low: v.value, mid: v.value, high: v.value, form: approximate ? "approximate" : "point", symbol: v.symbol };
  };
  const rangeBound = (a: { value: number; symbol: string | null }, b: { value: number; symbol: string | null }): Bound | null =>
    a.value <= b.value ? { low: a.value, mid: round((a.value + b.value) / 2), high: b.value, form: "range", symbol: a.symbol ?? b.symbol } : null;

  const bases = basesOf(sentence);
  const respectively = /\brespectively\b/i.test(clause);
  const isRange = /\bbetween\b|\brange of\b|\bin the range\b|\d\s*(?:%|billion|million)?\s*(?:to|-|–)\s*\$?\d/i.test(valueClause);

  let bounds: Bound[] = [];
  if (respectively && bases.length === 2) {
    if (values.length === 2) bounds = values.map(pointBound);
    else if (values.length === 4 && isRange) {
      const first = rangeBound(values[0]!, values[1]!);
      const second = rangeBound(values[2]!, values[3]!);
      if (first && second) bounds = [first, second];
    }
    if (bounds.length !== 2) return [];
  } else if (values.length === 2 && isRange) {
    const shared = rangeBound(values[0]!, values[1]!);
    if (!shared) return [];
    bounds = bases.map(() => shared);
  } else if (values.length === 1) {
    bounds = bases.map(() => pointBound(values[0]!));
  } else {
    return [];
  }
  const text = sentence.length > 400 ? `${sentence.slice(0, 399)}…` : sentence;
  return bases.map((basis, i) => ({ metric: rule.metric, basis, period, unit: rule.unit, sentence: text, ...bounds[i]! }));
}

/** Guidance from a release or commentary; null when it prints no outlook. */
export function parseGuidance(rawText: string): IssuerGuidance | null {
  const block = outlookBlock(normalizeFilingText(rawText));
  if (block === null) return null;
  const period = quarterPhrase(block);
  const items: GuidanceItem[] = [];
  const qualifiers: string[] = [];
  const unparsed: string[] = [];
  for (const sentence of splitSentences(block)) {
    const parsed = parseGuidanceSentence(sentence, period);
    if (parsed.length > 0) {
      items.push(...parsed);
    } else if (/\b(?:not assuming|assumes?|excludes?|excluding|does not include)\b/i.test(sentence) && sentence.length <= 400) {
      qualifiers.push(sentence);
    } else if (/\d/.test(sentence) && EXPECTATION.test(sentence) && /[$%]/.test(sentence)) {
      unparsed.push(sentence.length > 300 ? `${sentence.slice(0, 299)}…` : sentence);
    }
  }
  // One item per metric/basis/period: the first statement wins, a restatement
  // of the same figure later in the block adds nothing.
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    const key = `${item.metric}|${item.basis}|${item.period.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { period, items: unique, qualifiers: qualifiers.slice(0, 4), unparsed: unparsed.slice(0, 4) };
}

// ---------------------------------------------------------------------------
// Earnings release: reported period, free cash flow, capital return
// ---------------------------------------------------------------------------

export interface ReportedPeriod {
  /** The quarter the release reports, from its title ("Second Quarter Fiscal 2027"). */
  fiscal: FiscalPeriod | null;
  /** That quarter's end date, from "quarter ended July 26, 2026". */
  periodEnd: string | null;
}

export function parseReportedPeriod(rawText: string): ReportedPeriod {
  const text = normalizeFilingText(rawText).slice(0, 6_000);
  const title = /\b(First|Second|Third|Fourth) Quarter(?:\s+and)?(?:\s+Full[ -]Year)?(?:\s+of)?(?:\s+Fiscal)?(?:\s+Year)?\s+(\d{4})\b/i.exec(text);
  const fiscal = title ? fiscalPeriod(Number(title[2]), ORDINAL_QUARTER[title[1]!.toLowerCase()]!) : null;
  const ended = /\bquarter (?:of fiscal (?:year )?\d{4} )?ended ((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2},? \d{4})/i.exec(text);
  return { fiscal, periodEnd: ended ? isoFromMonthDate(ended[1]!) : null };
}

export interface FreeCashFlowFact {
  value: number;
  symbol: string;
  /** Column period end. */
  periodEnd: string;
  /** 3 = the quarter; 6/9/12 = the year-to-date column. */
  months: 3 | 6 | 9 | 12;
  /** The issuer's definition sentence, when printed. */
  definition: string | null;
}

const MONTH_WORDS: Record<string, 3 | 6 | 9 | 12> = { three: 3, six: 6, nine: 9, twelve: 12 };

/**
 * The issuer's own free-cash-flow row from its GAAP-to-non-GAAP
 * reconciliation table. Columns are bound to dates only when the header
 * prints exactly as many month-day / year pairs as the row has values; the
 * year-to-date group starts where the first column's date repeats.
 */
const ROW_VALUES = String.raw`((?:\$?\s?\(?-?[\d,]+(?:\.\d+)?\)?\s*){1,8})`;

function rowNumbers(cells: string): number[] {
  return [...cells.matchAll(/\(?-?[\d,]+(?:\.\d+)?\)?/g)].map((m) => {
    const negative = m[0].startsWith("(") || m[0].startsWith("-");
    return (negative ? -1 : 1) * Number(m[0].replace(/[(),\-]/g, ""));
  });
}

/**
 * The columns of the statement or reconciliation table a row at `rowIndex`
 * belongs to: each column's period end and window, bound only when the nearest
 * "… Months Ended" header prints exactly `count` month-day / year pairs; the
 * year-to-date group starts where the first column's date repeats. `scale` is
 * the table's stated unit (null when none is printed).
 */
function tableColumns(text: string, rowIndex: number, count: number): { ends: string[]; months: (3 | 6 | 9 | 12)[]; scale: number | null } | null {
  const before = text.slice(Math.max(0, rowIndex - 12_000), rowIndex);
  const headerAt = before.lastIndexOf("Months Ended");
  if (headerAt < 0) return null;
  const header = before.slice(Math.max(0, headerAt - 40), headerAt + 400);
  const groups = [...header.matchAll(/\b(Three|Six|Nine|Twelve) Months Ended\b/gi)].map((m) => MONTH_WORDS[m[1]!.toLowerCase()]!);
  const afterGroups = header.slice(header.toLowerCase().lastIndexOf("months ended") + "months ended".length);
  const days = [...afterGroups.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}),/g)];
  const years = [...afterGroups.slice(days.at(-1) ? days.at(-1)!.index : 0).matchAll(/\b(20\d{2})\b/g)].map((m) => m[1]!);
  if (days.length === 0 || days.length !== years.length || days.length !== count || groups.length === 0) return null;
  const ends = days.map((d, i) => isoFromMonthDate(`${d[1]} ${d[2]}, ${years[i]}`));
  if (ends.some((e) => e === null)) return null;
  const scaleWindow = before.slice(Math.max(0, headerAt - 600), headerAt);
  const scale = /in thousands/i.test(scaleWindow) ? 1e3 : /in billions/i.test(scaleWindow) ? 1e9 : /in millions/i.test(scaleWindow) ? 1e6 : null;
  const ytdStart = groups.length > 1 ? ends.findIndex((end, i) => i > 0 && end === ends[0]) : -1;
  return { ends: ends as string[], months: ends.map((_, i) => (ytdStart > 0 && i >= ytdStart ? groups[1]! : groups[0]!)), scale };
}

export function parseIssuerFreeCashFlow(rawText: string): FreeCashFlowFact[] {
  const text = normalizeFilingText(rawText);
  const row = new RegExp(String.raw`\bFree cash flow\s+${ROW_VALUES}`).exec(text);
  if (!row) return [];
  const values = rowNumbers(row[1]!);
  const columns = tableColumns(text, row.index, values.length);
  if (columns === null || columns.scale === null) return [];
  const scale = columns.scale;
  const definition = /Free cash flow is (?:calculated|defined) as [^.]{10,300}\./i.exec(text)?.[0] ?? null;
  return values.map((value, i) => ({
    value: value * scale,
    symbol: "$",
    periodEnd: columns.ends[i]!,
    months: columns.months[i]!,
    definition,
  })).filter((fact) => /\$/.test(row[1]!) || fact.value !== 0);
}

export type ReconciliationMetric =
  | "operating-cash-flow"
  | "purchases-property-equipment"
  | "principal-payments-property-equipment"
  | "equity-securities-gains"
  | "non-gaap-tax-impact"
  | "gaap-diluted-eps"
  | "non-gaap-diluted-eps";

export interface ReconciliationFact {
  metric: ReconciliationMetric;
  /**
   * Base units of the printed symbol; per-share amounts as printed. Gains from
   * equity securities are the gain (the reconciliation prints its removal in
   * parentheses); purchases and principal payments are positive outflows.
   */
  value: number;
  unit: "currency" | "currency-per-share";
  symbol: string;
  periodEnd: string;
  months: 3 | 6 | 9 | 12;
}

const RECONCILIATION_ROWS: { metric: ReconciliationMetric; label: RegExp; sign: 1 | -1 | "abs" }[] = [
  { metric: "operating-cash-flow", label: /GAAP net cash provided by operating activities/, sign: 1 },
  { metric: "purchases-property-equipment", label: /Purchases related to property and equipment and intangible assets/, sign: "abs" },
  { metric: "principal-payments-property-equipment", label: /Principal payments on property and equipment and intangible assets/, sign: "abs" },
  { metric: "equity-securities-gains", label: /(?:Gains|\(Gains\)|Losses \(gains\)|\(Gains\) losses) (?:from|on) equity securities, net/, sign: -1 },
  { metric: "non-gaap-tax-impact", label: /Income tax impact of non-GAAP adjustments/, sign: 1 },
];

/**
 * D-63 (NVDA audit P1-A, P1-B): the GAAP-to-non-GAAP reconciliation an
 * earnings release or CFO commentary prints — the free-cash-flow bridge (so
 * the issuer's FCF and operating cash flow less capex reconcile: NVIDIA's
 * Q2 FY2027 $59 million gap is principal payments), the equity-securities
 * gains the non-GAAP figures remove, their tax effect, and GAAP and non-GAAP
 * diluted EPS by quarter. Each row binds to its own table's columns; a row
 * that also appears in the cash-flow statement binds there too, and the first
 * value read for a metric, period and window wins. Pure.
 */
export function parseReconciliation(rawText: string): ReconciliationFact[] {
  const text = normalizeFilingText(rawText);
  const out: ReconciliationFact[] = [];
  const push = (fact: ReconciliationFact): void => {
    if (!out.some((f) => f.metric === fact.metric && f.periodEnd === fact.periodEnd && f.months === fact.months)) out.push(fact);
  };
  for (const rule of RECONCILIATION_ROWS) {
    for (const row of text.matchAll(new RegExp(String.raw`${rule.label.source}\s+${ROW_VALUES}`, "g"))) {
      const values = rowNumbers(row[1]!);
      const columns = tableColumns(text, row.index, values.length);
      if (columns === null || columns.scale === null) continue;
      values.forEach((value, i) => push({
        metric: rule.metric,
        value: (rule.sign === "abs" ? Math.abs(value) : value * rule.sign) * columns.scale!,
        unit: "currency", symbol: "$", periodEnd: columns.ends[i]!, months: columns.months[i]!,
      }));
    }
  }
  // "Diluted net income per share GAAP $ 2.46 … Non-GAAP* $ 2.22 …": the
  // per-share rows print no scale; the values are the amounts.
  const eps = new RegExp(String.raw`Diluted net income per share\s+GAAP\s+${ROW_VALUES}Non-GAAP\*?\s+${ROW_VALUES}`).exec(text);
  if (eps) {
    for (const [metric, cells] of [["gaap-diluted-eps", eps[1]!], ["non-gaap-diluted-eps", eps[2]!]] as const) {
      const values = rowNumbers(cells);
      const columns = tableColumns(text, eps.index, values.length);
      if (columns === null || !/\$/.test(cells)) continue;
      values.forEach((value, i) => push({ metric, value, unit: "currency-per-share", symbol: "$", periodEnd: columns.ends[i]!, months: columns.months[i]! }));
    }
  }
  return out;
}

/**
 * D-63: the issuer's statement that its non-GAAP basis changed ("Beginning in
 * the first quarter of fiscal 2027, NVIDIA's non-GAAP financial measures no
 * longer exclude stock-based compensation expense."), with the sentence after
 * it when that says how history was restated. Null when none is printed.
 */
export function parseNonGaapBasisNote(rawText: string): string | null {
  const text = normalizeFilingText(rawText);
  const m = /\bBeginning (?:in|with) (?:the )?(?:first|second|third|fourth) quarter of fiscal(?: year)? \d{4},[^.]{0,240}\bnon-GAAP\b[^.]{0,240}\.(?:\s+The historical non-GAAP[^.]{0,240}\.)?/i.exec(text);
  return m ? (m[0].length > 600 ? `${m[0].slice(0, 599)}…` : m[0]) : null;
}

export interface CommitmentRow {
  label: string;
  /** The row's total column, base units of the printed symbol. */
  total: number;
}

export interface CommitmentTable {
  /** "Future commitments" or "Guarantees (maximum gross exposure)". */
  kind: "commitments" | "guarantees";
  /** The date the table is stated as of, when printed. */
  asOf: string | null;
  rows: CommitmentRow[];
  /** The table's own Total row, when printed. */
  total: number | null;
}

const CELL = /^(?:\$|—|–|-|\(?[\d,]+(?:\.\d+)?\)?)$/;

/** Rows of a flattened table: a label, then `columns` cells ("$" is skipped, a dash is zero). */
function tableRows(body: string, columns: number, maxRows = 12): { label: string; cells: number[] }[] {
  const tokens = body.split(/\s+/).filter((t) => t !== "");
  const rows: { label: string; cells: number[] }[] = [];
  let i = 0;
  while (i < tokens.length && rows.length < maxRows) {
    const label: string[] = [];
    while (i < tokens.length && !CELL.test(tokens[i]!)) label.push(tokens[i++]!);
    const cells: number[] = [];
    while (i < tokens.length && cells.length < columns && CELL.test(tokens[i]!)) {
      const t = tokens[i++]!;
      if (t === "$") continue;
      cells.push(/^[—–-]$/.test(t) ? 0 : rowNumbers(t)[0]!);
    }
    if (label.length === 0 || cells.length !== columns || label.length > 14) break;
    rows.push({ label: label.join(" "), cells });
    if (/^Total$/i.test(label.join(" "))) break;
  }
  return rows;
}

/**
 * D-63 (NVDA audit P1-D): the commitments and guarantees tables a CFO
 * commentary or a 10-Q note prints — "Future commitments by fiscal year as of
 * July 26, 2026 … Total (In billions) Supply and capacity $ 92 … $ 279" and
 * "maximum gross exposure related to our guarantees … (in billions): …
 * Total $ 108.5". Each row keeps its total column. Pure; a table whose rows do
 * not line up with its header is skipped, never guessed.
 */
export function parseCommitmentTables(rawText: string): CommitmentTable[] {
  const text = normalizeFilingText(rawText);
  const out: CommitmentTable[] = [];
  for (const m of text.matchAll(/Future commitments by fiscal year as of ((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}),? were as follows:\s*([\s\S]{0,200}?)\(In (billions|millions)\)/g)) {
    const header = m[2]!;
    const columns = (header.match(/\b20\d{2}\b/g) ?? []).length + (/\bTotal\b/.test(header) ? 1 : 0);
    if (columns < 2) continue;
    const scale = m[3] === "billions" ? 1e9 : 1e6;
    const rows = tableRows(text.slice(m.index + m[0].length, m.index + m[0].length + 2_000), columns);
    const totalRow = rows.find((r) => /^Total$/i.test(r.label)) ?? null;
    const items = rows.filter((r) => r !== totalRow).map((r) => ({ label: r.label, total: r.cells.at(-1)! * scale }));
    if (items.length > 0) out.push({ kind: "commitments", asOf: isoFromMonthDate(m[1]!), rows: items, total: totalRow === null ? null : totalRow.cells.at(-1)! * scale });
  }
  const guarantees = /maximum gross exposure related to our guarantees[^:]{0,160}\(in (billions|millions)\):?\s*/i.exec(text);
  if (guarantees) {
    const scale = guarantees[1]!.toLowerCase() === "billions" ? 1e9 : 1e6;
    const rows = tableRows(text.slice(guarantees.index + guarantees[0].length, guarantees.index + guarantees[0].length + 600), 1, 8);
    const totalRow = rows.find((r) => /^Total$/i.test(r.label)) ?? null;
    const items = rows.filter((r) => r !== totalRow).map((r) => ({ label: r.label, total: r.cells[0]! * scale }));
    const asOf = isoFromMonthDate(/as of ((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4})/.exec(text.slice(Math.max(0, guarantees.index - 3_000), guarantees.index))?.[1] ?? "");
    if (items.length > 0) out.push({ kind: "guarantees", asOf, rows: items, total: totalRow === null ? null : totalRow.cells[0]! * scale });
  }
  return out;
}

export interface CapitalReturnFacts {
  /** "$26.0 billion" returned via repurchases + dividends, with the period phrase it was stated for. */
  returned: { value: number; symbol: string; periodText: string | null } | null;
  authorizationRemaining: { value: number; symbol: string } | null;
  authorizationAdded: { value: number; symbol: string } | null;
  dividendPerShare: { value: number; symbol: string; payDate: string | null; recordDate: string | null } | null;
  dividendChange: { from: number; to: number; symbol: string } | null;
  sentences: string[];
}

export function parseCapitalReturn(rawText: string): CapitalReturnFacts {
  const text = normalizeFilingText(rawText);
  const narrative = text.slice(0, narrativeEnd(text));
  const out: CapitalReturnFacts = { returned: null, authorizationRemaining: null, authorizationAdded: null, dividendPerShare: null, dividendChange: null, sentences: [] };
  for (const sentence of splitSentences(narrative)) {
    let used = false;
    const returned = /\breturned\b[^.]{0,40}?((?:US)?\$\s?[\d.,]+\s*(?:billion|million))[^.]{0,30}?\bto (?:share|stock)holders\b/i.exec(sentence);
    if (returned && out.returned === null) {
      const money = moneyMentions(returned[1]!)[0];
      const during = /\b(?:During|In|For) ((?:the )?(?:first|second|third|fourth) quarter of fiscal \d{4}|fiscal \d{4}|(?:the )?(?:first|second|third|fourth) quarter)\b/i.exec(sentence);
      if (money) { out.returned = { value: money.value, symbol: money.symbol, periodText: during ? during[1]! : null }; used = true; }
    }
    const remaining = /((?:US)?\$\s?[\d.,]+\s*(?:billion|million)) remaining under (?:its|the|our) (?:share |stock )?repurchase (?:authorization|program)/i.exec(sentence);
    if (remaining && out.authorizationRemaining === null) {
      const money = moneyMentions(remaining[1]!)[0];
      if (money) { out.authorizationRemaining = { value: money.value, symbol: money.symbol }; used = true; }
    }
    const added = /approved an additional ((?:US)?\$\s?[\d.,]+\s*(?:billion|million)) (?:to|for|of) (?:the |its |our )?(?:Company['’]s )?(?:share |stock )?repurchase/i.exec(sentence);
    if (added && out.authorizationAdded === null) {
      const money = moneyMentions(added[1]!)[0];
      if (money) { out.authorizationAdded = { value: money.value, symbol: money.symbol }; used = true; }
    }
    const change = /increas\w* (?:its |the |our )?quarterly (?:cash )?dividend from ((?:US)?\$)\s?(\d+(?:\.\d+)?) per share to (?:US)?\$\s?(\d+(?:\.\d+)?) per share/i.exec(sentence);
    if (change && out.dividendChange === null) {
      out.dividendChange = { from: Number(change[2]), to: Number(change[3]), symbol: change[1]!.toUpperCase() };
      used = true;
    }
    const dividend = /(?:quarterly (?:cash )?dividend of|dividend (?:of|to)) ((?:US)?\$)\s?(\d+(?:\.\d+)?) per share/i.exec(sentence) ??
      (change ? /(?:to) ((?:US)?\$)\s?(\d+(?:\.\d+)?) per share/i.exec(sentence.slice(sentence.search(/\bfrom\b/i))) : null);
    if (dividend && out.dividendPerShare === null && /\bdividend\b/i.test(sentence)) {
      const pay = /paid on ([A-Z][a-z]+ \d{1,2}, \d{4})|\bon ([A-Z][a-z]+ \d{1,2}, \d{4}),? to (?:all )?(?:share|stock)holders/i.exec(sentence);
      const record = /of record (?:on |as of )?([A-Z][a-z]+ \d{1,2}, \d{4})/i.exec(sentence);
      out.dividendPerShare = {
        value: Number(dividend[2]),
        symbol: dividend[1]!.toUpperCase(),
        payDate: pay ? isoFromMonthDate(pay[1] ?? pay[2]!) : null,
        recordDate: record ? isoFromMonthDate(record[1]!) : null,
      };
      used = true;
    }
    if (used) out.sentences.push(sentence.length > 400 ? `${sentence.slice(0, 399)}…` : sentence);
  }
  return out;
}

/**
 * Where a release's narrative ends and its boilerplate (non-GAAP definitions,
 * safe-harbor text, the financial tables) begins.
 */
export function narrativeEnd(text: string): number {
  const stops = [/\bFor further information,? contact\b/i, /\bNon-GAAP Measures\b/, /\bForward-Looking Statements\b/, /\bCertain statements in this\b/i, /\bAbout [A-Z][A-Za-z]+ [A-Z(]/];
  let end = text.length;
  for (const stop of stops) {
    const m = stop.exec(text.slice(300));
    if (m) end = Math.min(end, 300 + m.index);
  }
  return end;
}

/** The release or commentary prose up to its boilerplate, for the analyst excerpt. */
export function releaseNarrative(rawText: string): string {
  const text = normalizeFilingText(rawText).replace(/^EX-99\.\d+\s+\d+\s+\S+\s+EX-99\.\d+\s+Document\s+/i, "");
  return text.slice(0, narrativeEnd(text)).trim();
}

// ---------------------------------------------------------------------------
// Material-event 8-K items
// ---------------------------------------------------------------------------

/**
 * The 8-K items treated as dated corporate events. 4.01/4.02 stay with the
 * forensic notes (compute.ts); 2.02 is the earnings release itself; 7.01 and
 * 9.01 only furnish exhibits.
 */
export const MATERIAL_EVENT_ITEMS: Readonly<Record<string, string>> = {
  "1.01": "Entry into a Material Definitive Agreement",
  "1.02": "Termination of a Material Definitive Agreement",
  "2.01": "Completion of Acquisition or Disposition of Assets",
  "2.03": "Creation of a Direct Financial Obligation or an Obligation under an Off-Balance Sheet Arrangement of a Registrant",
  "2.05": "Costs Associated with Exit or Disposal Activities",
  "2.06": "Material Impairments",
  "5.02": "Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers; Compensatory Arrangements of Certain Officers",
  // D-63 (NVDA audit P1-J): the annual meeting's votes — director elections
  // and say-on-pay — are governance evidence the leadership section needs.
  "5.07": "Submission of Matters to a Vote of Security Holders",
  "8.01": "Other Events",
};

/** Official titles, for recognising a heading as opposed to a cross-reference. */
const ITEM_TITLES: Readonly<Record<string, string>> = {
  ...MATERIAL_EVENT_ITEMS,
  "1.03": "Bankruptcy or Receivership",
  "1.05": "Material Cybersecurity Incidents",
  "2.02": "Results of Operations and Financial Condition",
  "2.04": "Triggering Events",
  "3.01": "Notice of Delisting",
  "3.02": "Unregistered Sales of Equity Securities",
  "3.03": "Material Modification to Rights of Security Holders",
  "4.01": "Changes in Registrant's Certifying Accountant",
  "4.02": "Non-Reliance on Previously Issued Financial Statements",
  "5.01": "Changes in Control of Registrant",
  "5.03": "Amendments to Articles of Incorporation or Bylaws",
  "5.07": "Submission of Matters to a Vote of Security Holders",
  "7.01": "Regulation FD Disclosure",
  "9.01": "Financial Statements and Exhibits",
};

export interface EightKItemSection {
  item: string;
  title: string;
  text: string;
  /** Set when the item only incorporates another item by reference. */
  incorporates: string | null;
}

/** "8.01,9.01" -> ["8.01", "9.01"] */
export function itemsOf(items: string | undefined): string[] {
  return (items ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d\.\d{2}$/.test(s));
}

export function hasMaterialEventItem(items: string | undefined): boolean {
  return itemsOf(items).some((item) => item in MATERIAL_EVENT_ITEMS);
}

/**
 * Split an 8-K primary document into its item sections. A heading is
 * "Item N.NN" followed by the first two words of that item's official title;
 * "incorporated by reference into this Item 2.03" is not a heading.
 */
export function splitEightKItems(rawText: string): EightKItemSection[] {
  const text = normalizeFilingText(rawText);
  const heads: { item: string; start: number; bodyStart: number }[] = [];
  for (const m of text.matchAll(/\bItem\s+(\d\.\d{2})\s*[.:–—-]?\s*/gi)) {
    const item = m[1]!;
    const title = ITEM_TITLES[item];
    if (!title) continue;
    const lead = title.split(/\s+/).slice(0, 2).join(" ").replace(/[^A-Za-z ]/g, "").toLowerCase();
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 200).replace(/[^A-Za-z ]/g, "").toLowerCase();
    if (!after.startsWith(lead)) continue;
    // Skip the official title as printed, up to its end or the first sentence start.
    let bodyStart = m.index + m[0].length;
    const printed = text.slice(bodyStart, bodyStart + title.length + 40);
    const titleEnd = matchTitleEnd(printed, title);
    bodyStart += titleEnd;
    heads.push({ item, start: m.index, bodyStart });
  }
  const stop = /\b(?:SIGNATURES?\b|Forward[- ]Looking Statements\b|Cautionary (?:Note|Statement)\b)/;
  return heads.map((head, i) => {
    const limit = heads[i + 1]?.start ?? text.length;
    let body = text.slice(head.bodyStart, limit);
    const s = stop.exec(body);
    if (s) body = body.slice(0, s.index);
    body = body.replace(/^[\s.:–—-]+/, "").trim();
    const incorporates = /^The information (?:set forth|contained|included) (?:in|under) Item (\d\.\d{2})[^.]{0,120}\bincorporated (?:herein )?by reference/i.exec(body)?.[1] ?? null;
    return { item: head.item, title: ITEM_TITLES[head.item]!, text: body, incorporates: incorporates !== null && body.length < 400 ? incorporates : null };
  });
}

function matchTitleEnd(printed: string, title: string): number {
  // Walk the official title's words through the printed text; stop at the
  // first word that differs (issuers abbreviate: "Regulation FD", "Other Events.").
  let at = 0;
  for (const word of title.split(/\s+/)) {
    const parts = word.split(/[^A-Za-z0-9]+/).filter((part) => part !== "");
    if (parts.length === 0) continue;
    // "Off-Balance" and "Registrant's" match whatever joiner the issuer printed.
    const re = new RegExp(`^[\\s.;,:–—-]*${parts.join("[^A-Za-z0-9]{0,2}")}`, "i");
    const m = re.exec(printed.slice(at));
    if (!m) break;
    at += m[0].length;
  }
  return at + (/^\s*\./.exec(printed.slice(at))?.[0].length ?? 0);
}

/** The event's "Date of Report (Date of earliest event reported)". */
export function eventDateOf(rawText: string): string | null {
  const m = /Date of Report \(Date of earliest event reported\)\s*:?\s*([A-Z][a-z]+ \d{1,2},? \d{4})/i.exec(normalizeFilingText(rawText).slice(0, 4_000));
  return m ? isoFromMonthDate(m[1]!) : null;
}

/**
 * A short deterministic summary of one item: its dated lead sentences ("On
 * June 28, 2026, ...") and the first sentence stating an amount, bounded.
 */
export function summarizeItem(section: EightKItemSection, maxChars = 600): string {
  const sentences = splitSentences(section.text);
  const dated = sentences.filter((s) => /^(?:\([a-z]\)\s*)?On [A-Z][a-z]+ \d{1,2}, \d{4}\b/.test(s));
  const picked: string[] = [];
  for (const s of dated.slice(0, section.item === "5.02" ? 3 : 1)) picked.push(s);
  if (picked.length === 0 && sentences[0]) picked.push(sentences[0]);
  const money = sentences.find((s) => !picked.includes(s) && /(?:US)?\$\s?\d[\d,.]*\s*(?:billion|million|trillion)?/.test(s));
  if (money && section.item !== "5.02") picked.push(money);
  // D-63 (NVDA audit P1-E): whole sentences, never a cut mid-list. A notes
  // offering's dated sentence names every tranche ("…$3,500,000,000 of 4.25%
  // Notes due 2028, …") and used to end "…Notes due …" with the total unread,
  // so the series' aggregate principal is stated, marked as computed.
  const total = aggregatePrincipal(section.text);
  const suffix = total === null ? "" : ` [computed: ${total.count} series, ${total.text} aggregate principal amount in total]`;
  const room = Math.max(0, maxChars - suffix.length);
  const kept: string[] = [];
  for (const s of picked) {
    if ([...kept, s].join(" ").length <= room) kept.push(s);
    else break;
  }
  const body = kept.length > 0 ? kept.join(" ") : clipAtClause(picked[0] ?? "", room);
  return `${body}${suffix}`;
}

/** Cut a sentence at its last clause boundary (", " / "; ") that fits, with an ellipsis. */
function clipAtClause(sentence: string, maxChars: number): string {
  if (sentence.length <= maxChars) return sentence;
  const head = sentence.slice(0, Math.max(0, maxChars - 1));
  const cut = Math.max(head.lastIndexOf("; "), head.lastIndexOf(", "));
  return `${cut > maxChars / 3 ? head.slice(0, cut) : head.trimEnd()}…`;
}

/**
 * The sum of the "$X aggregate principal amount" series an item lists, when it
 * lists two or more in one currency symbol; null otherwise.
 */
function aggregatePrincipal(text: string): { count: number; text: string } | null {
  const amounts = [...normalizeFilingText(text).matchAll(/((?:US)?\$)\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(thousand|million|billion|trillion))?\s+(?:in\s+)?aggregate principal amount/gi)];
  if (amounts.length < 2 || new Set(amounts.map((m) => m[1]!.toUpperCase())).size !== 1) return null;
  const sum = amounts.reduce((acc, m) => acc + Number(m[2]!.replace(/,/g, "")) * (m[3] ? SCALE[m[3].toLowerCase()]! : 1), 0);
  const symbol = amounts[0]![1]!.toUpperCase();
  const fmt = (v: number): string => {
    const s = v.toFixed(3).replace(/0+$/, "");
    return s.endsWith(".") ? `${s}0` : s;
  };
  return { count: amounts.length, text: sum >= 1e9 ? `${symbol}${fmt(sum / 1e9)} billion` : `${symbol}${fmt(sum / 1e6)} million` };
}
