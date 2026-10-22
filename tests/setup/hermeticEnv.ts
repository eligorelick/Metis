/**
 * Metis settings from the shell that launched the suite never reach a test.
 * A METIS_ value outranks the THESIS_ alias a test sets (`metisEnv`), so an
 * ambient METIS_TOKEN_FILE, METIS_DB_PATH or METIS_ALLOWED_HOST overrode the
 * test's own setting, failed the request-guard and cache suites, and wrote into
 * the owner's paths (2026-10-22 audit, GATE-1). Every test file starts with no
 * METIS_ or THESIS_ variable; the launching values return after the file.
 */
import { afterAll } from "vitest";

const METIS_NAMESPACE = /^(?:METIS|THESIS)_/i;

/** Delete every METIS_/THESIS_ key (any case) from `env`; returns what was removed. */
export function clearMetisEnv(
  env: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  const removed: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    if (!METIS_NAMESPACE.test(key)) continue;
    removed[key] = env[key];
    delete env[key];
  }
  return removed;
}

const launching = clearMetisEnv();
afterAll(() => {
  clearMetisEnv();
  for (const [key, value] of Object.entries(launching)) {
    if (value !== undefined) process.env[key] = value;
  }
});
