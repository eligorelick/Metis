/** Conservative numeric support for prose. A citation alone never proves a fact. */
import type { SourcedClaim } from "@/report/schema";
import type { TextExcerpt } from "@/pipeline/stageC/payload";
import { baseAgrees, comparisonBase, comparisonCueEnd, findDirectionWords, HEDGE_WORDS, isDeltaRecord, proseQuantityText, quantityDirection, statesNumberWord, type QuantityDirection } from "@/pipeline/stageC/consistency";
import { isIsoDate, periodsAgree, type CanonicalUnit, type NumericProvenanceRecord, type ProvenanceFailureReason } from "@/pipeline/stageC/provenance";
import { PeriodContextSchema } from "@/types/periodContext";

export interface ClaimSourceSpan { source: string; asOf: string | null; start: number; end: number; text: string }
export interface ClaimNumericSupport {
  status: "validated" | "cited" | "unchecked" | "contradicted";
  reason: ProvenanceFailureReason | "supported";
  note: string;
  spans: ClaimSourceSpan[];
}
interface Quantity {
  start: number; end: number; value: number; step: number;
  unit: CanonicalUnit | null; currency: string | null; dollar: boolean;
  /** D-66: a scale word was printed with the figure ("496 million"). */
  scaled: boolean;
  /** AI-409: the comparator printed directly before the figure ("less than", "over"), or null for a point figure. */
  bound: "upper" | "lower" | null;
  /** AI-409: a strict bound excludes its own value ("more than", "less than"); an inclusive one ("at least", "up to") keeps it. */
  strict: boolean;
}
const SCALES: Record<string, number> = { k: 1e3, thousand: 1e3, thousands: 1e3, m: 1e6, mm: 1e6, mn: 1e6, mln: 1e6, mil: 1e6, mio: 1e6, million: 1e6, millions: 1e6,
  b: 1e9, bn: 1e9, bln: 1e9, billion: 1e9, billions: 1e9, trillion: 1e12, trillions: 1e12 };
const CURRENCIES = "USD|EUR|GBP|JPY|CNY|RMB|HKD|KRW|INR|CHF|CAD|AUD|NZD|TWD|SEK|NOK|DKK|BRL|MXN|ZAR|SGD|ILS";
const DOLLARS = new Set(["USD", "CAD", "AUD", "NZD", "SGD", "HKD"]);

/**
 * D-66: a score's scale is its unit, not two more figures ("95 on the 0–100
 * scale", "95/100", "95 out of 100", "95 (0–100)"). NVDA final rerun: six
 * aspect-score claims read as three quantities each and stayed unchecked.
 */
const SCORE_SCALE = /\s*(?:\/\s*100\b|out of 100\b|on (?:the|a) 0\s*[–—-]\s*100(?:[\s-]+point)?\s+scale\b|\(\s*0\s*[–—-]\s*100\s*(?:scale\s*)?\))/iy;
/**
 * D-66: a window's name is not a figure: "the 12M ending 2027-07-26" (the
 * weighted-projection rows' own label) read "12M" as 12 million.
 */
const WINDOW_LABEL = /\b\d{1,2}M(?=\s+(?:ending|ended)\b)/g;
/**
 * AI-304: "12 months", "1.5 months" and "6 months ended" name a period, not a quantity. The
 * scale token is a whole word now, so the "m" of "months" no longer hides them.
 */
const DURATION_MONTHS = /(?<![\d.,])\d+(?:[.,]\d+)*\s+months?\b/gi;
/**
 * AI-409: a comparator directly before the figure makes it a bound, not a point. One hedge from the
 * consistency reader's HEDGE_WORDS may sit between the comparator and the figure ("at least about").
 * The negations come first, because "no less than" would otherwise read as the upper "less than" and
 * "no more than" as the lower "more than". The text before the figure is cut to a fixed tail, so the
 * trailing whitespace tests stay linear.
 */
const BOUND_TAIL_CHARS = 48;
const boundEnd = (comparators: string) => new RegExp(String.raw`(?<![A-Za-z])(?:${comparators})(?![A-Za-z])(?:\s+(?:${HEDGE_WORDS.source}))?\s*$`, "i");
// Inclusive kinds first: "no less than" would otherwise read as the strict "less than", "no more than" as "more than".
const LOWER_INCLUSIVE = boundEnd(String.raw`(?:not|no)\s+(?:less|fewer)\s+than|at\s+least|a\s+minimum\s+of|≥`);
const UPPER_INCLUSIVE = boundEnd(String.raw`(?:no|not)\s+more\s+than|up\s+to|at\s+most|a\s+maximum\s+of|not\s+to\s+exceed|≤`);
const UPPER_STRICT = boundEnd(String.raw`(?:less|fewer)\s+than|under|below|<`);
const LOWER_STRICT = boundEnd(String.raw`more\s+than|greater\s+than|over|above|in\s+excess\s+of|exceed(?:s|ed|ing)?|>`);
function boundBefore(text: string, start: number): { bound: "upper" | "lower" | null; strict: boolean } {
  const tail = text.slice(Math.max(0, start - BOUND_TAIL_CHARS), start);
  return LOWER_INCLUSIVE.test(tail) ? { bound: "lower", strict: false } : UPPER_INCLUSIVE.test(tail) ? { bound: "upper", strict: false }
    : UPPER_STRICT.test(tail) ? { bound: "upper", strict: true } : LOWER_STRICT.test(tail) ? { bound: "lower", strict: true } : { bound: null, strict: false };
}
/** AI-409: a source bound supports a claim bound of its direction that is no stricter: strict implies strict or inclusive, inclusive implies only inclusive. */
function boundSupports(claim: Quantity, source: Quantity): boolean {
  return claim.bound === source.bound && (claim.strict === source.strict || (source.strict && !claim.strict));
}
/** D-66: "was negative USD 23.2 billion" states the sign in a word. */
const SIGN_WORD = /\b(?:negative|minus)\s+$/i;

function quantities(text: string): Quantity[] {
  const masked = proseQuantityText(text).replace(WINDOW_LABEL, (match) => " ".repeat(match.length))
    .replace(DURATION_MONTHS, (match) => " ".repeat(match.length));
  // TracedNumber excerpts declare their display scale before the metric,
  // e.g. "USD millions: Cash ... USD 56,586". That explicit declaration is
  // distinct from a claim that simply copies "$56,586" out of a scaled table.
  const declaredMoneyScale = new RegExp(String.raw`^\s*(?:${CURRENCIES}|currency)\s+(thousands?|millions?|billions?|trillions?):`, "i").exec(text)?.[1];
  const pattern = new RegExp(String.raw`(?:(?:(?<![A-Za-z0-9.])(?<lead>[-+−]))?(?<prefix>US\$|[$€£¥]|(?<![A-Za-z])(?:${CURRENCIES})(?![A-Za-z]))\s*)?(?:(?<sign>[-+−])\s*)?(?<digits>\d{1,3}(?:,\d{3})+|\d+)(?<fraction>\.\d+)?\s*(?:(?<scale>thousands?|millions?|billions?|trillions?|bn|bln|mm|mn|mln|mil|mio|k|m|b)(?![A-Za-z]))?\s*(?:(?<unit>%|(?:(?:percentage[\s-]points?|percent|bps?|basis[\s-]points?|pps?|dollars?|shares?|days?|people|users|subscribers|count|times|per share|score)(?![A-Za-z]|-[A-Za-z])|x(?![A-Za-z]))))?`, "gi");
  const scaled: { start: number; end: number }[] = [];
  return [...masked.matchAll(pattern)].flatMap((match) => {
    const groups = match.groups!;
    let start = match.index + match[0].search(/\S/);
    // A dash after a figure and one space ("$1.0 -$1.2 billion", "2024 -$5
    // million") joins two amounts; it is no sign. Read on the original text,
    // because the masked copy blanks a year or a date.
    const lead = groups.lead !== undefined && /\d\s$/.test(text.slice(Math.max(0, start - 2), start)) ? undefined : groups.lead;
    if (lead === undefined && groups.lead !== undefined) start += 1;
    let end = match.index + match[0].trimEnd().length;
    // The "100" (and the "0") of a score's own scale were read already.
    if (scaled.some((range) => start >= range.start && start < range.end)) return [];
    const before = masked.slice(Math.max(0, start - 1), start);
    const after = masked.slice(end, end + 1);
    if (/[A-Za-z0-9]/.test(before) || /[A-Za-z0-9]/.test(after)) return [];
    let scoreUnit = false;
    if (!groups.unit && !groups.prefix && !groups.scale) {
      SCORE_SCALE.lastIndex = end;
      const scale = SCORE_SCALE.exec(text);
      if (scale !== null) {
        scaled.push({ start: end, end: end + scale[0].length });
        end += scale[0].length;
        scoreUnit = true;
      }
    }
    const signWord = SIGN_WORD.exec(masked.slice(Math.max(0, start - 12), start));
    if (signWord !== null && !groups.sign && !lead) start -= signWord[0].length;
    const scale = SCALES[(groups.scale ?? (groups.prefix ? declaredMoneyScale : undefined) ?? "").toLowerCase()] ?? 1;
    const token = (groups.unit ?? "").toLowerCase();
    const prefix = (groups.prefix ?? "").trim();
    let unit: CanonicalUnit | null = /^(?:%|percent)$/.test(token) ? "percent"
      : /^(?:pp|pps|percentage[\s-]points?|bp|bps|basis[\s-]points?)$/.test(token) ? "percentage-points"
        : /^(?:x|times)$/.test(token) ? "ratio"
          : /^shares?$/.test(token) ? "shares"
            : /^days?$/.test(token) ? "days" : /^(?:people|users|subscribers|count)$/.test(token) ? "count" : null;
    if (unit === null && /\b(?:people|users|subscribers)\b/i.test(text.slice(Math.max(0, start - 90), start))) unit = "count";
    if (scoreUnit || token === "score") unit = "score";
    let currency: string | null = null;
    if (prefix || /^dollars?$/.test(token)) {
      const leadingPerShare = /\bper[\s-]+share\s+(?:(?:is|was|are|were|of|at|equals?)\s+)?$/i.test(text.slice(0, start));
      unit = token === "per share" || (token === "" && leadingPerShare) ? "currency-per-share" : "currency";
      currency = /^[A-Z]{3}$/i.test(prefix) ? prefix.toUpperCase()
        : prefix === "US$" ? "USD" : prefix === "€" ? "EUR" : prefix === "£" ? "GBP" : null;
    }
    const factor = /^(?:bp|bps|basis[\s-]points?)$/.test(token) ? 0.01 : 1;
    const decimals = (groups.fraction ?? "").length > 0 ? groups.fraction.length - 1 : 0;
    // Accounting parentheses enclose the complete amount (including currency
    // and unit); they are part of its sign, not disposable prose punctuation.
    const accountingNegative = /\(\s*$/.test(masked.slice(0, start)) && /^\s*\)/.test(masked.slice(end));
    return [{ start, end, value: (/^[-−]$/.test(lead ?? "") || /^[-−]$/.test(groups.sign ?? "") || accountingNegative || signWord !== null ? -1 : 1) *
      Number(groups.digits.replace(/,/g, "") + (groups.fraction ?? "")) * scale * factor,
    step: 10 ** -decimals * scale * factor, unit, currency, dollar: prefix === "$" || /^dollars?$/.test(token),
    scaled: groups.scale !== undefined || Boolean(groups.prefix && declaredMoneyScale !== undefined),
    ...boundBefore(masked, start) }];
  });
}

/** The prose quantity reader, exported for tests. */
export function readProseQuantities(text: string): readonly Quantity[] {
  return quantities(text);
}

/** `start` and `end` are offsets in the text the period was read from. */
interface PeriodReference { key: string; label: string; raw: string; kind: "date" | "month" | "period" | "window"; start: number; end: number }
/**
 * `periods` are the periods the clause states for its figure; `bases` (AI-402) are
 * the comparison bases it names ("compared with $10.2 billion in second quarter
 * 2025"), which belong to the amount the comparison word introduces, not to a figure before it.
 */
