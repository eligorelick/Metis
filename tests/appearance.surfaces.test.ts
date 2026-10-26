import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import RootLayout from "@/app/layout";
import { UiDesignProvider, useUiDesign } from "@/appearance/UiDesignProvider";
import { AppearanceSettings, AppearanceSettingsView } from "@/app/settings/AppearanceSettings";
import { ReportView } from "@/components/report/ReportView";
import { chartPalette } from "@/components/charts/palette";
import { resolveSeriesColors } from "@/components/charts/RelativeStrengthChart";
import { toVolumeHistogramData } from "@/components/charts/PriceChart";
import { task28SentinelReport } from "./helpers/task28Report";
import { UI_DENSITY_COOKIE } from "@/appearance/density";
import { resetConfigCache } from "@/config/env";
import { readableHtml } from "./helpers/uiParityContract";
import { getWatchlistView } from "@/watchlist/watchlist";
import { WorkspaceToolbar } from "@/components/WorkspaceToolbar";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/watchlist/watchlist", () => ({ getWatchlistView: vi.fn(async () => []) }));

describe("appearance surfaces", () => {
  beforeEach(() => {
    vi.mocked(getWatchlistView).mockReset().mockResolvedValue([]);
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as unknown as Awaited<ReturnType<typeof cookies>>);
  });

  it("wires search to cached coverage labels only and exposes failed reads truthfully", async () => {
    vi.stubEnv("METIS_UI_REDESIGN","1"); resetConfigCache();
    function Targets() { const { coverage, coverageAvailable } = useUiDesign(); return createElement("output", null, JSON.stringify({ coverage,coverageAvailable })); }
    try {
      vi.mocked(getWatchlistView).mockResolvedValueOnce([{symbol:"DEMO",companyName:"Stored company label",price:987654321,runs:[],gaps:[]}]);
      const html = renderToStaticMarkup(await RootLayout({children:createElement("div",null,createElement(WorkspaceToolbar),createElement(Targets))}));
      expect(html).toContain('aria-label="Search research"'); expect(html).toContain("Stored company label"); expect(html).not.toContain("987654321");
      expect(html.match(/<fieldset disabled=""/g)).toHaveLength(2);
      expect(getWatchlistView).toHaveBeenCalledOnce();
      vi.mocked(getWatchlistView).mockRejectedValueOnce(new Error("Private DB read details"));
      const unavailable = renderToStaticMarkup(await RootLayout({children:createElement(Targets)}));
      expect(unavailable).toContain('&quot;coverageAvailable&quot;:false'); expect(unavailable).not.toContain("Private DB read details");
    } finally { vi.unstubAllEnvs(); resetConfigCache(); }
  });

  it.each([undefined, "bad; unsafe=1", "workspace"])("aligns SSR body and selected design for cookie %s", async (value) => {
    vi.mocked(cookies).mockResolvedValue({ get: () => value === undefined ? undefined : { value } } as unknown as Awaited<ReturnType<typeof cookies>>);
    const html = renderToStaticMarkup(await RootLayout({ children: createElement(AppearanceSettings) }));
    const expected = value === "workspace" ? "workspace" : "current";
    expect(html).toContain(`data-ui-design="${expected}"`);
    expect(html).toMatch(new RegExp(`checked="" value="${expected}"`));
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).not.toContain("unsafe=1");
  });

  it("announces visit-only behavior when the browser cannot save", () => {
    const html = renderToStaticMarkup(createElement(AppearanceSettingsView, {
      design: "workspace", saved: false, onChange: () => {},
    }));
    expect(html).toContain('role="status"');
    expect(html).toMatch(/applied for this visit/i);
    expect(html).toMatch(/reload may restore/i);
    expect(html).not.toContain("Applied and saved");
  });

  it.each(["comfortable", "compact"] as const)("aligns %s SSR spacing and client initialization without changing research", async density => {
    vi.stubEnv("METIS_UI_REDESIGN", "1"); resetConfigCache();
    vi.mocked(cookies).mockResolvedValue({ get: (name: string) => name === UI_DENSITY_COOKIE ? { value: density } : undefined } as unknown as Awaited<ReturnType<typeof cookies>>);
    try {
      const report = task28SentinelReport(); const before = JSON.stringify(report);
      const html = renderToStaticMarkup(await RootLayout({ children: createElement(ReportView, { report, layout: "dossier" }) }));
      expect(html).toContain(`data-ui-density="${density}"`); expect(JSON.stringify(report)).toBe(before);
      const comparison = renderToStaticMarkup(createElement(UiDesignProvider, { initialDesign: "current", layout: "dossier", initialDensity: density === "compact" ? "comfortable" : "compact" }, createElement(ReportView, { report, layout: "dossier" })));
      expect(readableHtml(html).text).toContain(readableHtml(comparison).text);
    } finally { vi.unstubAllEnvs(); resetConfigCache(); }
  });

  it("preserves Current report markup without a rail, and adds recorded evidence only in workspace", () => {
    const report = task28SentinelReport();
    report.meta.asOfMap = { "quote-observed": "2025-12-31" };
    report.appendix.missingData = [{ field: "fixture.reserved(DEMO)", severity: "info", reason: "Synthetic omission", expected: true }];
    const current = renderToStaticMarkup(createElement(ReportView, { report }));
    const workspace = renderToStaticMarkup(createElement(UiDesignProvider, { initialDesign: "workspace" }, createElement(ReportView, { report })));
    expect(current).not.toContain('aria-label="Report evidence and gaps"');
    expect(workspace).toContain('aria-label="Report evidence and gaps"');
    expect(workspace).toContain("Recorded gaps (1)");
    expect(workspace).toContain("expected omission");
    expect(workspace).toContain("quote-observed");
    expect(workspace).toContain("2025-12-31");
    expect(workspace).toMatch(/traceability, not correctness/);
    expect(workspace).toContain('href="#report-appendix"');
  });

  it("changes canvas colors without changing financial points or the Current default", () => {
    const bars = [{ date: "2025-12-31", open: 39, high: 41, low: 38, close: 40, volume: 123 }];
    const current = toVolumeHistogramData(bars);
    const workspace = toVolumeHistogramData(bars, chartPalette("workspace"));
    expect(current).toEqual([{ time: "2025-12-31", value: 123, color: "#2ecc8f55" }]);
    expect(workspace).toEqual([{ time: "2025-12-31", value: 123, color: "#17624b55" }]);
    const series = [{ label: "DEMO", rows: [{ date: "2025-12-31", close: 40 }] }];
    expect(resolveSeriesColors(series)[0]!.color).toBe("#cfaf7d");
    expect(resolveSeriesColors(series, chartPalette("workspace"))[0]).toEqual({ ...series[0], color: "#785b32" });
  });
});
