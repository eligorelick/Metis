import { afterEach, describe, expect, it } from "vitest";
import { getConfig, parseEnv, resetConfigCache } from "@/config/env";

describe("parseEnv", () => {
  it("treats empty strings as undefined and enables fixture mode", () => {
    const config = parseEnv({
      FMP_API_KEY: "",
      FINNHUB_API_KEY: "",
      FRED_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      ANALYSIS_MODEL: "",
    });

    expect(config.fmpApiKey).toBeUndefined();
    expect(config.finnhubApiKey).toBeUndefined();
    expect(config.fredApiKey).toBeUndefined();
    expect(config.anthropicApiKey).toBeUndefined();

    expect(config.hasFmpKey).toBe(false);
    expect(config.hasFinnhubKey).toBe(false);
    expect(config.hasFredKey).toBe(false);
    expect(config.hasAnthropicKey).toBe(false);
    expect(config.fixtureMode).toBe(true);
  });

  it("treats whitespace-only values as undefined", () => {
    const config = parseEnv({ FMP_API_KEY: "   ", ANTHROPIC_API_KEY: "\t" });
    expect(config.fmpApiKey).toBeUndefined();
    expect(config.anthropicApiKey).toBeUndefined();
    expect(config.fixtureMode).toBe(true);
  });

  it("applies defaults when variables are absent (a leftover VERIFY_MODEL is ignored)", () => {
    const config = parseEnv({ VERIFY_MODEL: "claude-sonnet-5" });
    expect(config.analysisModel).toBe("auto");
    expect("verifyModel" in config).toBe(false);
    expect(config.fixtureMode).toBe(true);
    expect(config.hasAnthropicKey).toBe(false);
    expect(config.maxActiveJobs).toBe(1);
    expect(config.maxActiveLlmCalls).toBe(2);
    expect(config.maxJobCostUsd).toBeNull();
    expect(config.maxRollingCostUsd).toBeNull();
    expect(config.rollingCostWindowMs).toBe(1_440 * 60_000);
    expect(config.paidPassLeaseTtlMs).toBe(900_000);
    expect(config.jobLeaseTtlMs).toBe(900_000);
  });

  it("trims and passes through real values, setting capability flags", () => {
    const config = parseEnv({
      FMP_API_KEY: " fmp-key ",
      FINNHUB_API_KEY: "fh-key",
      FRED_API_KEY: "fred-key",
      ANTHROPIC_API_KEY: "sk-ant-xxx",
      ANALYSIS_MODEL: "claude-opus-4-8",
    });

    expect(config.fmpApiKey).toBe("fmp-key");
    expect(config.finnhubApiKey).toBe("fh-key");
    expect(config.fredApiKey).toBe("fred-key");
    expect(config.anthropicApiKey).toBe("sk-ant-xxx");
    expect(config.analysisModel).toBe("claude-opus-4-8");

    expect(config.hasFmpKey).toBe(true);
    expect(config.hasFinnhubKey).toBe(true);
    expect(config.hasFredKey).toBe(true);
    expect(config.hasAnthropicKey).toBe(true);
    expect(config.fixtureMode).toBe(false);
  });

  it("fixtureMode is driven solely by the FMP key", () => {
    const withOnlyFmp = parseEnv({ FMP_API_KEY: "k" });
    expect(withOnlyFmp.fixtureMode).toBe(false);
    expect(withOnlyFmp.hasAnthropicKey).toBe(false);

    const withEverythingButFmp = parseEnv({
      FINNHUB_API_KEY: "k",
      FRED_API_KEY: "k",
      ANTHROPIC_API_KEY: "k",
    });
    expect(withEverythingButFmp.fixtureMode).toBe(true);
  });

  it("ignores unrelated environment variables", () => {
    const config = parseEnv({ PATH: "/usr/bin", HOME: "/home/u" });
    expect(config.analysisModel).toBe("auto");
    expect(config.fixtureMode).toBe(true);
  });

  it("holds startup work only for METIS_RESUME_ON_START=0 and resolves the token file", () => {
    expect(parseEnv({}).resumeOnStart).toBe(true);
    expect(parseEnv({ METIS_RESUME_ON_START: "1" }).resumeOnStart).toBe(true);
    expect(parseEnv({ METIS_RESUME_ON_START: " 0 " }).resumeOnStart).toBe(false);
    expect(parseEnv({ METIS_RESUME_ON_START: "" }).resumeOnStart).toBe(true);

    expect(parseEnv({}).tokenFile).toBeUndefined();
    expect(parseEnv({ METIS_TOKEN_FILE: "  " }).tokenFile).toBeUndefined();
    expect(parseEnv({ METIS_TOKEN_FILE: " /var/thesis/token " }).tokenFile)
      .toBe("/var/thesis/token");
  });

  it.each(["yes", "true", "2", "00", "-1"])(
    "rejects METIS_RESUME_ON_START=%s rather than guessing",
    (value) => {
      expect(() => parseEnv({ METIS_RESUME_ON_START: value })).toThrow(/1 or 0/);
    },
  );

  // WS6 (D-19): METIS_EV_INCLUDE_LEASES decides whether lease liabilities
  // count in the enterprise-value bridge and the DCF equity bridge. It is a
  // strict "1" opt-in: any other value leaves the house default (off) in place,
  // so a typo can never silently change every EV multiple.
  it("parses METIS_EV_INCLUDE_LEASES as a strict 1 opt-in, defaulting off", () => {
    expect(parseEnv({}).evIncludeLeases).toBe(false);
    expect(parseEnv({ METIS_EV_INCLUDE_LEASES: "1" }).evIncludeLeases).toBe(true);
    expect(parseEnv({ METIS_EV_INCLUDE_LEASES: " 1 " }).evIncludeLeases).toBe(true);
    for (const raw of ["0", "", " ", "true", "yes", "on", "01", "2"]) {
      expect(parseEnv({ METIS_EV_INCLUDE_LEASES: raw }).evIncludeLeases, raw).toBe(false);
    }
  });

  it("returns a frozen config object", () => {
    const config = parseEnv({});
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("parses strict scheduler counts, windows, leases, and decimal USD caps", () => {
    const config = parseEnv({
      METIS_MAX_ACTIVE_JOBS: "3",
      METIS_MAX_ACTIVE_LLM_CALLS: "4",
      METIS_MAX_JOB_COST_USD: "12.345678",
      METIS_MAX_ROLLING_COST_USD: "99.01",
      METIS_ROLLING_COST_WINDOW_MINUTES: "60",
      METIS_PAID_PASS_LEASE_SECONDS: "901",
      METIS_JOB_LEASE_SECONDS: "1200",
    });
    expect(config).toMatchObject({
      maxActiveJobs: 3,
      maxActiveLlmCalls: 4,
      maxJobCostUsd: 12.345678,
      maxRollingCostUsd: 99.01,
      rollingCostWindowMs: 3_600_000,
      paidPassLeaseTtlMs: 901_000,
      jobLeaseTtlMs: 1_200_000,
    });
  });

  it("treats blank scheduler values as defaults/null rather than zero", () => {
    const config = parseEnv({
      METIS_MAX_ACTIVE_JOBS: " ",
      METIS_MAX_ACTIVE_LLM_CALLS: "\t",
      METIS_MAX_JOB_COST_USD: "",
      METIS_MAX_ROLLING_COST_USD: " ",
      METIS_ROLLING_COST_WINDOW_MINUTES: "",
      METIS_PAID_PASS_LEASE_SECONDS: "",
      METIS_JOB_LEASE_SECONDS: "",
    });
    expect(config.maxActiveJobs).toBe(1);
    expect(config.maxActiveLlmCalls).toBe(2);
    expect(config.maxJobCostUsd).toBeNull();
    expect(config.maxRollingCostUsd).toBeNull();
    expect(config.rollingCostWindowMs).toBe(1_440 * 60_000);
    expect(config.paidPassLeaseTtlMs).toBe(900_000);
    expect(config.jobLeaseTtlMs).toBe(900_000);
  });

  it.each([
    ["METIS_MAX_ACTIVE_JOBS", "0"],
    ["METIS_MAX_ACTIVE_LLM_CALLS", "1.5"],
    ["METIS_ROLLING_COST_WINDOW_MINUTES", "-1"],
    ["METIS_PAID_PASS_LEASE_SECONDS", "600"],
    ["METIS_JOB_LEASE_SECONDS", "NaN"],
    ["METIS_MAX_ACTIVE_JOBS", "9007199254740992"],
  ])("rejects invalid scheduler integer %s=%s", (key, value) => {
    expect(() => parseEnv({ [key]: value })).toThrow();
  });

  it.each([
    ["METIS_ROLLING_COST_WINDOW_MINUTES", 60_000, 52_560_000],
    ["METIS_PAID_PASS_LEASE_SECONDS", 1_000, 2_147_483],
    ["METIS_JOB_LEASE_SECONDS", 1_000, 2_147_483],
  ] as const)("rejects %s beyond its executable millisecond range", (key, scale, maximumInput) => {
    // The job lease must cover the paid-pass lease, so the paid case is set
    // together with a job lease at least as long rather than on its own.
    const companion = key === "METIS_PAID_PASS_LEASE_SECONDS"
      ? { METIS_JOB_LEASE_SECONDS: String(2_147_483) }
      : {};
    expect(parseEnv({ ...companion, [key]: String(maximumInput) })).toMatchObject({
      [key === "METIS_ROLLING_COST_WINDOW_MINUTES"
        ? "rollingCostWindowMs"
        : key === "METIS_PAID_PASS_LEASE_SECONDS"
          ? "paidPassLeaseTtlMs"
          : "jobLeaseTtlMs"]: maximumInput * scale,
    });
    expect(() => parseEnv({ ...companion, [key]: String(maximumInput + 1) })).toThrow(/safe|overflow|range|maximum/i);
  });

  // DECISIONS D-08. A process that starts with these violated either loses a
  // healthy job to reconciliation between heartbeats or keeps billing after
  // its claim was handed to another process, so startup fails fast.
  it("enforces the lease invariants at startup", () => {
    expect(parseEnv({}).jobLeaseTtlMs).toBe(900_000);
    expect(parseEnv({}).streamIdleTimeoutMs).toBe(300_000);

    // Shorter than two job-claim heartbeats.
    expect(() => parseEnv({ METIS_JOB_LEASE_SECONDS: "599" })).toThrow(/greater than 599|heartbeat/i);
    // Shorter than the provider request timeout plus its settlement margin.
    expect(() => parseEnv({ METIS_PAID_PASS_LEASE_SECONDS: "659" })).toThrow();
    expect(() => parseEnv({ METIS_PAID_PASS_LEASE_SECONDS: "600" })).toThrow();
    // A paid lease that would outlive its parent job claim.
    expect(() => parseEnv({
      METIS_JOB_LEASE_SECONDS: "700",
      METIS_PAID_PASS_LEASE_SECONDS: "800",
    })).toThrow(/job claim|METIS_PAID_PASS_LEASE_SECONDS/i);
    // Equal is allowed: the claim outlasts every renewal of the pass it parents.
    expect(parseEnv({
      METIS_JOB_LEASE_SECONDS: "800",
      METIS_PAID_PASS_LEASE_SECONDS: "800",
    })).toMatchObject({ jobLeaseTtlMs: 800_000, paidPassLeaseTtlMs: 800_000 });
  });

  it.each([
    ["METIS_MAX_JOB_COST_USD", "-0.01"],
    ["METIS_MAX_ROLLING_COST_USD", "NaN"],
    ["METIS_MAX_JOB_COST_USD", "Infinity"],
    ["METIS_MAX_ROLLING_COST_USD", "1e3"],
    ["METIS_MAX_JOB_COST_USD", "1,000"],
    ["METIS_MAX_JOB_COST_USD", "9007199254740992"],
  ])("rejects invalid scheduler USD cap %s=%s", (key, value) => {
    expect(() => parseEnv({ [key]: value })).toThrow();
  });

  it("rejects a raw six-place USD cap that binary conversion rounds outside exact micro-USD range", () => {
    expect(parseEnv({ METIS_MAX_JOB_COST_USD: "9007199254.740990" }).maxJobCostUsd)
      .toBe(9_007_199_254.74099);
    expect(() => parseEnv({ METIS_MAX_JOB_COST_USD: "9007199254.740991" }))
      .toThrow(/micro-USD|exact|range/i);
  });
});

describe("parseEnv — METIS_STATEMENT_SOURCE (WS4, D-12)", () => {
  it("defaults to auto when unset or blank", () => {
    expect(parseEnv({}).statementSource).toBe("auto");
    expect(parseEnv({ METIS_STATEMENT_SOURCE: "   " }).statementSource).toBe("auto");
  });

  it("accepts the three policies, case-insensitively", () => {
    expect(parseEnv({ METIS_STATEMENT_SOURCE: "fmp" }).statementSource).toBe("fmp");
    expect(parseEnv({ METIS_STATEMENT_SOURCE: "EDGAR" }).statementSource).toBe("edgar");
    expect(parseEnv({ METIS_STATEMENT_SOURCE: " Auto " }).statementSource).toBe("auto");
  });

  it("rejects anything else, naming the accepted values", () => {
    expect(() => parseEnv({ METIS_STATEMENT_SOURCE: "sec" })).toThrow(/must be one of/);
  });
});

describe("getConfig", () => {
  const mutatedKeys = [
    "FMP_API_KEY",
    "ANALYSIS_MODEL",
  ] as const;
  const saved: Partial<Record<(typeof mutatedKeys)[number], string | undefined>> = {};

  afterEach(() => {
    for (const key of mutatedKeys) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
      delete saved[key];
    }
    resetConfigCache();
  });

  it("caches the parsed config until reset", () => {
    for (const key of mutatedKeys) saved[key] = process.env[key];

    process.env.FMP_API_KEY = "first-key";
    process.env.ANALYSIS_MODEL = "auto";
    resetConfigCache();

    const first = getConfig();
    expect(first.fmpApiKey).toBe("first-key");
    expect(first.fixtureMode).toBe(false);

    // Mutating the environment does NOT change the cached config...
    process.env.FMP_API_KEY = "second-key";
    const second = getConfig();
    expect(second).toBe(first);
    expect(second.fmpApiKey).toBe("first-key");

    // ...until the cache is explicitly reset.
    resetConfigCache();
    const third = getConfig();
    expect(third.fmpApiKey).toBe("second-key");
  });
});
