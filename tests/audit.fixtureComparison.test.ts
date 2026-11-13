/**
 * Provider-free DEMO fixture comparison (P27 change control).
 *
 * Today's projection of the offline DEMO fixture (Stage B and the assembled
 * report, as `tests/helpers/auditFixtureComparison.ts` projects them) is
 * pinned leaf by leaf to `tests/fixtures/frozen/audit-fixture-current.json`.
 * An intended change is recorded with `npm run freeze:refresh -- --target
 * audit-fixture --decision D-nnn --scope '<leaf paths>' --reason '<why>'`
 * (docs/OPERATIONS.md), which appends to `tests/fixtures/frozen/refresh-log.json`.
 *
 * Until D-232 this file also replayed the July 2026 audited baseline (commit
 * 524d09e) plus a 1,285-leaf intended-delta ledger to reach the same
 * projection. That history is reachable in git; the last proof that
 * "baseline + ledger == frozen record" ran on c3deae0b. The checks below that
 * the frozen record cannot hold (the dependency tree, the generator's own
 * bytes and its JSON-safety guard) are kept as direct checks on today's tree.
 *
 * `COMPARISON_PACKAGE_LOCK_BLOB` pins the dependency tree this projection is
 * reproduced against, so a dependency change must be a reviewed edit rather
 * than a silent drift. It was rolled forward once, on 2026-09-01, for the
 * `browserslist` >=4.28.8 security override (GHSA-c83g-rgw3-j3cx /
 * GHSA-73wf-gq98-2v4g). That bump touches only a dev-time lint transitive
 * dependency: this test recomputes the projection from current source and
 * fixtures on every run, and it still matched the audited baseline byte for
 * byte afterwards, which is the evidence that the tree change altered no
 * pipeline output. Rolled forward a second time on 2026-09-01 when the lock
 * regained the `@emnapi/*` entries that npm on Windows had pruned (the reason
 * every CI `npm ci` failed); no package version changed and the projection
 * again matched the baseline byte for byte. Rolled forward a third time on
 * 2026-09-28 for the security bump out of published advisory ranges (next and
 * eslint-config-next 16.3.6, sharp 0.35.5, js-yaml 4.3.2, vitest 4.1.11);
 * the projection was re-run against the new tree under Node 24 before the pin
 * moved. Rolled forward a fourth time on 2026-09-30 for brace-expansion
 * 1.1.18 -> 1.1.21 and 5.0.9 -> 5.0.12 (GHSA-q2hr-2g5m-vwhr,
 * GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p), both within their minimatch
 * parents' ranges (^1.1.7, ^5.0.5); only those two lock entries changed, and
 * the projection was re-run against the new tree under Node 24 before the pin
 * moved. Roll the pin forward again only with the same evidence: since
 * D-232 that evidence is the frozen-record pin below passing on the new tree.
 * The Metis rebrand and license transition keep this historical pin: two
 * guarded package-name fields and the first-party license field are restored
 * to historical values before hashing. Dependency/version/integrity/license
 * bytes and historical evidence remain pinned.
 * Rolled forward a fifth time on 2026-11-12 (D-230) when the two lint
 * workaround packages, scripts/next-eslint-glob and scripts/legacy-minimatch,
 * were removed: their two first-party lock entries went, ESLint went back to
 * upstream fast-glob 3.3.1 and minimatch 3.1.5, and nothing outside lint
 * tooling changed. The previous pin, 76cc4d445212431bd8f10eab94eb8bc464a6945d,
 * was reached through the D-138 Task 12 exact-byte inverse of the lint
 * minimatch change; that inverse described only the removed package's lock
 * entries, so it went with them. The projection below is recomputed from
 * current source and fixtures on every run and still matched the audited
 * baseline byte for byte under Node 24 before the pin moved.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { assertFrozenLog, expectFrozenRecord, readFrozenLog, readFrozenRecord, type FrozenJson } from "./helpers/frozenRecord";

import { type AuditJsonValue, canonicalJson } from "./helpers/jsonLeafPaths";

type JsonValue = AuditJsonValue;

const ROOT = process.cwd();
const FMP_FIXTURE_ROOT = path.join(ROOT, "fixtures", "fmp");
const REPORT_FIXTURE = path.join(ROOT, "fixtures", "report", "DEMO-sample.json");
const GENERATOR_PATH = path.join(ROOT, "tests", "helpers", "auditFixtureComparison.ts");
const AUDITED_FMP_TREE_SHA256 =
  "2d4278a6d73453ea372bf655f299e9b8709b627098214ce5d0d3c2190aa3c7d9";
const AUDITED_REPORT_SHA256 =
  "e98dbece14978fa5662db016e002ab5b4706b24ac0cf5bbe0408c9f17c969c88";
/**
 * The generator's own bytes, last re-pinned by the 2026-09-06 audit (F206).
 * A change to how the projection is built must be a reviewed edit of this
 * pin, even when the projection happens not to move.
 */
