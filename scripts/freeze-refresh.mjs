/**
 * Deliberately re-record one current-value frozen record (P27 change control).
 *
 *   npm run freeze:refresh -- --target stagec-payload --decision D-123 \
 *     --scope '$.finance.valuation,$.payload.computed' --reason "<why these leaves changed>"
 *
 * Targets: `stagec-payload` (tests/fixtures/frozen/stagec-payload-current.json)
 * and `audit-fixture` (tests/fixtures/frozen/audit-fixture-current.json).
 *
 * The record is rebuilt by the test that pins it, so the bytes written are the
 * bytes the test compares. This script only runs that one test with the
 * `FROZEN_RECORD_*` variables set; a normal `npm test` / `npm run verify` never
 * sets them, and the refresh refuses to run under CI. The test helper
 * (`tests/helpers/frozenRecord.ts`) then refuses the refresh unless:
 *   - the decision is a decision-log id (D-nnn),
 *   - the reason is at least 60 characters and not a placeholder,
 *   - `--scope` names the changed leaf paths (path prefixes such as
 *     `$.finance.scores`), never the whole record, and every leaf that
 *     actually changed lies inside that scope.
 * It appends {date, target, decision, reason, scope, before/after sha256,
 * changed paths} to tests/fixtures/frozen/refresh-log.json. Review the record
 * diff and the log entry together, and record the decision in
 * docs/audit/DECISIONS.md. Re-recording is not evidence that a change is right.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isEntryPoint } from "./lib/entrypoint.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

export const FREEZE_TARGETS = {
  "stagec-payload": {
    file: "tests/stageC.payload.passes.test.ts",
    test: "pins today's un-restored Stage C payload, registries, finance and periods to the frozen record",
  },
  "audit-fixture": {
    file: "tests/audit.fixtureComparison.test.ts",
    test: "pins today's projection to the frozen record in-process and in an isolated child process",
  },
};

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

/**
 * Parse and pre-check the request; the test helper re-checks everything against the record.
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} [env]
 */
export function parseFreezeArgs(argv, env = process.env) {
  if ((env.CI ?? "") !== "") throw new Error("freeze:refresh never runs in CI");
  const target = option(argv, "--target");
  const decision = option(argv, "--decision");
  const reason = option(argv, "--reason");
  const scope = option(argv, "--scope");
  if (!target || !(target in FREEZE_TARGETS)) {
    throw new Error(`--target must be one of ${Object.keys(FREEZE_TARGETS).join(", ")}`);
  }
  if (!decision || !/^(D-\d{2,4}|initial-freeze)$/.test(decision)) throw new Error("--decision D-nnn is required");
  if (!reason || reason.trim().length < 60) throw new Error("--reason of at least 60 characters is required");
  if (!scope || scope.trim() === "") throw new Error("--scope <leaf path prefixes, comma separated> is required");
  return { target, decision, reason: reason.trim(), scope: scope.trim() };
}

function main(argv) {
  const { target, decision, reason, scope } = parseFreezeArgs(argv);
  const { file, test } = FREEZE_TARGETS[target];
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, "node_modules", "vitest", "vitest.mjs"), "run", "--config", "vitest.config.ts", file, "-t", test],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        FROZEN_RECORD_REFRESH: target,
        FROZEN_RECORD_DECISION: decision,
        FROZEN_RECORD_REASON: reason,
        FROZEN_RECORD_SCOPE: scope,
      },
    },
  );
  if (result.status === 0) {
    console.log(`freeze:refresh — ${target} re-recorded under ${decision}; review the record diff and tests/fixtures/frozen/refresh-log.json`);
  }
  return result.status ?? 1;
}

if (isEntryPoint(import.meta.url)) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
