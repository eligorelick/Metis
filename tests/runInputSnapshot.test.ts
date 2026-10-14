import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, setDbForTests, type DatabaseHandle } from "@/db";
import { jobs, jobRunInputs, runInputSnapshots } from "@/db/schema";
import * as declaredSchema from "@/db/schema";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { captureRunInputSnapshot, verifyRunInputSnapshot, canonicalSnapshotJson } from "@/pipeline/runInputSnapshot";
import { persistRunInputSnapshot, readRunInputSnapshot, readJobRunSnapshotRef } from "@/pipeline/runInputSnapshotStore";
import { replayRunInputSnapshot } from "@/pipeline/replayRunInput";
import { runStageB } from "@/pipeline/compute";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

let handle: DatabaseHandle;
const capturedAt = "2026-10-13T20:00:00.000Z";
beforeEach(() => {
  handle = createDatabase(":memory:"); setDbForTests(handle.db);
  handle.db.insert(jobs).values({ id: "run-a", symbol: "GEN", status: "done", stepsJson: "[]", createdAt: capturedAt, updatedAt: capturedAt }).run();
  handle.db.insert(jobs).values({ id: "run-b", symbol: "GEN", status: "done", stepsJson: "[]", createdAt: capturedAt, updatedAt: capturedAt }).run();
});
afterEach(() => { setDbForTests(null); handle.sqlite.close(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("immutable normalized run inputs", () => {
  it("keeps the Drizzle composite association key synchronized with bootstrapped SQLite", () => {
    const declared = getTableConfig(jobRunInputs);
    const stored = handle.sqlite.pragma("table_info(job_run_inputs)") as { name: string; pk: number }[];
    expect(declared.primaryKeys[0].columns.map(column => column.name)).toEqual(["jobId", "runGeneration"]);
    expect(stored.filter(column => column.pk > 0).sort((a, b) => a.pk - b.pk).map(column => column.name))
      .toEqual(declared.primaryKeys[0].columns.map(column => column.name));
    const blob = getTableConfig(runInputSnapshots);
    expect(blob.columns.find(column => column.name === "hash")?.primary).toBe(true);
    // Bootstrap has independent SQL DDL; all declared tables must remain usable
    // when new immutable tables and their indexes are introduced.
    for (const table of Object.values(declaredSchema)) {
      const config = getTableConfig(table);
      const sqliteColumns = handle.sqlite.pragma(`table_info("${config.name}")`) as { name: string }[];
      expect(sqliteColumns.map(column => column.name).sort()).toEqual(config.columns.map(column => column.name).sort());
      const declaredReferences = config.foreignKeys.flatMap(foreignKey => {
        const reference = foreignKey.reference();
        return reference.columns.map((column, index) => `${column.name}->${getTableConfig(reference.foreignTable).name}.${reference.foreignColumns[index].name}`);
      }).sort();
      const sqliteReferences = handle.sqlite.pragma(`foreign_key_list("${config.name}")`) as { from: string; table: string; to: string }[];
      expect(sqliteReferences.map(reference => `${reference.from}->${reference.table}.${reference.to}`).sort()).toEqual(declaredReferences);
    }
    expect(handle.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
  it("distinguishes missing snapshots from invalid identities and never writes malformed associations", () => {
    expect(readRunInputSnapshot("a".repeat(64))).toBeNull();
    expect(() => readRunInputSnapshot("invalid-address")).toThrow(/hash/i);
    const snapshot = captureRunInputSnapshot(completeCurrencyBundle({}), { evIncludeLeases: false });
    expect(() => persistRunInputSnapshot("run-a", -1, snapshot, capturedAt)).toThrow(/identity/i);
    expect(() => persistRunInputSnapshot("run-a", Number.MAX_SAFE_INTEGER + 1, snapshot, capturedAt)).toThrow(/identity/i);
    expect(() => persistRunInputSnapshot("run-a", 0, snapshot, "invalid-time")).toThrow(/capture time/i);
    expect(readJobRunSnapshotRef("run-a", 0)).toBeNull();
    expect(handle.db.select().from(runInputSnapshots).all()).toEqual([]);
  });
  it("rejects a valid blob stored under another content address and an orphaned association", () => {
    const first = captureRunInputSnapshot(completeCurrencyBundle({}), { evIncludeLeases: false });
    persistRunInputSnapshot("run-a", 0, first, capturedAt);
    const other = captureRunInputSnapshot(completeCurrencyBundle({ quarterlyRevenue: 350 }), { evIncludeLeases: false });
    handle.sqlite.prepare("UPDATE run_input_snapshots SET snapshotJson = ? WHERE hash = ?").run(canonicalSnapshotJson(other), first.hash);
    expect(() => readRunInputSnapshot(first.hash)).toThrow(/content address/i);
    handle.sqlite.pragma("foreign_keys = OFF");
    handle.sqlite.prepare("INSERT INTO job_run_inputs (jobId,runGeneration,snapshotHash,capturedAt) VALUES (?,?,?,?)").run("run-b", 0, "b".repeat(64), capturedAt);
    expect(() => readJobRunSnapshotRef("run-b", 0)).toThrow(/missing snapshot/i);
  });
  it("rolls back an unassociated blob when the owning job does not exist", () => {
    const snapshot = captureRunInputSnapshot(completeCurrencyBundle({}), { evIncludeLeases: false });
    expect(() => persistRunInputSnapshot("missing-job", 0, snapshot, capturedAt)).toThrow(/foreign key/i);
    expect(handle.db.select().from(runInputSnapshots).all()).toEqual([]);
  });
  it("hashes canonical input objects independent of key insertion order while retaining array order", () => {
    expect(canonicalSnapshotJson({ b: 2, a: { d: 4, c: [3, 1] } })).toBe('{"a":{"c":[3,1],"d":4},"b":2}');
    const bundle = completeCurrencyBundle({});
    const a = captureRunInputSnapshot(bundle, { evIncludeLeases: false });
    const b = captureRunInputSnapshot(Object.fromEntries(Object.entries(bundle).reverse()) as typeof bundle, { evIncludeLeases: false });
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(captureRunInputSnapshot(bundle, { evIncludeLeases: true }).hash).not.toBe(a.hash);
  });
  it("freezes evidence and excludes credentials from normalized inputs and URLs", () => {
    const bundle = completeCurrencyBundle({});
    const raw = bundle as unknown as Record<string, unknown>;
    raw.testEvidence = { excerpt: "Revenue grew 12%.", apiKey: "DO-NOT-STORE", endpoint: "https://data.example/quote?apikey=DO-NOT-STORE&symbol=GEN" };
    const snapshot = captureRunInputSnapshot(bundle, { evIncludeLeases: false });
    raw.testEvidence = { excerpt: "Later restatement" };
    expect(JSON.stringify(snapshot)).not.toContain("DO-NOT-STORE");
    expect(JSON.stringify(snapshot)).toContain("Revenue grew 12%.");
    expect(snapshot.content.redactedFields.length).toBeGreaterThan(0);
    expect(Object.isFrozen(snapshot.content.bundle)).toBe(true);
    expect(verifyRunInputSnapshot(snapshot).hash).toBe(snapshot.hash);
  });
  it("rejects tampering, nonfinite numbers and unsupported snapshot formats", () => {
    const snapshot = captureRunInputSnapshot(completeCurrencyBundle({}), { evIncludeLeases: false });
    const tampered = JSON.parse(JSON.stringify(snapshot)); tampered.content.bundle.symbol = "OTHER";
    expect(() => verifyRunInputSnapshot(tampered)).toThrow(/hash|integrity/i);
    expect(() => canonicalSnapshotJson({ bad: NaN })).toThrow(/finite/i);
    const unsupported = JSON.parse(JSON.stringify(snapshot)); unsupported.content.formatVersion = "RUN_INPUT_SNAPSHOT_999";
    expect(() => verifyRunInputSnapshot(unsupported)).toThrow(/format|version/i);
  });
  it("isolates immutable snapshots by generation and makes identical persistence idempotent", () => {
    const original = captureRunInputSnapshot(completeCurrencyBundle({}), { evIncludeLeases: false });
    const first = persistRunInputSnapshot("run-a", 0, original, capturedAt);
    const same = persistRunInputSnapshot("run-a", 0, original, "2026-10-14T20:00:00.000Z");
    expect(same).toEqual(first);
    const changed = captureRunInputSnapshot(completeCurrencyBundle({ quarterlyRevenue: 350 }), { evIncludeLeases: false });
    expect(() => persistRunInputSnapshot("run-a", 0, changed, capturedAt)).toThrow(/immutable|different/i);
    persistRunInputSnapshot("run-a", 1, changed, capturedAt);
    persistRunInputSnapshot("run-b", 0, original, capturedAt);
    expect(readJobRunSnapshotRef("run-a", 0)?.hash).toBe(original.hash);
    expect(readJobRunSnapshotRef("run-a", 1)?.hash).toBe(changed.hash);
    expect(readJobRunSnapshotRef("run-b", 0)?.hash).toBe(original.hash);
    expect(readRunInputSnapshot(original.hash)?.content.bundle.builtAt).toBe("2026-07-06T00:00:00.000Z");
  });
  it("rejects corrupted stored content instead of overwriting the content-addressed blob", () => {
    const snapshot = captureRunInputSnapshot(completeCurrencyBundle({}), { evIncludeLeases: false });
    persistRunInputSnapshot("run-a", 0, snapshot, capturedAt);
    handle.sqlite.prepare('UPDATE run_input_snapshots SET snapshotJson = ? WHERE hash = ?').run('{}', snapshot.hash);
    expect(() => readRunInputSnapshot(snapshot.hash)).toThrow(/snapshot|integrity/i);
    expect(() => persistRunInputSnapshot("run-b", 0, snapshot, capturedAt)).toThrow(/snapshot|integrity/i);
  });
  it("replays solely from saved inputs despite cache, clock, network and current config changes", async () => {
    const bundle = completeCurrencyBundle({});
    for (const statements of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (statements.ok) for (const row of statements.value.data.rows) {
        row.operatingLeaseLiability = 50_000_000;
        row.capitalLeaseObligations = 60_000_000;
      }
    }
    const snapshot = captureRunInputSnapshot(bundle, { evIncludeLeases: true });
    const expected = runStageB(bundle, { evIncludeLeases: true });
    expect(expected.valuation).not.toEqual(runStageB(bundle, { evIncludeLeases: false }).valuation);
    persistRunInputSnapshot("run-a", 0, snapshot, capturedAt);
    handle.sqlite.exec('DELETE FROM api_cache');
    vi.stubEnv("THESIS_EV_INCLUDE_LEASES", "false");
    vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("network forbidden during replay"); });
    vi.useFakeTimers(); vi.setSystemTime(new Date("2035-01-01"));
    try {
      const replay = replayRunInputSnapshot(readRunInputSnapshot(snapshot.hash)!);
      expect(replay.computed).toEqual(expected);
      expect(replay.snapshotHash).toBe(snapshot.hash);
      expect(replay.offline).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it("refuses replay under a different calculation implementation version", () => {
    const snapshot = captureRunInputSnapshot(completeCurrencyBundle({}), { evIncludeLeases: false }, { stageB: "old-calculation", reportSpec: "1.11.0", scoreBands: "old" });
    expect(() => replayRunInputSnapshot(snapshot)).toThrow(/version|implementation/i);
  });
  it("executes the offline replay CLI from an exported snapshot without provider access", () => {
    const dir = mkdtempSync(join(tmpdir(), "thesis-input-replay-"));
    try {
      const input = join(dir, "snapshot.json"), output = join(dir, "replayed.json");
      const snapshot = captureRunInputSnapshot(completeCurrencyBundle({}), { evIncludeLeases: false });
      writeFileSync(input, canonicalSnapshotJson(snapshot));
      const child = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/replay-run-inputs.ts", "--snapshot", input, "--output", output], { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
      expect(child.status, child.error?.message ?? "offline CLI exited unsuccessfully").toBe(0);
      const replay = JSON.parse(readFileSync(output, "utf8"));
      expect(replay.offline).toBe(true);
      expect(replay.snapshotHash).toBe(snapshot.hash);
      expect(replay.computed.symbol).toBe(snapshot.content.bundle.symbol);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