const GENERATOR_SHA256 = "48af864a1d2a5bb165eb2832871bc2651f34a5951959450d2074512e4a7a26d7";
/**
 * The dependency tree the projection is reproduced against, as the git blob
 * of package-lock.json after the three-field metadata restore in
 * `comparisonLockBlob` (D-230 removed the Task 12 lock inverse that used to
 * run first, with the lint workaround packages). Its roll-forward history is in
 * the header comment and in the comments beside the pin below.
 */
const COMPARISON_PACKAGE_LOCK_BLOB = "6d6c85343416e7692da93c5e2c2769e87e04c8fd";


const PROVIDER_ENV_KEYS = [
  "FMP_API_KEY",
  "FINNHUB_API_KEY",
  "FRED_API_KEY",
  "ANTHROPIC_API_KEY",
  "EDGAR_CONTACT",
] as const;

function generatorChildEnv(): NodeJS.ProcessEnv {
  const controlled = new Set([
    ...PROVIDER_ENV_KEYS.map((key) => key.toLowerCase()),
    "audit_fixture_emit",
    "audit_fixture_output",
    "node_options",
    "node_path",
  ]);
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (controlled.has(key.toLowerCase())) delete env[key];
  }
  env.AUDIT_FIXTURE_EMIT = "1";
  env.NODE_OPTIONS = "--conditions=react-server";
  env.NODE_PATH = path.join(ROOT, "node_modules");
  return env;
}

function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function fixtureTreeSha256(root: string): string {
  const visit = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const absolute = path.join(dir, entry.name);
      return entry.isDirectory() ? visit(absolute) : [absolute];
    });
  const files = visit(root)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.relative(root, file).replaceAll("\\", "/"))
    .sort();
  const hash = createHash("sha256");
  for (const relative of files) {
    hash.update(relative);
    hash.update("\0");
    hash.update(readFileSync(path.join(root, ...relative.split("/"))));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** Restore exactly the authorized first-party metadata, never dependency fields. */
function comparisonLockBlob(source: string): string {
  const lock = JSON.parse(source) as {
    name: string;
    packages: Record<string, { name?: string; license?: string }>;
  };
  if (lock.name !== "metis" || lock.packages[""]?.name !== "metis") {
    throw new Error("unexpected canonical package-lock branding metadata");
  }
  if (lock.packages[""]?.license !== "SEE LICENSE IN LICENSE") {
    throw new Error("unexpected canonical package-lock first-party license metadata");
  }
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const serialize = () => JSON.stringify(lock, null, 2).replaceAll("\n", newline) + newline;
  // Prove parsing/stringifying loses or normalizes no bytes before editing
  // the three explicit field paths; arbitrary formatting drift stays rejected.
  if (serialize() !== source) throw new Error("package-lock formatting drift");
  lock.name = "thesis";
  lock.packages[""].name = "thesis";
  // Historical comparison metadata only; current license terms stay in LICENSE.
  lock.packages[""].license = "MIT";
  return execFileSync("git", ["hash-object", "--stdin", "--path=package-lock.json"], {
    cwd: ROOT,
    encoding: "utf8",
    input: serialize(),
  }).trim();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DEMO fixture comparison: dependency tree, generator identity and JSON guard (P27)", () => {
  it("keeps dependency versions, integrity and licenses pinned through the metadata compatibility check", () => {
    const source = readFileSync(path.join(ROOT, "package-lock.json"), "utf8");
    const expected = COMPARISON_PACKAGE_LOCK_BLOB;
    for (const field of ["version", "integrity", "license"] as const) {
      const changed = JSON.parse(source);
      expect(typeof changed.packages["node_modules/next"][field]).toBe("string");
      changed.packages["node_modules/next"][field] += "-tampered";
      expect(comparisonLockBlob(JSON.stringify(changed, null, 2) + "\n")).not.toBe(expected);
    }
    const unexpectedBrand = JSON.parse(source);
    unexpectedBrand.packages[""].name = "other";
    expect(() => comparisonLockBlob(JSON.stringify(unexpectedBrand, null, 2) + "\n")).toThrow(
      /unexpected canonical package-lock branding/,
    );
    const unexpectedLicense = JSON.parse(source);
    unexpectedLicense.packages[""].license = "unexpected";
    expect(() => comparisonLockBlob(JSON.stringify(unexpectedLicense, null, 2) + "\n")).toThrow(
      /unexpected canonical package-lock first-party license/,
    );
    expect(() => comparisonLockBlob(source + " ")).toThrow(/formatting drift/);
  });

  it("pins the dependency tree and the generator bytes the frozen projection is reproduced against", () => {
    // Lock-pin roll-forward notes, kept from the retired baseline check:
    // 2026-10-22: root engines.node >=22.18.0 -> >=24 (security audit F-10); no
    // package entry changed, so the Stage B replay runs on the same tree.
    // 2026-10-22: vitest and @vitest/coverage-v8 4.1.11 -> 4.1.12 for GHSA-qxg6-89mg-rqv8 and
    // GHSA-xp26-3454-mjgp; test-runner tooling only, outside the Stage B replay.
    // 2026-10-22: next, @next/env and eslint-config-next 16.3.8 -> 16.4.2 for
    // GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r; the web framework is outside the Stage B replay.
    // 2026-10-20: vite pinned to 8.3.3 for the launch-editor advisories;
    // vite is the test runner's dev tool and is outside the Stage B replay.
    // 2026-10-17: direct esbuild pin already resolved at 0.28.1 freezes
    // Stage B replay; only root dev metadata changed in the lock.
    // 2026-10-15: happy-dom is dev-only for credential UI interaction tests.
    // Reproduced the comparison with no additional financial deltas;
    // historical source/fixture hashes and projection remain pinned.
    // 2026-10-25: happy-dom 21.0.4 and zod 4.6.6 security patches.
    // Exact financial delta contract replayed unchanged before this pin moved.
    // 2026-11-12 (D-230): lint workaround packages removed; was
    // 76cc4d445212431bd8f10eab94eb8bc464a6945d via the Task 12 inverse.
    expect(
      comparisonLockBlob(readFileSync(path.join(ROOT, "package-lock.json"), "utf8")),
    ).toBe(COMPARISON_PACKAGE_LOCK_BLOB);
    expect(sha256File(GENERATOR_PATH)).toBe(GENERATOR_SHA256);
  });

  it("refuses non-JSON values in the projection guard, naming the offending path", async () => {
    for (const key of PROVIDER_ENV_KEYS) vi.stubEnv(key, "");
    vi.stubEnv("AUDIT_FIXTURE_EMIT", "");
    vi.stubEnv("AUDIT_FIXTURE_OUTPUT", "");
    const { assertAuditJsonSafe } = await import("./helpers/auditFixtureComparison");
    expect(() => assertAuditJsonSafe({ invalid: Number.NaN })).toThrow(
      /non-finite number.*invalid/,
    );
    expect(() => assertAuditJsonSafe({ invalid: undefined })).toThrow(
      /non-JSON undefined.*invalid/,
    );
    expect(() => assertAuditJsonSafe({ invalid: new Date(0) })).toThrow(
      /non-plain object.*invalid/,
    );
    expect(() => assertAuditJsonSafe({ invalid: new Map([["value", 1]]) })).toThrow(
      /non-plain object.*invalid/,
    );
    const decoratedArray = [1];
    Object.assign(decoratedArray, { extra: 2 });
    expect(() => assertAuditJsonSafe({ invalid: decoratedArray })).toThrow(
      /non-canonical array property.*invalid/,
    );
  });
});

