/**
 * D-228 parity table: every setting, with blank, padded, valid, boundary and
 * invalid values, evaluated by a given parser. The frozen expectation
 * (tests/fixtures/config-parity-before-d228.json) was produced by running this
 * exact table against main at e55519ce, before the THESIS_ aliases were
 * retired, so a clean METIS_-only environment is proved to parse exactly as it
 * did. The parser is passed in, so this file imports no application code.
 */

type Env = Record<string, string | undefined>;
type Parse = (env: Env) => object;
type Read = (suffix: string, env: Env) => string | undefined;

const BLANKS = ["", "   ", "\t"];

/** Raw values per schema setting (the METIS_ prefix is added). */
export const SCHEMA_SETTING_VALUES: Readonly<Record<string, readonly string[]>> = {
  MAX_ACTIVE_JOBS: ["1", "3", " 7 ", "0", "-1", "1.5", "abc", "9007199254740991", "9007199254740992"],
  MAX_ACTIVE_LLM_CALLS: ["2", "4", "0", "x"],
  MAX_JOB_COST_USD: ["0", "5", " 5 ", "12.345678", "0.0000001", "-0.01", "1e3", "1,000", "Infinity", "9007199254.740990", "9007199254.740991"],
  MAX_ROLLING_COST_USD: ["0", "20", "99.01", "NaN", "-1"],
  ROLLING_COST_WINDOW_MINUTES: ["60", "1440", "0", "52560000", "52560001"],
  STATEMENT_SOURCE: ["auto", "fmp", "EDGAR", " Auto ", "sec"],
  PAID_PASS_LEASE_SECONDS: ["900", "800", "600", "659", "660", "1000", "2147483", "2147484"],
  JOB_LEASE_SECONDS: ["900", "599", "600", "1200", "NaN"],
  STREAM_IDLE_SECONDS: ["0", "1", "300", "3600", "3601", "-1"],
  RESERVATION_MODE: ["request", "pass", "PASS", "x"],
  RESUME_ON_START: ["0", "1", " 0 ", "true", "yes"],
  UI_REDESIGN: ["0", "1", "true"],
  TOKEN_FILE: [" /x/token ", "relative-token"],
  JUDGE_ORDER: ["random", "bull-first", "BEAR-FIRST", "both", "nonsense"],
  EV_INCLUDE_LEASES: ["1", " 1 ", "0", "true", "yes"],
};

/** Unprefixed provider and model keys, with synthetic values only. */
export const UNPREFIXED_VALUES: Readonly<Record<string, readonly string[]>> = {
  FMP_API_KEY: [" fixture-fmp "],
  FINNHUB_API_KEY: ["fixture-finnhub"],
  FRED_API_KEY: ["fixture-fred"],
  ANTHROPIC_API_KEY: ["fixture-anthropic"],
  ANTHROPIC_ADMIN_KEY: ["fixture-admin"],
  ANALYSIS_MODEL: [" fixture-model ", "auto"],
};

/** Settings read outside the schema through the namespace reader. */
export const OUT_OF_SCHEMA_SUFFIXES = ["ALLOWED_HOST", "DB_PATH", "DATA_DIR", "IMPORT_LEGACY_DB"] as const;

/** Lease relationships and other cross-setting checks. */
const COMBINATIONS: Env[] = [
  { METIS_PAID_PASS_LEASE_SECONDS: "1000", METIS_JOB_LEASE_SECONDS: "900" },
  { METIS_PAID_PASS_LEASE_SECONDS: "800", METIS_JOB_LEASE_SECONDS: "800" },
  { METIS_PAID_PASS_LEASE_SECONDS: "700", METIS_JOB_LEASE_SECONDS: "800" },
  { METIS_PAID_PASS_LEASE_SECONDS: "2147483", METIS_JOB_LEASE_SECONDS: "2147483" },
  {
    METIS_MAX_ACTIVE_JOBS: "3", METIS_MAX_ACTIVE_LLM_CALLS: "4", METIS_MAX_JOB_COST_USD: "1.234567",
    METIS_MAX_ROLLING_COST_USD: "2.5", METIS_ROLLING_COST_WINDOW_MINUTES: "60", METIS_STATEMENT_SOURCE: "edgar",
    METIS_PAID_PASS_LEASE_SECONDS: "800", METIS_JOB_LEASE_SECONDS: "1100", METIS_STREAM_IDLE_SECONDS: "0",
    METIS_RESERVATION_MODE: "pass", METIS_RESUME_ON_START: "0", METIS_UI_REDESIGN: "1", METIS_TOKEN_FILE: "custom-token",
    METIS_JUDGE_ORDER: "both", METIS_EV_INCLUDE_LEASES: "1", FMP_API_KEY: "fixture-fmp", ANALYSIS_MODEL: "fixture-model",
  },
];

export interface ParityRow {
  input: Env;
  /** Fields that differ from the all-defaults config, or the validation issues. */
  result: { changed: Record<string, unknown> } | { issues: { path: unknown[]; message: string }[] };
}

export interface ParityTable {
  defaults: Record<string, unknown>;
  rows: ParityRow[];
  outOfSchema: { suffix: string; raw: string | null; read: string | null }[];
}

function outcome(parse: Parse, input: Env, defaults: Record<string, unknown>): ParityRow["result"] {
  try {
    const config = parse(input) as Record<string, unknown>;
    const changed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (JSON.stringify(value) !== JSON.stringify(defaults[key])) changed[key] = value;
    }
    return { changed };
  } catch (error) {
    const issues = (error as { issues?: { path: unknown[]; message: string }[] }).issues;
    if (!Array.isArray(issues)) throw error;
    return { issues: issues.map((issue) => ({ path: issue.path, message: issue.message })) };
  }
}

/** Evaluate the whole table with one parser and one namespace reader. */
export function buildParityTable(parse: Parse, read: Read): ParityTable {
  const defaults = JSON.parse(JSON.stringify(parse({}))) as Record<string, unknown>;
  const inputs: Env[] = [];
  for (const [suffix, values] of Object.entries(SCHEMA_SETTING_VALUES)) {
    for (const value of [...BLANKS, ...values]) inputs.push({ [`METIS_${suffix}`]: value });
  }
  for (const [key, values] of Object.entries(UNPREFIXED_VALUES)) {
    for (const value of [...BLANKS, ...values]) inputs.push({ [key]: value });
  }
  inputs.push(...COMBINATIONS);
  const rows = inputs.map((input) => ({ input, result: JSON.parse(JSON.stringify(outcome(parse, input, defaults))) }));
  const outOfSchema: ParityTable["outOfSchema"] = [];
  for (const suffix of OUT_OF_SCHEMA_SUFFIXES) {
    for (const raw of [undefined, ...BLANKS, " value ", "1", "0"]) {
      const env: Env = raw === undefined ? {} : { [`METIS_${suffix}`]: raw };
      outOfSchema.push({ suffix, raw: raw ?? null, read: read(suffix, env) ?? null });
    }
  }
  return { defaults, rows, outOfSchema };
}
