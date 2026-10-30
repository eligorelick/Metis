import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ReportView } from "@/components/report/ReportView";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { loadTask28Fixture } from "./helpers/task28Report";

describe("B5a then B6: independently versioned stored disclosures", () => {
  it.each([
    { version: "1.49.0", quarter: true, shares: true },
    { version: "1.50.0", quarter: true, shares: true },
    { version: "1.51.0", quarter: false, shares: true },
    { version: "1.52.0", quarter: false, shares: false },
  ])("keeps the correct disclosure boundaries at $version", ({ version, quarter, shares }) => {
    const report = loadTask28Fixture();
    report.meta.specVersion = version;
    report.valuation.dcf.assumptions = [{ name: "year-one revenue anchor", value: "100",
      basis: "latest quarter ending 2026-09-03 × 4 = 216.92B" }];
    report.fundamentals.graded.keyNumbers[0] = { ...report.fundamentals.graded.keyNumbers[0],
      value: 54.229e9, sourceId: "payload.statements.income-statement-quarterly.2026-09-03.revenue",
      periodContext: { kind: "duration", basis: "fiscal-quarter", start: "2026-05-29", end: "2026-09-03" },
    };
    report.scores!.aspects.valuation.drivers = [{ value: 22.63, unit: "pp",
      source: "computed.scores.valuation.roeImpliedVsAchievable", asOf: "2025-12-31", verified: true }];
    const bytes = JSON.stringify(report);
    const parsed = parseStoredReportWithSafety(bytes);
    expect(parsed).not.toBeNull();
    const view = parsed!.report;
    for (const [key, applies] of [["quarterLength", quarter], ["impliedReturnShareBasis", shares]] as const) {
      expect(view.appendix.missingData.filter(g => g.field === `presentation.legacyValuation.${key}`)).toHaveLength(applies ? 1 : 0);
    }
    expect(view.scores).toEqual(report.scores);
    expect(view.valuation.dcf).toEqual(report.valuation.dcf);
    expect(parseStoredReportWithSafety(JSON.stringify(view))!.report).toEqual(view);
    const texts = [renderToStaticMarkup(createElement(ReportView, { report })),
      renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" })),
      reportToMarkdown(report), reportToAuditMarkdown(report), reportToPrintBody(report)];
    for (const [index, text] of texts.entries()) {
      expect(text.includes("201.42B"), `surface ${index}: 14-week filed-revenue illustration follows the B5 cutoff`).toBe(quarter);
      expect(text.includes("was not solved on the share count the value per share divides by"),
        "implied-return disclosure follows the later B6 cutoff").toBe(shares);
    }
    expect(JSON.stringify(report)).toBe(bytes);
  });
});
