import { defineConfig } from "vitest/config";
import {
  PRODUCT_TEST_EXCLUDE,
  PRODUCT_TEST_INCLUDE,
  RISK_SOURCE_MANIFEST,
  SHARED_RESOLVE_ALIAS,
  SHARED_SETUP_FILES,
  SHARED_TEST_RUNNER,
} from "./vitest.shared";

export default defineConfig({
  test: {
    include: PRODUCT_TEST_INCLUDE,
    exclude: PRODUCT_TEST_EXCLUDE,
    setupFiles: SHARED_SETUP_FILES,
    runner: SHARED_TEST_RUNNER,
    environment: "node",
    pool: "forks",
    isolate: true,
    // Same parallelism as the core run: the v8 report merges across forks, and
    // one worker made this repeat of the suite about 20 of the gate's 27 minutes.
    maxWorkers: "50%",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: RISK_SOURCE_MANIFEST,
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/risk",
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 85,
        lines: 85,
        perFile: true,
        autoUpdate: false,
      },
    },
  },
  resolve: {
    alias: SHARED_RESOLVE_ALIAS,
  },
});
