/** Conservative numeric support for prose. A citation alone never proves a fact. */
import type { SourcedClaim } from "@/report/schema";
import type { TextExcerpt } from "@/pipeline/stageC/payload";
import { findDirectionWords, isDeltaRecord, proseQuantityText, quantityDirection, statesNumberWord, type QuantityDirection } from "@/pipeline/stageC/consistency";
import { isIsoDate, periodsAgree, type CanonicalUnit, type NumericProvenanceRecord, type ProvenanceFailureReason } from "@/pipeline/stageC/provenance";

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
}
const SCALES: Record<string, number> = { k: 1e3, thousand: 1e3, thousands: 1e3, m: 1e6, mm: 1e6, million: 1e6, millions: 1e6,
  b: 1e9, bn: 1e9, billion: 1e9, billions: 1e9, trillion: 1e12, trillions: 1e12 };
const CURRENCIES = "USD|EUR|GBP|JPY|CNY|RMB|HKD|KRW|INR|CHF|CAD|AUD|NZD|TWD|SEK|NOK|DKK|BRL|MXN|ZAR|SGD|ILS";
const DOLLARS = new Set(["USD", "CAD", "AUD", "NZD", "SGD", "HKD"]);

function quantities(text: string): Quantity[] {
  const masked = proseQuantityText(text);
  const pattern = new RegExp(String.raw`(?<prefix>US\$|[$€£¥]|(?:${CURRENCIES})\s*)?\s*(?<sign>[-+−])?\s*(?<digits>\d{1,3}(?:,\d{3})+|\d+)(?<fraction>\.\d+)?\s*(?<scale>thousands?|millions?|billions?|trillions?|bn|mm|k|m|b)?\s*(?<unit>%|percentage points?|percent|bps?|basis points?|pps?|dollars?|shares?|people|users|subscribers|count|times|x|per share)?`, "gi");
  return [...masked.matchAll(pattern)].flatMap((match) => {
    const groups = match.groups!;
    const start = match.index + match[0].search(/\S/);
    const end = match.index + match[0].trimEnd().length;
    const before = masked.slice(Math.max(0, start - 1), start);
    const after = masked.slice(end, end + 1);
    if (/[A-Za-z0-9]/.test(before) || /[A-Za-z0-9]/.test(after)) return [];
    const scale = SCALES[(groups.scale ?? "").toLowerCase()] ?? 1;
    const token = (groups.unit ?? "").toLowerCase();
    const prefix = (groups.prefix ?? "").trim();
    let unit: CanonicalUnit | null = /^(?:%|percent)$/.test(token) ? "percent"
      : /^(?:pp|pps|percentage point|percentage points|bp|bps|basis point|basis points)$/.test(token) ? "percentage-points"
        : /^(?:x|times)$/.test(token) ? "ratio"
          : /^shares?$/.test(token) ? "shares"
            : /^(?:people|users|subscribers|count)$/.test(token) ? "count" : null;
    if (unit === null && /\b(?:people|users|subscribers)\b/i.test(text.slice(Math.max(0, start - 90), start))) unit = "count";
    let currency: string | null = null;
    if (prefix || /^dollars?$/.test(token)) {
      unit = token === "per share" ? "currency-per-share" : "currency";
      currency = /^[A-Z]{3}$/i.test(prefix) ? prefix.toUpperCase()
        : prefix === "US$" ? "USD" : prefix === "€" ? "EUR" : prefix === "£" ? "GBP" : null;
    }
    const factor = /^(?:bp|bps|basis point|basis points)$/.test(token) ? 0.01 : 1;
    const decimals = (groups.fraction ?? "").length > 0 ? groups.fraction.length - 1 : 0;
    // Accounting parentheses enclose the complete amount (including currency
    // and unit); they are part of its sign, not disposable prose punctuation.
    const accountingNegative = /\(\s*$/.test(masked.slice(0, start)) && /^\s*\)/.test(masked.slice(end));
    return [{ start, end, value: (groups.sign === "-" || groups.sign === "−" || accountingNegative ? -1 : 1) *
      Number(groups.digits.replace(/,/g, "") + (groups.fraction ?? "")) * scale * factor,
    step: 10 ** -decimals * scale * factor, unit, currency, dollar: prefix === "$" || /^dollars?$/.test(token) }];
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
}
/** Run-local memo; never retained across reports, payloads or source revisions. */
export type ClaimEvidenceIndex = Map<TextExcerpt, SourceBinding[]>;
const MONTHS: Readonly<Record<string, number>> = { january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12 };
const MONTH_NAMES = "January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sept|Sep|October|Oct|November|Nov|December|Dec";
function periodLabels(text: string): PeriodReference[] {
  let rest = text;
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
function context(text: string, quantity: Quantity, all: Quantity[]): Context {
  let start = 0;
  let end = text.length;
  for (const boundary of text.matchAll(/;|\n|•|[.!?](?=\s+[A-Z“"(])|,?\s+\b(?:while|whereas|versus|vs\.?|but|and)\s+/g)) {
    const at = boundary.index;
    const connector = /\b(?:while|whereas|versus|vs|but|and)\b/.test(boundary[0]);
    if (connector && !all.some((other) => other.start >= start && other.end <= at)) continue;
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
  return { start, end, text: ownText, label, periods: periodLabels(ownText),
    direction: quantityDirection(ownText, quantity.start - start, quantity.end - start,
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
  "company", "firm", "firmwide", "remained", "recorded", "stood", "reached", "compared", "during", "versus", "while",
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
};
function metricTokens(label: string, ignore: readonly string[]): string[] {
  let metric = label;
  for (const period of periodLabels(label)) metric = metric.replace(period.raw, period.kind === "window" ? ` window${period.key} ` : " ");
  // Preserve negative compounds as definitions. Splitting non-GAAP into two
  // words would let a GAAP claim reuse the GAAP substring of its opposite.
  metric = metric.toLowerCase().replace(/\bnon[\s‐‑–—-]+(?=[a-z])/g, "non-").replace(/[‐‑–—]/g, "-");
  const ignored = new Set([...ignore.flatMap((word) => word.toLowerCase().match(/[a-z0-9]+/g) ?? []),
    ...findDirectionWords(metric).map((hit) => hit.word), ...CURRENCIES.toLowerCase().split("|")]);
  const tokens = (metric.match(/[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*/g) ?? []).flatMap((word) => ABBREVIATIONS[word] ?? [word]);
  // A hyphenated ignored name ("Jen-Hsun") is ignored as a whole.
  return [...new Set(tokens.filter((word) => !METRIC_GRAMMAR.has(word) && !PERIOD_DESCRIPTORS.has(word) && !ignored.has(word) &&
    !(word.includes("-") && word.split("-").every((part) => ignored.has(part)))))];
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
/** A typed record's "<basis>: <start> to <end>" window. */
function recordWindow(record: NumericProvenanceRecord): { key: string; start: string; end: string } | null {
  const match = /^\s*(ttm|ltm|ytd)\s*:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\s*$/i.exec(record.period ?? "");
  return match ? { key: match[1].toLowerCase() === "ytd" ? "YTD" : "TTM", start: match[2], end: match[3] } : null;
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
const DEFINITION_MODIFIERS = new Set(["non-gaap", "adjusted", "excluding", "exclude", "excludes", "ex", "pro-forma", "proforma",
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

/**
 * D-63: column bindings of a flattened statement table ("Jul 26, 2026 Jan 25,
 * 2026 (In millions) Cash and cash equivalents $ 22,443 $ 10,605 …"). A row is
 * a label followed by exactly as many figures as its header — the nearest
 * preceding run of two or more dates — names, with nothing but "$" or spaces
 * between the figures; the j-th figure is the j-th date's, under the row's
 * label. A row that does not line up with its header binds nothing.
 */
function tableColumns(text: string, found: readonly Quantity[]): Map<Quantity, { label: string; period: PeriodReference; rowStart: number }> {
  const out = new Map<Quantity, { label: string; period: PeriodReference; rowStart: number }>();
  const dates = [...text.matchAll(HEADER_DATE)].map((m) => ({ start: m.index, end: m.index + m[0].length, raw: m[0] }));
  const headers: { end: number; dates: string[] }[] = [];
  for (let i = 0; i < dates.length;) {
    let j = i;
    while (j + 1 < dates.length && /^[\s,|]*$/.test(text.slice(dates[j]!.end, dates[j + 1]!.start))) j++;
    if (j > i) headers.push({ end: dates[j]!.end, dates: dates.slice(i, j + 1).map((d) => d.raw) });
    i = j + 1;
  }
  const blank = (a: number, b: number): boolean => /^[\s$€£¥]*$/.test(text.slice(a, b));
  for (let q = 0; q < found.length;) {
    const header = headers.filter((h) => h.end <= found[q]!.start).at(-1);
    const prevEnd = q > 0 ? found[q - 1]!.end : 0;
    const lead = text.slice(Math.max(prevEnd, header?.end ?? 0), found[q]!.start);
    if (header === undefined || blank(Math.max(prevEnd, header.end), found[q]!.start) || /[.!?]\s/.test(lead)) { q++; continue; }
    let r = q;
    while (r + 1 < found.length && blank(found[r]!.end, found[r + 1]!.start)) r++;
    const k = header.dates.length;
    if (r - q + 1 === k && metricTokens(lead, []).length > 0) {
      for (let c = 0; c < k; c++) {
        const period = periodLabels(header.dates[c]!)[0];
        if (period !== undefined) out.set(found[q + c]!, { label: lead, period, rowStart: Math.max(prevEnd, header.end) });
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
    const found = quantities(body.text);
    const columns = tableColumns(body.text, found);
    return found.map((quantity) => {
      const column = columns.get(quantity);
      if (column !== undefined) {
        // A table cell: its row label and its column's date, no list reading.
        const own = { ...context(body.text, quantity, found), label: column.label, periods: [column.period], ambiguous: false, direction: null };
        const rowStart = column.rowStart + (body.text.slice(column.rowStart).length - body.text.slice(column.rowStart).trimStart().length);
        return { quantity, context: own, inherited, listAmbiguous: false, levelBeforeComparison: false,
          span: { source: excerpt.source, asOf: excerpt.asOf, start: body.start + rowStart, end: body.start + quantity.end, text: body.text.slice(rowStart, quantity.end) } };
      }
      const own = context(body.text, quantity, found);
      const inClause = found.filter((other) => other !== quantity && other.start >= own.start && other.end <= own.end &&
        (other.unit === quantity.unit || other.unit === null || quantity.unit === null));
      const listAmbiguous = /\brespectively\b/i.test(own.text) ||
        /^\s+(?:and|versus|vs\.?)\s+(?:[$€£¥]|[A-Z]{3}\s*)?[-+−]?\d/i.test(body.text.slice(quantity.end)) ||
        inClause.some((other) => {
          const before = found[found.indexOf(other) - 1];
          const lead = body.text.slice(Math.max(own.start, before ? before.end : own.start), other.start);
          return !COMPARATIVE_LEAD.test(lead) && metricTokens(lead, []).length === 0;
        });
      return { quantity, context: own, inherited, listAmbiguous,
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
    const own = context(claim.text, quantity, stated);
    if (own.periods.some((period) => period.key.startsWith("unestablished-date:"))) {
      return support("unchecked", "period-mismatch", "the prose exact date is invalid or locale-ambiguous");
    }
    const established = basisWindows(record);
    const claimTokens = metricTokens(own.label, options.ignoreWords ?? []).filter((word) => ![...established].some((key) => word === `window${key.toLowerCase()}`));
    if (!record.label || !namesMetric(claimTokens, metricTokens(`${record.label} ${record.period ?? ""}`, options.ignoreWords ?? []))) {
      return support("unchecked", "text-context-mismatch", "prose does not identify the metric of the cited numeric record");
    }
    if (own.periods.some((period) => period.kind === "month" && !periodLabels(record.period ?? "").some((source) => source.key === period.key))) {
      return support("unchecked", "period-mismatch", "a monthly prose period is not established by the typed record's period");
    }
    // A named window must be the record's own; a date against a window record
    // names one of its endpoints ("the trailing period ended 2026-07-26").
    const window = recordWindow(record);
    const periodAgrees = (period: PeriodReference): boolean => period.kind === "window"
      ? established.has(period.key) || window?.key === period.key
      : periodsAgree(period.label, record.period, record.fiscalPeriod ?? null) ||
        (period.kind === "date" && window !== null && (period.key === window.end || period.key === window.start));
    // A record that carries no period cannot contradict a prose period; it can
    // only fail to establish it (NVDA final rerun: "DCF base-case year-one
    // revenue growth over trailing revenue is 82.1353%" against a period-less
    // reverse-DCF context record was counted as a contradiction).
    if (own.periods.length > 0 && !own.periods.every(periodAgrees)) {
      return record.period === null
        ? support("unchecked", "period-mismatch", "the cited numeric record carries no period, so the prose period cannot be checked against it")
        : support("contradicted", "period-mismatch", "prose period is not established by the cited numeric record");
    }
    const direction = own.direction;
    if (direction !== null && (direction.negated || !isDeltaRecord(record) || direction.relation !== "change")) {
      return support("unchecked", "text-context-mismatch", "the cited typed value does not establish the prose directional relation");
    }
    if (direction !== null && record.value !== 0 && direction.polarity !== Math.sign(record.value)) {
      return support("contradicted", "direction-mismatch", "prose direction contradicts the signed change in its cited typed record");
    }
    if (quantity.unit === null) return support("unchecked", "text-ambiguous", "prose quantity has no established unit");
    if (quantity.unit !== record.unit) return support("contradicted", "unit-mismatch", "prose unit contradicts the cited numeric record");
    if (quantity.unit === "currency" || quantity.unit === "currency-per-share") {
      const currency = resolvedCurrency(quantity, options.reportingCurrency);
      if (currency === null) return support("unchecked", "currency-mismatch", "prose currency is not established");
      if (currency !== record.currency) return support("contradicted", "currency-mismatch", "prose currency contradicts the cited numeric record");
    }
    const signed = direction !== null && quantity.value >= 0 ? { ...quantity, value: quantity.value * direction.polarity } : quantity;
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
    const matchingPeriods = candidates.filter((candidate) => candidate.context.periods.length > 0
      ? own.periods.every((period) => candidate.context.periods.some((source) => source.key === period.key)) &&
        candidate.context.periods.every((period) => own.periods.some((stated) => stated.key === period.key))
      : own.periods.every((period) => candidate.inherited.some((source) => source.key === period.key)));
    if (matchingPeriods.length === 0) {
      // One stated other period contradicts; a flattened table's header of
      // several periods binds no column, so it stays unchecked.
      if (own.periods.length > 0 && candidates.length === 1 && candidates[0].context.periods.length === 1) {
        return support("contradicted", "period-mismatch", "the uniquely bound source figure is for another period", [candidates[0].span]);
      }
      return support("unchecked", "text-context-mismatch", "no source quantity establishes the metric and period", spans);
    }
    const directionOf = (binding: SourceBinding): QuantityDirection | null => binding.levelBeforeComparison ? null : binding.context.direction;
    const distinct = new Set(matchingPeriods.map((candidate) => JSON.stringify([
      candidate.quantity.value, candidate.quantity.unit, resolvedCurrency(candidate.quantity, options.reportingCurrency), candidate.context.periods.map((period) => period.key),
      directionOf(candidate),
    ])));
    if (distinct.size !== 1 || matchingPeriods.some((candidate) => candidate.listAmbiguous || candidate.context.periods.length > 1)) {
      return support("unchecked", "text-ambiguous", "multiple source values, periods or columns could bind the prose quantity", matchingPeriods.slice(0, 3).map((candidate) => candidate.span));
    }
    const candidate = matchingPeriods[0];
    const sourceDirection = directionOf(candidate);
    if (own.direction?.negated || sourceDirection?.negated || (own.direction === null) !== (sourceDirection === null)) {
      return support("unchecked", "text-context-mismatch", "the source does not establish the prose directional relation", [candidate.span]);
    }
    if (own.direction !== null && sourceDirection !== null) {
      if (own.direction.polarity !== sourceDirection.polarity) return support("contradicted", "direction-mismatch", "the prose directional relation contradicts its bound source span", [candidate.span]);
      if (own.direction.relation !== sourceDirection.relation) return support("unchecked", "text-context-mismatch", "a change magnitude and a resulting level are different numeric relations", [candidate.span]);
    }
    if (candidate.quantity.unit === null) return support("unchecked", "text-ambiguous", "the source figure's unit is not established", [candidate.span]);
    if (candidate.quantity.unit !== quantity.unit) return support("contradicted", "unit-mismatch", "the bound source figure uses another unit", [candidate.span]);
    if (quantity.unit === "currency" || quantity.unit === "currency-per-share") {
      const currency = resolvedCurrency(quantity, options.reportingCurrency);
      const sourceCurrency = resolvedCurrency(candidate.quantity, options.reportingCurrency);
      if (currency === null || sourceCurrency === null) return support("unchecked", "currency-mismatch", "the source or prose currency is not established", [candidate.span]);
      if (currency !== sourceCurrency) return support("contradicted", "currency-mismatch", "the bound source figure uses another currency", [candidate.span]);
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
