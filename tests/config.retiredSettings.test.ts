/**
 * D-228 (P23, P24, P26): only METIS_ names configure Metis. Every former
 * THESIS_ alias is refused, naming its replacement and never its value; a
 * clean METIS_-only environment parses exactly as it did before the aliases
 * were retired; and no src file reads a THESIS_ environment name.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/config/env";
import {
  RETIRED_ALIAS_SUFFIXES,
  StaleSettingsError,
  assertNoStaleSettings,
  metisEnv,
  projectMetisSettings,
  staleSettingNames,
} from "@/config/namespace";
import { buildParityTable, OUT_OF_SCHEMA_SUFFIXES, type ParityTable } from "./helpers/configParityTable";

const ROOT = path.resolve(__dirname, "..");

function thrown(fn: () => unknown): unknown {
  try { fn(); } catch (error) { return error; }
  return undefined;
}

describe("retired THESIS_ names are refused (D-228)", () => {
  it("covers exactly the names main accepted as aliases: every METIS_ schema key plus the four out-of-schema settings", async () => {
    const { envSchemaKeys } = (await import(pathToFileURL(path.join(ROOT, "scripts", "docs-config.mjs")).href)) as {
      envSchemaKeys: (source: string) => string[];
    };
    const schema = envSchemaKeys(fs.readFileSync(path.join(ROOT, "src", "config", "env.ts"), "utf8"))
      .filter((key) => key.startsWith("METIS_"))
      .map((key) => key.slice("METIS_".length));
    expect(schema).toHaveLength(15);
    expect([...RETIRED_ALIAS_SUFFIXES].sort()).toEqual([...schema, ...OUT_OF_SCHEMA_SUFFIXES].sort());
  });

  it.each(RETIRED_ALIAS_SUFFIXES.flatMap((suffix) => ["0", "", "  ", "SECRET_VALUE"].map((value) => [suffix, value] as const)))(
    "THESIS_%s=%j is refused by every reader, naming METIS_%s and not the value",
    (suffix, value) => {
      const env = { [`THESIS_${suffix}`]: value };
      for (const read of [
        () => parseEnv(env),
        () => metisEnv(suffix, env),
        () => metisEnv("DB_PATH", env),
        () => projectMetisSettings(env, ["METIS_RESUME_ON_START"]),
        () => assertNoStaleSettings(env),
      ]) {
        const error = thrown(read);
        expect(error).toBeInstanceOf(StaleSettingsError);
        expect((error as StaleSettingsError).staleNames).toEqual([`THESIS_${suffix}`]);
        expect((error as Error).message).toContain(`THESIS_${suffix} -> METIS_${suffix}`);
        expect((error as Error).message).not.toContain("SECRET");
      }
    },
  );

  it("refuses even when the canonical name is also set, so a leftover hold or cap can never be shadowed silently", () => {
    const error = thrown(() => parseEnv({ METIS_RESUME_ON_START: "1", THESIS_RESUME_ON_START: "0" }));
    expect((error as StaleSettingsError).staleNames).toEqual(["THESIS_RESUME_ON_START"]);
  });

  it("lists every stale name in one error, in a stable order, with the rename for each", () => {
    const env = Object.fromEntries(RETIRED_ALIAS_SUFFIXES.map((suffix) => [`THESIS_${suffix}`, "x"]));
    const error = thrown(() => parseEnv(env)) as StaleSettingsError;
    expect(error.staleNames).toEqual(RETIRED_ALIAS_SUFFIXES.map((suffix) => `THESIS_${suffix}`));
    expect(error.message.split("\n").filter((line) => line.includes(" -> "))).toEqual(
      RETIRED_ALIAS_SUFFIXES.map((suffix) => `  THESIS_${suffix} -> METIS_${suffix}`),
    );
    expect(error.message).toMatch(/^Metis will not start: these settings use the retired THESIS_ prefix/);
  });

  it("ignores names that were never aliases and exact-case-mismatched names in plain records", () => {
    expect(staleSettingNames({ THESIS_NO_CONTEXT: "1", THESIS_RUNTIME_BUILD_ID: "x", thesis_db_path: "x", METIS_DB_PATH: "x" })).toEqual([]);
    expect(() => assertNoStaleSettings({})).not.toThrow();
  });
});

/**
 * Deliberate changes since the table was frozen, each named by its decision.
 * The frozen file stays the record of main at e55519ce; every default and row
 * not changed here must still equal it exactly.
 *
 * D-245: the layout default became the dossier. `uiRedesign` defaults to true,
 * so a blank value parses to the dossier, "1" no longer differs from the
 * default, and "0" is the one value that does (classic). Parsing stays strict:
 * "true" is still refused with the same issue.
 */
