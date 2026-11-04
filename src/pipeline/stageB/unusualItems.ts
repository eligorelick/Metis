import { CORE_FACT_FORMS, parseFactPoints, type CompanyFacts, type FactPoint } from "@/edgar/xbrl";
import type { ExtractedSection } from "@/pipeline/types";

/**
 * Audit item 15 (FCX-9) with AMZN audit 2026-10-20 finding 5: tagged items
 * inside operating income that do not recur, removed from the operating
 * income that seeds the DCF margin in both directions. Gains are reported
 * positive by their tags; charges are reported positive and lower operating
 * income. `AssetImpairmentCharges` is the total when filed; the three
 * component tags stand in only when it is not, so nothing is counted twice.
 */
import { DISPOSITION_GAIN_CANDIDATE_TAGS, UNUSUAL_OPERATING_GAIN_TAGS, UNUSUAL_OPERATING_CHARGE_TOTAL_TAG, UNUSUAL_OPERATING_CHARGE_COMPONENT_TAGS } from "@/edgar/tagSynonyms";
export { UNUSUAL_OPERATING_GAIN_TAGS, UNUSUAL_OPERATING_CHARGE_TOTAL_TAG, UNUSUAL_OPERATING_CHARGE_COMPONENT_TAGS } from "@/edgar/tagSynonyms";

export interface UnusualOperatingItems {
  /** Net amount the items added to operating income: gains positive, charges negative. */
  value: number;
  components: { tag: string; value: number }[];
  /**
   * Tags with an amount the filings don't place inside the window (Codex
   * review of PR #41): a fiscal-year amount with no filed prior year to date,
   * or the reverse. None of such a tag is removed.
   */
  withheld: { tag: string; reason: string }[];
  basis: string;
  /** A material possible gain cannot seed a perpetual margin without placement evidence. */
  dcfRefusal?: string;
}

/** D-198 house convention: an individual sale must be at least 10% of absolute seed EBIT. */
export const OPERATING_DISPOSITION_MATERIALITY_PCT = 10;
export interface OperatingDispositionEvent {
  date: string;
  name: string;
  value: number;
  tag: string;
  accession: string;
}
export interface OperatingDispositionRead {
  events: OperatingDispositionEvent[];
  refusal: string | null;
  basis: string;
}
type UnusualWindow = { ttmEnd: string; fiscalYearEnd: string | null; unit: string | null; observedAt: string;
  periodStart?: string | null; operatingIncome?: number | null; sections?: readonly ExtractedSection[] };

const DAY_MS = 86_400_000;
const dayMs = (d: string): number => Date.parse(`${d}T00:00:00Z`);
const near = (a: string, b: string, days: number): boolean => Math.abs(dayMs(a) - dayMs(b)) <= days * DAY_MS;
const shiftDays = (d: string, days: number): string => new Date(dayMs(d) + days * DAY_MS).toISOString().slice(0, 10);
const validDay = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(dayMs(d));
const millions = (v: number): string => `${(v / 1e6).toFixed(1)}M`;

/** Duration facts of one tag, filed by the build, latest filing per period. */
function durationPoints(facts: CompanyFacts, tag: string, unit: string, observedDay: string): FactPoint[] {
  const concept = facts.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown[]> } | undefined;
  const byPeriod = new Map<string, FactPoint>();
  for (const p of parseFactPoints(concept?.units?.[unit] ?? [])) {
    if (p.start === undefined || !CORE_FACT_FORMS.has(p.form) || !validDay(p.filed) || p.filed > observedDay) continue;
    const key = `${p.start}|${p.end}`;
    const cur = byPeriod.get(key);
    if (cur === undefined || p.filed > cur.filed || (p.filed === cur.filed && p.accn > cur.accn)) byPeriod.set(key, p);
  }
  return [...byPeriod.values()];
}

type TagTtm = { value: number } | { withheld: string } | null;

/**
 * One tag over the trailing twelve months: the fiscal-year fact plus the
 * year to date less the prior year to date. An untagged current year to date
 * is zero: a one-off is tagged in the filing for the period it fell in, and
 * that filing is the latest. The fiscal year and the prior year to date are
 * the split at the window's start, so when either one carries an amount the
 * other must be filed too; otherwise the tag is withheld rather than
 * guessed. Null when no fact ends inside the window.
 */
