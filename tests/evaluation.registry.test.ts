import { createHash } from "node:crypto";
import fs from "node:fs";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileEvaluationRegistryStore, registerForecast } from "@/evaluation/registry";
import { sourceManifestHash } from "@/evaluation/artifactManifest";
import { canonicalSnapshotJson } from "@/pipeline/runInputSnapshot";

const sha = (content: string) => createHash("sha256").update(content).digest("hex");
const artifact = (kind: "source" | "input" | "report" | "method" | "dependency_lock", content: string) => ({ kind, content, hash: sha(content) });
const artifacts = [artifact("source", "initial source bytes"), artifact("input", "frozen input bytes"), artifact("report", "frozen report bytes"), artifact("method", "actual method bytes"), artifact("dependency_lock", "actual dependency lock")];
const target = { schemaVersion: 2 as const, targetId: "revenue-2025", issuerId: "TEST", securityId: "issuer-level", metric: "revenue", accountingBasis: "GAAP", currency: "USD", unit: "USD", shareBasis: "not_per_share", corporateActionBasis: "unadjusted", periodStart: "2025-01-01", periodEnd: "2025-12-31", horizonMonths: 12, forecastKind: "forecast" as const, createdAt: "2024-12-01", methodArtifactHash: artifacts[3].hash };
const manifest = { registrationId: "job:0:revenue-2025", inputHash: artifacts[1].hash, reportHash: artifacts[2].hash, targetHash: sha(canonicalSnapshotJson(target)), sourceManifestHash: sha(canonicalSnapshotJson([{ hash: artifacts[0].hash, kind: "source" }])), methodArtifactHash: target.methodArtifactHash, dependencyLockHash: artifacts[4].hash, codeCommit: null, dirtyDiffHash: null, pipelineVersion: "pipeline-v1", promptHash: null, modelVersion: null, acquiredAt: "2024-11-30", createdAt: target.createdAt, frozenAt: "2024-12-01" };
const dirs: string[] = [];
function store() { const dir = mkdtempSync(join(tmpdir(), "thesis-registry-")); dirs.push(dir); const file = join(dir, "registry.jsonl"); return { file, registry: new FileEvaluationRegistryStore(file) }; }
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("local append-only forecast registry", () => {
  it("surfaces non-contention filesystem errors immediately without retries or writes", async () => {
    vi.useFakeTimers();
    const {registry,file}=store();
    const denied=Object.assign(new Error('access denied'),{code:'EACCES'});
    vi.spyOn(fs,'openSync').mockImplementationOnce(()=>{throw denied;});
    await expect(registerForecast(manifest,target,registry,artifacts)).rejects.toBe(denied);
    expect(vi.getTimerCount()).toBe(0);
    expect(existsSync(file)).toBe(false);
    expect(existsSync(`${file}.lock`)).toBe(false);
  });
  it("serializes registrations behind an externally held lock without losing either record", async () => {
    vi.useFakeTimers();
    const {registry,file}=store();
    writeFileSync(`${file}.lock`, "another writer owns this lock");
    const first=registerForecast(manifest,target,registry,artifacts);
    const second=registerForecast({...manifest,registrationId:'job:1:revenue-2025'},target,new FileEvaluationRegistryStore(file),artifacts);
    const settled=Promise.all([first,second]);
    void settled.catch(()=>undefined);
    await vi.advanceTimersByTimeAsync(50);
    expect(existsSync(file)).toBe(false);
    unlinkSync(`${file}.lock`);
    await vi.advanceTimersByTimeAsync(50);
    const receipts=await settled;
    expect(receipts.map(r=>r.sequence).sort()).toEqual([1,2]);
    expect((await registry.list()).map(r=>r.receipt.id).sort()).toEqual([manifest.registrationId,'job:1:revenue-2025'].sort());
    expect(existsSync(`${file}.lock`)).toBe(false);
  });
  it("times out on an unreleased or stale lock while preserving the owner and registry bytes", async () => {
    vi.useFakeTimers();
    const {registry,file}=store();
    await registerForecast(manifest,target,registry,artifacts);
    const before=readFileSync(file,'utf8');
    writeFileSync(`${file}.lock`, 'unresolved owner');
    const pending=registerForecast({...manifest,registrationId:'job:1:revenue-2025'},target,registry,artifacts);
    const rejection=expect(pending).rejects.toThrow(/registry lock.*timed out.*active or stale/i);
    void rejection.catch(()=>undefined);
    await vi.advanceTimersByTimeAsync(5_100);
    await rejection;
    expect(readFileSync(file,'utf8')).toBe(before);
    expect(readFileSync(`${file}.lock`,'utf8')).toBe('unresolved owner');
  });
  it("binds every retained source independently of acquisition order and rejects an omitted source", async () => {
    const extra = artifact("source", "independent second filing bytes");
    const multiple = [...artifacts, extra];
    const sourceHash = sourceManifestHash(multiple);
    expect(sourceHash).toBe(sourceManifestHash([...multiple].reverse()));
    expect(sourceHash).not.toBe(manifest.sourceManifestHash);
    const complete = {...manifest, sourceManifestHash:sourceHash};
    const {registry}=store();
    await registerForecast(complete,target,registry,multiple);
    expect((await registry.read(manifest.registrationId))?.artifacts.filter(a=>a.kind==='source')).toHaveLength(2);
    await expect(registerForecast({...complete,registrationId:'missing-source'},target,registry,artifacts)).rejects.toThrow(/Source manifest identity/);
    expect(await registry.list()).toHaveLength(1);
  });
  it("records actual local append time and never promotes forged past metadata into a trusted timestamp", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const { registry } = store();
    const receipt = await registerForecast(manifest, target, registry, artifacts);
    expect(receipt).toMatchObject({ id: manifest.registrationId, sequence: 1, recordedAt: "2026-10-14T12:00:00.000Z", custodyStatus: "local-append-only" });
    expect(receipt.recordHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("makes an immutable retry idempotent, preserves the complete registered denominator, and separates new generations", async () => {
    const { registry } = store();
    const first = await registerForecast(manifest, target, registry, artifacts);
    expect(await registerForecast(manifest, target, registry, artifacts)).toEqual(first);
    expect(await registerForecast({ ...manifest, registrationId: "job:1:revenue-2025" }, target, registry, artifacts)).toMatchObject({ sequence: 2 });
    expect((await registry.list()).map(r => r.target.issuerId)).toEqual(["TEST", "TEST"]);
    expect((await registry.read(manifest.registrationId))?.target).toEqual(target);
  });
  it.each(["inputHash", "reportHash", "methodArtifactHash", "dependencyLockHash", "sourceManifestHash", "targetHash"] as const)("rejects an unbound or changed %s", async (field) => {
    const { registry } = store();
    await expect(registerForecast({ ...manifest, [field]: "b".repeat(64) }, target, registry, artifacts)).rejects.toThrow(/bound|identity|hash|artifact/i);
    expect(await registry.list()).toEqual([]);
  });
  it("rejects changed target metadata or retained source bytes rather than replacing the registered target", async () => {
    const { registry, file } = store();
    await registerForecast(manifest, target, registry, artifacts);
    const bytes = readFileSync(file, "utf8");
    await expect(registerForecast(manifest, { ...target, metric: "netIncome" }, registry, artifacts)).rejects.toThrow(/target|identity|hash/i);
    await expect(registerForecast(manifest, target, registry, [{ ...artifacts[0], content: "changed source" }, ...artifacts.slice(1)])).rejects.toThrow(/source|bound|artifact/i);
    expect(readFileSync(file, "utf8")).toBe(bytes);
  });
  it("detects mutation and a truncated registry entry on read", async () => {
    const { registry, file } = store();
    await registerForecast(manifest, target, registry, artifacts);
    const bytes = readFileSync(file, "utf8");
    writeFileSync(file, bytes.replace("initial source bytes", "changed source bytes"));
    await expect(registry.read(manifest.registrationId)).rejects.toThrow(/integrity|artifact|bound/i);
    writeFileSync(file, bytes.slice(0, -20));
    await expect(registry.list()).rejects.toThrow(/registry|entry|JSON/i);
  });
});
