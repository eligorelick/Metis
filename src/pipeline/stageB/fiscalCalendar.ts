/** FIN-301: compare annualised flows on a 13-week quarter / 52-week year basis. */
const DAY_MS = 86_400_000;

function dayTime(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return null;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.toISOString().slice(0, 10) === value ? date.getTime() : null;
}

/** Inclusive length of two strict ISO days; invalid or reversed dates are unknown. */
export function periodDays(start: string | null | undefined, end: string): number | null {
  const from = dayTime(start);
  const to = dayTime(end);
  return from === null || to === null || from > to ? null : (to - from) / DAY_MS + 1;
}

/** Calendar quarters read 13 weeks; every other week count must be exact. */
export function weeksOf(days: number | null): number | null {
  if (days === null || !Number.isInteger(days) || days <= 0) return null;
  if (Math.abs(days - 91) <= 1) return 13;
  return days % 7 === 0 ? days / 7 : null;
}

export function thirteenWeekFactor(days: number | null): number {
  const weeks = weeksOf(days);
  return weeks === null ? 1 : 13 / weeks;
}

export function fiftyTwoWeekFactor(days: number | null): number {
  return weeksOf(days) === 53 ? 52 / 53 : 1;
}

export interface FiscalYearRule {
  kind: "last-weekday" | "nearest-weekday";
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  month: number;
}

/** The chosen weekday at, or nearest to, the named month's last day. */
export function fiscalYearEndFor(rule: FiscalYearRule, year: number): string {
  const last = new Date(0);
  last.setUTCFullYear(year, rule.month, 0);
  const back = (last.getUTCDay() - rule.weekday + 7) % 7;
  const offset = rule.kind === "last-weekday" || back <= 3 ? -back : 7 - back;
  return new Date(last.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
}

/** Only one unambiguous rule fitting at least three newest chained ends is evidence. */
export function fiscalYearRule(annualEnds: readonly string[]): FiscalYearRule | null {
  if (annualEnds.some(end => dayTime(end) === null)) return null;
  const ends = [...new Set(annualEnds)].sort().reverse();
  const chain = ends.slice(0, 1);
  for (let i = 1; i < ends.length; i++) {
    const days = (dayTime(ends[i - 1])! - dayTime(ends[i])!) / DAY_MS;
    if (days !== 364 && days !== 371) break;
    chain.push(ends[i]);
  }
  if (chain.length < 3) return null;
  const weekday = new Date(chain[0]).getUTCDay() as FiscalYearRule["weekday"];
  const candidates: FiscalYearRule[] = [];
  for (const kind of ["last-weekday", "nearest-weekday"] as const) {
    for (let month = 1; month <= 12; month++) {
      const rule = { kind, month, weekday };
      if (chain.every(end => {
        const year = Number(end.slice(0, 4));
        return fiscalYearEndFor(rule, year) === end || fiscalYearEndFor(rule, year - 1) === end;
      })) candidates.push(rule);
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}

/** Keep provider dates unless a nearby filed-calendar year end is established. */
export function snapToFiscalYearEnd(rule: FiscalYearRule | null, date: string, toleranceDays = 10): string {
  const time = dayTime(date);
  if (rule === null || time === null || !Number.isFinite(toleranceDays) || toleranceDays < 0) return date;
  const year = Number(date.slice(0, 4));
  const candidates = [year - 1, year, year + 1].map(y => fiscalYearEndFor(rule, y));
  const near = candidates.filter(end => Math.abs(dayTime(end)! - time) / DAY_MS <= toleranceDays);
  return near.length === 1 ? near[0] : date;
}
