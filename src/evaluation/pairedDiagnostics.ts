/** Calendar breadth is descriptive, not an estimate of independent economic regimes. */
export function diagnosticBreadth(rows: readonly { issuerId: string; analysisAt: string; periodEnd: string }[]) {
  const issuerClusters = new Set(rows.map(r => r.issuerId)).size;
  const forecastDates = new Set(rows.map(r => r.analysisAt.slice(0, 10))).size;
  const windows = rows.map(r => ({ start: Date.parse(r.analysisAt), end: Date.parse(r.periodEnd) }))
    .sort((a, b) => a.end - b.end || a.start - b.start);
  let previousEnd = -Infinity, nonoverlappingDateBlocks = 0;
  for (const window of windows) {
    if (window.start > previousEnd) { nonoverlappingDateBlocks++; previousEnd = window.end; }
  }
  const insufficient = issuerClusters < 5 || nonoverlappingDateBlocks < 5;
  return {
    available: false as const, readiness: insufficient ? "insufficient" as const : "diagnostic" as const,
    nominalN: rows.length, issuerClusters, forecastDates, nonoverlappingDateBlocks,
    dateBlockMethod: "nonoverlapping_forecast_windows" as const,
    reason: insufficient
      ? "Insufficient issuer or nonoverlapping date breadth; no inferential interval or predictive-skill claim"
      : "Calendar breadth is diagnostic only; a predeclared holdout and dependence/overlap resampling plan are required before inferential intervals",
  };
}
