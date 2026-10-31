import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runEvaluationCli } from "@/report/evaluationCli";

let dir: string;
const io = { writeStdout: () => {} };
const created = "2025-01-01T00:00:00.000Z";
const registered = "2025-01-15T12:01:00.000Z";
const write = (file: string, value: unknown) => fs.writeFileSync(path.join(dir, file), JSON.stringify(value));
const run = (args: string[], now = created) => runEvaluationCli(args, io, dir, now);
const init = () => run(["study-init", "--protocol", "protocol.json", "--dir", "study"]);
const enroll = () => run(["study-register", "--dir", "study", "--slot", "test", "--report", "report.json"], registered);
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "metis-study-"));
  const slot = (symbol: string) => ({ id: symbol.toLowerCase(), sector: "Technology", registerBy: "2025-01-15T23:00:00.000Z",
    definition: { schemaVersion: 1, issuer: { scheme: "lei", id: `lei-${symbol}`, symbol }, identitySource: "retained issuer identity", asOf: "2025-01-15", methodVersion: "fixed-study-model", operating: [],
      market: [{ id: "return", startDate: "2025-01-16", endDate: "2026-01-16", securityId: `share-${symbol}`, benchmarkId: "index-market", currency: "USD", basis: "total-return-index" }] }, baselines: [] });
  write("protocol.json", { schemaVersion: 1, id: "study", description: "Synthetic cohort", universe: { source: "frozen list", selection: "point_in_time", includesDelisted: true }, slots: [slot("TEST"), slot("FAIL")] });
  write("report.json", { meta: { symbol: "TEST", generatedAt: "2025-01-15T12:00:00.000Z", specVersion: "1", pipelineVersion: "fixed-pipeline" } });
  write("outcomes.json", { schemaVersion: 1, slots: [{ slotId: "test", outcomes: { schemaVersion: 1, outcomes: [{ kind: "market", id: "return", issuer: slot("TEST").definition.issuer, availableDate: "2026-01-16", source: "retained distributions/delisting export",
    security: { id: "share-TEST", startDate: "2025-01-16", endDate: "2026-01-16", currency: "USD", basis: "total-return-index", startValue: 100, endValue: 0 },
    benchmark: { id: "index-market", startDate: "2025-01-16", endDate: "2026-01-16", currency: "USD", basis: "total-return-index", startValue: 100, endValue: 110 } }] } }] });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("prospective study CLI", () => {
  it.each([["test", "TEST"], ["CON", "PRN"]])("stores portable distinct paths for slot IDs %s and %s", (first, second) => {
    const protocol = JSON.parse(fs.readFileSync(path.join(dir, "protocol.json"), "utf8"));
    protocol.slots[0].id = first; protocol.slots[1].id = second;
    write("protocol.json", protocol);
    const other = JSON.parse(fs.readFileSync(path.join(dir, "report.json"), "utf8")); other.meta.symbol = "FAIL";
    write("other.json", other); init();
    const a = run(["study-register", "--dir", "study", "--slot", first, "--report", "report.json"], registered);
    const b = run(["study-register", "--dir", "study", "--slot", second, "--report", "other.json"], registered);
    expect(a.outputPath!.toLowerCase()).not.toBe(b.outputPath!.toLowerCase());
    write("empty.json", { schemaVersion: 1, slots: [] });
    const summary = run(["study-evaluate", "--dir", "study", "--outcomes", "empty.json", "--as-of", "2025-02-01"]);
    expect(summary.studyCounts).toMatchObject({ registeredReports: 2, missingRegistrations: 0, pendingMarket: 2 });
  });
  it("runs the full workflow, retains total loss and all unregistered issuers, never changes inputs", () => {
    const bytes = fs.readFileSync(path.join(dir, "report.json"));
    init();
    const enrollment = enroll();
    const registrationBytes = fs.readFileSync(enrollment.outputPath!);
    const summary = run(["study-evaluate", "--dir", "study", "--outcomes", "outcomes.json", "--as-of", "2026-03-01"]);
    const result = JSON.parse(fs.readFileSync(summary.outputPath!, "utf8"));
    expect(result.counts).toMatchObject({ plannedReports: 2, missingRegistrations: 1, marketIncluded: 1 });
    expect(result.slots[0].evaluation.market[0]).toMatchObject({ securityReturnPct: -100 });
    expect(result.slots[0].evaluation.market[0].excessReturnPp).toBeCloseTo(-110);
    expect(result.slots[1].issuer.symbol).toBe("FAIL");
    expect(result.groups).toEqual([]); // Market observations are not forecast errors.
    expect(fs.readFileSync(path.join(dir, "report.json"))).toEqual(bytes);
    expect(fs.readFileSync(enrollment.outputPath!)).toEqual(registrationBytes);
  });

  it("uses exclusive files and refuses overwrite/backdating/subset flags", () => {
    init(); enroll();
    expect(() => init()).toThrow(/exist/i);
    expect(() => enroll()).toThrow(/exist/i);
    expect(() => run(["study-register", "--dir", "study", "--slot", "test", "--report", "report.json", "--registered-at", registered])).toThrow(/Unknown option/i);
    expect(() => run(["study-evaluate", "--dir", "study", "--outcomes", "outcomes.json", "--as-of", "2026-03-01", "--slot", "test"])).toThrow(/Unknown option/i);
    expect(() => run(["study-evaluate", "--dir", "study", "--outcomes", "outcomes.json", "--as-of", "2026-03-01", "--out", "report.json"])).toThrow(/exist/i);
  });

  it("rejects malformed registration files rather than omitting the issuer", () => {
    init(); const saved = enroll();
    fs.writeFileSync(saved.outputPath!, "{truncated");
    expect(() => run(["study-evaluate", "--dir", "study", "--outcomes", "outcomes.json", "--as-of", "2026-03-01"])).toThrow();
    expect(fs.existsSync(path.join(dir, "study", "results"))).toBe(false);
  });

  it("does not initialize into an occupied directory or write on invalid protocol", () => {
    fs.mkdirSync(path.join(dir, "occupied"));
    expect(() => run(["study-init", "--protocol", "protocol.json", "--dir", "occupied"])).toThrow(/exist/i);
    write("bad.json", {});
    expect(() => run(["study-init", "--protocol", "bad.json", "--dir", "bad-study"])).toThrow();
    expect(fs.existsSync(path.join(dir, "bad-study"))).toBe(false);
  });
});
