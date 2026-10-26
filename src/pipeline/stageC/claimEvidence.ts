/** Conservative numeric support for prose. A citation alone never proves a fact. */
import type { SourcedClaim } from "@/report/schema";
import type { TextExcerpt } from "@/pipeline/stageC/payload";
import { findDirectionWords, isDeltaRecord, proseQuantityText, quantityDirection, statesNumberWord, type QuantityDirection } from "@/pipeline/stageC/consistency";
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
}
const SCALES: Record<string, number> = { k: 1e3, thousand: 1e3, thousands: 1e3, m: 1e6, mm: 1e6, million: 1e6, millions: 1e6,
  b: 1e9, bn: 1e9, billion: 1e9, billions: 1e9, trillion: 1e12, trillions: 1e12 };
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
/** D-66: "was negative USD 23.2 billion" states the sign in a word. */
const SIGN_WORD = /\b(?:negative|minus)\s+$/i;

function quantities(text: string): Quantity[] {
  const masked = proseQuantityText(text).replace(WINDOW_LABEL, (match) => " ".repeat(match.length));
  // TracedNumber excerpts declare their display scale before the metric,
  // e.g. "USD millions: Cash ... USD 56,586". That explicit declaration is
  // distinct from a claim that simply copies "$56,586" out of a scaled table.
  const declaredMoneyScale = new RegExp(String.raw`^\s*(?:${CURRENCIES}|currency)\s+(thousands?|millions?|billions?|trillions?):`, "i").exec(text)?.[1];
  const pattern = new RegExp(String.raw`(?<prefix>US\$|[$€£¥]|(?:${CURRENCIES})\s*)?\s*(?<sign>[-+−])?\s*(?<digits>\d{1,3}(?:,\d{3})+|\d+)(?<fraction>\.\d+)?\s*(?<scale>thousands?|millions?|billions?|trillions?|bn|mm|k|m|b)?\s*(?<unit>%|percentage points?|percent|bps?|basis points?|pps?|dollars?|shares?|days?|people|users|subscribers|count|times|x|per share|score)?`, "gi");
  const scaled: { start: number; end: number }[] = [];
  return [...masked.matchAll(pattern)].flatMap((match) => {
    const groups = match.groups!;
    let start = match.index + match[0].search(/\S/);
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
    if (signWord !== null && !groups.sign) start -= signWord[0].length;
    const scale = SCALES[(groups.scale ?? (groups.prefix ? declaredMoneyScale : undefined) ?? "").toLowerCase()] ?? 1;
    const token = (groups.unit ?? "").toLowerCase();
    const prefix = (groups.prefix ?? "").trim();
    let unit: CanonicalUnit | null = /^(?:%|percent)$/.test(token) ? "percent"
      : /^(?:pp|pps|percentage point|percentage points|bp|bps|basis point|basis points)$/.test(token) ? "percentage-points"
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
    const factor = /^(?:bp|bps|basis point|basis points)$/.test(token) ? 0.01 : 1;
    const decimals = (groups.fraction ?? "").length > 0 ? groups.fraction.length - 1 : 0;
    // Accounting parentheses enclose the complete amount (including currency
    // and unit); they are part of its sign, not disposable prose punctuation.
    const accountingNegative = /\(\s*$/.test(masked.slice(0, start)) && /^\s*\)/.test(masked.slice(end));
    return [{ start, end, value: (groups.sign === "-" || groups.sign === "−" || accountingNegative || signWord !== null ? -1 : 1) *
      Number(groups.digits.replace(/,/g, "") + (groups.fraction ?? "")) * scale * factor,
    step: 10 ** -decimals * scale * factor, unit, currency, dollar: prefix === "$" || /^dollars?$/.test(token),
    scaled: groups.scale !== undefined || Boolean(groups.prefix && declaredMoneyScale !== undefined) }];
  });
}

