/** Exact, bounded source schedules. No dates outside the consecutive quarter rows qualify. */
export interface QuarterResultsSchedule { start: number; end: number; text: string; dates: string[] }
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const UNCERTAIN = /\b(?:not|unconfirmed|unverified|tentative|estimated|estimates|might|could|rumou?rs?|speculat\w*)\b|\bsubject to change\b/i;
const ROW = new RegExp(`^[\\s•*\\-]*(first|second|third|fourth) quarter(?: and (?:fiscal )?year)?\\s*:\\s*(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\\s+)?(\\d{4}-\\d{2}-\\d{2}|(?:${MONTHS})\\s+\\d{1,2},?\\s+\\d{4})`, "i");

export function confirmedQuarterResultsSchedules(text: string): QuarterResultsSchedule[] {
  const schedules: QuarterResultsSchedule[] = [];
  const introductions = text.matchAll(/\b(?:the company|company|we)\s+(?:plans? to|will)\s+(?:release|report|announce)\s+(?:financial |quarterly )?results\b[\s\S]{0,300}?\bfollowing dates[.:]/gi);
  for (const intro of introductions) {
    const start = intro.index!;
    // Keep enclosing negation: matching the affirmative substring of "it is
    // not true that the company will ..." cannot establish a schedule.
    const prefix = text.slice(Math.max(0, start - 180), start).split(/[.!?]\s+|\n/).at(-1)!;
    if (UNCERTAIN.test(prefix + intro[0])) continue;
    let cursor = start + intro[0].length;
    const boilerplate = /^\s*Details on how to access the conference calls will be available at a later date\.\s*/i.exec(text.slice(cursor));
    if (boilerplate) cursor += boilerplate[0].length;
    const dates: string[] = [], quarters = new Set<string>();
    let ambiguous = false;
    for (let i = 0; i < 4; i++) {
      const row = ROW.exec(text.slice(cursor, start + 1_300));
      if (!row) break;
      cursor += row[0].length;
      const quarter = row[1]!.toLowerCase();
      if (quarters.has(quarter)) { ambiguous = true; break; }
      quarters.add(quarter);
      dates.push(row[2]!);
    }
    if (!dates.length || ambiguous || ROW.test(text.slice(cursor))) continue;
    // Adjacent status language qualifies the list as a whole. Stop at an
    // unrelated section heading; retain at most one bounded trailing sentence.
    const tail = text.slice(cursor, cursor + 220).split(/\b(?:About|Forward[- ]Looking|Contact|Conference Call Details)\b/i)[0]!;
    const status = /^[\s.]*(?:\([^)]*\)|[^.!?]*(?:[.!?]|$))/.exec(tail)?.[0] ?? "";
    if (UNCERTAIN.test(status)) continue;
    const end = cursor + status.length;
    schedules.push({ start, end, text: text.slice(start, end), dates });
  }
  return schedules;
}
