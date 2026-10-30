import { periodDays, weeksOf } from "@/pipeline/stageB/fiscalCalendar";
import { specVersionBefore } from "@/report/legacyPayloadRecordSafety";
import type { Report } from "@/report/schema";

export const LEGACY_VALUATION_NOTE_FIELD = "presentation.legacyValuation";
/** Frozen at this convention's introduction, independent of later report stamps. */
export const ANNUALIZATION_CONVENTION_SPEC = "1.51.0";

type FiledPeriod = { start: string; end: string; basis: "fiscal-quarter" | "fiscal-year"; days: number; revenue: number | null };
function filedPeriods(value: unknown): FiledPeriod[] {
  if (value === null || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const result: FiledPeriod[] = [];
  const context = record.periodContext as Record<string, unknown> | undefined;
  if (context?.kind === "duration" && (context.basis === "fiscal-quarter" || context.basis === "fiscal-year") &&
      typeof context.start === "string" && typeof context.end === "string") {
    const days = periodDays(context.start, context.end);
    const source = record.sourceId ?? record.provenanceId ?? record.source;
    const revenue = typeof source === "string" && /^payload\.statements\.income-statement-quarterly\.\d{4}-\d{2}-\d{2}\.revenue$/.test(source) &&
      typeof record.value === "number" && Number.isFinite(record.value) && record.value > 0 ? record.value : null;
    if (days !== null) result.push({ start: context.start, end: context.end, basis: context.basis, days, revenue });
  }
  for (const [key, child] of Object.entries(record)) if (key !== "periodContext") result.push(...filedPeriods(child));
  return result;
}
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const AMOUNT = "([\\d,]+(?:\\.\\d+)?[TMBK]?)";

function quarterLength(basis: string, periods: FiledPeriod[]): string | null {
  const match = new RegExp(`latest quarter ending (\\d{4}-\\d{2}-\\d{2}) × 4 = ${AMOUNT}`).exec(basis);
  if (!match) return null;
  const period = periods.find(p => p.basis === "fiscal-quarter" && p.end === match[1]);
  const weeks = weeksOf(period?.days ?? null);
  if (weeks === null || weeks === 13) return null;
  const amount = match[2];
  const value = Number(amount.replace(/,/g, "").replace(/[TMBK]$/, ""));
  const suffix = /[TMBK]$/.exec(amount)?.[0] ?? "";
  const scale = ({ T: 1e12, B: 1e9, M: 1e6, K: 1e3 } as Record<string, number>)[suffix] ?? 1;
  const raw = periods.find(p => p.basis === "fiscal-quarter" && p.end === match[1] && p.revenue !== null)?.revenue;
  // Avoid double-rounding when a matching filed quarter is stored: MU 54.229B
  // × 4 is printed as 216.92B, but its normalized level rounds to 201.42B.
  const filedValue = raw == null ? null : raw * 4 / scale;
  const precise = filedValue !== null && filedValue.toFixed(2) === value.toFixed(2);
  const normalized = (precise ? filedValue : value) * 13 / weeks;
  return `Built before spec ${ANNUALIZATION_CONVENTION_SPEC}: the run-rate annualised the ${weeks}-week quarter ending ${match[1]} × 4 (${amount}). From ${ANNUALIZATION_CONVENTION_SPEC} a ${weeks}-week quarter is put on a 13-week basis (× 13/${weeks}): ${normalized.toFixed(2)}${suffix}${precise ? ", calculated from the stored filed quarter before rounding" : " (approximate, calculated from the rounded stored run-rate)"}. Stored figures are unchanged.`;
}
function guidedTimesFour(basis: string): string | null {
  if (!/model extrapolation of quarterly guidance:|sits below the guided run-rate and is not used for year one/.test(basis)) return null;
  return `Built before spec ${ANNUALIZATION_CONVENTION_SPEC}: year one annualised the guided quarter × 4, which carries that quarter's season; from ${ANNUALIZATION_CONVENTION_SPEC} the guided quarter is first taken out of its own season (divided by its growth-adjusted share of its trailing year) before × 4, with the trailing twelve months at the guided year-over-year pace only below eight quarters, and consensus is tested against a twelve-month floor. Stored figures and prose are unchanged.`;
}
function fiscalYearEnd(basis: string, periods: FiledPeriod[]): string | null {
  const filed = periods.find(p => [91, 98, 364, 371].includes(p.days) &&
    new Date(Date.parse(`${p.end}T00:00:00Z`) + 86400000).getUTCDate() !== 1);
  // A month-end context alone does not distinguish a calendar from a weekly filer.
  if (!filed) return null;
  for (const match of basis.matchAll(/the fiscal year ending (\d{4}-\d{2}-\d{2}) contributes/g)) {
    if (periodDays(match[1], match[1]) === null || weekday(match[1]) === weekday(filed.end)) continue;
    return `Built before spec ${ANNUALIZATION_CONVENTION_SPEC}: the consensus window used the provider's fiscal-year date ${match[1]} (a ${WEEKDAYS[weekday(match[1])]}); this issuer's fiscal periods end on ${WEEKDAYS[weekday(filed.end)]}s, so its year end is a different day up to six days away, and year one and year two may each carry a few days' revenue of the other year. Stored figures are unchanged.`;
  }
  return null;
}
function guidedFloorTimesFour(basis: string): string | null {
  const match = new RegExp(`at or above the guided run-rate \\(management guidance.*?× 4 = ${AMOUNT}(?:; low end × 4 = ${AMOUNT})?`).exec(basis);
  if (!match) return null;
  return `Built before spec ${ANNUALIZATION_CONVENTION_SPEC}: consensus was tested against the guided quarter × 4 (${match[1]}${match[2] ? `; low end ${match[2]}` : ""}), which carries that quarter's season and timing. From ${ANNUALIZATION_CONVENTION_SPEC} it is tested against the twelve-month floor the guidance implies, and the reverse-DCF context gives the guided quarter's year-over-year growth. Stored figures and prose are unchanged.`;
}

/** Each row owns its cutoff, allowing later batches to add independently dated rules. */
const ROWS = [
  { key: "quarterLength", since: ANNUALIZATION_CONVENTION_SPEC, note: quarterLength },
  { key: "guidedTimesFour", since: ANNUALIZATION_CONVENTION_SPEC, note: guidedTimesFour },
  { key: "fiscalYearEnd", since: ANNUALIZATION_CONVENTION_SPEC, note: fiscalYearEnd },
  { key: "guidedFloorTimesFour", since: ANNUALIZATION_CONVENTION_SPEC, note: guidedFloorTimesFour },
];
/** Immutable display-only view. Stored figures, claims and verification entries stay intact. */
export function withLegacyValuationNotes(report: Report): Report {
  const basis = report.valuation.dcf.assumptions.find(row => row.name === "year-one revenue anchor")?.basis ?? "";
  const periods = filedPeriods(report);
  const added = ROWS.flatMap(row => {
    const field = `${LEGACY_VALUATION_NOTE_FIELD}.${row.key}`;
    if (!specVersionBefore(report.meta.specVersion ?? "", row.since) || report.appendix.missingData.some(entry => entry.field === field)) return [];
    const reason = row.note(basis, periods);
    return reason === null ? [] : [{ field, reason, severity: "info" as const, expected: true }];
  });
  return added.length === 0 ? report : { ...report, appendix: { ...report.appendix, missingData: [...report.appendix.missingData, ...added] } };
}
