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
 * Parsers read the plain text `parseDocument(html).fullText` makes of a filing;
 * current-only guidance tables also require that parsed document's source
 * structure. They are deliberately conservative: a sentence is read only when
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

import { parseGuidanceTables } from "@/edgar/guidanceTables";
import type { ParsedDocument } from "@/edgar/extract";

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

const MONEY_SYMBOL = String.raw`US\$|\$|€|£|¥`;
const MONEY_NUMBER = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
const MONEY_RE = new RegExp(String.raw`(${MONEY_SYMBOL})\s?(${MONEY_NUMBER})(?:\s*(thousand|million|billion|trillion)\b)?`, "gi");
/**
 * Audit 2026-10-22 B-25: "$73-76 billion", "$58–$61 billion" and "between $58
 * and $61 billion" print the scale once, after the high end. Both ends take
 * that scale, and a bare high end takes the low end's symbol; otherwise the low
 * end read as $73 and "76 billion", having no symbol, was not money at all.
 */
const MONEY_RANGE_RE = new RegExp(String.raw`(${MONEY_SYMBOL})\s?(${MONEY_NUMBER})(\s*(?:-|–|—|\bto\b|\band\b)\s*)(?:${MONEY_SYMBOL})?\s?(${MONEY_NUMBER})\s*(thousand|million|billion|trillion)\b`, "gid");
/** "and" joins the ends of a range only after "between". */
const BETWEEN_TAIL = /\bbetween\s*$/i;

const amount = (printed: string): number => Number(printed.replace(/,/g, ""));

/** Money amounts with an explicit symbol; a bare number is never money. */
export function moneyMentions(text: string, defaultScale = 1): MoneyMention[] {
  const out: MoneyMention[] = [];
  const spans: [number, number][] = [];
  for (const m of text.matchAll(MONEY_RANGE_RE)) {
    const scale = SCALE[m[5]!.toLowerCase()]!;
    const [low, high] = [amount(m[2]!) * scale, amount(m[4]!) * scale];
    if (/and/i.test(m[3]!) && !BETWEEN_TAIL.test(text.slice(0, m.index))) continue;
    if (low > high) continue;
    const symbol = m[1]!.toUpperCase();
    const highStart = m.indices![4]![0];
    out.push({ value: round(low, 2), symbol, raw: text.slice(m.index, m.indices![3]![0]), index: m.index },
      { value: round(high, 2), symbol, raw: text.slice(highStart, m.index + m[0].length), index: highStart });
    spans.push([m.index, m.index + m[0].length]);
  }
  for (const m of text.matchAll(MONEY_RE)) {
    if (spans.some(([from, to]) => m.index >= from && m.index < to)) continue;
    const scale = m[3] ? SCALE[m[3].toLowerCase()]! : defaultScale;
    out.push({ value: round(amount(m[2]!) * scale, 2), symbol: m[1]!.toUpperCase(), raw: m[0], index: m.index });
  }
  return out.sort((a, b) => a.index - b.index);
}

/**
 * B-25: in "15-17%", "15 to 17%" and "between 15%-17%" the high end's % covers
 * the low end, and a hyphen that follows a number or % is never a minus sign
 * (it read "15-17%" as −17%).
 */
const PERCENT_RANGE_RE = /(?<![\d.])(-?\d+(?:\.\d+)?)\s?%?(\s*(?:-|–|—|\bto\b|\band\b)\s*)(\d+(?:\.\d+)?)\s?%/gd;

function percentMentions(text: string): { value: number; index: number }[] {
  const out: { value: number; index: number }[] = [];
  const spans: [number, number][] = [];
  for (const m of text.matchAll(PERCENT_RANGE_RE)) {
    if (/and/i.test(m[2]!) && !BETWEEN_TAIL.test(text.slice(0, m.index))) continue;
    if (Number(m[1]) > Number(m[3])) continue;
    out.push({ value: Number(m[1]), index: m.index }, { value: Number(m[3]), index: m.indices![3]![0] });
    spans.push([m.index, m.index + m[0].length]);
  }
  for (const m of text.matchAll(/((?<![\d%]\s*)-)?(\d+(?:\.\d+)?)\s?%/g)) {
    if (spans.some(([from, to]) => m.index >= from && m.index < to)) continue;
    out.push({ value: Number(`${m[1] ?? ""}${m[2]}`), index: m.index });
  }
  return out.sort((a, b) => a.index - b.index);
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

/**
 * AMZN audit 2026-10-20: a period named as the base of a comparison ("compared
 * with $167.7 billion in second quarter 2025", "to grow between 9% and 12%
 * compared with third quarter 2025") is the year-ago quarter, never the one a
 * release reports or guides. Amazon's releases name no other year in those
 * sentences, so the base year labelled both its reported and its guided quarter.
 * The cue governs the phrase only when nothing but amounts and connecting
 * words stand between them ("compared with $167.7 billion in second quarter
 * 2025", "compared with $18.2 billion, or $1.68 per diluted share, in second
 * quarter 2025"); a cue earlier in the clause ("the impact from foreign currency,
 * revenue for the fourth quarter of 2026") governs something else.
 */
const COMPARISON_FILLER = String.raw`(?:(?:the|a|an|or|per|diluted|basic|share|same|prior|prior-year|year-ago|year|ago|period|in|of|for|during|levels?|approximately|about|roughly|nearly)[\s,]+|[$€£¥]?\s?\d[\d,]*(?:\.\d+)?\s*(?:%|percent|billion|million|thousand|trillion)?[\s,]+)*`;
const COMPARISON_TAIL = new RegExp(String.raw`\b(?:compared (?:with|to)|versus|vs\.?|relative to|against|from|over|above|below|than)\s+${COMPARISON_FILLER}$`, "i");

/** Whether the phrase at `index` directly follows a comparison cue in its own clause. */
function comparisonBase(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 80), index);
  // A sentence ends at ". ", but "vs. " is the cue itself, not a boundary.
  const clause = before.split(/[;•\n]|(?<!\bvs)\.\s/i).at(-1) ?? before;
  return COMPARISON_TAIL.test(clause);
}

/** The first match of a global `pattern` that is not a comparison base. */
function firstNonComparison(pattern: RegExp, text: string): RegExpExecArray | null {
  for (const m of text.matchAll(pattern)) {
    if (!comparisonBase(text, m.index)) return m as RegExpExecArray;
  }
  return null;
}

