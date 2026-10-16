/**
 * Stage C — deterministic, no-model consistency checks on the report's prose.
 *
 * WS7 (DECISIONS D-20). The verification pass measured CITATION COVERAGE only:
 * "does this figure resolve to a registry record?". It never looked at the
 * sentence wrapped around the figure, so a sentence could say a metric "rose"
 * while citing a record whose value is negative, name "Q3" while citing an
 * FY-end record, or say "bps" about a dollar figure, and still count as fully
 * cited. This module adds four checks that need no model call:
 *
 *  - DIRECTION: a direction word ("rose", "fell", "declined") glued to the cited
 *    figure must match the sign of that figure, when the figure is a signed
 *    change rather than a level. Only words whose sign is fixed by the word
 *    itself count; see {@link DIRECTION_WORDS}.
 *  - PERIOD: a period phrase that names a year ("in FY2024", "in Q3 2024") must
 *    name the year the cited record's period carries ({@link phraseNamesRecordYear}).
 *    The check compares YEARS only: a bare quarter is not checked (no fiscal
 *    calendar), and "Q3 2025" against a 2025-12-31 record agrees — the quarter
 *    itself is never adjudicated. That is deliberately looser than the
 *    citation check (`periodsAgree`), which decides whether a number VERIFIES;
 *    this one only writes a log entry, and prose names bare years ("in 2025")
 *    that no fiscal calendar in the payload can adjudicate.
 *  - UNIT: the unit token attached to the cited figure ("%", "bps", "billion")
 *    must belong to the family the record's registry unit can express. A
 *    sentence that puts a currency on a number citing a figure whose currency
 *    is not established fails as currency-not-established (D-43).
 *  - NAMED INDIVIDUAL: a claim that names a person may cite filings, transcripts,
 *    registry figures or the payload's own key-executive / executive-compensation
 *    / insider-trade rows — never a web-search result, never any other web
 *    citation (news, a press release), and never nothing. A person-row citation
 *    passes only when the cited rows list that person, and the title the claim
 *    states (D-43).
 *
 * DESIGN RULE — precision over recall. Every check first has to LOCATE the cited
 * figure inside the sentence (a number in the text whose magnitude, after any
 * scale word, matches the record's value within the precision the sentence
 * itself wrote). A sentence that mentions several figures therefore has each
 * check applied to the one it actually cites, and a sentence where the figure
 * cannot be located is reported as NOT CHECKED rather than guessed at. That is
 * why `checked` is published beside `coverage` instead of folded into it: a low
 * `checked` count is a fact about how much could be verified, and hiding it
 * inside a rate would be the same mistake as calling citation coverage accuracy.
 *
 * Pure and deterministic: no clock, no network, no model.
 */

import type {
  CheckRate,
  ConsistencyChecks,
  SourcedClaim,
  VerificationLogEntry,
} from "@/report/schema";
import {
  canonicalizeFetchedUrl,
  type CanonicalUnit,
  type CitationProvenanceRecord,
  type NumericProvenanceRecord,
} from "@/pipeline/stageC/provenance";
import { citationAsOf, citationSourceId } from "@/pipeline/stageC/citations";

export type ConsistencyCheckKind = NonNullable<VerificationLogEntry["check"]>;
export type ConsistencyFailureReason = Extract<
  NonNullable<VerificationLogEntry["reason"]>,
  | "direction-mismatch"
  | "period-word-mismatch"
  | "unit-word-mismatch"
  | "named-individual-unsourced"
  | "named-individual-web-source"
  | "credibility-source-restricted"
  | "named-individual-not-in-source"
  | "named-individual-title-mismatch"
  | "currency-not-established"
>;

export interface ConsistencyFinding {
  check: ConsistencyCheckKind;
  reason: ConsistencyFailureReason;
  /** The exact sentence that failed. */
  sentence: string;
  /** The cited figure, rendered "value unit [sourceId]". */
  figure: string;
  sourceId: string | null;
  path: string;
  /** Why it failed, in words a reader can act on. */
  note: string;
}

export interface ConsistencyClaimRef {
  claim: SourcedClaim;
  path: string;
}

export interface ConsistencyInput {
  claims: readonly ConsistencyClaimRef[];
  registry: readonly NumericProvenanceRecord[];
  citationRegistry: readonly CitationProvenanceRecord[];
  fetchedUrls: ReadonlySet<string>;
  /** Person names known from the payload and from the report's own exec cards. */
  personNames: readonly string[];
  /**
   * Organisation names the report may mention — the issuer and its peers.
   * An honorific-plus-name match that sits inside one of these ("Dr Pepper"
   * inside "Keurig Dr Pepper Inc.", "Dr. Reddy's" inside "Dr. Reddy's
   * Laboratories") is a company, not a person (audit 2026-09-06, F187).
   */
  organizationNames?: readonly string[];
  /**
   * The payload's rows about people ({@link collectPersonRows}). A claim
   * naming a person that cites a person-row tag passes only when that tag's
   * rows list the person (D-43). Absent means none: such a claim then fails,
   * never passes on the tag alone.
   */
  personRows?: readonly PersonRow[];
}

export interface ConsistencyResult {
  findings: ConsistencyFinding[];
  checks: ConsistencyChecks;
  /**
   * Report paths of claims the named-individual restriction rejected. The verify
   * pass counts these as UNSUPPORTED in factual-claim coverage: a claim about a
   * named person sourced to a web search is exactly the kind of claim the
   * restriction exists to keep out of the report, so letting the URL carry it
   * would make the coverage number say the opposite of the finding.
   */
  rejectedClaimPaths: Set<string>;
}

/* ------------------------------------------------------------------------ *
 * Counters
 * ------------------------------------------------------------------------ */

class Counter {
  passed = 0;
  failed = 0;
  pass(): void {
    this.passed += 1;
  }
  fail(): void {
    this.failed += 1;
  }
  rate(): CheckRate {
    const checked = this.passed + this.failed;
    return {
      checked,
      passed: this.passed,
      failed: this.failed,
      rate: checked === 0 ? null : this.passed / checked,
    };
  }
}

/* ------------------------------------------------------------------------ *
 * Locating the cited figure inside the sentence
 * ------------------------------------------------------------------------ */

const SCALE_WORDS: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  thousands: 1e3,
  mm: 1e6,
  m: 1e6,
  million: 1e6,
  millions: 1e6,
  bn: 1e9,
  billion: 1e9,
  billions: 1e9,
  trillion: 1e12,
  trillions: 1e12,
};

/**
 * `magnitude` is a bare scale word ("15.2 billion") with no unit token and no
 * currency prefix: it names how big the number is, not what it counts, so it
 * is admissible wherever a money OR a share figure is (audit 2026-09-06,
 * F185: it was read as money and failed correct share-count prose).
 */
type UnitFamily = "percent" | "money" | "multiple" | "shares" | "magnitude";

const PERCENT_TOKENS = new Set([
  "%",
  "percent",
  "percentage",
  "percentage point",
  "percentage points",
  "pp",
  "pps",
  "bp",
  "bps",
  "basis point",
  "basis points",
]);
const MULTIPLE_TOKENS = new Set(["x", "times"]);
const SHARE_TOKENS = new Set(["share", "shares"]);
const MONEY_TOKENS = new Set(["dollar", "dollars", "usd"]);

/** One number found in a sentence, with whatever unit decoration it carried. */
interface ParsedNumber {
  /** Character index of the first digit (or its sign/currency prefix). */
  start: number;
  end: number;
  magnitude: number;
  /** Decimal places actually written, for the match tolerance. */
  decimals: number;
  scale: number;
  scaleWord: string | null;
  unitToken: string | null;
  hadCurrencyPrefix: boolean;
}

// A signed, optionally $-prefixed number with optional thousands separators,
// followed by an optional scale word and an optional unit token.
const NUMBER_PATTERN = new RegExp(
  String.raw`([-+−])?\s*(\$|US\$)?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*` +
    String.raw`(thousands?|millions?|billions?|trillions?|bn|mm|k)?\s*` +
    String.raw`(%|percentage points?|percent|pps?|bps?|basis points?|dollars?|usd|shares?|x|times)?`,
  "gi",
);

export function parseNumbers(sentence: string): ParsedNumber[] {
  const out: ParsedNumber[] = [];
  NUMBER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NUMBER_PATTERN.exec(sentence)) !== null) {
    const [whole, , currency, digits, fraction, scaleWord, unitToken] = match;
    if (digits === undefined) continue;
    const magnitude = Number(`${digits.replace(/,/g, "")}${fraction ?? ""}`);
    if (!Number.isFinite(magnitude)) continue;
    const normalizedScale = scaleWord?.toLowerCase() ?? null;
    out.push({
      start: match.index,
      end: match.index + whole.length,
      magnitude,
      decimals: fraction === undefined ? 0 : fraction.length - 1,
      scale: normalizedScale === null ? 1 : (SCALE_WORDS[normalizedScale] ?? 1),
      scaleWord: normalizedScale,
      unitToken: unitToken?.toLowerCase() ?? null,
      hadCurrencyPrefix: currency !== undefined,
    });
    if (NUMBER_PATTERN.lastIndex === match.index) NUMBER_PATTERN.lastIndex += 1;
  }
  return out;
}