function tagTtm(points: FactPoint[], ttmEnd: string, fiscalYearEnd: string): TagTtm {
  const windowStart = shiftDays(ttmEnd, -365);
  if (!points.some((p) => p.end > windowStart && p.end <= ttmEnd)) return null;
  const find = (start: string, end: string): number | undefined =>
    points.find((p) => near(p.start as string, start, 10) && near(p.end, end, 7))?.val;
  const fiscalYearStart = shiftDays(fiscalYearEnd, -364);
  const fiscalYear = find(fiscalYearStart, fiscalYearEnd);
  if (near(ttmEnd, fiscalYearEnd, 7)) return { value: fiscalYear ?? 0 };
  const yearToDate = find(shiftDays(fiscalYearEnd, 1), ttmEnd) ?? 0;
  const priorYearToDateEnd = shiftDays(ttmEnd, -365);
  const priorYearToDate = find(fiscalYearStart, priorYearToDateEnd);
  if (fiscalYear !== undefined && fiscalYear !== 0 && priorYearToDate === undefined) {
    return { withheld: `fiscal year to ${fiscalYearEnd} ${millions(fiscalYear)} with no filed amount for ${fiscalYearStart} to ${priorYearToDateEnd}, so its share inside the window is unknown` };
  }
  if (priorYearToDate !== undefined && priorYearToDate !== 0 && fiscalYear === undefined) {
    return { withheld: `${fiscalYearStart} to ${priorYearToDateEnd} ${millions(priorYearToDate)} with no filed fiscal-year amount to ${fiscalYearEnd}, so its share inside the window is unknown` };
  }
  return { value: (fiscalYear ?? 0) + yearToDate - (priorYearToDate ?? 0) };
}

