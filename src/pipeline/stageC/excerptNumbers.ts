/**
 * D-45 (2026-10-13): read a number cited to a filing or transcript excerpt
 * against the text of THAT excerpt.
 *
 * Before this, a TracedNumber citing `edgar:10-K item7` was unverifiable by
 * construction: the verifier only knew numeric registry records, so JPM report
 * 26 logged 25 numbers as "text-source" although the excerpt the model was
 * shown prints most of them ("$915 billion", "14.2 %", a "95,640" cell in an
 * "(in millions" table).
 *
 * The match is deliberately narrow, and fails closed at every step:
 *  - Only the cited excerpt's body is searched, never the full filing section,
 *    another excerpt or the truncation marker the assembler appended.
 *  - The unit must agree: a percent claim needs a printed "%"/"percent", money
 *    needs a printed "$" (read as the issuer's reporting currency only when the
 *    statements establish one dollar currency), a count needs neither.
 *    Per-share, ratio, score and every other unit fail.
 *  - The value must be what the text prints, at the printed precision: within
 *    half a step of the printed figure and an exact multiple of that step.
 *    A currency candidate may declare its own printed scale in `displayUnit`
 *    ("USD billions: Net sales"). It is converted to base units once before
 *    comparison; neither the source value nor a convenient match sets it.
 *  - The printed figure must be specific: three or more significant digits,
 *    or two with a decimal or a scale word. "7%" or a bare "4" cell matches
 *    too many unrelated figures by chance (50% of whole percents 1..30 hit
 *    somewhere in JPM's 10-K MD&A excerpt, measured 2026-10-13).
 *  - The claim's own description — the words the model wrote beyond the bare
 *    unit ("% Standardized CET1 ratio") and the label of the row the number
 *    sits in — must name the figure: more than half of its distinctive words
 *    must appear within {@link DESCRIPTION_WINDOW} characters of the printed
 *    figure and inside its sentence or, for a table cell, in the row's own
 *    label. A claim with no distinctive words is not accepted at all. This is
 *    what stops a right value being read with the wrong meaning ("15.1" is
 *    printed for two different ratios in JPM's 10-Q).
 * What it does not check: the period. A supplied period is not compared with
 * the column the figure was printed in, so the log says so on every match.
 */

import type { CanonicalUnit } from "@/pipeline/stageC/provenance";

/** How far either side of a printed figure its description may sit. */
export const DESCRIPTION_WINDOW = 250;

/** The table-scale header must sit this close above a cell to apply. */
const TABLE_HEADER_WINDOW = 1_500;

/** How much text before a table row is read as that row's label. */
const ROW_LABEL_CHARS = 150;

const SCALE_WORDS: Readonly<Record<string, number>> = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
};

/** Dollar currencies a bare "$" in an issuer's own filing can stand for. */
const DOLLAR_CURRENCIES = new Set(["USD", "CAD", "AUD", "NZD", "SGD", "HKD"]);

export interface ExcerptMention {
  value: number;
  unit: "percent" | "currency" | "count";
  /** The value of one unit in the last printed digit. */
  step: number;
  significantDigits: number;
  decimals: boolean;
  /** A scale word or a table header scaled the printed figure. */
  scaled: boolean;
  /** Read from a table cell scaled by an "(in millions" header. */
  table: boolean;
  /**
   * The words before the row, when the figure is one of two or more figures
   * with no word between them — a flattened table row ("Total noninterest
   * expense 95,640 91,797 4"). Null for a figure in running prose.
   */
  rowLabel: string | null;
  raw: string;
  index: number;
  end: number;
}

export type ExcerptMatch =
  | { ok: true; mention: ExcerptMention; token: string; currency: string | null }
  | {
      ok: false;
      /**
       * - unit-mismatch: the claim's unit cannot be read from prose.
       * - currency-mismatch: money with no established dollar reporting
       *   currency, or a claim in another currency.
       * - text-source: the value is not printed in the cited excerpt.
       * - text-ambiguous: printed only with too few digits to be specific.
       * - text-context-mismatch: printed, but the claim's description does not
       *   name it (or the claim carries no description).
       */
      reason: "unit-mismatch" | "currency-mismatch" | "text-source" | "text-ambiguous" | "text-context-mismatch";
      /** The printed figures the value matched, when any did. */
      mentions?: ExcerptMention[];
    };

function significantDigits(intPart: string, frac: string): number {
  const digits = (intPart + frac).replace(/^0+/, "");
  return frac.length > 0 ? digits.length : digits.replace(/0+$/, "").length;
}

