import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSectionCheckpoint } from "@/pipeline/stageC/sectionCheckpoint";
import { parsePassArtifactEnvelope, serializePassFailure } from "@/pipeline/jobArtifacts";

const directories: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
describe("durable section checkpoints", () => {
  it("round-trips bounded recovery text through a durable failure artifact", () => {
    const failure = serializePassFailure(new Error("cut off"), { kind: "transport", partialText: '{"verdict":{"synthesis":"saved"}}' });
    const envelope = { artifactVersion: 1, outcome: "failure", failure, payloadFingerprint: "v1:evidence" };
    expect(parsePassArtifactEnvelope("synthesize", JSON.stringify(envelope))).toEqual(envelope);
    expect(() => parsePassArtifactEnvelope("synthesize", { ...envelope, failure: { ...failure, partialText: "x".repeat(1_000_001) } })).toThrow("invalid failure");
  });
  it("survives a new worker and isolates jobs, evidence, models and fields", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metis-sections-")); directories.push(dir);
    const one = createSectionCheckpoint("job-1/evidence-1/model-1", dir);
    one.save("llm.judge", { verdict: { synthesis: "keep me" } });
    expect(createSectionCheckpoint("job-1/evidence-1/model-1", dir).load("llm.judge")).toEqual({ verdict: { synthesis: "keep me" } });
    expect(one.load("llm.bull")).toEqual({});
    expect(createSectionCheckpoint("job-1/evidence-2/model-1", dir).load("llm.judge")).toEqual({});
    expect(createSectionCheckpoint("job-2/evidence-1/model-1", dir).load("llm.judge")).toEqual({});
    expect(createSectionCheckpoint("job-1/evidence-1/model-2", dir).load("llm.judge")).toEqual({});
    fs.writeFileSync(path.join(dir, fs.readdirSync(dir)[0]!), "truncated");
    expect(one.load("llm.judge")).toEqual({});
  });
  it("preserves request usage separately from reusable text without rebilling it on recovery", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metis-sections-")); directories.push(dir);
    const checkpoint = createSectionCheckpoint("identity", dir);
    checkpoint.record("llm.judge:request", { model: "chatgpt/example", usage: { input_tokens: 123, output_tokens: 45 } });
    checkpoint.record("llm.judge:request", { usage: { input_tokens: 7, output_tokens: 3 } }, { jobId: "job-1", attemptId: "attempt-1", runGeneration: 0 });
    checkpoint.save("llm.judge:request", { verdict: {} });
    checkpoint.save("llm.judge:request", { verdict: {}, business: {} });
    const usage = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((file) => file.endsWith(".usage.jsonl"))!), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(usage).toHaveLength(2);
    expect(usage[0]).toMatchObject({ owner: null, telemetry: { usage: { input_tokens: 123, output_tokens: 45 } } });
    expect(usage[1]).toMatchObject({ owner: { jobId: "job-1", attemptId: "attempt-1", runGeneration: 0 } });
    expect(createSectionCheckpoint("identity", dir).load("llm.judge:request")).toEqual({ verdict: {}, business: {} });
    expect(fs.readdirSync(dir).some((file) => file.endsWith(".tmp"))).toBe(false);
  });
  // D-116: a section kept for a retry keeps the evidence of the request that
  // wrote it, so the retry can still say which model wrote the whole pass.
  it("keeps the evidence of the request that wrote each section beside it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metis-sections-")); directories.push(dir);
    const checkpoint = createSectionCheckpoint("identity", dir);
    const verdict = { digest: "a".repeat(64), model: "chatgpt/gpt-6.1-sol",
      execution: { requestedModel: "chatgpt/gpt-6.1-sol", modelObserved: true, usageReported: false, effectiveEffort: "max" as const, effectiveServiceTier: null } };
    // Evidence for a section the checkpoint does not hold is not saved.
    checkpoint.save("llm.judge:request", { verdict: { synthesis: "s" }, business: {} }, { verdict, macro: { digest: "b".repeat(64) } });
    const reopened = createSectionCheckpoint("identity", dir);
    expect(reopened.load("llm.judge:request")).toEqual({ verdict: { synthesis: "s" }, business: {} });
    expect(reopened.loadEvidence("llm.judge:request")).toEqual({ verdict });
    // A checkpoint saved without evidence, as before D-116, has none.
    checkpoint.save("llm.bull:request", { thesis: [] });
    expect(reopened.loadEvidence("llm.bull:request")).toEqual({});
    expect(reopened.loadEvidence("llm.bear:request")).toEqual({});
    // An unreadable entry is dropped on its own; its section is still reused.
    const file = path.join(dir, fs.readdirSync(dir).find((name) => name.endsWith(".json") && JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")).field === "llm.judge:request")!);
    const envelope = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, JSON.stringify({ ...envelope, evidence: { verdict: { ...verdict, digest: "short" }, business: { digest: "c".repeat(64), execution: { invented: true } } } }));
    expect(reopened.loadEvidence("llm.judge:request")).toEqual({});
    expect(reopened.load("llm.judge:request")).toEqual({ verdict: { synthesis: "s" }, business: {} });
    fs.writeFileSync(file, JSON.stringify({ ...envelope, evidence: [] }));
    expect(reopened.loadEvidence("llm.judge:request")).toEqual({});
  });
  it("rejects corrupted, oversized and mismatched snapshots", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metis-sections-")); directories.push(dir);
    const checkpoint = createSectionCheckpoint("identity", dir);
    checkpoint.save("llm.bull", { thesis: [] }, { thesis: { digest: "d".repeat(64) } });
    const file = path.join(dir, fs.readdirSync(dir)[0]!);
    const envelope = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const change of [{ version: 2 }, { identity: "other" }, { field: "llm.bear" }, { completed: [] }, { completed: null }]) {
      fs.writeFileSync(file, JSON.stringify({ ...envelope, ...change }));
      expect(checkpoint.load("llm.bull")).toEqual({});
      expect(checkpoint.loadEvidence("llm.bull")).toEqual({});
    }
    fs.writeFileSync(file, "x".repeat(4_000_001));
    expect(checkpoint.load("llm.bull")).toEqual({});
    expect(() => checkpoint.save("llm.bull", { thesis: "x".repeat(4_000_001) })).toThrow("could not save");
  });
  it("stops on storage errors and cleans up failed atomic writes", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metis-sections-")); directories.push(dir);
    const checkpoint = createSectionCheckpoint("identity", dir);
    vi.spyOn(fs, "renameSync").mockImplementation(() => { throw new Error("disk failure"); });
    expect(() => checkpoint.save("llm.bull", { thesis: [] })).toThrow("could not save section recovery");
    expect(fs.readdirSync(dir)).toEqual([]);
    vi.spyOn(fs, "appendFileSync").mockImplementation(() => { throw new Error("disk failure"); });
    expect(() => checkpoint.record("llm.bull:request", {})).toThrow("could not save section usage");
  });
});
