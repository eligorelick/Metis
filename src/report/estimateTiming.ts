import { z } from "zod";
import type { Report } from "@/report/schema";

/** Date-role validation is independent of admission and never changes an estimate amount. */
export function estimateDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? value : null;
}

function acquisitionStamp(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return null;
  return estimateDay(value.slice(0, 10)) && Number.isFinite(Date.parse(value)) ? value : null;
}

const Stamp = z.string().refine(value => acquisitionStamp(value) !== null).nullable();
/** Only the estimate producer establishes a selection branch. Publication has no supported contract. */
export const EstimateTimingSchema = z.object({
  version: z.literal("1"),
  asOfRole: z.enum(["forecast-period-end", "fallback-day", "unclassified"]),
  acquisitionOrigin: z.enum(["response", "cache", "fixture-load", "legacy-recorded", "unknown"]),
  acquiredAt: Stamp,
  fixtureLoadedAt: Stamp,
  recordedAt: Stamp,
  publishedAt: z.null(),
}).strict().refine(t =>
  (t.acquisitionOrigin === "cache" || t.acquisitionOrigin === "response")
    ? t.acquiredAt !== null && t.fixtureLoadedAt === null && t.recordedAt === null
    : t.acquiredAt === null && (t.acquisitionOrigin === "fixture-load"
      ? t.fixtureLoadedAt !== null && t.recordedAt === null
      : t.fixtureLoadedAt === null && (t.acquisitionOrigin === "legacy-recorded" ? t.recordedAt !== null : t.recordedAt === null)),
);
export type EstimateTiming = z.infer<typeof EstimateTimingSchema>;

/** Model evidence retains source-day precision; exact instants belong to report/audit metadata. */
export interface EstimateModelTiming {
  version: "1";
  precision: "day-UTC";
  asOfRole: EstimateTiming["asOfRole"];
  acquisitionOrigin: EstimateTiming["acquisitionOrigin"];
  acquiredOn: string | null;
  fixtureLoadedOn: string | null;
  recordedOn: string | null;
  publishedOn: null;
}

export function estimateModelTiming(value: unknown): EstimateModelTiming {
  const timing = readEstimateTiming(value);
  const utcDay = (stamp: string | null): string | null => stamp === null ? null : new Date(stamp).toISOString().slice(0, 10);
  return { version: "1", precision: "day-UTC", asOfRole: timing.asOfRole, acquisitionOrigin: timing.acquisitionOrigin,
    acquiredOn: utcDay(timing.acquiredAt), fixtureLoadedOn: utcDay(timing.fixtureLoadedAt), recordedOn: utcDay(timing.recordedAt), publishedOn: null };
}

const unknownTiming = (): EstimateTiming => ({ version: "1", asOfRole: "unclassified", acquisitionOrigin: "unknown", acquiredAt: null, fixtureLoadedAt: null, recordedAt: null, publishedAt: null });

/** Same retained response, before generic missing-time fallback. No passthrough publication inference. */
export function buildEstimateTiming(rows: readonly Record<string, unknown>[], fallback: string,
  times: { cacheFetchedAt?: unknown; responseFetchedAt?: unknown; fixtureLoadedAt?: unknown }): EstimateTiming {
  const timing = unknownTiming();
  const fixture = acquisitionStamp(times.fixtureLoadedAt);
  const cache = acquisitionStamp(times.cacheFetchedAt);
  const response = acquisitionStamp(times.responseFetchedAt);
  if (fixture !== null) {
    timing.acquisitionOrigin = "fixture-load";
    timing.fixtureLoadedAt = fixture;
  } else if (cache !== null || response !== null) {
    timing.acquisitionOrigin = cache !== null ? "cache" : "response";
    timing.acquiredAt = cache ?? response;
  }
  // Mirror only the first generic selection branch, not deriveAsOf's output.
  // Eligible row.date is a forecast period even when equal to the acquisition day.
  const dates = rows.map(row => row.date).filter((v): v is string => typeof v === "string")
    .map(v => v.slice(0, 10)).filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v));
  if (dates.length > 0 && acquisitionStamp(fallback) !== null) {
    const selected = dates.filter(v => v <= fallback.slice(0, 10)).sort().at(-1);
    timing.asOfRole = selected === undefined ? "fallback-day" : estimateDay(selected) !== null ? "forecast-period-end" : "unclassified";
  }
  return timing;
}