/**
 * The scale of the nearest "(in thousands|millions|billions" header above
 * `index`, when a "$" sits between it and the cell (a money table, not a
 * share-count one). An "except per share" header is reported so a "$" cell,
 * which may be the per-share line, is never scaled under it.
 */
function tableScale(text: string, index: number): { scale: number; exceptPerShare: boolean } | null {
  const window = text.slice(Math.max(0, index - TABLE_HEADER_WINDOW), index);
  const headers = [...window.matchAll(/\(in (thousands|millions|billions)\b([^)]*)/gi)];
  const last = headers.at(-1);
  if (last === undefined || last.index === undefined) return null;
  if (!window.slice(last.index).includes("$")) return null;
  return {
    scale: SCALE_WORDS[last[1].toLowerCase().replace(/s$/, "")],
    exceptPerShare: /except\s+per\s+share/i.test(last[2] ?? ""),
  };
}

/** Every figure printed in `body`, read with its unit and printed precision. */
export function excerptNumberMentions(body: string): ExcerptMention[] {
  const out: ExcerptMention[] = [];
  const pattern =
    /(\(\s*)?(-)?(\$\s?)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s*\))?(?:\s*(%|percent\b|thousand\b|million\b|billion\b|trillion\b))?/gi;
  for (const m of body.matchAll(pattern)) {
    const at = m.index;
    const lead = m[1] ?? "";
    const dollar = m[3] !== undefined;
    const end = at + m[0].length;
    // Not a figure when glued to a word or another number: CET1, 10-Q, Q2,
    // 2026-06-30, 1/3, 3.60's tail. A "$" glued to a letter is another
    // dollar (C$, NT$, A$, HK$) and is skipped by the same test.
    if (lead === "" && /[A-Za-z0-9.\-/]/.test(body.slice(Math.max(0, at - 1), at))) continue;
    const suffix = (m[7] ?? "").toLowerCase();
    if (suffix === "" && /[A-Za-z0-9]/.test(body.slice(end, end + 1))) continue;
    const intDigits = m[4].replace(/,/g, "");
    const frac = (m[5] ?? "").slice(1);
    // A "% Change" column header, and a bare four-digit year, are not figures.
    if (suffix === "%" && /^\s*change/i.test(body.slice(end, end + 10))) continue;
    if (!dollar && suffix === "" && frac === "" && !m[4].includes(",") && /^(19|20)\d{2}$/.test(intDigits)) continue;
    // "(x)" closed right after the figure is an accounting negative; an
    // opening parenthesis alone ("(15.1%)") is an aside.
    const negative = (lead !== "" && (m[6] ?? "") !== "") || m[2] === "-";
    let unit: ExcerptMention["unit"] = dollar ? "currency" : "count";
    let scale = 1;
    let table = false;
    if (suffix === "%" || suffix === "percent") {
      if (dollar) continue;
      unit = "percent";
    } else if (suffix in SCALE_WORDS) {
      scale = SCALE_WORDS[suffix];
    } else if (frac === "" && m[4].includes(",")) {
      // Only a comma-grouped whole number takes a table's scale. A decimal
      // cell ("$ 126.99" book value per share in an "(in millions, except per
      // share data" table) never does, and under an "except per share" header
      // neither does any "$" cell (D-45 review: both read as millions before).
      const header = tableScale(body, at);
      if (header !== null && !(dollar && header.exceptPerShare)) {
        scale = header.scale;
        unit = "currency";
        table = true;
      }
    }
    const base = Number(`${intDigits}${frac === "" ? "" : `.${frac}`}`);
    out.push({
      value: (negative ? -1 : 1) * base * scale,
      unit,
      step: scale * 10 ** -frac.length,
      significantDigits: significantDigits(intDigits, frac),
      decimals: frac.length > 0,
      scaled: scale !== 1,
      table,
      raw: m[0].trim(),
      index: at,
      end,
      rowLabel: null,
    });
  }
  // Group figures with no letter between them into rows; a row of two or
  // more is a table row, labelled by the text since the previous figure.
  let start = 0;
  for (let i = 1; i <= out.length; i++) {
    if (i < out.length && !/[A-Za-z]/.test(body.slice(out[i - 1].end, out[i].index))) continue;
    if (i - start >= 2) {
      const from = Math.max(start === 0 ? 0 : out[start - 1].end, out[start].index - ROW_LABEL_CHARS);
      const label = body.slice(from, out[start].index);
      for (let j = start; j < i; j++) out[j].rowLabel = label;
    }
    start = i;
  }
  return out;
}

/** Enough printed digits that a chance match is unlikely. */
export function isSpecificMention(mention: ExcerptMention): boolean {
  return (
    mention.significantDigits >= 3 ||
    (mention.significantDigits >= 2 && (mention.decimals || mention.scaled))
  );
}

