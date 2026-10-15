import fs, { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runEvaluationCli } from "@/report/evaluationCli";

let directory: string;
const io = { writeStdout: () => {} };
const issuer = { scheme: "cik", id: "0000000123", symbol: "TEST" };

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "thesis-evaluation-"));
  writeFileSync(path.join(directory, "report.json"), JSON.stringify({
    meta: { symbol: "TEST", generatedAt: "2025-01-15T12:00:00.000Z", specVersion: "1.10.0", pipelineVersion: "test" },
    scenarioTargets: { targets: [{ name: "base", perShare: { value: 999 } }] },
  }));
  writeFileSync(path.join(directory, "definition.json"), JSON.stringify({
    schemaVersion: 1, issuer, identitySource: "local issuer evidence", asOf: "2025-01-15", methodVersion: "test",
    operating: [], market: [{ id: "return", startDate: "2025-01-16", endDate: "2026-01-16", securityId: "test-share", benchmarkId: "test-index", currency: "USD", basis: "split-adjusted-price" }],
  }));
  writeFileSync(path.join(directory, "outcomes.json"), JSON.stringify({
    schemaVersion: 1, outcomes: [{ kind: "market", id: "return", issuer, availableDate: "2026-01-16", source: "local prices",
      security: { id: "test-share", startDate: "2025-01-16", endDate: "2026-01-16", currency: "USD", basis: "split-adjusted-price", startValue: 100, endValue: 80 },
      benchmark: { id: "test-index", startDate: "2025-01-16", endDate: "2026-01-16", currency: "USD", basis: "split-adjusted-price", startValue: 100, endValue: 110 },
    }],
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

function freeze() {
  return runEvaluationCli(["freeze", "--report", "report.json", "--definition", "definition.json"], io, directory, "2026-03-01T00:00:00.000Z");
}

describe("offline evaluation CLI", () => {
  it("prints a usable contract through default stdout without creating local artifacts", () => {
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
    expect(runEvaluationCli(["schema"], undefined, directory).command).toBe("schema");
    const contract = JSON.parse(output);
    expect(contract.outcomes.properties.outcomes.items.oneOf.map((variant: { properties: { kind: { const: string } } }) => variant.properties.kind.const)).toEqual(["operating", "market"]);
    expect(contract.definition.additionalProperties).toBe(false);
    expect(existsSync(path.join(directory, "data"))).toBe(false);
  });

  it("offers help without reading inputs, but refuses unsupported commands and help/schema arguments", () => {
    let output = "";
    const sink = { writeStdout: (text: string) => { output += text; } };
    for (const args of [[], ["help"], ["--help"]]) expect(runEvaluationCli(args, sink, directory).command).toBe("help");
    expect(output).toContain("--definition");
    for (const args of [["help", "--report", "report.json"], ["schema", "--out", "result.json"], ["publish"]]) {
      expect(() => runEvaluationCli(args, sink, directory)).toThrow();
    }
    expect(existsSync(path.join(directory, "data"))).toBe(false);
  });

  it("preserves the partial destination for inspection when writing fails", () => {
    const before = readFileSync(path.join(directory, "report.json"));
    vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => { throw new Error("disk full"); });
    expect(() => freeze()).toThrow("disk full");
    expect(readdirSync(path.join(directory, "data/evaluations/snapshots"))).toHaveLength(1);
    expect(readFileSync(path.join(directory, "report.json"))).toEqual(before);
  });

  it("never deletes a concurrent replacement after a write failure", () => {
    const originalWrite = fs.writeFileSync;
    let outputPath = "";
    const replacement = "replacement owned by another operation";
    vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => {
      const folder = path.join(directory, "data/evaluations/snapshots");
      outputPath = path.join(folder, readdirSync(folder)[0]!);
      fs.renameSync(outputPath, path.join(directory, "owned-partial.json"));
      originalWrite(outputPath, replacement);
      throw new Error("disk full after concurrent replacement");
    });
    expect(() => freeze()).toThrow(/disk full/);
    expect(existsSync(outputPath)).toBe(true);
    expect(readFileSync(outputPath, "utf8")).toBe(replacement);
  });

  it("writes new content-addressed snapshots and evaluation results without touching inputs", () => {
    const sourceReport = readFileSync(path.join(directory, "report.json"));
    const sourceDefinition = readFileSync(path.join(directory, "definition.json"));
    const frozen = freeze();
    expect(frozen.outputPath).toMatch(/data[/\\]evaluations[/\\]snapshots[/\\][a-f0-9]{64}\.json$/);
    const snapshotBytes = readFileSync(frozen.outputPath!);
    const evaluated = runEvaluationCli(["evaluate", "--snapshot", frozen.outputPath!, "--outcomes", "outcomes.json", "--as-of", "2026-03-01"], io, directory);
    const result = JSON.parse(readFileSync(evaluated.outputPath!, "utf8"));
    expect(result.operating).toEqual([]);
    expect(result.market[0].securityReturnPct).toBeCloseTo(-20);
    expect(result.market[0].excessReturnPp).toBeCloseTo(-30);
    expect(result.registration).toBe("retrospective-snapshot");
    expect(readFileSync(path.join(directory, "report.json"))).toEqual(sourceReport);
    expect(readFileSync(path.join(directory, "definition.json"))).toEqual(sourceDefinition);
    expect(readFileSync(frozen.outputPath!)).toEqual(snapshotBytes);
  });

  it("never overwrites an existing snapshot, evaluation output or input", () => {
    const frozen = freeze();
    expect(() => freeze()).toThrow(/exist/i);
    const reportPath = path.join(directory, "report.json");
    const original = readFileSync(reportPath);
    expect(() => runEvaluationCli(["evaluate", "--snapshot", frozen.outputPath!, "--outcomes", "outcomes.json", "--as-of", "2026-03-01", "--out", reportPath], io, directory)).toThrow(/exist/i);
    expect(readFileSync(reportPath)).toEqual(original);
  });

  it("rejects changed snapshot content before writing results", () => {
    const frozen = freeze();
    const changed = JSON.parse(readFileSync(frozen.outputPath!, "utf8"));
    changed.report.meta.symbol = "OTHER";
    writeFileSync(frozen.outputPath!, JSON.stringify(changed));
    expect(() => runEvaluationCli(["evaluate", "--snapshot", frozen.outputPath!, "--outcomes", "outcomes.json", "--as-of", "2026-03-01"], io, directory)).toThrow();
    expect(existsSync(path.join(directory, "data/evaluations/results"))).toBe(false);
  });

  it.each([
    ["freeze", "--report", "report.json"],
    ["freeze", "--report", "report.json", "--definition", "definition.json", "--typo", "x"],
    ["freeze", "--report", "report.json", "--report", "report.json", "--definition", "definition.json"],
    ["evaluate", "--snapshot", "x", "--outcomes", "outcomes.json"],
    ["freeze", "--report", "--definition", "definition.json"],
  ])("rejects incomplete or ambiguous arguments: %j", (...args) => {
    expect(() => runEvaluationCli(args, io, directory)).toThrow();
    expect(existsSync(path.join(directory, "data"))).toBe(false);
  });

  it("runs the actual script and offers a machine-readable contract without data access", () => {
    const script = path.resolve(__dirname, "../scripts/evaluate-reports.ts");
    const child = spawnSync(process.execPath, ["--import", "tsx", script, "schema"], { encoding: "utf8", cwd: path.resolve(__dirname, "..") });
    expect(child.status, child.stderr).toBe(0);
    const contract = JSON.parse(child.stdout);
    expect(contract.definition.properties).toHaveProperty("operating");
    expect(contract.outcomes.properties.outcomes.items).toHaveProperty("oneOf");
  });
});
