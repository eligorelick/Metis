/** Next.js process-start hook. Edge and build-time evaluation stay inert. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // D-227 (P23, P24, P26): refuse retired Thesis-era setting names before
  // anything else runs, so a leftover hold, cap or path is never silently
  // dropped. Next only logs a register() failure and keeps listening (every
  // request would then fail with a bare 500), so the process exits instead:
  // the one message names each key to rename, and nothing is served.
  const { assertNoStaleSettings, StaleSettingsError } = await import("@/config/namespace");
  try {
    assertNoStaleSettings();
  } catch (error) {
    if (!(error instanceof StaleSettingsError)) throw error;
    console.error(`[config] ${error.message}`);
    process.exit(1);
    throw error; // reached only where exit is intercepted (tests)
  }
  // Mint the per-process X-Metis-Token before any route is served so a
  // non-browser client can read it from the data directory (docs/PRIVACY.md).
  // The token itself is never logged.
  const { ensureRequestToken } = await import("@/app/api/sameOrigin");
  const token = ensureRequestToken();
  if (token.persisted) {
    console.info(`[security] X-Metis-Token for non-browser clients written to ${token.path}`);
  }
  const { bootstrapReportScheduler } = await import("@/pipeline/jobSchedulerBootstrap");
  await bootstrapReportScheduler();
}
