/**
 * P21/P13: every saved-report surface reads a stored report through one
 * ordered chain of read-time readers (src/report/storedReportView.ts). The
 * chain used to be copied by hand at five call sites.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { Report } from "@/report/schema";

const calls: string[] = [];

function recorded(original: Record<string, unknown>, name: string): Record<string, unknown> {
  const fn = original[name] as (report: Report) => Report;
  return { ...original, [name]: (report: Report) => { calls.push(name); return fn(report); } };
}

vi.mock("@/report/principalAggregationSafety", async (importOriginal) => recorded(await importOriginal<Record<string, unknown>>(), "withPrincipalSummarySafety"));
vi.mock("@/report/enterpriseValueSafety", async (importOriginal) => recorded(await importOriginal<Record<string, unknown>>(), "withHistoricalEnterpriseValueSafety"));
vi.mock("@/report/legacyPayloadRecordSafety", async (importOriginal) => recorded(await importOriginal<Record<string, unknown>>(), "withLegacyPayloadRecordSafety"));
vi.mock("@/report/legacyEdgarDerivedLines", async (importOriginal) => recorded(await importOriginal<Record<string, unknown>>(), "withLegacyEdgarDerivedLines"));
vi.mock("@/report/legacyBridgeMethod", async (importOriginal) => recorded(await importOriginal<Record<string, unknown>>(), "withLegacyBridgeMethod"));
vi.mock("@/report/legacyValuationNotes", async (importOriginal) => recorded(await importOriginal<Record<string, unknown>>(), "withLegacyValuationNotes"));
vi.mock("@/report/legacyImpliedReturnShareBasis", async (importOriginal) => recorded(await importOriginal<Record<string, unknown>>(), "withLegacyImpliedReturnShareBasis"));
vi.mock("@/report/legacyScopeQualifications", async (importOriginal) => recorded(await importOriginal<Record<string, unknown>>(), "withLegacyScopeQualifications"));
vi.mock("@/report/valuationUseSafety", async (importOriginal) => recorded(await importOriginal<Record<string, unknown>>(), "withValuationUseSafety"));

const { STORED_REPORT_VIEW_READERS, withSafeStoredReportView, withStoredReportView } = await import("@/report/storedReportView");
const { ReportSchema } = await import("@/report/schema");

const ORDER = [
  "withPrincipalSummarySafety",
  "withHistoricalEnterpriseValueSafety",
  "withLegacyPayloadRecordSafety",
  "withLegacyEdgarDerivedLines",
  "withLegacyBridgeMethod",
  "withLegacyValuationNotes",
  "withLegacyImpliedReturnShareBasis",
  "withLegacyScopeQualifications",
] as const;

function loadReport(): Report {
  const parsed = ReportSchema.safeParse(JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "report", "DEMO-sample.json"), "utf8")));
  if (!parsed.success) throw new Error("fixture must parse against ReportSchema");
  return parsed.data;
}

describe("withStoredReportView", () => {
  it("applies the shared readers in their fixed order", () => {
    calls.length = 0;
    withStoredReportView(loadReport());
    expect(calls).toEqual([...ORDER]);
  });

  it("applies the current-use valuation check last in the safe view", () => {
    calls.length = 0;
    withSafeStoredReportView(loadReport());
    expect(calls).toEqual([...ORDER, "withValuationUseSafety"]);
  });

  it("lists its readers in the same order it applies them", () => {
    calls.length = 0;
    const report = loadReport();
    const listed = STORED_REPORT_VIEW_READERS.reduce<Report>((acc, reader) => reader(acc), report);
    expect(calls).toEqual([...ORDER]);
    expect(withStoredReportView(report)).toEqual(listed);
  });
});

describe("the reader chain is not copied by hand", () => {
  const OWNER = path.join("src", "report", "storedReportView.ts");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });

  it("no source file other than the owner calls two or more chain readers", () => {
    const offenders = files("src")
      .filter((file) => path.normalize(file) !== OWNER)
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        const called = ORDER.filter((name) => new RegExp(`(?<!function )\\b${name}\\(`).test(source));
        return called.length >= 2 ? [`${file}: ${called.join(", ")}`] : [];
      });
    expect(offenders).toEqual([]);
  });
});