function withDeliberateChanges(frozen: ParityTable): { table: ParityTable; changedRows: number[] } {
  const table = JSON.parse(JSON.stringify(frozen)) as ParityTable;
  const changedRows: number[] = [];
  table.defaults.uiRedesign = true;
  table.rows.forEach((row, index) => {
    const raw = row.input.METIS_UI_REDESIGN;
    if (raw === undefined || !("changed" in row.result)) return;
    const before = JSON.stringify(row.result.changed);
    if (raw.trim() === "0") row.result.changed.uiRedesign = false;
    else delete row.result.changed.uiRedesign;
    if (JSON.stringify(row.result.changed) !== before) changedRows.push(index);
  });
  return { table, changedRows };
}

describe("a clean METIS_-only environment parses exactly as before (D-228)", () => {
  const recorded = JSON.parse(
    fs.readFileSync(path.join(ROOT, "tests", "fixtures", "config-parity-before-d228.json"), "utf8"),
  ) as ParityTable;
  const { table: frozen, changedRows } = withDeliberateChanges(recorded);
  const current = buildParityTable(parseEnv, metisEnv);

  it("changes only the rows its decisions name (D-245: the layout default)", () => {
    expect(recorded.defaults.uiRedesign).toBe(false);
    expect(changedRows.map((index) => recorded.rows[index]!.input.METIS_UI_REDESIGN)).toEqual(["0", "1", "1"]);
    expect(changedRows.map((index) => frozen.rows[index]!.result)).toEqual([
      { changed: { uiRedesign: false } },
      { changed: {} },
      { changed: expect.not.objectContaining({ uiRedesign: expect.anything() }) },
    ]);
    const refused = frozen.rows.find((row) => row.input.METIS_UI_REDESIGN === "true");
    expect(refused?.result).toEqual({ issues: [{ path: ["METIS_UI_REDESIGN"], message: "must be 1 or 0" }] });
  });

  it("keeps every default", () => {
    expect(current.defaults).toEqual(frozen.defaults);
  });
  it("covers blank, padded, valid, boundary and invalid values for every setting", () => {
    expect(current.rows.map((row) => row.input)).toEqual(frozen.rows.map((row) => row.input));
    expect(frozen.rows).toHaveLength(157);
    expect(frozen.rows.filter((row) => "issues" in row.result).length).toBeGreaterThan(20);
  });
  it.each(frozen.rows.map((row, index) => [JSON.stringify(row.input), index] as const))("%s parses as before", (_label, index) => {
    expect(current.rows[index]!.result).toEqual(frozen.rows[index]!.result);
  });
  it("reads the out-of-schema settings (allowed host, DB path, data dir, legacy import) as before", () => {
    expect(current.outOfSchema).toEqual(frozen.outOfSchema);
  });
});

