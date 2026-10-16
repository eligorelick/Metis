/**
 * Suites that create real on-disk SQLite databases, WAL files or native locks.
 * Add new disk-backed suites explicitly; in-memory DB tests are not included.
 */
export const NATIVE_SQLITE_IO_TESTS = [
  "tests/ai.mutex.test.ts",
  "tests/ai.storeFailures.test.ts",
  "tests/api.routes.settings.test.ts",
  "tests/api.routes.stream.test.ts",
  "tests/db.bootstrapFailure.test.ts",
  "tests/db.cache.test.ts",
  "tests/db.cli.test.ts",
  "tests/db.jobs.migration.test.ts",
  "tests/jobRunner.test.ts",
  "tests/jobScheduler.test.ts",
  "tests/jobState.test.ts",
  "tests/jobs.resume.test.ts",
  "tests/maintenance.env.test.ts",
  "tests/metis.runtimeCompatibility.test.ts",
  "tests/report.correctedCli.test.ts",
  "tests/report.correctedCliOutPath.test.ts",
  "tests/requestAdmission.test.ts",
  "tests/risk.runtime.coverage.test.ts",
  "tests/scheduler.presumedSpend.test.ts",
  "tests/settings.reset.test.ts",
] as const;

// Hosted Windows has measured native bootstrap at 5,182ms. Use the same
// bounded allowance on every Windows host, avoiding CI environment detection.
export const NATIVE_SQLITE_IO_TIMEOUT_MS = 15_000;

/** Only the Windows native-I/O suites need a larger default; explicit test budgets still win. */
export function nativeSqliteTestTimeout(testPath: string | undefined, platform: string, currentTimeout: number): number {
  if (platform !== "win32" || testPath === undefined || currentTimeout === 0) return currentTimeout;
  const normalized = testPath.replaceAll("\\", "/");
  const nativeIo = NATIVE_SQLITE_IO_TESTS.some((file) => normalized === file || normalized.endsWith(`/${file}`));
  return nativeIo ? Math.max(currentTimeout, NATIVE_SQLITE_IO_TIMEOUT_MS) : currentTimeout;
}
