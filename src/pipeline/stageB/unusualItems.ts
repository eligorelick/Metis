import { CORE_FACT_FORMS, parseFactPoints, type CompanyFacts, type FactPoint } from "@/edgar/xbrl";

/**
 * Audit item 15 (FCX-9) with AMZN audit 2026-10-20 finding 5: tagged items
 * inside operating income that do not recur, removed from the operating
 * income that seeds the DCF margin in both directions. Gains are reported
 * positive by their tags; charges are reported positive and lower operating
 * income. `AssetImpairmentCharges` is the total when filed; the three
 * component tags stand in only when it is not, so nothing is counted twice.
 */
import { UNUSUAL_OPERATING_GAIN_TAGS, UNUSUAL_OPERATING_CHARGE_TOTAL_TAG, UNUSUAL_OPERATING_CHARGE_COMPONENT_TAGS } from "@/edgar/tagSynonyms";
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
}

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

export function unusualOperatingItemsTtm(
  facts: CompanyFacts | null | undefined,
  q: { ttmEnd: string; fiscalYearEnd: string | null; unit: string | null; observedAt: string },
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
  const total = ttm(UNUSUAL_OPERATING_CHARGE_TOTAL_TAG);
  if (total !== null) admit(UNUSUAL_OPERATING_CHARGE_TOTAL_TAG, total, -1);
  else for (const tag of UNUSUAL_OPERATING_CHARGE_COMPONENT_TAGS) admit(tag, ttm(tag), -1);
  if (components.length === 0 && withheld.length === 0) return null;
  const value = components.reduce((sum, c) => sum + c.value, 0);
  const removed = components.map((c) => `us-gaap/${c.tag} ${c.value >= 0 ? "+" : "−"}${millions(Math.abs(c.value))}`).join(", ");
  const kept = withheld.map((w) => `not removed: us-gaap/${w.tag} (${w.reason})`).join("; ");
  return {
    value,
    components,
    withheld,
    basis: `tagged one-off items inside operating income over the TTM ending ${q.ttmEnd} (fiscal year ending ${fiscalYearEnd} plus year to date less prior year to date; ${unit}): ` +
      [removed || "none removed", kept].filter(Boolean).join("; "),
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