// P27 freeze (round 2, S4.7a): today's provider-free DEMO projection (Stage B
// and the assembled report as the generator projects them), as a committed
// record. Fixture identities stay checked here, and the generator's own
// integrity (in-process repeat, isolated child process, and the JSON-safety
// guard above) stays independent of the record. Refresh only through
// `npm run freeze:refresh` (docs/OPERATIONS.md).
function auditFrozenRecord(projection: JsonValue): FrozenJson {
  return {
    fixture: "fixtures/fmp + fixtures/report/DEMO-sample.json via tests/helpers/auditFixtureComparison.ts (no restore step)",
    fixtureIdentity: { fmpTreeSha256: fixtureTreeSha256(FMP_FIXTURE_ROOT), reportSha256: sha256File(REPORT_FIXTURE) },
    projectionSha256: createHash("sha256").update(canonicalJson(projection)).digest("hex"),
    projection,
  };
}

describe("frozen current DEMO fixture projection (P27)", () => {
  it("pins today's projection to the frozen record in-process and in an isolated child process", async () => {
    expect(fixtureTreeSha256(FMP_FIXTURE_ROOT)).toBe(AUDITED_FMP_TREE_SHA256);
    expect(sha256File(REPORT_FIXTURE)).toBe(AUDITED_REPORT_SHA256);
    for (const key of PROVIDER_ENV_KEYS) vi.stubEnv(key, "");
    vi.stubEnv("AUDIT_FIXTURE_EMIT", "");
    vi.stubEnv("AUDIT_FIXTURE_OUTPUT", "");
    const { buildAuditFixtureComparison } = await import("./helpers/auditFixtureComparison");
    const result = await buildAuditFixtureComparison({ fmpFixtures: FMP_FIXTURE_ROOT, reportFixture: REPORT_FIXTURE });
    expect(result.repeatedProjection).toEqual(result.projection);
    expect(result.calls).toEqual({
      globalFetch: 0, fmpLiveFetch: 0, finnhubLiveFetch: 0, finraGapTransport: 0, edgarGapTransport: 0, fredGap: 0,
    });
    expectFrozenRecord("audit-fixture", auditFrozenRecord(result.projection));
    const emitted = execFileSync(
      process.execPath,
      [path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), "-"],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: generatorChildEnv(),
        input: readFileSync(GENERATOR_PATH, "utf8"),
        maxBuffer: 4 * 1024 * 1024,
        timeout: 20_000,
      },
    );
    expectFrozenRecord("audit-fixture", auditFrozenRecord(JSON.parse(emitted) as JsonValue));
  }, 30_000);

  it("keeps the refresh log bound to both committed frozen records", () => {
    assertFrozenLog(readFrozenLog(), {
      "audit-fixture": readFrozenRecord("audit-fixture"),
      "stagec-payload": readFrozenRecord("stagec-payload"),
    });
  });
});