/** "third quarter of fiscal 2027", "Q3 FY27", "fourth quarter of 2026"; a comparison base is skipped. */
export function quarterPhrase(text: string): FiscalPeriod | null {
  const words = firstNonComparison(/\b(first|second|third|fourth)[ -]quarter(?: of)?(?: (?:fiscal|fiscal year|FY))? ?'?(\d{4})\b/gi, text);
  if (words) return fiscalPeriod(Number(words[2]), ORDINAL_QUARTER[words[1]!.toLowerCase()]!);
  const short = firstNonComparison(/\bQ([1-4])\s?(?:FY|fiscal )?'?(\d{4}|\d{2})\b/gi, text);
  if (short) {
    const year = short[2]!.length === 2 ? 2000 + Number(short[2]) : Number(short[2]);
    return fiscalPeriod(year, Number(short[1]) as 1 | 2 | 3 | 4);
  }
  return null;
}

function fullYearPhrase(text: string): FiscalPeriod | null {
  const m = firstNonComparison(/\bfull[ -](?:fiscal )?year(?: of)?(?: fiscal)?(?: year)? (\d{4})\b|\bfiscal (?:year )?(\d{4}) full[ -]year\b/gi, text);
  return m ? fiscalPeriod(Number(m[1] ?? m[2]), null) : null;
}

/** A sentence about a quarter or another part of a year. */
const PART_OF_YEAR = /\bquarters?\b|\bQ[1-4]\b|\bhalf\b|\bhalves\b|\bremainder\b|\bremaining\b|\brest of\b|\bmonths?\b|\bweeks?\b/i;
const MONTH = String.raw`(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?`;
/** A part of a year with its ordinal and year ("fourth quarter 2025", "the first half of fiscal 2025", "Q4 FY25"). */
const PART_OF_YEAR_PHRASE = /\b(?:(?:first|second|third|fourth|last|next|past|prior|three|six|nine|twelve|\d+)[ -])?(?:quarters?|Q[1-4]|half|halves|months?|weeks?)\b(?:\s+(?:of\s+)?(?:fiscal\s+(?:year\s+)?|FY\s?)?'?(?:20\d{2}|\d{2})\b)?/gi;

/** `text` with each part-of-year phrase named only as a comparison base blanked out, positions kept. */
function withoutComparisonParts(text: string): string {
  return text.replace(PART_OF_YEAR_PHRASE, (m: string, index: number) => comparisonBase(text, index) ? "#".repeat(m.length) : m);
}

/**
 * Audit 2026-10-22 B-25: an outlook that names its year without "full year"
 * ("2026 capital expenditures", "Adjusted EPS of $2.25 to $2.35 in 2026",
 * "investment goals for 2025") guides that fiscal year. It took the outlook
 * block's quarter. A sentence about a quarter or part of a year keeps the
 * block's quarter, unless the quarter is only a comparison base ("compared
 * with fourth quarter 2025 revenue"), which names neither the sentence's period
 * nor its year. A date's year ("December 31, 2025") or a maturity's ("notes
 * due 2030") names no outlook. With the block's period known, only its fiscal
 * year or the next is an outlook's ("the 2024 divestiture" in a 2026 release
 * is not).
 */
function namedYearPhrase(text: string, block: FiscalPeriod | null): FiscalPeriod | null {
  const own = withoutComparisonParts(text);
  if (PART_OF_YEAR.test(own)) return null;
  const unmatured = own.replace(MATURITY_YEAR, (m) => m.replace(/\d/g, "#"));
  for (const m of unmatured.matchAll(new RegExp(String.raw`(?<!\d,\s?)(?<!${MONTH}\s)\b(?:fiscal (?:year )?|FY\s?)?(20\d{2})\b`, "gi"))) {
    const year = Number(m[1]);
    if (comparisonBase(unmatured, m.index)) continue;
    if (block !== null && (year < block.fiscalYear || year > block.fiscalYear + 1)) continue;
    return fiscalPeriod(year, null);
  }
  return null;
}

/** "notes due 2030", "a facility maturing in 2029": a maturity's year. */
const MATURITY_YEAR = /\b(?:due|matur(?:es|ing|ity)|expir(?:es|ing|y))\s+(?:in\s+)?(?:fiscal\s+)?20\d{2}\b/gi;

/** B-25: "full-year revenue guidance" with no year is the outlook block's fiscal year. */
function unyearedFullYear(text: string, block: FiscalPeriod | null): FiscalPeriod | null {
  return block !== null && /\bfull[ -](?:fiscal[ -])?year\b/i.test(text) ? fiscalPeriod(block.fiscalYear, null) : null;
}

// ---------------------------------------------------------------------------
// Earnings release: guidance
// ---------------------------------------------------------------------------

export type GuidanceMetric =
  | "revenue"
  | "adjusted-ebitda"
  | "adjusted-ebitda-margin-expansion"
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
  unit: "currency" | "currency-per-share" | "%" | "percentage-points";
  symbol: string | null;
  low: number;
  mid: number;
  high: number;
  /** How the issuer stated it: a point, an explicit range, a point ± tolerance, or "approximately". */
  form: "point" | "range" | "plus-minus" | "approximate";
  /** The issuer's sentence, bounded. */
  sentence: string;
  previous?: { low: number; mid: number; high: number };
  growth?: { low: number; high: number };
  previousGrowth?: { low: number; high: number };
  span?: { start: number; end: number; text: string };
  headerSpan?: { start: number; end: number; text: string };
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
  const period = fullYearPhrase(sentence) ?? quarterPhrase(sentence) ?? namedYearPhrase(sentence, defaultPeriod) ?? unyearedFullYear(sentence, defaultPeriod) ?? defaultPeriod;
  if (period === null) return [];
  const verb = /\b(?:(?:is|are) expected to (?:be|range|total)|expects?\b[^.]{0,120}?\bto (?:be|range|total)|to be|of)\b/i.exec(sentence);
  if (!verb) return [];
  let clause = sentence.slice(verb.index + verb[0].length);
  clause = clause.split(/\b(?:inclusive of|including|excluding|exclusive of|which includes|reflecting)\b/i)[0]!;
  // B-25: the amount a guide is compared with ("an increase from our prior
  // outlook of 13-16%", "versus $3.00 in 2025") is not the guide.
  clause = clause.split(/\b(?:compared (?:with|to)|versus|relative to|an? (?:increase|decrease|rise|decline|change) from|up from|down from|from (?:our|the|its) (?:prior|previous))\b|\bvs\.(?=\s|$)/i)[0]!;

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
  // A span of years ("from 2027 to 2028", "between now and 2028") is not a
  // range of values: the test reads the clause with its years blanked out.
  // A range of the other kind ("up 2-3%" beside a money guide, "$1.0-1.2
  // billion" beside a rate) is not this guide's range either.
  const otherKind = rule.unit === "%"
    ? /[$€£]\s?\d[\d,.]*\s*(?:billion|million|thousand)?\s*(?:to|-|–|—)\s*[$€£]?\s?\d[\d,.]*/g
    : /\bbetween\s+\d[\d,.]*\s*%?\s*and\s+\d[\d,.]*\s*%|\d[\d,.]*\s*%?\s*(?:to|-|–|—)\s*\d[\d,.]*\s*%/gi;
  const yearless = valueClause.replace(otherKind, " ")
    .replace(/(?<![\d,.$])(?:19|20)\d{2}(?![\d,.]\d|\s*(?:%|billion|million|thousand))/g, "Y");
  const isRange =/\b(?:between|range of|in the range)\b[^.;]{0,24}?[$€£\d]|\d\s*(?:%|billion|million)?\s*(?:to|-|–|—)\s*\$?\d/i.test(yearless);
  // B-25: one end of a stated range is never published as a point.
  if (isRange && values.length < 2) return [];

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

/** Issuer-quantified ex-item growth effect; disclosure only, not an adjustment. */
export function parseIssuerGrowthEffect(sentence: string): { pp: number } | null {
  const match = /\bexcluding\b[^.]*\byear-over-year growth would be (?:nearly |approximately |about |roughly )?(\d+(?:\.\d+)?) basis points (higher|lower)\b/i.exec(sentence);
  if (!match) return null;
  const pp = Number(match[1]) / 100 * (match[2].toLowerCase() === "lower" ? -1 : 1);
  return Number.isFinite(pp) ? { pp } : null;
}

/** Guidance from a release or commentary; null when it prints no outlook. */
export function parseGuidance(rawText: string, document?: ParsedDocument): IssuerGuidance | null {
  const table = parseGuidanceTables(rawText, document);
  if (table !== null) return table;
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

/** An outlook heading right after a period phrase: "Third Quarter 2026 Guidance", "... Financial Outlook". */
const OUTLOOK_HEADING_AFTER = /^\s*(?:(?:Business|Financial)\s+)?(?:Guidance|Outlook)\b/i;
/**
 * An outlook heading right before a period phrase: "Outlook for Second Quarter
 * 2026", "Business Outlook for the first quarter of 2027" (Codex review of PR #41).
 */
const OUTLOOK_HEADING_BEFORE = /\b(?:(?:Business|Financial)\s+)?(?:Guidance|Outlook)(?:\s+(?:for|of))?(?:\s+the)?\s*$/i;

export function parseReportedPeriod(rawText: string): ReportedPeriod {
  const text = normalizeFilingText(rawText).slice(0, 6_000);
  // A year-ago comparison can come first ("the third quarter ended September
  // 30, 2025 and ... ended September 30, 2026"): the latest end is the release's own.
  const ended = [...text.matchAll(/\b(?:(first|second|third|fourth) )?quarter (?:of fiscal (?:year )?\d{4} )?ended ((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2},? \d{4})/gi)]
    .filter((m) => isoFromMonthDate(m[2]!) !== null).sort((a, b) => isoFromMonthDate(b[2]!)!.localeCompare(isoFromMonthDate(a[2]!)!))[0] ?? null;
  // "second-quarter 2026" is the same title as "Second Quarter 2026" (Lilly, Southern Co.).
  const titles = [...text.matchAll(/\b(First|Second|Third|Fourth)[ -]Quarter(?:\s+and)?(?:\s+Full[ -]Year)?(?:\s+of)?(?:\s+Fiscal)?(?:\s+Year)?\s+(\d{4})\b/gi)]
    .map((m) => ({ quarter: ORDINAL_QUARTER[m[1]!.toLowerCase()]!, year: Number(m[2]), base: comparisonBase(text, m.index),
      guided: OUTLOOK_HEADING_AFTER.test(text.slice(m.index + m[0].length, m.index + m[0].length + 40))
        || OUTLOOK_HEADING_BEFORE.test(text.slice(Math.max(0, m.index - 40), m.index)) }));
  // AMZN audit 2026-10-20: the first title phrase was taken, and Amazon's
  // first is the year-ago base ("compared with $167.7 billion in second
  // quarter 2025"), its next the guided quarter's heading. When the "quarter
  // ended" sentence names its quarter, only a phrase for that quarter counts:
  // one the release reports, else a year-ago base read one year on. A phrase
  // heading an outlook ("Third Quarter 2026 Guidance", "Outlook for Second
  // Quarter 2026") names the guided quarter, never the reported one.
  const reportedQuarter = ended?.[1] ? ORDINAL_QUARTER[ended[1].toLowerCase()]! : null;
  const own = titles.find((t) => !t.base && !t.guided && (reportedQuarter === null || t.quarter === reportedQuarter));
  const yearAgo = reportedQuarter === null ? undefined : titles.find((t) => t.base && t.quarter === reportedQuarter);
  const fiscal = own !== undefined ? fiscalPeriod(own.year, own.quarter)
    : yearAgo !== undefined ? fiscalPeriod(yearAgo.year + 1, yearAgo.quarter)
    : ended === null ? compactTitlePeriod(text.slice(0, COMPACT_TITLE_CHARS))
    : null;
  return { fiscal, periodEnd: ended ? isoFromMonthDate(ended[2]!) : null };
}

/** How far into a release its title can sit, past the exhibit's own header words. */
const COMPACT_TITLE_CHARS = 300;

/**
 * Audit 2026-10-22 B-24: a release titled only in compact form ("3Q26
 * Financial Highlights", "Q3 2026 Update") names its quarter there, and with
 * no reported ordinal title and no "quarter ended" sentence that is the only
 * period it states; an ordinal phrase heading guidance ("Third Quarter 2026
 * Guidance") or naming a year-ago base does not stand in for it. A compact label heading an outlook names the guided quarter and
 * is skipped, as is one after a comparison word.
 */
function compactTitlePeriod(head: string): FiscalPeriod | null {
  for (const m of head.matchAll(/\b(?:([1-4])Q(\d{4}|\d{2})|Q([1-4])\s?(?:FY\s?)?(\d{4}|\d{2}))\b/g)) {
    const before = head.slice(Math.max(0, m.index - 40), m.index);
    if (OUTLOOK_HEADING_AFTER.test(head.slice(m.index + m[0].length, m.index + m[0].length + 40)) || OUTLOOK_HEADING_BEFORE.test(before) ||
      /\b(?:from|vs\.?|versus|compared (?:to|with)|since)\s*$/i.test(before)) continue;
    const year = Number(m[2] ?? m[4]);
    return fiscalPeriod(year < 100 ? 2000 + year : year, Number(m[1] ?? m[3]) as 1 | 2 | 3 | 4);
  }
  return null;
}

/** The release's own headline figures, read only when each is stated once. */
export interface ReleaseHeadline {
  revenue: { value: number; symbol: string } | null;
  epsDiluted: { value: number; symbol: string } | null;
}

const HEADLINE_CHARS = 6_000;
const NON_GAAP_BEFORE = /\b(?:adjusted|non-GAAP|core|operating|underlying|managed|excluding[^.]{0,80})\s*$/i;
/** Another basis named anywhere earlier in the sentence ("Adjusted net income was ..., or $1.95 per diluted share"). */
const NON_GAAP_SENTENCE = /\b(?:adjusted|non-GAAP|core|underlying|managed|excluding|pro forma)\b/i;
/** A sentence boundary: terminal punctuation after a lower-case letter, digit or closing mark, or a bullet. */
const SENTENCE_START = /(?:^|(?<=[a-z0-9%)"”])[.!?]\s+|•\s*)/g;

/** What may open a sentence before the total-revenue label: the issuer and the quarter, never a segment. */
const REVENUE_SENTENCE_OPENING = /^(?:(?:the company's|our|in|for|the|Q[1-4]|FY\s?\d{2,4}|(?:first|second|third|fourth)[- ]quarter|quarter|fiscal|\d{4}),?\s+)*$/i;
/**
 * A sentence stating a loss (a loss per share printed without its sign) or a
 * period other than the quarter (a full-year or year-to-date amount under a
 * quarter's label) yields no headline figure.
 */
const LOSS_OR_OTHER_PERIOD = /\b(?:loss(?:es)?|full[- ]year|fiscal year|year[- ]to[- ]date|(?:six|nine|twelve) months|annual)\b/i;

/** The end of the sentence holding `index`: the next sentence boundary, or the end of the text. */
function sentenceEnd(text: string, index: number): number {
  const next = /(?<=[a-z0-9%)"”])[.!?](?:\s+|$)|•/g;
  next.lastIndex = index;
  const m = next.exec(text);
  return m === null ? text.length : m.index;
}

/** The text from the start of the sentence holding `index` up to it. */
function sentencePrefix(text: string, index: number): string {
  let start = 0;
  for (const m of text.slice(0, index).matchAll(SENTENCE_START)) start = m.index + m[0].length;
  return text.slice(start, index);
}

/**
 * Audit 2026-10-22 B-24: a results release's headline revenue and diluted
 * EPS, from its opening text. A figure is kept only when every matching
 * statement there gives the same amount, so a release that states another
 * basis's figure beside the reported one yields none. Revenue is read only
 * where it opens its sentence, optionally as total, net or consolidated
 * revenue, so a segment's revenue ("Cloud revenues of $15.2 billion") is never
 * taken for the total; it needs a stated scale (billion or million). A figure
 * whose sentence names an adjusted or other non-GAAP basis is not read.
 */
export function parseReleaseHeadline(rawText: string): ReleaseHeadline {
  const text = normalizeFilingText(rawText).slice(0, HEADLINE_CHARS);
  const single = (found: { value: number; symbol: string }[]): { value: number; symbol: string } | null =>
    found.length > 0 && found.every((f) => f.value === found[0]!.value && f.symbol === found[0]!.symbol) ? found[0]! : null;
  // The whole sentence is read: a basis, a loss or another period named after the figure counts too.
  const gaap = (m: RegExpMatchArray): boolean => {
    const sentence = sentencePrefix(text, m.index!) + text.slice(m.index!, sentenceEnd(text, m.index!));
    return !NON_GAAP_BEFORE.test(text.slice(Math.max(0, m.index! - 100), m.index)) && !NON_GAAP_SENTENCE.test(sentence) &&
      !LOSS_OR_OTHER_PERIOD.test(sentence) && !OUTLOOK_OR_DIVIDEND.test(sentence);
  };
  const revenue = [...text.matchAll(/\b(?:(?:total|net|consolidated|quarterly|(?:first|second|third|fourth)[- ]quarter) )?revenues?(?:, net of interest expense,)?(?: (?:was|were|of|totaled|reached)| (?:increased|decreased|grew|rose|fell|declined)(?:[^.$]|\.\d){0,60}? to)? ((?:US)?\$)\s?(\d+(?:\.\d+)?) (billion|million)\b/gi)]
    .filter((m) => gaap(m) && REVENUE_SENTENCE_OPENING.test(sentencePrefix(text, m.index!)))
    .map((m) => ({ value: Math.round(Number(m[2]) * (m[3]!.toLowerCase() === "billion" ? 1e9 : 1e6)), symbol: m[1]! }));
  const eps = [...text.matchAll(/\b(?:diluted (?:EPS|earnings per (?:common )?share)(?: \((?:EPS|diluted)\))?|earnings per diluted share|EPS \(diluted\))(?: (?:was|were|of|totaled))? ((?:US)?\$)\s?(\d+\.\d{2})\b|((?:US)?\$)\s?(\d+\.\d{2}) per diluted share\b/gi)]
    .filter(gaap)
    .map((m) => ({ value: Number(m[2] ?? m[4]), symbol: (m[1] ?? m[3])! }));
  return { revenue: single(revenue), epsDiluted: single(eps) };
}

/** How far past a results amount an outlook word ("is expected") still belongs to it. */
const OUTLOOK_AFTER_CHARS = 60;
/** Outlook wording ("is expected", "raising our EPS range", "reaffirm") and a dividend: an amount there is no result. */
const OUTLOOK_OR_DIVIDEND = /\b(?:expect(?:s|ed|ations?)?|outlook|guid(?:ance|es|ed)|forecast(?:s|ed)?|anticipat(?:es?|ed)|project(?:s|ed|ions?)?|target(?:s|ed)?|rais(?:es?|ed|ing)|ranges?|reaffirm(?:s|ed|ing)?|reiterat(?:es?|ed|ing)|dividends?)\b/i;

/**
 * Audit 2026-10-22 B-24: the release states results, not only operating
 * statistics (a deliveries or operational update can be filed under Item 2.02):
 * it states an amount for earnings, diluted earnings per share or operating
 * income. "Our net income ... will be announced" states none, nor does a
 * dividend per share or an amount in a sentence giving an outlook, before the
 * amount or in the words right after it ("EPS of $3.10 is expected"). The
 * words after it are bounded: a headline list printed without full stops
 * (Tesla: "$0.8B GAAP net income ... projects spanning ...") is no sentence.
 */
export function reportsResults(rawText: string): boolean {
  const text = normalizeFilingText(rawText).slice(0, 20_000);
  return [...text.matchAll(/\b(?:net (?:income|loss|earnings)|(?:reported |GAAP )?earnings|EPS|per diluted share|income from operations|operating (?:income|profit))\b[^.$]{0,60}(?:US)?\$\s?\(?\d|(?:US)?\$\s?\(?\d+\.\d{2}\)? per diluted share\b/gi)]
    .some((m) => !OUTLOOK_OR_DIVIDEND.test(sentencePrefix(text, m.index) +
      text.slice(m.index, Math.min(sentenceEnd(text, m.index), m.index + m[0].length + OUTLOOK_AFTER_CHARS))));
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

const COMPACT_FOUR_COLUMN_HEADER = String.raw`Three months ended (${MONTHS.join("|")})\s+(\d{1,2}),\s+(Six|Nine|Twelve) months ended \1\s+\2,\s+(20\d{2})\s+(20\d{2})\s+\4\s+\5\s+`;

function compactHeaderColumns(header: RegExpMatchArray): { ends: string[]; months: (3 | 6 | 9 | 12)[] } | null {
  if (Number(header[4]) - Number(header[5]) !== 1) return null;
  const current = isoFromMonthDate(`${header[1]} ${header[2]}, ${header[4]}`);
  const prior = isoFromMonthDate(`${header[1]} ${header[2]}, ${header[5]}`);
  if (!current || !prior) return null;
  return { ends: [current, prior, current, prior], months: [3, 3, MONTH_WORDS[header[3]!.toLowerCase()]!, MONTH_WORDS[header[3]!.toLowerCase()]!] };
}

/** Admit the compact FCF table only as a complete, arithmetically bound triplet. */
function compactFreeCashFlow(text: string): { columns: NonNullable<ReturnType<typeof compactHeaderColumns>>; cfo: number[]; capex: number[]; fcf: number[] } | null {
  const pattern = new RegExp(String.raw`\bFree Cash Flow\s+${COMPACT_FOUR_COLUMN_HEADER}\(In millions\)\s+Net cash provided by operating activities\s+${ROW_VALUES}Less:\s+Total capital expenditures\s+${ROW_VALUES}Free cash flow\s+${ROW_VALUES}`, "gi");
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  const columns = compactHeaderColumns(match);
  const cfo = rowNumbers(match[6]!), capex = rowNumbers(match[7]!), fcf = rowNumbers(match[8]!);
  if (!columns || [cfo, capex, fcf].some((cells) => cells.length !== 4 || cells.some((v) => !Number.isSafeInteger(v))) || !/\$/.test(match[6]!) || !/\$/.test(match[8]!)) return null;
  // This grammar admits whole millions as printed. Half a printed unit is the
  // maximum residual; integer cells must therefore reconcile exactly.
  if (capex.some((v) => v > 0) || fcf.some((v, i) => Math.abs(cfo[i]! + capex[i]! - v) > 0.5)) return null;
  return { columns, cfo, capex: capex.map(Math.abs), fcf };
}

export function parseIssuerFreeCashFlow(rawText: string): FreeCashFlowFact[] {
  const text = normalizeFilingText(rawText);
  const definition = /Free cash flow is (?:calculated|defined) as [^.]{10,300}\./i.exec(text)?.[0] ?? null;
  const compact = compactFreeCashFlow(text);
  if (compact) return compact.fcf.map((value, i) => ({ value: value * 1e6, symbol: "$", periodEnd: compact.columns.ends[i]!, months: compact.columns.months[i]!, definition }));
  const row = new RegExp(String.raw`\bFree cash flow\s+${ROW_VALUES}`).exec(text);
  if (!row) return [];
  const values = rowNumbers(row[1]!);
  const columns = tableColumns(text, row.index, values.length);
  if (columns === null || columns.scale === null) return [];
  const scale = columns.scale;
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
  | "total-capital-expenditures"
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

/** The compact four-column EPS table prints its date once per duration. */
function compactEpsColumns(text: string, rowIndex: number): { ends: string[]; months: (3 | 6 | 9 | 12)[] } | null {
  const before = text.slice(Math.max(0, rowIndex - 12_000), rowIndex);
  const headerPattern = new RegExp(String.raw`${COMPACT_FOUR_COLUMN_HEADER}\(In millions,? except share and per share data\)`, "gi");
  const header = [...before.matchAll(headerPattern)].at(-1);
  if (!header) return null;
  const title = before.slice(Math.max(0, header.index - 120), header.index);
  if (!/Adjusted Net Income(?:\s*\(Loss\))?\s*&\s*Adjusted EPS\s*$/i.test(title)) return null;
  if (/\b(?:months|year)\s+ended\b/i.test(before.slice(header.index + header[0].length))) return null;
  return compactHeaderColumns(header);
}

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
  const fcf = compactFreeCashFlow(text);
  if (fcf) {
    for (const [metric, values] of [["operating-cash-flow", fcf.cfo], ["total-capital-expenditures", fcf.capex]] as const) {
      values.forEach((value, i) => push({ metric, value: value * 1e6, unit: "currency", symbol: "$", periodEnd: fcf.columns.ends[i]!, months: fcf.columns.months[i]! }));
    }
  }
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
  // A compact issuer-adjusted EPS reconciliation is a different taxonomy
  // from the financial-summary or weighted-average-share tables. Admit a
  // matched pair only under that explicit heading and one four-column header.
  const compact = new RegExp(String.raw`GAAP diluted earnings per share\s+${ROW_VALUES}([\s\S]{0,4000}?)Adjusted earnings per share\s*(?:\(\d{1,2}\))?\s+${ROW_VALUES}`, "g");
  for (const pair of text.matchAll(compact)) {
    const gaap = rowNumbers(pair[1]!), adjusted = rowNumbers(pair[3]!);
    if (gaap.length !== 4 || adjusted.length !== 4 || /\b(?:months|year)\s+ended\b/i.test(pair[2]!) || !/\$/.test(pair[1]!) || !/\$/.test(pair[3]!)) continue;
    const columns = compactEpsColumns(text, pair.index);
    if (columns === null) continue;
    for (const [metric, values] of [["gaap-diluted-eps", gaap], ["non-gaap-diluted-eps", adjusted]] as const) {
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

/** Source-table evidence only: fiscal labels never establish exact maturity dates. */
export interface CommitmentPaymentTiming {
  coverage: "complete" | "incomplete" | "unavailable";
  sourceHeader: string;
  sourceText: string;
  scale: number | null;
  currencySymbol: string | null;
  rows: Array<{
    label: string;
    /** The source Total row is a check, never another obligation. */
    tableTotal: boolean;
    total: number | null;
    totalRaw: string | null;
    buckets: Array<{ label: string; amount: number | null; raw: string }>;
    reconciliation: {
      status: "reconciled-as-printed" | "mismatch" | "unknown";
      bucketSum: number | null;
      /** Sum of printed buckets less printed total; never used to repair a cell. */
      residual: number | null;
    };
  }>;
  reason: string | null;
}

export interface CommitmentTable {
  /** "Future commitments" or "Guarantees (maximum gross exposure)". */
  kind: "commitments" | "guarantees";
  /** The date the table is stated as of, when printed. */
  asOf: string | null;
  rows: CommitmentRow[];
  /** The table's own Total row, when printed. */
  total: number | null;
  /** Optional on retained legacy records. No schedule is inferred from a total. */
  paymentTiming?: CommitmentPaymentTiming;
}

const COMMITMENT_NUMBER = /^(?:-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\))$/;
// An unsupported cell spelling must not become category prose and move the
// remaining numeric run into the payment columns. Word-led identifiers such
// as Tier-1 or Scope3 remain labels; number-led ambiguity and detached signs
// cannot be used to pad the category before a numeric run.
const COMMITMENT_NUMERIC_LIKE_LABEL = /^(?:[+\u2212]$|\(?[+\-\u2212\u2013\u2014]?(?:\d|\.\d))/;
// This is lexical ambiguity, not a guessed currency dictionary: even an unknown
// three-letter unit or a legitimate uppercase category abbreviation can withhold
// plaintext timing. A source label is not declared false by this refusal.
const COMMITMENT_ATTACHED_UNIT_LABEL = /^[A-Za-z]{3}(?:[+\-\u2212\u2013\u2014]?(?:\d|\.\d)|[+\-\u2212\u2013\u2014]$)/;
const COMMITMENT_DASH = /^[-–—]$/;
const COMMITMENT_SYMBOL = /^(?:US\$|\$|€|£|¥|USD|EUR|GBP|JPY)$/;

function commitmentAmount(raw: string, scale: number): number | null {
  if (!COMMITMENT_NUMBER.test(raw)) return null;
  const value = rowNumbers(raw)[0]! * scale;
  return Number.isFinite(value) ? value : null;
}

/** Exact decimal-token arithmetic, independent of binary floating-point summation. */
function commitmentReconciliation(raw: readonly string[], totalRaw: string, scale: number): CommitmentPaymentTiming["rows"][number]["reconciliation"] {
  const unknown = { status: "unknown" as const, bucketSum: null, residual: null };
  if ([...raw, totalRaw].some(cell => commitmentAmount(cell, scale) === null)) return unknown;
  const parts = [...raw, totalRaw].map(cell => {
    const cleaned = cell.replace(/[(),-]/g, "");
    const [whole, fraction = ""] = cleaned.split(".");
    return { digits: BigInt(whole! + fraction) * (/^[(-]/.test(cell) ? -1n : 1n), decimals: fraction.length };
  });
  const decimals = Math.max(...parts.map(part => part.decimals));
  const ticks = parts.map(part => part.digits * 10n ** BigInt(decimals - part.decimals));
  const totalTicks = ticks.pop()!;
  const sum = ticks.reduce((value, next) => value + next, 0n);
  const bucketSum = Number(sum) / 10 ** decimals * scale;
  const residual = Number(sum - totalTicks) / 10 ** decimals * scale;
  return Number.isFinite(bucketSum) && Number.isFinite(residual)
    ? { status: sum === totalTicks ? "reconciled-as-printed" : "mismatch", bucketSum, residual }
    : unknown;
}

/** Recognize only an ordered list of nonoverlapping fiscal-year labels plus Total. */
function commitmentBucketLabels(header: string): string[] | null {
  const labels = [...header.trim().matchAll(/(?:Remainder of )?20\d{2}(?: and thereafter)?|Total/g)].map(match => match[0]);
  if (labels.length < 2 || labels.at(-1) !== "Total" || labels.filter(label => label === "Total").length !== 1 ||
    labels.join(" ") !== header.trim()) return null;
  const buckets = labels.slice(0, -1);
  const years = buckets.map(label => Number(/20\d{2}/.exec(label)![0]));
  if (buckets.some((label, index) => (label.startsWith("Remainder") && index !== 0) ||
    (label.endsWith("thereafter") && index !== buckets.length - 1) || (index > 0 && years[index]! <= years[index - 1]!))) return null;
  return buckets;
}

/** A strict row must contain the whole numeric run: never shift a missing/extra cell. */
function parseCommitmentTiming(sourceHeader: string, header: string, suppliedBody: string, scale: number): CommitmentPaymentTiming {
  const sourceWasBounded = sourceHeader.length + suppliedBody.length > 2000;
  // Retain at most one look-ahead character beyond the source evidence cap.
  const supplyingText = `${sourceHeader}${suppliedBody.slice(0, Math.max(0, 2001 - sourceHeader.length))}`;
  const sourceText = supplyingText.slice(0, 2000);
  const timing: CommitmentPaymentTiming = { coverage: "unavailable", sourceHeader: header.trim(), sourceText,
    scale, currencySymbol: null, rows: [], reason: null };
  const labels = commitmentBucketLabels(header);
  if (labels === null) return { ...timing, reason: "Fiscal bucket header is unsupported, repeated, or ambiguous; no column assignment is inferred." };
  // The retention boundary can bisect a number (e.g. 600000 becomes 6).
  // Preserve that raw prefix, but never tokenize its incomplete final token.
  const cutsToken = supplyingText.length > sourceText.length && /\S/.test(sourceText.at(-1) ?? "") && /\S/.test(supplyingText[sourceText.length]!);
  const parseEnd = cutsToken ? sourceText.lastIndexOf(" ") : sourceText.length;
  const body = sourceText.slice(sourceHeader.length, parseEnd);
  const tokens = [...body.matchAll(/\S+/g)];
  const symbols = new Set<string>();
  let index = 0;
  let malformed = false;
  let ended = false;
  let trailingContext = false;
  let structuralProblem: string | null = null;
  while (index < tokens.length && timing.rows.length < 12) {
    if (body.slice(tokens[index]!.index).startsWith(header.trim())) {
      structuralProblem = "A repeated column header makes the source table/category boundaries ambiguous.";
      timing.rows = [];
      break;
    }
    const words: string[] = [];
    while (index < tokens.length && !COMMITMENT_NUMBER.test(tokens[index]![0]) && !COMMITMENT_DASH.test(tokens[index]![0]) && !COMMITMENT_SYMBOL.test(tokens[index]![0])) words.push(tokens[index++]![0]);
    if (!ended && words.some(word => COMMITMENT_NUMERIC_LIKE_LABEL.test(word) || /\p{Sc}/u.test(word) || /^[A-Z]{3}$/.test(word) ||
      // Retain the standard-style identifier control without treating its
      // digits as a fiscal boundary or asserting that a named standard exists.
      (COMMITMENT_ATTACHED_UNIT_LABEL.test(word) && !/^ISO-\d{4}$/.test(word)))) {
      structuralProblem = "A numeric-like cell or unit/category token in the category span makes row/column assignment ambiguous; raw source evidence is retained.";
      timing.rows = [];
      break;
    }
    const cells: string[] = [];
    const rowSymbols = new Set<string>();
    while (index < tokens.length) {
      const token = tokens[index]![0];
      if (COMMITMENT_SYMBOL.test(token)) {
        rowSymbols.add(token);
        const next = tokens[index + 1]?.[0];
        if (next === undefined || (!COMMITMENT_NUMBER.test(next) && !COMMITMENT_DASH.test(next))) { malformed = true; break; }
        index++;
        continue;
      }
      if (!COMMITMENT_NUMBER.test(token) && !COMMITMENT_DASH.test(token)) break;
      cells.push(token); index++;
    }
    if (ended) {
      // Flattened text cannot prove whether a further numeric row belongs to
      // this table. Never choose the first Total over conflicting evidence.
      if (!malformed && words.length > 0 && words.length <= 14 && cells.length === labels.length + 1) {
        structuralProblem = "A row after the printed Total makes table/category boundaries or Total selection ambiguous.";
        timing.rows = [];
      } else trailingContext = true;
      break;
    }
    for (const symbol of rowSymbols) symbols.add(symbol);
    if (malformed || words.length === 0 || words.length > 14 || cells.length !== labels.length + 1 ||
      (sourceWasBounded && index === tokens.length)) { malformed = true; break; }
    const label = words.join(" ");
    if (/^Total$/i.test(label) && timing.rows.length === 0) {
      structuralProblem = "The printed Total precedes category rows; source table order and category coverage are unavailable.";
      break;
    }
    if (timing.rows.some(row => row.label === label)) {
      structuralProblem = "Duplicate or conflicting category rows prevent choosing one reported payment schedule.";
      timing.rows = [];
      break;
    }
    const totalRaw = cells.at(-1)!;
    const row = { label, tableTotal: /^Total$/i.test(label), total: commitmentAmount(totalRaw, scale), totalRaw,
      buckets: labels.map((bucket, i) => ({ label: bucket, amount: commitmentAmount(cells[i]!, scale), raw: cells[i]! })),
      reconciliation: commitmentReconciliation(cells.slice(0, -1), totalRaw, scale) };
    timing.rows.push(row);
    if (row.tableTotal) ended = true;
  }
  if (index < tokens.length && structuralProblem === null) {
    if (ended) trailingContext = true;
    else malformed = true;
  }
  timing.sourceText = timing.sourceText.trimEnd();
  timing.currencySymbol = symbols.size === 1 ? [...symbols][0]! : null;
  if (structuralProblem !== null) return { ...timing, reason: structuralProblem };
  if (symbols.size !== 1 || !["$", "US$"].includes(timing.currencySymbol!)) {
    // The legacy totals path assumes filing dollars. Do not introduce a new
    // numeric foreign/mixed-currency total into that path through this reader.
    if (symbols.size > 0) timing.rows = [];
    timing.reason = "A single supported printed currency symbol is not established; raw table evidence is retained.";
    return timing;
  }
  if (timing.rows.length === 0) {
    timing.reason = "Table row cells are missing, extra, or truncated; their column assignments and totals are unavailable.";
    return timing;
  }
  const unknown = timing.rows.some(row => row.reconciliation.status === "unknown");
  const mismatch = timing.rows.some(row => row.reconciliation.status === "mismatch");
  const totalRow = timing.rows.find(row => row.tableTotal);
  const categoryTotals = timing.rows.filter(row => !row.tableTotal).map(row => row.totalRaw!);
  const categoryMismatch = totalRow !== undefined && categoryTotals.length > 0 &&
    commitmentReconciliation(categoryTotals, totalRow.totalRaw!, scale).status === "mismatch";
  const categories = timing.rows.filter(row => !row.tableTotal);
  const categoryColumnMismatch = totalRow !== undefined && categories.length > 0 && totalRow.buckets.some((bucket, i) =>
    commitmentReconciliation(categories.map(row => row.buckets[i]!.raw), bucket.raw, scale).status === "mismatch");
  timing.coverage = !sourceWasBounded && !trailingContext && !malformed && ended && !unknown && !mismatch && !categoryMismatch && !categoryColumnMismatch ? "complete" : "incomplete";
  timing.reason = timing.coverage === "complete" ? null : sourceWasBounded || malformed || !ended
    ? "Table row/category coverage is incomplete or bounded/truncated; no missing payment cell or total is filled."
    : trailingContext ? "Post-table context or qualifications are retained without assigning their conditions to payment buckets; timing coverage remains incomplete."
    : unknown ? "An unexplained dash or nonnumeric cell leaves payment timing and reconciliation incomplete."
      : categoryMismatch || categoryColumnMismatch ? "Printed category row totals or columns do not reconcile to the table Total; category coverage remains incomplete."
      : "Printed payment buckets do not reconcile to their reported total; amounts and residual are retained without repair.";
  return timing;
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
  const commitmentHeader = /Future commitments by fiscal year as of ((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}),? were as follows:\s*([\s\S]{0,200}?)\(In (billions|millions)\)/g;
  // Flattening erases heading layout. A bare section-like word can instead be
  // a contractual qualification, so only a demonstrated next table ends this
  // region. An immediately adjacent heading can accompany its full caption.
  const nextTable = new RegExp(`(?:Additional Commitments\\s+)?${commitmentHeader.source}|(?:Guarantees\\s+)?The following table summarizes (?:the )?maximum gross exposure related to our guarantees[^:]{0,160}\\(in (?:billions|millions)\\):?`, "i");
  for (const m of text.matchAll(commitmentHeader)) {
    const header = m[2]!;
    const scale = m[3] === "billions" ? 1e9 : 1e6;
    const after = text.slice(m.index + m[0].length);
    const boundary = nextTable.exec(after);
    const body = boundary === null ? after : after.slice(0, boundary.index);
    const paymentTiming = parseCommitmentTiming(m[0], header, body, scale);
    const asOf = isoFromMonthDate(m[1]!);
    if (asOf === null) {
      paymentTiming.coverage = "unavailable";
      paymentTiming.reason = "The printed table snapshot date is invalid; raw amounts and source evidence remain unbound to a usable date.";
    }
    const totalRow = paymentTiming.rows.find(row => row.tableTotal);
    const items = paymentTiming.rows.filter(row => !row.tableTotal && row.total !== null).map(row => ({ label: row.label, total: row.total! }));
    out.push({ kind: "commitments", asOf, rows: items, total: totalRow?.total ?? null, paymentTiming });
  }
  const guarantees = /maximum gross exposure related to our guarantees[^:]{0,160}\(in (billions|millions)\):?\s*/i.exec(text);
  if (guarantees) {
    const scale = guarantees[1]!.toLowerCase() === "billions" ? 1e9 : 1e6;
    const rows = tableRows(text.slice(guarantees.index + guarantees[0].length, guarantees.index + guarantees[0].length + 600), 1, 8);
    const totalRow = rows.find((r) => /^Total$/i.test(r.label)) ?? null;
    const items = rows.filter((r) => r !== totalRow).map((r) => ({ label: r.label, total: r.cells[0]! * scale }));
    // This table can explicitly include guarantees signed after the quarter
    // end. Only its own heading can establish an exact date; an earlier
    // commitments table's date is not the guarantee table's date.
    const asOf = isoFromMonthDate(/as of ((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4})/.exec(guarantees[0])?.[1] ?? "");
    if (items.length > 0) out.push({ kind: "guarantees", asOf, rows: items, total: totalRow === null ? null : totalRow.cells[0]! * scale });
  }
  return out;
}

export interface CapitalReturnFacts {
  /** "$26.0 billion" returned via repurchases + dividends, with the period phrase it was stated for. */
  returned: { value: number; symbol: string; periodText: string | null; approximate?: boolean } | null;
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
      const approximate = /\b(?:approximately|about|around|roughly|nearly)\b/i.test(returned[0].slice(0, returned[0].indexOf(returned[1]!)));
      if (money) { out.returned = { value: money.value, symbol: money.symbol, periodText: during ? during[1]! : null, ...(approximate ? { approximate: true } : {}) }; used = true; }
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
export const MATERIAL_EVENT_ITEMS: Readonly<Record<string, string>> = Object.freeze({
  "1.01": "Entry into a Material Definitive Agreement",
  "1.02": "Termination of a Material Definitive Agreement",
  "2.01": "Completion of Acquisition or Disposition of Assets",
  "2.03": "Creation of a Direct Financial Obligation or an Obligation under an Off-Balance Sheet Arrangement of a Registrant",
  "2.05": "Costs Associated with Exit or Disposal Activities",
  "2.06": "Material Impairments",
  "3.02": "Unregistered Sales of Equity Securities",
  "5.02": "Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers; Compensatory Arrangements of Certain Officers",
  // D-63 (NVDA audit P1-J): the annual meeting's votes — director elections
  // and say-on-pay — are governance evidence the leadership section needs.
  "5.07": "Submission of Matters to a Vote of Security Holders",
  "8.01": "Other Events",
});

/** One immutable admission filter for candidate reads, retained sections and saved scope. */
export const MATERIAL_EVENT_ITEM_CODES: readonly string[] = Object.freeze(Object.keys(MATERIAL_EVENT_ITEMS));

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
  return itemsOf(items).some((item) => MATERIAL_EVENT_ITEM_CODES.includes(item));
}

/**
 * Split an 8-K primary document into its item sections. A heading is
 * "Item N.NN" followed by bounded title words. References to a titled item
 * inside prose are not headings; 3.02 accepts both Sale and Sales.
 */
export function splitEightKItems(rawText: string): EightKItemSection[] {
  const text = normalizeFilingText(rawText);
  const heads: { item: string; start: number; bodyStart: number }[] = [];
  for (const m of text.matchAll(/\bItem\s+(\d\.\d{2})\s*[.:–—-]?\s*/gi)) {
    const item = m[1]!;
    const officialTitle = ITEM_TITLES[item];
    if (!officialTitle) continue;
    const before = text.slice(Math.max(0, m.index - 120), m.index);
    if (/["“‘]\s*$/.test(before)) continue;
    if (/(?:\b(?:see|under|in|into|to|of|entitled|titled|references?|refer(?:s|red)?\s+to)|\b(?:in|into)\s+this)\s*["'“”‘’(]*\s*$/i.test(before)) continue;
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 200);
    const variants = item === "3.02" ? [officialTitle, "Unregistered Sale of Equity Securities"] : [officialTitle];
    const title = variants.find(t => {
      const words = item === "3.02" ? t.split(/\s+/) : t.split(/\s+/).slice(0, 2);
      return new RegExp(`^${words.join("\\s+")}\\b`, "i").test(after);
    });
    if (!title) continue;
    // Skip the official title as printed, up to its end or the first sentence start.
    let bodyStart = m.index + m[0].length;
    const printed = text.slice(bodyStart, bodyStart + title.length + 40);
    const titleEnd = matchTitleEnd(printed, title);
    const following = text.slice(bodyStart + titleEnd, bodyStart + titleEnd + 160);
    // A finite predicate attached directly to the title continues the item
    // reference's noun phrase ("required by Item ... are set forth ...").
    // Sentence/heading punctuation is deliberately not skipped: after a
    // completed heading, "Below", "Above" or "In this report" starts its body.
    if (/^[\s"'“”‘’)\],]*(?:is|are|was|were|has|have|had|will|would|shall|should|can|could|may|might|must)\s+\S/i.test(following)) continue;
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
    const re = new RegExp(`^[\\s.;,:–—-]*${parts.join("[^A-Za-z0-9]{0,2}")}(?=$|[^A-Za-z0-9])`, "i");
    const m = re.exec(printed.slice(at));
    if (!m) break;
    at += m[0].length;
  }
  // Preserve a terminating period for the heading/reference distinction.
  // The section-body cleanup removes it after admission, as for other separators.
  return at;
}

/** The event's "Date of Report (Date of earliest event reported)". */
export function eventDateOf(rawText: string): string | null {
  const m = /Date of Report \(Date of earliest event reported\)\s*:?\s*([A-Z][a-z]+ \d{1,2},? \d{4})/i.exec(normalizeFilingText(rawText).slice(0, 4_000));
  return m ? isoFromMonthDate(m[1]!) : null;
}

/**
 * Source sentences qualifying credit support: contractual reimbursement or
 * indemnity, and discretionary additional capacity. Preserve every qualifier.
 */
export function materialCreditSupportClauses(text: string): string[] {
  return splitSentences(normalizeFilingText(text)).filter((sentence) =>
    (/\b(?:reimburse|indemnif(?:y|ication))\b/i.test(sentence) && /\b(?:amounts? actually paid|payments?|obligations?|guarant(?:y|ies|ee|ees))\b/i.test(sentence)) ||
    (/\badditional\s+(?:approximately\s+)?\d+(?:\.\d+)?\s+(?:gigawatts?|megawatts?|GW|MW)\b/i.test(sentence) && /\b(?:credit support|sole discretion|option)\b/i.test(sentence)));
}

/** A bounded item summary: dated lead sentences and the first amount. */
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
  const suffix = total === null ? "" : ` [computed from ${total.count} distinct named issuance tranches: ${total.text} principal sum]`;
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
 * Admit only one completed issuance's explicit list of distinct coupon/maturity
 * tranches. Principal mentions alone do not establish additive amounts: an
 * option can already be included, or a paragraph can repeat the same notes.
 * Ambiguous contexts retain issuer wording without a computed total.
 */
function aggregatePrincipal(text: string): { count: number; text: string } | null {
  const normalized = normalizeFilingText(text);
  const principal = /((?:US)?\$)\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(thousand|million|billion|trillion))?\s+(?:in\s+)?aggregate principal amount/gi;
  const amounts = [...normalized.matchAll(principal)];
  if (amounts.length < 2 || new Set(amounts.map((m) => m[1]!.toUpperCase())).size !== 1) return null;
  if ([...normalized.matchAll(/\baggregate principal amounts?\b/gi)].length !== amounts.length) return null;
  const sentence = splitSentences(normalized).find((s) => [...s.matchAll(principal)].length === amounts.length);
  if (sentence === undefined) return null;
  if (/\b(?:including|includes?|of which|up to|options?|additional|proposed|planned|expects?|intends?|could|may)\b/i.test(sentence)) return null;
  const entries = [...sentence.matchAll(principal)];
  const prefix = sentence.slice(0, entries[0]!.index).trim();
  // A completed-offering suffix inside a counterfactual, expectation or plan
  // does not establish that the named tranches were actually issued.
  if (/\b[a-z]+n['’]t\b/i.test(prefix) ||
    /\b(?:not|never|cancelled|canceled|withdrawn|withdrew|abandoned|terminated|if|assuming|assumed|assumes?|contingent|would|should|will|might|must|cannot|ought|expected|expecting|intended|intending|anticipated|anticipating|scheduled|hypothetical|counterfactual|plans?|planning)\b/i.test(prefix)) return null;
  const affirmativeOffering = /\b(?:completed|closed)\s+(?:(?:its|the|an?|their)\s+)?(?:(?:previously announced|upsized|private|public|underwritten|registered)\s+)*(?:offering|issuance)\s+of$/i.test(prefix);
  const affirmativeIssuance = /\bissued(?:\s+and\s+sold)?$/i.test(prefix);
  if (!affirmativeOffering && !affirmativeIssuance) return null;
  const identities = new Set<string>();
  for (const [i, amount] of entries.entries()) {
    const tail = sentence.slice(amount.index! + amount[0].length, entries[i + 1]?.index ?? sentence.length);
    const named = /^\s+of\s+(?:its\s+)?(\d+(?:\.\d+)?)%\s+(?:(?:convertible|senior|unsecured|secured|subordinated)\s+)*notes\s+due\s+(\d{4})\b/i.exec(tail);
    if (named === null) return null;
    const identity = `${Number(named[1])}|${named[2]}`;
    if (identities.has(identity)) return null;
    identities.add(identity);
    const separator = tail.slice(named[0].length);
    const validSeparator = i + 1 < entries.length
      ? /^\s*(?:\(([^()]{1,256})\)\s*)?(?:,\s*(?:and\s+)?|and\s+)$/i
      : /^\s*(?:\(([^()]{1,256})\)\s*)?[.;]?\s*$/;
    const parsedSeparator = validSeparator.exec(separator);
    if (parsedSeparator === null) return null;
    const definition = parsedSeparator[1];
    // Only bounded defined-note labels, including NVIDIA's final collective
    // label. A parenthetical cannot conceal another amount or transaction role.
    if (definition !== undefined && (!/^the\b/i.test(definition) ||
      /[^\s,“”"'‘’]/.test(definition.replace(/\b(?:the|notes|and|together|with|\d{4})\b/gi, "")))) return null;
  }
  const sum = amounts.reduce((acc, m) => acc + Number(m[2]!.replace(/,/g, "")) * (m[3] ? SCALE[m[3].toLowerCase()]! : 1), 0);
  if (!Number.isFinite(sum) || sum <= 0) return null;
  const symbol = amounts[0]![1]!.toUpperCase();
  const fmt = (v: number): string => {
    const s = v.toFixed(3).replace(/0+$/, "");
    return s.endsWith(".") ? `${s}0` : s;
  };
  return { count: amounts.length, text: sum >= 1e9 ? `${symbol}${fmt(sum / 1e9)} billion` : `${symbol}${fmt(sum / 1e6)} million` };
}
