/** Statement date, duration and rounding primitives; match the exact source period (P1; D-56, D-59). */
import { PERIOD_END_TOLERANCE_DAYS, FISCAL_YEAR_DURATION_DAYS, QUARTER_DURATION_DAYS, CORE_FACT_FORMS, CORE_INTERIM_FORMS, type FactPoint } from "@/edgar/xbrl";


// ---------------------------------------------------------------------------
// Period tolerances & form partitions
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
/** 52/53-week fiscal calendars move period ends by a few days between filings. */
const TOLERANCE_DAYS = PERIOD_END_TOLERANCE_DAYS;
const ANNUAL_MIN_DAYS = FISCAL_YEAR_DURATION_DAYS[0];
const ANNUAL_MAX_DAYS = FISCAL_YEAR_DURATION_DAYS[1];
/**
 * A quarter is 13 weeks give or take a 53rd week — except on a 12-12-12-16
 * calendar, where the fourth quarter runs 16 or 17 weeks (Costco). The upper
 * bound admits that quarter; nothing standardized is four months long, so it
 * admits nothing else. Shared with xbrl.ts.
 */
const QUARTER_MIN_DAYS = QUARTER_DURATION_DAYS[0];
const QUARTER_MAX_DAYS = QUARTER_DURATION_DAYS[1];

/** Derived from CORE_FACT_FORMS so a change there cannot silently desync. */
const FOREIGN_ANNUAL_FORM_PREFIXES = ["20-F", "40-F"] as const;
const isForeignAnnualForm = (form: string): boolean => FOREIGN_ANNUAL_FORM_PREFIXES.some((p) => form.startsWith(p));
const ANNUAL_FORMS = new Set([...CORE_FACT_FORMS].filter((f) => f.startsWith("10-K") || isForeignAnnualForm(f)));
const QUARTERLY_FORMS = CORE_INTERIM_FORMS;

/** Pure memo of day parsing: the result depends on `d` alone. Bounded so a long-lived process cannot grow it without limit. */
const DATE_MS_MEMO = new Map<string, number>();
const DATE_MS_MEMO_LIMIT = 200_000;

function dateMs(d: string): number {
  let ms = DATE_MS_MEMO.get(d);
  if (ms === undefined) {
    ms = Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
    if (DATE_MS_MEMO.size >= DATE_MS_MEMO_LIMIT) DATE_MS_MEMO.clear();
    DATE_MS_MEMO.set(d, ms);
  }
  return ms;
}

function withinDays(a: string, b: string, days: number): boolean {
  const am = dateMs(a);
  const bm = dateMs(b);
  if (Number.isNaN(am) || Number.isNaN(bm)) return false;
  return Math.abs(am - bm) <= days * DAY_MS;
}

/** Signed day count from `a` to `b`. */
function daysBetween(a: string, b: string): number {
  return (dateMs(b) - dateMs(a)) / DAY_MS;
}

/** Length of a fact's own period in days; null for instants (no `start`). */
function durationDays(p: FactPoint): number | null {
  return p.start !== undefined ? daysBetween(p.start, p.end) : null;
}

/** The coarsest power of ten, up to a million, that divides every value: the rounding unit the filer displayed them in. */
function displayRoundingUnit(values: readonly number[]): number {
  let unit = 1_000_000;
  while (unit > 1 && values.some(v => Math.abs(v) % unit !== 0)) unit /= 10;
  return unit;
}

/**
 * Strip binary-float noise from a derived value and normalise `-0` to `0`.
 * EPS differences are the motivating case (7.5 - 5.9 = 1.5999999999999996).
 */
function tidy(x: number, decimals: number): number {
  if (!Number.isFinite(x)) return x;
  const r = Number(x.toFixed(decimals));
  return r === 0 ? 0 : r;
}

const MONEY_DECIMALS = 4;
const PER_SHARE_DECIMALS = 6;
export { tidy, PER_SHARE_DECIMALS, dateMs, ANNUAL_FORMS, durationDays, ANNUAL_MIN_DAYS, ANNUAL_MAX_DAYS, withinDays, TOLERANCE_DAYS, MONEY_DECIMALS, QUARTERLY_FORMS, daysBetween, DAY_MS, QUARTER_MIN_DAYS, QUARTER_MAX_DAYS, displayRoundingUnit, isForeignAnnualForm };
