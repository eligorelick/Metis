import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildDataCompleteness } from "@/report/completeness";
import { ReportSnapshotDetails } from "@/components/report/ReportSnapshotHeader";
import { loadTask28Fixture } from "./helpers/task28Report";
it("RPT-206 preserves recorded Research state with only verification warnings", () => {
 const report = loadTask28Fixture();
 report.appendix.missingData = [{ field: "verify.check.direction", severity: "warn", reason: "Direction contradicts the cited change" }];
 report.meta.dataCompleteness = buildDataCompleteness(report.appendix.missingData);
 const html = renderToStaticMarkup(createElement(ReportSnapshotDetails, { report, reportId: 1, status: "done" }));
 expect(report.meta.dataCompleteness.state).toBe("degraded");
 expect(html).toContain("Research: degraded");
});
