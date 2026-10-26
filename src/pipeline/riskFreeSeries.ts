/**
 * Series ids for the risk-free rate's fallback sources (audit 2026-10-22 B-4).
 *
 * The id travels with the rate (`riskFreePct` → the WACC result → the payload
 * citation `computed.returns.wacc.riskFree(<id>)`), so it stays one token with
 * no spaces. The WACC line prints the reader label instead, beside the
 * observation date. The two original ids ("fred:DGS10",
 * "fmp:treasury-rates.year10") keep printing as they always have.
 */

export const CACHED_DGS10_SERIES_ID = "fred:DGS10.last-cached";
export const TREASURY_PAR_CURVE_SERIES_ID = "treasury:par-yield-curve.10yr";

const WACC_LINE_LABEL: Record<string, string> = {
  [CACHED_DGS10_SERIES_ID]: "FRED DGS10 last cached observation",
  [TREASURY_PAR_CURVE_SERIES_ID]: "U.S. Treasury par yield curve 10 Yr",
};

/** How the WACC line names the series: a reader label for a fallback source, else the id. */
export function riskFreeSeriesText(seriesId: string | null): string {
  if (seriesId === null) return "series not stated";
  return WACC_LINE_LABEL[seriesId] ?? seriesId;
}
