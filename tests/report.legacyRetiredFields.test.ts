import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { reportToMarkdown } from "@/report/export/markdown";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import { detachRetiredStoredFields } from "@/report/legacyRetiredFields";
import { FilingDisclosuresSchema, REPORT_SPEC_VERSION, ReportSchema } from "@/report/schema";

// D-216 (P21): saved reports #59 and #60 carry `filingDisclosures.corporateActionBridge`, written by
// local 1.23.x work that never reached main. Synthetic issuer and filings only; no saved report data.
const ACCESSION = "0000000001-26-000042";
const SUMMARY = `Corporate-action bridge unresolved after balance date 2026-06-30: acquisition-completed dated 2026-07-15: 10-Q ${ACCESSION} filed 2026-07-30.`;
const BRIDGE = {
  status: "unresolved",
  balanceDate: "2026-06-30",
  asOf: "2026-10-31",
  evidence: [{
    kind: "acquisition-completed",
    eventDate: "2026-07-15",
    source: { form: "10-Q", accession: ACCESSION, exhibit: null, filingDate: "2026-07-30", url: "https://www.sec.gov/Archives/edgar/data/1/000000000126000042/demo.htm" },
    text: "On July 15, 2026, we completed the acquisition of Example Co.",
  }],
  limitations: ["Bounded retained SEC evidence is not a comprehensive transaction ledger."],
};

function storedJson(options: { spec?: string; bridge?: unknown; notes?: string[]; extra?: Record<string, unknown> } = {}): string {
  const report = JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "report", "DEMO-sample.json"), "utf8"));
  report.meta.specVersion = options.spec ?? "1.23.1";
  report.filingDisclosures = FilingDisclosuresSchema.parse({
    version: "1.0.0", currency: "USD", currencyBasis: "USD as filed", guidance: null, guidanceChecks: [],
    freeCashFlow: [], freeCashFlowDefinition: null, capitalReturn: null, events: [], segments: [], quarterlyTrend: [],
    notes: options.notes ?? [SUMMARY],
  });
  if (options.bridge !== undefined) report.filingDisclosures.corporateActionBridge = options.bridge;
  Object.assign(report.filingDisclosures, options.extra ?? {});
  return JSON.stringify(report);
}

const notice = (json: string) => parseStoredReportWithSafety(json)?.report.filingDisclosures?.notes.filter(n => n.startsWith("Read-time notice:"));

describe("stored reports with a retired field (D-216)", () => {
  it("opens a 1.23.x report carrying the exact retired shape and discloses what is not shown", () => {
    const json = storedJson({ bridge: BRIDGE });
    expect(ReportSchema.safeParse(JSON.parse(json)).success).toBe(false);
    const safe = parseStoredReportWithSafety(json);
    expect(safe).not.toBeNull();
    expect(safe!.report.filingDisclosures).not.toHaveProperty("corporateActionBridge");
    expect(safe!.report.filingDisclosures!.notes[0]).toBe(SUMMARY);
    expect(notice(json)).toEqual([
      "Read-time notice: this saved report also stores a corporate-action evidence record (status: unresolved; 1 source item) written by a development build that never became part of the app. The current app cannot show that record's table or its source excerpts; each item's form, accession number, filing date and link appear in the corporate-action note among these filing notes. The stored report was not changed.",
    ]);
    expect(reportToMarkdown(safe!.report)).toContain("Read-time notice: this saved report also stores a corporate-action evidence record");
  });

  it("says the source list is not shown when no note lists the evidence", () => {
    expect(notice(storedJson({ bridge: BRIDGE, notes: ["An unrelated filing note."] }))?.[0])
      .toContain("cannot show that record's table, its source excerpts or its source list.");
  });

  it("never mutates the parsed stored value", () => {
    const raw = JSON.parse(storedJson({ bridge: BRIDGE }));
    const before = JSON.stringify(raw);
    const { raw: view, retired } = detachRetiredStoredFields(raw);
    expect(retired).toHaveLength(1);
    expect(view).not.toBe(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("still refuses the field with another shape, on a current-spec report, or any other unknown field", () => {
    expect(parseStoredReportWithSafety(storedJson({ bridge: { ...BRIDGE, invented: 1 } }))).toBeNull();
    expect(parseStoredReportWithSafety(storedJson({ bridge: { ...BRIDGE, status: "resolved" } }))).toBeNull();
    expect(parseStoredReportWithSafety(storedJson({ bridge: BRIDGE, spec: REPORT_SPEC_VERSION }))).toBeNull();
    expect(parseStoredReportWithSafety(storedJson({ bridge: BRIDGE, spec: "1.24.0" }))).toBeNull();
    expect(parseStoredReportWithSafety(storedJson({ extra: { inventedField: BRIDGE } }))).toBeNull();
    const topLevel = JSON.parse(storedJson());
    topLevel.corporateActionBridge = BRIDGE;
    expect(parseStoredReportWithSafety(JSON.stringify(topLevel))).toBeNull();
  });

  it("leaves a report without the field exactly as before", () => {
    const json = storedJson();
    const raw = JSON.parse(json);
    expect(detachRetiredStoredFields(raw).raw).toBe(raw);
    expect(parseStoredReportWithSafety(json)!.report.filingDisclosures!.notes).toEqual([SUMMARY]);
  });
});
