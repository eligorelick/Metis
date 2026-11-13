/**
 * D-245 (P22): with no layout setting, report pages render the dossier.
 * Rendered offline through the components the pages use (no server, no
 * database): the sample report page and the saved-report boundary that the
 * company page and the saved-report page both mount.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetConfigCache } from "@/config/env";
import { ReportSchema } from "@/report/schema";
import SamplePage from "@/app/report/sample/page";
import { PersistedReportView } from "@/components/report/PersistedReportView";

vi.mock("@/components/charts/lazy", async importOriginal => ({ ...await importOriginal<typeof import("@/components/charts/lazy")>(), FundamentalsChartGrid: () => null, TechnicalsChartPanel: () => null }));
vi.mock("@/components/SidebarNavigation", () => ({ SidebarNavigation: () => null }));
vi.mock("@/components/WorkspaceToolbar", () => ({ WorkspaceToolbar: () => null }));

afterEach(() => { vi.unstubAllEnvs(); resetConfigCache(); });

const report = ReportSchema.parse(JSON.parse(readFileSync("fixtures/report/DEMO-current.json", "utf8")));

function layoutOf(html: string): string | undefined {
  return /data-report-layout="([a-z]+)"/.exec(html)?.[1];
}

describe("default report layout (D-245)", () => {
  it.each([
    ["no setting", undefined, "dossier"],
    ["a blank setting", "", "dossier"],
    ["METIS_UI_REDESIGN=1", "1", "dossier"],
    ["METIS_UI_REDESIGN=0", "0", "classic"],
  ] as const)("renders the sample report page and a saved report with %s as %s", (_label, value, expected) => {
    if (value !== undefined) vi.stubEnv("METIS_UI_REDESIGN", value);
    resetConfigCache();
    const sample = renderToStaticMarkup(SamplePage());
    const saved = renderToStaticMarkup(createElement(PersistedReportView, { report, selectedReportId: 1, selectedReportStatus: "done", headerNotices: true }));
    expect(layoutOf(sample)).toBe(expected);
    expect(layoutOf(saved)).toBe(expected);
    if (expected === "dossier") {
      // The dossier cover and its contents menu, which classic does not render.
      expect(saved).toContain("report-sticky-context");
      expect(saved).not.toContain('data-report-layout="classic"');
    }
  });
});