/**
 * Spans that contain digits but state no quantity, removed before a sentence
 * is asked whether it states a number (D-43). parseNumbers has no word
 * boundaries, so on the raw text "The CET1 ratio is withheld" states 1,
 * "No Form 4 filings for 2025" states 4 and 2025, and "Rule 10b5-1" states 10,
 * 5 and 1 — every natural way to write a bank's or an insider's data gap would
 * fail. Order matters: tags first (they hold dates), then dates and forms,
 * then identifiers. A scale or unit suffix keeps its number ("1.2x", "4.5bn",
 * "25bps"), and a year written as an amount ("$2025", "2025 million") is
 * kept. A currency code glued to a number ("EUR5bn") is an amount, not an
 * identifier, and is kept (review, 2026-10-13: "Net debt is EUR5bn" citing an
 * n/a row stated no number). Spelled-out numbers ("three times") are read by
 * {@link statesNumberWord}. The momentum window's name "12-1 month" is a
 * label, not a quantity (review of D-48, 2026-10-13: an absence statement in
 * the row's own wording failed as gap-source-number).
 */
// ISO codes checked beside a number. A generic [A-Z]{3} would read tickers
// ("JPM 43") as currencies, so the list is deliberate; extend it on evidence.
const CURRENCY_CODES =
  "USD|EUR|GBP|JPY|CNY|RMB|HKD|KRW|INR|CHF|CAD|AUD|NZD|TWD|SEK|NOK|DKK|BRL|MXN|ZAR|SGD|ILS";
const NON_QUANTITY_PATTERNS: readonly RegExp[] = [
  /\[[^[\]\n]*\]/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b(?:10|20|40)-[KQF](?:\/A)?\b|\b8-K(?:\/A)?\b|\bDEF ?14[AC]\b/g,
  /\b(?:Form|Item|Tier|Rule|Section|Part|Level|Pillar|Stage|Basel)\s+[0-9IVX]+[A-Za-z]?\b/g,
  new RegExp(String.raw`\b(?!(?:${CURRENCY_CODES})\d)[A-Za-z]+\d[\w-]*`, "g"),
  /\b\d+(?!(?:x|b|bn|m|mm|mn|k|t|tn|bps?|pps?|pct|percent)\b)[A-Za-z][\w-]*/gi,
  // The skip-month momentum window's name (D-48), the technicals row's own
  // label; before the next rule, which would leave "12-" of "12-1-month". Only
  // this window: a general "3-6 months" range can state a duration.
  /\b12[-–]1[\s-]months?\b/gi,
  /\b\d+-(?:year|month|quarter|day|week)s?\b/gi,
  /(?<![$€£¥\d.,])\b(?:19|20)\d{2}\b(?![.,]\d|\s*(?:%|percent|percentage|pps?\b|bps?\b|basis|x\b|times\b|k\b|thousand|mm\b|m\b|mn\b|million|bn\b|billion|tn\b|trillion|dollars?\b|usd\b|shares?\b))/gi,
];

function stripNonQuantities(text: string): string {
  let out = text;
  for (const pattern of NON_QUANTITY_PATTERNS) out = out.replace(pattern, " ");
  return out;
}

/**
 * The numbers a sentence states, as written (magnitude, before any scale
 * word), once tags, dates, filing forms and identifiers are set aside. Used
 * where a citation can support no number at all — a gap or an unestablished
 * figure — and to read the numbers a text row itself shows.
 */
export function proseNumbers(text: string): number[] {
  return parseNumbers(stripNonQuantities(text)).map((parsed) => parsed.magnitude);
}

/** Quantity-only text with original offsets intact, for source-span binding. */
export function proseQuantityText(text: string): string {
  let out = text;
  for (const { pattern } of DATE_PATTERNS) out = out.replace(pattern, (match) => " ".repeat(match.length));
  for (const pattern of NON_QUANTITY_PATTERNS) out = out.replace(pattern, (match) => " ".repeat(match.length));
  return out;
}

const MONTH_NUMBERS: Readonly<Record<string, number>> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6,
  jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH_NAME = String.raw`(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)`;

interface ProseDate { year: number | null; month: number; day: number | null }

