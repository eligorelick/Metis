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
