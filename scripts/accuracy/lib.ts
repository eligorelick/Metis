/**
 * accuracy:check logic: pure functions shared by the check, the fetch script and
 * the tests. Nothing here touches the network, the disk or the application.
 *
 * - Filed-fact selection over SEC companyfacts JSON (`selectDuration`,
 *   `selectInstant`, `buildTtm`): newest filing on or before the report's cutoff
 *   (P2), exact period (P1), one unit (P3/P4).
 * - Classification (`classifyFigure`): "same value" is the P8 owner's test,
 *   `vendorAgreesWithFiled` for a directly filed value and
 *   `vendorAgreesWithDerived` for one built from filed operands
 *   (src/edgar/vendorAgreement.ts). No new tolerance is defined here.
 * - Expectation diffing (`diffExpectation`): status per figure plus a short
 *   SHA-256 prefix of Metis's value for anything that is not a match.
 */
import { createHash } from "node:crypto";
import { vendorAgreesWithDerived, vendorAgreesWithFiled } from "../../src/edgar/vendorAgreement";

// ---------------------------------------------------------------- SEC facts

export interface SecFact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number | null;
  fp?: string | null;
  form: string;
  filed: string;
  frame?: string;
}

/** companyfacts JSON: facts[taxonomy][concept].units[unit] = SecFact[]. */
export interface CompanyFacts {
  cik?: number;
  entityName?: string;
  facts: Record<string, Record<string, { units: Record<string, SecFact[]> }>>;
}

/** One filed observation, as the reference records it. */
export interface FiledPoint {
  concept: string;
  unit: string;
  start?: string;
  end: string;
  val: number;
  form: string;
  accn: string;
  filed: string;
  /** Earlier filings (on or before the cutoff) that stated a different value for the same period. */
  restated?: { accn: string; filed: string; val: number }[];
}

/** Periodic report forms whose financial statements carry the filed values. */
const STATEMENT_FORMS = new Set(["10-K", "10-Q", "20-F", "40-F", "10-K/A", "10-Q/A", "20-F/A", "40-F/A", "10-KT", "10-QT"]);

export function dayNumber(date: string): number {
  const ms = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`bad date ${date}`);
  return Math.round(ms / 86_400_000);
}

export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** The cutoff as a filing date: a filing dated on the cutoff's UTC day counts (filed dates carry no time). */
export function cutoffDate(cutoffAt: string): string {
  return cutoffAt.slice(0, 10);
}

/** "taxonomy:Concept" or a bare us-gaap concept name. */
export function splitConcept(concept: string): { taxonomy: string; name: string } {
  const at = concept.indexOf(":");
  return at < 0 ? { taxonomy: "us-gaap", name: concept } : { taxonomy: concept.slice(0, at), name: concept.slice(at + 1) };
}

export function factsFor(facts: CompanyFacts, concept: string, unit: string): SecFact[] {
  const { taxonomy, name } = splitConcept(concept);
  return facts.facts[taxonomy]?.[name]?.units[unit] ?? [];
}

export interface PeriodQuery {
  /** Exact start, when known. */
  start?: string;
  end: string;
  /** When start is not given: the duration class to accept. */
  durationDays?: { min: number; max: number };
}

export const FISCAL_YEAR_DAYS = { min: 350, max: 380 } as const;
export const QUARTER_DAYS = { min: 80, max: 100 } as const;

function durationMatches(fact: SecFact, query: PeriodQuery): boolean {
  if (fact.end !== query.end || fact.start === undefined) return false;
  if (query.start !== undefined) return fact.start === query.start;
  if (!query.durationDays) return false;
  const days = dayNumber(fact.end) - dayNumber(fact.start) + 1;
  return days >= query.durationDays.min && days <= query.durationDays.max;
}

/**
 * The value filed for one period: among statement-form facts filed on or
 * before the cutoff whose period matches, the newest filing wins (P2). Earlier
 * filings that stated a different value are kept as restatements.
 */