const operatingSubtotal = /(?:operating\s+(?:income|profit|loss)(?:\s*\(loss\))?|(?:earnings|income)\s*(?:\/\s*)?(?:\(loss\)\s*)?from\s+operations)/i;
const firstAmount = (text: string): number | null => {
  const m = /^\s*\$?\s*(\(\s*)?(-?[\d,]+(?:\.\d+)?)/.exec(text);
  return m ? Number(m[2].replaceAll(",", "")) * (m[1] ? -1 : 1) : null;
};
const equalAmount = (a: number | null, b: number): boolean => a !== null && Math.abs(a - b) <= Math.max(1, Math.abs(b) * 1e-6);

/**
 * An aggregate disposition tag is a search trigger, never an adjustment. A
 * dated completed sale, its named gain and statement line must be retained.
 * The first-column line and operating subtotal must both tie to same-filing
 * facts. Their order establishes placement; a below-operating gain stays in.
 * Unsupported formats fail closed instead of guessing from proximity.
 */
export function materialOperatingDispositions(facts: CompanyFacts | null | undefined, q: UnusualWindow): OperatingDispositionRead {
  const none: OperatingDispositionRead = { events: [], refusal: null, basis: "" };
  if (!facts || !validDay(q.ttmEnd) || !validDay(q.fiscalYearEnd) || q.fiscalYearEnd > q.ttmEnd ||
    !q.unit || !Number.isFinite(q.operatingIncome) || !validDay(q.observedAt.slice(0, 10))) return none;
  const unit = q.unit, cutoff = q.observedAt.slice(0, 10);
  const threshold = Math.abs(q.operatingIncome!) * OPERATING_DISPOSITION_MATERIALITY_PCT / 100;
  const candidates = DISPOSITION_GAIN_CANDIDATE_TAGS.flatMap(tag => {
    const points = durationPoints(facts, tag, unit, cutoff);
    const total = tagTtm(points, q.ttmEnd, q.fiscalYearEnd!);
    const magnitude = total && "value" in total ? total.value : Math.max(0, ...points.filter(p => p.end > shiftDays(q.ttmEnd, -365) && p.end <= q.ttmEnd).map(p => p.val));
    return magnitude > 0 && magnitude >= threshold ? [{ tag, points, magnitude }] : [];
  });
  if (!candidates.length) return none;
  const events = new Map<string, OperatingDispositionEvent>();
  const accounted = new Map<string, Map<string, number>>();
  for (const section of q.sections ?? []) {
    if (!validDay(section.filingDate) || section.filingDate > cutoff || !CORE_FACT_FORMS.has(section.form) ||
      !section.accession || !section.statementsText || !section.documentUrl.includes(`/data/${facts.cik}/`)) continue;
    const statement = section.statementsText.replace(/\s+/g, " ");
    // Currency is established by the seed; dollars alone is only accepted for USD.
    const scale = unit === "USD" && /\bdollars in millions\b/i.test(statement) ? 1e6
      : new RegExp(`\\b${unit} in millions\\b`, "i").test(statement) ? 1e6 : null;
    if (scale === null) continue;
    const chunks = section.text.replace(/\s+/g, " ").split(/\bNote\s+\d+\s*[-–—]\s*/i);
    for (const chunk of chunks) {
      const dated = /\bOn\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4}),/g.exec(chunk);
      if (!dated) continue;
      const at = Date.parse(dated[1] + " UTC");
      if (!Number.isFinite(at)) continue;
      const date = new Date(at).toISOString().slice(0, 10);
      if (date < (q.periodStart ?? shiftDays(q.ttmEnd, -364)) || date > q.ttmEnd) continue;
      const body = chunk.slice(dated.index, dated.index + 1600);
      if (!/\b(?:closed|completed|sold)\b[\s\S]{0,900}?\b(?:sale|divestiture|business)\b/i.test(body)) continue;
      const gain = /\bgain of\s*\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million)?\s*(?:was\s+)?(?:recorded|recognized|included) in\s+(.+?)\s+in\s+(?:the\s+)?(?:Consolidated\s+)?Statements? of (?:Operations|Income|Earnings)/i.exec(body);
      if (!gain) continue;
      const value = Number(gain[1].replaceAll(",", "")) * (gain[2]?.toLowerCase() === "billion" ? 1e9 : gain[2] ? 1e6 : scale);
      if (!(value > 0 && value >= threshold)) continue;
      const label = gain[3].trim();
      const sourceCandidates = candidates.filter(c => value <= c.magnitude + Math.max(1, c.magnitude * .01) && c.points.some(p =>
        p.accn === section.accession && p.end === section.reportDate));
      const sourceOperating = durationPoints(facts, "OperatingIncomeLoss", unit, cutoff).filter(p => p.accn === section.accession && p.end === section.reportDate);
      for (const sourceCandidate of sourceCandidates) {
        const sourceGain = sourceCandidate.points.filter(p => p.accn === section.accession && p.end === section.reportDate);
        // TOC headings and subsequent cash-flow tables cannot establish placement.
        for (const rawPart of statement.split(/(?:Consolidated\s+)?Statements? of (?:Operations|Income|Earnings)/i).slice(1)) {
          const part = rawPart.split(/\b(?:Consolidated\s+)?(?:Statements? of|Balance Sheets?)\b/i)[0];
          const subtotal = operatingSubtotal.exec(part);
          const lineAt = part.toLowerCase().indexOf(label.toLowerCase());
          if (!subtotal || lineAt < 0) continue;
          const lineValue = firstAmount(part.slice(lineAt + label.length));
          const opValue = firstAmount(part.slice(subtotal.index + subtotal[0].length));
          if (!sourceGain.some(p => equalAmount(lineValue === null ? null : lineValue * scale, p.val) &&
            sourceOperating.some(op => op.start === p.start && equalAmount(opValue === null ? null : opValue * scale, op.val)))) continue;
          const name = chunk.slice(0, dated.index).trim().slice(0, 160) || "business divestiture";
          const key = `${date}|${value}|${name}`;
          const amounts = accounted.get(sourceCandidate.tag) ?? new Map<string, number>();
          amounts.set(key, lineAt > subtotal.index ? sourceCandidate.magnitude : value);
          accounted.set(sourceCandidate.tag, amounts);
          if (lineAt < subtotal.index) events.set(key, { date, name, value, tag: sourceCandidate.tag, accession: section.accession });
        }
      }
    }
  }
  const admitted = [...events.values()];
  const basis = admitted.map(e => `${e.name}: completed ${e.date}, gain ${unit} ${millions(e.value)} inside operating income; ${e.accession}`).join("; ");
  const unresolved = candidates.filter(c => {
    const remainder = c.magnitude - [...(accounted.get(c.tag)?.values() ?? [])].reduce((sum, value) => sum + value, 0);
    return remainder > 0 && remainder >= threshold;
  });
  if (!unresolved.length) return { events: admitted, refusal: null, basis };
  return { events: admitted, basis, refusal: `Material disposition gain candidate (${unresolved.map(c => `us-gaap/${c.tag} ${unit} ${millions(c.magnitude)}`).join("; ")}) exceeds ${OPERATING_DISPOSITION_MATERIALITY_PCT}% of absolute operating income for the window ending ${q.ttmEnd}; retained filing evidence does not establish the completed sale's amount, date and operating placement. DCF withheld.` };
}

