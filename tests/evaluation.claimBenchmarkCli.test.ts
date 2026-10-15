import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashClaimCorpus } from "../src/evaluation/claimBenchmark";
import { runClaimBenchmarkCli } from "../src/evaluation/claimBenchmarkCli";
const dirs: string[] = [];
function temp() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claim-benchmark-")); dirs.push(dir); return dir; }
afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
describe("claim benchmark CLI", () => {
  it("prints strict versioned schemas without writing files and runs actual script entrypoint", () => {
    let stdout = ""; runClaimBenchmarkCli(["schema"], { writeStdout: text => { stdout += text; } });
    expect(JSON.parse(stdout).corpus.properties.schemaVersion.const).toBe("claim-corpus/v1");
    const actual = execFileSync(process.execPath, ["--import", "tsx", "scripts/evaluate-claims.ts", "schema"], { encoding: "utf8" });
    expect(JSON.parse(actual).predictions.properties.schemaVersion.const).toBe("claim-predictions/v1");
  });
  it("evaluates retained synthetic fixture, writes exclusively, and preserves input bytes", () => {
    const dir = temp(); const input = path.resolve("tests/fixtures/claim-benchmark.synthetic.json"); const bytes = fs.readFileSync(input); const c = JSON.parse(bytes.toString("utf8"));
    const pred = path.join(dir, "predictions.json"); fs.writeFileSync(pred, JSON.stringify({ schemaVersion: "claim-predictions/v1", checker: { id: "deliberate-abstainer", version: "1" }, corpusHash: hashClaimCorpus(c), outputs: [] }));
    const out = path.join(dir, "result.json"); const args = ["evaluate", "--corpus", input, "--predictions", pred, "--out", out];
    runClaimBenchmarkCli(args, { writeStdout: () => {} }); const result = JSON.parse(fs.readFileSync(out, "utf8"));
    expect(result.eligibleCases).toBe(10); expect(result.statusCounts.missing).toBe(10); expect(result.metrics.agreementAllEligible).toBe(0);
    expect(result.limitations.join(" ")).toMatch(/synthetic.*real report/i); expect(fs.readFileSync(input).equals(bytes)).toBe(true);
    const retained = fs.readFileSync(out); expect(() => runClaimBenchmarkCli(args)).toThrow(/exists/i); expect(fs.readFileSync(out).equals(retained)).toBe(true);
    const link = path.join(dir, "link.json"); fs.symlinkSync(dir, link, "junction"); expect(() => runClaimBenchmarkCli([...args.slice(0, -1), link])).toThrow(/exists/i);
  });
  it("rejects malformed, unknown, missing and duplicate arguments before any output", () => {
    const dir = temp(); const out = path.join(dir, "out.json");
    for (const args of [["evaluate", "--out", out, "--unknown", "x"], ["evaluate", "--out", out, "--out", out], ["evaluate", "--out", out, "--corpus"], ["schema", "--bad", "x"], ["help", "extra"], ["other"], ["evaluate", "--out", out]]) {
      expect(() => runClaimBenchmarkCli(args)).toThrow(); expect(fs.existsSync(out)).toBe(false);
    }
  });
});


it("writes schema exclusively, handles help and refuses non-JSON evaluation without writing", () => {
  const dir = temp(); const schema = path.join(dir, "schema.json"); const input = path.join(dir, "bad.json");
  let help = ""; runClaimBenchmarkCli([], { writeStdout: text => { help += text; } }); expect(help).toMatch(/claims:evaluate/);
  runClaimBenchmarkCli(["--help"], { writeStdout: () => {} });
  runClaimBenchmarkCli(["schema", "--out", "schema.json"], { writeStdout: () => {} }, dir);
  expect(JSON.parse(fs.readFileSync(schema, "utf8")).corpus).toBeDefined();
  expect(() => runClaimBenchmarkCli(["schema", "--out", schema])).toThrow(/exists/i);
  fs.writeFileSync(input, "not JSON"); const out = path.join(dir, "out.json");
  expect(() => runClaimBenchmarkCli(["evaluate", "--corpus", input, "--predictions", input, "--out", out])).toThrow();
  expect(fs.existsSync(out)).toBe(false); expect(fs.readFileSync(input, "utf8")).toBe("not JSON");
});
it("retains partial output for review after a write failure and warns explicitly", () => {
  const dir = temp(); const out = path.join(dir, "partial.json");
  const original = fs.writeFileSync;
  const spy = vi.spyOn(fs, "writeFileSync").mockImplementation((...args: Parameters<typeof fs.writeFileSync>) => {
    if (typeof args[0] === "number") { original(args[0], "{"); throw new Error("simulated disk failure"); }
    return original(...args);
  });
  try { expect(() => runClaimBenchmarkCli(["schema", "--out", out])).toThrow(/disk failure.*[Pp]artial output may remain/); }
  finally { spy.mockRestore(); }
  expect(fs.readFileSync(out, "utf8")).toBe("{");
});
it("writes help through default stdout without an injected IO adapter", () => {
  let content = "";
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { content += String(chunk); return true; });
  try { runClaimBenchmarkCli(["help"]); } finally { spy.mockRestore(); }
  expect(content).toMatch(/claims:evaluate evaluate --corpus/);
});
it("rejects malformed UTF8 input rather than silently replacing retained bytes", () => {
  const dir = temp(); const input = path.resolve("tests/fixtures/claim-benchmark.synthetic.json"); const c = JSON.parse(fs.readFileSync(input, "utf8"));
  const pred = path.join(dir, "predictions.json"); const bytes = Buffer.from(JSON.stringify({ schemaVersion: "claim-predictions/v1", checker: { id: "BROKEN", version: "1" }, corpusHash: hashClaimCorpus(c), outputs: [] }));
  bytes[bytes.indexOf("BROKEN")] = 0xff; fs.writeFileSync(pred, bytes); const out = path.join(dir, "out.json");
  expect(() => runClaimBenchmarkCli(["evaluate", "--corpus", input, "--predictions", pred, "--out", out])).toThrow(/UTF8/);
  expect(fs.existsSync(out)).toBe(false); expect(fs.readFileSync(pred).equals(bytes)).toBe(true);
});

it("never deletes a replacement pathname after the owned partial was moved during a failed write", () => {
  const dir = temp(); const out = path.join(dir, "result.json"); const moved = path.join(dir, "moved-partial.json");
  const original = fs.writeFileSync;
  const spy = vi.spyOn(fs, "writeFileSync").mockImplementation((...args: Parameters<typeof fs.writeFileSync>) => {
    if (typeof args[0] === "number") {
      original(args[0], "{"); fs.renameSync(out, moved); original(out, "replacement owned by another operation");
      throw new Error("simulated disk failure after replacement");
    }
    return original(...args);
  });
  try { expect(() => runClaimBenchmarkCli(["schema", "--out", out])).toThrow(/disk failure after replacement/); }
  finally { spy.mockRestore(); }
  expect(fs.readFileSync(out, "utf8")).toBe("replacement owned by another operation");
  expect(fs.readFileSync(moved, "utf8")).toBe("{");
});
