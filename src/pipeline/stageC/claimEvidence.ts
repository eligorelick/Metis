/** Conservative numeric support for prose. A citation alone never proves a fact. */
import type { SourcedClaim } from "@/report/schema";
import type { TextExcerpt } from "@/pipeline/stageC/payload";
import { baseAgrees, comparisonBase, comparisonCueEnd, findDirectionWords, HEDGE_WORDS, isDeltaRecord, labelOperands, type LabelOperands, proseQuantityText, quantityDirection, statesNumberWord, type QuantityDirection } from "@/pipeline/stageC/consistency";
import { isIsoDate, periodsAgree, recordEstablishesInterval, type CanonicalUnit, type NumericProvenanceRecord, type ProvenanceFailureReason } from "@/pipeline/stageC/provenance";
import { PeriodContextSchema } from "@/types/periodContext";
import { scoreToBand } from "@/pipeline/stageB/grading";
import { classifyBeneishVerdict } from "@/pipeline/stageB/forensics";
import { isNeutralScore } from "@/report/assessment";
import { retainedSourceSentences } from "@/report/executiveDecisions";

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
  /** Display metadata from this same parser, used only to name a recorded comparison. */
  displayScale?: number; decimalPlaces?: number; scaleWord?: string; unitWord?: string;
  accounting?: boolean; explicitSign?: boolean;
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
  const accountingPercents = [...text.matchAll(/\((\d[\d,]*(?:\.\d+)?)\)(\s*%)/g)];
  const percentText = text.replace(/\((\d[\d,]*(?:\.\d+)?)\)(\s*%)/g, "($1 $2");
  const masked = proseQuantityText(percentText.replace(/\b\d{4}-(?:0[1-9]|1[0-2])\b(?!-\d)/g, (match) => " ".repeat(match.length)))
    .replace(WINDOW_LABEL, (match) => " ".repeat(match.length))
    .replace(DURATION_MONTHS, (match) => " ".repeat(match.length));
  // TracedNumber excerpts declare their display scale before the metric,
  // e.g. "USD millions: Cash ... USD 56,586". That explicit declaration is
  // distinct from a claim that simply copies "$56,586" out of a scaled table.
  const declaredMoneyScale = new RegExp(String.raw`^\s*(?:${CURRENCIES}|currency)\s+(thousands?|millions?|billions?|trillions?):`, "i").exec(text)?.[1];
  const pattern = new RegExp(String.raw`(?:(?:(?<![A-Za-z0-9.])(?<lead>[-+−]))?(?<prefix>US\$|[$€£¥]|(?<![A-Za-z])(?:${CURRENCIES})(?![A-Za-z]))\s*)?(?:(?<sign>[-+−])\s*)?(?<digits>\d{1,3}(?:,\d{3})+|\d+)(?<fraction>\.\d+)?\s*(?:(?<scale>thousands?|millions?|billions?|trillions?|bn|bln|mm|mn|mln|mil|mio|k|m|b)(?![A-Za-z]))?\s*(?:(?<unit>p\.p\.|%|(?:(?:percentage[\s-]points?(?:\s+per\s+year)?|percent|bps?|basis[\s-]points?|pps?|dollars?|shares?|days?|people|users|subscribers|count|times|per share|score)(?![A-Za-z]|-[A-Za-z])|[x×](?![A-Za-z]))))?(?:\s*(?<currencySuffix>${CURRENCIES})(?![A-Za-z]))?`, "gi");
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
    if (accountingPercents.some(accounting => accounting.index + 1 === start && accounting.index + accounting[0].length === end)) start -= 1;
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
    const prefix = (groups.prefix ?? groups.currencySuffix ?? "").trim();
    let unit: CanonicalUnit | null = /^(?:%|percent)$/.test(token) ? "percent"
      : /^percentage[\s-]points?\s+per\s+year$/.test(token) ? "percentage-points-per-year"
      : /^(?:p\.p\.|pp|pps|percentage[\s-]points?|bp|bps|basis[\s-]points?)$/.test(token) ? "percentage-points"
        : /^(?:x|×|times)$/.test(token) ? "ratio"
          : /^shares?$/.test(token) ? "shares"
            : /^days?$/.test(token) ? "days" : /^(?:people|users|subscribers|count)$/.test(token) ? "count" : null;
    if (unit === null && /\b(?:people|users|subscribers)\b/i.test(text.slice(Math.max(0, start - 90), start))) unit = "count";
    if (scoreUnit || token === "score") unit = "score";
    let currency: string | null = null;
    if (prefix || /^dollars?$/.test(token)) {
      const leadingPerShare = /\bper[\s-]+share\s+(?:(?:is|was|are|were|of|at|equals?)\s+)?$/i.test(text.slice(0, start));
      // An explicitly named share price supplies its unit independently of the
      // cited record. Bare prices and dividend totals do not establish it.
      const leadingSharePrice = /\bshare[\s-]+price\s+(?:(?:is|was|of|at|equals?)\s+)?$/i.test(text.slice(0, start));
      unit = token === "per share" || (token === "" && (leadingPerShare || leadingSharePrice)) ? "currency-per-share" : "currency";
      currency = /^[A-Z]{3}$/i.test(prefix) ? prefix.toUpperCase()
        : prefix === "US$" ? "USD" : prefix === "€" ? "EUR" : prefix === "£" ? "GBP" : null;
      if (groups.currencySuffix) {
        const suffix = groups.currencySuffix.toUpperCase();
        currency = !groups.prefix || currency === suffix || (prefix === "$" && DOLLARS.has(suffix)) ? suffix : null;
      }
    }
    const factor = /^(?:bp|bps|basis[\s-]points?)$/.test(token) ? 0.01 : 1;
    const decimals = (groups.fraction ?? "").length > 0 ? groups.fraction.length - 1 : 0;
    // Accounting parentheses enclose the complete amount (including currency
    // and unit); they are part of its sign, not disposable prose punctuation.
    const accountingNegative = (/\(\s*$/.test(masked.slice(0, start)) && /^\s*\)/.test(masked.slice(end))) ||
      accountingPercents.some(match => match.index === start && match.index + match[0].length === end);
    return [{ start, end, value: (/^[-−]$/.test(lead ?? "") || /^[-−]$/.test(groups.sign ?? "") || accountingNegative || signWord !== null ? -1 : 1) *
      Number(groups.digits.replace(/,/g, "") + (groups.fraction ?? "")) * scale * factor,
    step: 10 ** -decimals * scale * factor, unit, currency, dollar: !groups.currencySuffix && (prefix === "$" || /^dollars?$/.test(token)),
    scaled: groups.scale !== undefined || Boolean(groups.prefix && declaredMoneyScale !== undefined),
    displayScale: scale * factor, decimalPlaces: decimals, scaleWord: groups.scale ?? (groups.prefix ? declaredMoneyScale : undefined), unitWord: groups.unit,
    accounting: accountingNegative, explicitSign: Boolean(groups.sign || lead || signWord),
    ...boundBefore(masked, start) }];
  });
}

/** The prose quantity reader, exported for tests. */
export function readProseQuantities(text: string): readonly Quantity[] {
  return quantities(text);
}

export interface PlainFigureText { source: string; text: string }
interface PlainValue { value: number; unit: CanonicalUnit; currency: string | null; step?: number; fraction?: boolean; source?: string }
type PlainReading = { label: string; tokens: string[] };
export interface PlainFigureIndex { values: PlainValue[]; readings: Map<NumericProvenanceRecord, PlainReading[]> }
export interface PlainFigureResult {
  figure: string;
  outcome: "confirmed" | "contradiction" | "not-found" | "value-match";
  recorded?: string;
  source?: string;
}
interface PlainFigureOptions {
  registry: readonly NumericProvenanceRecord[];
  excerpts: readonly TextExcerpt[];
  reportingCurrency: string | null;
  ignoreWords: readonly string[];
  seriesLatest: ReadonlyMap<string, string>;
  index: PlainFigureIndex;
}

function priceInWords(text: string): boolean {
  return /\b(?:price|quote|close|SMA\d*|moving average|(?:50|200)-day(?: average)?|52(?:[- ]week|[- ]?w)(?: high| low| range)?)\b/i.test(text);
}
function plainValue(q: Quantity, own: Context, currency: string | null): PlainValue | null {
  if (q.unit === null) return null;
  return { value: q.value, step: q.step, unit: q.unit === "currency" && (perShareInWords(q, own.label) || priceInWords(own.own)) ? "currency-per-share" : q.unit,
    currency: q.unit === "currency" || q.unit === "currency-per-share" ? resolvedCurrency(q, currency) : null };
}

/** These two prose forms resolve only a value reading, never a metric/period binding. */
function plainLookupQuantity(text: string, q: Quantity, all: readonly Quantity[]): Quantity {
  let value = q;
  const open = text.lastIndexOf("(", q.start);
  if (q.accounting && !q.explicitSign && open >= 0 &&
    /\b(?:price|quote|value|income(?: before tax)?|growth|quarter|margin|revenue|outflows)\s*$/i.test(text.slice(0, open)) &&
    !/\b(?:negative|minus|loss)\b/i.test(text.slice(Math.max(0, open - 160), q.end + 80))) value = { ...q, value: Math.abs(q.value) };
  // "EUR 1.00, 1.08 and 4.07 billion": only punctuation/conjunctions may
  // connect the bare figures. A metric, unit or currency between them refuses it.
  if (q.unit === "currency" && !q.scaled && !q.unitWord) {
    let previous = q;
    for (const next of all.slice(all.indexOf(q) + 1, all.indexOf(q) + 7)) {
      if (next.unit !== null || !/^\s*(?:,\s*|(?:,\s*)?and\s*)$/i.test(text.slice(previous.end, next.start))) break;
      if (next.scaled && next.scaleWord) {
        const scale = next.displayScale ?? 1;
        value = { ...value, value: value.value * scale, step: value.step * scale, displayScale: scale, scaleWord: next.scaleWord };
        break;
      }
      previous = next;
    }
  }
  return value;
}

/** Value-only evidence is intentionally independent of claim validation, metric and period. */
export function buildPlainFigureIndex(registry: readonly NumericProvenanceRecord[], texts: readonly PlainFigureText[], reportingCurrency: string | null, ignore: readonly string[]): PlainFigureIndex {
  const values: PlainValue[] = registry.map(r => ({ value: r.value, unit: r.unit, currency: r.currency, fraction: r.unitScale === "fraction", source: r.id }));
  for (const { source, text } of texts) for (const sentence of retainedSourceSentences(text)) {
    const all = quantities(sentence);
    for (const q of all) {
      const lookup = plainLookupQuantity(sentence, q, all), own = context(sentence, q, all);
      const value = plainValue(lookup, lookup === q ? own : { ...own, own: own.label }, reportingCurrency);
      if (value) values.push({ ...value, source });
    }
  }
  return { values, readings: new Map(registry.map(r => [r, labelReadings(r).map(label => ({ label, tokens: metricTokens(label, ignore).filter(w => !w.startsWith("window")) }))])) };
}

function valueFound(q: PlainValue, values: readonly PlainValue[]): PlainValue | undefined {
  return values.find(v => {
    const fraction = q.unit === "percent" && v.unit === "ratio" && v.fraction;
    const value = fraction ? v.value * 100 : v.value;
    const step = v.step === undefined ? undefined : fraction ? v.step * 100 : v.step;
    return ((q.unit === v.unit && !(q.unit === "ratio" && v.fraction)) || fraction) && q.currency === v.currency &&
      (step === undefined || step <= (q.step ?? 0) * (1 + 1e-10)) && equalValue({ ...q, step: q.step ?? 0 } as Quantity, value);
  });
}

function displayedPlainValue(q: Quantity, value: number, currency: string | null): string {
  const number = (value / (q.displayScale ?? 1)).toLocaleString("en-US", { minimumFractionDigits: q.decimalPlaces ?? 0, maximumFractionDigits: q.decimalPlaces ?? 0 });
  const scale = q.scaleWord ? ` ${q.scaleWord}` : "";
  if (q.unit === "currency" || q.unit === "currency-per-share") return `${currency ?? "currency unknown"} ${number}${scale}${q.unitWord === "per share" || q.unit === "currency-per-share" ? " per share" : ""}`;
  if (q.unit === "percent") return `${number}%`;
  if (q.unit === "ratio") return `${number}x`;
  return `${number} ${q.unitWord ?? q.unit}`;
}

