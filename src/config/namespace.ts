/**
 * The one owner of how Metis settings are read from the environment.
 *
 * Only `METIS_*` names configure the app. The `THESIS_*` names that used to be
 * accepted as aliases are RETIRED (DECISIONS D-227, revising the alias
 * promise of the rename). A retired name that is still present, set to
 * anything including blank, is refused rather than ignored: ignoring it would,
 * for example, drop an operator's `THESIS_RESUME_ON_START=0` and let queued
 * paid work auto-resume, drop a spend cap, or move the app to a different
 * database (P23, P24, P26).
 *
 * Where the refusal runs, so no path skips it:
 *  - `metisEnv` and `projectMetisSettings` below are the only readers of a
 *    formerly aliased `METIS_*` setting (tests/config.retiredSettings.test.ts
 *    scans src for any other reader), and both refuse before they read. Every
 *    consumer — `getConfig`/`parseEnv` (spend caps, resume hold, leases,
 *    statement source, judge order, token path...), the database and data
 *    paths, the legacy-import switch, the allowed host, the judge-order
 *    fallback — therefore refuses on its first read: in the server, the
 *    request proxy, the job runner and scheduler bootstrap, and every script
 *    that reads a setting (settings:reset, costs:reconcile, research:replay,
 *    export:corrected, db:push, the golden harness's own database path).
 *  - The server also refuses eagerly in `src/instrumentation.ts`, before it
 *    mints the request token or bootstraps the scheduler, so it never starts.
 *    The settings:reset, costs:reconcile, research:replay and export:corrected
 *    entry points refuse eagerly too (replay of a --snapshot file and the
 *    corrected export read no setting, so only the eager check covers them).
 *  - Only `METIS_RUNTIME_BUILD_ID` is read directly; it never had an alias.
 *  - A process given a deliberately stripped environment (the golden worker)
 *    has no retired names to refuse and runs unchanged.
 */

/** Each setting suffix that, before D-227, also answered to a `THESIS_<suffix>` alias. */
export const RETIRED_ALIAS_SUFFIXES = [
  "STATEMENT_SOURCE", "JUDGE_ORDER", "MAX_ACTIVE_JOBS", "MAX_ACTIVE_LLM_CALLS",
  "MAX_JOB_COST_USD", "MAX_ROLLING_COST_USD", "RESERVATION_MODE", "STREAM_IDLE_SECONDS",
  "ROLLING_COST_WINDOW_MINUTES", "PAID_PASS_LEASE_SECONDS", "JOB_LEASE_SECONDS", "RESUME_ON_START",
  "EV_INCLUDE_LEASES", "ALLOWED_HOST", "TOKEN_FILE", "DB_PATH", "DATA_DIR", "IMPORT_LEGACY_DB", "UI_REDESIGN",
] as const;

/** Startup refusal for retired setting names. The message lists names only, never values. */
export class StaleSettingsError extends Error {
  readonly staleNames: readonly string[];

  constructor(staleNames: readonly string[]) {
    super(
      "Metis will not start: these settings use the retired THESIS_ prefix, which is no longer read. " +
        "Rename each one in your .env file, launcher or shell (keep the value), then start again:\n" +
        staleNames.map((name) => `  ${name} -> METIS_${name.slice("THESIS_".length)}`).join("\n") +
        "\nSee docs/OPERATIONS.md (Settings names).",
    );
    this.name = "StaleSettingsError";
    this.staleNames = staleNames;
  }
}

/**
 * Retired names present in `env`. Each name is looked up directly, never by
 * enumerating keys, so a native Windows environment matches case-insensitively
 * exactly as the old alias read did, while ordinary records keep exact case.
 */
export function staleSettingNames(env: Record<string, string | undefined> = process.env): string[] {
  return RETIRED_ALIAS_SUFFIXES
    .map((suffix) => `THESIS_${suffix}`)
    .filter((name) => env[name] !== undefined);
}

/** Throws `StaleSettingsError` when any retired name is present, set to anything including blank. */
export function assertNoStaleSettings(env: Record<string, string | undefined> = process.env): void {
  const stale = staleSettingNames(env);
  if (stale.length > 0) throw new StaleSettingsError(stale);
}

/** The `METIS_<suffix>` value exactly as set (blank and invalid values included), after the stale-name refusal. */
export function metisEnv(
  suffix: string,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  assertNoStaleSettings(env);
  return env[`METIS_${suffix}`];
}

/**
 * Project every schema field through direct source lookups before validation,
 * after the stale-name refusal. Spreading process.env would lose native
 * Windows case-insensitive lookup; direct reads preserve it while ordinary
 * records and POSIX retain exact case.
 */
export function projectMetisSettings(
  env: Record<string, string | undefined>,
  schemaKeys: readonly string[],
): Record<string, string | undefined> {
  assertNoStaleSettings(env);
  return Object.fromEntries(schemaKeys.map((key) => [key, env[key]]));
}
