import { z } from "zod";

/** Calendar-valid ISO day, preserving the source's inclusive date boundaries. */
const PeriodDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((day) => {
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}, "Invalid calendar date");

const annotations = {
  /** A source-established basis; never deduced from an end date or day count. */
  basis: z.enum(["fiscal-year", "fiscal-quarter", "fiscal-half-year", "year-to-date", "rolling-12-month"]).optional(),
  fiscalLabel: z.string().trim().min(1).optional(),
};

/**
 * Exact source period, separate from observation, filing and acquisition dates.
 * XBRL date-only durations include both boundary days; an equal start/end is a
 * valid one-day duration. No calendar-quarter approximation is applied.
 * https://www.xbrl.org/dates-in-xbrl/
 */
export const PeriodContextSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("instant"), at: PeriodDaySchema, ...annotations }).strict(),
  z.object({ kind: z.literal("duration"), start: PeriodDaySchema, end: PeriodDaySchema, ...annotations })
    .strict().refine((period) => period.start <= period.end, "Period start must not follow end"),
]);

export type PeriodContext = z.infer<typeof PeriodContextSchema>;

/**
 * null means insufficient structured evidence: callers retain legacy behavior.
 * Invalid supplied metadata fails even when the other side has no context.
 * Optional annotations can add evidence but cannot contradict a supplied peer.
 */
export function comparePeriodContexts(a?: PeriodContext, b?: PeriodContext): boolean | null {
  const left = a === undefined ? undefined : PeriodContextSchema.safeParse(a);
  const right = b === undefined ? undefined : PeriodContextSchema.safeParse(b);
  if (left?.success === false || right?.success === false) return false;
  if (!left || !right) return null;
  const first = left.data;
  const second = right.data;
  if (first.kind !== second.kind) return false;
  if (first.kind === "instant" && second.kind === "instant" && first.at !== second.at) return false;
  if (first.kind === "duration" && second.kind === "duration" &&
    (first.start !== second.start || first.end !== second.end)) return false;
  if (first.basis !== undefined && second.basis !== undefined && first.basis !== second.basis) return false;
  if (first.fiscalLabel !== undefined && second.fiscalLabel !== undefined &&
    first.fiscalLabel.toLowerCase().replace(/\s+/g, " ") !== second.fiscalLabel.toLowerCase().replace(/\s+/g, " ")) return false;
  return true;
}