interface Context { start: number; end: number; text: string; label: string; own: string; ownAfter: string; periods: PeriodReference[]; bases: PeriodReference[]; ambiguous: boolean; direction: QuantityDirection | null; base: boolean }
interface SourceBinding {
  quantity: Quantity; context: Context; span: ClaimSourceSpan;
  /**
   * D-63: the periods the excerpt itself states (its reporting period, fiscal
   * quarter or event date, from the title), which a clause that names no
   * period of its own is read under. "Inventory was $31.6 billion" in the Q2
   * FY2027 CFO commentary is the quarter's inventory.
   */
  inherited: PeriodReference[];
  /** AI-303 / C-6: the windows the excerpt's title states; a clause naming no period is read under them. Empty for table cells. */
  inheritedWindows: ReadonlySet<string>;
  /**
   * AI-302-V1 / OD-3: the source clause is management's expectation, outlook or guidance. It inherits no period or window from the
   * excerpt's title and binds only a claim whose own clause is forward-looking (a result clause only a result claim). Always false for table cells.
   */
  forwardLooking: boolean;
  /** AI-303-V3: the excerpt's title carries an FY or Q4 label, so a figure dated to its reporting date (the excerpt's asOf) is a fiscal year-end figure. */
  yearEnd: boolean;
  /**
   * D-63: a source clause is ambiguous for this figure only when another
   * figure of its unit could be part of the same list (no metric words of its
   * own, or "respectively"); "…$31.6 billion, up from $25.8 billion" is a
   * comparison, not a list. Replaces `context.ambiguous` on the source side.
   */
  listAmbiguous: boolean;
  /** "$31.6 billion, up from $25.8 billion": the figure is the level reached, with no direction of its own. */
  levelBeforeComparison: boolean;
  /**
   * D-66: a table cell's header scale ("(In millions)") and the excerpt's
   * fiscal labels for its column. Absent for prose figures.
   */
  column?: { scale: number | null; aliases: string[]; date: string; exceptPerShare: boolean; label: string };
  /** An explicit total, or per-share, cash-dividend restatement in one clause. */
  unitPair?: { totalStart: number; perShareStart: number };
}
/** Run-local memo; never retained across reports, payloads or source revisions. */
export type ClaimEvidenceIndex = Map<TextExcerpt, SourceBinding[]>;
const MONTHS: Readonly<Record<string, number>> = { january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12 };
const MONTH_NAMES = "January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sept|Sep|October|Oct|November|Nov|December|Dec";
/**
 * D-66: "year over year" and "quarter over quarter" name a growth's comparison
 * basis, not a window: "over year" used to read as an annual window, so a
 * quarter's year-over-year growth contradicted its own quarterly record.
 * {@link metricTokens} keeps them as the metric words "yoy" and "qoq".
 */
const COMPARISON_BASIS = /\b(?:year|quarter)[\s‐‑–—-]+over[\s‐‑–—-]+(?:year|quarter)\b/gi;
/**
 * Audit 2026-10-27 AI-303: a window is also written without for/during/over
 * ("this quarter's revenue", "the latest fiscal year", "fiscal-year revenue").
 * Read only for a claim ({ loose: true }); a source or record label keeps the
 * explicit forms.
 */
