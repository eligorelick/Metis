/**
 * D-245, D-246 (P22): report pages render the dossier, the only layout; a
 * leftover METIS_UI_REDESIGN value changes nothing. Rendered offline through
 * the components the pages use (no server, no database): the sample report
 * page and the saved-report boundary that the company page and the
 * saved-report page both mount.
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

describe("report layout (D-245, D-246)", () => {
  it.each([
    ["no setting", undefined],
    ["a blank leftover setting", ""],
    ["a leftover METIS_UI_REDESIGN=1", "1"],
    ["a leftover METIS_UI_REDESIGN=0", "0"],
  ] as const)("renders the sample report page and a saved report as the dossier with %s", (_label, value) => {
    if (value !== undefined) vi.stubEnv("METIS_UI_REDESIGN", value);
    resetConfigCache();
    const sample = renderToStaticMarkup(SamplePage());
    const saved = renderToStaticMarkup(createElement(PersistedReportView, { report, selectedReportId: 1, selectedReportStatus: "done", headerNotices: true }));
    expect(layoutOf(sample)).toBe("dossier");
    expect(layoutOf(saved)).toBe("dossier");
    // The dossier cover's sticky contents menu.
    expect(saved).toContain("report-sticky-context");
  });
});
