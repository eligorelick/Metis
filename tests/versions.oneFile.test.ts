/**
 * P27: every version stamp, format version and frozen spec cutoff is DEFINED in
 * one file, src/report/versions.ts. Modules that used to define one re-export it
 * (`export { NAME } from "@/report/versions";`), which is allowed; a definition
 * anywhere else in src fails here. Values themselves are pinned elsewhere
 * (tests/report.versionStamps.test.ts); this test only checks where they live.
 * No network, no database.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import * as versions from "@/report/versions";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const ONE_FILE = "src/report/versions.ts";
const MODULE = "@/report/versions";

/** Each stamp or cutoff, and the module that still re-exports it under its old name. */
const KNOWN: Record<string, string | null> = {
  REPORT_SPEC_VERSION: "src/report/schema.ts",
  PAYLOAD_VERSION: "src/pipeline/stageC/payload.ts",
  PIPELINE_VERSION: "src/pipeline/jobRunner.ts",
  EVIDENCE_CONTRACT_VERSION: "src/report/evidenceContract.ts",
  STAGE_B_IMPLEMENTATION_VERSION: "src/pipeline/runInputSnapshot.ts",
  FAIR_VALUE_METHOD_VERSION: "src/pipeline/stageB/fairValue.ts",
  SCENARIO_TARGET_METHOD_VERSION: "src/pipeline/stageB/scenarioTargets.ts",
  SCENARIO_PATHS_METHOD_VERSION: "src/pipeline/stageB/scenarioPaths.ts",
  SCORE_BANDS_VERSION: "src/pipeline/stageB/grading.ts",
  PROJECTION_WEIGHTS_VERSION: "src/pipeline/stageB/projections.ts",
  NET_DEBT_RESOLVER_VERSION: "src/pipeline/stageB/netDebt.ts",
  EVIDENCE_SELECTION_VERSION: "src/pipeline/stageC/evidenceSelection.ts",
  NOTES_RISK_SELECTION_VERSION: "src/pipeline/stageC/evidenceSelection.ts",
  EVENT_SELECTION_VERSION: "src/pipeline/stageC/evidenceSelection.ts",
  GRADE_OVERRIDE_VERSION: "src/pipeline/stageC/gradeContract.ts",
  CURRENT_REPORTS_VERSION: "src/providers/currentReports.ts",
  RUN_INPUT_SNAPSHOT_FORMAT: "src/pipeline/runInputSnapshot.ts",
  PASS_ARTIFACT_ENVELOPE_VERSION: "src/pipeline/jobArtifacts.ts",
  EVALUATION_POLICY_VERSION: "src/report/evaluation.ts",
  FORECAST_ADAPTER_VERSION: "src/report/forecastAdapter.ts",
  PAYLOAD_RECORD_CORRECTION_SPEC: "src/report/legacyPayloadRecordSafety.ts",
  EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION: "src/report/legacyEdgarDerivedLines.ts",
  BRIDGE_METHOD_SINCE_SPEC_VERSION: "src/report/legacyBridgeMethod.ts",
  BRIDGE_READINGS_SINCE_SPEC_VERSION: "src/report/legacyBridgeMethod.ts",
  ANNUALIZATION_CONVENTION_SPEC: "src/report/legacyValuationNotes.ts",
  DCF_INPUTS_CONVENTION_SPEC: "src/report/legacyValuationNotes.ts",
  IMPLIED_RETURN_SHARE_BASIS_SPEC: "src/report/legacyImpliedReturnShareBasis.ts",
  LEGACY_SCOPE_SINCE_SPEC: "src/report/legacyScopeQualifications.ts",
  LEGACY_PLACEHOLDER_DISPLAY_CUTOFF: "src/report/legacyScopeQualifications.ts",
  N4B_CAGR_DISPLAY_CUTOFF: "src/report/cagrPresentation.ts",
  INSIDER_ROLES_READ_FROM: "src/report/claimMatching.ts",
  // Was module-private; its reader imports it directly.
  CORPORATE_ACTION_BRIDGE_WRITING_STAMPS: null,
};

/** Shapes of a stamp or cutoff definition (re-exports never match: they have no `const`). */
const DEFINITION_SHAPES: readonly RegExp[] = [
  // FOO_VERSION, FOO_SINCE_SPEC, FOO_SINCE_SPEC_VERSION
  /\b(?:const|let|var)\s+[A-Z0-9_]*(?:_VERSION|_SINCE_SPEC)\b\s*[:=]/,
  // A named constant holding a bare spec-style literal such as "1.56.0".
  /\b(?:const|let|var)\s+[A-Z0-9_]+\s*(?::[^=]+)?=\s*["'`]\d+\.\d+\.\d+["'`]/,
  // Named cutoffs and format markers holding a literal or a set of literals.
  /\b(?:const|let|var)\s+[A-Z0-9_]*(?:_SPEC|_CUTOFF|_READ_FROM|_STAMPS|_FORMAT)\b\s*(?::[^=]+)?=\s*(?:["'`]|\d|new Set\(\[\s*["'`])/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(?:ts|tsx|mts|cts)$/.test(entry.name) ? [full] : [];
  });
}

const rel = (file: string): string => path.relative(ROOT, file).split(path.sep).join("/");
const read = (file: string): string => readFileSync(path.join(ROOT, file), "utf8");

describe(`version stamps are defined only in ${ONE_FILE} (P27)`, () => {
  it("no stamp or cutoff literal is defined anywhere else in src", () => {
    const known = Object.keys(KNOWN).map((name) => new RegExp(`\\b(?:const|let|var)\\s+${name}\\b`));
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const where = rel(file);
      if (where === ONE_FILE) continue;
      readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
        if ([...DEFINITION_SHAPES, ...known].some((shape) => shape.test(line))) offenders.push(`${where}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(
      offenders,
      `Version stamps and spec cutoffs are defined only in ${ONE_FILE}. Move each definition below into that file ` +
        `(keep its value and history comment) and re-export it from its old module with ` +
        `\`export { NAME } from "${MODULE}";\`:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("defines every known stamp and cutoff, and nothing else", () => {
    expect(Object.keys(versions).sort(), `${ONE_FILE} exports exactly the list in this test; add a new stamp to both`).toEqual(
      Object.keys(KNOWN).sort(),
    );
  });

  it("imports nothing, so readers and the CLI export tool can load it without server-only modules", () => {
    expect(read(ONE_FILE)).not.toMatch(/^\s*import\b|\brequire\(|\bimport\(/m);
  });

  it("is still re-exported under each old module name, so no importer changed", () => {
    for (const [name, home] of Object.entries(KNOWN)) {
      if (home === null) continue;
      expect(read(home), `${home} re-exports ${name}`).toContain(`export { ${name} } from "${MODULE}";`);
    }
  });
});
