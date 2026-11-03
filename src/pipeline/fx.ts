import type { FetchResult } from "@/types/core";
import type { FredObservation, FredSeriesOptions } from "@/providers/fred";

/** H.10 native units. EUR/GBP are USD per local unit; every other series is local per USD. */
export const FX_SERIES: Readonly<Record<string, { series: string; units: "local-per-USD" | "USD-per-local" }>> = {
  TWD: { series: "DEXTAUS", units: "local-per-USD" }, JPY: { series: "DEXJPUS", units: "local-per-USD" },
  EUR: { series: "DEXUSEU", units: "USD-per-local" }, DKK: { series: "DEXDNUS", units: "local-per-USD" },
  CNY: { series: "DEXCHUS", units: "local-per-USD" }, GBP: { series: "DEXUSUK", units: "USD-per-local" },
  CHF: { series: "DEXSZUS", units: "local-per-USD" }, KRW: { series: "DEXKOUS", units: "local-per-USD" },
  INR: { series: "DEXINUS", units: "local-per-USD" }, HKD: { series: "DEXHKUS", units: "local-per-USD" },
  CAD: { series: "DEXCAUS", units: "local-per-USD" }, MXN: { series: "DEXMXUS", units: "local-per-USD" },
};
export const FX_MAX_AGE_DAYS = 7;
const dayMs = 86_400_000;
const day = (s: string | null): s is string => s !== null && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
export interface ValuationFx {
  reportingCurrency: string;
  quoteCurrency: "USD";
  series: string;
  observation: FredObservation;
  usdPerReportingUnit: number;
  quoteDate: string;
}
export type FxFetch = (id: string, options: FredSeriesOptions) => Promise<FetchResult<FredObservation[]>>;
export async function fetchValuationFx(from: string | null, to: string | null, quoteDate: string | null, fetch: FxFetch): Promise<FetchResult<FredObservation[]> | undefined> {
  if (from === to) return undefined;
  const spec = from === null ? undefined : FX_SERIES[from];
  if (!spec || to !== "USD" || !day(quoteDate)) return { ok: false, gap: {
    field: "valuationFx", reason: "FX requires a supported reporting currency, a USD quote and an established quote date", severity: "warn", attemptedSources: ["fred:H.10"],
  } };
  const start = new Date(Date.parse(quoteDate) - FX_MAX_AGE_DAYS * dayMs).toISOString().slice(0, 10);
  try { return await fetch(spec.series, { start, end: quoteDate, units: "lin", requireSeriesIdentity: true }); }
  catch { return { ok: false, gap: { field: "valuationFx", reason: `FRED ${spec.series} fetch failed; FX unavailable`, severity: "warn", attemptedSources: [`fred:${spec.series}`] } }; }
}
export function selectValuationFx(from: string | null, to: string | null, quoteDate: string | null, data?: FetchResult<FredObservation[]>): { rate: ValuationFx | null; reason: string } {
  const refuse = (reason: string) => ({ rate: null, reason });
  if (to !== "USD") return refuse("FX valuation supports USD quotes only");
  const spec = from === null ? undefined : FX_SERIES[from];
  if (!spec) return refuse(`unsupported reporting currency ${from ?? "unknown"}`);
  if (!day(quoteDate)) return refuse("quote date is not established");
  if (!data?.ok) return refuse(data?.gap.reason ?? `FRED ${spec.series} observation missing`);
  // The source envelope establishes both series identity and a level transform.
  const endpoint = data.value.endpoint;
  if (data.value.source !== "fred" || !new RegExp(`(?:id|series_id)=${spec.series}(?:[& )]|$)`).test(endpoint) || /units=/.test(endpoint)) {
    return refuse(`FX source must be FRED series ${spec.series} in native level units`);
  }
  const rows = data.value.data.filter(r => day(r.date) && r.date <= quoteDate).sort((a, b) => b.date.localeCompare(a.date));
  const observation = rows[0];
  if (!observation) return refuse(`no FRED ${spec.series} observation on or before ${quoteDate}`);
  if (rows.some(r => r.date === observation.date && r.value !== observation.value)) return refuse("conflicting FX observations on the selected date");
  if (!Number.isFinite(observation.value) || observation.value <= 0) return refuse("FX observation must be finite and positive");
  const age = (Date.parse(quoteDate) - Date.parse(observation.date)) / dayMs;
  if (age > FX_MAX_AGE_DAYS) return refuse(`stale FRED ${spec.series} observation ${observation.date}: ${age} days, limit ${FX_MAX_AGE_DAYS}`);
  const usdPerReportingUnit = spec.units === "local-per-USD" ? 1 / observation.value : observation.value;
  if (!Number.isFinite(usdPerReportingUnit) || usdPerReportingUnit <= 0) return refuse("FX conversion must be finite and positive");
  return { rate: { reportingCurrency: from!, quoteCurrency: "USD", series: spec.series, observation: { ...observation }, usdPerReportingUnit, quoteDate }, reason: "dated H.10 spot translation" };
}
