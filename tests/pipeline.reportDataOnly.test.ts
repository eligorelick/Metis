import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { reportJsonIsDataOnly } from "@/pipeline/events";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import { FilingDisclosuresSchema, REPORT_SPEC_VERSION, ReportSchema } from "@/report/schema";

// The paid-job resume and data-only checks (`reportJsonIsDataOnly`, used by
// events.ts, jobRunner.ts and jobStore.ts) read a saved report through the
// same parse step as the saved-report reader (P21, D-216). Synthetic issuer and
// filings only; no saved report data.
const ACCESSION = "0000000001-26-000042";
const LINK = "https://www.sec.gov/Archives/edgar/data/1/000000000126000042/demo.htm";
// Exact shape of the retired `filingDisclosures.corporateActionBridge` field
// that saved report #60 carries (spec stamp 1.23.x).
const BRIDGE = {
  status: "unresolved",
  balanceDate: "2026-06-30",
  asOf: "2026-10-31",
  evidence: [{
    kind: "acquisition-completed",
    eventDate: "2026-07-15",
    source: { form: "10-Q", accession: ACCESSION, exhibit: null, filingDate: "2026-07-30", url: LINK },
    text: "On July 15, 2026, we completed the acquisition of Example Co.",
  }],
  limitations: ["Bounded retained SEC evidence is not a comprehensive transaction ledger."],
};
const DATA_ONLY_GAP = { field: "analysis.llm", reason: "AI analysis was not run for this report.", severity: "warn" };

function storedJson(options: {
  spec?: string;
  dataOnly: boolean;
  bridge?: unknown;
  extra?: Record<string, unknown>;
}): string {
  const report = JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "report", "DEMO-sample.json"), "utf8"));
  if (options.spec !== undefined) report.meta.specVersion = options.spec;
  report.appendix.missingData = report.appendix.missingData.filter((m: { field: string }) => m.field !== "analysis.llm");
  if (options.dataOnly) report.appendix.missingData.push(DATA_ONLY_GAP);
  report.filingDisclosures = FilingDisclosuresSchema.parse({
    version: "1.0.0", currency: "USD", currencyBasis: "USD as filed", guidance: null, guidanceChecks: [],
    freeCashFlow: [], freeCashFlowDefinition: null, capitalReturn: null, events: [], segments: [], quarterlyTrend: [],
    notes: ["A filing note."],
  });
  if (options.bridge !== undefined) report.filingDisclosures.corporateActionBridge = options.bridge;
  Object.assign(report.filingDisclosures, options.extra ?? {});
  return JSON.stringify(report);
}

/** The saved-report reader's own answer, or null when it cannot open the report. */
const readerDataOnly = (json: string): boolean | null =>
  parseStoredReportWithSafety(json)?.report.appendix.missingData.some((m) => m.field === "analysis.llm") ?? null;

describe("reportJsonIsDataOnly reads through the shared saved-report parse step", () => {
  it("recognises a data-only report shaped like #60 (retired field at its exact place, shape and stamp)", () => {
    for (const spec of ["1.23.1", "1.23.2", "1.23.3"]) {
      const json = storedJson({ spec, dataOnly: true, bridge: BRIDGE });
      // The raw schema alone refuses it: this is the case the old check got wrong.
      expect(ReportSchema.safeParse(JSON.parse(json)).success).toBe(false);
      expect(readerDataOnly(json)).toBe(true);
      expect(reportJsonIsDataOnly(json)).toBe(true);
    }
  });

  it("keeps an AI report with the retired field as not data-only", () => {
    const json = storedJson({ spec: "1.23.1", dataOnly: false, bridge: BRIDGE });
    expect(readerDataOnly(json)).toBe(false);
    expect(reportJsonIsDataOnly(json)).toBe(false);
  });

  it("still refuses a report the reader cannot open (unknown field, wrong stamp or wrong shape)", () => {
    for (const json of [
      storedJson({ spec: "1.23.1", dataOnly: true, bridge: BRIDGE, extra: { unknownField: true } }),
      storedJson({ spec: "1.23.1", dataOnly: true, extra: { unknownField: true } }),
      storedJson({ spec: "1.24.0", dataOnly: true, bridge: BRIDGE }),
      storedJson({ spec: REPORT_SPEC_VERSION, dataOnly: true, bridge: BRIDGE }),
      storedJson({ spec: "1.23.1", dataOnly: true, bridge: { ...BRIDGE, extra: 1 } }),
      storedJson({ spec: "1.23.1", dataOnly: true, bridge: { ...BRIDGE, status: "resolved" } }),
    ]) {
      expect(readerDataOnly(json)).toBeNull();
      expect(reportJsonIsDataOnly(json)).toBe(false);
    }
  });

  it("keeps the answers for ordinary current reports, empty rows and unparseable text", () => {
    const dataOnly = storedJson({ dataOnly: true });
    const ai = storedJson({ dataOnly: false });
    expect(ReportSchema.safeParse(JSON.parse(dataOnly)).success).toBe(true);
    expect(ReportSchema.safeParse(JSON.parse(ai)).success).toBe(true);
    expect(reportJsonIsDataOnly(dataOnly)).toBe(true);
    expect(readerDataOnly(dataOnly)).toBe(true);
    expect(reportJsonIsDataOnly(ai)).toBe(false);
    expect(readerDataOnly(ai)).toBe(false);
    expect(reportJsonIsDataOnly(null)).toBe(false);
    expect(reportJsonIsDataOnly("")).toBe(false);
    expect(reportJsonIsDataOnly("{not json")).toBe(false);
    expect(reportJsonIsDataOnly("{}")).toBe(false);
  });
});
