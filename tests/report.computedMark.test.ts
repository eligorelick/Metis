/**
 * Audit 2026-10-22 F-23: a data-only report runs no citation-check pass, yet
 * every figure the pipeline computed carried verified: true and printed a ✓
 * under "Cited" (KO: 156 of them). Those figures now read "computed", with a
 * legend under the first table that uses the column; a report whose verify
 * pass ran keeps its ✓.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportView } from "@/components/report/ReportView";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { COMPUTED_MARK_LEGEND } from "@/report/verificationMarks";
import type { Report } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

function dataOnly(): Report {
  const report = loadTask28Fixture();
  report.appendix.missingData.push({ field: "analysis.llm", reason: "No completed assessment", severity: "critical" });
  return report;
}

/** The Cited cells of every Markdown table whose last column is Cited. */
function markdownCitedCells(markdown: string): string[] {
  const cells: string[] = [];
  let inCited = false;
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) { inCited = false; continue; }
    if (line.endsWith(" | Cited |")) { inCited = true; continue; }
    if (inCited && !line.startsWith("| ---")) cells.push(line.slice(line.lastIndexOf(" | ", line.length - 3) + 3, -2));
  }
  return cells;
}

describe("data-only figure marks (audit 2026-10-22 F-23)", () => {
  it("prints computed, never ✓, under Cited in Markdown, with the legend under the first such table", () => {
    const markdown = reportToMarkdown(dataOnly());
    const cells = markdownCitedCells(markdown);
    expect(cells).toContain("computed");
    expect(cells).not.toContain("✓");
    const lines = markdown.split("\n");
    const firstCited = lines.findIndex((line) => line.endsWith(" | Cited |"));
    let end = firstCited;
    while (lines[end + 1].startsWith("|")) end++;
    expect(lines.slice(end + 1, end + 3)).toEqual(["", `_${COMPUTED_MARK_LEGEND}_`]);
    expect(markdown.split(COMPUTED_MARK_LEGEND).length - 1).toBe(1);
  });

  it("prints computed, never ✓, under Cited in print, with the legend under the first such table", () => {
    const html = reportToPrintBody(dataOnly());
    expect(html).toContain("<td>computed</td>");
    expect(html).not.toContain("<td>✓</td>");
    const firstCited = html.indexOf("<th>Cited</th></tr></thead>");
    const legend = html.indexOf('<p class="table-legend">');
    expect(legend).toBe(html.indexOf("</table>", firstCited) + "</table>".length);
  });

  it.each(["classic", "dossier"] as const)("shows computed in place of the citation-traced ✓ in the %s layout", (layout) => {
    const html = renderToStaticMarkup(createElement(ReportView, { report: dataOnly(), layout }));
    expect(html).toContain('aria-label="computed"');
    expect(html).not.toContain('aria-label="citation-traced"');
    expect(html).not.toContain("<dd>citation-traced</dd>");
  });

  it("records computed, not citation-traced, in the audit export", () => {
    const audit = reportToAuditMarkdown(dataOnly());
    expect(audit).toContain("computed (no citation check ran)");
    expect(audit).not.toContain("| citation-traced |");
  });

  it("adds no legend to a checked report whose own cells read computed (review of F-23)", () => {
    const report = loadTask28Fixture();
    report.appendix.sources.push({ provider: "computed", endpoint: "derived:profile(edgar:submissions)", asOf: "2026-06-30", fetchedAt: "2026-07-01T00:00:00.000Z" });
    report.appendix.sources.push({ provider: "edgar", endpoint: "companyfacts", asOf: "2026-06-30", fetchedAt: "2026-07-01T00:00:00.000Z" });
    expect(reportToPrintBody(report)).toContain("<td>computed</td>");
    expect(reportToPrintBody(report)).not.toContain("table-legend");
    expect(reportToMarkdown(report)).not.toContain(COMPUTED_MARK_LEGEND);
  });

  it("keeps ✓ and no legend when the verify pass ran", () => {
    const report = loadTask28Fixture();
    expect(markdownCitedCells(reportToMarkdown(report))).toContain("✓");
    expect(reportToMarkdown(report)).not.toContain(COMPUTED_MARK_LEGEND);
    expect(reportToPrintBody(report)).not.toContain("table-legend");
    expect(renderToStaticMarkup(createElement(ReportView, { report }))).not.toContain('aria-label="computed"');
  });
});