// Date spellings, most specific first; each match is removed before the next
// pattern runs, so "January 14, 2027" is read once, as one date.
const DATE_PATTERNS: readonly { pattern: RegExp; read: (m: RegExpMatchArray) => ProseDate }[] = [
  {
    pattern: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    read: (m) => ({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }),
  },
  {
    pattern: new RegExp(String.raw`\b(${MONTH_NAME})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4})\b)?`, "gi"),
    read: (m) => ({ year: m[3] === undefined ? null : Number(m[3]), month: MONTH_NUMBERS[m[1].toLowerCase()], day: Number(m[2]) }),
  },
  {
    pattern: new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_NAME})\b\.?(?:,?\s+(\d{4})\b)?`, "gi"),
    read: (m) => ({ year: m[3] === undefined ? null : Number(m[3]), month: MONTH_NUMBERS[m[2].toLowerCase()], day: Number(m[1]) }),
  },
  {
    pattern: new RegExp(String.raw`\b(${MONTH_NAME})\.?\s+(\d{4})\b`, "gi"),
    read: (m) => ({ year: Number(m[2]), month: MONTH_NUMBERS[m[1].toLowerCase()], day: null }),
  },
  {
    pattern: /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
    read: (m) => ({ year: Number(m[3]), month: Number(m[1]), day: Number(m[2]) }),
  },
];

/**
 * Does the sentence state only the given dates, and no other number? For a
 * text row whose whole content is a date (the next-earnings note): every
 * date the sentence writes — ISO, "January 14, 2027", "14 Jan", "January
 * 2027" — must agree with an allowed ISO day at the precision written, and
 * nothing else may be a number (review, 2026-10-13). A sentence that states
 * no date at all passes: it asserts nothing the row would have to show.
 */
export function statesOnlyAllowedDates(text: string, allowedIsoDates: readonly string[]): boolean {
  const allowed = allowedIsoDates.map((iso) => iso.split("-").map(Number));
  let rest = stripTags(text);
  const dates: ProseDate[] = [];
  for (const { pattern, read } of DATE_PATTERNS) {
    rest = rest.replace(pattern, (...args) => {
      dates.push(read(args.slice(0, -2) as unknown as RegExpMatchArray));
      return " ";
    });
  }
  if (proseNumbers(rest).length > 0 || statesNumberWord(rest)) return false;
  return dates.every((date) => allowed.some(([year, month, day]) =>
    (date.year === null || date.year === year) && date.month === month && (date.day === null || date.day === day)));
}

function stripTags(text: string): string {
  return text.replace(/\[[^[\]\n]*\]/g, " ");
}

/**
 * Does the sentence write a number in words? A gap or unestablished citation
 * supports no number, and "Net debt/EBITDA is two times" citing an n/a row
 * stated one that proseNumbers cannot see (review, 2026-10-13). "One" and
 * "half" are left out: "one of the" and "the first half" are how a gap is
 * written, not quantities.
 */
const NUMBER_WORD =
  /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|dozen|twice|thrice|double|doubled|tripled|quadrupled)\b/i;
export function statesNumberWord(text: string): boolean {
  return NUMBER_WORD.test(stripNonQuantities(text));
}

const CODE_BEFORE_NUMBER = new RegExp(String.raw`\b(?:${CURRENCY_CODES})\s?[-+−]?\d`);
const CODE_AFTER_NUMBER = new RegExp(
  String.raw`\d(?:\s?(?:thousand|million|billion|trillion|bn|mm|mn|k|m|b|tn))?\s?(?:${CURRENCY_CODES})\b`,
  "i",
);
const SYMBOL_BEFORE_NUMBER = /[$€£¥₩₹]\s?[-+−]?\d/;

/**
 * Does the sentence put a currency on a number? A currency symbol or code
 * beside a digit, or a money unit word after one ("781 dollars"). Checked on
 * the sentence with dates, forms and identifiers set aside, so "FY2025 USD
 * reporting" is not read as 2025 dollars.
 */
export function statesCurrencyOnNumber(text: string): boolean {
  const stripped = stripNonQuantities(text);
  if (SYMBOL_BEFORE_NUMBER.test(stripped)) return true;
  if (CODE_BEFORE_NUMBER.test(stripped) || CODE_AFTER_NUMBER.test(stripped)) return true;
  // A code glued to its number ("USD781") is an identifier to the strip.
  if (new RegExp(String.raw`\b(?:${CURRENCY_CODES})\d`).test(text)) return true;
  return parseNumbers(stripped).some(
    (parsed) => parsed.hadCurrencyPrefix || (parsed.unitToken !== null && MONEY_TOKENS.has(parsed.unitToken)),
  );
}

/**
 * How a number in the sentence came to match the record's value. Lower is a
 * better match, and only the best rank present in a sentence is kept (see
 * {@link locateRecord}).
 */
const enum LocateRank {
  /** The written scale IS the record's scale: a scale word, a bare number, bps. */
  Written = 0,
  /** A speculative display scale, but the number was written as money ("$5.0"). */
  SpeculativeCurrency = 1,
  /** A speculative display scale on a number that claimed no money at all. */
  Speculative = 2,
}

/**
 * Does this written number name the record's value, and how confidently?
 * Compares MAGNITUDES: a sentence routinely expresses the sign in words ("fell
 * 3.2%"), and the sign is what the direction check exists to test separately.
 * Returns the {@link LocateRank} of the best matching reading, or null.
 *
 * `bps` is read as hundredths of a percentage point, so "up 250 bps" locates a
 * record whose value is 2.5.
 */
function locateRecord(
  parsed: ParsedNumber,
  record: NumericProvenanceRecord,
): LocateRank | null {
  const target = Math.abs(record.value);
  const candidates: { value: number; scale: number; rank: LocateRank }[] = [
    { value: parsed.magnitude * parsed.scale, scale: parsed.scale, rank: LocateRank.Written },
  ];
  if (parsed.unitToken === "bp" || parsed.unitToken === "bps" ||
      parsed.unitToken === "basis point" || parsed.unitToken === "basis points") {
    candidates.push({ value: parsed.magnitude / 100, scale: 1 / 100, rank: LocateRank.Written });
  }
  // A LARGE-MAGNITUDE record (money, share counts) is registered in units and
  // written in billions, so a writer who names the wrong unit — "revenue was
  // 416.2%" for a $416.2bn figure — leaves no scale word to read the scale
  // from. Try the display scales for those records only. Doing it for every
  // record would be unsafe: a 6.4-percent record would then be "located" by an
  // unrelated "$6.4 billion" elsewhere in the sentence and fail its own unit
  // check. These readings are SPECULATIVE — the sentence never wrote that
  // scale — which is why they rank below a written one.
  const scalable = record.unit === "currency" || record.unit === "currency-per-share" ||
    record.unit === "shares";
  if (scalable && parsed.scaleWord === null) {
    const rank = parsed.hadCurrencyPrefix
      ? LocateRank.SpeculativeCurrency
      : LocateRank.Speculative;
    for (const scale of [1e3, 1e6, 1e9, 1e12]) {
      candidates.push({ value: parsed.magnitude * scale, scale, rank });
    }
  }
  let best: LocateRank | null = null;
  for (const { value, scale, rank } of candidates) {
    const tolerance = Math.max(
      0.5 * 10 ** -parsed.decimals * Math.abs(scale),
      Math.abs(target) * 1e-9,
    );
    if (Math.abs(value - target) <= tolerance && (best === null || rank < best)) best = rank;
  }
  return best;
}

/**
 * The numbers in a sentence that name the cited record, keeping only the
 * BEST-SCALE readings.
 *
 * Two numbers can both "locate" one record when a percentage coincides with a
 * scaled currency value: "Revenue of $5.0 billion came with a 5.0% operating
 * margin" against a $5.0e9 record located BOTH the correctly written figure and
 * the unrelated percentage (5.0 × 1e9). The percentage then failed the unit
 * check — one spurious match poisoning an otherwise correct sentence. A reading
 * whose scale the sentence actually wrote (a scale word, a bare number, bps),
 * or failing that one written as money, always wins over a speculative display
 * scale, so the check decides on the figure the sentence really cited.
 */
function locateNumbers(
  numbers: readonly ParsedNumber[],
  record: NumericProvenanceRecord,
): ParsedNumber[] {
  const hits = numbers.flatMap((parsed) => {
    const rank = locateRecord(parsed, record);
    return rank === null ? [] : [{ parsed, rank }];
  });
  if (hits.length === 0) return [];
  const best = Math.min(...hits.map((hit) => hit.rank));
  return hits.filter((hit) => hit.rank === best).map((hit) => hit.parsed);
}

function unitFamilyOf(parsed: ParsedNumber): UnitFamily | null {
  const token = parsed.unitToken;
  if (token !== null) {
    if (PERCENT_TOKENS.has(token)) return "percent";
    if (MULTIPLE_TOKENS.has(token)) return "multiple";
    if (SHARE_TOKENS.has(token)) return "shares";
    if (MONEY_TOKENS.has(token)) return "money";
  }
  if (parsed.hadCurrencyPrefix) return "money";
  // A bare scale word ("416.2 billion") names a magnitude, not a unit.
  if (parsed.scaleWord !== null) return "magnitude";
  return null;
}

/**
 * Which unit families a registry unit can legitimately be written in. An empty
 * set means "this unit has no expected unit word", so the unit check skips it
 * rather than inventing a rule for dimensionless readings (scores, indices,
 * counts, durations).
 */
function admissibleFamilies(unit: CanonicalUnit): ReadonlySet<UnitFamily> {
  switch (unit) {
    case "currency":
    case "currency-per-share":
      return new Set<UnitFamily>(["money", "magnitude"]);
    case "percent":
    case "percentage-points":
    case "percentage-points-per-year":
      return new Set<UnitFamily>(["percent"]);
    case "ratio":
      return new Set<UnitFamily>(["multiple"]);
    case "shares":
      return new Set<UnitFamily>(["shares", "magnitude"]);
    default:
      return new Set<UnitFamily>();
  }
}

/* ------------------------------------------------------------------------ *
 * Direction
 * ------------------------------------------------------------------------ */

/**
 * Direction vocabulary. Every entry names the sign of the NUMBER, never a
 * judgement about it. Deliberately EXCLUDES three groups:
 *
 *  - second-order words — "accelerated"/"slowed"/"moderated" describe a change
 *    IN a rate, so "growth slowed to 4%" is consistent with a +4 record;
 *  - sign-by-context words — "widened"/"narrowed"/"reversed"/"recovered" carry
 *    the opposite sign depending on whether the metric is a good or a bad thing;
 *  - EVALUATIVE words, removed 2026-09 for exactly the same reason as the group
 *    above: "improved"/"improvement"/"improves"/"improving"/"strengthened" and
 *    "weakened"/"deteriorated"/"deterioration"/"worsened" say the metric got
 *    better or worse, and for a lower-is-better metric (net leverage, churn,
 *    DSO, net debt, a cost ratio) better IS a negative number. "Net leverage
 *    improved 0.4 points" against a -0.4pp record is correct prose and was
 *    being filed as a direction mismatch.
 *
 * Leaving them out costs recall, which `checked` reports honestly, and buys
 * correctness.
 */
const DIRECTION_WORDS: Record<string, 1 | -1> = {
  rose: 1, rise: 1, rises: 1, rising: 1, risen: 1,
  increased: 1, increase: 1, increases: 1, increasing: 1,
  grew: 1, gained: 1, gain: 1, gains: 1,
  expanded: 1, expansion: 1, expanding: 1,
  climbed: 1, jumped: 1, surged: 1, advanced: 1,
  higher: 1, up: 1,
  fell: -1, fall: -1, falls: -1, falling: -1, fallen: -1,
  declined: -1, decline: -1, declines: -1, declining: -1,
  decreased: -1, decrease: -1, decreases: -1, decreasing: -1,
  dropped: -1, drop: -1, drops: -1, dropping: -1,
  contracted: -1, contraction: -1, contracting: -1,
  shrank: -1, shrunk: -1, slipped: -1, tumbled: -1, plunged: -1,
  lower: -1, down: -1,
};

/**
 * Words — and punctuation — between a direction word and its number that break
 * the delta reading. A comma, colon or dash makes the number an apposition
 * ("growth came in lower, 6.4%": 6.4 is the level, "lower" is second-order),
 * not the size of the move (audit 2026-09-06, F191).
 */
const DELTA_BREAKERS = /\b(?:to|toward|towards|at|from|versus|vs|than|of|near|around|about)\b|[,;:—–(]/i;

const DIRECTION_WINDOW_CHARS = 40;

interface DirectionHit {
  word: string;
  polarity: 1 | -1;
  start: number;
  end: number;
}

/**
 * A capitalised direction word beside another capitalised word is part of a
 * proper noun — "Advanced Micro Devices", "Rising Sun Holdings" — not a verb
 * (audit 2026-09-06, F192). Sentence-initial "Advanced 5%…" is the price of
 * that rule and is rare in analyst prose.
 */
function insideProperNoun(sentence: string, start: number, end: number): boolean {
  if (!/^[A-Z]/.test(sentence.slice(start, end))) return false;
  const before = /([A-Z][A-Za-z.&'’-]*)\s+$/.exec(sentence.slice(0, start));
  const after = /^\s+([A-Z][A-Za-z.&'’-]*)/.exec(sentence.slice(end));
  return before !== null || after !== null;
}

export function findDirectionWords(sentence: string): DirectionHit[] {
  const hits: DirectionHit[] = [];
  for (const match of sentence.matchAll(/[A-Za-z]+/g)) {
    const word = match[0].toLowerCase();
    const polarity = DIRECTION_WORDS[word];
    if (polarity === undefined) continue;
    const start = match.index ?? 0;
    if (insideProperNoun(sentence, start, start + match[0].length)) continue;
    hits.push({
      word,
      polarity,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return hits;
}

export interface QuantityDirection {
  polarity: 1 | -1;
  relation: "change" | "level";
  negated: boolean;
}

/** Direction belongs to the nearest quantity in the clause, never a nearby metric. */
export function quantityDirection(
  sentence: string,
  start: number,
  end: number,
  quantities: readonly { start: number; end: number }[],
): QuantityDirection | null {
  const distance = (hit: DirectionHit, quantity: { start: number; end: number }): number =>
    hit.end <= quantity.start ? quantity.start - hit.end : hit.start >= quantity.end ? hit.start - quantity.end : Infinity;
  const hits = findDirectionWords(sentence).filter((hit) => {
    const own = distance(hit, { start, end });
    return own <= DIRECTION_WINDOW_CHARS && quantities.every((quantity) => distance(hit, quantity) >= own);
  }).sort((a, b) => distance(a, { start, end }) - distance(b, { start, end }));
  const nearest = hits[0];
  if (!nearest) return null;
  const between = nearest.end <= start ? sentence.slice(nearest.end, start) : sentence.slice(end, nearest.start);
  const before = sentence.slice(Math.max(0, nearest.start - 30), nearest.start);
  return { polarity: nearest.polarity,
    relation: nearest.end <= start && DELTA_BREAKERS.test(between) ? "level" : "change",
    negated: /(?:\b(?:not|never|no|without)\b|n't)\s+(?:[a-z]+\s+){0,2}$/i.test(before) || /\b(?:not|never)\b|n't/i.test(between) };
}

/**
 * A registry record is a SIGNED DELTA when its unit is a change in a percentage,
 * or when its own NAME names a change series. Level records (a revenue, a
 * margin, an ROIC) are excluded on purpose: "margin rose to 30%" says nothing
 * about the sign of 30, so there is no delta to disagree with.
 *
 * Only the record's final id segment — the slug of the figure's own label — is
 * read. The section and origin are not: every margin LEVEL the payload
 * registers lives under `computed.growth-margins.*` with origin
 * `computed.growth.margins.*`, and reading "growth" there made "gross margin
 * (latest)" a delta, so "gross margin climbed to 46%"-style prose about a
 * positive level was checked as if 46 could be a decline (audit 2026-09-06,
 * F186). A uniqueId suffix (".2") is ignored.
 *
 * `return`/`momentum` are NOT treated as deltas even though they can be
 * negative: `computed.returns.*` in this pipeline is ROIC/ROE (levels), and
 * misreading those as deltas would fail correct sentences.
 */
export function isDeltaRecord(record: NumericProvenanceRecord): boolean {
  if (
    record.unit === "percentage-points" ||
    record.unit === "percentage-points-per-year"
  ) {
    return true;
  }
  const segments = record.id.toLowerCase().split(".");
  while (segments.length > 1 && /^\d+$/.test(segments[segments.length - 1])) segments.pop();
  const name = segments[segments.length - 1] ?? "";
  return /(?:^|-)(growth|cagr|change|delta|chg|yoy|qoq|expansion|contraction|revision)(?:-|$)/.test(
    name,
  );
}

/* ------------------------------------------------------------------------ *
 * Period phrases
 * ------------------------------------------------------------------------ */

// The quarter pattern REQUIRES the century (2026-09). With it optional the two
// digits swallowed whatever number followed the quarter: "Q1 15% growth was
// reported" matched "Q1 15" and failed against a 2025-12-31 record, claiming the
// sentence named a period it never named. The phrase starts at the Q, so the
// "skip a phrase starting inside a value span" guard below could not help. The
// forms that lose their quarter this way — "Q3 '25", "Q1 25" — could never have
// PASSED anyway: phraseNamesRecordYear only reads a two-digit year behind an FY prefix,
// so they failed every record. "Q3 FY25" keeps its check through the FY pattern
// on the next line.
const PERIOD_PATTERNS: readonly RegExp[] = [
  // An ISO date is one phrase, so its year is not read again on its own.
  /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g,
  /\bQ[1-4]\s*(?:of\s+)?(?:FY\s?)?['’]?(?:19|20)\d{2}\b/gi,
  /\bFY\s?['’]?(?:19|20)?\d{2}\b/gi,
  /\b(?:first|second|third|fourth)\s+quarter\s+(?:of\s+)?(?:FY\s?)?(?:19|20)\d{2}\b/gi,
  /\b(?:19|20)\d{2}\b/g,
];

/**
 * Whether a prose period phrase names the year(s) of a record's period. Year
 * sets only: "FY2025", "Q3 2025" and "2025" all agree with 2025-12-31, and
 * "FY2024" does not. A two-digit year counts only behind an FY prefix.
 *
 * An exact date against a registered window ("ttm: 2025-07-27 to 2026-07-26")
 * agrees when it falls inside the window or on an endpoint: "the trailing
 * period ended 2026-07-26" names that window's end, not a different year set
 * (NVDA report 34 flagged it "contradicted").
 */
export function phraseNamesRecordYear(phrase: string, registered: string | null): boolean {
  if (registered === null) return true;
  const a = phrase.trim().toLowerCase();
  const b = registered.trim().toLowerCase();
  if (a === b || a.includes(b)) return true;
  const date = /^(?:19|20)\d{2}-\d{2}-\d{2}$/.test(a) ? a : null;
  const window = /((?:19|20)\d{2}-\d{2}-\d{2})\s+to\s+((?:19|20)\d{2}-\d{2}-\d{2})/.exec(b);
  if (date !== null && window !== null) return window[1] <= date && date <= window[2];
  const yearsOf = (text: string): Set<string> => {
    const years = new Set<string>();
    // Digit boundaries, not word boundaries: "fy2025" has no word boundary
    // before its year.
    for (const match of text.matchAll(/(?<![0-9])((?:19|20)\d{2})(?![0-9])/g)) years.add(match[1]);
    for (const match of text.matchAll(/\bfy\s?'?(\d{2})(?![0-9])/g)) years.add(`20${match[1]}`);
    return years;
  };
  const ya = yearsOf(a);
  const yb = yearsOf(b);
  return ya.size > 0 && ya.size === yb.size && [...ya].every((year) => yb.has(year));
}

/**
 * Period phrases that NAME A YEAR. A bare "Q3" is skipped on purpose: without
 * the issuer's fiscal calendar there is no way to decide whether Q3 is the
 * record's ISO period end, and guessing would fail correct sentences (Apple's
 * Q3 FY2025 ends in June). Skipped means "not checked", and `checked` says so.
 */
export function findPeriodPhrases(
  sentence: string,
  numbers: readonly ParsedNumber[],
  located: readonly ParsedNumber[] = [],
): string[] {
  const phrases: string[] = [];
  const seen = new Set<string>();
  // A four-digit number that is really a VALUE is not a year. Two ways to tell:
  // it carried a currency prefix, a scale word or a unit token, or it IS the
  // cited figure's value (a record whose value happens to be 2025 reads as
  // "2025 units", not as a fiscal year).
  const valueSpans = [
    ...numbers.filter((n) => n.hadCurrencyPrefix || n.scaleWord !== null || n.unitToken !== null),
    ...located,
  ].map((n) => [n.start, n.end] as const);
  const dateSpans: (readonly [number, number])[] = [];
  for (const pattern of PERIOD_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of sentence.matchAll(pattern)) {
      const index = match.index ?? 0;
      const insideValue = valueSpans.some(([start, end]) => index >= start && index < end);
      if (insideValue || dateSpans.some(([start, end]) => index >= start && index < end)) continue;
      const phrase = match[0].trim();
      if (pattern === PERIOD_PATTERNS[0]) dateSpans.push([index, index + match[0].length]);
      const key = phrase.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      phrases.push(phrase);
    }
  }
  return phrases;
}

/* ------------------------------------------------------------------------ *
 * Named individuals
 * ------------------------------------------------------------------------ */

const HONORIFIC = String.raw`(?:Mr|Mrs|Ms|Miss|Dr|Sir|Prof)\.?`;
// Case-VARIANT rather than case-INSENSITIVE: the `i` flag would also relax the
// capital-letter requirement in NAME_TOKEN, so "The CEO reiterated guidance"
// matched "CEO reiterated guidance" as a person. Roles are spelled both ways;
// names must still start with a capital.
const ROLE_WORDS = String.raw`(?:CEO|CFO|COO|CTO|CIO|CMO|CAO|[Cc]hief\s+[A-Za-z]+\s+[Oo]fficer|[Cc]hair(?:man|woman|person)?|[Pp]resident|[Ff]ounder|[Cc]o-?[Ff]ounder|[Dd]irector|[Tt]reasurer|[Cc]ontroller|[Gg]eneral\s+[Cc]ounsel)`;
const NAME_TOKEN = String.raw`[A-Z][a-zÀ-ɏ'’\-]{1,}`;
const NAME_PAIR = String.raw`${NAME_TOKEN}(?:\s+${NAME_TOKEN}){0,2}`;

// Named groups (D-43) so the person-row content check can read the NAME a
// pattern found, apart from the honorific or role around it: an honorific
// yields a surname only, a role yields the role as the stated title.
const PERSON_PATTERNS: readonly RegExp[] = [
  new RegExp(String.raw`\b${HONORIFIC}\s+(?<surname>${NAME_TOKEN})`, "g"),
  new RegExp(String.raw`\b(?<role>${ROLE_WORDS})\s+(?<name>${NAME_PAIR})`, "g"),
  new RegExp(String.raw`\b(?<name>${NAME_PAIR}),\s+(?:the\s+)?${ROLE_WORDS}\b`, "g"),
];

/**
 * Names of people this report may talk about, gathered from evidence rather
 * than guessed: the payload's key-executive and insider-trade notes, plus the
 * report's own executive cards. Used for exact-name detection; the patterns
 * above catch a person the payload never listed.
 */
export function collectPersonNames(sources: {
  leadershipNotes?: readonly string[];
  insiderNotes?: readonly string[];
  executiveNames?: readonly string[];
}): string[] {
  const names = new Set<string>();
  const add = (value: string | undefined): void => {
    const trimmed = value?.trim();
    // One word is a title or an initial, not an identifiable person.
    if (trimmed !== undefined && /\s/.test(trimmed) && trimmed.length >= 5) {
      names.add(trimmed);
    }
  };
  for (const note of sources.leadershipNotes ?? []) {
    add(note.split("—", 1)[0]);
  }
  for (const note of sources.insiderNotes ?? []) {
    // "2026-01-02 Jane Roe (officer): ..." — the name sits between the date and
    // the parenthesised owner type.
    add(/^\S+\s+([^(]+)\(/.exec(note)?.[1]);
  }
  for (const name of sources.executiveNames ?? []) add(name);
  return [...names];
}

/** One person a sentence names, and where. */
export interface NamedIndividual {
  /** What the sentence says that marks a person (a known name, or a whole pattern hit such as "CEO Jane Roe"). */
  match: string;
  /** The person's name as written; a surname alone after an honorific. */
  name: string;
  surnameOnly: boolean;
  /** The title the sentence attaches to the name, when it attaches one. */
  title: string | null;
  /**
   * D-66: the same title read through the comma-separated scopes after it
   * ("EVP, Operations" after "EVP"); any one of them may match the row.
   */
  titleAlternatives?: string[];
}

/**
 * Every person a sentence names: known names first, in list order, then
 * pattern hits, skipping a hit inside a name already found. The order keeps
 * {@link namesIndividual} returning what it always returned.
 */
export function namedIndividuals(
  sentence: string,
  knownNames: readonly string[],
  organizationNames: readonly string[] = [],
  /**
   * Also read capitalized runs no known name or pattern found as names
   * ({@link unlistedNames}); `extraWords` are words that are no name here
   * (the person rows' titles). Only for a claim citing a person row.
   */
  options: {
    unlistedNames?: { extraWords: readonly string[] };
    /** Full titles from the cited source and applicable observation date only. */
    sourceTitles?: readonly string[];
  } = {},
): NamedIndividual[] {
  const found: NamedIndividual[] = [];
  const spans: [number, number][] = [];
  // A pattern hit that overlaps a name already found is that person, not a
  // second one: "Under Jeremy Barnum, the CFO" matched the comma pattern as
  // "Under Jeremy Barnum" around the known "Jeremy Barnum" (review,
  // 2026-10-13).
  const overlaps = (start: number, end: number): boolean =>
    spans.some(([s, e]) => start < e && end > s);
  const known = knownNames
    .flatMap((name) => {
      const index = sentence.indexOf(name);
      return index < 0 ? [] : [{ name, start: index, end: index + name.length }];
    });
  for (const hit of known) {
    // "Susan Li" inside "Susan Li Chen" is the longer name, not a second person.
    if (known.some((other) => other !== hit && other.start <= hit.start && other.end >= hit.end &&
      other.end - other.start > hit.end - hit.start)) continue;
    spans.push([hit.start, hit.end]);
    found.push({
      match: hit.name,
      name: hit.name,
      surnameOnly: false,
      ...titleOf(sentence, hit.start, hit.end),
    });
  }
  const organisations = organizationNames.map((name) => name.toLowerCase());
  const isOrganisation = (candidate: string): boolean => {
    const lower = candidate.toLowerCase();
    return organisations.some((org) => org.includes(lower));
  };
  for (const pattern of PERSON_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of sentence.matchAll(pattern)) {
      const candidate = match[0].trim();
      if (isOrganisation(candidate)) continue;
      const groups = match.groups ?? {};
      // A clause-opening word the name pattern swept in ("Under Jeremy
      // Barnum, the CFO") is not part of the name.
      const swept = (groups.name ?? groups.surname ?? candidate).trim().split(/\s+/);
      while (swept.length > 1 && NOT_A_NAME_WORDS.has(swept[0].toLowerCase())) swept.shift();
      const name = swept.join(" ");
      const start = (match.index ?? 0) + Math.max(0, match[0].indexOf(name));
      const end = start + name.length;
      if (overlaps(start, end)) continue;
      // A source title can contain a role followed by a business scope, e.g.
      // "CEO Microsoft Commercial". Do not invent a second person from that
      // exact contiguous phrase. Known names were already collected above.
      const words = (value: string): string => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (groups.role !== undefined && options.sourceTitles?.some((title) =>
        ` ${words(title)} `.includes(` ${words(`${groups.role} ${name}`)} `))) {
        spans.push([start, end]);
        continue;
      }
      spans.push([start, end]);
      found.push({
        match: candidate,
        name,
        surnameOnly: groups.surname !== undefined,
        ...(groups.role !== undefined
          ? { title: titleBeforeName(sentence, start) ?? groups.role }
          : titleOf(sentence, start, end)),
      });
    }
  }
  if (options.unlistedNames !== undefined) {
    found.push(...unlistedNames(sentence, spans, options.unlistedNames, isOrganisation));
  }
  return found;
}

// Capitalized words that are not a person's name in a sentence about one:
// function words a sentence or clause may open with, role and title words,
// the documents a compensation or executive row comes from, and months.
const NOT_A_NAME_WORDS = new Set([
  "the", "a", "an", "this", "that", "these", "those", "under", "after", "before", "while", "when", "since",
  "with", "both", "its", "their", "his", "her", "our", "in", "on", "at", "for", "from", "by", "as", "and",
  "but", "also", "each", "neither", "no", "not", "per", "of", "according", "during", "latest", "prior",
  "total", "pay", "if", "although", "however", "only", "all", "other", "one", "two", "new",
  "mr", "mrs", "ms", "miss", "dr", "sir", "prof",
  "chief", "executive", "officer", "officers", "operating", "financial", "technology", "product",
  "information", "investment", "marketing", "legal", "risk", "people", "chairman", "chairwoman",
  "chairperson", "chair", "president", "vice", "senior", "managing", "director", "directors", "founder",
  "cofounder", "co-founder", "general", "counsel", "head", "former", "interim", "acting", "group",
  "global", "deputy", "treasurer", "secretary", "controller", "board", "committee", "lead", "independent",
  "summary", "compensation", "table", "proxy", "statement", "annual", "report", "form", "item", "filing",
  "filings", "definitive", "schedule", "fiscal", "insider", "insiders", "trade", "trades",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
  "november", "december",
  // Nouns that open sentences about executives and their rows.
  "tenure", "currency", "revenue", "performance", "governance", "leadership", "management", "ownership",
  "disclosure", "evidence", "information", "records", "record", "rows", "row", "notes", "note", "listing",
  "title", "titles", "appointment", "appointments", "succession", "shareholders", "holdings", "sales",
  "purchases", "transactions", "activity", "it", "there", "he", "she", "they", "which", "who", "none",
  "nothing", "salary", "bonus", "awards", "equity", "stock", "options", "incentive", "incentives",
]);

// A verb that follows a person's name. A lone capitalized word opening a
// sentence is read as a name only when one follows it: "Sandberg received
// the largest award" names someone, "Without a covered period …" does not.
const PERSON_VERB = /^\s+(?:is|was|has|had|serves|served|received|receives|earned|earns|leads|led|joined|became|becomes|remains|remained|holds|held|took|takes|sold|bought|chairs|chaired|runs|ran|oversees|oversaw|said|says|will|would|also|currently)\b/;

const CAPITALIZED_WORD = String.raw`(?:[A-Z][a-zÀ-ɏ'’]+(?:-[A-Za-zÀ-ɏ'’]+)*|[A-Z]\.)(?![A-Za-z0-9\-])`;
const CAPITALIZED_RUN = new RegExp(
  String.raw`(?<![A-Za-z0-9'’\-])${CAPITALIZED_WORD}(?:\s+${CAPITALIZED_WORD})*`,
  "g",
);

/**
 * Capitalized word runs that read as a person's name and that no known name
 * or pattern found (review, 2026-10-13). Used only for a claim citing a
 * person row: a name the payload never listed is invisible to exact matching
 * and to the role patterns, so "Sheryl Sandberg is CEO" citing JPM's
 * compensation rows named nobody and passed on the tag. Each run is split at
 * {@link NOT_A_NAME_WORDS} and at the person rows' own title words ("Asset &
 * Wealth Management"); an organisation, a run of initials only, and a single
 * word opening the sentence ("Latest annual pay …") are skipped, unless a
 * verb a person takes follows it ("Sandberg received …", {@link PERSON_VERB}).
 * What is left is read as a name the cited rows must list — a capitalized
 * word that is no name fails closed.
 */
function unlistedNames(
  sentence: string,
  spans: readonly [number, number][],
  options: { extraWords: readonly string[] },
  isOrganisation: (candidate: string) => boolean,
): NamedIndividual[] {
  const extra = new Set(options.extraWords.flatMap((text) => text.toLowerCase().match(/[a-zà-ɏ'’-]+/g) ?? []));
  const notAName = (token: string): boolean => {
    const word = token.replace(/['’]s$/, "");
    // "Co-CEO", "Co-President": a hyphenated part that is a role or an
    // abbreviation makes the whole word a title.
    return word.split("-").some((part) => {
      const lower = part.toLowerCase();
      return NOT_A_NAME_WORDS.has(lower) || extra.has(lower) || lower === "co" || /^[A-Z]{2,}$/.test(part);
    });
  };
  const out: NamedIndividual[] = [];
  CAPITALIZED_RUN.lastIndex = 0;
  for (const run of sentence.matchAll(CAPITALIZED_RUN)) {
    const runStart = run.index ?? 0;
    // Split the run into pieces of name-like words, keeping offsets.
    const pieces: { start: number; end: number; words: string[] }[] = [];
    let current: { start: number; end: number; words: string[] } | null = null;
    for (const word of run[0].matchAll(/\S+/g)) {
      const start = runStart + (word.index ?? 0);
      const end = start + word[0].length;
      if (notAName(word[0])) {
        current = null;
        continue;
      }
      if (current === null) {
        current = { start, end, words: [] };
        pieces.push(current);
      }
      current.end = end;
      current.words.push(word[0]);
    }
    for (const piece of pieces) {
      if (spans.some(([s, e]) => piece.start < e && piece.end > s)) continue;
      if (piece.words.every((word) => /^[A-Z]\.$/.test(word))) continue;
      const name = sentence.slice(piece.start, piece.end).replace(/['’]s$/, "");
      if (isOrganisation(name)) continue;
      const opensSentence = /^\s*$|[.!?;:]\s*$/.test(sentence.slice(0, piece.start));
      if (piece.words.length === 1 && opensSentence && !PERSON_VERB.test(sentence.slice(piece.end))) continue;
      out.push({
        match: name,
        name,
        surnameOnly: piece.words.length === 1,
        ...titleOf(sentence, piece.start, piece.end),
      });
    }
  }
  return out;
}

/** Does this sentence name an identifiable person? */
export function namesIndividual(
  sentence: string,
  knownNames: readonly string[],
  organizationNames: readonly string[] = [],
): string | null {
  return namedIndividuals(sentence, knownNames, organizationNames)[0]?.match ?? null;
}

/* ------------------------------------------------------------------------ *
 * Person rows: what the payload's own rows say about people (D-43)
 * ------------------------------------------------------------------------ */

/**
 * One payload row about a person, as the model saw it. Until 2026-10-13 a
 * claim naming a person that cited one of these tags passed on the tag alone
 * — "Tim Cook has led the company since 2011" passed with no row at all, and
 * citing the executive-compensation rows would have let "Sheryl Sandberg is
 * CEO" pass. The content check below reads the cited tag's rows.
 */
export interface PersonRow {
  /** The tag the row prints, which a claim cites. */
  tag: string;
  asOf: string | null;
  name: string;
  title: string | null;
  /** Insider reporting names come surname first ("Li Susan J."). */
  anyOrder: boolean;
}

// A token that opens the position text of a compensation row, which FMP
// writes as one string: "Christopher K. Cox Chief Product Officer",
// "Mary Callahan Erdoes CEO, Asset & Wealth Management".
const POSITION_TOKEN =
  /^(?:CEO|CFO|COO|CTO|CIO|CMO|CAO|CPO|CLO|CHRO|CRO|CSO|CDO|EVP|SVP|VP|GC|Chief|Chairman|Chairwoman|Chairperson|Chair|President|Vice|Executive|Senior|Managing|Head|Former|General|Director|Treasurer|Secretary|Founder|Cofounder|Controller|Deputy|Interim|Acting|Group|Global|Co-\S*)$/;

/**
 * Split "<name> <position>" at the FIRST position token or separator. The
 * tokens before it are the name. Splitting at the last name-like token
 * instead read "Mary Callahan" as the name in "Mary Callahan Erdoes CEO, …".
 */
export function splitNameAndPosition(text: string): { name: string; title: string | null } {
  const dash = /\s+[—–]\s+|\s+-\s+/.exec(text);
  if (dash) {
    return { name: text.slice(0, dash.index).trim(), title: text.slice(dash.index + dash[0].length).trim() || null };
  }
  const tokens = text.trim().split(/\s+/);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (i > 0 && POSITION_TOKEN.test(token.replace(/[,:]$/, ""))) {
      return { name: tokens.slice(0, i).join(" "), title: tokens.slice(i).join(" ") };
    }
    if (/[,:]$/.test(token) && i < tokens.length - 1) {
      return { name: tokens.slice(0, i + 1).join(" ").replace(/[,:]$/, ""), title: tokens.slice(i + 1).join(" ") };
    }
  }
  return { name: text.trim(), title: null };
}

/**
 * The person rows the payload shows, read from the same rendered rows the
 * model read (the key-executive and insider notes, whose formats
 * payload.ts owns) and from the compensation figures' labels.
 */
export function collectPersonRows(sources: {
  leadershipNotes?: readonly string[];
  insiderNotes?: readonly string[];
  leadershipFigures?: readonly { label: string; source: string; asOf: string | null; provenanceId?: string }[];
}): PersonRow[] {
  const rows: PersonRow[] = [];
  const usable = (value: string | undefined): string | null => {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" || trimmed === "?" ? null : trimmed;
  };
  for (const note of sources.leadershipNotes ?? []) {
    const match = /^(.+?) — (.+?)(?: \(since [^)]*\))?(?:, pay [^[]*)? \[fmp:key-executives\]$/.exec(note);
    const name = usable(match?.[1]);
    if (match === null || name === null) continue;
    rows.push({ tag: "fmp:key-executives", asOf: null, name, title: usable(match[2]), anyOrder: false });
  }
  for (const note of sources.insiderNotes ?? []) {
    const match = /^\S+ (.+?) \(([^)]*)\): .* \[fmp:insider-trades · (\d{4}-\d{2}-\d{2})\]$/.exec(note);
    const name = usable(match?.[1]);
    if (match === null || name === null) continue;
    // The owner type reads "director" or "officer: Chief Financial Officer".
    const owner = usable(match[2]);
    const title = owner === null ? null : usable(owner.split(":").pop());
    rows.push({ tag: "fmp:insider-trades", asOf: match[3], name, title, anyOrder: true });
  }
  for (const figure of sources.leadershipFigures ?? []) {
    if (figure.source !== "fmp:executive-compensation") continue;
    const body = /^comp (.+) FY\S*$/.exec(figure.label)?.[1];
    if (body === undefined) continue;
    const { name, title } = splitNameAndPosition(body);
    if (usable(name) === null) continue;
    rows.push({
      tag: figure.provenanceId ?? figure.source,
      asOf: figure.asOf,
      name,
      title: usable(title ?? undefined),
      anyOrder: false,
    });
  }
  return rows;
}

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[’]/g, "'")
    .split(/[\s,]+/)
    .map((token) => token.replace(/\./g, ""))
    .filter((token) => token !== "" && !NAME_SUFFIXES.has(token));
}

/**
 * Does the name a sentence writes name the row's person? The first and last
 * names must be the row's, and every token written must be in the row in
 * order: "Mark Zuckerberg" names "Mark Elliot Zuckerberg", while "Chris Cox"
 * (a nickname), "Susan J. Li" (an initial the row lacks) and "Mary Callahan"
 * (a dropped surname) do not. An insider row's name is surname first, so its
 * tokens match in any order. A surname alone (after an honorific) must be the
 * row's surname.
 */
export function personNameMatches(written: string, surnameOnly: boolean, row: PersonRow): boolean {
  const claimed = nameTokens(written);
  const recorded = nameTokens(row.name);
  if (claimed.length === 0 || recorded.length === 0) return false;
  if (surnameOnly || claimed.length === 1) {
    return row.anyOrder ? recorded.includes(claimed[0]) : recorded[recorded.length - 1] === claimed[0];
  }
  if (row.anyOrder) {
    const pool = [...recorded];
    return claimed.every((token) => {
      const at = pool.indexOf(token);
      if (at < 0) return false;
      pool.splice(at, 1);
      return true;
    });
  }
  if (claimed[0] !== recorded[0] || claimed[claimed.length - 1] !== recorded[recorded.length - 1]) return false;
  let cursor = 0;
  for (const token of claimed) {
    const at = recorded.indexOf(token, cursor);
    if (at < 0) return false;
    cursor = at + 1;
  }
  return true;
}

// Only unambiguous abbreviations expand: CIO, CMO, CAO and CPO each name two
// different offices (information/investment, marketing/medical, …), so a row
// that abbreviates one matches only the same abbreviation.
const TITLE_ABBREVIATIONS: Readonly<Record<string, string>> = {
  ceo: "chief executive officer",
  cfo: "chief financial officer",
  coo: "chief operating officer",
  cto: "chief technology officer",
  evp: "executive vice president",
  svp: "senior vice president",
  vp: "vice president",
  gc: "general counsel",
  cofounder: "co founder",
};

const TITLE_ROLE_START = new Set([
  "chief", "chairman", "chairwoman", "chairperson", "chair", "president", "founder", "director",
  "treasurer", "controller", "general", "vice", "co", "executive", "senior", "head", "managing",
  "former", "secretary", "deputy", "interim", "acting", "group", "global", "cio", "cmo", "cao",
  "cpo", "clo", "chro", "cro", "cso", "cdo",
]);

/**
 * A title as comparable tokens: abbreviations expanded, "&" read as "and",
 * hyphens as spaces ("Co-CEO" is "co chief executive officer"), and a comma
 * read as "and" before another role ("Founder, Chairman") and as "of" before
 * a scope ("CEO, Asset & Wealth Management" is "CEO of Asset & Wealth
 * Management").
 */
function titleTokens(title: string): string[] {
  const raw = title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’]/g, "'")
    .match(/[a-z0-9']+|,/g) ?? [];
  const expanded = raw.flatMap((token) => (TITLE_ABBREVIATIONS[token] ?? token).split(" "));
  const out: string[] = [];
  for (let i = 0; i < expanded.length; i += 1) {
    const token = expanded[i];
    if (token === ",") {
      const next = expanded[i + 1];
      if (next === undefined) continue;
      out.push(TITLE_ROLE_START.has(next) ? "and" : "of");
      continue;
    }
    out.push(token);
  }
  while (out[0] === "the" || out[0] === "its" || out[0] === "his" || out[0] === "her" || out[0] === "their") out.shift();
  return out;
}

/** Does the text open with a role or a role modifier — that is, is it a title at all? */
function opensWithRole(text: string): boolean {
  const first = titleTokens(text)[0];
  return first !== undefined && (TITLE_ROLE_START.has(first) || first === "chief");
}

/**
 * Does the title a sentence states match the row's title? The written title
 * must be one whole role the row lists, with its scope: it may not drop a
 * modifier the row has ("CEO" for "Co-CEO", "Chairman" for "Vice Chairman",
 * "Chief Operating Officer" for "Former Chief Operating Officer") or the
 * row's scope ("CEO" for "CEO of Consumer & Community Banking"), and may not
 * add one. "Chief Executive Officer" is one role of "Founder, Chairman & Chief
 * Executive Officer".
 */
export function personTitleMatches(written: string, rowTitle: string): boolean {
  const claimed = titleTokens(written);
  const recorded = titleTokens(rowTitle);
  if (claimed.length === 0 || recorded.length < claimed.length) return false;
  for (let start = 0; start + claimed.length <= recorded.length; start += 1) {
    if (!claimed.every((token, i) => recorded[start + i] === token)) continue;
    const end = start + claimed.length;
    const cleanStart = start === 0 || recorded[start - 1] === "and";
    const next = recorded[end + 1];
    const cleanEnd = end === recorded.length ||
      (recorded[end] === "and" && next !== undefined && TITLE_ROLE_START.has(next));
    if (cleanStart && cleanEnd) return true;
  }
  return false;
}

// Where a title written after a name stops: punctuation, or a word that
// starts the rest of the sentence ("CFO since 2022", "CEO who …").
const TITLE_STOP =
  /[.;:()!?]|,\s|\s(?:since|from|until|through|with|who|which|whose|where|while|after|before|during|when|in|at|for|on|to|has|had|have|is|was|were|are|will|would|reported|received|earned|led|leads|oversees|runs|said|says)\b/;

/**
 * The title a sentence attaches right after a name: "<name> as <title>",
 * "<name>, the <title>", "<name> (<title>)" or "<name> is/was/serves as
 * <title>". Null when what follows is not a title (it opens with no role
 * word) — the claim then gets a name-only check, which is all it asserts
 * about the row. The copular forms were added in review (2026-10-13): without
 * them "Jeremy Barnum is the CEO" citing his "CFO" compensation row was read
 * as naming him only, and passed.
 */
/** The title a sentence gives a name (after it, else before it), with its comma-scoped readings. */
function titleOf(sentence: string, start: number, end: number): Pick<NamedIndividual, "title" | "titleAlternatives"> {
  const after = titlesAfterName(sentence, end);
  if (after.length === 0) return { title: titleBeforeName(sentence, start) };
  return after.length > 1 ? { title: after[0]!, titleAlternatives: after.slice(1) } : { title: after[0]! };
}

/**
 * The title after a name, then the same title carried through each following
 * comma-separated scope ("Debora Shoquist, EVP, Operations:" reads "EVP" and
 * "EVP, Operations"). D-66: the NVDA final rerun rejected four pay claims
 * that wrote the DEF 14A row's title exactly ("EVP, Operations"), because the
 * title stopped at the comma and "EVP" alone drops the row's scope. A longer
 * reading is only an alternative: it passes when it is one of the row's own
 * titles, and the shortest reading is what a failure names.
 */
function titlesAfterName(sentence: string, end: number): string[] {
  const rest = sentence.slice(end);
  const lead = /^\s*(?:,\s*(?:the\s+|its\s+|our\s+)?|\s+(?:as|is|was|remains|became|(?:has|had)\s+been|(?:serves|served|acts|acted)\s+as)\s+(?:also\s+|currently\s+|now\s+|still\s+)?(?:the\s+|its\s+|his\s+|her\s+|their\s+)?(?:company's\s+|firm's\s+|bank's\s+)?|\s*\()/.exec(rest);
  if (lead === null) return [];
  const tail = rest.slice(lead[0].length);
  const stop = TITLE_STOP.exec(tail);
  const title = (stop === null ? tail : tail.slice(0, stop.index)).trim();
  if (title === "" || !opensWithRole(title)) return [];
  const out = [title];
  let current = title;
  let after = stop === null ? "" : tail.slice(stop.index);
  for (let extensions = 0; extensions < 3; extensions += 1) {
    const comma = /^,\s+/.exec(after);
    if (comma === null) break;
    const segment = after.slice(comma[0].length);
    const next = TITLE_STOP.exec(segment);
    const scope = (next === null ? segment : segment.slice(0, next.index)).trim();
    // A scope is capitalised ("Operations", "Worldwide Field Operations").
    if (scope === "" || !/^[A-Z&]/.test(scope)) break;
    current = `${current}, ${scope}`;
    out.push(current);
    after = next === null ? "" : segment.slice(next.index);
  }
  return out;
}

// A role written right before a name ("CFO James Dimon", "its Co-CEO, Troy
// Rohrbaugh"), with the modifiers a row's title keeps.
const ROLE_BEFORE_NAME = new RegExp(
  String.raw`(?:^|[^A-Za-z-])(?<role>(?:(?:[Cc]o-|[Ff]ormer\s+|[Vv]ice\s+|[Ee]xecutive\s+|[Ss]enior\s+|[Dd]eputy\s+|[Ii]nterim\s+|[Aa]cting\s+))*${ROLE_WORDS})\s*,?\s*$`,
);

/**
 * The title a sentence writes right before a name. Read in review
 * (2026-10-13) for names found by exact match, whose role-before-name pattern
 * hit was dropped as lying inside the known name's span: "CFO James Dimon"
 * citing Dimon's "Chairman and CEO" row passed as a name-only claim.
 */
function titleBeforeName(sentence: string, start: number): string | null {
  return ROLE_BEFORE_NAME.exec(sentence.slice(0, start))?.groups?.role ?? null;
}

/**
 * Check each named person against the cited tag's rows. Null when every
 * person is in a row and every stated title matches one of that person's
 * rows; otherwise the first failure.
 */
function personRowProblem(
  people: readonly NamedIndividual[],
  rows: readonly PersonRow[],
): { reason: "named-individual-not-in-source" | "named-individual-title-mismatch"; person: NamedIndividual } | null {
  for (const person of people) {
    const theirs = rows.filter((row) => personNameMatches(person.name, person.surnameOnly, row));
    if (theirs.length === 0) return { reason: "named-individual-not-in-source", person };
    if (person.title === null) continue;
    const titles = [person.title, ...(person.titleAlternatives ?? [])];
    if (!theirs.some((row) => row.title !== null && titles.some((title) => personTitleMatches(title, row.title!)))) {
      return { reason: "named-individual-title-mismatch", person };
    }
  }
  return null;
}

/**
 * Report paths whose claims are the EXECUTIVE CREDIBILITY record. These may cite
 * a registry figure or a filing/transcript text source, and nothing else — a
 * credibility grade built on a news summary or a search result is exactly the
 * kind of claim the payload was assembled to replace.
 */
export function isCredibilityPath(path: string): boolean {
  return (
    /^leadership\.executives\[\d+\]\.(?:reasoning|evidence\.guidanceVsActuals)\b/.test(path) ||
    path.startsWith("outlook.guidanceCredibility")
  );
}

/** A citation-registry id that is a filing or an earnings-call transcript. */
export function isFilingOrTranscriptSource(id: string): boolean {
  return /^edgar:/i.test(id) || /transcript/i.test(id);
}

/**
 * The payload's own rows ABOUT people: key-executive and insider-trade notes
 * and the executive-compensation rows, registered as citations under these
 * tags (payload.ts). A claim about a person that cites one cites the payload
 * itself (audit 2026-09-06, F188: they were rejected as "neither a registry
 * figure nor a filing or transcript"). The compensation rows joined on
 * 2026-10-13 (D-43): they come from the issuer's proxy and the prompt already
 * called them payload figures, yet every claim citing them was rejected. A
 * person-row citation is no longer accepted on its tag: the cited rows must
 * list the person and any title the claim states (runConsistencyChecks).
 */
export function isPayloadPersonRowSource(id: string): boolean {
  return /^fmp:(?:key-executives|insider-trades|executive-compensation)$/i.test(id);
}

/* ------------------------------------------------------------------------ *
 * The pass
 * ------------------------------------------------------------------------ */

function renderFigure(record: NumericProvenanceRecord | undefined, sourceId: string | null): string {
  if (record === undefined) return sourceId === null ? "[no cited figure]" : `[${sourceId}]`;
  const currency = record.currency === null ? "" : ` ${record.currency}`;
  return `${record.value} ${record.unit}${currency} [${record.id} · ${record.asOf}]`;
}

/**
 * Run every deterministic consistency check. Returns the failures (each naming
 * the sentence, the cited figure and the reason) plus how many pairs each check
 * was actually able to evaluate.
 */
export function runConsistencyChecks(input: ConsistencyInput): ConsistencyResult {
  const direction = new Counter();
  const period = new Counter();
  const unit = new Counter();
  const namedIndividual = new Counter();
  const findings: ConsistencyFinding[] = [];
  const rejectedClaimPaths = new Set<string>();

  for (const { claim, path } of input.claims) {
    const sourceId = citationSourceId(claim);
    const record = sourceId === null
      ? undefined
      : input.registry.find((entry) => entry.id === sourceId);
    const sentence = claim.text;
    const figure = renderFigure(record, sourceId);

    const fail = (
      check: ConsistencyCheckKind,
      reason: ConsistencyFailureReason,
      note: string,
    ): void => {
      findings.push({ check, reason, sentence, figure, sourceId, path, note });
    };

    const citation = sourceId === null
      ? undefined
      : input.citationRegistry.find((entry) => entry.id === sourceId);

    /* ---- named individuals (applies to every claim, cited or not) -------- */
    // D-43: a claim naming a person that cites a person row is checked
    // against that row's CONTENT, first — before a numeric record could accept
    // it — so a compensation row that later gains a currency (and prints its
    // own registry id) is still read. The tag has to be registered at all.
    const rowsForTag = sourceId === null
      ? []
      : (input.personRows ?? []).filter((row) => row.tag === sourceId);
    const personRowCited =
      sourceId !== null &&
      (citation !== undefined || record !== undefined) &&
      (isPayloadPersonRowSource(sourceId) || rowsForTag.length > 0);
    const claimAsOf = claim.label === "JUDGMENT" ? null : citationAsOf(claim);
    const matchingPersonRows = claimAsOf === null
      ? rowsForTag
      : rowsForTag.filter((row) => row.asOf === null || row.asOf === claimAsOf);
    // A claim citing a person row is also read for names the payload never
    // listed: the rows are its only support, so every name in it must be
    // theirs (review, 2026-10-13).
    const people = namedIndividuals(
      sentence,
      input.personNames,
      input.organizationNames ?? [],
      // Every person row's title words ("Commercial & Investment Bank") are
      // scope, not names, whichever row the claim cites.
      personRowCited
        ? {
            unlistedNames: { extraWords: (input.personRows ?? []).flatMap((row) => (row.title === null ? [] : [row.title])) },
            sourceTitles: matchingPersonRows.flatMap((row) => row.title === null ? [] : [row.title]),
          }
        : {},
    );
    const person = people[0]?.match ?? null;
    const credibility = isCredibilityPath(path);
    if (people.length > 0 && personRowCited) {
      const problem = personRowProblem(people, matchingPersonRows);
      if (problem === null) {
        namedIndividual.pass();
      } else {
        namedIndividual.fail();
        rejectedClaimPaths.add(path);
        fail(
          "named-individual",
          problem.reason,
          problem.reason === "named-individual-not-in-source"
            ? `The claim names ${problem.person.name} but no ${sourceId} row it cites lists that person as named (the row's spelling, without a nickname, an added initial or a dropped name).`
            : `The claim calls ${problem.person.name} "${problem.person.title}", but no ${sourceId} row it cites gives that person that title (the row's title, with its modifiers and scope).`,
        );
      }
    } else if (person !== null || credibility) {
      const canonicalUrl = sourceId === null ? null : canonicalizeFetchedUrl(sourceId);
      const isWeb = canonicalUrl !== null;
      // The filing-or-transcript restriction applies to EVERY claim that names
      // a person, not only to the executive-credibility section (2026-09). It
      // previously ran on the credibility path alone, so an ordinary claim
      // naming a person could cite anything in the citation registry — news, a
      // press release — while the prompt, the module docstring and the reader-
      // facing table all said "filings/transcripts only". Registry figures stay
      // admissible: a traced number is the payload itself, not a source about
      // a person.
      const allowed =
        record !== undefined ||
        (citation !== undefined &&
          (isFilingOrTranscriptSource(citation.id) || isPayloadPersonRowSource(citation.id)));
      if (allowed) {
        namedIndividual.pass();
      } else {
        namedIndividual.fail();
        rejectedClaimPaths.add(path);
        if (credibility && person === null) {
          fail(
            "named-individual",
            "credibility-source-restricted",
            `An executive-credibility claim may cite only a registry figure or a filing/transcript text source; this one cites ${sourceId === null ? "nothing" : `"${sourceId}"`}.`,
          );
        } else if (isWeb && input.fetchedUrls.has(canonicalUrl)) {
          fail(
            "named-individual",
            "named-individual-web-source",
            `The claim names ${person ?? "an individual"} but rests on a web-search result (${sourceId}); claims about named people are restricted to filings and transcripts.`,
          );
        } else {
          fail(
            "named-individual",
            "named-individual-unsourced",
            `The claim names ${person ?? "an individual"} but cites ${sourceId === null ? "nothing" : `"${sourceId}"`}, which is neither a registry figure, a filing or transcript, nor a payload executive, compensation or insider row.`,
          );
        }
      }
    }

    /* ---- currency on a figure whose currency is unknown (D-43) ----------- */
    // Registering the printed tags of money rows with no established currency
    // (a peer market cap, a compensation total, an analyst target) made them
    // citable, and nothing else would read the sentence: the numeric checks
    // below need a numeric record, which these rows never get. Without this,
    // "the consensus target is $781" citing fmp:price-target-consensus would
    // have gone from unknown-source to supported, on exactly the dimension the
    // row does not establish.
    if (
      record === undefined &&
      sourceId !== null &&
      input.citationRegistry.some((entry) => entry.id === sourceId && entry.currencyUnknown === true) &&
      statesCurrencyOnNumber(sentence)
    ) {
      unit.fail();
      rejectedClaimPaths.add(path);
      fail(
        "unit",
        "currency-not-established",
        `The sentence puts a currency on a figure from ${sourceId}, whose currency the source does not establish.`,
      );
    }

    /* ---- the numeric checks need a located registry figure --------------- */
    if (record === undefined) continue;
    const numbers = parseNumbers(sentence);
    const located = locateNumbers(numbers, record);
    // The module's design rule: a check applies only to a sentence in which
    // the cited figure was LOCATED. The period check used to run before this
    // guard (audit 2026-09-06, F189), so a sentence that named a year around
    // some other number was judged against a figure it never wrote.
    if (located.length === 0) continue;

    /* ---- period ---------------------------------------------------------- */
    if (record.period !== null) {
      const phrases = findPeriodPhrases(sentence, numbers, located);
      if (phrases.length > 0) {
        if (phrases.some((phrase) => phraseNamesRecordYear(phrase, record.period))) {
          period.pass();
        } else {
          period.fail();
          fail(
            "period",
            "period-word-mismatch",
            `The sentence names ${phrases.map((p) => `"${p}"`).join(", ")} but the cited figure is registered for period ${record.period}.`,
          );
        }
      }
    }

    /* ---- unit ------------------------------------------------------------ */
    const admissible = admissibleFamilies(record.unit);
    if (admissible.size > 0) {
      const families = located
        .map((parsed) => unitFamilyOf(parsed))
        .filter((family): family is UnitFamily => family !== null);
      if (families.length > 0) {
        const wrong = families.filter((family) => !admissible.has(family));
        if (wrong.length === 0) {
          unit.pass();
        } else {
          unit.fail();
          fail(
            "unit",
            "unit-word-mismatch",
            `The sentence writes the cited figure in ${[...new Set(wrong)].join("/")} units, but the registry records it as ${record.unit}${record.currency === null ? "" : ` (${record.currency})`}.`,
          );
        }
      }
    }

    /* ---- direction ------------------------------------------------------- */
    if (isDeltaRecord(record) && record.value !== 0) {
      const hits = findDirectionWords(sentence);
      // The NEAREST qualifying direction word owns the figure. "Operating income
      // rose 12.0% while revenue slipped 3.2%" cites the 3.2% decline, and the
      // word attached to it is "slipped", not the "rose" that belongs to the
      // other figure earlier in the sentence.
      const attached = located.flatMap((parsed) => {
        let nearest: DirectionHit | null = null;
        for (const hit of hits) {
          if (hit.end > parsed.start) continue;
          if (parsed.start - hit.end > DIRECTION_WINDOW_CHARS) continue;
          if (DELTA_BREAKERS.test(sentence.slice(hit.end, parsed.start))) continue;
          if (nearest === null || hit.end > nearest.end) nearest = hit;
        }
        return nearest === null ? [] : [nearest];
      });
      if (attached.length > 0) {
        const expected = record.value > 0 ? 1 : -1;
        const wrong = attached.filter((hit) => hit.polarity !== expected);
        if (wrong.length === 0) {
          direction.pass();
        } else {
          direction.fail();
          fail(
            "direction",
            "direction-mismatch",
            `The sentence says "${wrong[0].word}" about the cited change, but the registry records it as ${record.value > 0 ? "positive" : "negative"} (${record.value} ${record.unit}).`,
          );
        }
      }
    }
  }

  return {
    findings,
    checks: {
      direction: direction.rate(),
      period: period.rate(),
      unit: unit.rate(),
      namedIndividual: namedIndividual.rate(),
    },
    rejectedClaimPaths,
  };
}

/** Every check family reported zero-checked (no claims, or verification skipped). */
export function emptyConsistencyChecks(): ConsistencyChecks {
  const zero: CheckRate = { checked: 0, passed: 0, failed: 0, rate: null };
  return { direction: zero, period: zero, unit: zero, namedIndividual: { ...zero } };
}

const CHECK_MANIFEST_TEXT: Record<keyof ConsistencyChecks, string> = {
  direction: "sentence(s) whose direction word contradicts the sign of the change they cite",
  period: "sentence(s) naming a period the figure they cite is not registered for",
  unit: "sentence(s) writing a cited figure in a unit the registry does not record it in, or putting a currency on a figure whose currency is not established",
  namedIndividual:
    "claim(s) about a named individual, or in the executive-credibility section, resting on a source that is neither a filing, a transcript, a registry figure nor a payload executive, compensation or insider row that lists that person and title",
};

/**
 * Manifest disclosure for the deterministic checks. A failure that lives only in
 * the verification log is easy to miss; the missing-data manifest is where a
 * reader already looks for "what is wrong with this report", so each failing
 * family gets one entry naming the count and pointing at the detailed rows.
 * Families with nothing to report add nothing — the manifest is not a scoreboard.
 */
export function consistencyManifestEntries(
  checks: ConsistencyChecks,
): { field: string; reason: string; severity: "warn"; attemptedSources: string[] }[] {
  return (Object.keys(CHECK_MANIFEST_TEXT) as (keyof ConsistencyChecks)[]).flatMap((family) => {
    const rate = checks[family];
    if (rate.failed === 0) return [];
    return [
      {
        field: `verify.check.${family}`,
        reason: `${rate.failed} of ${rate.checked} checked ${CHECK_MANIFEST_TEXT[family]}. Each one is listed in the verification log with the sentence, the cited figure and the reason.`,
        severity: "warn" as const,
        attemptedSources: ["deterministic-verify"],
      },
    ];
  });
}