/**
 * Words that describe no particular figure: function words, unit and scale
 * words, period words, claim labels and filing boilerplate. Kept explicit so a
 * reviewer can see what a description must go beyond.
 */
const GENERIC_DESCRIPTION_WORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "is", "it", "its", "of", "on", "or",
  "per", "the", "to", "vs", "was", "were", "with", "not", "no",
  "currency", "percent", "percentage", "pct", "usd", "dollar", "dollars", "count", "shares", "share",
  "thousand", "thousands", "million", "millions", "billion", "billions", "trillion", "trillions",
  "total", "amount", "value", "figure", "number", "level", "ratio", "rate",
  "annual", "annually", "quarterly", "quarter", "year", "years", "yearly", "fiscal", "fy", "period", "ended",
  "reported", "report", "reports", "fact", "estimate", "judgment", "filing", "excerpt",
  "approximately", "about", "over", "under", "up", "down", "change", "changes", "increase", "decrease",
  "growth", "company", "firm", "firmwide",
]);

/**
 * The distinctive words of a claim's own description: lowercased words of two
 * or more characters with at least one letter, minus the generic list and the
 * issuer's own name (which a filing prints everywhere).
 */
export function descriptionTokens(description: string, ignore: readonly string[] = []): string[] {
  const ignored = new Set(ignore.flatMap((text) => text.toLowerCase().match(/[a-z0-9]+/g) ?? []));
  const tokens = description.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return [...new Set(tokens.filter((token) =>
    token.length >= 2 && /[a-z]/.test(token) && !GENERIC_DESCRIPTION_WORDS.has(token) && !ignored.has(token)))];
}