function pickNewest(candidates: SecFact[], concept: string, unit: string, cutoff: string): FiledPoint | null {
  const admitted = candidates
    .filter((fact) => STATEMENT_FORMS.has(fact.form) && fact.filed <= cutoff)
    .sort((a, b) => (a.filed === b.filed ? a.accn.localeCompare(b.accn) : a.filed.localeCompare(b.filed)));
  const chosen = admitted.at(-1);
  if (!chosen) return null;
  const restated = admitted
    .filter((fact) => fact.accn !== chosen.accn && fact.val !== chosen.val)
    .map((fact) => ({ accn: fact.accn, filed: fact.filed, val: fact.val }));
  const point: FiledPoint = { concept, unit, ...(chosen.start ? { start: chosen.start } : {}), end: chosen.end, val: chosen.val, form: chosen.form, accn: chosen.accn, filed: chosen.filed };
  if (restated.length > 0) point.restated = dedupeRestated(restated);
  return point;
}

function dedupeRestated(rows: { accn: string; filed: string; val: number }[]): { accn: string; filed: string; val: number }[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.accn}|${row.val}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function selectDuration(facts: CompanyFacts, concepts: readonly string[], unit: string, query: PeriodQuery, cutoff: string): FiledPoint | null {
  for (const concept of concepts) {
    const point = pickNewest(factsFor(facts, concept, unit).filter((fact) => durationMatches(fact, query)), concept, unit, cutoff);
    if (point) return point;
  }
  return null;
}

export function selectInstant(facts: CompanyFacts, concepts: readonly string[], unit: string, end: string, cutoff: string, accn?: string): FiledPoint | null {
  for (const concept of concepts) {
    const candidates = factsFor(facts, concept, unit).filter((fact) => fact.start === undefined && fact.end === end && (accn === undefined || fact.accn === accn));
    const point = pickNewest(candidates, concept, unit, cutoff);
    if (point) return point;
  }
  return null;
}

/** The latest fiscal-year fact (10-K/20-F) ending strictly before `before`, for one concept. */
export function latestFiscalYearEnd(facts: CompanyFacts, concepts: readonly string[], unit: string, before: string, cutoff: string): string | null {
  let best: string | null = null;
  for (const concept of concepts) {
    for (const fact of factsFor(facts, concept, unit)) {
      if (fact.start === undefined || fact.filed > cutoff || !STATEMENT_FORMS.has(fact.form)) continue;
      const days = dayNumber(fact.end) - dayNumber(fact.start) + 1;
      if (days < FISCAL_YEAR_DAYS.min || days > FISCAL_YEAR_DAYS.max || fact.end >= before) continue;
      if (!/^(10-K|20-F|40-F|10-KT)/.test(fact.form)) continue;
      if (best === null || fact.end > best) best = fact.end;
    }
    if (best !== null) return best;
  }
  return best;
}

export interface FiledDerivation {
  value: number;
  /** Human-readable identity, e.g. "FY + YTD − prior YTD". */
  formula: string;
  operands: { role: string; sign: 1 | -1; point: FiledPoint }[];
}

/**
 * A trailing-twelve-month additive flow from filed periods (P1): the fiscal year
 * ending `fiscalYearEnd`, plus the current year to date ending `end`, less the
 * prior-year year to date. When `end` is itself the fiscal-year end the fiscal
 * year stands alone. The two year-to-date operands must come from one filing.
 * Per-share values are never built this way.
 */
export function buildTtm(facts: CompanyFacts, concepts: readonly string[], unit: string, fiscalYearEnd: string, end: string, cutoff: string): FiledDerivation | null {
  if (fiscalYearEnd === end) {
    const fy = selectDuration(facts, concepts, unit, { end, durationDays: FISCAL_YEAR_DAYS }, cutoff);
    return fy ? { value: fy.val, formula: "fiscal year", operands: [{ role: "fiscal year", sign: 1, point: fy }] } : null;
  }
  for (const concept of concepts) {
    const fy = selectDuration(facts, [concept], unit, { end: fiscalYearEnd, durationDays: FISCAL_YEAR_DAYS }, cutoff);
    if (!fy?.start) continue;
    const ytdStart = addDays(fiscalYearEnd, 1);
    const ytd = selectDuration(facts, [concept], unit, { start: ytdStart, end }, cutoff);
    if (!ytd) continue;
    // Prior-year YTD: starts at the fiscal year's start and ends about a year before `end`, in the same filing as `ytd`.
    const priorCandidates = factsFor(facts, concept, unit).filter((fact) => fact.start === fy.start && fact.accn === ytd.accn
      && Math.abs(dayNumber(fact.end) - (dayNumber(end) - 365)) <= 7);
    const prior = pickNewest(priorCandidates, concept, unit, cutoff);
    if (!prior) continue;
    return {
      value: fy.val + ytd.val - prior.val,
      formula: "fiscal year + current year to date − prior-year year to date",
      operands: [
        { role: "fiscal year", sign: 1, point: fy },
        { role: "current year to date", sign: 1, point: ytd },
        { role: "prior-year year to date", sign: -1, point: prior },
      ],
    };
  }
  return null;
}

