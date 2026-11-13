/**
 * The saved-report read cache in src/report/history.ts (P21: stored bytes
 * never change, so the read-time view of the same bytes is built once per
 * process and shared).
 *
 * What must hold:
 *   - the cached view is the same view an uncached read builds;
 *   - the same bytes give the same object, different bytes never share one;
 *   - a shared view cannot be changed by a reader;
 *   - unreadable bytes stay unreadable;
 *   - the cache is bounded and drops the least recently read view first.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseStoredReport } from "@/report/history";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";

const SAMPLE_JSON = readFileSync(path.resolve(__dirname, "..", "fixtures", "report", "DEMO-sample.json"), "utf8");
/** The same report stored as different bytes: trailing spaces are valid JSON and change nothing else. */
const variant = (index: number): string => `${SAMPLE_JSON}${" ".repeat(index)}`;

describe("parseStoredReport read cache", () => {
  it("returns the view an uncached read builds", () => {
    const uncached = parseStoredReportWithSafety(SAMPLE_JSON)?.report ?? null;
    expect(uncached).not.toBeNull();
    expect(parseStoredReport(SAMPLE_JSON)).toEqual(uncached);
    // A second read is served from the cache and is still that view.
    expect(parseStoredReport(SAMPLE_JSON)).toEqual(uncached);
  });

  it("gives the same object for the same bytes and a separate one for different bytes", () => {
    const first = parseStoredReport(SAMPLE_JSON);
    expect(parseStoredReport(SAMPLE_JSON)).toBe(first);
    // A fresh string with the same characters is the same stored bytes.
    expect(parseStoredReport(SAMPLE_JSON.slice(0, 10) + SAMPLE_JSON.slice(10))).toBe(first);
    const other = parseStoredReport(variant(1));
    expect(other).not.toBe(first);
    expect(other).toEqual(first);
  });

  it("never serves one report's view for another report's bytes", () => {
    const raw = JSON.parse(SAMPLE_JSON) as { meta: { companyName: string } };
    const renamed = JSON.stringify({ ...raw, meta: { ...raw.meta, companyName: "Another Fictional Company" } });
    expect(parseStoredReport(SAMPLE_JSON)?.meta.companyName).toBe(raw.meta.companyName);
    expect(parseStoredReport(renamed)?.meta.companyName).toBe("Another Fictional Company");
    expect(parseStoredReport(SAMPLE_JSON)?.meta.companyName).toBe(raw.meta.companyName);
  });

  it("freezes a shared view so no reader can change what the next one sees", () => {
    const report = parseStoredReport(SAMPLE_JSON);
    if (report === null) throw new Error("the sample report must be readable");
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.meta)).toBe(true);
    expect(Object.isFrozen(report.verdict.gradeStrip)).toBe(true);
    expect(Object.isFrozen(report.appendix.missingData)).toBe(true);
    expect(() => { (report.meta as { companyName: string }).companyName = "changed"; }).toThrow(TypeError);
    expect(() => { (report.appendix.missingData as unknown[]).push({}); }).toThrow(TypeError);
    expect(parseStoredReport(SAMPLE_JSON)?.meta.companyName).not.toBe("changed");
  });

  it("keeps unreadable bytes unreadable on every read", () => {
    expect(parseStoredReport(null)).toBeNull();
    for (const bad of ["not json", '{"meta": {"symbol": "X"}}', ""]) {
      expect(parseStoredReport(bad)).toBeNull();
      expect(parseStoredReport(bad)).toBeNull();
    }
  });

  it("is bounded: the least recently read view is dropped first and is rebuilt on its next read", () => {
    // The limit is 48 views. Read 48 distinct stored forms, so the cache holds exactly these.
    const first = parseStoredReport(variant(1000));
    const second = parseStoredReport(variant(1001));
    for (let index = 1002; index < 1048; index++) parseStoredReport(variant(index));
    // Reading the first again keeps it and makes the second the least recently read.
    expect(parseStoredReport(variant(1000))).toBe(first);
    // One more distinct form is over the limit, so the least recently read view leaves.
    parseStoredReport(variant(2000));
    expect(parseStoredReport(variant(1000))).toBe(first);
    const rebuilt = parseStoredReport(variant(1001));
    expect(rebuilt).not.toBe(second);
    expect(rebuilt).toEqual(second);
    expect(Object.isFrozen(rebuilt)).toBe(true);
  }, 120_000);
});
