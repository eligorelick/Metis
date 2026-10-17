import fs, { existsSync, linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCorrectedExport } from "@/report/export/correctedCli";
import { createHash } from "node:crypto";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

/**
 * The JSON sidecar path was derived by replacing an `.html`/`.htm` suffix. When
 * `--out` carries no such suffix the replace is a no-op, so the JSON write lands
 * on the path the HTML was just written to and destroys it — while the returned
 * summary still advertises that path as the HTML deliverable.
 */
const ROOT = path.resolve(__dirname, "..");
const REPORT_FIXTURE = path.join(ROOT, "fixtures", "report", "DEMO-sample.json");
// Hosted Windows runs have exceeded 5s for native SQLite/filesystem work.
// Give each corrected-export I/O case the same bounded budget.
const EXPORT_IO_TIMEOUT_MS = 15_000;

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "thesis-corrected-out-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tempDir, { recursive: true, force: true });
});

function seed(dbFile: string, reportJson?: string): void {
  mkdirSync(path.dirname(dbFile), { recursive: true });
  // Same minimal shape as tests/report.correctedCli.test.ts's seed helper — the
  // CLI reads `reports` and left-joins the ledger tables.
  const sqlite = new Database(dbFile);
  sqlite.exec(`
    CREATE TABLE reports (
      id INTEGER PRIMARY KEY,
      symbol TEXT NOT NULL,
      reportJson TEXT,
      createdAt TEXT NOT NULL,
      model TEXT NOT NULL
    );
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      reportId INTEGER,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE TABLE cost_log (
      id INTEGER PRIMARY KEY,
      jobId TEXT,
      step TEXT,
      model TEXT,
      costUsd REAL,
      fallbackUsed INTEGER
    );
  `);
  const stored = reportJson ?? readFileSync(REPORT_FIXTURE, "utf8");
  sqlite
    .prepare("INSERT INTO reports (id, symbol, reportJson, createdAt, model) VALUES (?, ?, ?, ?, ?)")
    .run(7, "DEMO", stored, "2026-08-30T00:00:00.000Z", "claude-opus-4-8");
  sqlite.close();
}