interface PeriodReference { key: string; label: string; raw: string; kind: "date" | "month" | "period" | "window" }
interface Context { start: number; end: number; text: string; label: string; periods: PeriodReference[]; ambiguous: boolean; direction: QuantityDirection | null }
interface SourceBinding {
  quantity: Quantity; context: Context; span: ClaimSourceSpan;
  /**
   * D-63: the periods the excerpt itself states (its reporting period, fiscal
   * quarter or event date, from the title), which a clause that names no
   * period of its own is read under. "Inventory was $31.6 billion" in the Q2
   * FY2027 CFO commentary is the quarter's inventory.
   */
  inherited: PeriodReference[];
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
  column?: { scale: number | null; aliases: string[] };
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
function periodLabels(text: string): PeriodReference[] {
  let rest = text.replace(COMPARISON_BASIS, (match) => " ".repeat(match.length));
  const out: PeriodReference[] = [];
  const take = (pattern: RegExp, read: (match: RegExpMatchArray) => Omit<PeriodReference, "raw">): void => {
    rest = rest.replace(pattern, (...args: unknown[]) => {
      const match = args as unknown as RegExpMatchArray;
      out.push({ raw: match[0], ...read(match) });
      return " ".repeat(match[0].length);
    });
  };
  const dated = (year: string, month: number, day: string): Omit<PeriodReference, "raw"> => {
    const iso = `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
    return { kind: "date", label: iso, key: isIsoDate(iso) ? iso : `unestablished-date:${iso}` };
  };
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
  return out;
}
const HARD_BOUNDARY = /;|\n|•|[.!?](?=\s+[A-Z“"(])/g;
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
  // A lock-up restriction names an asset constraint, not an upward change.
  // Keep offsets and every actual change/negation word for direction binding.
  const directionText = ownText.replace(/\block[‐‑–—-]up\b/gi, (match) => match.slice(0, -2) + "xx");
  return { start, end, text: ownText, label, periods: periodLabels(ownText),
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
// quarter end", "ROIC (latest)"). The period itself is checked separately, and
// a named window (TTM, YTD, "for the quarter") stays a metric token. "Current"
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
function metricTokens(label: string, ignore: readonly string[]): string[] {
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
  for (const period of periodLabels(metric)) metric = metric.replace(period.raw, period.kind === "window" ? ` window${period.key} ` : " ");
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
  const basis = record.periodContext?.basis;
  if (basis === "fiscal-quarter") windows.add("quarter");
  if (basis === "fiscal-year") windows.add("annual");
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
 * context ("…is cumulatively capped at $105 billion for its initial commitment
 * under the Agreements"), which demanding in the claim failed every figure a
 * filing states in a sentence (NVDA, 2026-10-15: six correct figures untraced).
 */
const DEFINITION_MODIFIERS = new Set(["gaap", "non-gaap", "net", "adjusted", "excluding", "exclude", "excludes", "ex", "pro-forma", "proforma",
  "organic", "underlying", "core", "normalized", "diluted", "basic", "gross", "operating", "pre-tax", "pretax", "after-tax",
  "segment", "not", "no", "without", "constant", "incremental", "cumulative", "average"]);
function excerptNamesMetric(claim: string[], source: string[]): boolean {
  if (claim.length === 0 || source.length === 0) return false;
  const stem = (word: string): string => word.length > 3 ? word.replace(/s$/, "") : word;
  const inClaim = (word: string): boolean => claim.some((other) => stem(word) === stem(other));
  return claim.every((word) => source.some((other) => stem(word) === stem(other))) &&
    source.every((word) => !DEFINITION_MODIFIERS.has(word) || inClaim(word));
}
const COMPARATIVE_LEAD = /^[\s,;(]*(?:(?:up|down|higher|lower|increas\w*|decreas\w*|rose|fell|compared)\s+)?(?:from|with|versus|vs\.?|compared (?:to|with)|against)[\s:]*$/i;
/** The excerpt's own period statements: its reporting period, fiscal quarter, quarter end or event date — never its filing date or accession. */
function excerptPeriods(excerpt: TextExcerpt): PeriodReference[] {
  const title = excerpt.title
    .replace(/\bfiled \d{4}-\d{2}-\d{2}\b/gi, " ")
    .replace(/\b\d{10}-\d{2}-\d{6}\b/g, " ");
  return periodLabels(title).filter((period) => period.kind === "date" || period.kind === "period");
}

const HEADER_DATE = new RegExp(String.raw`\b(?:${MONTH_NAMES})\.?\s+\d{1,2},?\s+(?:19|20)\d{2}\b|\b\d{4}-\d{2}-\d{2}\b`, "gi");

interface TableColumn { label: string; period: PeriodReference; window: PeriodReference | null; scale: number | null; dollars: boolean; rowStart: number }
/** A table header's change column ("$ Change", "% Change"), which binds no period. */
const CHANGE_COLUMN = /^[\s,|]*(?:[$%]\s*)?Change\b/i;
const MONTHS_ENDED = /\b(Three|Six|Nine)\s+Months\s+Ended\b/gi;
const TABLE_SCALE = /\(\s*(?:\$\s*)?in\s+(thousands|millions|billions)(?:,[^)]{0,40})?\s*\)/gi;
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
      // "($ in millions)" makes every cell of the table dollars, not only the first row's.
      const dollars = declarations.some((match) => /\$/.test(match[0]));
      for (let c = 0; c < k; c++) {
        const column = header.columns[c];
        const period = column ? periodLabels(column.date)[0] : undefined;
        if (column && period !== undefined) {
          out.set(found[q + c]!, { label: lead, period, window: windows[repeatedRuns ? Math.floor(c / runWidth) : column.run] ?? null, scale, dollars, rowStart: Math.max(prevEnd, header.end) });
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
    return found.map((quantity) => {
      const column = columns.get(quantity);
      if (column !== undefined) {
        // A table cell: its row label and its column's date (and the window
        // its header names), no list reading.
        const periods = column.window === null ? [column.period] : [column.period, column.window];
        // The header's window is part of the cell's description, as a prose window is of its clause's.
        const label = column.window === null ? column.label : `${column.label} ${column.window.raw}`;
        const own = { ...context(body.text, quantity, found), label, periods, ambiguous: false, direction: null };
        const rowStart = column.rowStart + (body.text.slice(column.rowStart).length - body.text.slice(column.rowStart).trimStart().length);
        // D-66: the excerpt's own fiscal label names the column of its own
        // reporting date ("Q2 FY2027" for the three months ended 2026-07-26).
        const aliases = inherited.some((period) => period.kind === "date" && period.key === column.period.key) && (column.window === null || column.window.key === "quarter")
          ? inherited.filter((period) => period.kind === "period").map((period) => period.key)
          : [];
        const cell = column.dollars && quantity.unit === null ? { ...quantity, unit: "currency" as const, dollar: true } : quantity;
        return { quantity: cell, context: own, inherited, listAmbiguous: false, levelBeforeComparison: false, column: { scale: column.scale, aliases },
          span: { source: excerpt.source, asOf: excerpt.asOf, start: body.start + rowStart, end: body.start + quantity.end, text: body.text.slice(rowStart, quantity.end) } };
      }
      const own = context(body.text, quantity, found, true);
      const unitPair = dividendPairs.get(quantity);
      // The printed "TOTAL, or PER-SHARE, of cash dividends paid" shares its
      // trailing metric, but each amount retains its own printed unit/value.
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
      return { quantity, context: own, inherited, listAmbiguous, ...(unitPair === undefined ? {} : { unitPair }),
        levelBeforeComparison: /^\s*,?\s*(?:up|down|higher|lower)\s+from\b/i.test(body.text.slice(quantity.end)),
        span: { source: excerpt.source, asOf: excerpt.asOf, start: body.start + own.start, end: body.start + own.end, text: own.text } };
    });
  });
}

export function validateClaimNumericSupport(claim: SourcedClaim, options: {
  record?: NumericProvenanceRecord;
  excerpts: readonly TextExcerpt[];
  sourceId: string;
  reportingCurrency: string | null;
  ignoreWords?: readonly string[];
  index?: ClaimEvidenceIndex;
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
    const own = context(typedText, quantity, stated);
    if (own.periods.some((period) => period.key.startsWith("unestablished-date:"))) {
      return support("unchecked", "period-mismatch", "the prose exact date is invalid or locale-ambiguous");
    }
    const established = basisWindows(record);
    const ignore = options.ignoreWords ?? [];
    // D-66: a per-share record's "per share" is its unit, which the prose
    // states with the figure ("USD 0.25 per share"), not in its metric words;
    // an annual growth figure is year over year by definition.
    const perShare = (words: string[]): string[] => record.unit === "currency-per-share" ? words.filter((word) => word !== "share" && word !== "shares") : words;
    // A window the record's basis establishes may be left unstated on either side.
    const unestablished = (words: string[]): string[] => words.filter((word) => ![...established].some((key) => word === `window${key.toLowerCase()}`));
    const claimTokens = perShare(unestablished(metricTokens(own.label, ignore)).filter((word) => !(word === "yoy" && established.has("annual"))));
    const labels = labelReadings(record);
    if (!labels.some((label) => namesMetric(claimTokens, perShare(unestablished(metricTokens(`${label} ${record.period ?? ""}`, ignore)))))) {
      return support("unchecked", "text-context-mismatch", "prose does not identify the metric of the cited numeric record");
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
    const periodAgrees = (period: PeriodReference): boolean => period.kind === "window"
      ? established.has(period.key) || labelled.has(period.key) || window?.key === period.key
      : periodsAgree(period.label, record.period, fiscalPeriod ?? null) ||
        (period.kind === "date" && window !== null && (period.key === window.end || period.key === window.start)) ||
        (period.kind === "date" && explicitSpan !== null && (period.key === explicitSpan.start || period.key === explicitSpan.end));
    // A record that carries no period cannot contradict a prose period; it can
    // only fail to establish it (NVDA final rerun: "DCF base-case year-one
    // revenue growth over trailing revenue is 82.1353%" against a period-less
    // reverse-DCF context record was counted as a contradiction). Audit
    // 2026-10-22 F-22: nor can a record whose period differs. A period, unit or
    // currency the record does not establish leaves the claim unverified;
    // "contradicted" is reserved for a value or sign conflict.
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
    const normalizedQuantity = quantity.unit === "percent" && record.unit === "ratio" && record.unitScale === "fraction"
      ? { ...quantity, value: quantity.value / 100, step: quantity.step / 100, unit: "ratio" as const } : quantity;
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
    const own = context(claim.text, quantity, stated);
    if (own.periods.some((period) => period.key.startsWith("unestablished-date:"))) {
      return support("unchecked", "period-mismatch", "the prose exact date is invalid or locale-ambiguous", spans);
    }
    if (own.ambiguous || quantity.unit === null) return support("unchecked", "text-ambiguous", "multiple unbound quantities or a missing unit in the prose clause", spans);
    const tokens = metricTokens(own.label, options.ignoreWords ?? []);
    const candidates: SourceBinding[] = [];
    for (const excerpt of excerpts) {
      const bindings = options.index?.get(excerpt) ?? sourceBindings(excerpt);
      options.index?.set(excerpt, bindings);
      for (const binding of bindings) {
        if (excerptNamesMetric(tokens, metricTokens(binding.context.label, options.ignoreWords ?? []))) candidates.push(binding);
      }
    }
    if (candidates.some((candidate) => candidate.context.periods.some((period) => period.key.startsWith("unestablished-date:")))) {
      return support("unchecked", "period-mismatch", "the source exact date is invalid or locale-ambiguous", candidates.slice(0, 3).map((candidate) => candidate.span));
    }
    // A clause that names no period is read under the excerpt's own (D-63);
    // one that names a period must name exactly the stated one, as before.
    // D-66: a table cell is named by its column's date (with the window its
    // header states, when it states one) or by the excerpt's fiscal label for
    // that column; it is never read under the excerpt's period alone.
    const columnMatches = (candidate: SourceBinding, column: NonNullable<SourceBinding["column"]>): boolean => {
      const keys = new Set(candidate.context.periods.map((period) => period.key));
      if (own.periods.length === 0 || !own.periods.every((period) => keys.has(period.key) || column.aliases.includes(period.key))) return false;
      // A date alone names the column; when the header repeats the date
      // under another window, both columns match and the reading stays ambiguous.
      return own.periods.some((period) => column.aliases.includes(period.key) || (period.kind === "date" && keys.has(period.key)));
    };
    let matchingPeriods = candidates.filter((candidate) => candidate.column !== undefined
      ? columnMatches(candidate, candidate.column)
      : candidate.context.periods.length > 0
        ? own.periods.every((period) => candidate.context.periods.some((source) => source.key === period.key)) &&
          candidate.context.periods.every((period) => own.periods.some((stated) => stated.key === period.key))
        : own.periods.every((period) => candidate.inherited.some((source) => source.key === period.key)));
    if (matchingPeriods.length === 0) {
      // One stated other period is a period mismatch (unverified, F-22); a
      // flattened table's header of several periods binds no column.
      if (own.periods.length > 0 && candidates.length === 1 && candidates[0].context.periods.length === 1) {
        return support("unchecked", "period-mismatch", "the uniquely bound source figure is for another period", [candidates[0].span]);
      }
      return support("unchecked", "text-context-mismatch", "no source quantity establishes the metric and period", spans);
    }
    const unitPair = matchingPeriods[0]?.unitPair;
    if (unitPair !== undefined && matchingPeriods.every((candidate) => candidate.unitPair === unitPair)) {
      const sameUnit = matchingPeriods.filter((candidate) => candidate.quantity.unit === quantity.unit);
      if (sameUnit.length > 0) matchingPeriods = sameUnit;
    }
    const directionOf = (binding: SourceBinding): QuantityDirection | null => binding.levelBeforeComparison ? null : binding.context.direction;
    const distinct = new Set(matchingPeriods.map((candidate) => {
      const multiplier = candidate.quantity.scaled ? 1 : candidate.column?.scale ?? 1;
      return JSON.stringify([
        candidate.quantity.value * multiplier, candidate.quantity.step * multiplier,
        candidate.quantity.unit, resolvedCurrency(candidate.quantity, options.reportingCurrency), candidate.context.periods.map((period) => period.key),
        directionOf(candidate),
      ]);
    }));
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
    const tableScale = bound.column?.scale ?? 1;
    const candidate = tableScale !== 1 && !bound.quantity.scaled
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
    if (candidate.quantity.unit !== quantity.unit) return support("unchecked", "unit-mismatch", "the bound source figure uses another unit", [candidate.span]);
    if (quantity.unit === "currency" || quantity.unit === "currency-per-share") {
      const currency = resolvedCurrency(quantity, options.reportingCurrency);
      const sourceCurrency = resolvedCurrency(candidate.quantity, options.reportingCurrency);
      if (currency === null || sourceCurrency === null) return support("unchecked", "currency-mismatch", "the source or prose currency is not established", [candidate.span]);
      if (currency !== sourceCurrency) return support("unchecked", "currency-mismatch", "the bound source figure uses another currency", [candidate.span]);
    }
    if (Math.abs(quantity.value - candidate.quantity.value) > (quantity.step + candidate.quantity.step) / 2 +
      1e-10 * Math.max(1, Math.abs(candidate.quantity.value))) {
      return support("contradicted", "value-mismatch", "prose quantity contradicts the uniquely bound source figure", [candidate.span]);
    }
    if (quantity.step < candidate.quantity.step / 1.001) return support("unchecked", "text-ambiguous", "prose states more precision than the source establishes", [candidate.span]);
    if (!equalValue(quantity, candidate.quantity.value)) return support("unchecked", "text-ambiguous", "printed rounding intervals overlap without establishing the claimed value", [candidate.span]);
    spans.push(candidate.span);
  }
  return support("validated", "supported", "every prose quantity matched its source metric, unit and stated period; qualitative assertions remain unchecked", spans);
}