/** Whole-word match, allowing a plural on either side ("asset"/"assets"). */
function windowNames(window: string, token: string): boolean {
  const stem = token.length > 3 ? token.replace(/s$/, "") : token;
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}s?(?![a-z0-9])`, "i").test(window);
}

/** A sentence or bullet ends here: ". " before a capital, "•", "; " or a newline. */
const SENTENCE_BOUNDARY = /[.!?](?=\s+[A-Z“"(•])|•|;(?=\s)|\n/g;

/**
 * The {@link DESCRIPTION_WINDOW} either side of a prose figure, clipped to the
 * figure's own sentence or bullet. MD&A highlights are bullet lists of
 * unrelated figures, and the unclipped window let "eligible HQLA" name the
 * $107.56 tangible book value per share one bullet earlier.
 */
function sentenceWindow(body: string, mention: ExcerptMention): string {
  let from = Math.max(0, mention.index - DESCRIPTION_WINDOW);
  for (const boundary of body.slice(from, mention.index).matchAll(SENTENCE_BOUNDARY)) {
    from = Math.max(0, mention.index - DESCRIPTION_WINDOW) + boundary.index + boundary[0].length;
  }
  const after = body.slice(mention.end, mention.end + DESCRIPTION_WINDOW);
  const stop = [...after.matchAll(SENTENCE_BOUNDARY)][0];
  return body.slice(from, mention.end + (stop === undefined ? after.length : stop.index));
}

/**
 * The description words that name `mention` (joined), or null when they do
 * not. More than half of the claim's distinctive words must appear:
 *  - in running prose, within {@link DESCRIPTION_WINDOW} characters either
 *    side of the figure and inside its own sentence or bullet;
 *  - in a table row, in that row's own label. A flattened table packs a dozen
 *    rows into 250 characters, so the window let a "noninterest expense"
 *    claim verify against the noninterest REVENUE cell two rows up.
 * One word anywhere in the window was the minimum asked for; it accepted 126
 * of 795 deliberate swaps to other figures in JPM's excerpts (2026-10-13), a
 * "pre-provision profit" claim taking any dollar figure near the word
 * "provision". See D-45 for the measurement.
 */
export function nearbyDescriptionToken(
  body: string,
  mention: ExcerptMention,
  tokens: readonly string[],
): string | null {
  if (tokens.length === 0) return null;
  const context = mention.rowLabel ?? sentenceWindow(body, mention);
  const named = tokens.filter((token) => windowNames(context, token));
  return named.length * 2 > tokens.length ? named.join(" ") : null;
}

export interface ExcerptCandidate {
  value: number;
  unit: CanonicalUnit;
  currency: string | null;
  /**
   * Explicit printed-scale contract for money: "USD millions: Free cash flow",
   * or "currency millions: Free cash flow" with a separate declared currency.
   * Legacy units without a colon keep their existing base-unit interpretation.
   */
  displayUnit?: string;
}

/** Shared by excerpt and numeric-registry matching; never reads a source value. */
export function currencyCandidateInBaseUnits(candidate: ExcerptCandidate):
  | { ok: true; value: number; currency: string | null }
  | { ok: false; reason: "unit-mismatch" | "currency-mismatch" } {
  const separator = candidate.displayUnit?.indexOf(":") ?? -1;
  if (separator < 0) return { ok: true, value: candidate.value, currency: candidate.currency };
  // The delimiter separates a machine-readable scale from an unconstrained
  // metric label. Unknown and compound scales must not silently mean "ones".
  const prefix = candidate.displayUnit!.slice(0, separator).trim();
  const declared = /^(currency|[A-Z]{3})\s+(thousands?|millions?|billions?|trillions?)$/.exec(prefix);
  if (declared === null) return { ok: false, reason: "unit-mismatch" };
  const currency = declared[1] === "currency" ? candidate.currency : declared[1];
  if (currency === null || (candidate.currency !== null && candidate.currency !== currency)) {
    return { ok: false, reason: "currency-mismatch" };
  }
  const scale = SCALE_WORDS[declared[2].replace(/s$/, "")];
  const value = candidate.value * scale;
  if (!Number.isFinite(value)) return { ok: false, reason: "unit-mismatch" };
  return { ok: true, value, currency };
}

/** The printed figures equal to `candidate` at their printed precision. */
export function valueMentions(
  candidate: ExcerptCandidate,
  body: string,
  reportingCurrency: string | null,
): { ok: true; mentions: ExcerptMention[]; currency: string | null } | { ok: false; reason: "unit-mismatch" | "currency-mismatch" } {
  const want: ExcerptMention["unit"] | null =
    candidate.unit === "percent"
      ? "percent"
      : candidate.unit === "currency"
        ? "currency"
        : candidate.unit === "count" || candidate.unit === "shares"
          ? "count"
          : null;
  if (want === null) return { ok: false, reason: "unit-mismatch" };
  const normalized = want === "currency"
    ? currencyCandidateInBaseUnits(candidate)
    : { ok: true as const, value: candidate.value, currency: candidate.currency };
  if (!normalized.ok) return normalized;
  let currency: string | null = null;
  if (want === "currency") {
    // "$" in the issuer's filing is its reporting currency only when that is
    // one dollar currency; a claim in any other currency fails.
    if (reportingCurrency === null || !DOLLAR_CURRENCIES.has(reportingCurrency)) {
      return { ok: false, reason: "currency-mismatch" };
    }
    if (normalized.currency !== null && normalized.currency !== reportingCurrency) {
      return { ok: false, reason: "currency-mismatch" };
    }
    currency = reportingCurrency;
  }
  const mentions = excerptNumberMentions(body).filter((mention) => {
    if (mention.unit !== want) return false;
    // A bare decimal with no scale word is no count: in a flattened table
    // only the first row prints its "%" or "$", so "Tier 1 capital 15.1" (a
    // percent) and "Tangible book value per share 113.35" read as counts and
    // verified as "15.1 count" (review, 2026-10-13). A count is a whole
    // number or a scaled figure ("3.60 billion").
    if (want === "count" && mention.decimals && !mention.scaled) return false;
    const slack = 1e-9 * Math.max(1, Math.abs(mention.value));
    if (Math.abs(normalized.value - mention.value) > mention.step / 2 + slack) return false;
    // No more precise than the text: 915.3 billion is not "$915 billion".
    const steps = normalized.value / mention.step;
    return Math.abs(steps - Math.round(steps)) < 1e-6;
  });
  return { ok: true, mentions, currency };
}

/**
 * Whether `candidate` is printed in `body` (the cited excerpt's own text, see
 * excerptBodyForVerification) as a specific figure named by the claim's
 * description. See the module docstring for every rule.
 */
export function matchExcerptNumber(
  candidate: ExcerptCandidate,
  body: string,
  options: { reportingCurrency: string | null; description: string; ignoreWords?: readonly string[] },
): ExcerptMatch {
  const found = valueMentions(candidate, body, options.reportingCurrency);
  if (!found.ok) return found;
  if (found.mentions.length === 0) return { ok: false, reason: "text-source" };
  const specific = found.mentions.filter(isSpecificMention);
  if (specific.length === 0) return { ok: false, reason: "text-ambiguous", mentions: found.mentions };
  const tokens = descriptionTokens(options.description, options.ignoreWords);
  for (const mention of specific) {
    const token = nearbyDescriptionToken(body, mention, tokens);
    if (token !== null) return { ok: true, mention, token, currency: found.currency };
  }
  return { ok: false, reason: "text-context-mismatch", mentions: specific };
}