const LOOSE_WINDOW = /\b(?:(?:fiscal|financial|calendar)[\s‐‑–—-]+)?(year|quarter)(?:['’]s)?\b/gi;
// Horizons, frequencies, fractions and the end of a period are not windows ("five-year", "per year",
// "each fiscal year's", "a quarter of", "end of the quarter").
const NOT_A_WINDOW_BEFORE = /\b(?:a|an|one|per|each|every|half|multi|several|\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty)[\s‐‑–—-]+$|\bend\s+of\s+(?:the\s+|its\s+|our\s+|each\s+)?(?:(?:latest|most\s+recent|last|current|prior|previous)\s+)?$/i;
// A comparison or instant follows ("a year ago", "year-end", "quarter end", "year one", "prior-year quarter").
const NOT_A_WINDOW_AFTER = /^[\s‐‑–—-]*(?:ago|earlier|later|before|end|ends|one|two|three|[1-3])\b|^[\s‐‑–—-]+(?:quarter|period)\b/i;
const NAMED_PERIOD_AFTER = /^[\s‐‑–—-]*(?:(?:19|20)\d{2}|FY\s*\d{4}|Q[1-4])\b/i;
// "year ended" does not match (`end` needs a word end); "quarter end" stays a descriptor.
const FISCAL_YEAR_END = /\b(?:(?:fiscal|financial)[\s‐‑–—-]+)?year[\s‐‑–—-]*end\b|\bend\s+of\s+(?:the\s+|its\s+|our\s+)?(?:(?:latest|most\s+recent|last|current|prior|previous)\s+)?(?:fiscal\s+)?year\b/gi;
function periodLabels(text: string, options: { loose?: boolean; yearEnd?: boolean } = {}): PeriodReference[] {
  let rest = text.replace(COMPARISON_BASIS, (match) => " ".repeat(match.length));
  const out: PeriodReference[] = [];
  const take = (pattern: RegExp, read: (match: RegExpMatchArray) => Omit<PeriodReference, "raw" | "start" | "end">): void => {
    rest = rest.replace(pattern, (...args: unknown[]) => {
      const match = args as unknown as RegExpMatchArray;
      // The match offset is the first numeric argument after the match (capture groups are strings or undefined).
      const start = args.find((arg, i): arg is number => i > 0 && typeof arg === "number")!;
      out.push({ raw: match[0], start, end: start + match[0].length, ...read(match) });
      return " ".repeat(match[0].length);
    });
  };
  const dated = (year: string, month: number, day: string): Omit<PeriodReference, "raw" | "start" | "end"> => {
    const iso = `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
    return { kind: "date", label: iso, key: isIsoDate(iso) ? iso : `unestablished-date:${iso}` };
  };
  // AI-303-V3: the fiscal year-end is an instant, read before the window words so
  // "the end of the fiscal year" is not an annual window. A claim's reading only.
  // A source clause that states the year-end itself names it too ({ yearEnd: true }).
  if (options.loose || options.yearEnd) take(FISCAL_YEAR_END, () => ({ kind: "window", key: "FYE", label: "fiscal year-end" }));
  take(/\b(?:year[\s‐‑–—-]+to[\s‐‑–—-]+date|ytd)\b/gi, () => ({ kind: "window", key: "YTD", label: "YTD" }));
  take(/\b(?:quarter[\s‐‑–—-]+to[\s‐‑–—-]+date|qtd)\b/gi, () => ({ kind: "window", key: "QTD", label: "QTD" }));
  take(/\b(?:month[\s‐‑–—-]+to[\s‐‑–—-]+date|mtd)\b/gi, () => ({ kind: "window", key: "MTD", label: "MTD" }));
  take(/\b(?:trailing[\s‐‑–—-]+twelve[\s‐‑–—-]+months|last[\s‐‑–—-]+twelve[\s‐‑–—-]+months|ttm|ltm)\b/gi,
    () => ({ kind: "window", key: "TTM", label: "TTM" }));
  // A bare "trailing" is the market's twelve-month convention ("trailing
  // P/E"); a stated other length ("trailing six months") is not.
  take(/\btrailing\b(?![\s‐‑–—-]+(?:\d|one|two|three|four|five|six|seven|eight|nine|ten|eleven)\b)/gi,
    () => ({ kind: "window", key: "TTM", label: "TTM" }));
  take(/\b(?:(?:for|during|over)\s+(?:the\s+)?(?:full\s+)?(?:fiscal\s+)?year|annual|annually|yearly|full[\s‐‑–—-]+year)\b/gi,
    () => ({ kind: "window", key: "annual", label: "annual" }));
  take(/\b(?:(?:for|during|over)\s+(?:the\s+)?quarter|quarterly)\b/gi,
    () => ({ kind: "window", key: "quarter", label: "quarter" }));
  // D-66: a 10-Q table's column header ("Three Months Ended Jul 26, 2026").
  take(/\b(?:three|3)[\s‐‑–—-]+months?[\s‐‑–—-]+end(?:ed|ing)\b/gi, () => ({ kind: "window", key: "quarter", label: "quarter" }));
  take(/\b(?:(?:six|6)[\s‐‑–—-]+months?[\s‐‑–—-]+end(?:ed|ing)|first[\s‐‑–—-]+half)\b/gi, () => ({ kind: "window", key: "6M", label: "six months" }));
  take(/\b(?:nine|9)[\s‐‑–—-]+months?[\s‐‑–—-]+end(?:ed|ing)\b/gi, () => ({ kind: "window", key: "9M", label: "nine months" }));
  take(/\b\d{4}-\d{2}-\d{2}\b/g, (m) => ({ key: isIsoDate(m[0]) ? m[0] : `unestablished-date:${m[0]}`, label: m[0], kind: "date" }));
  // The same slash spelling can name different dates across locales. Never
  // collapse it to its year or silently pick a locale for prose evidence.
  take(/\b\d{1,2}\/\d{1,2}\/(?:19|20)\d{2}\b/g,
    (m) => ({ key: `unestablished-date:${m[0]}`, label: m[0], kind: "date" }));
  take(new RegExp(String.raw`\b(${MONTH_NAMES})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b,?\s+((?:19|20)\d{2})\b`, "gi"),
    (m) => dated(m[3], MONTHS[m[1].toLowerCase()], m[2]));
  take(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_NAMES})\.?\s+((?:19|20)\d{2})\b`, "gi"),
    (m) => dated(m[3], MONTHS[m[2].toLowerCase()], m[1]));
  take(new RegExp(String.raw`\b(${MONTH_NAMES})\.?\s+((?:19|20)\d{2})\b`, "gi"),
    (m) => ({ kind: "month", label: m[0], key: `month:${m[2]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}` }));
  take(/\b(first|second|third|fourth)\s+quarter\s+(?:of\s+)?(?:(fiscal(?:\s+year)?|FY)\s*)?((?:19|20)\d{2})\b/gi,
    (m) => ({ kind: "period", label: `Q${["first", "second", "third", "fourth"].indexOf(m[1].toLowerCase()) + 1} ${m[2] ? "FY" : ""}${m[3]}`,
      key: `Q${["first", "second", "third", "fourth"].indexOf(m[1].toLowerCase()) + 1}${m[2] ? "FY" : ""}${m[3]}` }));
  take(/\bQ[1-4]\s*(?:FY\s*)?(?:19|20)\d{2}\b|\bFY\s*(?:19|20)\d{2}\b|\b(?:19|20)\d{2}\b|\b(?:TTM|LTM|YTD|Q[1-4]|H[12])\b/gi,
    (m) => ({ kind: "period", label: m[0], key: m[0].toUpperCase().replace(/\s+/g, "") }));
  if (options.loose) {
    for (const match of [...rest.matchAll(LOOSE_WINDOW)]) {
      if (NOT_A_WINDOW_BEFORE.test(rest.slice(Math.max(0, match.index - 24), match.index)) ||
        NOT_A_WINDOW_AFTER.test(rest.slice(match.index + match[0].length, match.index + match[0].length + 16)) ||
        // "fiscal year 2026": the year reader blanked the year, so look at the unblanked text; the year word is part of that period.
        NAMED_PERIOD_AFTER.test(text.slice(match.index + match[0].length, match.index + match[0].length + 16))) continue;
      const key = match[1].toLowerCase() === "year" ? "annual" : "quarter";
      out.push({ raw: match[0], start: match.index, end: match.index + match[0].length, kind: "window", key, label: key });
    }
  }
  return out;
}
/** The window keys a claim names, however written (test seam, like `phraseNamesRecordYear`). */
export function windowsNamed(text: string): string[] {
  return periodLabels(text, { loose: true }).filter((period) => period.kind === "window").map((period) => period.key);
}
const HARD_BOUNDARY = /;|\n|•|[.!?](?=\s+[A-Z“"(])/g;
/**
 * AI-404: the periods and comparison bases `span` of `text` states for `quantity`.
 * Every quantity inside the span is blanked first (a figure's digits are never a
 * year); the comparison cue is looked for in the unblanked text, because the
 * amounts between a bare "from" and its period are part of the cue grammar.
 * AI-402: a period that follows a comparison cue is the comparison's base, unless
 * this figure sits between the cue and it (then it is the figure's own period).
 * Offsets in the result are relative to `span.start`.
 */
function framePeriods(text: string, span: { start: number; end: number }, quantity: Quantity, all: readonly Quantity[], loose: boolean,
  yearEnd = false): { periods: PeriodReference[]; bases: PeriodReference[] } {
  const ownText = text.slice(span.start, span.end);
  let blanked = ownText;
  for (const other of all) {
    if (other.start >= span.start && other.end <= span.end) {
      blanked = blanked.slice(0, other.start - span.start) + " ".repeat(other.end - other.start) + blanked.slice(other.end - span.start);
    }
  }
  const stated = periodLabels(blanked, { loose, yearEnd });
  const isBase = (period: PeriodReference): boolean => {
    if (period.kind === "window") return false;
    const cue = comparisonCueEnd(ownText, period.start);
    return cue !== null && !(cue <= quantity.start - span.start && quantity.end - span.start <= period.start);
  };
  return { periods: stated.filter((period) => !isBase(period)), bases: stated.filter(isBase) };
}
// OD-3: management's expectation, outlook or guidance is not a reported result (accounting-standard "guidance" is not matched).
const FORWARD_LOOKING = /\b(?:(?:is|are|was|were|be|been|being|remains?|remained)\s+(?:now\s+|currently\s+|still\s+|also\s+)?(?:expected|projected|forecast(?:ed)?|anticipated|estimated|guided)\s+to|expects?|expecting|anticipates?|anticipating|forecasts?|outlook|guidance\s+(?:for|of|range|calls?\s+for|is|was|issued)|(?:our|its|management['’]s|the\s+company['’]s)\s+(?:[a-z-]+\s+){0,3}guidance)\b/i;
/**
 * AI-404 / C-3: a claim that states one figure is read for its periods and bases as a whole; several figures keep per-clause reading.
 * A period named only in a forward-looking clause or sentence is not lent to a figure whose own clause is not forward-looking
 * ("Revenue was USD 108.0 billion; NVIDIA expects strength in Q3 FY2027.").
 */
function claimContext(text: string, quantity: Quantity, all: Quantity[]): Context {
  const own = context(text, quantity, all);
  if (all.length !== 1) return own;
  const whole = framePeriods(text, { start: 0, end: text.length }, quantity, all, true);
  if (FORWARD_LOOKING.test(own.text)) return { ...own, ...whole };
  const forward: [number, number][] = [];
  let from = 0;
  for (const boundary of [...text.matchAll(HARD_BOUNDARY), { index: text.length, 0: "" }]) {
    if (FORWARD_LOOKING.test(text.slice(from, boundary.index))) forward.push([from, boundary.index]);
    from = boundary.index + boundary[0].length;
  }
  const lent = (period: PeriodReference): boolean => !forward.some(([a, b]) => period.start >= a && period.start < b);
  return { ...own, periods: whole.periods.filter(lent), bases: whole.bases.filter(lent) };
}
/**
 * AI-305 (OD-1): the words a sentence gives to a figure itself. Before the figure: from the latest of the clause start, the
 * preceding figure's end, the last "(" when no ")" follows it (only the last "(" is looked at) and the last ":" or ";" after that. After it: up to the first comma, semicolon, colon,
 * parenthesis, em or en dash, the next figure or the clause end. A comma inside a date ("as of September 3, 2026") does not cut.
 */
function ownBeforeStart(text: string, clauseStart: number, quantityStart: number, preceding: Quantity | undefined): number {
  let from = Math.max(clauseStart, preceding?.end ?? 0);
  const lead = text.slice(from, quantityStart);
  const open = lead.lastIndexOf("(");
  if (open >= 0 && !lead.includes(")", open)) from += open + 1;
  const cut = Math.max(text.slice(from, quantityStart).lastIndexOf(":"), text.slice(from, quantityStart).lastIndexOf(";"));
  return cut >= 0 ? from + cut + 1 : from;
}
function ownAfterEnd(text: string, clauseEnd: number, quantityEnd: number, following: Quantity | undefined): number {
  const limit = Math.min(clauseEnd, following?.start ?? clauseEnd);
  const tail = text.slice(quantityEnd, limit).replace(HEADER_DATE, (date) => date.replace(/,/g, " "));
  const cut = tail.search(/[,;:()\u2014\u2013]/);
  return cut >= 0 ? quantityEnd + cut : limit;
}
function ownDescription(text: string, quantity: Quantity, start: number, end: number, preceding: Quantity | undefined, following: Quantity | undefined): string {
  return text.slice(ownBeforeStart(text, start, quantity.start, preceding), quantity.start) + " " +
    text.slice(quantity.end, ownAfterEnd(text, end, quantity.end, following));
}
/** The test seam for `context`. */
export function readContextForTests(text: string, quantity: Quantity, all: Quantity[], source = false): Context {
  return context(text, quantity, all, source);
}
function context(text: string, quantity: Quantity, all: Quantity[], source = false): Context {
  let start = 0;
  let end = text.length;
  const hard = source ? [...text.matchAll(HARD_BOUNDARY)].map((match) => match.index) : [];
  for (const boundary of text.matchAll(/;|\n|•|[.!?](?=\s+[A-Z“"(])|,?\s+\b(?:while|whereas|versus|vs\.?|but|and)\s+/g)) {
    const at = boundary.index;
    const connector = /\b(?:while|whereas|versus|vs|but|and)\b/.test(boundary[0]);
    if (connector && !all.some((other) => other.start >= start && other.end <= at)) continue;
    // D-66: in a source sentence a connector separates two figures' clauses;
    // with no figure after it, it continues this figure's description ("a
    // $0.4 billion charge … for excess inventory and purchase obligations").
    if (source && connector) {
      const next = hard.find((index) => index > at) ?? text.length;
      if (!all.some((other) => other.start > at && other.start < next)) continue;
    }
    if (at < quantity.start) start = at + boundary[0].length;
    else if (at >= quantity.end) { end = at + (connector ? 0 : 1); break; }
  }
  const preceding = all.filter((other) => other.end < quantity.start && other.start >= start).at(-1);
  const following = all.find((other) => other.start > quantity.end && other.start < end);
  // Never borrow the metric name across another figure in a flattened row.
  const labelStart = preceding ? preceding.end : start;
  const labelEnd = following ? following.start : end;
  const label = text.slice(labelStart, quantity.start) + " " + text.slice(quantity.end, labelEnd);
  const ownText = text.slice(start, end);
  const own = ownDescription(text, quantity, start, end, preceding, following);
  const ownAfter = text.slice(quantity.end, ownAfterEnd(text, end, quantity.end, following));
  // A lock-up restriction names an asset constraint, not an upward change.
  // Keep offsets and every actual change/negation word for direction binding.
  const directionText = ownText.replace(/\block[‐‑–—-]up\b/gi, (match) => match.slice(0, -2) + "xx");
  const { periods, bases } = framePeriods(text, { start, end }, quantity, all, !source, source);
  // AI-503: a figure the text introduces with "from", "compared with/to", "versus", "vs." or "against" is a comparison base. The raw text
  // before the figure is read, not the clause: a clause can start at a "versus" connector and leave the figure nothing before it.
  const base = COMPARISON_BASE_LEAD.test(text.slice(Math.max(0, quantity.start - 24), quantity.start));
  return { start, end, text: ownText, label, own, ownAfter, periods, bases, base,
    direction: quantityDirection(directionText, quantity.start - start, quantity.end - start,
      all.filter((other) => other.start >= start && other.end <= end).map((other) => ({ start: other.start - start, end: other.end - start }))),
    ambiguous: all.filter((other) => other.start >= start && other.end <= end &&
      (other.unit === quantity.unit || other.unit === null)).length > 1 ||
      /^\s+(?:and|versus|vs\.?)\s+(?:[$€£¥]|[A-Z]{3}\s*)?[-+−]?\d/i.test(text.slice(end)) };
}
// Only grammatical/quantity boilerplate is removed. The older excerpt matcher
// deliberately discards words such as "not", "reported" and "total"; doing so
// in factual prose loses the financial definition beside the amount.
const METRIC_GRAMMAR = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "is", "it", "its", "of", "on", "or",
  "per", "the", "to", "was", "were", "with", "are", "be", "been", "being", "has", "have", "had", "this", "that", "these", "those",
  "company", "firm", "firmwide", "remained", "recorded", "stood", "reached", "compared", "during", "versus", "vs", "while", "our",
  "percent", "percentage", "point", "points", "basis", "bp", "bps", "pp", "pps", "currency", "count", "dollar", "dollars",
  "thousand", "thousands", "million", "millions", "billion", "billions", "trillion", "trillions"]);
// Words that place a figure in time without defining it ("at the latest
// quarter end", "ROIC (latest)"). A claim's window words are read as windows
// before this drop (periodLabels with { loose: true }), so the period itself is
// checked separately, and a named window (TTM, YTD, "for the quarter") stays a
// metric token. "Current"
// is not here: current assets and current liabilities are definitions.
const PERIOD_DESCRIPTORS = new Set(["latest", "recent", "most", "same", "end", "ended", "ending", "period", "periods", "quarter",
  "year", "fiscal", "quarter-end", "year-end", "period-end"]);
// Registry labels abbreviate what prose spells out.
const ABBREVIATIONS: Readonly<Record<string, readonly string[]>> = {
  fcf: ["free", "cash", "flow"], sbc: ["stock-based", "compensation"], capex: ["capital", "expenditure"],
  // D-63: an executive-compensation row ("comp Jen-Hsun Huang President and CEO
  // FY2026") is the summary table's total, which prose calls total compensation.
  comp: ["total", "compensation"],
  // D-66: the analyst-estimate rows ("est revenue 2027-01-25").
  est: ["estimated"],
};
/**
 * D-66: one name per metric head, applied to the claim and the source alike.
 * Small and explicit on purpose: each pair names the same figure, and none
 * drops a definition-changing modifier (non-GAAP, operating, diluted, net,
 * adjusted all survive). NVDA final rerun: "The quoted price was USD 217.23
 * per share" against the record "price" and "Consensus estimated revenue"
 * against "est revenue" stayed unchecked.
 */
const METRIC_SYNONYMS: readonly (readonly [readonly string[], readonly string[]])[] = [
  [["quoted", "price"], ["price"]], [["share", "price"], ["price"]], [["stock", "price"], ["price"]], [["last", "price"], ["price"]],
  [["sales"], ["revenue"]], [["revenues"], ["revenue"]],
  [["consensus", "estimated"], ["estimated"]], [["consensus", "estimate"], ["estimated"]], [["estimate"], ["estimated"]],
  [["earnings", "per", "share"], ["eps"]],
  // The weighted-projection rows ("revenue weighted 12M ending …") are projections by definition.
  [["weighted", "projected"], ["weighted"]],
];
function withSynonyms(tokens: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length;) {
    const hit = METRIC_SYNONYMS.find(([from]) => from.every((word, j) => tokens[i + j] === word));
    if (hit === undefined) { out.push(tokens[i]!); i += 1; continue; }
    out.push(...hit[1]);
    i += hit[0].length;
  }
  return out;
}
/** Hyphenated words compared as their parts ("gross-margin" is "gross margin"), except a negative compound or a modifier that is one word. */
function splitCompound(word: string): string[] {
  return !word.includes("-") || word.startsWith("non-") || DEFINITION_MODIFIERS.has(word) ? [word] : word.split("-");
}
/**
 * AI-305 (OD-1): words in a figure's own description that carry no metric. The list is closed and holds no noun, adjective,
 * comparator, definition modifier or direction word; "reported" and "total" stay meaningful (see METRIC_GRAMMAR).
 */
const OWN_CONTEXT_WORDS = new Set([
  // pronouns
  "we", "us", "they", "them", "their", "there", "which", "who", "whose", "he", "she", "him", "her", "his",
  // recognition verbs
  "totaled", "totalled", "totaling", "totalling", "amounted", "came", "represented", "posted", "generated", "delivered", "achieved",
  "incurred", "recognized", "recognised", "booked",
  // relational links
  "associated", "related", "relating", "attributable",
  // causal links
  "driven", "due", "primarily", "mainly", "largely", "partly", "partially", "reflecting",
  // hedges
  "approximately", "approx", "about", "around", "nearly", "almost", "roughly", "some",
  // emphasis
  "record",
  // point abbreviations a previous table cell leaves in a row lead
  "pt", "pts",
]);
/** The content words of a figure's own description: ordinal period phrases and comparison bases are blanked, context words dropped. */
function ownDescriptionTokens(text: string, ignore: readonly string[]): string[] {
  const blanked = text
    .replace(/\b(?:first|second|third|fourth)[\s\u2010-\u2014-]+(?:fiscal[\s\u2010-\u2014-]+)?(?:quarter|half)\b/gi, " ")
    .replace(/\b(?:prior|previous|preceding|same)\s+(?:quarter|year|period)\b/gi, " ")
    // A spelled-out basis is a comparison base too ("a year-over-year increase of $66.1 billion in purchases"), and D-63 never required it.
    .replace(/\b(?:year|quarter)[\s\u2010-\u2014-]+over[\s\u2010-\u2014-]+(?:year|quarter)\b|\b(?:yoy|qoq)\b/gi, " ");
  // A window is compared as a period (AI-303 / C-6), not as a metric word, exactly as the claim's own window tokens are.
  return metricTokens(blanked, ignore).filter((word) => !OWN_CONTEXT_WORDS.has(word) && !word.startsWith("window"));
}
function metricTokens(label: string, ignore: readonly string[], options: { loose?: boolean } = {}): string[] {
  // D-66: registry keys are camelCase ("priceToBook (current)"), and a
  // comparison basis is part of a growth's definition (see COMPARISON_BASIS).
  let metric = label.replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\bP\s*\/\s*E\b/gi, "pe")
    .replace(/\block[‐‑–—-]up\b/gi, "lockup")
    .replace(/\byear[\s‐‑–—-]+over[\s‐‑–—-]+year\b|\byoy\b/gi, " yoy ")
    .replace(/\bquarter[\s‐‑–—-]+over[\s‐‑–—-]+quarter\b|\bqoq\b/gi, " qoq ")
    // "Management's guidance" attributes the figure; it does not define it.
    .replace(/\b(?:management|the company)['’]s\b/gi, " ")
    .replace(LABEL_WINDOW, (_match, quarter: string | undefined) => quarter ? " for the quarter " : " for the year ");
  for (const period of periodLabels(metric, options)) metric = metric.replace(period.raw, period.kind === "window" ? ` window${period.key} ` : " ");
  // Preserve the explicit horizon, including its number, when prose spells
  // out the technical-series label "6-month" as "over six months".
  metric = metric.replace(/\b(?:over\s+)?(?:six|6)[\s‐‑–—-]+months?\b/gi, " window6M ");
  // Preserve negative compounds as definitions. Splitting non-GAAP into two
  // words would let a GAAP claim reuse the GAAP substring of its opposite.
  metric = metric.toLowerCase().replace(/\bnon[\s‐‑–—-]+(?=[a-z])/g, "non-").replace(/[‐‑–—]/g, "-");
  const ignored = new Set([...ignore.flatMap((word) => word.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().match(/[a-z0-9]+/g) ?? []),
    ...findDirectionWords(metric).map((hit) => hit.word), ...CURRENCIES.toLowerCase().split("|")]);
  const words = (metric.match(/[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*/g) ?? [])
    // A hyphenated ignored name ("Jen-Hsun") is ignored as a whole.
    .filter((word) => !(word.includes("-") && word.split("-").every((part) => ignored.has(part))))
    .flatMap(splitCompound)
    .flatMap((word) => ABBREVIATIONS[word] ?? [word])
    // A possessive's "s" ("NVIDIA's revenue") is no word of the metric.
    .filter((word) => word !== "s");
  const tokens = withSynonyms(words);
  return [...new Set(tokens.filter((word) => !METRIC_GRAMMAR.has(word) && !PERIOD_DESCRIPTORS.has(word) && !ignored.has(word)))];
}
/**
 * Windows a typed record establishes from its issuer fiscal basis ("Q2 FY2027"
 * is a quarter). Prose may name them, or leave them unstated as before; a
 * window written into the record's period text (TTM) must still be named.
 */
function basisWindows(record: NumericProvenanceRecord): Set<string> {
  const windows = new Set<string>();
  const fiscal = record.fiscalPeriod ?? record.periodContext?.fiscalLabel ?? "";
  if (/^Q[1-4]\s/i.test(fiscal)) windows.add("quarter");
  else if (/^FY\s?\d/i.test(fiscal)) windows.add("annual");
  // AI-303-V3: only a year-end record (an FY or fourth-quarter label, or a fiscal-year basis) establishes the year-end instant.
  if (/^(?:Q4\s|FY\s?\d)/i.test(fiscal)) windows.add("FYE");
  const basis = record.periodContext?.basis;
  if (basis === "fiscal-quarter") windows.add("quarter");
  if (basis === "fiscal-year") { windows.add("annual"); windows.add("FYE"); }
  if (basis === "rolling-12-month") windows.add("TTM");
  if (basis === "year-to-date") windows.add("YTD");
  return windows;
}
/**
 * D-66: the windows a record's own label names ("…, quarter ended
 * 2026-07-26", "three months ended …", "quarterly cash dividend"). Unlike a
 * basis window, prose must still name it (the label's words are compared as
 * metric words, see LABEL_WINDOW); a prose window it names agrees with it.
 */
function labelWindows(record: NumericProvenanceRecord): Set<string> {
  const windows = new Set<string>();
  for (const period of periodLabels((record.label ?? "").replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(LABEL_WINDOW, (match, quarter: string | undefined) => quarter ? " for the quarter " : " for the year ")))
    if (period.kind === "window") windows.add(period.key);
  return windows;
}
/**
 * AI-303: the windows a record's label names loosely ("latest-quarter revenue
 * growth"), which labelWindows does not read. Prose may name or omit them.
 */
function labelLooseWindows(record: NumericProvenanceRecord): Set<string> {
  const explicit = labelWindows(record);
  const windows = new Set<string>();
  for (const period of periodLabels((record.label ?? "").replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(LABEL_WINDOW, (match, quarter: string | undefined) => quarter ? " for the quarter " : " for the year "), { loose: true }))
    if (period.kind === "window" && !explicit.has(period.key)) windows.add(period.key);
  return windows;
}
/** A label's "quarter ended <date>" / "year ended <date>" is the window "for the quarter (year) ended" names in prose. */
const LABEL_WINDOW = /(?<!\b(?:for|during|over)\s+(?:the\s+)?(?:full\s+)?(?:fiscal\s+)?)\b(?:(quarter)|(?:fiscal\s+)?year)(?=[\s‐‑–—-]+end(?:ed|ing)\b)/gi;
/** D-66: an axis label ("Product / market platform: Data Center revenue …") classifies the row; it does not define it. */
function withoutAxis(label: string): string | null {
  // Only the axes emitted by segmentRevenueSection are classification labels.
  // Arbitrary prefixes ("non-GAAP:", "excluding acquisitions:") define the figure.
  const match = /^(?:Product \/ market platform|Reportable segment|Geography):\s+(\S[\s\S]*)$/.exec(label);
  return match?.[1] ?? null;
}
/**
 * D-66: "net income (NI)", "operating cash flow (CFO)": a parenthetical
 * acronym of the words just before it restates them, so prose may leave it
 * out ("gross margin (GAAP)" is no such restatement and stays).
 */
function withoutRestatedAcronyms(label: string): string | null {
  const out = label.replace(/\(\s*([A-Z]{2,5})\s*\)/g, (match: string, acronym: string, offset: number, whole: string) => {
    const initials = (whole.slice(0, offset).match(/[A-Za-z][\w-]*/g) ?? []).slice(-acronym.length).map((word) => word[0]!.toUpperCase());
    return [...initials].sort().join("") === [...acronym].sort().join("") ? " " : match;
  });
  return out === label ? null : out;
}
/**
 * Equivalent names bound to the producers' explicit contracts. These are
 * additional source labels, never stopwords in arbitrary prose/excerpts.
 * Accounting basis, entity, formula operands and forecast period survive.
 */
function labelReadings(record: NumericProvenanceRecord): string[] {
  const label = record.label;
  if (!label) return [];
  const forms = new Set<string>([label]);
  for (const form of [...forms]) { const bare = withoutAxis(form); if (bare !== null) forms.add(bare); }
  for (const form of [...forms]) { const bare = withoutRestatedAcronyms(form); if (bare !== null) forms.add(bare); }
  if (record.kind === "computed") {
    if (record.unit === "score" && /^computed\.scores\.[a-z]+$/.test(record.origin) &&
      record.id.startsWith("computed.deterministic-aspect-scores.") && /^[a-z]+ score$/.test(label)) forms.add(`quantitative ${label}`);
    if (record.origin === "computed.valuation.multiples.peTtm" && record.unit === "ratio" && label === "peTtm (current)")
      forms.add("P/E TTM (current)");
    if (record.id.startsWith("computed.quarterly-trend.") && record.origin === "fmp:income-statement(quarter)" && record.unit === "currency" &&
      /^free cash flow \(operating cash flow less capex\), quarter ended \d{4}-\d{2}-\d{2}$/.test(label)) forms.add(`standardized ${label}`);
    const forward = /^(fcf|epsDiluted) weighted (12M ending \d{4}-\d{2}-\d{2})$/.exec(label);
    if (forward !== null && record.id.startsWith("computed.weighted-projections.") && record.period === forward[2]) {
      // projections.ts: forward fcf is FCFF; forward epsDiluted uses the
      // D-65 operating-EPS formula. Neither alias applies to historical EPS/FCF.
      if (forward[1] === "fcf" && record.origin === "computed.projections.fcf.weighted" && record.unit === "currency")
        forms.add(`FCFF weighted ${forward[2]}`);
      if (forward[1] === "epsDiluted" && record.origin === "computed.projections.epsDiluted.weighted" && record.unit === "currency-per-share")
        forms.add(`operating EPS weighted ${forward[2]}`);
    }
  }
  if (record.kind === "provider" && record.id.startsWith("payload.filing-facts.") && /^edgar:8-K\s/.test(record.origin)) {
    if (record.unit === "currency" && / \(appointment package\)$/.test(label)) forms.add(label.replace(/ \(appointment package\)$/, ""));
  }
  return [...forms];
}
/** Explicit typed-source metadata/formula readings; replacements preserve quantity offsets. */
function typedClaimContext(text: string, record: NumericProvenanceRecord): string | null {
  if (record.kind === "provider" && record.id.startsWith("payload.filing-facts.") && /^edgar:8-K\s/.test(record.origin) &&
    record.unit === "percent" && record.label === "say-on-pay support (votes for / for + against + abstentions)") {
    // Read complete formulas before unordered metric tokens: numerator,
    // denominator order and operand multiplicity cannot be recovered from a set.
    const words = /\bmeasured as votes for divided by votes for, against and abstentions\b/gi;
    const math = /\(\s*votes\s+for\s*\/\s*for\s*\+\s*against\s*\+\s*abstentions\s*\)/gi;
    const remainder = text.replace(words, (match) => " ".repeat(match.length)).replace(math, (match) => " ".repeat(match.length));
    if (/\b(?:votes?|against|abstentions|divided)\b|[/+]/i.test(remainder)) return null;
    return text.replace(words,
      (match) => "(votes for / for + against + abstentions)".padEnd(match.length));
  }
  if (record.kind !== "provider" || !record.id.startsWith("payload.issuer-filings.") || !/^edgar:8-K\s/.test(record.origin) ||
    !/\bguidance\b/.test(record.label ?? "") || !isIsoDate(record.asOf ?? "")) return text;
  return text.replace(/\bissued on (\d{4}-\d{2}-\d{2})\b/gi, (match, date: string) => date === record.asOf ? " ".repeat(match.length) : match);
}
/** A typed record's "<basis>: <start> to <end>" window. */
function recordWindow(record: NumericProvenanceRecord): { key: string; start: string; end: string } | null {
  const match = /^\s*(ttm|ltm|ytd)\s*:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\s*$/i.exec(record.period ?? "");
  return match ? { key: match[1].toLowerCase() === "ytd" ? "YTD" : "TTM", start: match[2], end: match[3] } : null;
}
/** A pipeline-owned terminal duration label can establish its start, never an arbitrary second date. */
function explicitLabelSpan(text: string, record: NumericProvenanceRecord): { start: string; end: string } | null {
  const span = /,\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\s*$/i.exec(record.label ?? "");
  // The record's period is the span's end, or the whole span as the payload
  // registers a filing-fact duration (filingFactPeriod); either way it must be this span.
  if (span === null || !isIsoDate(span[1]) || !isIsoDate(span[2]) || span[1] > span[2] ||
    (record.period !== span[2] && record.period !== `${span[1]} to ${span[2]}`)) return null;
  const sourceDates = periodLabels(record.label ?? "");
  const claimDates = periodLabels(text);
  const claimed = [...text.matchAll(/\b(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\b/gi)];
  // Inspect the whole claim: a later clause must not hide another date or interval.
  if (sourceDates.length !== 2 || claimDates.length !== 2 || claimed.length !== 1 ||
    claimed[0][1] !== span[1] || claimed[0][2] !== span[2] ||
    !sourceDates.every((date, i) => date.kind === "date" && date.key === span[i + 1]) ||
    !claimDates.every((date, i) => date.kind === "date" && date.key === span[i + 1])) return null;
  if (record.periodContext !== undefined) {
    const parsed = PeriodContextSchema.safeParse(record.periodContext);
    if (!parsed.success || parsed.data.kind !== "duration" || parsed.data.start !== span[1] || parsed.data.end !== span[2]) return null;
    const fiscal = parsed.data.fiscalLabel;
    if (fiscal !== undefined && record.fiscalPeriod !== undefined &&
      fiscal.toLowerCase().replace(/\s+/g, "") !== record.fiscalPeriod.toLowerCase().replace(/\s+/g, "")) return null;
  }
  return { start: span[1], end: span[2] };
}
function namesMetric(claim: string[], source: string[]): boolean {
  if (claim.length === 0 || source.length === 0) return false;
  const stem = (word: string): string => word.length > 3 ? word.replace(/s$/, "") : word;
  // Definition support is symmetric. A source-side modifier/negation cannot
  // disappear just because the shorter claim is a subset of its words.
  return claim.every((word) => source.some((other) => stem(word) === stem(other))) &&
    source.every((word) => claim.some((other) => stem(word) === stem(other)));
}
function equalValue(claim: Quantity, value: number): boolean {
  return Math.abs(claim.value - value) <= claim.step / 2 + 1e-10 * Math.max(1, Math.abs(value));
}
function resolvedCurrency(quantity: Quantity, reportingCurrency: string | null): string | null {
  if (quantity.currency !== null) return quantity.currency;
  return quantity.dollar && reportingCurrency !== null && DOLLARS.has(reportingCurrency) ? reportingCurrency : null;
}
function support(status: ClaimNumericSupport["status"], reason: ClaimNumericSupport["reason"], note: string, spans: ClaimSourceSpan[] = []): ClaimNumericSupport {
  return { status, reason, note, spans };
}

/**
 * Source-side metric support (D-63). The claim's description must be stated
 * in the source clause, and a definition-changing modifier the clause states
 * must be in the claim too ("non-GAAP", "operating", "diluted"). The record
 * path keeps exact symmetry; an excerpt clause also carries its verb and its
 * context ("Inventory was $31.6 billion, up from $25.8 billion sequentially, as we prepare for …": an explanation after a comma),
 * which demanding in the claim failed every figure a filing states in a sentence.
 * AI-305 / D-next (OD-1) revises the clause-wide half: the clause still carries the verb and the context, but the words the
 * sentence gives to the figure itself (its own description, Context.own) must be named by the claim too, so a figure the
 * sentence gives to another noun ("a record of nearly $26.0 billion to shareholders") no longer binds a free-cash-flow claim.
 * The two tests are conjoined, so this never admits a candidate the clause test rejected.
 * AI-503 / D-next: a comparison base binds only a comparison base, and a move's end takes the move's head (`Context.base`, `moveHead`).
 */
const DEFINITION_MODIFIERS = new Set(["gaap", "non-gaap", "net", "adjusted", "excluding", "exclude", "excludes", "ex", "pro-forma", "proforma",
  "organic", "underlying", "core", "normalized", "diluted", "basic", "gross", "operating", "pre-tax", "pretax", "after-tax",
  "segment", "not", "no", "without", "constant", "incremental", "cumulative", "average"]);
function excerptNamesMetric(claim: string[], source: string[], named: string[], own: string[], ownAfter: string[] = []): boolean {
  if (claim.length === 0 || source.length === 0) return false;
  const stem = (word: string): string => word.length > 3 ? word.replace(/s$/, "") : word;
  const inClaim = (word: string): boolean => claim.some((other) => stem(word) === stem(other));
  const inNamed = (word: string): boolean => named.some((other) => stem(word) === stem(other));
  return claim.every((word) => source.some((other) => stem(word) === stem(other))) &&
    source.every((word) => !DEFINITION_MODIFIERS.has(word) || inClaim(word)) &&
    own.every((word) => inClaim(word) || (inNamed(word) && ownAfter.some((other) => stem(word) === stem(other))));
}
/**
 * AI-503: the words that make the next figure a comparison base. A base supports only a claim figure introduced the same way, and it
 * takes no reporting period from the excerpt.
 */
const COMPARISON_BASE_LEAD = /\b(?:from|compared\s+(?:with|to)|versus|vs\.?|against)\s*$/i;
/** The only words that may sit between $A and the "to" that opens a move's end; they describe $A (fix round 1). */
const MOVE_TIME_WORDS: ReadonlySet<string> = new Set(["last", "ago", "earlier", "sequentially", "quarter", "year", "prior", "first", "second",
  "third", "fourth", "fiscal", "month", "months", "the", "a", "an", "in", "at", "of", "end"]);
/**
 * AI-503: in "<direction word> from $A ... to $B" the metric and the direction belong to $B. Returns the words from the start of $A's own
 * description up to its "from" (the move's head), when "from" opens $A, both figures lie in the clause and $B is the next figure after
 * a bare "to"; null otherwise.
 */
function moveHead(text: string, previous: Quantity, current: Quantity, all: readonly Quantity[], clause: { start: number; end: number }): string | null {
  const fromLead = /\bfrom\s*$/i.exec(text.slice(Math.max(0, previous.start - 24), previous.start));
  if (fromLead === null) return null;
  if (previous.start < clause.start || current.end > clause.end) return null;
  if (!/^[^\d$€£¥;•\n]*\bto\s*$/i.test(text.slice(previous.end, current.start))) return null;
  // Fix round 1 (AI-503): only time words may sit between $A and "to". Any punctuation, direction word or other content word means
  // another clause or a new subject ("... due to Data Center revenue growing to $41.1 billion"), and $B then gets no head.
  const between = text.slice(previous.end, current.start).replace(/\bto\s*$/i, " ");
  if (/[,:()\u2014\u2013]/.test(between) || findDirectionWords(between).length > 0) return null;
  if (!(between.toLowerCase().match(/[a-z]+/g) ?? []).every((word) => MOVE_TIME_WORDS.has(word))) return null;
  const fromAt = Math.max(0, previous.start - 24) + fromLead.index;
  const before = all.filter((other) => other.end < previous.start && other.start >= clause.start).at(-1);
  return text.slice(ownBeforeStart(text, clause.start, previous.start, before), fromAt);
}
const COMPARATIVE_LEAD = /^[\s,;(]*(?:(?:up|down|higher|lower|increas\w*|decreas\w*|rose|fell|compared)\s+)?(?:from|with|versus|vs\.?|compared (?:to|with)|against)[\s:]*$/i;
/** The excerpt's own period statements: its reporting period, fiscal quarter, quarter end or event date — never its filing date or accession. */
function excerptPeriods(excerpt: TextExcerpt): PeriodReference[] {
  const title = excerpt.title
    .replace(/\bfiled \d{4}-\d{2}-\d{2}\b/gi, " ")
    .replace(/\b\d{10}-\d{2}-\d{6}\b/g, " ");
  return periodLabels(title).filter((period) => period.kind === "date" || period.kind === "period");
}
/** AI-303 / C-6: the windows the excerpt's title states ("quarter ended …", a Q<n> FY label is a quarter, an FY label the year). */
function excerptWindows(excerpt: TextExcerpt): Set<string> {
  const title = excerpt.title
    .replace(/\bfiled \d{4}-\d{2}-\d{2}\b/gi, " ")
    .replace(/\b\d{10}-\d{2}-\d{6}\b/g, " ")
    .replace(LABEL_WINDOW, (match, quarter: string | undefined) => quarter ? " for the quarter " : " for the year ");
  const windows = new Set(periodLabels(title, { loose: true }).filter((period) => period.kind === "window").map((period) => period.key));
  for (const period of excerptPeriods(excerpt)) {
    if (period.kind !== "period") continue;
    if (/^Q[1-4]/.test(period.key)) windows.add("quarter");
    else if (/^FY/.test(period.key)) windows.add("annual");
    if (/^Q4|^FY/.test(period.key)) windows.add("FYE"); // AI-303-V3
  }
  return windows;
}

const HEADER_DATE = new RegExp(String.raw`\b(?:${MONTH_NAMES})\.?\s+\d{1,2},?\s+(?:19|20)\d{2}\b|\b\d{4}-\d{2}-\d{2}\b`, "gi");

interface TableColumn { label: string; period: PeriodReference; window: PeriodReference | null; scale: number | null; exceptPerShare: boolean; dollars: boolean; rowStart: number }
/** A table header's change column ("$ Change", "% Change"), which binds no period. */
const CHANGE_COLUMN = /^[\s,|]*(?:[$%]\s*)?Change\b/i;
const MONTHS_ENDED = /\b(Three|Six|Nine)\s+Months\s+Ended\b/gi;
const TABLE_SCALE = /\(\s*(?:\$\s*)?in\s+(thousands|millions|billions)(?:,[^)]{0,40})?\s*\)/gi;
/**
 * AI-403: a row's own lead, without any table scale declaration. The first row
 * under a header reads "($ in millions, except per share data) Revenue", and the
 * declaration is not that row's description.
 */
function rowLead(label: string): string {
  return label.replace(TABLE_SCALE, " ");
}
/** The per-share basis is named in the words ("Basic net income per share"), not after the figure; "EPS" alone is not read (DECISIONS entry 8). */
function perShareInWords(quantity: Quantity, label: string): boolean {
  return quantity.unit === "currency" && /\bper\s+share\b/i.test(label);
}
/**
 * AI-403 / D-45: under "except per share data" a decimal cell is the per-share
 * line when the declared scale is thousands or millions (statement amounts are
 * whole numbers there) or when its own row names a per-share basis (under
 * "($ in billions)" amounts such as "Revenue $ 216.0" are decimals too).
 */
function isPerShareCell(quantity: Quantity, column: { scale: number | null; exceptPerShare: boolean; label: string } | undefined): boolean {
  if (column === undefined || !column.exceptPerShare || quantity.step >= 1) return false;
  return column.scale === 1e3 || column.scale === 1e6 || /\bper[\s-]+share\b|\beps\b/i.test(rowLead(column.label));
}
/**
 * AI-403: a table's "(In millions)" scales its amounts and share counts only, never a percent, a ratio, a day count
 * or a per-share cell, and never a figure that printed its own scale word.
 */
function tableScaleFor(quantity: Quantity, column: { scale: number | null; exceptPerShare: boolean; label: string } | undefined): number {
  if (column === undefined || quantity.scaled) return 1;
  if (quantity.unit !== "currency" && quantity.unit !== "shares" && quantity.unit !== null) return 1;
  if (isPerShareCell(quantity, column)) return 1;
  return column.scale ?? 1;
}
/**
 * D-63: column bindings of a flattened statement table ("Jul 26, 2026 Jan 25,
 * 2026 (In millions) Cash and cash equivalents $ 22,443 $ 10,605 …"). A row is
 * a label followed by exactly as many figures as its header — the nearest
 * preceding run of two or more dates — names, with nothing but "$" or spaces
 * between the figures; the j-th figure is the j-th date's, under the row's
 * label. A row that does not line up with its header binds nothing. D-66: the
 * scale the header states ("(In millions)") and a quarter / year-to-date
 * header with change columns are read too.
 */
function tableColumns(text: string, found: readonly Quantity[]): Map<Quantity, TableColumn> {
  const out = new Map<Quantity, TableColumn>();
  const dates = [...text.matchAll(HEADER_DATE)].map((m) => ({ start: m.index, end: m.index + m[0].length, raw: m[0] }));
  // D-66: a 10-Q table states its quarter and its year to date side by side,
  // each run of dates closed by a change column: "Three Months Ended Six
  // Months Ended Jul 26, 2026 Jul 27, 2025 $ Change Jul 26, 2026 Jul 27, 2025
  // $ Change". Such a header has one column per date and per change column;
  // the change columns bind nothing, and the n-th "… Months Ended" names the
  // n-th run's window.
  const headers: { start: number; end: number; columns: ({ date: string; run: number } | null)[]; runs: number }[] = [];
  for (let i = 0; i < dates.length;) {
    let j = i;
    const columns: ({ date: string; run: number } | null)[] = [{ date: dates[i]!.raw, run: 0 }];
    let run = 0;
    let end = dates[i]!.end;
    while (j + 1 < dates.length) {
      const gap = text.slice(dates[j]!.end, dates[j + 1]!.start);
      if (/^[\s,|]*$/.test(gap)) { j++; columns.push({ date: dates[j]!.raw, run }); end = dates[j]!.end; continue; }
      const change = CHANGE_COLUMN.exec(gap);
      if (change !== null && /^[\s,|]*$/.test(gap.slice(change[0].length))) { j++; run++; columns.push(null, { date: dates[j]!.raw, run }); end = dates[j]!.end; continue; }
      break;
    }
    const trailing = CHANGE_COLUMN.exec(text.slice(end, end + 24));
    if (trailing !== null && columns.length > 1) { columns.push(null); end += trailing[0].length; }
    if (columns.filter((c) => c !== null).length > 1) headers.push({ start: dates[i]!.start, end, columns, runs: run + 1 });
    i = j + 1;
  }
  // Accounting parentheses sit between a row's figures ("$ 592 $ (96) $ 1,037").
  const blank = (a: number, b: number): boolean => /^[\s$€£¥()]*$/.test(text.slice(a, b));
  for (let q = 0; q < found.length;) {
    const header = headers.filter((h) => h.end <= found[q]!.start).at(-1);
    const prevEnd = q > 0 ? found[q - 1]!.end : 0;
    const lead = text.slice(Math.max(prevEnd, header?.end ?? 0), found[q]!.start);
    if (header === undefined || blank(Math.max(prevEnd, header.end), found[q]!.start) || /[.!?]\s/.test(lead)) { q++; continue; }
    let r = q;
    while (r + 1 < found.length && blank(found[r]!.end, found[r + 1]!.start)) r++;
    const k = header.columns.length;
    if (r - q + 1 === k && metricTokens(lead, []).length > 0) {
      const named = [...text.slice(Math.max(0, header.start - 160), header.start).matchAll(MONTHS_ENDED)].map((m) => m[1]!.toLowerCase());
      // Many statements have no change columns: repeated identical date runs
      // still establish which half belongs to each explicitly named window.
      const runWidth = k / named.length;
      const repeatedRuns = header.runs === 1 && named.length > 1 && Number.isInteger(runWidth) && runWidth >= 2 &&
        header.columns.every((column, index) => column !== null && column.date === header.columns[index % runWidth]?.date);
      const windows = named.length === header.runs || repeatedRuns ? named.map((months) => periodLabels(`${months} months ended`)[0] ?? null) : [];
      // A declaration can immediately precede the date header, e.g. CRWV's
      // "(in millions): June 30, 2026 December 31, 2025". Admit only a local
      // adjacent chain of parentheticals; prose or another table breaks it.
      const prefix = text.slice(Math.max(0, header.start - 160), header.start);
      const preceding = [...prefix.matchAll(TABLE_SCALE)];
      let boundary = prefix.length;
      const adjacent: RegExpMatchArray[] = [];
      for (let i = preceding.length - 1; i >= 0; i--) {
        const match = preceding[i]!;
        if (!/^[\s:|]*$/.test(prefix.slice(match.index + match[0].length, boundary))) break;
        adjacent.unshift(match);
        boundary = match.index;
      }
      const declarations = [...adjacent, ...text.slice(header.start, found[q]!.start).matchAll(TABLE_SCALE)];
      const scaleWords = new Set(declarations.map((match) => match[1]!.toLowerCase()));
      const scaleWord = declarations.at(-1)?.[1]?.toLowerCase();
      // This new preceding-header contract admits only the plain scale; an
      // extra currency/unit qualifier cannot disappear into reportingCurrency.
      const plainPrefix = adjacent.every((match) => /^\(\s*(?:\$\s*)?in\s+(?:thousands|millions|billions)\s*\)$/i.test(match[0]));
      const scale = !plainPrefix || scaleWords.size > 1 ? null : scaleWord === undefined ? 1 : SCALES[scaleWord] ?? 1;
      const exceptPerShare = declarations.some((match) => /except\s+per[\s-]+share/i.test(match[0]));
      // "($ in millions)" makes every cell of the table dollars, not only the first row's.
      const dollars = declarations.some((match) => /\$/.test(match[0]));
      for (let c = 0; c < k; c++) {
        const column = header.columns[c];
        const period = column ? periodLabels(column.date)[0] : undefined;
        if (column && period !== undefined) {
          out.set(found[q + c]!, { label: lead, period, window: windows[repeatedRuns ? Math.floor(c / runWidth) : column.run] ?? null, scale, exceptPerShare, dollars, rowStart: Math.max(prevEnd, header.end) });
        }
      }
    }
    q = r + 1;
  }
  return out;
}

function sourceBindings(excerpt: TextExcerpt): SourceBinding[] {
  const bodies = excerpt.spans ?? [{ start: 0, end: excerpt.text.length, text: excerpt.text.split("…[TRUNCATED")[0] }];
  const inherited = excerptPeriods(excerpt);
  const inheritedWindows = excerptWindows(excerpt);
  const yearEnd = inheritedWindows.has("FYE");
  return bodies.flatMap((body) => {
    // D-66: a footnote marker after a row label ("Unrealized gains (1) 4,900")
    // is not the row's first figure.
    const found = quantities(body.text).filter((quantity) => !(/^\(\d\)$/.test(body.text.slice(quantity.start - 1, quantity.end + 1)) &&
      /[A-Za-z]\s*$/.test(body.text.slice(Math.max(0, quantity.start - 3), quantity.start - 1)) && /^\s*[$(\d]/.test(body.text.slice(quantity.end + 1))));
    const columns = tableColumns(body.text, found);
    const dividendPairs = new Map<Quantity, NonNullable<SourceBinding["unitPair"]>>();
    for (let i = 0; i + 1 < found.length; i++) {
      const total = found[i]!, perShare = found[i + 1]!;
      if (total.unit !== "currency" || perShare.unit !== "currency-per-share" ||
        total.currency !== perShare.currency || total.dollar !== perShare.dollar ||
        !/^\s*,\s*or\s*$/i.test(body.text.slice(total.end, perShare.start))) continue;
      const totalContext = context(body.text, total, found, true);
      const perShareContext = context(body.text, perShare, found, true);
      if (totalContext.start !== perShareContext.start || totalContext.end !== perShareContext.end ||
        !/^\s*,\s*of\s+cash\s+dividends\s+paid\s*[.,]?\s*$/i.test(body.text.slice(perShare.end, perShareContext.end))) continue;
      const pair = { totalStart: total.start, perShareStart: perShare.start };
      dividendPairs.set(total, pair);
      dividendPairs.set(perShare, pair);
    }
    return found.map((quantity, index) => {
      const column = columns.get(quantity);
      if (column !== undefined) {
        // A table cell: its row label and its column's date (and the window
        // its header names), no list reading.
        const periods = column.window === null ? [column.period] : [column.period, column.window];
        // The header's window is part of the cell's description, as a prose window is of its clause's.
        const label = column.window === null ? column.label : `${column.label} ${column.window.raw}`;
        const own = { ...context(body.text, quantity, found), label, own: rowLead(column.label).split(":").at(-1)!, ownAfter: "", periods, bases: [], ambiguous: false, direction: null, base: false };
        const rowStart = column.rowStart + (body.text.slice(column.rowStart).length - body.text.slice(column.rowStart).trimStart().length);
        // D-66: the excerpt's own fiscal label names the column of its own
        // reporting date ("Q2 FY2027" for the three months ended 2026-07-26).
        const aliases = inherited.some((period) => period.kind === "date" && period.key === column.period.key) && (column.window === null || column.window.key === "quarter")
          ? inherited.filter((period) => period.kind === "period").map((period) => period.key)
          : [];
        const dollarCell = column.dollars && quantity.unit === null ? { ...quantity, unit: "currency" as const, dollar: true } : quantity;
        const tableColumn = { scale: column.scale, aliases, date: column.period.key, exceptPerShare: column.exceptPerShare, label: column.label };
        // AI-403: a decimal cell of an "except per share data" table is the per-share line, in dollars, and is never scaled.
        const cell = dollarCell.unit === "currency" && isPerShareCell(dollarCell, tableColumn) ? { ...dollarCell, unit: "currency-per-share" as const } : dollarCell;
        return { quantity: cell, context: own, inherited, inheritedWindows: new Set<string>(), forwardLooking: false, yearEnd, listAmbiguous: false, levelBeforeComparison: false, column: tableColumn,
          span: { source: excerpt.source, asOf: excerpt.asOf, start: body.start + rowStart, end: body.start + quantity.end, text: body.text.slice(rowStart, quantity.end) } };
      }
      const own = context(body.text, quantity, found, true);
      // AI-503: the end of "<direction word> from $A ... to $B" takes the move's metric and direction. The words between $A and "to"
      // ("last quarter", "a year ago") describe $A. Without a governing direction word the end figure keeps its own label.
      const previous = index > 0 ? found[index - 1]! : undefined;
      const head = previous === undefined ? null : moveHead(body.text, previous, quantity, found, own);
      const start = head === null ? null : context(body.text, previous!, found, true).direction;
      if (head !== null && start !== null) {
        // Fix round 1: the words between $A and "to" describe $A, so the end's label is the head plus its own after-text only.
        // Final review (AI-503): so are the periods, windows and fiscal year-end stated there ("from $10.0 billion at fiscal year-end to
        // $8.5 billion"); only those outside [$A's start, $B's start) stay the end's own. Offsets are relative to the clause start.
        const endsOwn = (period: PeriodReference): boolean => period.start < previous!.start - own.start || period.start >= quantity.start - own.start;
        own.periods = own.periods.filter(endsOwn);
        own.bases = own.bases.filter(endsOwn);
        const next = found[index + 1];
        own.label = `${head} ${body.text.slice(quantity.end, next !== undefined && next.start < own.end ? next.start : own.end)}`;
        own.own = `${head} ${own.ownAfter}`;
        own.direction = { ...start, relation: "level" };
      }
      const unitPair = dividendPairs.get(quantity);
      // The printed "TOTAL, or PER-SHARE, of cash dividends paid" shares its
      // trailing metric, but each amount retains its own printed unit/value.
      // AI-305: the appositive's trailing metric is the pair's own description ("including $973 million, or $0.92 per share, of cash dividends paid").
      if (unitPair !== undefined) { own.own = " cash dividends paid"; own.ownAfter = own.own; }
      if (unitPair?.totalStart === quantity.start) own.label += " cash dividends paid";
      const inClause = found.filter((other) => other !== quantity && other.start >= own.start && other.end <= own.end &&
        (other.unit === quantity.unit || other.unit === null || quantity.unit === null));
      const listAmbiguous = /\brespectively\b/i.test(own.text) ||
        /^\s+(?:and|versus|vs\.?)\s+(?:[$€£¥]|[A-Z]{3}\s*)?[-+−]?\d/i.test(body.text.slice(quantity.end)) ||
        inClause.some((other) => {
          const before = found[found.indexOf(other) - 1];
          const lead = body.text.slice(Math.max(own.start, before ? before.end : own.start), other.start);
          return !COMPARATIVE_LEAD.test(lead) && metricTokens(lead, []).length === 0;
        });
      const forwardLooking = FORWARD_LOOKING.test(own.text);
      // AI-503: a comparison base is not a figure of the excerpt's reporting period.
      const noPeriod = forwardLooking || own.base;
      return { quantity, context: own, inherited: noPeriod ? [] : inherited, inheritedWindows: noPeriod ? new Set<string>() : inheritedWindows, forwardLooking, yearEnd, listAmbiguous, ...(unitPair === undefined ? {} : { unitPair }),
        levelBeforeComparison: /^\s*,?\s*(?:up|down|higher|lower)\s+from\b/i.test(body.text.slice(quantity.end)),
        span: { source: excerpt.source, asOf: excerpt.asOf, start: body.start + own.start, end: body.start + own.end, text: own.text } };
    });
  });
}

// Audit 2026-10-27 AI-303-V4 / C-4: "latest" (directly before, or one word before, a period
// or filing noun, so "the latest guidance" is not a recency claim) on a figure from a reported-period
// series (statement, quarterly-trend and segment rows) must be the newest period
// of that series the registry holds. A series is a registry id carrying exactly
// one ISO date that equals the record's own period and is not after its as-of, so
// analyst estimates and projections (periods after the as-of) are never a series.
const RECENCY = /\b(?:latest|most[\s‐‑–—-]+recent|newest)[\s‐‑–—-]+(?:[^\s‐‑–—-]+[\s‐‑–—-]+)?(?:quarter\w*|year\w*|annual\w*|fiscal|FY(?:\s*\d{4})?|Q[1-4]|period\w*|months?|results?|reported|figures?|10-?[QK]|filings?|reports?)\b/i;

/** True when a recency word modifies a period or a filing ("the latest-quarter", "latest FY", "latest 10-Q"). */
export function namesRecency(text: string): boolean {
  return RECENCY.test(text);
}

function reportedSeries(record: NumericProvenanceRecord): { key: string; date: string } | null {
  const dates = record.id.match(/\d{4}-\d{2}-\d{2}/g);
  if (dates === null || dates.length !== 1 || record.period !== dates[0] || !isIsoDate(dates[0])) return null;
  if (isIsoDate(record.asOf) && dates[0] > record.asOf) return null;
  return { key: record.id.replace(dates[0], "*"), date: dates[0] };
}

/** Series key (record id with its date replaced by "*") -> the newest registered date. */
export function reportedSeriesLatest(registry: readonly NumericProvenanceRecord[]): ReadonlyMap<string, string> {
  const latest = new Map<string, string>();
  for (const record of registry) {
    const series = reportedSeries(record);
    if (series !== null && (latest.get(series.key) ?? "") < series.date) latest.set(series.key, series.date);
  }
  return latest;
}

export function validateClaimNumericSupport(claim: SourcedClaim, options: {
  record?: NumericProvenanceRecord;
  excerpts: readonly TextExcerpt[];
  sourceId: string;
  reportingCurrency: string | null;
  ignoreWords?: readonly string[];
  index?: ClaimEvidenceIndex;
  seriesLatest?: ReadonlyMap<string, string>;
}): ClaimNumericSupport {
  const stated = quantities(claim.text);
  if (stated.length === 0) return support(statesNumberWord(claim.text) ? "unchecked" : "cited", "supported",
    "citation observed; factual content not machine-validated");
  const record = options.record;
  if (record !== undefined) {
    if (stated.length !== 1) return support("unchecked", "text-ambiguous", "one numeric record cannot bind multiple prose quantities");
    const quantity = stated[0];
    const typedText = typedClaimContext(claim.text, record);
    if (typedText === null) return support("unchecked", "text-context-mismatch", "prose vote formula does not establish the cited numerator and denominator");
    const own = claimContext(typedText, quantity, stated);
    if ([...own.periods, ...own.bases].some((period) => period.key.startsWith("unestablished-date:"))) {
      return support("unchecked", "period-mismatch", "the prose exact date is invalid or locale-ambiguous");
    }
    const established = new Set([...basisWindows(record), ...labelLooseWindows(record)]);
    const ignore = options.ignoreWords ?? [];
    // D-66: a per-share record's "per share" is its unit, which the prose
    // states with the figure ("USD 0.25 per share"), not in its metric words;
    // an annual growth figure is year over year by definition.
    const perShare = (words: string[]): string[] => record.unit === "currency-per-share" ? words.filter((word) => word !== "share" && word !== "shares") : words;
    // A window the record's basis establishes may be left unstated on either side.
    const unestablished = (words: string[]): string[] => words.filter((word) => ![...established].some((key) => word === `window${key.toLowerCase()}`));
    const claimTokens = perShare(unestablished(metricTokens(own.label, ignore, { loose: true })).filter((word) => !(word === "yoy" && established.has("annual"))));
    const labels = labelReadings(record);
    if (!labels.some((label) => namesMetric(claimTokens, perShare(unestablished(metricTokens(`${label} ${record.period ?? ""}`, ignore)))))) {
      return support("unchecked", "text-context-mismatch", "prose does not identify the metric of the cited numeric record");
    }
    // AI-303-V4: a record citation states one figure, so the whole claim is read.
    const series = namesRecency(typedText) ? reportedSeries(record) : null;
    if (series !== null && (options.seriesLatest?.get(series.key) ?? series.date) > series.date) {
      return support("unchecked", "period-mismatch", "the prose calls the figure the latest, but a later period of the cited series is registered");
    }
    if (own.periods.some((period) => period.kind === "month" && !periodLabels(record.period ?? "").some((source) => source.key === period.key))) {
      return support("unchecked", "period-mismatch", "a monthly prose period is not established by the typed record's period");
    }
    // A named window must be the record's own; a date against a window record
    // names one of its endpoints ("the trailing period ended 2026-07-26").
    const window = recordWindow(record);
    const explicitSpan = explicitLabelSpan(claim.text, record);
    if (window === null && /\b\d{4}-\d{2}-\d{2}\s+to\s+\d{4}-\d{2}-\d{2}\b/i.test(claim.text) && explicitSpan === null) {
      return support("unchecked", "period-mismatch",
        "the cited numeric record does not establish the complete ordered prose date interval");
    }
    const labelled = labelWindows(record);
    const fiscalPeriod = record.fiscalPeriod ?? record.periodContext?.fiscalLabel ?? (/^(?:Q[1-4]\s*)?FY\d{4}$/i.test(record.period ?? "") ? record.period : undefined);
    // Audit 2026-10-27 AI-106 / OD-1: a record with no period establishes only
    // what it carries: its as-of date, a date its period context declares, and
    // a fiscal label it declares (matched only against an FY-style prose label).
    // periodsAgree() is not asked: it accepts any label for a null period.
    const periodlessDates = new Set([
      record.asOf,
      record.periodContext?.kind === "instant" ? record.periodContext.at : record.periodContext?.kind === "duration" ? record.periodContext.end : undefined,
    ].filter((date): date is string => date !== undefined && isIsoDate(date)));
    const FY_LABEL = /^(?:Q[1-4]\s*)?FY\s*\d{4}$/i;
    const periodlessEstablishes = (period: PeriodReference): boolean =>
      (period.kind === "date" && periodlessDates.has(period.key)) ||
      (fiscalPeriod !== undefined && FY_LABEL.test(period.label) && periodsAgree(period.label, fiscalPeriod, fiscalPeriod));
    const periodAgrees = (period: PeriodReference): boolean => period.kind === "window"
      ? established.has(period.key) || labelled.has(period.key) || window?.key === period.key
      : record.period === null ? periodlessEstablishes(period) : periodsAgree(period.label, record.period, fiscalPeriod ?? null) ||
        // A lone date names the window's end; its start counts only inside the
        // complete stated interval (audit 2026-10-27 AI-302, D-82's interval proof).
        (period.kind === "date" && window !== null && (period.key === window.end ||
          (period.key === window.start && own.periods.some((other) => other.kind === "date" && other.key === window.end)))) ||
        (period.kind === "date" && explicitSpan !== null && (period.key === explicitSpan.start || period.key === explicitSpan.end));
    // A record that carries no period cannot contradict a prose period; it can
    // only fail to establish it. That case is decided by periodlessEstablishes
    // above, not by periodsAgree (NVDA final rerun: "DCF base-case year-one
    // revenue growth over trailing revenue is 82.1353%" against a period-less
    // reverse-DCF context record was counted as a contradiction). Audit
    // 2026-10-22 F-22: nor can a record whose period differs. A period, unit or
    // currency the record does not establish leaves the claim unverified;
    // "contradicted" is reserved for a value or sign conflict.
    // AI-402 (fix round 1): a comparison base the claim states must be established by the cited record:
    // only a year-over-year or quarter-over-quarter record measures its figure against a base period.
    const measuredAgainst = own.bases.length > 0 ? comparisonBase(record) : null;
    // A base spelled with "fiscal" ("fiscal 2025", "the second quarter of fiscal 2025") keeps that word: it is not read as a calendar year.
    const baseText = (base: PeriodReference): string =>
      /\bfiscal(?:\s+year)?\s+$/i.test(typedText.slice(Math.max(0, base.start - 20), base.start)) ? `fiscal ${base.raw}` : base.raw;
    if (own.bases.length > 0 && (measuredAgainst === null || !own.bases.every((base) => baseAgrees(baseText(base), measuredAgainst) === true))) {
      return support("unchecked", "period-mismatch", "the cited numeric record does not establish the comparison base the prose names");
    }
    if (own.periods.length > 0 && !own.periods.every(periodAgrees)) {
      const unknownFiscal = fiscalPeriod === undefined && own.periods.some((period) => /\bFY\s*\d{4}\b/i.test(period.label));
      return record.period === null || unknownFiscal
        ? support("unchecked", "period-mismatch", "the cited numeric record carries no compatible period or fiscal basis, so the prose period cannot be checked against it")
        : support("unchecked", "period-mismatch", "prose period is not established by the cited numeric record");
    }
    const direction = own.direction;
    if (direction !== null && (direction.negated || !isDeltaRecord(record) || direction.relation !== "change")) {
      return support("unchecked", "text-context-mismatch", "the cited typed value does not establish the prose directional relation");
    }
    if (direction !== null && record.value !== 0 && direction.polarity !== Math.sign(record.value)) {
      return support("contradicted", "direction-mismatch", "prose direction contradicts the signed change in its cited typed record");
    }
    if (quantity.unit === null) return support("unchecked", "text-ambiguous", "prose quantity has no established unit");
    // A percent can state an explicitly declared unit fraction. A generic
    // ratio (including a P/E multiple) provides no such scale evidence.
    // The per-share basis may be named in the metric words instead of after
    // the figure ("Our DCF per share as of 2026-10-26 is USD 320.63"): it is
    // the record's own unit, not a total (live MSFT check, 2026-10-26).
    const normalizedQuantity = quantity.unit === "percent" && record.unit === "ratio" && record.unitScale === "fraction"
      ? { ...quantity, value: quantity.value / 100, step: quantity.step / 100, unit: "ratio" as const }
      : record.unit === "currency-per-share" && perShareInWords(quantity, own.label) ? { ...quantity, unit: "currency-per-share" as const } : quantity;
    if (normalizedQuantity.unit !== record.unit) return support("unchecked", "unit-mismatch", "prose unit is not established by the cited numeric record");
    if (quantity.unit === "currency" || quantity.unit === "currency-per-share") {
      const currency = resolvedCurrency(quantity, options.reportingCurrency);
      if (currency === null) return support("unchecked", "currency-mismatch", "prose currency is not established");
      if (currency !== record.currency) return support("unchecked", "currency-mismatch", "prose currency is not established by the cited numeric record");
    }
    const signed = direction !== null && normalizedQuantity.value >= 0 ? { ...normalizedQuantity, value: normalizedQuantity.value * direction.polarity } : normalizedQuantity;
    return equalValue(signed, record.value)
      ? support("validated", "supported", "every prose quantity matched its typed cited record; qualitative assertions remain unchecked")
      : support("contradicted", "value-mismatch", "prose quantity contradicts the cited numeric record");
  }
  const excerpts = options.excerpts.filter((excerpt) => excerpt.source === options.sourceId &&
    (claim.label === "JUDGMENT" || excerpt.asOf === claim.asOf));
  const spans: ClaimSourceSpan[] = [];
  for (const quantity of stated) {
    const own = claimContext(claim.text, quantity, stated);
    if ([...own.periods, ...own.bases].some((period) => period.key.startsWith("unestablished-date:"))) {
      return support("unchecked", "period-mismatch", "the prose exact date is invalid or locale-ambiguous", spans);
    }
    if (own.ambiguous || quantity.unit === null) return support("unchecked", "text-ambiguous", "multiple unbound quantities or a missing unit in the prose clause", spans);
    // AI-303 / C-6: a window the claim names is compared as a period (below), not as a metric word.
    const ownWindowTokens = new Set(own.periods.filter((period) => period.kind === "window").map((period) => `window${period.key.toLowerCase()}`));
    const tokens = metricTokens(own.label, options.ignoreWords ?? [], { loose: true }).filter((word) => !ownWindowTokens.has(word));
    // AI-305: the claim names a word of the source figure's own description when the claim's description holds it. The claim's
    // clause ends at "and"/"but"; a connector with no figure after it continues the description, as it does in a source sentence
    // ("invested over USD 76.7 billion in research and development since its inception").
    const named = [...new Set([...tokens, ...metricTokens(context(claim.text, quantity, stated, true).label, options.ignoreWords ?? [], { loose: true })])]
      .filter((word) => !ownWindowTokens.has(word));
    // AI-302-V1 / OD-3: modality must match. Only the figure's own clause decides it, so a result figure never turns forward-looking
    // (and never binds the guide) because a neighbouring clause of the claim says "expects" or "outlook".
    const claimForward = FORWARD_LOOKING.test(own.text);
    const candidates: SourceBinding[] = [];
    const clauseCandidates: SourceBinding[] = [];
    for (const excerpt of excerpts) {
      const bindings = options.index?.get(excerpt) ?? sourceBindings(excerpt);
      options.index?.set(excerpt, bindings);
      for (const binding of bindings) {
        if (binding.forwardLooking !== claimForward) continue;
        // AI-503: a comparison base binds only a comparison base (a claim "increased from USD 25.8 billion" binds the source's base).
        if (binding.context.base !== own.base) continue;
        const sourceTokens = metricTokens(binding.context.label, options.ignoreWords ?? []);
        if (excerptNamesMetric(tokens, sourceTokens, [], [])) clauseCandidates.push(binding);
        if (excerptNamesMetric(tokens, sourceTokens, named, ownDescriptionTokens(binding.context.own, options.ignoreWords ?? []), ownDescriptionTokens(binding.context.ownAfter, options.ignoreWords ?? []))) candidates.push(binding);
      }
    }
    // AI-305: the same judgement runs over the clause-rule candidates alone and over the own-description-filtered ones. The own description
    // can only leave a claim unchecked: when it would give a different result from the clause rule alone, the claim is unchecked.
    const judge = (pool: SourceBinding[]): ClaimNumericSupport | { span: ClaimSourceSpan } => {
      if (pool.some((candidate) => candidate.context.periods.some((period) => period.key.startsWith("unestablished-date:")))) {
        return support("unchecked", "period-mismatch", "the source exact date is invalid or locale-ambiguous", pool.slice(0, 3).map((candidate) => candidate.span));
      }
      // A clause that names no period is read under the excerpt's own (D-63);
      // one that names a period must name exactly the stated one, as before.
      // D-66: a table cell is named by its column's date (with the window its
      // header states, when it states one) or by the excerpt's fiscal label for
      // that column; it is never read under the excerpt's period alone.
      // AI-303-V3: a fiscal year-end claim naming the date of an FY or Q4 excerpt's own reporting date
      // (its asOf) has its year-end read from the excerpt's title; any other date needs the clause to say so.
      const withoutTitleYearEnd = (candidate: SourceBinding, date: string | undefined): PeriodReference[] =>
        candidate.yearEnd && date !== undefined && date === candidate.span.asOf ? own.periods.filter((period) => period.key !== "FYE") : own.periods;
      const columnMatches = (candidate: SourceBinding, column: NonNullable<SourceBinding["column"]>): boolean => {
        const keys = new Set(candidate.context.periods.map((period) => period.key));
        const ownPeriods = withoutTitleYearEnd(candidate, column.date);
        if (ownPeriods.length === 0 || !ownPeriods.every((period) => keys.has(period.key) || column.aliases.includes(period.key))) return false;
        // A date alone names the column; when the header repeats the date
        // under another window, both columns match and the reading stays ambiguous.
        return ownPeriods.some((period) => column.aliases.includes(period.key) || (period.kind === "date" && keys.has(period.key)));
      };
      const clauseMatches = (candidate: SourceBinding): boolean => {
        const ownPeriods = withoutTitleYearEnd(candidate, candidate.context.periods.find((period) => period.kind === "date")?.key);
        return ownPeriods.every((period) => candidate.context.periods.some((source) => source.key === period.key)) &&
          candidate.context.periods.every((period) => ownPeriods.some((stated) => stated.key === period.key));
      };
      // AI-402: a base the claim names must be a base the source clause names; a table cell names none.
      const basesMatch = (candidate: SourceBinding): boolean => own.bases.every((base) => candidate.context.bases.some((source) => source.key === base.key));
      const periodFilter = (list: SourceBinding[]): SourceBinding[] => list.filter((candidate) => candidate.column !== undefined
        ? own.bases.length === 0 && columnMatches(candidate, candidate.column)
        : basesMatch(candidate) && (candidate.context.periods.length > 0
          ? clauseMatches(candidate)
          : own.periods.every((period) => period.kind === "window" ? candidate.inheritedWindows.has(period.key)
            : candidate.inherited.some((source) => source.key === period.key))));
      let matchingPeriods = periodFilter(pool);
      if (matchingPeriods.length === 0) {
        // One stated other period is a period mismatch (unverified, F-22); a
        // flattened table's header of several periods binds no column.
        if (own.periods.length > 0 && pool.length === 1 && pool[0].context.periods.length === 1) {
          return support("unchecked", "period-mismatch", "the uniquely bound source figure is for another period", [pool[0].span]);
        }
        return support("unchecked", "text-context-mismatch", "no source quantity establishes the metric and period", spans);
      }
      // A total and its per-share restatement are told apart by the unit the prose prints.
      const unitPair = matchingPeriods[0]?.unitPair;
      const reducePair = (list: SourceBinding[]): SourceBinding[] => {
        if (unitPair === undefined || !list.every((candidate) => candidate.unitPair === unitPair)) return list;
        const sameUnit = list.filter((candidate) => candidate.quantity.unit === quantity.unit);
        return sameUnit.length > 0 ? sameUnit : list;
      };
      matchingPeriods = reducePair(matchingPeriods);
      const directionOf = (binding: SourceBinding): QuantityDirection | null => binding.levelBeforeComparison ? null : binding.context.direction;
      const distinctOf = (list: SourceBinding[]): Set<string> => new Set(list.map((candidate) => {
        const multiplier = tableScaleFor(candidate.quantity, candidate.column);
        return JSON.stringify([
          candidate.quantity.value * multiplier, candidate.quantity.step * multiplier,
          candidate.quantity.unit, resolvedCurrency(candidate.quantity, options.reportingCurrency), candidate.context.periods.map((period) => period.key),
          directionOf(candidate), candidate.quantity.bound, candidate.quantity.strict,
        ]);
      }));
      const distinct = distinctOf(matchingPeriods);
      // A window with its year or date ("the first half of fiscal year 2027") is one period, not two.
      if (distinct.size !== 1 || matchingPeriods.some((candidate) => candidate.listAmbiguous ||
        (candidate.column === undefined && (candidate.context.periods.filter((period) => period.kind !== "window").length > 1 ||
          candidate.context.periods.filter((period) => period.kind === "window").length > 1)))) {
        return support("unchecked", "text-ambiguous", "multiple source values, periods or columns could bind the prose quantity", matchingPeriods.slice(0, 3).map((candidate) => candidate.span));
      }
      const bound = matchingPeriods[0];
      if (matchingPeriods.some((candidate) => candidate.column?.scale === null)) {
        return support("unchecked", "text-ambiguous", "the bound table header carries conflicting scale declarations", matchingPeriods.slice(0, 3).map((candidate) => candidate.span));
      }
      // A header's scale defines the source amount regardless of whether prose
      // spells its amount with a scale word or with all digits.
      const tableScale = tableScaleFor(bound.quantity, bound.column);
      const candidate = tableScale !== 1
        ? { ...bound, quantity: { ...bound.quantity, value: bound.quantity.value * tableScale, step: bound.quantity.step * tableScale } }
        : bound;
      const sourceDirection = directionOf(candidate);
      if (own.direction?.negated || sourceDirection?.negated || (own.direction === null) !== (sourceDirection === null)) {
        return support("unchecked", "text-context-mismatch", "the source does not establish the prose directional relation", [candidate.span]);
      }
      if (own.direction !== null && sourceDirection !== null) {
        if (own.direction.polarity !== sourceDirection.polarity) return support("contradicted", "direction-mismatch", "the prose directional relation contradicts its bound source span", [candidate.span]);
        if (own.direction.relation !== sourceDirection.relation) return support("unchecked", "text-context-mismatch", "a change magnitude and a resulting level are different numeric relations", [candidate.span]);
      }
      if (candidate.quantity.unit === null) return support("unchecked", "text-ambiguous", "the source figure's unit is not established", [candidate.span]);
      // AI-403: as on the record path, the per-share basis may be named in the claim's words rather than after the figure. Only a
      // cell whose own row lead names a per-share basis takes it: a table declaration ("except per share data") is a scale rule,
      // never the row's description, and a decimal cell it relabels per-share is not thereby a per-share row.
      const claimed = candidate.quantity.unit === "currency-per-share" && candidate.column !== undefined &&
        /\bper[\s-]+share\b|\beps\b/i.test(rowLead(candidate.column.label)) && perShareInWords(quantity, own.label)
        ? { ...quantity, unit: "currency-per-share" as const } : quantity;
      if (candidate.quantity.unit !== claimed.unit) return support("unchecked", "unit-mismatch", "the bound source figure uses another unit", [candidate.span]);
      if (claimed.unit === "currency" || claimed.unit === "currency-per-share") {
        const currency = resolvedCurrency(claimed, options.reportingCurrency);
        const sourceCurrency = resolvedCurrency(candidate.quantity, options.reportingCurrency);
        if (currency === null || sourceCurrency === null) return support("unchecked", "currency-mismatch", "the source or prose currency is not established", [candidate.span]);
        if (currency !== sourceCurrency) return support("unchecked", "currency-mismatch", "the bound source figure uses another currency", [candidate.span]);
      }
      // AI-409: a source bound ("less than 1%", "over $76.7 billion") is not the exact figure, and a bound the source does not state is not either.
      if (!boundSupports(quantity, candidate.quantity)) {
        return support("unchecked", "text-context-mismatch", "the source states only a bound, or the prose states a bound the source does not imply", [candidate.span]);
      }
      if (Math.abs(quantity.value - candidate.quantity.value) > (quantity.step + candidate.quantity.step) / 2 +
        1e-10 * Math.max(1, Math.abs(candidate.quantity.value))) {
        return support("contradicted", "value-mismatch", "prose quantity contradicts the uniquely bound source figure", [candidate.span]);
      }
      if (quantity.step < candidate.quantity.step / 1.001) return support("unchecked", "text-ambiguous", "prose states more precision than the source establishes", [candidate.span]);
      if (!equalValue(quantity, candidate.quantity.value)) return support("unchecked", "text-ambiguous", "printed rounding intervals overlap without establishing the claimed value", [candidate.span]);
      return { span: candidate.span };
    };
    const byClause = judge(clauseCandidates);
    const byOwn = candidates.length === clauseCandidates.length ? byClause : judge(candidates);
    const statusOf = (result: ClaimNumericSupport | { span: ClaimSourceSpan }): ClaimNumericSupport["status"] => "span" in result ? "validated" : result.status;
    let outcome: ClaimNumericSupport | { span: ClaimSourceSpan };
    if (statusOf(byOwn) === "unchecked") outcome = byOwn;
    else if (statusOf(byOwn) === statusOf(byClause)) outcome = byClause;
    else if (statusOf(byClause) === "unchecked") outcome = byClause;
    else outcome = support("unchecked", "text-ambiguous", "the clause rule and the figure's own description disagree", spans);
    if (!("span" in outcome)) return outcome;
    spans.push(outcome.span);
  }
  return support("validated", "supported", "every prose quantity matched its source metric, unit and stated period; qualitative assertions remain unchecked", spans);
}