describe("corrected export --out without an .html suffix", () => {
  function legacyPrincipalReport(): string {
    const report = JSON.parse(readFileSync(REPORT_FIXTURE, "utf8"));
    report.meta.specVersion = "1.19.2";
    report.filingDisclosures = buildFilingDisclosures(completeCurrencyBundle({}));
    report.filingDisclosures.events = [{ filingDate: "2026-09-22", eventDate: "2026-09-22", accession: "0001769628-26-000432", form: "8-K", items: ["1.01"], url: "https://www.sec.gov/source", summary: "CoreWeave completed $4.2 billion of notes, including the $500 million option. [computed: 2 series, $4.7 billion aggregate principal amount in total]" }];
    return JSON.stringify(report);
  }

  it("exports a corrected JSON copy and hashed audit sidecar while preserving the stored source", () => {
    const dbFile = path.join(tempDir, "source.db");
    const out = path.join(tempDir, "corrected.html");
    const stored = legacyPrincipalReport();
    seed(dbFile, stored);
    const originalDb = readFileSync(dbFile);
    const summary = runCorrectedExport({ dbFile, reportId: 7, outputHtml: out });
    expect(summary.principalCorrectionAudit).toBe(`${summary.outputJson}.principal-correction.json`);
    const correctedBytes = readFileSync(summary.outputJson, "utf8");
    const corrected = JSON.parse(correctedBytes);
    const audit = JSON.parse(readFileSync(summary.principalCorrectionAudit!, "utf8"));
    expect(corrected.filingDisclosures.events[0].summary).not.toContain("$4.7 billion");
    expect(corrected.meta.specVersion).toBe("1.19.2");
    expect(audit).toMatchObject({ originalReportId: 7, analystRerun: false, originalStoredDataChanged: false,
      beforeReportSha256: createHash("sha256").update(stored).digest("hex"),
      correctedReportSha256: createHash("sha256").update(correctedBytes).digest("hex"),
      originalMeta: JSON.parse(stored).meta,
    });
    expect(audit.changes[0].before).toContain("$4.7 billion");
    expect(audit.changes[0].after).not.toContain("$4.7 billion");
    expect(readFileSync(out, "utf8")).toMatch(/deterministic presentation correction/i);
    expect(readFileSync(dbFile)).toEqual(originalDb);
  }, EXPORT_IO_TIMEOUT_MS);

  it("preserves an occupied correction sidecar and removes only its newly reserved sibling outputs", () => {
    const dbFile = path.join(tempDir, "source.db");
    const out = path.join(tempDir, "corrected.html");
    const sidecar = path.join(tempDir, "corrected.json.principal-correction.json");
    seed(dbFile, legacyPrincipalReport());
    writeFileSync(sidecar, "user-owned correction audit");
    expect(() => runCorrectedExport({ dbFile, reportId: 7, outputHtml: out })).toThrow(/already exists/);
    expect(readFileSync(sidecar, "utf8")).toBe("user-owned correction audit");
    expect(existsSync(out)).toBe(false);
    expect(existsSync(path.join(tempDir, "corrected.json"))).toBe(false);
  }, EXPORT_IO_TIMEOUT_MS);

  it("preserves the write error and continues cleanup when one partial output cannot be removed", () => {
    const dbFile = path.join(tempDir, "source.db");
    const out = path.join(tempDir, "corrected.html");
    seed(dbFile);
    const originalDb = readFileSync(dbFile);
    const failure = new Error("disk full");
    vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => { throw failure; });
    const unlink = fs.unlinkSync;
    vi.spyOn(fs, "unlinkSync").mockImplementation((file) => {
      if (file === out) throw new Error("output locked");
      unlink(file);
    });
    expect(() => runCorrectedExport({ dbFile, reportId: 7, outputHtml: out })).toThrow(failure);
    expect(existsSync(path.join(tempDir, "corrected.json"))).toBe(false);
    expect(readFileSync(dbFile)).toEqual(originalDb);
  }, EXPORT_IO_TIMEOUT_MS);

  it.each(["html", "json", "database", "hardlink"])("preserves an existing %s destination and leaves no partial export", (kind) => {
    const dbFile = path.join(tempDir, "source.db");
    seed(dbFile);
    const originalDb = readFileSync(dbFile);
    const out = kind === "database" ? dbFile : path.join(tempDir, "corrected.html");
    const sidecar = kind === "database" ? `${out}.json` : path.join(tempDir, "corrected.json");
    const occupied = kind === "json" ? sidecar : out;
    if (kind === "hardlink") linkSync(dbFile, occupied);
    else if (kind !== "database") writeFileSync(occupied, "existing user content");
    const originalOutput = readFileSync(occupied);

    expect(() => runCorrectedExport({ dbFile, reportId: 7, outputHtml: out })).toThrow();
    expect(readFileSync(dbFile)).toEqual(originalDb);
    expect(readFileSync(occupied)).toEqual(originalOutput);
    expect(existsSync(kind === "json" ? out : sidecar)).toBe(false);
  }, EXPORT_IO_TIMEOUT_MS);

  it("writes the JSON beside the HTML instead of over it", () => {
    const dbFile = path.join(tempDir, "source.db");
    const out = path.join(tempDir, "corrected-report"); // no extension
    seed(dbFile);

    const summary = runCorrectedExport({ dbFile, reportId: 7, outputHtml: out });

    expect(summary.outputJson).not.toBe(summary.outputHtml);

    const html = readFileSync(summary.outputHtml, "utf8");
    expect(html.trimStart().slice(0, 400).toLowerCase()).toContain("<!doctype html");

    const json = readFileSync(summary.outputJson, "utf8");
    expect(() => JSON.parse(json)).not.toThrow();
  }, EXPORT_IO_TIMEOUT_MS);

  it("still replaces the suffix when --out ends in .html", () => {
    const dbFile = path.join(tempDir, "source2.db");
    const out = path.join(tempDir, "corrected.html");
    seed(dbFile);

    const summary = runCorrectedExport({ dbFile, reportId: 7, outputHtml: out });

    expect(summary.outputHtml).toBe(out);
    expect(summary.outputJson).toBe(path.join(tempDir, "corrected.json"));
    expect(readFileSync(summary.outputHtml, "utf8").toLowerCase()).toContain("<!doctype html");
  }, EXPORT_IO_TIMEOUT_MS);
});
