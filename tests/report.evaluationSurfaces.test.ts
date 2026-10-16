import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import type { Report } from "@/report/schema";

describe("saved forecast horizon surfaces", () => {
  // D-62: the projection audit trail (with each point's modeled dates) is in
  // the separate audit export; the report body shows the period labels.
  it("exposes actual modeled dates in the audit export", () => {
    const report = JSON.parse(readFileSync("fixtures/report/DEMO-sample.json", "utf8")) as Report;
    const point = report.projections!.series[0].base[0];
    point.periodStart = "2025-07-01";
    point.periodEnd = "2026-06-30";
    expect(renderToStaticMarkup(createElement(ReportView, { report }))).not.toContain("Modeled period start");
    for (const body of [reportToMarkdown(report), reportToPrintBody(report)]) {
      expect(body).toContain(point.period);
      expect(body).not.toContain("Modeled period start");
    }
    for (const surface of [reportToAuditMarkdown(report)]) {
      expect(surface).toContain("Modeled period start");
      expect(surface).toContain("Modeled period end");
      expect(surface).toContain("2025-07-01");
      expect(surface).toContain("2026-06-30");
    }
  });
});
