import { linkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("offline evaluation CLI", () => {
  it("reads only the frozen dataset and writes a diagnostic report with fixture limitations", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "thesis-evaluation-"));
    const output = path.join(directory, "report.json");
    try {
      const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/evaluate-research.ts", "tests/fixtures/research-evaluation.synthetic.json", output], { encoding: "utf8", timeout: 10000 });
      expect(run.status, run.stderr).toBe(0);
      const report = JSON.parse(readFileSync(output, "utf8"));
      expect(report).toMatchObject({ evidenceKind: "synthetic_fixture", productionThresholds: "unchanged_uncalibrated", accepted: 2, pending: 0 });
      expect(report.groups[0].model).toMatchObject({ mae: 3, bias: -1 });
      expect(report.interpretation).toMatch(/machinery only/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("fails closed on malformed or survivorship-filtered input", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "thesis-evaluation-"));
    const input = path.join(directory, "invalid.json");
    try {
      writeFileSync(input, "{}");
      const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/evaluate-research.ts", input], { encoding: "utf8", timeout: 10000 });
      expect(run.status).not.toBe(0);
      expect(run.stderr).toMatch(/evaluation/i);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it.each(["existing output", "hardlink to frozen input"])("preserves %s byte-for-byte instead of overwriting it", (kind) => {
    const directory = mkdtempSync(path.join(tmpdir(), "thesis-evaluation-"));
    const input = path.join(directory, "frozen.json"), output = path.join(directory, "output.json");
    const frozenBytes = readFileSync("tests/fixtures/research-evaluation.synthetic.json", "utf8");
    const outputBytes = kind === "hardlink to frozen input" ? frozenBytes : "existing result must survive\n";
    try {
      writeFileSync(input, frozenBytes);
      if (kind === "hardlink to frozen input") linkSync(input, output); else writeFileSync(output, outputBytes);
      const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/evaluate-research.ts", input, output], { encoding: "utf8", timeout: 10000 });
      expect(run.status).not.toBe(0);
      expect(run.stderr).toMatch(/EEXIST|exist|overwrite/i);
      expect(readFileSync(input, "utf8")).toBe(frozenBytes);
      expect(readFileSync(output, "utf8")).toBe(outputBytes);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
