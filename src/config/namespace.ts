/** Canonical presence wins, including blank or invalid values; never fall back by truthiness. */
export function metisEnv(
  suffix: string,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const canonical = env[`METIS_${suffix}`];
  return canonical !== undefined ? canonical : env[`THESIS_${suffix}`];
}

/**
 * Project every schema field through direct source lookups before validation.
 * Spreading process.env would lose native Windows case-insensitive lookup;
 * direct reads preserve it while ordinary records and POSIX retain exact case.
 */
export function withMetisAliases(
  env: Record<string, string | undefined>,
  schemaKeys: readonly string[],
): Record<string, string | undefined> {
  return Object.fromEntries(schemaKeys.map((key) => [
    key,
    key.startsWith("METIS_") ? metisEnv(key.slice("METIS_".length), env) : env[key],
  ]));
}

/** Startup diagnostics disclose names only; canonical presence still wins. */
export function warnMetisAliasConflicts(
  env: Record<string, string | undefined> = process.env,
  warn: (message: string) => void = console.warn,
): void {
  const suffixes = ["STATEMENT_SOURCE", "JUDGE_ORDER", "MAX_ACTIVE_JOBS", "MAX_ACTIVE_LLM_CALLS",
    "MAX_JOB_COST_USD", "MAX_ROLLING_COST_USD", "RESERVATION_MODE", "STREAM_IDLE_SECONDS",
    "ROLLING_COST_WINDOW_MINUTES", "PAID_PASS_LEASE_SECONDS", "JOB_LEASE_SECONDS", "RESUME_ON_START",
    "EV_INCLUDE_LEASES", "ALLOWED_HOST", "TOKEN_FILE", "DB_PATH", "DATA_DIR", "IMPORT_LEGACY_DB", "UI_REDESIGN"];
  for (const suffix of suffixes) {
    const key = `METIS_${suffix}`;
    const alias = `THESIS_${key.slice(6)}`;
    if (env[key] !== undefined && env[alias] !== undefined && env[key] !== env[alias]) {
      warn(`[config] ${key} overrides conflicting ${alias}; remove the unused alias.`);
    }
  }
}
