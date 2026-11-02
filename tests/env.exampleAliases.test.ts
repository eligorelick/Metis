import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { parseEnv } from "@/config/env";

afterEach(() => vi.unstubAllEnvs());
it("DOC-203 copied example preserves legacy startup hold and exact USD caps", () => {
  for (const key of Object.keys(process.env)) if (/^(METIS|THESIS)_/.test(key)) vi.stubEnv(key, undefined);
  vi.stubEnv("THESIS_RESUME_ON_START", "0");
  vi.stubEnv("THESIS_MAX_JOB_COST_USD", "5");
  vi.stubEnv("THESIS_MAX_ROLLING_COST_USD", "20");
  const dir = mkdtempSync(join(tmpdir(), "metis-example-"));
  try {
    copyFileSync(".env.example", join(dir, ".env"));
    const loaded = loadEnvConfig(dir, false, { info: () => {}, error: () => {} }, true);
    const config = parseEnv(loaded.combinedEnv);
    expect(config.resumeOnStart).toBe(false);
    expect(config.maxJobCostUsd).toBe(5);
    expect(config.maxRollingCostUsd).toBe(20);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("DOC-203 conflicting aliases warn with key names only and canonical remains authoritative", async () => {
  const { warnMetisAliasConflicts, metisEnv } = await import("@/config/namespace");
  const warn = vi.fn();
  const env = { METIS_MAX_JOB_COST_USD: "SECRET_CANONICAL", THESIS_MAX_JOB_COST_USD: "SECRET_LEGACY",
    METIS_RESUME_ON_START: "0", THESIS_RESUME_ON_START: "0" };
  warnMetisAliasConflicts(env, warn);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain("METIS_MAX_JOB_COST_USD");
  expect(warn.mock.calls[0][0]).toContain("THESIS_MAX_JOB_COST_USD");
  expect(warn.mock.calls[0][0]).not.toContain("SECRET");
  expect(metisEnv("MAX_JOB_COST_USD", env)).toBe("SECRET_CANONICAL");
});
