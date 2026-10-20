import { CORE_FACT_FORMS, parseFactPoints, type CompanyFacts, type FactPoint } from "@/edgar/xbrl";

/**
 * Audit item 15 (FCX-9) with AMZN audit 2026-10-20 finding 5: tagged items
 * inside operating income that do not recur, removed from the operating
 * income that seeds the DCF margin in both directions. Gains are reported
 * positive by their tags; charges are reported positive and lower operating
 * income. `AssetImpairmentCharges` is the total when filed; the three
 * component tags stand in only when it is not, so nothing is counted twice.
 */
export const UNUSUAL_OPERATING_GAIN_TAGS = ["InsuredEventGainLoss"] as const;
export const UNUSUAL_OPERATING_CHARGE_TOTAL_TAG = "AssetImpairmentCharges";
export const UNUSUAL_OPERATING_CHARGE_COMPONENT_TAGS = [
  "GoodwillImpairmentLoss",
  "ImpairmentOfLongLivedAssetsHeldForUse",
  "ImpairmentOfIntangibleAssetsExcludingGoodwill",
] as const;

export interface UnusualOperatingItems {
  /** Net amount the items added to operating income: gains positive, charges negative. */
  value: number;
  components: { tag: string; value: number }[];
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

/**
 * One tag over the trailing twelve months: the fiscal-year fact plus the
 * year to date less the prior year to date. A period the filings do not tag
 * is zero: a one-off is tagged in the filing for the period it fell in, so an
 * untagged period had none. Null when no fact ends inside the window.
 */
function tagTtm(points: FactPoint[], ttmEnd: string, fiscalYearEnd: string): number | null {
  const windowStart = shiftDays(ttmEnd, -365);
  if (!points.some((p) => p.end > windowStart && p.end <= ttmEnd)) return null;
  const find = (start: string, end: string): number =>
    points.find((p) => near(p.start as string, start, 10) && near(p.end, end, 7))?.val ?? 0;
  const fiscalYear = find(shiftDays(fiscalYearEnd, -364), fiscalYearEnd);
  if (near(ttmEnd, fiscalYearEnd, 7)) return fiscalYear;
  const yearToDate = find(shiftDays(fiscalYearEnd, 1), ttmEnd);
  const priorYearToDate = find(shiftDays(fiscalYearEnd, -364), shiftDays(ttmEnd, -365));
  return fiscalYear + yearToDate - priorYearToDate;
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
  const ttm = (tag: string): number | null => tagTtm(durationPoints(facts, tag, unit, observedDay), q.ttmEnd, fiscalYearEnd);
  const components: { tag: string; value: number }[] = [];
  for (const tag of UNUSUAL_OPERATING_GAIN_TAGS) {
    const value = ttm(tag);
    if (value !== null && value !== 0) components.push({ tag, value });
  }
  const total = ttm(UNUSUAL_OPERATING_CHARGE_TOTAL_TAG);
  const charges = total !== null
    ? [{ tag: UNUSUAL_OPERATING_CHARGE_TOTAL_TAG, value: total }]
    : UNUSUAL_OPERATING_CHARGE_COMPONENT_TAGS.flatMap((tag) => {
        const value = ttm(tag);
        return value === null ? [] : [{ tag, value }];
      });
  for (const charge of charges) if (charge.value !== 0) components.push({ tag: charge.tag, value: -charge.value });
  if (components.length === 0) return null;
  const value = components.reduce((sum, c) => sum + c.value, 0);
  return {
    value,
    components,
    basis: `tagged one-off items inside operating income over the TTM ending ${q.ttmEnd} (fiscal year ending ${fiscalYearEnd} plus year to date less prior year to date; ${unit}): ` +
      components.map((c) => `us-gaap/${c.tag} ${c.value >= 0 ? "+" : "−"}${millions(Math.abs(c.value))}`).join(", "),
  };
}
