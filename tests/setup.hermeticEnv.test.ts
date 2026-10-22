/**
 * Pins the hermetic-environment setup (`tests/setup/hermeticEnv.ts`). A Metis
 * setting in the shell that launched the suite outranked the THESIS_ value a
 * test set (`metisEnv`), so an ambient METIS_TOKEN_FILE or METIS_DB_PATH made
 * tests fail and wrote into the owner's paths (2026-10-22 audit, GATE-1).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { clearMetisEnv } from "./setup/hermeticEnv";

describe("hermetic test environment", () => {
  it("removes every METIS_ and THESIS_ setting, whatever its case, and nothing else", () => {
    const env: Record<string, string | undefined> = {
      METIS_TOKEN_FILE: "/owner/csrf-token",
      THESIS_DB_PATH: "/owner/thesis.db",
      metis_data_dir: "/owner/data",
      METISX_UNRELATED: "kept",
      PATH: "/usr/bin",
    };
    expect(clearMetisEnv(env)).toEqual({
      METIS_TOKEN_FILE: "/owner/csrf-token",
      THESIS_DB_PATH: "/owner/thesis.db",
      metis_data_dir: "/owner/data",
    });
    expect(env).toEqual({ METISX_UNRELATED: "kept", PATH: "/usr/bin" });
  });

  it("starts each test file with no Metis setting from the launching shell", () => {
    expect(Object.keys(process.env).filter((key) => /^(?:METIS|THESIS)_/i.test(key))).toEqual([]);
  });

  it("keeps the request-guard and cache suites passing and out of ambient Metis paths", () => {
    const root = path.resolve(__dirname, "..");
    const sentinel = mkdtempSync(path.join(tmpdir(), "metis-ambient-sentinel-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          path.join(root, "node_modules/vitest/vitest.mjs"),
          "run",
          "--config",
          "vitest.config.ts",
          "tests/api.routes.sameOrigin.test.ts",
          "tests/db.cache.test.ts",
        ],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 90_000,
          shell: false,
          env: {
            ...process.env,
            METIS_DATA_DIR: sentinel,
            METIS_DB_PATH: path.join(sentinel, "metis.db"),
            METIS_TOKEN_FILE: path.join(sentinel, "csrf-token"),
            METIS_ALLOWED_HOST: "10.9.9.9:3000",
            METIS_MAX_JOB_COST_USD: "0",
          },
        },
      );
      expect(result.status, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`).toBe(0);
      expect(readdirSync(sentinel)).toEqual([]);
    } finally {
      rmSync(sentinel, { recursive: true, force: true });
    }
  }, 120_000);
});