/** Only exact producer identities may supply these short reader labels. */
function technicalPlainFrame(text: string, q: Quantity, all: Quantity[], own: Context): { label: string; source: (r: NumericProvenanceRecord) => boolean; flip?: boolean } | undefined {
  const bareSma = /^\s*(50|200)[- ]day\s*:?\s*$/i.exec(text.slice(own.start, q.start));
  const sma = bareSma ?? /\b(50|200)[- ]day\b/i.exec(own.own);
  if (sma && (bareSma || /\b(?:averages?|SMA)\b/i.test(own.text) || /\b(?:averages|SMAs)\s*\([^)]*;\s*$/i.test(text.slice(0, own.start)))) return { label: `SMA${sma[1]}`, source: r => r.kind === "computed" && r.origin === "computed.technicals" && r.id === `computed.technicals.sma${sma[1]}` && r.label === `SMA${sma[1]}` };
  const highScope = /\b52[- ](?:week|w)\b/i.test(own.text) || /\b52[- ](?:week|w)\b[^;\n]*;\s*$/i.test(text.slice(0, own.start));
  if (!highScope) return undefined;
  const highRelation = /^\s*(below|above)\s+(?:(?:its|the)\s+)?(?:52[- ](?:week|w)\s+)?high\b/i.exec(text.slice(q.end, own.end));
  if (q.unit === "percent" && highRelation) {
    return { label: "% from 52w high", flip: highRelation[1]!.toLowerCase() === "below", source: r => r.kind === "computed" && r.origin === "computed.technicals.range52w" && r.label === "% from 52w high" && r.unit === "percent" };
  }
  if (q.unit !== "currency" && q.unit !== "currency-per-share") return undefined;
  let endpoint = /\b(high|low)\b/i.exec(own.own)?.[1]?.toLowerCase();
  if (!endpoint && /\b52[- ](?:week|w)\s+range\b/i.test(own.text)) {
    const money = all.filter(other => other.start >= own.start && other.end <= own.end && (other.unit === "currency" || other.unit === "currency-per-share"));
    if (money.length === 2 && /\b(?:to|through)\b|[–—]/.test(text.slice(money[0]!.end, money[1]!.start))) endpoint = q === money[0] ? "low" : "high";
  }
  return endpoint ? { label: `52w ${endpoint}`, source: r => r.kind === "computed" && r.origin === "computed.technicals.range52w" && r.label === `52w ${endpoint}` && r.unit === "currency-per-share" } : undefined;
}

/** Context checks run BEFORE evidence-wide value lookup, including for coincidental equal values elsewhere. */
export function checkPlainFigures(text: string, options: PlainFigureOptions): PlainFigureResult[] {
  const all = quantities(text);
  return all.filter(q => q.unit === "currency" || q.unit === "currency-per-share" || q.unit === "percent" ||
    q.unit === "percentage-points" || q.unit === "percentage-points-per-year" || q.unit === "ratio" || q.unit === "days").map(q => {
    const own = context(text, q, all), figure = text.slice(q.start, q.end);
    const isolated = text.slice(own.start, own.end).split("").map((ch, i) =>
      all.some(other => other !== q && i + own.start >= other.start && i + own.start < other.end) ? " " : ch).join("");
    const frame = technicalPlainFrame(text, q, all, own);
    const lookup = plainLookupQuantity(text, q, all);
    const words = metricTokens(own.own, options.ignoreWords, { loose: true }).filter(w => !w.startsWith("window"));
    const nearby = metricTokens(own.label, options.ignoreWords, { loose: true });
    const kept = metricTokens(own.own, options.ignoreWords, { loose: true, keepDirectionWords: true });
    const bindings: { record: NumericProvenanceRecord; display: number; supported: boolean }[] = [];
    for (const record of options.registry) {
      if (lookup !== q) break;
      const value = plainValue(q, frame ? { ...own, own: frame.label } : own, options.reportingCurrency);
      if (!value || (value.unit !== record.unit && !(q.unit === "percent" && record.unit === "ratio" && record.unitScale === "fraction")) || value.currency !== record.currency) continue;
      const series = namesRecency(own.text) ? reportedSeries(record) : null;
      if (series && (options.seriesLatest.get(series.key) ?? series.date) > series.date) continue;
      const readings = options.index.readings.get(record) ?? [];
      if (!frame && !readings.some(reading => reading.tokens.some(w => nearby.includes(w)))) continue;
      const validate = (candidate: string) => validateClaimNumericSupport({ label: "FACT", text: candidate, source: record.id, asOf: record.asOf }, {
        record, sourceId: record.id, registry: options.registry, excerpts: options.excerpts, reportingCurrency: options.reportingCurrency,
        ignoreWords: options.ignoreWords, seriesLatest: options.seriesLatest,
      });
      let result = frame ? undefined : validate(isolated);
      let display = record.unit === "ratio" && record.unitScale === "fraction" && q.unit === "percent" ? record.value * 100 : record.value;
      if (!result || (result.status !== "validated" && !(result.status === "contradicted" && result.reason === "value-mismatch"))) {
        if (frame && !frame.source(record)) continue;
        if (!frame && descriptionConflictsWithRecord({ metric: own.own, segment: own.own }, record, options.ignoreWords)) continue;
        const reading = frame ? { label: frame.label } : readings.find(({ tokens }) => tokens.length > 0 && words.some((_, i) => namesMetric(words.slice(i, i + tokens.length), tokens)));
        if (!reading) continue;
        const sourceWords = [...metricTokens(reading.label, options.ignoreWords, { keepDirectionWords: true }), ...(frame?.label.startsWith("SMA") ? ["average"] : [])];
        const defining = new Set([...DEFINITION_MODIFIERS, "growth", "decline", "increase", "decrease", "change", "spread", "ratio", "conversion", "margin", "after", "before", "discount", "threshold"]);
        if (kept.some(w => defining.has(w) && !sourceWords.includes(w))) continue;
        if (frame && (FORWARD_LOOKING.test(own.text) || /\bexpected\b/i.test(own.text))) continue;
        const signed = frame?.flip ? { ...q, value: -q.value } : q;
        const raw = frame?.flip ? displayedPlainValue(q, signed.value, value.currency) : figure;
        const money = q.unit === "currency" && record.unit === "currency-per-share" ? `${raw} per share` : raw;
        const periods = [...own.periods.map(p => `for ${p.raw}`), ...own.bases.map(p => `compared with ${p.raw}`)].join(" ");
        result = validate(`${reading.label}: ${money} ${periods}`);
        if (frame?.flip) display = -display;
      }
      if (result.status === "validated" || (result.status === "contradicted" && result.reason === "value-mismatch")) {
        if (statementOutflow(record) && q.value > 0 && /\b(?:buybacks|share repurchases|capital expenditure|capex)\b/i.test(own.label)) display = Math.abs(display);
        const boundSupported = q.bound === "lower" ? (q.strict ? display > q.value : display >= q.value)
          : q.bound === "upper" ? (q.strict ? display < q.value : display <= q.value) : false;
        if (/\b(?:must|would need|would have to|well beyond|threshold)\b/i.test(own.own)) continue;
        bindings.push({ record, display, supported: result.status === "validated" || boundSupported });
      }
    }
    // Different eligible periods/bases with different values leave context
    // unresolved; never pick the convenient record from an ambiguous set.
    const first = bindings[0];
    if (first && bindings.every(b => equalValue({ ...q, value: first.display }, b.display))) {
      if (bindings.every(b => b.supported) || equalValue(q, first.display)) return { figure, outcome: "confirmed", source: first.record.id };
      return { figure, outcome: "contradiction", source: first.record.id, recorded: displayedPlainValue(q, first.display, first.record.currency) };
    }
    const value = plainValue(lookup, frame ? { ...own, own: frame.label } : lookup !== q ? { ...own, own: own.label } : own, options.reportingCurrency);
    const matched = value && valueFound(value, options.index.values);
    return { figure, outcome: matched ? "value-match" : "not-found", ...(matched?.source ? { source: matched.source } : {}) };
  });
}

/** `start` and `end` are offsets in the text the period was read from. */
interface PeriodReference { key: string; label: string; raw: string; kind: "date" | "month" | "period" | "window"; start: number; end: number }
/**
 * `periods` are the periods the clause states for its figure; `bases` (AI-402) are
 * the comparison bases it names ("compared with $10.2 billion in second quarter
 * 2025"), which belong to the amount the comparison word introduces, not to a figure before it.
 */
interface Context { start: number; end: number; text: string; label: string; own: string; ownAfter: string; periods: PeriodReference[]; bases: PeriodReference[];
  /** Final re-review (AI-303-V3): a period of this figure's clause sat in a parenthetical holding another figure, so its periods cannot be read. */
  held: boolean; ambiguous: boolean; direction: QuantityDirection | null; base: boolean }
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
/**
 * Final review (2026-10-28, AI-303-V3): a prior fiscal year-end ("the end of the prior year", "the end of last fiscal year", "the
 * previous fiscal year-end") is an instant of its own, read before FISCAL_YEAR_END. No title, header, inherited window or current
 * fiscal year-end establishes it, and no record does, by its label or its basis; only the same relative phrase in a filing figure's own
 * clause does, stated as that figure's own instant (after a comparison word it is the base's, after "from" or "since" a start).
 */
const PRIOR_YEAR_END = /\bend\s+of\s+(?:the\s+|its\s+|our\s+)?(?:last|prior|previous)\s+(?:fiscal\s+)?year\b|\b(?:last|prior|previous)[\s‐‑–—-]+(?:(?:fiscal|financial)[\s‐‑–—-]+)?year[\s‐‑–—-]*end\b/gi;
const PRIOR_FISCAL_YEAR_END = "PRIORFYE";
// Relative historical scope is evidence of a different period, even when its
// absolute fiscal date cannot be resolved. Never let it inherit a current title.
const HISTORICAL_PERIOD = /\b(?:last|prior|previous|preceding)[\s\u2010-\u2014-]+(?:(?:fiscal|calendar)[\s\u2010-\u2014-]+)?(?:quarter|year|period)(?:[\s\u2010-\u2014-]+end)?\b|\b(?:a|one|two|three|\d+)[\s\u2010-\u2014-]+(?:quarters?|years?|periods?)[\s\u2010-\u2014-]+(?:ago|earlier)\b/gi;
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
  if (options.loose || options.yearEnd) {
    take(PRIOR_YEAR_END, () => ({ kind: "window", key: PRIOR_FISCAL_YEAR_END, label: "prior fiscal year-end" }));
    take(FISCAL_YEAR_END, () => ({ kind: "window", key: "FYE", label: "fiscal year-end" }));
  }
  if (options.loose || options.yearEnd) {
    take(HISTORICAL_PERIOD, (m) => ({ kind: "period", key: `relative:${m[0].toLowerCase().replace(/[\s\u2010-\u2014-]+/g, " ")}`, label: m[0] }));
  }
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
  take(/\b(?:twelve|12)[\s-]+months?[\s-]+end(?:ed|ing)\b/gi, () => ({ kind: "window", key: "TTM", label: "TTM" }));
  take(/\b\d{4}-\d{2}-\d{2}\b/g, (m) => ({ key: isIsoDate(m[0]) ? m[0] : `unestablished-date:${m[0]}`, label: m[0], kind: "date" }));
  take(/\b(\d{4})-(0[1-9]|1[0-2])\b/g, (m) => ({ key: `month:${m[1]}-${m[2]}`, label: m[0], kind: "month" }));
  take(/\bfour calendar quarters ended\b/gi, () => ({ key: "TTM", label: "TTM", kind: "window" }));
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
/** The windows that are instants: the fiscal year-end and the prior fiscal year-end. */
const INSTANT_WINDOWS: ReadonlySet<string> = new Set(["FYE", PRIOR_FISCAL_YEAR_END]);
/** "from" or "since" directly before an instant makes it a change's start (final re-review, AI-303-V3). */
const START_LEAD = /\b(?:from|since)\s+(?:the\s+|its\s+|our\s+)?$/i;
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
  yearEnd = false): { periods: PeriodReference[]; bases: PeriodReference[]; held: boolean } {
  const ownText = text.slice(span.start, span.end);
  let blanked = ownText;
  for (const other of all) {
    if (other.start >= span.start && other.end <= span.end) {
      blanked = blanked.slice(0, other.start - span.start) + " ".repeat(other.end - other.start) + blanked.slice(other.end - span.start);
    }
  }
  // Final re-review (AI-303-V3): a period inside a parenthetical that holds another figure is that figure's ("$31.6 billion (at the end
  // of the prior fiscal year, $25.8 billion)", "(prior fiscal year-end: $25.8 billion)"), never a figure's outside it; a parenthetical
  // with no figure of its own stays the clause's. This is the reverse of the apposition rule for direction words (AI-401-V1). Such a
  // parenthetical can also state the outside figure's own period ("$25.8 billion (at the end of the prior fiscal year, up from $20.0
  // billion a year earlier)"), so a figure that loses a period to one has periods that cannot be read (`held`), never none.
  const inside = (other: Quantity, [open, end]: readonly [number, number]): boolean => other.start - span.start > open && other.end - span.start <= end;
  const held = mergedSpans(figureParentheticals(ownText, span, all).filter((parenthetical) => !inside(quantity, parenthetical)));
  const read = periodLabels(blanked, { loose, yearEnd });
  const stated = read.filter((period) => {
    if (withinSpans(held, period.start)) return false;
    if (!yearEnd) return true;
    // A comma-introduced period followed by another amount can describe that
    // amount ("$31.6B, at the prior year-end $25.8B"). It cannot label the
    // earlier amount. Keep that reading withheld rather than borrow the title.
    const comma = ownText.lastIndexOf(",", period.start);
    if (comma < 0 || quantity.end - span.start > comma) return true;
    return !all.some(other => other.start - span.start >= period.end && other.end <= span.end &&
      !/[,;()]/.test(ownText.slice(period.end, other.start - span.start)));
  });
  const isBase = (period: PeriodReference): boolean => {
    // Final re-review (AI-303-V3 / AI-402): a year-end is an instant, so it is read as a date is; any other window is a span and is
    // never a base. An instant right after "from" or "since" is where a change starts ("Since the end of the prior fiscal year,
    // inventory increased by $5.8 billion"), never the figure's own instant.
    if (period.kind === "window" && !INSTANT_WINDOWS.has(period.key)) return false;
    if (period.kind === "window" && START_LEAD.test(ownText.slice(Math.max(0, period.start - 24), period.start))) return true;
    const cue = comparisonCueEnd(ownText, period.start);
    return cue !== null && !(cue <= quantity.start - span.start && quantity.end - span.start <= period.start);
  };
  return { periods: stated.filter((period) => !isBase(period)), bases: stated.filter(isBase), held: stated.length !== read.length };
}
/**
 * The parentheticals of a clause that hold at least one of its figures, sorted by their "(". Each runs from "(" to the ")" that closes
 * it, found by counting depth, or to the clause end when none does. They are read once per clause and figure list (final re-review:
 * reading them for every figure cost a factor of figures times parentheses), and the cache entry is keyed by the clause text too.
 */
