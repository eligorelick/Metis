import { fiscalYearRule, periodDays, snapToFiscalYearEnd } from "./stageB/fiscalCalendar";

/** Annual consensus shares the filed calendar. Nearby aliases of completed
 * annual periods are historical, even when the provider end is a few days later.
 * Calendar inference requires the existing three-year unambiguous rule. */
export function forwardAnnualEstimates<T extends { date?: unknown }>(rows: readonly T[], actualAnnualEnds: readonly string[]): Array<T & { date: string }> {
  const ends = [...new Set(actualAnnualEnds.filter(day => periodDays(day, day) === 1))].sort().reverse();
  const calendar = fiscalYearRule(ends);
  const latest = ends[0] ?? null;
  return rows.flatMap(row => {
    const day = typeof row.date === "string" ? row.date.slice(0, 10) : "";
    if (periodDays(day, day) !== 1) return [];
    const aliases = ends.filter(end => Math.abs(Date.parse(end) - Date.parse(day)) <= 7 * 86_400_000);
    const date = aliases.length === 1 ? aliases[0] : snapToFiscalYearEnd(calendar, day);
    return latest !== null && date <= latest ? [] : [{ ...row, date }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}
