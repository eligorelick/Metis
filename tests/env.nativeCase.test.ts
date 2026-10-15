import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/config/env";

const root = path.resolve(__dirname, "..");
const require = createRequire(pathToFileURL(path.join(root, "package.json")));
type Environment = Record<string, string>;

// Native Windows environment lookup differs from ordinary JS records and from
// worker-thread env copies. Probe a real Node main process with synthetic keys.
// No credentials are inherited, no database/runtime is imported and no network
// request is permitted. All filesystem paths belong to one temporary directory.
function nativeConfigs(cases: Environment[]) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "metis-native-env-"));
  const script = `
    globalThis.fetch = async () => { throw new Error("network forbidden"); };
    const { parseEnv } = require(${JSON.stringify(path.join(root, "src/config/env.ts"))});
    const { metisEnv } = require(${JSON.stringify(path.join(root, "src/config/namespace.ts"))});
    const cases = ${JSON.stringify(cases)};
    const results = cases.map((input) => {
      for (const key of Object.keys(process.env)) {
        if (/^(METIS_|THESIS_|FMP_|FINNHUB_|FRED_|ANTHROPIC_|ANALYSIS_)/i.test(key)) delete process.env[key];
      }
      for (const [key, value] of Object.entries(input)) process.env[key] = value;
      try {
        return { platform: process.platform, aliasCap: metisEnv("MAX_JOB_COST_USD"), config: parseEnv(process.env) };
      } catch (error) {
        return { platform: process.platform, error: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) };
      }
    });
    process.stdout.write(JSON.stringify(results));
  `;
  try {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", pathToFileURL(require.resolve("tsx")).href], {
      input: script, cwd: root, encoding: "utf8", timeout: 15_000,
      env: {
        PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: "test",
        HOME: directory, USERPROFILE: directory, LOCALAPPDATA: directory,
        APPDATA: directory, XDG_DATA_HOME: directory, XDG_CONFIG_HOME: directory,
        TSX_TSCONFIG_PATH: path.join(root, "tsconfig.json"),
      },
    });
    expect(result.status, result.stderr || result.error?.message).toBe(0);
    return JSON.parse(result.stdout) as { platform: string; aliasCap?: string; config?: ReturnType<typeof parseEnv>; error?: { path: string[]; message: string }[] }[];
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

const mixedSettings = {
  fMp_Api_kEy: "fixture-fmp", fInNhUb_ApI_kEy: "fixture-finnhub", fReD_aPi_KeY: "fixture-fred",
  aNtHrOpIc_ApI_kEy: "fixture-anthropic", aNtHrOpIc_AdMiN_kEy: "fixture-admin", aNaLySiS_mOdEl: "fixture-model",
  mEtIs_MaX_aCtIvE_jObS: "3", mEtIs_MaX_aCtIvE_lLm_CaLlS: "4",
  mEtIs_MaX_jOb_CoSt_UsD: "0", mEtIs_MaX_rOlLiNg_CoSt_UsD: "0",
  mEtIs_RoLlInG_cOsT_wInDoW_mInUtEs: "30", mEtIs_StAtEmEnT_sOuRcE: "edgar",
  mEtIs_PaId_PaSs_LeAsE_sEcOnDs: "800", mEtIs_JoB_lEaSe_SeCoNdS: "1000",
  mEtIs_StReAm_IdLe_SeCoNdS: "0", mEtIs_ReSeRvAtIoN_mOdE: "pass", mEtIs_ReSuMe_On_StArT: "0",
  mEtIs_ToKeN_fIlE: "fixture-token", mEtIs_JuDgE_oRdEr: "both", mEtIs_Ev_InClUdE_lEaSeS: "1",
};

