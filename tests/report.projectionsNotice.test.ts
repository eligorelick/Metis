import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { loadTask28Fixture, task28LegacyMissingBlocksReport } from "./helpers/task28Report";
import { readableHtml } from "./helpers/uiParityContract";

const NOTICE = "Projections were not recorded in this snapshot. No forecast series or scenario weights are inferred.";

function render(report: ReturnType<typeof loadTask28Fixture>) {
  return renderToStaticMarkup(createElement(ReportView, { report }));
}

/** D-246: formerly the classic layout's copy of the dossier notice; the dossier is now the only layout. */
describe("'projections not recorded' notice (invariant 2)", () => {
  it("shows the notice, and the contents link lands on it, when a snapshot has no projections", () => {
    const report = task28LegacyMissingBlocksReport();
    expect(report.projections).toBeUndefined();
    const html = render(report);
    const { ids, text } = readableHtml(html);
    expect(text).toContain(NOTICE);
    expect(ids.has("report-projections")).toBe(true);
    expect(html).toContain('href="#report-projections"');
  });

  it("does not show the notice when projections are recorded", () => {
    const report = loadTask28Fixture();
    expect(report.projections).toBeDefined();
    const html = render(report);
    const { ids, text } = readableHtml(html);
    expect(text).not.toContain("Projections were not recorded");
    expect(ids.has("report-projections")).toBe(true);
    expect(html).toContain('href="#report-projections"');
  });
});
