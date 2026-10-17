import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { assembleReport } from "@/pipeline/stageC/passes";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { runStageB } from "@/pipeline/compute";
import { reportToMarkdown, reportToAuditMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { judgeOutputToJsonSchema, type Report } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

const url = "https://ir.example.com/news/acquisition";
const hash = "a".repeat(64);
function bundleWithStatement() {
  const bundle = completeCurrencyBundle({});
  bundle.builtAt = "2026-10-17T12:00:00.000Z";
  const text = "Example Group announced that it has acquired Journey. Completion is stated by the company.";
  bundle.companyIrMaterialEvents = { ok: true, value: { source: "computed", endpoint: "company-ir:material-events", asOf: "2026-07-31", fetchedAt: bundle.builtAt,
    data: { notes: ["Bounded selection, not a comprehensive transaction ledger. Issuer statements are not independently verified completion."], events: [{ symbol: bundle.symbol, category: "acquisition", status: "issuer-stated-completed", title: "Example Group acquires Journey", url, publishedAt: "2026-07-31", observedAt: bundle.builtAt, authorityChain: ["https://example.com/", "https://ir.example.com/", url], sourceHash: hash,
      text, originalChars: text.length, span: { start: 0, end: text.length, text }, consideration: null, funding: null }] } } };
  return bundle;
}
function reports() {
  const bundle = bundleWithStatement();
  const computed = runStageB(bundle);
  const fixture = loadTask28Fixture();
  const invented = { ...fixture, filingDisclosures: { companyStatements: [{ title: "Invented model event", consideration: 999 }] } };
  const full = assembleReport({ symbol: bundle.symbol, bundle, computed, judgeOutput: invented, model: "synthetic-test", costEntries: [], verify: { verificationRate: null, log: [] } }, bundle.builtAt);
  const dataOnly = buildDataOnlyReport({ symbol: bundle.symbol, companyName: "Example Group", generatedAt: bundle.builtAt, model: "synthetic-test", costUsd: 0, bundle, computed, validation: { checks: [], flags: [], gaps: [] }, costBreakdown: [], reason: "offline test" });
  return { bundle, full, dataOnly };
}

describe("pipeline-owned official company-statement ledger", () => {
  it("maps only retained primary evidence on full and data-only report paths", () => {
    const { full, dataOnly } = reports();
    for (const report of [full, dataOnly]) {
      expect(report.filingDisclosures?.companyStatements).toMatchObject([{ form: null, url, sourceHash: hash, publishedAt: "2026-07-31", observedAt: "2026-10-17T12:00:00.000Z", consideration: null, funding: null, status: "issuer-stated-completed" }]);
      expect(JSON.stringify(report.filingDisclosures)).not.toContain("Invented model event");
    }
    expect(JSON.stringify(judgeOutputToJsonSchema())).not.toContain("companyStatements");
  });

  it("does not retain a foreign-symbol statement or copy purported deal terms", () => {
    const bundle = bundleWithStatement();
    if (!bundle.companyIrMaterialEvents?.ok) throw new Error("fixture");
    const event = bundle.companyIrMaterialEvents.value.data.events[0]!;
    Object.assign(event, { consideration: 999, funding: "guessed debt" });
    const disclosures = buildFilingDisclosures(bundle);
    expect(disclosures?.companyStatements?.[0]).toMatchObject({ consideration: null, funding: null });
    event.symbol = "FOREIGN";
    expect(buildFilingDisclosures(bundle)?.companyStatements).toBeUndefined();
  });

  it.each([
    ["live", (report: Report) => renderToStaticMarkup(createElement(ReportView, { report }))],
    ["Markdown", reportToMarkdown], ["print", reportToPrintBody], ["audit", reportToAuditMarkdown],
  ] as const)("retains source authority, timing, hash, issuer status and unknown economics in %s", (_surface, render) => {
    const { full, dataOnly } = reports();
    for (const report of [full, dataOnly]) {
      // The Markdown serializer intentionally escapes active URL schemes;
      // decode that display escape before comparing the retained URL.
      const output = render(report).replace(/\\:/g, ":");
      expect(output).toContain("Example Group acquires Journey");
      expect(output).toContain(url);
      expect(output).toContain(hash);
      expect(output).toContain("2026-07-31");
      expect(output).toContain("2026-10-17T12:00:00.000Z");
      expect(output).toMatch(/issuer.stated.completed|Issuer states completed/);
      expect(output).toMatch(/not a comprehensive/);
      expect(output).not.toContain("Invented model event");
    }
  });
});
