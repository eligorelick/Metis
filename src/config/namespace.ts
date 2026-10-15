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
