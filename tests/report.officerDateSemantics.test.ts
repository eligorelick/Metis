import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { parseOfficerChanges } from "@/edgar/filingFacts";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { assembleReport } from "@/pipeline/stageC/passes";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { buildMaterialEventFiling, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { filingGovernanceTables } from "@/report/filingSupplementPresentation";
import { FilingDisclosuresSchema } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";
import retained from "./fixtures/expe-cfo-transition-20260423.json";

function inputs() {
  const bundle = completeCurrencyBundle({});
  const event = buildMaterialEventFiling({ accessionNumber: retained.accession, form: "8-K", filingDate: retained.filingDate, items: "5.02" }, `Item 5.02. ${retained.title}. ${retained.text}`, retained.sourceUrl);
  bundle.edgar.currentReports = { ok: true, value: { data: { version: CURRENT_REPORTS_VERSION, releases: [], events: [event], notes: [] }, source: "edgar", asOf: retained.filingDate, endpoint: retained.sourceUrl, fetchedAt: bundle.builtAt } };
  return { bundle, computed: runStageB(bundle) };
}

describe("officer agreement, announcement and filing dates have distinct meanings", () => {
  it("keeps the actual departure agreement date without fabricating a public announcement", () => {
    expect(parseOfficerChanges(retained.text).find(c => c.person === "Scott Schenkel")).toMatchObject({ announced: null, agreedDate: "2026-04-17", effective: "2026-05-11" });
    expect(parseOfficerChanges(retained.text).find(c => c.person === "Derek Andersen")).toMatchObject({ announced: "2026-04-23", effective: "2026-05-11" });
    expect(parseOfficerChanges("On April 17, 2026, the Board appointed Jane Example, age 47, as Chief Financial Officer of the Company, effective May 11, 2026.")[0]).toMatchObject({ announced: null });
  });

  it("retains date meanings in full/data-only metadata and the model payload without treating elapsed time as completion", () => {
    const { bundle, computed } = inputs();
    const full = assembleReport({ symbol: bundle.symbol, bundle, computed, judgeOutput: loadTask28Fixture(), model: "synthetic-test", costEntries: [], verify: { verificationRate: null, log: [] } }, bundle.builtAt);
    const dataOnly = buildDataOnlyReport({ symbol: bundle.symbol, companyName: "Example Group", generatedAt: bundle.builtAt, model: "synthetic-test", costUsd: 0, bundle, computed, validation: { checks: [], flags: [], gaps: [] }, costBreakdown: [], reason: "offline test" });
    for (const report of [full, dataOnly]) {
      expect(report.filingDisclosures?.officerChanges?.find(c => c.person === "Scott Schenkel")).toMatchObject({ announced: null, agreedDate: "2026-04-17", effective: "2026-05-11", inEffect: true, completionStatus: "unconfirmed", source: { filingDate: "2026-04-23", url: retained.sourceUrl } });
      const parsed = FilingDisclosuresSchema.parse(report.filingDisclosures);
      const old = structuredClone(parsed);
      old.officerChanges?.forEach(c => { delete c.agreedDate; delete c.completionStatus; });
      expect(FilingDisclosuresSchema.safeParse(old).success).toBe(true);
      expect(reportToAuditMarkdown(report)).toContain('"agreedDate": "2026-04-17"');
    }
    const payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
    const value = payload.filingFacts?.figures.find(e => e.label === "Scott Schenkel departure");
    expect(value).toMatchObject({ asOf: "2026-04-23", value: expect.stringContaining("agreement date 2026-04-17") });
    expect(value?.value).toContain("public announcement date not stated");
    expect(value?.value).toContain("completion unconfirmed");
  });

  it.each([
    ["live", (report: ReturnType<typeof loadTask28Fixture>) => renderToStaticMarkup(createElement(ReportView, { report }))],
    ["Markdown", reportToMarkdown], ["print", reportToPrintBody],
  ] as const)("shows agreement, disclosure and scheduled effective dates with their own basis in %s", (_name, render) => {
    const { bundle } = inputs();
    const report = loadTask28Fixture();
    report.filingDisclosures = buildFilingDisclosures(bundle)!;
    const table = filingGovernanceTables(report.filingDisclosures)[0]!;
    expect(table.headers).toContain("Agreement date");
    expect(table.rows[0]?.[table.headers.indexOf("Public announcement")]).toBe("Not recorded");
    const text = render(report);
    for (const phrase of ["Agreement date", "2026-04-17", "filed 2026-04-23", "2026-05-11", "specified by filing", "completion unconfirmed"]) expect(text.includes(phrase), phrase).toBe(true);
    expect(text.includes("Effective 2026-05-11")).toBe(false);
  });
});
