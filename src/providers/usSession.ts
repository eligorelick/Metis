/**
 * US equity regular-session clock for quote caching: weekdays 09:30 to 16:00
 * America/New_York. Exchange holidays and early closes are not modelled, so on
 * those days quoteTtlMs keeps the normal TTL (a refresh that returns the same
 * price), never a longer one. The app quotes US listings (EDGAR filers and
 * their US-traded ADRs), so one clock serves every symbol.
 */

const NEW_YORK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** New York wall-clock time of an instant, expressed as if it were UTC. */
function newYorkWallMs(ms: number): number {
  const parts = NEW_YORK.formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}

/** The instant of a New York wall-clock time; 16:00 never falls inside a DST shift. */
function newYorkInstant(wallMs: number): number {
  const first = wallMs - (newYorkWallMs(wallMs) - wallMs);
  return wallMs - (newYorkWallMs(first) - first);
}

const OPEN_MINUTES = 9 * 60 + 30;
const CLOSE_MINUTES = 16 * 60;
const DAY_MS = 86_400_000;

/** Is a regular session in progress (holidays aside)? */
export function isUsSessionOpen(now: Date): boolean {
  const wall = new Date(newYorkWallMs(now.getTime()));
  const weekday = wall.getUTCDay();
  const minutes = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  return weekday !== 0 && weekday !== 6 && minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES;
}

/** The most recent weekday 16:00 New York close at or before `now`, in epoch ms. */
export function lastUsSessionClose(now: Date): number {
  const wall = newYorkWallMs(now.getTime());
  const today = wall - (wall % DAY_MS);
  for (let back = 0; ; back += 1) {
    const day = today - back * DAY_MS;
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const close = newYorkInstant(day + CLOSE_MINUTES * 60_000);
    if (close <= now.getTime()) return close;
  }
}

/**
 * Time after the close before a fetched quote counts as the session's final
 * price: the closing auction prints a few minutes late and some plans delay
 * quotes by 15 minutes.
 */
export const CLOSE_SETTLE_MS = 30 * 60_000;

/**
 * Cache TTL for a quote-driven value. Between sessions no newer price exists,
 * so a quote fetched after the last close (plus settle time) stays fresh until
 * the next open. A flat 15-minute TTL flagged NVDA report #48's 20:00 UTC
 * closing quote "served past cache TTL" when it was reused 22 minutes later,
 * the same evening (2026-10-26).
 */
export function quoteTtlMs(baseTtlMs: number, now: Date): number {
  if (isUsSessionOpen(now)) return baseTtlMs;
  return Math.max(baseTtlMs, now.getTime() - (lastUsSessionClose(now) + CLOSE_SETTLE_MS));
}