// ------------------------------------------------- filing XBRL instance

const TAXONOMY_URIS: [RegExp, string][] = [
  [/fasb\.org\/us-gaap\//, "us-gaap"],
  [/xbrl\.ifrs\.org\/taxonomy\/.*ifrs-full/, "ifrs-full"],
  [/xbrl\.sec\.gov\/dei\//, "dei"],
];

function unitName(measure: string): string {
  const local = measure.trim().replace(/^[^:]*:/, "");
  return local;
}

/**
 * Non-dimensional facts from one filing's XBRL instance document (the
 * `*_htm.xml` an inline-XBRL filing carries), in companyfacts shape. Used when
 * SEC's companyfacts API has not ingested a filing. Contexts with a segment or
 * scenario (subsidiary, class or member breakdowns) are left out, as
 * companyfacts leaves them out; nil facts are skipped.
 */
export function parseXbrlInstance(xml: string, meta: { accn: string; form: string; filed: string }): CompanyFacts {
  const prefixes = new Map<string, string>();
  for (const match of xml.matchAll(/xmlns:([A-Za-z0-9_-]+)="([^"]+)"/g)) {
    const taxonomy = TAXONOMY_URIS.find(([pattern]) => pattern.test(match[2]!))?.[1];
    if (taxonomy) prefixes.set(match[1]!, taxonomy);
  }
  const contexts = new Map<string, { start?: string; end: string }>();
  for (const match of xml.matchAll(/<(?:[A-Za-z0-9_-]+:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?context>/g)) {
    const body = match[2]!;
    if (/<(?:[A-Za-z0-9_-]+:)?(segment|scenario)\b/.test(body)) continue;
    const instant = /<(?:[A-Za-z0-9_-]+:)?instant>\s*([0-9-]{10})/.exec(body)?.[1];
    const start = /<(?:[A-Za-z0-9_-]+:)?startDate>\s*([0-9-]{10})/.exec(body)?.[1];
    const end = /<(?:[A-Za-z0-9_-]+:)?endDate>\s*([0-9-]{10})/.exec(body)?.[1];
    if (instant) contexts.set(match[1]!, { end: instant });
    else if (start && end) contexts.set(match[1]!, { start, end });
  }
  const units = new Map<string, string>();
  for (const match of xml.matchAll(/<(?:[A-Za-z0-9_-]+:)?unit\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?unit>/g)) {
    const body = match[2]!;
    const numerator = /<(?:[A-Za-z0-9_-]+:)?unitNumerator>[\s\S]*?<(?:[A-Za-z0-9_-]+:)?measure>([^<]+)</.exec(body)?.[1];
    const denominator = /<(?:[A-Za-z0-9_-]+:)?unitDenominator>[\s\S]*?<(?:[A-Za-z0-9_-]+:)?measure>([^<]+)</.exec(body)?.[1];
    if (numerator && denominator) units.set(match[1]!, `${unitName(numerator)}/${unitName(denominator)}`);
    else {
      const measure = /<(?:[A-Za-z0-9_-]+:)?measure>([^<]+)</.exec(body)?.[1];
      if (measure) units.set(match[1]!, unitName(measure));
    }
  }
  const out: CompanyFacts = { facts: {} };
  const seen = new Set<string>();
  for (const match of xml.matchAll(/<([A-Za-z0-9_-]+):([A-Za-z0-9_]+)\b([^>]*?)(?<!\/)>([^<]*)<\/\1:\2>/g)) {
    const taxonomy = prefixes.get(match[1]!);
    if (!taxonomy) continue;
    const attributes = match[3]!;
    if (/xsi:nil="true"/.test(attributes)) continue;
    const contextRef = /\bcontextRef="([^"]+)"/.exec(attributes)?.[1];
    const unitRef = /\bunitRef="([^"]+)"/.exec(attributes)?.[1];
    if (!contextRef || !unitRef) continue;
    const context = contexts.get(contextRef);
    const unit = units.get(unitRef);
    const value = Number(match[4]!.trim());
    if (!context || !unit || match[4]!.trim() === "" || !Number.isFinite(value)) continue;
    const key = `${taxonomy}|${match[2]}|${unit}|${context.start ?? ""}|${context.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const concept = ((out.facts[taxonomy] ??= {})[match[2]!] ??= { units: {} });
    (concept.units[unit] ??= []).push({ ...(context.start ? { start: context.start } : {}), end: context.end, val: value, accn: meta.accn, form: meta.form, filed: meta.filed });
  }
  return out;
}

/** companyfacts plus the facts of filings it has not ingested; a fact already present for the same filing is kept once. */
export function mergeFacts(base: CompanyFacts, extra: CompanyFacts): CompanyFacts {
  const merged: CompanyFacts = { ...base, facts: structuredClone(base.facts) };
  for (const [taxonomy, concepts] of Object.entries(extra.facts)) {
    for (const [name, concept] of Object.entries(concepts)) {
      for (const [unit, rows] of Object.entries(concept.units)) {
        const target = ((merged.facts[taxonomy] ??= {})[name] ??= { units: {} });
        const list = (target.units[unit] ??= []);
        for (const row of rows) {
          if (!list.some((existing) => existing.accn === row.accn && existing.end === row.end && existing.start === row.start)) list.push(row);
        }
      }
    }
  }
  return merged;
}

// ------------------------------------------------------------ classification

export type FigureStatus = "match" | "mismatch" | "gap" | "not-established";

/** How a filed reference value was obtained. */
export type ReferenceKind = "filed" | "derived" | "ratio";

export interface ReferenceValue {
  kind: ReferenceKind;
  value: number;
  /** Operands whose rounding a derived value inherits (P8 `vendorAgreesWithDerived`). */
  operands?: number[];
}

export interface Classification {
  status: FigureStatus;
  detail: string;
}

/**
 * Metis's figure against the filed reference. A withheld figure is a disclosed
 * gap; a reference that could not be established never yields a match; a
 * period other than the reference's is a mismatch whatever the value.
 */
export function classifyFigure(input: {
  metis: number | null;
  metisPeriod: string;
  reference: ReferenceValue | null;
  referencePeriod: string | null;
}): Classification {
  if (input.metis === null || !Number.isFinite(input.metis)) return { status: "gap", detail: "Metis withholds the figure" };
  if (input.reference === null || input.referencePeriod === null) return { status: "not-established", detail: "filed value not established" };
  if (input.metisPeriod !== input.referencePeriod) {
    return { status: "mismatch", detail: `period ${input.metisPeriod} differs from the filed reference period ${input.referencePeriod}` };
  }
  if (sameObservation(input.metis, input.reference)) return { status: "match", detail: "same observation (P8 owner)" };
  return { status: "mismatch", detail: `differs by ${formatNumber(input.metis - input.reference.value)} (${relativeGap(input.metis, input.reference.value)})` };
}

export function sameObservation(metis: number, reference: ReferenceValue): boolean {
  if (reference.kind === "derived") return vendorAgreesWithDerived(metis, reference.value, reference.operands ?? []);
  return vendorAgreesWithFiled(metis, reference.value);
}

function relativeGap(a: number, b: number): string {
  const larger = Math.max(Math.abs(a), Math.abs(b));
  if (larger === 0) return "0%";
  return `${((Math.abs(a - b) / larger) * 100).toFixed(4)}% of the larger`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return value.toLocaleString("en-US");
  return Number(value.toPrecision(10)).toString();
}

// --------------------------------------------------------------- expectation

/** Canonical text of Metis's value, hashed so vendor-derived values are never committed. */
export function valueHash(value: number | null): string {
  return createHash("sha256").update(value === null ? "null" : JSON.stringify(value)).digest("hex").slice(0, 16);
}

export interface ExpectationEntry {
  case: string;
  figure: string;
  status: FigureStatus;
  /** SHA-256 prefix of Metis's value; null for a match, whose value is proven against the filing instead. */
  valueSha256: string | null;
  /** Cause of a mismatch: "Metis error", "definition" or "vendor value shown". */
  cause?: string;
  note?: string;
  /** Why the entry last changed; required on every entry written by --update-expectation for a changed figure. */
  changeReason?: string;
}

export interface ObservedFigure {
  case: string;
  figure: string;
  status: FigureStatus;
  metis: number | null;
}

export type DifferenceKind = "better" | "worse" | "changed value" | "new figure" | "missing figure";

export interface Difference {
  case: string;
  figure: string;
  kind: DifferenceKind;
  detail: string;
}

/** Higher is better: a proven value, then an honest gap, then an unproven value, then a wrong one. */
const STATUS_RANK: Record<FigureStatus, number> = { match: 3, gap: 2, "not-established": 1, mismatch: 0 };

export function expectationKey(entry: { case: string; figure: string }): string {
  return `${entry.case}/${entry.figure}`;
}

/**
 * Observed figures against the committed expectation. A status change is
 * better or worse by rank; a non-match whose value hash moved is a changed
 * value; a match may change value freely because it is proven against the filing.
 */
export function diffExpectation(expected: readonly ExpectationEntry[], observed: readonly ObservedFigure[]): Difference[] {
  const differences: Difference[] = [];
  const byKey = new Map(expected.map((entry) => [expectationKey(entry), entry]));
  const seen = new Set<string>();
  for (const figure of observed) {
    const key = expectationKey(figure);
    seen.add(key);
    const entry = byKey.get(key);
    if (!entry) {
      differences.push({ case: figure.case, figure: figure.figure, kind: "new figure", detail: `now ${figure.status}; not in the expectation` });
      continue;
    }
    if (entry.status !== figure.status) {
      const kind: DifferenceKind = STATUS_RANK[figure.status] > STATUS_RANK[entry.status] ? "better" : "worse";
      differences.push({ case: figure.case, figure: figure.figure, kind, detail: `${entry.status} -> ${figure.status}` });
      continue;
    }
    if (figure.status !== "match") {
      const hash = valueHash(figure.metis);
      if (hash !== entry.valueSha256) differences.push({ case: figure.case, figure: figure.figure, kind: "changed value", detail: `still ${figure.status}, but Metis's value changed (hash ${entry.valueSha256} -> ${hash})` });
    }
  }
  for (const entry of expected) {
    if (!seen.has(expectationKey(entry))) differences.push({ case: entry.case, figure: entry.figure, kind: "missing figure", detail: `expected ${entry.status}; the run did not produce it` });
  }
  return differences;
}

/**
 * The expectation after a deliberate change: every changed figure takes its
 * observed status and value hash and the given reason; unchanged entries keep
 * their notes. A blank reason is refused.
 */
export function updateExpectation(expected: readonly ExpectationEntry[], observed: readonly ObservedFigure[], reason: string): ExpectationEntry[] {
  if (!reason.trim()) throw new Error("--update-expectation needs --reason TEXT");
  const differences = new Set(diffExpectation(expected, observed).map(expectationKey));
  const byKey = new Map(expected.map((entry) => [expectationKey(entry), entry]));
  return observed.map((figure) => {
    const key = expectationKey(figure);
    const previous = byKey.get(key);
    const next: ExpectationEntry = {
      case: figure.case,
      figure: figure.figure,
      status: figure.status,
      valueSha256: figure.status === "match" ? null : valueHash(figure.metis),
      ...(previous?.cause && figure.status !== "match" && figure.status !== "gap" ? { cause: previous.cause } : {}),
      ...(previous?.note ? { note: previous.note } : {}),
    };
    if (differences.has(key)) next.changeReason = reason.trim();
    else if (previous?.changeReason) next.changeReason = previous.changeReason;
    return next;
  });
}