const PARENTHETICALS = new WeakMap<readonly Quantity[], Map<string, { text: string; spans: readonly (readonly [number, number])[] }>>();
function figureParentheticals(ownText: string, span: { start: number; end: number }, all: readonly Quantity[]): readonly (readonly [number, number])[] {
  const key = `${span.start}:${span.end}`;
  const cached = PARENTHETICALS.get(all)?.get(key);
  if (cached !== undefined && cached.text === ownText) return cached.spans;
  const spans: [number, number][] = [];
  const open: number[] = [];
  for (let i = 0; i < ownText.length; i++) {
    const char = ownText.charCodeAt(i);
    if (char === 40) open.push(i);
    else if (char === 41 && open.length > 0) spans.push([open.pop()!, i]);
  }
  for (const start of open) spans.push([start, ownText.length]);
  const figures = all.filter((other) => other.start >= span.start && other.end <= span.end).map((other) => [other.start - span.start, other.end - span.start] as const);
  const holding = spans.filter(([start, end]) => figures.some(([a, b]) => a > start && b <= end)).sort((x, y) => x[0] - y[0]);
  const byClause = PARENTHETICALS.get(all) ?? new Map<string, { text: string; spans: readonly (readonly [number, number])[] }>();
  byClause.set(key, { text: ownText, spans: holding });
  PARENTHETICALS.set(all, byClause);
  return holding;
}
/** Spans sorted by start, merged where they overlap (parentheticals nest or are disjoint). */
function mergedSpans(spans: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  for (const [start, end] of spans) {
    const last = out.at(-1);
    if (last !== undefined && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}
/** Whether `at` lies strictly inside one of the sorted, disjoint spans. */
function withinSpans(spans: readonly (readonly [number, number])[], at: number): boolean {
  let low = 0;
  let high = spans.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [start, end] = spans[mid]!;
    if (at <= start) high = mid - 1;
    else if (at >= end) low = mid + 1;
    else return true;
  }
  return false;
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
  const lent = (period: PeriodReference): boolean => (period.start >= own.start && period.end <= own.end) ||
    !forward.some(([a, b]) => period.start >= a && period.start < b);
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
  // A relative clause introducing the next amount describes that amount,
  // e.g. "$2.9B for which ... repurchase obligations totaling $19.2M".
  if (following !== undefined && following.start < clauseEnd && /^\s+for which\b/i.test(tail)) return quantityEnd;
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
  const { periods, bases, held } = framePeriods(text, { start, end }, quantity, all, !source, source);
  // AI-503: a figure the text introduces with "from", "compared with/to", "versus", "vs." or "against" is a comparison base. The raw text
  // before the figure is read, not the clause: a clause can start at a "versus" connector and leave the figure nothing before it.
  const base = COMPARISON_BASE_LEAD.test(text.slice(Math.max(0, quantity.start - 24), quantity.start));
  return { start, end, text: ownText, label, own, ownAfter, periods, bases, held, base,
    direction: quantityDirection(directionText.replace(/\bgains?(?=\s+(?:on|from)\b)/gi, match => " ".repeat(match.length)), quantity.start - start, quantity.end - start,
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
  "percent", "percentage", "point", "points", "basis", "bp", "bps", "pp", "pps", "currency", "count", "dollar", "dollars", "days",
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
  fcf: ["free", "cash", "flow"], sbc: ["stock", "based", "compensation"], capex: ["capital", "expenditure"],
  roic: ["return", "on", "invested", "capital"], roe: ["return", "on", "equity"], roa: ["return", "on", "assets"],
  rote: ["return", "on", "tangible", "common", "equity"], rotce: ["return", "on", "tangible", "common", "equity"],
  wacc: ["weighted", "average", "cost", "of", "capital"], cagr: ["compound", "annual", "growth", "rate"],
  ebit: ["earnings", "before", "interest", "and", "taxes"], ebitda: ["earnings", "before", "interest", "taxes", "depreciation", "and", "amortization"],
  nopat: ["net", "operating", "profit", "after", "tax"], erp: ["equity", "risk", "premium"],
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
/** A comparison cue or a start, either of which makes a later prior fiscal year-end something other than the figure's own instant. */
const OWN_PERIOD_CUE = /\b(?:compared\s+(?:with|to)|versus|vs\.?|relative\s+to|against|than|from|since)(?![A-Za-z])/i;
/** The content words of a figure's own description: ordinal period phrases and comparison bases are blanked, context words dropped. */
function ownDescriptionTokens(text: string, ignore: readonly string[]): string[] {
  const blanked = text
    .replace(/\b(?:first|second|third|fourth)[\s\u2010-\u2014-]+(?:fiscal[\s\u2010-\u2014-]+)?(?:quarter|half)\b/gi, " ")
    .replace(/\b(?:prior|previous|preceding|same)\s+(?:quarter|year|period)\b/gi, " ")
    // A prior fiscal year-end is compared as a period, as the claim's is (final review, AI-303-V3), but only when no comparison cue or
    // start precedes it: after one it is a base or a start, and the figure must not be described by it (final re-review).
    .replace(PRIOR_YEAR_END, (match: string, offset: number, whole: string) => OWN_PERIOD_CUE.test(whole.slice(0, offset)) ? match : " ")
    // A spelled-out basis is a comparison base too ("a year-over-year increase of $66.1 billion in purchases"), and D-63 never required it.
    .replace(/\b(?:year|quarter)[\s\u2010-\u2014-]+over[\s\u2010-\u2014-]+(?:year|quarter)\b|\b(?:yoy|qoq)\b/gi, " ");
  // A window is compared as a period (AI-303 / C-6), not as a metric word, exactly as the claim's own window tokens are.
  return metricTokens(blanked, ignore).filter((word) => !OWN_CONTEXT_WORDS.has(word) && !word.startsWith("window"));
}
function metricTokens(label: string, ignore: readonly string[], options: { loose?: boolean; keepDirectionWords?: boolean } = {}): string[] {
  // D-66: registry keys are camelCase ("priceToBook (current)"), and a
  // comparison basis is part of a growth's definition (see COMPARISON_BASIS).
  let metric = label.replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\bcompound annual growth rate\b/gi, "CAGR")
    .replace(/\bForm\s+4\s+code\s+([A-Z])\b/gi, "form4code$1")
    .replace(/\bgains?(?=\s+(?:on|from)\b)/gi, "metricgain")
    .replace(/\bnon[ -]GAAP\s+Adjusted\s+EBITDA\b/gi, "Adjusted EBITDA")
    .replace(/\bP\s*\/\s*E\b/gi, "pe")
    .replace(/\block[‐‑–—-]up\b/gi, "lockup")
    .replace(/\byear[\s‐‑–—-]+over[\s‐‑–—-]+year\b|\byoy\b/gi, " yoy ")
    .replace(/\bquarter[\s‐‑–—-]+over[\s‐‑–—-]+quarter\b|\bqoq\b/gi, " qoq ")
    // "Management's guidance" attributes the figure; it does not define it.
    .replace(/\b(?:management|the company)['’]s\b/gi, " ")
    .replace(LABEL_WINDOW, (_match, quarter: string | undefined) => quarter ? " for the quarter " : " for the year ");
  if (/\bcagr\b/i.test(metric)) metric = metric.replace(/\b(?:over\s+)?(?:one[ -]+year|1y)\b/gi, " horizon1y ");
  for (const period of periodLabels(metric, options)) metric = metric.replace(period.raw, period.kind === "window" ? ` window${period.key} ` : " ");
  // Preserve the explicit horizon, including its number, when prose spells
  // out the technical-series label "6-month" as "over six months".
  metric = metric.replace(/\b(?:over\s+)?(?:six|6)[\s‐‑–—-]+months?\b/gi, " window6M ");
  // Preserve negative compounds as definitions. Splitting non-GAAP into two
  // words would let a GAAP claim reuse the GAAP substring of its opposite.
  metric = metric.toLowerCase().replace(/\bnon[\s‐‑–—-]+(?=[a-z])/g, "non-").replace(/[‐‑–—]/g, "-");
  const ignored = new Set([...ignore.flatMap((word) => word.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().match(/[a-z0-9]+/g) ?? []),
    ...(options.keepDirectionWords ? [] : findDirectionWords(metric).map((hit) => hit.word)), ...CURRENCIES.toLowerCase().split("|")]);
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
/** AI-407 / OD-2: reject detected conflicts, preserving legitimate paraphrases. */
export function descriptionConflictsWithRecord(
  description: { metric: string; segment: string }, record: NumericProvenanceRecord, ignore: readonly string[],
): string | null {
  if (!record.label) return null;
  const label = record.id.startsWith("payload.macro.") ? record.label.replace(/ \(core\)$| \(sector\)$/i, "") : record.label;
  const tokens = (text: string) => new Set(metricTokens(text
    .replace(/\breturn on invested capital\b/gi, "roic")
    .replace(/\breturn on equity\b/gi, "roe").replace(/\breturn on assets\b/gi, "roa")
    .replace(/\bpre[ -]tax\b/gi, "pretax").replace(/\bpro[ -]forma\b/gi, "proforma"), ignore));
  const printed = tokens(description.metric), cited = tokens(label);
  const subset = (words: string[], side: Set<string>) => words.filter(w => side.has(w));
  for (const [name, words] of [
    ["level", ["gross", "operating", "net", "pretax", "ebit", "ebitda"]],
    ["share basis", ["basic", "diluted"]],
  ] as const) {
    const a = subset([...words], printed), b = subset([...words], cited);
    if (a.length && b.length && (a.length !== b.length || a.some(w => !b.includes(w)))) return `${name} differs`;
  }
  const basis = ["non-gaap", "adjusted", "core", "underlying", "organic", "proforma", "normalized"];
  if (printed.size && cited.size && Boolean(subset(basis, printed).length) !== Boolean(subset(basis, cited).length)) return "non-default basis differs";
  if (/^payload\.(?:segments|segment-revenue)\./.test(record.id)) {
    const start = label.indexOf(": ");
    if (start >= 0) {
      let member = label.slice(start + 2);
      if (record.id.startsWith("payload.segment-revenue.")) member = member.split(/ revenue\b/i)[0];
      const shown = tokens(description.segment);
      if (shown.size && [...tokens(member)].some(w => !shown.has(w))) return "segment member differs";
    }
  }
  const heads = [
    ["revenue", "revenues", "sales", "turnover"], ["income", "earnings", "profit", "profits"],
    ["eps"], ["margin"], ["cash"], ["debt"], ["equity"], ["assets"],
    ["capex", "expenditure", "expenditures"], ["dividend", "dividends"], ["ebitda"],
    ["roic"], ["roe"], ["roa"], ["price"], ["yield"], ["shares"],
  ];
  // Normalize the vocabulary with the same synonym/stem reader as the labels.
  const present = (side: Set<string>) => heads.map((words, i) => words.some(w => [...tokens(w)].some(t => side.has(t))) ? i : -1).filter(i => i >= 0);
  const a = present(printed), b = present(cited);
  return a.length && b.length && !a.some(i => b.includes(i)) ? "metric head differs" : null;
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
function houseAspectScore(record: NumericProvenanceRecord): boolean {
  const aspect = /^computed\.scores\.(fundamentals|valuation|technicals|quality|leadership|moat|balanceSheet)$/.exec(record.origin)?.[1];
  return aspect !== undefined && record.kind === "computed" && record.unit === "score" &&
    record.id === `computed.deterministic-aspect-scores.${aspect.toLowerCase()}-score` && record.label === `${aspect} score`;
}
function annualRoteReading(record: NumericProvenanceRecord): boolean {
  return record.kind === "computed" && record.unit === "percent" && record.origin === "computed.returns.rote" &&
    record.id === "computed.valuation.rote-the-return-p-tbv-is-read-against" && record.label === "ROTE (the return P/TBV is read against)";
}
function beneishScoreReading(record: NumericProvenanceRecord): boolean {
  return record.kind === "computed" && record.unit === "score" && record.origin === "computed.forensics.beneish" &&
    record.id === "computed.forensics.beneish-m" && record.label === "Beneish M";
}
function rsiIndexReading(record: NumericProvenanceRecord): boolean {
  return record.kind === "computed" && record.unit === "index" && record.origin === "computed.technicals.rsi14" &&
    record.id === "computed.technicals.rsi-14" && record.label === "RSI-14";
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
    // D-187: names belong to these producers, never to arbitrary numeric rows.
    if (record.id === "computed.valuation.dcf-per-share" && record.origin === "computed.valuation.dcf" &&
      record.unit === "currency-per-share" && label === "DCF per share") forms.add("DCF base-case value per share");
    if (reverseDcfGrowth(record)) forms.add("reverse DCF implies year-one revenue growth");
    if (record.id === "computed.valuation.excess-return-per-share" && record.origin === "computed.valuation.excessReturn" &&
      record.unit === "currency-per-share" && label === "excess-return per share") forms.add("excess-return value per share");
    if (annualRoteReading(record)) forms.add("return on tangible common equity");
    if (beneishScoreReading(record)) {
      forms.add("Beneish M score");
      forms.add("Beneish M-score");
      if (classifyBeneishVerdict(record.value) === "unlikely") {
        forms.add("Beneish M score read as unlikely manipulation");
        forms.add("Beneish M score read as manipulation unlikely");
      }
    }
    if (houseAspectScore(record) && label === "balanceSheet score") forms.add("balance sheet score");
    const annualPe = /^P\/E \(current, (FY\d{4})\)$/.exec(label)?.[1];
    if (annualPe && record.origin === "computed.valuation.multiples.peTtm" && record.unit === "ratio" &&
      record.id === `computed.valuation.p-e-current-${annualPe.toLowerCase()}` && record.period === annualPe && record.fiscalPeriod === annualPe)
      forms.add(`price to earnings on ${annualPe} diluted EPS`);
    if (record.origin === "computed.valuation.multiples.evToEbitda" && record.unit === "ratio" && label === "evToEbitda (current)")
      forms.add("EV/EBITDA");
    if (record.id === "computed.technicals.last-close" && record.origin === "computed.technicals" &&
      record.unit === "currency-per-share" && label === "last close") forms.add("last settled close");
    if (record.id === "computed.capital-cash.weighted-average-diluted-common-share-change-5y-total" &&
      record.origin === "computed.capital.shareCount" && record.unit === "percent" && label === "weighted-average diluted common-share change (5y total)") {
      forms.add("weighted-average diluted common-share change over five years");
      forms.add("weighted-average diluted share change over five years");
    }
    if (currentCapitalFcfReading(record) === "after-sbc") forms.add("standardized free cash flow after stock compensation");
    if (record.id === "computed.returns.wacc" && record.origin === "computed.returns.wacc" && record.unit === "percent" && label === "WACC") forms.add("WACC assumption");
    const projection = projectionReading(record);
    if (projection !== null) {
      const { metric, scenario, window } = projection;
      const name = metric === "epsDiluted" ? "operating EPS" : metric === "fcf" ? "unlevered free cash flow" : metric;
      forms.add(`${scenario === "weighted" ? "weighted" : `${scenario}-case projected`} ${name} ${window}`);
      if (scenario === "weighted") {
        forms.add(`weighted ${name} projection ${window}`);
        forms.add(`weighted ${name} ${window} projected`);
        if (metric === "fcf") forms.add(`weighted unlevered free cash flow to the firm ${window} projected`);
      }
      if (scenario === "weighted") forms.add(`fixed-prior weighted ${name} ${window}`);
      if (metric === "revenue") forms.add(`${scenario === "weighted" ? "weighted" : `${scenario}-case projected`} ${name} ${window} modeled`);
    }
    if (financialPiotroskiCoverage(record) !== null) forms.add("financial variant Piotroski score");
    if (record.unit === "score" && /^computed\.scores\.[a-z]+$/.test(record.origin) &&
      record.id.startsWith("computed.deterministic-aspect-scores.") && /^[a-z]+ score$/.test(label)) forms.add(`quantitative ${label}`);
    if (record.origin === "computed.valuation.multiples.peTtm" && record.unit === "ratio" && label === "peTtm (current)") {
      forms.add("P/E TTM (current)");
      forms.add("trailing price to earnings multiple");
      forms.add("market capitalization to trailing common earnings");
      // D-182 (TSM paid run): "The trailing P/E was 26.4x" named this record but read as no metric.
      forms.add("trailing P/E");
      forms.add("trailing price to earnings");
    }
    if (record.origin === "computed.valuation.multiples.priceToTbv" && record.unit === "ratio" && label === "priceToTbv (current)") {
      forms.add("price to tangible book value");
      forms.add("price to tangible book");
      if (record.id === "computed.valuation.pricetotbv-current") forms.add("current price to tangible book value");
    }
    if (record.origin === "computed.capital.current.debtBridge.loanOwnerPayables" && label === "loan owner payables")
      forms.add("payables to third-party loan owners");
    if (record.origin === "computed.valuation.peerCoverage.market-cap-ttm-common-earnings.count" && label === "Market cap / TTM common earnings eligible peer count after filtering")
      forms.add("eligible peer count for market capitalization to trailing common earnings after filtering");
    // R9 renamed these labels to name the cash-flow add-back basis; the same readings hold.
    if (record.origin === "computed.capital.sbc" && (label === "SBC % revenue" || label === "SBC, cash-flow add-back / revenue"))
      forms.add("stock based compensation as a share of revenue");
    if (record.origin === "computed.capital.current.cashBridge.stockBasedCompensation" && label === "SBC, cash-flow add-back")
      forms.add("stock based compensation");
    if (record.origin === "computed.valuation.multiples.priceToBook" && record.unit === "ratio" && label === "priceToBook (current)")
      forms.add("price to book");
    if (record.origin === "computed.capital.capexIntensity" && record.unit === "percent" && label === "capex/revenue (latest)")
      forms.add("capex as a share of revenue");
    if (record.origin === "computed.technicals.relativeStrength.12m1m" && record.unit === "percentage-points" && label === "relative strength vs SPY, 12-1 month (latest month skipped)")
      forms.add("relative strength versus SPY over 12 months skipping the latest month");
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
  // These legacy payload labels contain a sign legend, not an additional metric.
  if (record.unit === "currency" && record.kind === "provider" &&
    /^payload\.statements\.cash-flow-(?:annual|quarterly)\./.test(record.id)) {
    if (label === "capex (negative)") { forms.add("capital expenditure"); forms.add("capex"); }
    if (label === "buybacks (negative)") { forms.add("buybacks"); forms.add("share repurchases"); }
  }
  if (record.kind === "provider" && record.id.startsWith("payload.filing-facts.") && /^edgar:8-K\s/.test(record.origin)) {
    if (record.unit === "currency" && / \(appointment package\)$/.test(label)) forms.add(label.replace(/ \(appointment package\)$/, ""));
  }
  if (record.kind === "provider") {
    if (record.id === "payload.quote.price" && record.origin === "fmp:quote" && record.unit === "currency-per-share" && label === "price")
      forms.add("ADS price");
    if (record.origin === "fmp:price-target-consensus" && label === "price target consensus") forms.add("provider consensus price target");
    if (record.origin === "fmp:price-target-consensus" && /^price target (low|high)$/.test(label)) forms.add(`provider ${label}`);
    if (record.origin === "fmp:analyst-estimates" && /^est (revenue|EPS) \d{4}-\d{2}-\d{2}$/.test(label))
      forms.add(label.replace(/^est /, "consensus "));
    if (record.origin === "fmp:analyst-estimates" && record.id.startsWith("payload.estimates.est-") && /^est (revenue|EPS) \d{4}-\d{2}-\d{2}$/.test(label))
      forms.add(label.replace(/^est /, "provider estimated "));
    if ((label === "stock-based comp" || label === "SBC, cash-flow add-back") && /^edgar:cash-flow\(/.test(record.origin)) forms.add("stock based compensation");
    if (record.origin === "edgar:xbrl us-gaap/CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents" &&
      /^Combined cash including restrictions \(reported\), as of \d{4}-\d{2}-\d{2}$/.test(label)) forms.add(label.replace(" (reported)", ""));
    if (record.origin === "fmp:insider-statistics" && record.unit === "count") {
      const trades = /^insider (sale|purchase) transactions \(Form 4 code ([SP])\), (four calendar quarters ended \d{4}-\d{2}-\d{2})$/.exec(label);
      if (trades && trades[2] === (trades[1] === "sale" ? "S" : "P")) forms.add(`Insiders made ${trades[1]} transactions ${trades[3]}`);
      if (trades && trades[2] === (trades[1] === "sale" ? "S" : "P") && record.id.startsWith("payload.insiders."))
        forms.add(`there were insider ${trades[1]} transactions (Form 4 code ${trades[2]}) in the ${trades[3]}`);
    }
    if (record.origin === "fmp:insider-statistics" && record.unit === "shares") {
      const disposed = /^insider shares disposed, all reported dispositions incl\. open-market sales, tax withholding and gifts, (four calendar quarters ended \d{4}-\d{2}-\d{2})$/.exec(label);
      if (disposed) forms.add(`Insiders disposed ${disposed[1]}, a total that includes open-market sales tax withholding and gifts`);
      const total = /^insider shares (acquired|disposed), all reported (?:acquisitions|dispositions) incl\. (.+), (four calendar quarters ended \d{4}-\d{2}-\d{2})$/.exec(label);
      if (total) forms.add(`insider shares ${total[1]}, including ${total[2]}, totalled ${total[3]}`);
    }
    if (record.origin === "finnhub:insider-sentiment" && record.unit === "index" && /^MSPR \d{4}-(?:0[1-9]|1[0-2])$/.test(label))
      { forms.add(label.replace("MSPR", "monthly insider sentiment index")); forms.add(label.replace("MSPR", "insider sentiment index (MSPR)")); }
    if (record.origin === "fred:BAMLH0A0HYM2" && label === "BAMLH0A0HYM2 (core)" && record.unit === "percent")
      forms.add("high-yield option-adjusted spread");
  }
  return [...forms];
}
/** Only the forward producer defines operating EPS and unlevered FCF. */
function projectionReading(record: NumericProvenanceRecord): { metric: string; scenario: string; window: string } | null {
  const match = /^(revenue|operatingMargin|epsDiluted|fcf) (weighted|bull|bear) (12M ending \d{4}-\d{2}-\d{2})$/.exec(record.label ?? "");
  if (!match || record.kind !== "computed" || record.id !== `computed.weighted-projections.${match[1].toLowerCase()}-${match[2]}-${match[3].toLowerCase().replace(/ /g, "-")}` ||
    record.origin !== `computed.projections.${match[1]}.${match[2]}` || record.period !== match[3]) return null;
  const unit = match[1] === "operatingMargin" ? "percent" : match[1] === "epsDiluted" ? "currency-per-share" : "currency";
  return record.unit === unit ? { metric: match[1], scenario: match[2], window: match[3] } : null;
}
function reverseDcfGrowth(record: NumericProvenanceRecord): boolean {
  return record.kind === "computed" && record.id === "computed.valuation.reverse-dcf-implied-revenue-growth" &&
    record.origin === "computed.valuation.reverseDcf" && record.unit === "percent" && record.label === "reverse-DCF implied revenue growth";
}
function currentCapitalFcfReading(record: NumericProvenanceRecord): "standardized" | "after-sbc" | null {
  if (record.kind !== "computed" || record.unit !== "currency" || recordWindow(record) === null) return null;
  if (record.id === "computed.current-capital.standardized-fcf" && record.origin === "computed.capital.current.cashBridge.standardizedFcf" && record.label === "standardized fcf") return "standardized";
  if (record.id === "computed.current-capital.after-sbc-standardized-fcf" && record.origin === "computed.capital.current.cashBridge.afterSbcStandardizedFcf" && record.label === "after sbc standardized fcf") return "after-sbc";
  return null;
}
/** D-187 revises D-160 only for negative statement buyback/capex observations. */
function statementOutflow(record: NumericProvenanceRecord): boolean {
  return record.kind === "provider" && record.unit === "currency" && record.value < 0 &&
    /^payload\.statements\.cash-flow-(?:annual|quarterly)\.\d{4}-\d{2}-\d{2}\./.test(record.id) &&
    /^(?:capex|buybacks) \(negative\)$/.test(record.label ?? "");
}
/** The coverage is metadata explicitly printed by this producer, never inferred from a score. */
function financialPiotroskiCoverage(record: NumericProvenanceRecord): { evaluated: number; total: number } | null {
  if (record.kind !== "computed" || record.origin !== "computed.forensics.piotroski" || record.unit !== "score") return null;
  const match = /^Piotroski F \(financial variant, (\d) of (9) signals [\u2014-] (\d) withheld: [A-Za-z, ]+\)$/.exec(record.label ?? "");
  return match && Number(match[1]) + Number(match[3]) === Number(match[2])
    ? { evaluated: Number(match[1]), total: Number(match[2]) } : null;
}
/** Explicit typed-source metadata/formula readings; replacements preserve quantity offsets. */
function typedClaimContext(text: string, record: NumericProvenanceRecord): string | null {
  const blank = (match: string): string => " ".repeat(match.length);
  if (annualRoteReading(record) || beneishScoreReading(record)) {
    // Keep the stated fiscal year, including a wrong one. This spelling does
    // not supply a fiscal basis; retained producer evidence must still prove it.
    text = text.replace(/\bfiscal(?: year)?\s+(\d{4})\b/gi, (match, year: string) => `FY${year}`.padEnd(match.length));
  }
  if ((houseAspectScore(record) || beneishScoreReading(record) || rsiIndexReading(record) ||
    (record.kind === "provider" && record.origin === "fmp:insider-statistics" && record.unit === "count" && record.id.startsWith("payload.insiders."))) &&
    /\bper[\s-]+share\b/i.test(text)) return null;
  if (rsiIndexReading(record)) {
    const horizons = [...text.matchAll(/\bRSI[-\s]?(\d+)\b/gi)];
    if (!horizons.length || horizons.some(match => match[1] !== "14")) return null;
  }
  if (record.id === "computed.capital-cash.weighted-average-diluted-common-share-change-5y-total" &&
    record.origin === "computed.capital.shareCount" && record.label === "weighted-average diluted common-share change (5y total)" &&
    /\bper[\s-]+(?:share|year)\b|\bannualized\b/i.test(text)) return null;
  if (projectionReading(record) !== null) {
    // Read the producer's window in its own spelling. The stated endpoint is
    // retained for the ordinary period check, including a wrong endpoint.
    text = text.replace(/\bfor (?:the )?(?:12|twelve) months (?:ending|to)\b/gi, match => "12M ending".padEnd(match.length));
  }
  if (reverseDcfGrowth(record)) {
    // This is the model's year-one growth over starting TTM revenue. TTM in
    // this complete phrase names its denominator, not a historical window.
    text = text.replace(/\byear-one revenue growth over (?:TTM|trailing twelve-month revenue)\b/gi,
      match => "year-one revenue growth".padEnd(match.length));
  }
  if (currentCapitalFcfReading(record) !== null) text = text.replace(/\bfor the twelve months to\b/gi, match => "on the TTM to".padEnd(match.length));
  // A signed distance from a high is a level, not an inequality or a temporal
  // fall. Only this producer and this complete grammatical relation establish it.
  if (record.origin === "computed.technicals.range52w" && record.label === "% from 52w high" && record.unit === "percent")
    text = text.replace(/^(?:The )?share price was (\d+(?:\.\d+)?)% below its 52-week high\b/i, "% from 52w high was -$1%");
  if (record.unit === "score" && record.id.startsWith("computed.deterministic-aspect-scores.") &&
    /^computed\.scores\.[a-z]+$/i.test(record.origin)) {
    let conflict = false;
    text = text.replace(/\(grade ([ABCDF])\)|, inside the (?:neutral )?([ABCDF]) band|, (?:grade|in band) ([ABCDF])\b/gi, (match, a: string | undefined, b: string | undefined, c: string | undefined) => {
      if ((a ?? b ?? c)?.toUpperCase() !== scoreToBand(record.value)) conflict = true;
      if (/\bneutral\b/i.test(match) && !isNeutralScore(record.value)) conflict = true;
      return blank(match);
    });
    if (conflict) return null;
  }
  const coverage = financialPiotroskiCoverage(record);
  if (coverage !== null) {
    let conflict = false;
    text = text.replace(/, measured on (?:(?:the )?(\d+) of (\d+) signals that can be evaluated for this lender|(\d+) of the (\d+) signals)/gi, (match, a: string | undefined, b: string | undefined, c: string | undefined, d: string | undefined) => {
      const evaluated = a ?? c!, total = b ?? d!;
      if (Number(evaluated) !== coverage.evaluated || Number(total) !== coverage.total) conflict = true;
      return blank(match);
    });
    if (conflict) return null;
    text = text.replace(/\bF-score\b/gi, "  score");
  }
  if (record.unitScale === "fraction" && record.unit === "ratio") text = text.replace(/\bas a fraction\b/gi, blank);
  // These verbs describe the attachment of the number, never its metric.
  text = text.replace(/\bnumbered\b/gi, blank);
  text = text.replace(/\bbetween (\d{4}-\d{2}-\d{2}) and (\d{4}-\d{2}-\d{2})\b/gi,
    (match, start: string, end: string) => recordEstablishesInterval(`${start} to ${end}`, record) ? `${start} to ${end}` : match);
  if (record.asOf) text = text.replace(new RegExp(String.raw`\bat (?:the )?${record.asOf} quote\b`, "gi"), match => match.replace(/quote/i, "     "));
  if (record.origin === "computed.technicals.relativeStrength.6mo") text = text.replace(/\bover the six months\b/gi, "over six months    ");
  if (record.unit === "currency" && record.value < 0 && record.label === "income tax expense")
    text = text.replace(/, a benefit(?=\.)/gi, blank);
  if (statementOutflow(record)) text = text.replace(/\(cash outflow\)|\bof cash outflow\b/gi, blank);
  if (record.unitScale === "fraction" && record.value === 0 && /^computed\.scores\.[a-z]+\.dataCompleteness$/i.test(record.origin))
    text = text.replace(/, so (?:no quantitative (?:[a-z-]+ )?score exists|the quantitative valuation grade defaults to the neutral band|the capital-stewardship proxy produced no score)/gi, blank);
  if (record.unit === "count" && /^computed\.valuation\.peerCoverage\.[\w-]+\.count$/.test(record.origin) && record.value === 0)
    text = text.replace(/, so no peer median exists/gi, blank);
  // The producer's disposition categories form one total's description.
  // Keep every category while avoiding an "and" clause break after the amount.
  if (record.kind === "provider" && record.origin === "fmp:insider-statistics" && record.unit === "shares")
    text = text.replace(/\b(open-market sales, tax withholding|awards, option exercises) and gifts\b/gi, (_match, categories: string) => `${categories},    gifts`);
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
  const bridge = /^TTM to (\d{4}-\d{2}-\d{2}) \((\d{4}-\d{2}-\d{2}) to \1\)$/.exec(record.period ?? "");
  if (bridge && record.periodContext?.kind === "duration" && record.periodContext.basis === "rolling-12-month" &&
    record.periodContext.start === bridge[2] && record.periodContext.end === bridge[1]) return { key: "TTM", start: bridge[2]!, end: bridge[1]! };
  const match = /^\s*(ttm|ltm|ytd)\s*:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\s*$/i.exec(record.period ?? "");
  return match ? { key: match[1].toLowerCase() === "ytd" ? "YTD" : "TTM", start: match[2], end: match[3] } : null;
}
/** A pipeline-owned terminal duration label can establish its start, never an arbitrary second date. */
function explicitLabelSpan(text: string, record: NumericProvenanceRecord): { start: string; end: string } | null {
  const interval = /\b(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})\b/.exec(text);
  const contextFiscal = record.periodContext?.fiscalLabel;
  const fiscalAgrees = !contextFiscal || !record.fiscalPeriod || contextFiscal.toUpperCase().replace(/\s/g, "") === record.fiscalPeriod.toUpperCase().replace(/\s/g, "");
  if (interval && fiscalAgrees && recordEstablishesInterval(interval[0], record) && periodLabels(text).length === 2)
    return { start: interval[1]!, end: interval[2]! };
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
function operandsInOrder(claimWords: readonly string[], operands: LabelOperands, ignore: readonly string[]): boolean {
  const stem = (word: string): string => word.length > 3 ? word.replace(/s$/, "") : word;
  const left = metricTokens(operands.left, ignore, { keepDirectionWords: true }).map(stem);
  const right = metricTokens(operands.right, ignore, { keepDirectionWords: true }).map(stem);
  const l = left.filter(w => !right.includes(w) && !w.startsWith("window")).at(-1);
  const r = right.find(w => !left.includes(w) && !w.startsWith("window"));
  const words = claimWords.map(stem);
  return l === undefined || r === undefined || !words.includes(l) || !words.includes(r) || words.indexOf(l) < words.indexOf(r);
}

function namesMetric(claim: string[], source: string[]): boolean {
  if (claim.length === 0 || source.length === 0) return false;
  const stem = (word: string): string => word.length > 3 ? word.replace(/ies$/, "y").replace(/s$/, "") : word;
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
 * AI-305 / D-129 (OD-1) revises the clause-wide half: the clause still carries the verb and the context, but the words the
 * sentence gives to the figure itself (its own description, Context.own) must be named by the claim too, so a figure the
 * sentence gives to another noun ("a record of nearly $26.0 billion to shareholders") no longer binds a free-cash-flow claim.
 * The two tests are conjoined, so this never admits a candidate the clause test rejected.
 * AI-503 / D-130: a comparison base binds only a comparison base, and a move's end takes the move's head (`Context.base`, `moveHead`).
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
  const periods = periodLabels(title).filter((period) => period.kind === "date" || period.kind === "period");
  const reporting = new RegExp(String.raw`financial results for the three and six months ended (${MONTH_NAMES})\s+(\d{1,2}),\s+(\d{4})`, "i").exec(excerpt.text);
  if (reporting) {
    const month = MONTHS[reporting[1]!.toLowerCase()]!;
    const quarter = month / 3;
    const date = `${reporting[3]}-${String(month).padStart(2, "0")}-${reporting[2]}`;
    if (Number.isInteger(quarter) && reporting[2] === (month === 3 || month === 12 ? "31" : "30") &&
      periods.some(period => period.key === `Q${quarter}FY${reporting[3]}`))
      periods.push(...periodLabels(`${date} Q${quarter} ${reporting[3]}`));
  }
  return periods;
}
/** AI-303 / C-6: the windows the excerpt's title states ("quarter ended …", a Q<n> FY label is a quarter, an FY label the year). */
function excerptWindows(excerpt: TextExcerpt): Set<string> {
  const title = excerpt.title
    .replace(/\bfiled \d{4}-\d{2}-\d{2}\b/gi, " ")
    .replace(/\b\d{10}-\d{2}-\d{6}\b/g, " ")
    .replace(LABEL_WINDOW, (match, quarter: string | undefined) => quarter ? " for the quarter " : " for the year ");
  // A title never establishes a prior fiscal year-end (final review, AI-303-V3).
  const windows = new Set(periodLabels(title, { loose: true }).filter((period) => period.kind === "window" && period.key !== PRIOR_FISCAL_YEAR_END)
    .map((period) => period.key));
  for (const period of excerptPeriods(excerpt)) {
    if (period.kind !== "period") continue;
    if (/^Q[1-4]/.test(period.key)) windows.add("quarter");
    else if (/^FY/.test(period.key)) windows.add("annual");
    if (/^Q4|^FY/.test(period.key)) windows.add("FYE"); // AI-303-V3
  }
  return windows;
}

const HEADER_DATE = new RegExp(String.raw`\b(?:${MONTH_NAMES})\.?\s+\d{1,2},?\s+(?:19|20)\d{2}\b|\b\d{4}-\d{2}-\d{2}\b`, "gi");

interface TableColumn { label: string; scope?: string; period: PeriodReference; window: PeriodReference | null; scale: number | null; exceptPerShare: boolean; dollars: boolean; rowStart: number }
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
/**
 * The per-share basis is named in the words ("Basic net income per share"), not after the figure; "EPS" alone is not read (DECISIONS,
 * "Audit batch B2: known residuals of the claim-verifier number fixes").
 */
function perShareInWords(quantity: Quantity, label: string): boolean {
  return quantity.unit === "currency" && /\bper\s+share\b/i.test(label);
}
/**
 * A table row label that names a per-share basis: "per share", "per basic share", "per diluted share", "per common share", "per
 * ordinary share" (up to two of those qualifiers, "per diluted common share") or "EPS" (Codex fixes re-review, Y1).
 */
const PER_SHARE_ROW = /\bper[\s-]+(?:(?:basic|diluted|common|ordinary)[\s-]+){0,2}share\b|\beps\b/i;
/**
 * AI-403 / D-45: under "except per share data" a decimal cell is the per-share line only when its own row names a per-share basis
 * ("Net income per share: Basic", "Diluted EPS"). Decimal precision alone never makes a cell per share, whatever the declared
 * scale: "Revenue $ 5.0" under "($ in millions, except per share data)" is $5.0 million (PR #71 Codex review).
 */
function isPerShareCell(quantity: Quantity, column: { scale: number | null; exceptPerShare: boolean; label: string } | undefined): boolean {
  if (column === undefined || !column.exceptPerShare || quantity.step >= 1) return false;
  return PER_SHARE_ROW.test(rowLead(column.label));
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
function tableColumns(text: string, found: readonly Quantity[]): Map<Quantity, TableColumn | null> {
  const out = new Map<Quantity, TableColumn | null>();
  const dates = [...text.matchAll(HEADER_DATE)].map((m) => ({ start: m.index, end: m.index + m[0].length, raw: m[0] }));
  // D-66: a 10-Q table states its quarter and its year to date side by side,
  // each run of dates closed by a change column: "Three Months Ended Six
  // Months Ended Jul 26, 2026 Jul 27, 2025 $ Change Jul 26, 2026 Jul 27, 2025
  // $ Change". Such a header has one column per date and per change column;
  // the change columns bind nothing, and the n-th "… Months Ended" names the
  // n-th run's window.
  const headers: { start: number; end: number; columns: ({ date: string; run: number } | null)[]; runs: number;
    windows?: (PeriodReference | null)[]; scale?: number; exceptPerShare?: boolean; dollars?: boolean; scope?: string }[] = [];
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
    const moneyPercent = /^\s*\$\s+Change\s+%\s+Change\b/i.exec(text.slice(end, end + 40));
    const trailing = CHANGE_COLUMN.exec(text.slice(end, end + 24));
    if (moneyPercent !== null && columns.length > 1) { columns.push(null, null); end += moneyPercent[0].length; }
    else if (trailing !== null && columns.length > 1) { columns.push(null); end += trailing[0].length; }
    if (columns.filter((c) => c !== null).length > 1) {
      const declaration = /\$ in (thousands|millions|billions) unless noted As of \(Unaudited\)\s*$/i.exec(text.slice(Math.max(0, dates[i]!.start - 100), dates[i]!.start));
      headers.push({ start: dates[i]!.start, end, columns, runs: run + 1,
        ...(moneyPercent ? { dollars: true } : {}), ...(declaration ? { dollars: true, scale: SCALES[declaration[1]!.toLowerCase()] } : {}) });
    }
    i = j + 1;
  }
  // A flattened quarter/year header has four levels and two YoY columns.
  // Admit the complete repeated layout only; years cannot be assigned by
  // proximity and a change column cannot masquerade as another level.
  const quarterly = /\b(Q[1-4])\s+\1\s+(3|6|9|12)M YTD\s+\2M YTD\s+\1\s+\2M YTD\s+\(Unaudited\)\s+((?:19|20)\d{2})\s+((?:19|20)\d{2})\s+\3\s+\4\s+YoY\s*%\s+YoY\s*%/gi;
  for (const match of text.matchAll(quarterly)) {
    if (match[3] === match[4]) continue;
    const declaration = /\$\s+in\s+(thousands|millions|billions)(, except per share or otherwise noted| unless noted)\s*$/i.exec(text.slice(Math.max(0, match.index - 100), match.index));
    headers.push({ start: match.index, end: match.index + match[0].length,
      columns: [{ date: `${match[1]} ${match[3]}`, run: 0 }, { date: `${match[1]} ${match[4]}`, run: 0 },
        { date: match[3]!, run: 1 }, { date: match[4]!, run: 1 }, null, null], runs: 2,
      windows: [periodLabels("quarterly")[0]!, periodLabels(`${match[2]} months ended`)[0] ?? null],
      scale: declaration ? SCALES[declaration[1]!.toLowerCase()] : 1,
      exceptPerShare: declaration?.[2]?.includes("per share") ?? false, dollars: declaration !== null });
  }
  // An operating update states each quarter explicitly, interleaving two
  // percentage-change columns. Read the complete five-cell layout only.
  const operating = /\bDollars in (Thousands|Millions|Billions)\s+(Q[1-4] \d{4})\s+(Q[1-4] \d{4})\s+Q\/Q Change\s+(Q[1-4] \d{4})\s+Y\/Y Change\b/gi;
  for (const match of text.matchAll(operating)) {
    if (new Set([match[2], match[3], match[4]]).size !== 3) continue;
    headers.push({ start: match.index, end: match.index + match[0].length,
      columns: [{ date: match[2]!, run: 0 }, { date: match[3]!, run: 0 }, null, { date: match[4]!, run: 0 }, null],
      runs: 1, windows: [null], scale: SCALES[match[1]!.toLowerCase()], dollars: true });
  }
  // SEC tables may print the month/day once per window and the year in a
  // separate run. Both windows, repeated years and optional change columns
  // must be complete before a cell gets a date.
  const splitYear = new RegExp(String.raw`\bThree Months Ended (${MONTH_NAMES})\s+(\d{1,2}),\s+(Change\s+)?Six Months Ended \1\s+\2,\s+(?:Change\s+)?\(In (thousands|millions|billions)(?:, except percentages)?\)\s+(\d{4})\s+(\d{4})\s+(\$\s+%\s+)?\5\s+\6(?:\s+\$\s+%)?`, "gi");
  for (const match of text.matchAll(splitYear)) {
    if (match[5] === match[6] || Boolean(match[3]) !== Boolean(match[7])) continue;
    const dates = [match[5], match[6]].map(year => `${match[1]} ${match[2]}, ${year}`);
    const changes = Boolean(match[7]);
    if ((match[0].match(/\bChange\b/g) ?? []).length !== (changes ? 2 : 0) || (changes && !/\$\s+%$/.test(match[0]))) continue;
    headers.push({ start: match.index, end: match.index + match[0].length,
      columns: [{ date: dates[0]!, run: 0 }, { date: dates[1]!, run: 0 }, ...(changes ? [null, null] : []),
        { date: dates[0]!, run: 1 }, { date: dates[1]!, run: 1 }, ...(changes ? [null, null] : [])],
      runs: 2, windows: [periodLabels("three months ended")[0]!, periodLabels("six months ended")[0]!],
      ...(/Gain on servicing asset, net\s*$/i.test(text.slice(Math.max(0, match.index - 80), match.index)) ? { scope: "servicing asset" } : {}),
      scale: SCALES[match[4]!.toLowerCase()], dollars: /^\s*[A-Za-z ():]+\$\s*[\d(]/.test(text.slice(match.index + match[0].length, match.index + match[0].length + 140)) });
  }
  for (const match of text.matchAll(/\bDollars in (?:Thousands|Millions|Billions)\s+Q[1-4] \d{4}/gi)) {
    if (!headers.some(header => header.start === match.index)) headers.push({ start: match.index, end: match.index + match[0].length, columns: [], runs: 0, windows: [] });
  }
  const splitStart = new RegExp(String.raw`\bThree Months Ended (?:${MONTH_NAMES})\s+\d{1,2},\s+(?:Change\s+)?Six Months Ended`, "gi");
  for (const match of text.matchAll(splitStart)) {
    if (!headers.some(header => header.start === match.index)) headers.push({ start: match.index, end: match.index + match[0].length, columns: [], runs: 0, windows: [] });
  }
  // A recognizable but invalid later header ends the preceding table's scope.
  for (const match of text.matchAll(/\bQ[1-4]\s+Q[1-4]\s+(?:3|6|9|12)M YTD\b/gi)) {
    if (!headers.some(header => header.start === match.index))
      headers.push({ start: match.index, end: match.index + match[0].length, columns: [], runs: 0, windows: [] });
  }
  headers.sort((a, b) => a.end - b.end);
  for (const header of headers.filter(header => header.windows !== undefined)) {
    for (const quantity of found) if (quantity.start >= header.start && quantity.end <= header.end) out.set(quantity, null);
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
      const windows = header.windows ?? (named.length === header.runs || repeatedRuns ? named.map((months) => periodLabels(`${months} months ended`)[0] ?? null) : []);
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
      const plainPrefix = adjacent.every((match) => /^\(\s*(?:\$\s*)?in\s+(?:thousands|millions|billions)(?:, except percentages)?\s*\)$/i.test(match[0]));
      const scaleConflict = header.scale !== undefined && declarations.some(match => SCALES[match[1]!.toLowerCase()] !== header.scale);
      const scale = !plainPrefix || scaleWords.size > 1 || scaleConflict ? null : header.scale ?? (scaleWord === undefined ? 1 : SCALES[scaleWord] ?? 1);
      const exceptPerShare = Boolean(header.exceptPerShare || declarations.some((match) => /except\s+per[\s-]+share/i.test(match[0])));
      // "($ in millions)" makes every cell of the table dollars, not only the first row's.
      const dollars = header.dollars ?? declarations.some((match) => /\$/.test(match[0]));
      for (let c = 0; c < k; c++) {
        const column = header.columns[c];
        const period = column ? periodLabels(column.date)[0] : undefined;
        if (column && period !== undefined) {
          out.set(found[q + c]!, { label: lead, scope: header.scope, period, window: windows[repeatedRuns ? Math.floor(c / runWidth) : column.run] ?? null, scale, exceptPerShare, dollars, rowStart: Math.max(prevEnd, header.end) });
        } else if (header.windows !== undefined) out.set(found[q + c]!, null);
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
    const found = quantities(body.text).filter((quantity) => {
      const parenthesized = /^\(\d\)$/.test(body.text.slice(quantity.start - 1, quantity.end + 1)) &&
        /[A-Za-z]\s*$/.test(body.text.slice(Math.max(0, quantity.start - 3), quantity.start - 1)) && /^\s*[$(\d]/.test(body.text.slice(quantity.end + 1));
      const footnote = quantity.unit === null && /^[1-9]$/.test(body.text.slice(quantity.start, quantity.end)) &&
        /[A-Za-z]\s+$/.test(body.text.slice(0, quantity.start)) && /^\s*\$/.test(body.text.slice(quantity.end)) &&
        new RegExp(String.raw`\b${quantity.value} Excludes volume originated on the [A-Za-z]+ platform following the`).test(body.text);
      return !parenthesized && !footnote;
    });
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
    return found.flatMap((quantity, index) => {
      const column = columns.get(quantity);
      if (column === null) return [];
      if (column !== undefined) {
        // A table cell: its row label and its column's date (and the window
        // its header names), no list reading.
        const periods = column.window === null ? [column.period] : [column.period, column.window];
        // The header's window is part of the cell's description, as a prose window is of its clause's.
        const bareLabel = column.label.replace(/\(([A-Z])\)/g, (marker) =>
          // The footnote may be its own passage (R8 keeps a table and its footnotes as separate atomic units).
          /\b(?:class|series|tranche)\b/i.test(column.label) || !/\([A-Z]\)\s+[A-Z][a-z]/.test(excerpt.text) ? marker : " ".repeat(marker.length));
        let label = column.window === null ? bareLabel : `${bareLabel} ${column.window.raw}`;
        if (column.scope) label += ` ${column.scope}`;
        if (/\breported select unaudited preliminary operating data\b/i.test(body.text)) label += " preliminary";
        const note = /\b([1-9]) Excludes volume originated on the ([A-Za-z]+) platform following the/.exec(body.text);
        if (note && new RegExp(String.raw`\b${note[1]}\s*$`).test(column.label)) label += ` excluding ${note[2]}`;
        const own = { ...context(body.text, quantity, found), label, own: rowLead(bareLabel).split(":").at(-1)!, ownAfter: "", periods, bases: [], held: false, ambiguous: false, direction: null, base: false };
        const rowStart = column.rowStart + (body.text.slice(column.rowStart).length - body.text.slice(column.rowStart).trimStart().length);
        // D-66: the excerpt's own fiscal label names the column of its own
        // reporting date ("Q2 FY2027" for the three months ended 2026-07-26).
        const aliases = column.period.kind === "period" ? (/^Q[1-4]/.test(column.period.key) ? [column.period.key] : []) : inherited.some((period) => period.kind === "date" && period.key === column.period.key) && (column.window === null || column.window.key === "quarter")
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
      // A complete two-level annual comparison states each period explicitly:
      // "... for the year ended DATE was A, compared to B for the year ended
      // DATE." Bind the two dated roles before the clause-wide period reader.
      const annualLevels = found.filter(other => other.start >= own.start && other.end <= own.end);
      if (annualLevels.length === 2 && annualLevels[0]!.unit !== null && annualLevels[0]!.unit === annualLevels[1]!.unit &&
        /^\s*,\s*compared (?:to|with)\s*$/i.test(body.text.slice(annualLevels[0]!.end, annualLevels[1]!.start))) {
        const prefix = periodLabels(body.text.slice(own.start, annualLevels[0]!.start));
        let suffixText = body.text.slice(annualLevels[1]!.end, own.end);
        const suffix = periodLabels(suffixText);
        for (const period of suffix) suffixText = suffixText.replace(period.raw, " ");
        const annualDate = (periods: PeriodReference[]): boolean => periods.length === 2 && periods.some(period => period.key === "annual") && periods.some(period => period.kind === "date");
        if (annualDate(prefix) && annualDate(suffix) && /^[\s.,]*ended[\s.,]*$/i.test(suffixText)) {
          own.periods = quantity === annualLevels[0] ? prefix : suffix;
          own.bases = quantity === annualLevels[0] ? suffix : [];
        }
      }
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

/** A forecast date alone never supplies a fiscal label. A retained annual filing
 * must explicitly establish a December-31 fiscal year, with no conflicting
 * annual basis. Scope this reading to annual producers, never arbitrary records. */
export function filedCalendarFiscalLabel(record: NumericProvenanceRecord, excerpts: readonly TextExcerpt[]): string | undefined {
  const estimate = record.kind === "provider" && record.origin === "fmp:analyst-estimates" && /^est (?:revenue|EPS) \d{4}-12-31$/.test(record.label ?? "");
  const annual = record.kind === "computed" && record.period === null && record.periodContext === undefined &&
    (annualRoteReading(record) || beneishScoreReading(record) || financialPiotroskiCoverage(record) !== null || (record.origin === "computed.capital.sbc" && (record.label === "SBC % revenue" || record.label === "SBC, cash-flow add-back / revenue")));
  const quarter = record.kind === "computed" && record.origin === "fmp:income-statement(quarter)" &&
    record.id.startsWith("computed.quarterly-trend.") && record.period !== null &&
    (record.label ?? "").endsWith(`, quarter ended ${record.period}`);
  if (!estimate && !annual && !quarter) return undefined;
  const date = estimate || quarter ? record.period : record.asOf;
  if (!date || !isIsoDate(date) || (!quarter && !/^\d{4}-12-31$/.test(date))) return undefined;
  const bases = excerpts.filter(excerpt => /^edgar:10-K\b/.test(excerpt.source)).flatMap(excerpt =>
    [...excerpt.title.matchAll(/reporting period ended (\d{4}-\d{2}-\d{2}) \(FY(\d{4})\)/g)].map(match => ({ date: match[1]!, year: match[2]! })));
  if (!bases.length || bases.some(basis => basis.date !== `${basis.year}-12-31`)) return undefined;
  if (quarter) {
    const month = Number(date.slice(5, 7)), day = date.slice(8);
    if (month % 3 || day !== (month === 3 || month === 12 ? "31" : "30") ||
      !bases.some(basis => Number(date.slice(0, 4)) - Number(basis.year) >= 0 && Number(date.slice(0, 4)) - Number(basis.year) <= 1)) return undefined;
    return `Q${month / 3} FY${date.slice(0, 4)}`;
  }
  // Historical annual observations need their own filed year; the estimate
  // producer's future period may use the established calendar fiscal basis.
  return estimate || bases.some(basis => basis.date === date) ? `FY${date.slice(0, 4)}` : undefined;
}

/** Older annual-return/score records omit a fiscal label. Recover only an
 * explicit, unambiguous label from the retained annual statement on the exact
 * return/score date; asOf's calendar year alone is not evidence. */
function annualProducerFiscalLabel(record: NumericProvenanceRecord, registry: readonly NumericProvenanceRecord[]): string | null | undefined {
  if ((!annualRoteReading(record) && !beneishScoreReading(record)) || record.period !== null || record.periodContext !== undefined) return undefined;
  const labels = registry.filter(row => row.kind === "provider" &&
    /^payload\.statements\.income-statement-annual\./.test(row.id) && /^(?:fmp|edgar):income-statement\(annual\)$/.test(row.origin) &&
    row.period === record.asOf).flatMap(row => row.fiscalPeriod === undefined ? [] : [row.fiscalPeriod]);
  const distinct = new Set(labels);
  const label = labels[0];
  if (distinct.size > 1 || (label !== undefined && !/^FY\d{4}$/.test(label))) return null;
  return label;
}

// Section-independent: marketStructure and competitors receive the same
// source-bound numeric checks as every other SourcedClaim.
export function validateClaimNumericSupport(claim: SourcedClaim, options: {
  record?: NumericProvenanceRecord;
  excerpts: readonly TextExcerpt[];
  sourceId: string;
  reportingCurrency: string | null;
  ignoreWords?: readonly string[];
  index?: ClaimEvidenceIndex;
  seriesLatest?: ReadonlyMap<string, string>;
  registry?: readonly NumericProvenanceRecord[];
}): ClaimNumericSupport {
  const record = options.record;
  if (record === undefined) {
    // Attribution identifies the cited document, not the figure's definition.
    // Keep all negation, basis words, dates and quantities, and require the
    // named form to agree with the citation. Blanking preserves claim offsets.
    const blank = (match: string): string => " ".repeat(match.length);
    let text = claim.text;
    const form = /^edgar:(10-K|10-Q)\b/.exec(options.sourceId)?.[1];
    if (form) text = text.replace(new RegExp(String.raw`\bThe ${form}(?: notes)? (?:states?|reports?) (?:that )?`, "g"), blank);
    if (/^edgar:8-K\b/.test(options.sourceId))
      text = text.replace(/\bThe (?:(Q[1-4] \d{4}) release|company) (?:states|reports|reported) (?:that )?/g,
        (match, period: string | undefined) => period ? period.padEnd(match.length) : blank(match));
    if (options.excerpts.some(excerpt => excerpt.source === options.sourceId && /operating update/.test(excerpt.title)))
      text = text.replace(/\bThe (preliminary )?(Q[1-4] \d{4} )?operating update reported /g,
        (match, preliminary: string | undefined, period: string | undefined) => `${preliminary ?? ""}${period ?? ""}`.padEnd(match.length));
    if (text !== claim.text) return validateClaimNumericSupport({ ...claim, text }, options);
  }
  const typedText = record === undefined ? claim.text : typedClaimContext(claim.text, record);
  if (typedText === null) return support("unchecked", "text-context-mismatch", "prose metadata or formula is not established by the cited numeric record");
  const stated = quantities(typedText);
  if (stated.length === 0) return support(statesNumberWord(claim.text) ? "unchecked" : "cited", "supported",
    "citation observed; factual content not machine-validated");
  if (record !== undefined) {
    if (stated.length !== 1) return support("unchecked", "text-ambiguous", "one numeric record cannot bind multiple prose quantities");
    const quantity = stated[0];
    const own = claimContext(typedText, quantity, stated);
    if ([...own.periods, ...own.bases].some((period) => period.key.startsWith("unestablished-date:"))) {
      return support("unchecked", "period-mismatch", "the prose exact date is invalid or locale-ambiguous");
    }
    // Final re-review (AI-303-V3): no record label or basis establishes a prior fiscal year-end.
    const annualFiscal = annualProducerFiscalLabel(record, options.registry ?? []);
    if (annualFiscal === null) return support("unchecked", "period-mismatch", "retained annual statements conflict on the producing record's fiscal label");
    const filedFiscal = annualFiscal ?? filedCalendarFiscalLabel(record, options.excerpts);
    const established = new Set([...basisWindows(record), ...labelLooseWindows(record), ...(filedFiscal ? basisWindows({ ...record, fiscalPeriod: filedFiscal }) : [])].filter((key) => key !== PRIOR_FISCAL_YEAR_END));
    const ignore = options.ignoreWords ?? [];
    // D-66: a per-share record's "per share" is its unit, which the prose
    // states with the figure ("USD 0.25 per share"), not in its metric words;
    // an annual growth figure is year over year by definition.
    const perShare = (words: string[]): string[] => record.unit === "currency-per-share" ? words.filter((word) => word !== "share" && word !== "shares") : words;
    // A window the record's basis establishes may be left unstated on either side.
    const unestablished = (words: string[]): string[] => words.filter((word) => ![...established].some((key) => word === `window${key.toLowerCase()}`));
    // Final review (AI-303-V3): a claim's prior fiscal year-end is checked as a period below, so it is not a metric word here.
    const claimTokens = perShare(unestablished(metricTokens(own.label, ignore, { loose: true })).filter((word) => !(word === "yoy" && established.has("annual")) &&
      word !== `window${PRIOR_FISCAL_YEAR_END.toLowerCase()}`));
    const labels = labelReadings(record);
    // AI-501: label direction nouns define the metric; a claim's attached
    // direction can instead describe the relation to its own figure.
    const claimKept = perShare(unestablished(metricTokens(own.label, ignore, { loose: true, keepDirectionWords: true })).filter((word) => !(word === "yoy" && established.has("annual")) && word !== `window${PRIOR_FISCAL_YEAR_END.toLowerCase()}`));
    const matchingLabels = labels.flatMap((label) => {
      const words = perShare(unestablished(metricTokens(`${label} ${record.period ?? ""}`, ignore, { keepDirectionWords: true })));
      const plain = perShare(unestablished(metricTokens(`${label} ${record.period ?? ""}`, ignore)));
      // A label without direction nouns reads as before AI-501: the claim's own
      // direction words ("74%, up from Q2 2019") state a relation, not the metric.
      if (words.every((word) => plain.includes(word))) return namesMetric(claimTokens, plain) ? [{ label, words: claimTokens }] : [];
      return namesMetric(claimKept, words) ? [{ label, words: claimKept }] : own.direction !== null && namesMetric(claimTokens, words) ? [{ label, words: claimTokens }] : [];
    });
    if (matchingLabels.length === 0) {
      return support("unchecked", "text-context-mismatch", "prose does not identify the metric of the cited numeric record");
    }
    if (!matchingLabels.some(({ label, words }) => {
      const operands = labelOperands(label);
      const original = labelOperands(record.label ?? "");
      return (operands === null || operandsInOrder(words, operands, ignore)) && (original === null || operandsInOrder(words, original, ignore));
    })) return support("unchecked", "text-context-mismatch", "the prose reverses the operands of the cited difference or ratio");
    // AI-303-V4: a record citation states one figure, so the whole claim is read.
    const series = namesRecency(typedText) ? reportedSeries(record) : null;
    if (series !== null && (options.seriesLatest?.get(series.key) ?? series.date) > series.date) {
      return support("unchecked", "period-mismatch", "the prose calls the figure the latest, but a later period of the cited series is registered");
    }
    if (own.periods.some((period) => period.kind === "month" && !periodLabels(record.period ?? "").some((source) => source.key === period.key) &&
      !(record.origin === "finnhub:insider-sentiment" && periodLabels(record.label ?? "").some(source => source.key === period.key)))) {
      return support("unchecked", "period-mismatch", "a monthly prose period is not established by the typed record's period");
    }
    // A named window must be the record's own; a date against a window record
    // names one of its endpoints ("the trailing period ended 2026-07-26").
    const window = recordWindow(record);
    const explicitSpan = explicitLabelSpan(typedText, record);
    if (window === null && /\b\d{4}-\d{2}-\d{2}\s+to\s+\d{4}-\d{2}-\d{2}\b/i.test(typedText) && explicitSpan === null) {
      return support("unchecked", "period-mismatch",
        "the cited numeric record does not establish the complete ordered prose date interval");
    }
    const labelled = labelWindows(record);
    const fiscalPeriod = record.fiscalPeriod ?? record.periodContext?.fiscalLabel ?? filedFiscal ?? (/^(?:Q[1-4]\s*)?FY\d{4}$/i.test(record.period ?? "") ? record.period : undefined);
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
      (period.kind === "month" && record.origin === "finnhub:insider-sentiment" && periodLabels(record.label ?? "").some(source => source.key === period.key)) ||
      (fiscalPeriod !== undefined && FY_LABEL.test(period.label) && periodsAgree(period.label, fiscalPeriod, fiscalPeriod));
    const periodAgrees = (period: PeriodReference): boolean => period.kind === "window"
      ? period.key !== PRIOR_FISCAL_YEAR_END && (established.has(period.key) || labelled.has(period.key) || window?.key === period.key)
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
    // A fraction is dimensionless only when the record declares it. Only the
    // producer's declared financial Piotroski variant supplies a bare score
    // reading; generic forensic scores still need an explicit unit suffix.
    const explicitUnit = quantity.unit === null && record.unitScale === "fraction" && record.unit === "ratio" ? "ratio"
      : quantity.unit === null && /\bscore\b/i.test(own.label) && (financialPiotroskiCoverage(record) !== null || houseAspectScore(record) || beneishScoreReading(record)) ? "score"
        : quantity.unit === null && rsiIndexReading(record) ? "index"
        : quantity.unit === null && /\b(?:count|transactions?|rows)\b/i.test(own.label) && record.unit === "count" ? "count"
          : quantity.unit === null && /\bindex\b/i.test(own.label) && record.unit === "index" ? "index" : quantity.unit;
    if (explicitUnit === null) return support("unchecked", "text-ambiguous", "prose quantity has no established unit");
    if (record.unitScale === "fraction" && quantity.unit === "ratio") return support("unchecked", "unit-mismatch", "a multiple is not a dimensionless fraction");
    // A percent can state an explicitly declared unit fraction. A generic
    // ratio (including a P/E multiple) provides no such scale evidence.
    // The per-share basis may be named in the metric words instead of after
    // the figure ("Our DCF per share as of 2026-10-26 is USD 320.63"): it is
    // the record's own unit, not a total (live MSFT check, 2026-10-26).
    const normalizedQuantity = quantity.unit === "percent" && record.unit === "ratio" && record.unitScale === "fraction"
      ? { ...quantity, value: quantity.value / 100, step: quantity.step / 100, unit: "ratio" as const }
      : record.unit === "currency-per-share" && perShareInWords(quantity, own.label) ? { ...quantity, unit: "currency-per-share" as const } : { ...quantity, unit: explicitUnit };
    if (normalizedQuantity.unit !== record.unit) return support("unchecked", "unit-mismatch", "prose unit is not established by the cited numeric record");
    if (quantity.unit === "currency" || quantity.unit === "currency-per-share") {
      const currency = resolvedCurrency(quantity, options.reportingCurrency);
      if (currency === null) return support("unchecked", "currency-mismatch", "prose currency is not established");
      if (currency !== record.currency) return support("unchecked", "currency-mismatch", "prose currency is not established by the cited numeric record");
    }
    const magnitude = statementOutflow(record) && direction === null && findDirectionWords(claim.text).length === 0 && !/\binflows?\b/i.test(claim.text) &&
      normalizedQuantity.value > 0 && /\b(?:buybacks|share repurchases|capital expenditure|capex)\b/i.test(own.label);
    const signed = magnitude ? { ...normalizedQuantity, value: -normalizedQuantity.value }
      : direction !== null && normalizedQuantity.value >= 0 ? { ...normalizedQuantity, value: normalizedQuantity.value * direction.polarity } : normalizedQuantity;
    return equalValue(signed, record.value)
      ? support("validated", "supported", "every prose quantity matched its typed cited record; qualitative assertions remain unchecked")
      : support("contradicted", "value-mismatch", "prose quantity contradicts the cited numeric record");
  }
  const excerpts = options.excerpts.filter((excerpt) => excerpt.source === options.sourceId &&
    (claim.label === "JUDGMENT" || excerpt.asOf === claim.asOf));
  // Two explicit dated levels in one unambiguous table row can establish an
  // ordered comparison. Each level must pass the ordinary metric, unit,
  // precision and column checks independently. Lists, ranges, mixed metrics
  // and comparisons assembled from unrelated passages keep the old refusal.
  if (stated.length === 2 && stated[0]!.unit !== null && stated[0]!.unit === stated[1]!.unit) {
    const [level, base] = stated as [Quantity, Quantity];
    const head = /^(.+?)\s+(?:(fell|declined|decreased|rose|increased)\s+to|was)\s*$/i.exec(claim.text.slice(0, level.start));
    const periodPattern = String.raw`(?:Q[1-4]\s+(?:FY\s*)?(?:19|20)\d{2}|FY\s*(?:19|20)\d{2}|\d{4}-\d{2}-\d{2})`;
    const middle = new RegExp(String.raw`^\s+in\s+(${periodPattern})(?:\s+from|,\s+(down|up)\s+from)\s*$`, "i").exec(claim.text.slice(level.end, base.start));
    const tail = new RegExp(String.raw`^\s+in\s+(${periodPattern})(?:[.!?]|,\s+so\b|$)`, "i").exec(claim.text.slice(base.end));
    if (head && middle && tail && Boolean(head[2]) !== Boolean(middle[2])) {
      const index = options.index ?? new Map<TextExcerpt, SourceBinding[]>();
      const levels = [level, base].map((quantity, i) => validateClaimNumericSupport({ ...claim,
        text: `${head[1]} was ${claim.text.slice(quantity.start, quantity.end)} in ${i === 0 ? middle[1] : tail[1]}.` }, { ...options, index }));
      const spans = levels.flatMap(result => result.spans);
      if (levels.every(result => result.status === "validated") && spans.length === 2 &&
        spans[0]!.source === spans[1]!.source && spans[0]!.asOf === spans[1]!.asOf && spans[0]!.start === spans[1]!.start &&
        spans.every(span => excerpts.some(excerpt => index.get(excerpt)?.some(binding => binding.column !== undefined && binding.span.start === span.start && binding.span.end === span.end)))) {
        const decline = /^(?:fell|declined|decreased|down)$/i.test(head[2] ?? middle[2]!);
        const established = decline ? level.value + level.step / 2 < base.value - base.step / 2 : level.value - level.step / 2 > base.value + base.step / 2;
        if (established) return support("validated", "supported", "ordered levels matched the same cited table row and their separate period columns; qualitative assertions remain unchecked", spans);
      }
    }
  }
  const spans: ClaimSourceSpan[] = [];
  for (const quantity of stated) {
    const own = claimContext(claim.text, quantity, stated);
    if ([...own.periods, ...own.bases].some((period) => period.key.startsWith("unestablished-date:"))) {
      return support("unchecked", "period-mismatch", "the prose exact date is invalid or locale-ambiguous", spans);
    }
    if (own.ambiguous || quantity.unit === null) return support("unchecked", "text-ambiguous", "multiple unbound quantities or a missing unit in the prose clause", spans);
    if (own.held) return support("unchecked", "period-mismatch", "a period of the prose figure's clause is stated inside a parenthetical that holds another figure", spans);
    // AI-303 / C-6: a window the claim names is compared as a period (below), not as a metric word; a year-end base or start the claim
    // names is compared as a base (final re-review).
    const ownWindowTokens = new Set([...own.periods, ...own.bases].filter((period) => period.kind === "window").map((period) => `window${period.key.toLowerCase()}`));
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
      // Final re-review (AI-303-V3): a figure that lost a period to a parenthetical holding another figure has periods that cannot be
      // read. It inherits no period, header or window, and any claim it could bind is unchecked, as for an invalid date above.
      if (pool.some((candidate) => candidate.context.held)) {
        return support("unchecked", "period-mismatch", "a source period is not unambiguously associated with this figure, so its period cannot be read",
          pool.filter((candidate) => candidate.context.held).slice(0, 3).map((candidate) => candidate.span));
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
        const annualDate = candidate.context.periods.find(period => period.kind === "date");
        if (ownPeriods.length === 1 && /^FY\d{4}$/.test(ownPeriods[0]!.key) && annualDate &&
          new Set(candidate.context.periods.map(period => period.key)).size === 2 && candidate.context.periods.some(period => period.key === "annual") &&
          candidate.inherited.some(period => period.key === annualDate.key) && candidate.inherited.some(period => period.key === ownPeriods[0]!.key)) return true;
        // "increased from $A" can name a uniquely bound comparison base
        // without dating it. This does not turn that base into a current value.
        if (own.base && candidate.context.base && ownPeriods.length === 0 &&
          candidate.context.periods.every(period => period.key.startsWith("relative:"))) return true;
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
      // A dated table level and a narrative dollar change are different
      // relations. A level claim may select the explicit dated level by its
      // relation, never by preferring whichever value happens to agree.
      const relationPool = own.direction === null && pool.some(candidate => candidate.column !== undefined)
        ? pool.filter(candidate => candidate.context.direction === null || candidate.levelBeforeComparison) : pool;
      let matchingPeriods = periodFilter(relationPool);
      const calendarColumn = matchingPeriods.some(candidate => candidate.column !== undefined && candidate.inherited.some(period =>
        /^Q[1-4]FY\d{4}$/.test(period.key) && candidate.inherited.some(alias => alias.key === period.key.replace("FY", ""))));
      if (calendarColumn && matchingPeriods.some(candidate => candidate.column !== undefined && candidate.quantity.unit === quantity.unit))
        matchingPeriods = matchingPeriods.filter(candidate => candidate.quantity.unit === quantity.unit);
      const dated = matchingPeriods.filter(candidate => candidate.column !== undefined);
      // A coarse narrative restatement inheriting its date from the release
      // cannot reduce the precision of an explicit dated cell. Discard it
      // only when it independently rounds to every bound cell; a conflicting
      // restatement keeps the reading ambiguous.
      if (calendarColumn && dated.length && matchingPeriods.every(candidate => candidate.column !== undefined ||
        (candidate.context.periods.length === 0 && dated.every(cell => {
          const scale = tableScaleFor(cell.quantity, cell.column);
          return candidate.quantity.unit === cell.quantity.unit && candidate.quantity.step >= cell.quantity.step * scale &&
            resolvedCurrency(candidate.quantity, options.reportingCurrency) === resolvedCurrency(cell.quantity, options.reportingCurrency) &&
            equalValue(candidate.quantity, cell.quantity.value * scale);
        })))) matchingPeriods = dated;
      if (matchingPeriods.length === 0) {
        // Final review (AI-303-V3): a prior fiscal year-end that no bound figure's own clause states is a period gap.
        if (pool.length > 0 && own.periods.some((period) => period.key === PRIOR_FISCAL_YEAR_END)) {
          return support("unchecked", "period-mismatch", "the prose names a prior fiscal year-end that the source figure's own clause does not state",
            pool.slice(0, 3).map((candidate) => candidate.span));
        }
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
          new Set(candidate.context.periods.filter((period) => period.kind === "window").map(period => period.key)).size > 1)))) {
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
        PER_SHARE_ROW.test(rowLead(candidate.column.label)) && perShareInWords(quantity, own.label)
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
        // Final review (AI-409): a bound states no value, so two bounds at different figures do not conflict ("over $76.7 billion"
        // implies "over USD 70 billion"); only an exact claim against an exact source figure is contradicted by its value.
        if (quantity.bound !== null || candidate.quantity.bound !== null) {
          return support("unchecked", "text-context-mismatch", "the prose and the source state bounds at different figures; a bound establishes no value to compare", [candidate.span]);
        }
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
