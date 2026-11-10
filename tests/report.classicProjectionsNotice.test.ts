import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { loadTask28Fixture, task28LegacyMissingBlocksReport } from "./helpers/task28Report";
import { readableHtml } from "./helpers/uiParityContract";

const NOTICE = "Projections were not recorded in this snapshot. No forecast series or scenario weights are inferred.";

function render(report: ReturnType<typeof loadTask28Fixture>, layout: "classic" | "dossier") {
  return renderToStaticMarkup(createElement(ReportView, { report, layout }));
}

describe("classic layout 'projections not recorded' notice (invariant 2)", () => {
  it("shows the dossier's notice, and the anchor nav link lands on it, when a snapshot has no projections", () => {
    const report = task28LegacyMissingBlocksReport();
    expect(report.projections).toBeUndefined();
    const html = render(report, "classic");
    const { ids, text } = readableHtml(html);
    expect(text).toContain(NOTICE);
    expect(ids.has("report-projections")).toBe(true);
    expect(html).toContain('href="#report-projections"');
    // Same notice, same condition as the dossier layout.
    expect(readableHtml(render(report, "dossier")).text).toContain(NOTICE);
  });

  it("does not show the notice when projections are recorded", () => {
    const report = loadTask28Fixture();
    expect(report.projections).toBeDefined();
    const html = render(report, "classic");
    const { ids, text } = readableHtml(html);
    expect(text).not.toContain("Projections were not recorded");
    expect(ids.has("report-projections")).toBe(true);
    expect(html).toContain('href="#report-projections"');
  });
});