describe.skipIf(process.platform !== "win32")("native Windows environment case compatibility", () => {
  it("preserves zero caps in either namespace with lowercase OS variable names", () => {
    const cases = ["metis", "thesis"].flatMap((prefix) => ["job", "rolling"].map((kind) => ({ [`${prefix}_max_${kind}_cost_usd`]: "0" })));
    const results = nativeConfigs(cases);
    results.forEach((result, index) => {
      expect(result.platform).toBe("win32");
      expect(result.config?.[index % 2 === 0 ? "maxJobCostUsd" : "maxRollingCostUsd"]).toBe(0);
    });
    expect(results[0].aliasCap).toBe("0"); expect(results[2].aliasCap).toBe("0");
  });
  it("rejects mixed-case invalid canonical and legacy caps instead of silently disabling them", () => {
    const results = nativeConfigs([
      { metis_max_job_cost_usd: "invalid", THESIS_MAX_JOB_COST_USD: "0" },
      { thesis_max_job_cost_usd: "invalid" },
      { metis_max_rolling_cost_usd: "-1", THESIS_MAX_ROLLING_COST_USD: "0" },
      { thesis_max_rolling_cost_usd: "0.0000001" },
    ]);
    results.forEach((result, index) => expect(result.error?.[0].path).toEqual([index < 2 ? "METIS_MAX_JOB_COST_USD" : "METIS_MAX_ROLLING_COST_USD"]));
  });
  it("retains every schema setting including provider/model keys, resume controls and lease timing", () => {
    const legacy = Object.fromEntries(Object.entries(mixedSettings).map(([key, value]) => [key.replace(/^metis_/i, "tHeSiS_"), value]));
    const expected = parseEnv(Object.fromEntries(Object.entries(mixedSettings).map(([key, value]) => [key.toUpperCase(), value])));
    const results = nativeConfigs([mixedSettings, legacy]);
    results.forEach((result) => expect(result.config).toEqual(expected));
    expect(expected.resumeOnStart).toBe(false); expect(expected.fixtureMode).toBe(false);
    expect(expected.paidPassLeaseTtlMs).toBe(800_000); expect(expected.jobLeaseTtlMs).toBe(1_000_000);
  });
  it("enforces lease and resume validation for mixed-case native variables", () => {
    const results = nativeConfigs([
      { mEtIs_PaId_PaSs_LeAsE_sEcOnDs: "600", THESIS_PAID_PASS_LEASE_SECONDS: "900" },
      { tHeSiS_jOb_LeAsE_sEcOnDs: "599" },
      { mEtIs_PaId_PaSs_LeAsE_sEcOnDs: "1000", mEtIs_JoB_lEaSe_SeCoNdS: "900" },
      { mEtIs_ReSuMe_On_StArT: "invalid", THESIS_RESUME_ON_START: "0" },
    ]);
    results.forEach((result) => expect(result.error?.length ?? 0).toBeGreaterThan(0));
  });
  it("canonical mixed-case blank values win over valid or invalid legacy settings", () => {
    const [result] = nativeConfigs([{
      metis_max_job_cost_usd: "", THESIS_MAX_JOB_COST_USD: "0",
      metis_max_rolling_cost_usd: " ", THESIS_MAX_ROLLING_COST_USD: "invalid",
      metis_resume_on_start: "", THESIS_RESUME_ON_START: "0",
      metis_paid_pass_lease_seconds: "", THESIS_PAID_PASS_LEASE_SECONDS: "invalid",
    }]);
    expect(result.config?.maxJobCostUsd).toBeNull(); expect(result.config?.maxRollingCostUsd).toBeNull();
    expect(result.config?.resumeOnStart).toBe(true); expect(result.config?.paidPassLeaseTtlMs).toBe(900_000);
  });
});

it("ordinary records retain case sensitivity on every platform", () => {
  expect(parseEnv(mixedSettings)).toEqual(parseEnv({}));
  expect(parseEnv({ metis_max_job_cost_usd: "invalid", THESIS_MAX_JOB_COST_USD: "0" }).maxJobCostUsd).toBe(0);
  expect(parseEnv({ METIS_MAX_JOB_COST_USD: "", THESIS_MAX_JOB_COST_USD: "0" }).maxJobCostUsd).toBeNull();
});

it.skipIf(process.platform === "win32")("native POSIX environments retain case-sensitive lookup", () => {
  const results = nativeConfigs([
    mixedSettings,
    { metis_max_job_cost_usd: "invalid", THESIS_MAX_JOB_COST_USD: "0" },
    { METIS_MAX_JOB_COST_USD: "", THESIS_MAX_JOB_COST_USD: "0" },
  ]);
  expect(results[0].config).toEqual(parseEnv({}));
  expect(results[1].config?.maxJobCostUsd).toBe(0);
  expect(results[2].config?.maxJobCostUsd).toBeNull();
});