export function unusualOperatingItemsTtm(
  facts: CompanyFacts | null | undefined,
  q: UnusualWindow,
): UnusualOperatingItems | null {
  const observedDay = q.observedAt.slice(0, 10);
  if (!facts || !validDay(q.ttmEnd) || !validDay(q.fiscalYearEnd) || q.fiscalYearEnd > q.ttmEnd || !validDay(observedDay)) return null;
  const unit = q.unit;
  if (typeof unit !== "string" || !/^[A-Z]{3}$/.test(unit)) return null;
  const fiscalYearEnd = q.fiscalYearEnd;
  const ttm = (tag: string): TagTtm => tagTtm(durationPoints(facts, tag, unit, observedDay), q.ttmEnd, fiscalYearEnd);
  const components: { tag: string; value: number }[] = [];
  const withheld: { tag: string; reason: string }[] = [];
  const admit = (tag: string, result: TagTtm, sign: 1 | -1): void => {
    if (result === null) return;
    if ("withheld" in result) withheld.push({ tag, reason: result.withheld });
    else if (result.value !== 0) components.push({ tag, value: sign * result.value });
  };
  for (const tag of UNUSUAL_OPERATING_GAIN_TAGS) admit(tag, ttm(tag), 1);
  const dispositions = materialOperatingDispositions(facts, q);
  for (const event of dispositions.events) components.push({ tag: event.tag, value: event.value });
  const total = ttm(UNUSUAL_OPERATING_CHARGE_TOTAL_TAG);
  if (total !== null) admit(UNUSUAL_OPERATING_CHARGE_TOTAL_TAG, total, -1);
  else for (const tag of UNUSUAL_OPERATING_CHARGE_COMPONENT_TAGS) admit(tag, ttm(tag), -1);
  if (components.length === 0 && withheld.length === 0 && !dispositions.refusal) return null;
  const value = components.reduce((sum, c) => sum + c.value, 0);
  const removed = components.map((c) => `us-gaap/${c.tag} ${c.value >= 0 ? "+" : "−"}${millions(Math.abs(c.value))}`).join(", ");
  const kept = withheld.map((w) => `not removed: us-gaap/${w.tag} (${w.reason})`).join("; ");
  return {
    value,
    components,
    withheld,
    ...(dispositions.refusal ? { dcfRefusal: dispositions.refusal } : {}),
    basis: `tagged one-off items inside operating income over the TTM ending ${q.ttmEnd} (fiscal year ending ${fiscalYearEnd} plus year to date less prior year to date; ${unit}): ` +
      [removed || "none removed", kept, dispositions.basis].filter(Boolean).join("; "),
  };
}

/** The same admission rule at each filed fiscal-year end. */
export function unusualOperatingItemsByFiscalYear(facts: CompanyFacts | null | undefined,
  q: { fiscalYearEnds: readonly string[]; unit: string | null; observedAt: string }): Map<string, UnusualOperatingItems> {
  const result = new Map<string, UnusualOperatingItems>();
  for (const date of q.fiscalYearEnds) {
    const value = unusualOperatingItemsTtm(facts, { ...q, ttmEnd: date, fiscalYearEnd: date });
    if (value !== null) result.set(date, { ...value, basis: `tagged one-off items inside operating income for the fiscal year ending ${date}: ${value.components.map(c => `us-gaap/${c.tag} ${c.value}`).join(", ")}` });
  }
  return result;
}

/** Repeated tag families are operating costs in the five-year history. */
export function withoutRecurringFamilies(byYear: ReadonlyMap<string, UnusualOperatingItems>, lastFiveFiscalYearEnds: readonly string[]) {
  const window = [...new Set(lastFiveFiscalYearEnds)].sort().reverse().slice(0, 5);
  const tags = [...new Set(window.flatMap(date => byYear.get(date)?.components.map(c => c.tag) ?? []))];
  const recurring = tags.flatMap(tag => {
    const years = window.filter(date => byYear.get(date)?.components.some(c => c.tag === tag));
    return years.length >= 3 ? [{ tag, years }] : [];
  });
  const excluded = new Set(recurring.map(r => r.tag));
  const result = new Map<string, UnusualOperatingItems>();
  for (const [date, value] of byYear) {
    const components = value.components.filter(c => !excluded.has(c.tag));
    if (components.length > 0 || value.withheld.length > 0) result.set(date, { ...value, components, value: components.reduce((sum, c) => sum + c.value, 0) });
  }
  return { byYear: result, recurring };
}
export function recurringOperatingItemsBasis(recurring: { tag: string; years: string[] }[]): string {
  return recurring.map(r => `${r.tag} in ${r.years.length} of the last 5 fiscal years (${r.years.join(", ")}); not added back`).join("; ");
}
