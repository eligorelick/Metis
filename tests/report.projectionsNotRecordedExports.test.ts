import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { projectionsNotRecordedNotice } from "@/report/presentation";
import { unavailableCashFlowModel } from "@/report/readerConventions";
import type { Report } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";
import { readableHtml } from "./helpers/uiParityContract";

/**
 * D-224 (P22, P20): the "projections not recorded" note that the app shows for
 * a saved report without projections (#125) now also appears in the Markdown,
 * print and audit exports, from one shared rule in src/report/presentation.ts.
 */
const NOTICE = "Projections were not recorded in this snapshot. No forecast series or scenario weights are inferred.";

const count = (text: string, needle: string) => text.split(needle).length - 1;

function withoutProjections(report: Report = loadTask28Fixture()): Report {
  const r = structuredClone(report);
  delete r.projections;
  return r;
}

/** Same construction as tests/report.noModelScenarioConditions.test.ts: the cash-flow model is unavailable. */
function noModel(report: Report): Report {
  const r = structuredClone(report);
  r.valuation.dcf = { ...r.valuation.dcf, perShare: null, upsidePct: null, assumptions: [], sensitivityGrid: [] };
  delete r.valuation.dcf.forecastRows;
  delete r.valuation.dcf.excessReturnGrid;
  r.valuation.reverseDcf = { impliedMetric: "n/a", impliedValue: null, narrative: "No reverse DCF applies to this route." };
  r.fairValue = { status: "suppressed", method: null, methodVersion: "test", perShare: null, upsidePct: null, basis: [],
    reasons: [{ field: "valuation.fairValue", reason: "Cash-flow valuation is unavailable for this route.", severity: "info" }] };
  return r;
}

describe("projectionsNotRecordedNotice (one shared rule)", () => {
  it("returns the sentence only when projections are absent and the model is not hidden by its reader convention", () => {
    expect(projectionsNotRecordedNotice(withoutProjections())).toBe(NOTICE);
    expect(projectionsNotRecordedNotice(loadTask28Fixture())).toBeNull();
    const hidden = noModel(withoutProjections());
    expect(unavailableCashFlowModel(hidden)).toBe(true);
    expect(projectionsNotRecordedNotice(hidden)).toBeNull();
  });
});

describe("Markdown export", () => {
  it("shows the numbered section heading and the notice once, between Future Outlook and Macro Context", () => {
    const md = reportToMarkdown(withoutProjections());
    expect(count(md, NOTICE)).toBe(1);
    expect(count(md, "## 12. Weighted Projections")).toBe(1);
    expect(md).toContain(`## 12. Weighted Projections\n\n_${NOTICE}_\n\n---\n\n## 13. Macro Context`);
    expect(md.indexOf("## 11. Future Outlook")).toBeLessThan(md.indexOf("## 12. Weighted Projections"));
  });

  it("keeps a report with projections free of the notice", () => {
    const md = reportToMarkdown(loadTask28Fixture());
    expect(md).not.toContain("Projections were not recorded");
    expect(count(md, "## 12. Weighted Projections")).toBe(1);
  });

  it("adds neither heading nor notice when the cash-flow model is unavailable", () => {
    const md = reportToMarkdown(noModel(withoutProjections()));
    expect(md).not.toContain("Projections were not recorded");
    expect(md).not.toContain("## 12. Weighted Projections");
  });
});

describe("print export", () => {
  const SECTION = `<section class="block"><h2 class="sec" id="report-projections"><span class="secno">12</span> Weighted Projections</h2><p class="faint">${NOTICE}</p></section>`;

  it("shows the numbered section heading and the notice once, between Future Outlook and Macro Context", () => {
    const body = reportToPrintBody(withoutProjections());
    expect(count(body, NOTICE)).toBe(1);
    expect(count(body, 'id="report-projections"')).toBe(1);
    expect(body).toContain(`${SECTION}\n<section class="block"><h2 class="sec" id="report-macro">`);
    expect(body.indexOf('id="report-outlook"')).toBeLessThan(body.indexOf('id="report-projections"'));
  });

  it("keeps a report with projections free of the notice", () => {
    const body = reportToPrintBody(loadTask28Fixture());
    expect(body).not.toContain("Projections were not recorded");
    expect(count(body, 'id="report-projections"')).toBe(1);
  });

  it("adds neither heading nor notice when the cash-flow model is unavailable", () => {
    const body = reportToPrintBody(noModel(withoutProjections()));
    expect(body).not.toContain("Projections were not recorded");
    expect(body).not.toContain('id="report-projections"');
  });
});

describe("audit export", () => {
  it("shows the projection audit heading and the notice once, in the projection section's position", () => {
    const audit = reportToAuditMarkdown(withoutProjections());
    expect(count(audit, NOTICE)).toBe(1);
    expect(count(audit, "## Projection audit trail")).toBe(1);
    expect(audit).toContain(`## Projection audit trail\n\n${NOTICE}\n\n---\n\n## Missing-data manifest`);
  });

  it("keeps a report with projections free of the notice", () => {
    const audit = reportToAuditMarkdown(loadTask28Fixture());
    expect(audit).not.toContain("Projections were not recorded");
    expect(count(audit, "## Projection audit trail")).toBe(1);
  });

  it("adds neither heading nor notice when the cash-flow model is unavailable", () => {
    const audit = reportToAuditMarkdown(noModel(withoutProjections()));
    expect(audit).not.toContain("Projections were not recorded");
    expect(audit).not.toContain("## Projection audit trail");
  });
});

describe("one sentence on every surface", () => {
  it("the app, Markdown, print and audit show the same sentence", () => {
    const report = withoutProjections();
    const surfaces: [string, string][] = [
      ["app", readableHtml(renderToStaticMarkup(createElement(ReportView, { report }))).text],
      ["markdown", reportToMarkdown(report)],
      ["print", readableHtml(reportToPrintBody(report)).text],
      ["audit", reportToAuditMarkdown(report)],
    ];
    for (const [surface, text] of surfaces) expect(count(text, NOTICE), surface).toBe(1);
  });

  it("the sentence is written in exactly one src file", () => {
    const root = path.join(process.cwd(), "src");
    const files = (readdirSync(root, { recursive: true }) as string[])
      .filter(file => /\.(?:ts|tsx)$/.test(file))
      .filter(file => readFileSync(path.join(root, file), "utf8").includes("Projections were not recorded"));
    expect(files.map(file => file.split(path.sep).join("/"))).toEqual(["report/presentation.ts"]);
  });
});