/** Untyped envelopes retain recorded metadata, never proof of original acquisition or date role. */
export function readEstimateTiming(value: unknown, envelope?: { endpoint?: string; fetchedAt?: unknown }): EstimateTiming {
  const parsed = EstimateTimingSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const timing = unknownTiming();
  const stamp = acquisitionStamp(envelope?.fetchedAt);
  if (stamp !== null) {
    if (envelope?.endpoint?.startsWith("[FIXTURE] ")) {
      timing.acquisitionOrigin = "fixture-load";
      timing.fixtureLoadedAt = stamp;
    } else {
      timing.acquisitionOrigin = "legacy-recorded";
      timing.recordedAt = stamp;
    }
  }
  return timing;
}

/** Legacy recovery requires a unique exact annual estimate endpoint for this report's issuer. */
export function reportEstimateTiming(report: Report): EstimateTiming {
  const existing = report.marketData?.estimateTiming;
  if (existing !== undefined) return readEstimateTiming(existing);
  const matches = (report.appendix?.sources ?? []).filter(source => {
    if (source.provider !== "fmp") return false;
    const endpoint = source.endpoint.replace(/^\[FIXTURE\] /, "");
    const [pathname, query] = endpoint.split("?");
    if (pathname !== "/stable/analyst-estimates") return false;
    const params = new URLSearchParams(query);
    return params.getAll("symbol").length === 1 && params.get("symbol") === report.meta?.symbol &&
      params.getAll("period").length === 1 && params.get("period") === "annual";
  });
  return readEstimateTiming(undefined, matches.length === 1 ? matches[0] : undefined);
}

/** Fixed prose and validated dates only; raw provider fields stay in the envelope/rows. */
export function estimateTimingText(value: unknown, recordedAsOf: unknown): string {
  const timing = readEstimateTiming(value);
  const date = estimateDateText(timing.asOfRole, recordedAsOf);
  const acquisition = timing.acquiredAt !== null ? `recorded acquisition ${timing.acquiredAt}`
    : timing.fixtureLoadedAt !== null ? `fixture loaded ${timing.fixtureLoadedAt}; original acquisition not established`
      : timing.recordedAt !== null ? `recorded response timestamp ${timing.recordedAt}; acquisition origin unestablished; original acquisition not established`
        : "original acquisition not established";
  return `${date}; ${acquisition}; publication/update vintage not established`;
}

function estimateDateText(asOfRole: EstimateTiming["asOfRole"], recordedAsOf: unknown): string {
  const day = estimateDay(recordedAsOf);
  const role = asOfRole === "forecast-period-end" ? "forecast-period end"
    : asOfRole === "fallback-day" ? "fallback envelope day" : "unclassified recorded date";
  return day !== null ? `${role} ${day}` : "envelope date not established";
}

export function estimateModelTimingText(timing: EstimateModelTiming, recordedAsOf: unknown): string {
  const acquired = estimateDay(timing.acquiredOn), loaded = estimateDay(timing.fixtureLoadedOn), recorded = estimateDay(timing.recordedOn);
  const acquisition = acquired !== null && (timing.acquisitionOrigin === "cache" || timing.acquisitionOrigin === "response") ? `recorded acquisition UTC day ${acquired}`
    : loaded !== null && timing.acquisitionOrigin === "fixture-load" ? `fixture loaded UTC day ${loaded}; original acquisition not established`
      : recorded !== null && timing.acquisitionOrigin === "legacy-recorded" ? `recorded response UTC day ${recorded}; acquisition origin unestablished; original acquisition not established`
        : "original acquisition not established";
  return `${estimateDateText(timing.asOfRole, recordedAsOf)}; ${acquisition}; publication/update vintage not established`;
}
