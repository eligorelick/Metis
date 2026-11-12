import { appendFileSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { parseEnv } from "@/config/env";
import { StaleSettingsError } from "@/config/namespace";

afterEach(() => vi.unstubAllEnvs());

/** Copy .env.example to a fresh folder as its .env (plus optional extra lines) and parse what Next would load. */
function parseCopiedExample(extraLines = "") {
  const dir = mkdtempSync(join(tmpdir(), "metis-example-"));
  try {
    copyFileSync(".env.example", join(dir, ".env"));
    if (extraLines) appendFileSync(join(dir, ".env"), `\n${extraLines}`);
    const loaded = loadEnvConfig(dir, false, { info: () => {}, error: () => {} }, true);
    return parseEnv(loaded.combinedEnv);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

it("DOC-203 a copied example keeps a shell startup hold and exact USD caps", () => {
  for (const key of Object.keys(process.env)) if (/^(METIS|THESIS)_/.test(key)) vi.stubEnv(key, undefined);
  vi.stubEnv("METIS_RESUME_ON_START", "0");
  vi.stubEnv("METIS_MAX_JOB_COST_USD", "5");
  vi.stubEnv("METIS_MAX_ROLLING_COST_USD", "20");
  const config = parseCopiedExample();
  expect(config.resumeOnStart).toBe(false);
  expect(config.maxJobCostUsd).toBe(5);
  expect(config.maxRollingCostUsd).toBe(20);
});

it("D-227 an .env that still carries retired THESIS_ lines is refused, naming each replacement and no value", () => {
  for (const key of Object.keys(process.env)) if (/^(METIS|THESIS)_/.test(key)) vi.stubEnv(key, undefined);
  let thrown: unknown;
  try {
    parseCopiedExample("THESIS_RESUME_ON_START=0\nTHESIS_MAX_JOB_COST_USD=SECRET_LEGACY_CAP\n");
  } catch (error) { thrown = error; } finally {
    // loadEnvConfig writes file values into process.env; remove them so nothing leaks.
    delete process.env.THESIS_RESUME_ON_START;
    delete process.env.THESIS_MAX_JOB_COST_USD;
  }
  expect(thrown).toBeInstanceOf(StaleSettingsError);
  const message = (thrown as Error).message;
  expect((thrown as StaleSettingsError).staleNames).toEqual(["THESIS_MAX_JOB_COST_USD", "THESIS_RESUME_ON_START"]);
  expect(message).toContain("THESIS_MAX_JOB_COST_USD -> METIS_MAX_JOB_COST_USD");
  expect(message).toContain("THESIS_RESUME_ON_START -> METIS_RESUME_ON_START");
  expect(message).not.toContain("SECRET");
});