describe("source scan: no src file reads a THESIS_ environment name (D-228)", () => {
  /**
   * The only THESIS_ text allowed in src: the rejection list in the namespace
   * owner, and the frozen reader- and prompt-visible strings that still spell
   * the old names (rewording them changes saved-report text and the judge
   * prompt, which needs an owner decision). Each is an exact line.
   */
  const FROZEN_LINES: Readonly<Record<string, readonly string[]>> = {
    "src/pipeline/keyless.ts": [
      "? `served by ${source} (${endpoint}) because THESIS_STATEMENT_SOURCE=edgar sets aside FMP's ${overridden} vendor row(s)`",
      "`${reason}; FMP's ${overridden} vendor row(s) were withheld because THESIS_STATEMENT_SOURCE=edgar builds statements from filed facts only`,",
      "notes.push(`${member}: FMP's ${overridden} vendor row(s) withheld under THESIS_STATEMENT_SOURCE=edgar`);",
      "`predecessor history from CIK ${predecessor.cik10} not appended: THESIS_STATEMENT_SOURCE=fmp keeps the statements vendor-only`,",
      "\"but THESIS_STATEMENT_SOURCE=fmp keeps the statements vendor-only, so no pre-reorganization periods were appended\",",
    ],
    "src/pipeline/stageB/valuation.ts": [
      "excluded: \" (house default; set THESIS_EV_INCLUDE_LEASES=1 to keep it)\",",
      "included: \" (THESIS_EV_INCLUDE_LEASES=1)\",",
      "`THESIS_EV_INCLUDE_LEASES=1: no operating-lease adjustment is subtracted from enterprise value; the retained operating-lease observation is ${fmtNum(leaseLiability)}. EBITDA remains after operating-lease cost (ASC 842).${leaseLiability > 0 ? \" EV/EBITDA is not comparable to the default basis that subtracts this observation.\" : \"\"} ${leaseEvidenceNote(bal)}`,",
    ],
    "src/pipeline/stageB/returns.ts": [
      "\"invested capital uses the retained totalDebt basis (THESIS_EV_INCLUDE_LEASES=1); no separate operating-lease amount is subtracted, matching the enterprise-value convention\",",
    ],
    "src/pipeline/stageC/judgeProtocol.ts": [
      "export const JUDGE_ORDER_ENV_KEY = \"THESIS_JUDGE_ORDER\";",
    ],
  };

  function sourceFiles(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name) ? [full] : [];
    });
  }
  const files = sourceFiles(path.join(ROOT, "src")).map((file) => path.relative(ROOT, file).split(path.sep).join("/"));

  it("finds THESIS_ only in the rejection list and the frozen strings, each exactly once", () => {
    const found: Record<string, string[]> = {};
    for (const file of files) {
      if (file === "src/config/namespace.ts") continue;
      const hits = fs.readFileSync(path.join(ROOT, file), "utf8").split(/\r?\n/).filter((line) => line.includes("THESIS_"));
      if (hits.length > 0) found[file] = hits.map((line) => line.trim());
    }
    expect(found).toEqual(FROZEN_LINES);
  });

  it("reads no Thesis-era name from an environment record and no METIS_ name outside the namespace owner", () => {
    const thesisRead = /\benv\s*(?:\.\s*THESIS_|\[\s*["'`]THESIS_)|THESIS_\$\{/i;
    const directMetisRead = /\benv\s*(?:\.\s*METIS_|\[\s*["'`]METIS_)/;
    const offenders: string[] = [];
    for (const file of files) {
      if (file === "src/config/namespace.ts") continue;
      fs.readFileSync(path.join(ROOT, file), "utf8").split(/\r?\n/).forEach((line, index) => {
        if (thesisRead.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
        if (directMetisRead.test(line) && !line.includes("process.env.METIS_RUNTIME_BUILD_ID")) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the namespace owner's only THESIS_ text to the rejection list and its message", () => {
    const lines = fs.readFileSync(path.join(ROOT, "src", "config", "namespace.ts"), "utf8").split(/\r?\n/);
    const code = lines.filter((line) => line.includes("THESIS_") && !/^\s*(?:\*|\/\/|\/\*\*)/.test(line)).map((line) => line.trim());
    expect(code).toEqual([
      "\"Metis will not start: these settings use the retired THESIS_ prefix, which is no longer read. \" +",
      "staleNames.map((name) => `  ${name} -> METIS_${name.slice(\"THESIS_\".length)}`).join(\"\\n\") +",
      ".map((suffix) => `THESIS_${suffix}`)",
    ]);
  });
});
