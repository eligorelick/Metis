import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import type { Report } from "@/report/schema";

describe("saved forecast horizon surfaces", () => {
  it("exposes actual modeled dates in the app, Markdown and print audit trails", () => {
    const report = JSON.parse(readFileSync("fixtures/report/DEMO-sample.json", "utf8")) as Report;
    const point = report.projections!.series[0].base[0];
    point.periodStart = "2025-07-01";
    point.periodEnd = "2026-06-30";
    const surfaces = [renderToStaticMarkup(createElement(ReportView, { report })), reportToMarkdown(report), reportToPrintBody(report)];
    for (const surface of surfaces) {
      expect(surface).toContain("Modeled period start");
      expect(surface).toContain("Modeled period end");
      expect(surface).toContain("2025-07-01");
      expect(surface).toContain("2026-06-30");
    }
  });
});
