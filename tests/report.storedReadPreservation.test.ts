import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { preservedRead } from "./helpers/preservedRead";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
it("stored read preservation check detects a write during the audited operation", () => {
 const dir = mkdtempSync(join(tmpdir(), "p3-preserve-"));
 try {
  const file = join(dir, "report.json");
  writeFileSync(file, readFileSync("fixtures/report/DEMO-sample.json"));
  expect(preservedRead(file, () => { writeFileSync(file, "changed"); })).toBe(false);
 } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("real stored read and audit render preserve the copy and parsed report", () => {
 const dir = mkdtempSync(join(tmpdir(), "p3-preserve-"));
 try {
  const file = join(dir, "report.json");
  writeFileSync(file, readFileSync("fixtures/report/DEMO-sample.json"));
  expect(preservedRead(file, () => {
   const parsed = parseStoredReportWithSafety(readFileSync(file, "utf8"));
   expect(parsed).not.toBeNull();
   const report = parsed!.report;
   const before = JSON.stringify(report);
   expect(reportToAuditMarkdown(report)).toContain("Audit");
   expect(JSON.stringify(report)).toBe(before);
  })).toBe(true);
 } finally { rmSync(dir, { recursive: true, force: true }); }
});
