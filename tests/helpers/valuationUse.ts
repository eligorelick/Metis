import type { ValuationUse } from "@/report/schema";
import type { DataBundle } from "@/pipeline/types";

/** Explicit observation for an owned synthetic fixture; acquisition time is unchanged. */
export function withFixtureQuoteDay(bundle: DataBundle, day: string): DataBundle {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(day).toISOString().slice(0, 10) !== day) throw new Error("Invalid synthetic quote day");
  if (!bundle.quote.ok || !bundle.quote.value.data.rows[0]) throw new Error("Synthetic quote fixture required");
  bundle.quote.value.data.rows[0].timestamp = Date.parse(`${day}T20:00:00Z`) / 1000;
  bundle.quote.value.asOf = day;
  if (bundle.sourceManifest?.quote) bundle.sourceManifest.quote.asOf = day;
  return bundle;
}

/** Explicit same-date evidence for isolated numeric unit fixtures, never a
 * production classifier or a way to infer an observed quote from build time. */
export function currentValuationUseFixture(day = "2025-12-31"): ValuationUse {
  return { status: "current", statementDate: day, valueDate: day, quoteDate: day, reason: "same-date" };
}

export const unavailableValuationUseFixture: ValuationUse = {
  status: "unestablished", statementDate: null, valueDate: null, quoteDate: null, reason: "model-unavailable",
};
