import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportSchema } from "@/report/schema";
import { ReportView } from "@/components/report/ReportView";
import SamplePage from "@/app/report/sample/page";
import { legacyScopeQualifications } from "@/report/legacyScopeQualifications";

const state = vi.hoisted(() => ({ malformed: false }));
vi.mock("node:fs", async importOriginal => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return { ...fs, readFileSync: (...args: Parameters<typeof fs.readFileSync>) => {
    if (state.malformed && String(args[0]).endsWith("DEMO-current.json")) return "{}";
    return fs.readFileSync(...args);
  } };
});
vi.mock("@/components/charts/lazy", async importOriginal => ({ ...await importOriginal<typeof import("@/components/charts/lazy")>(), FundamentalsChartGrid: () => null, TechnicalsChartPanel: () => null }));
vi.mock("@/components/SidebarNavigation", () => ({ SidebarNavigation: () => null }));
vi.mock("@/components/WorkspaceToolbar", () => ({ WorkspaceToolbar: () => null }));
afterEach(() => { state.malformed = false; });

describe("current fictional visitor sample", () => {
  it("parses and renders complete USD research without legacy notices in both layouts", () => {
    const report = ReportSchema.parse(JSON.parse(readFileSync("fixtures/report/DEMO-current.json", "utf8")));
    expect(legacyScopeQualifications(report)).toEqual([]);
    expect(report.meta.companyName).toBe("Thesis Example Systems");
    expect(report.meta.costUsd).toBe(0);
    expect(report.fairValue?.status).toBe("available");
    expect(report.scenarioTargets?.status).toBe("available");
    expect(report.appendix.verificationLog?.length).toBeGreaterThan(0);
    expect(report.leadership.managementActions?.length).toBeGreaterThan(0);
    const charts = JSON.parse(readFileSync("fixtures/report/DEMO-current-charts.json", "utf8"));
    expect(charts.market.bars.at(-1).close).toBe(report.marketData?.quote?.price);
    expect(charts.fundamentals.currency).toBe(report.marketData?.currency);
    expect(report.appendix.verificationLog?.filter(entry => entry.validationStatus === "contradicted")).toEqual([]);
    for (const layout of ["classic", "dossier"] as const) {
      const html = renderToStaticMarkup(createElement(ReportView, { report, layout }));
      expect(html).not.toMatch(/currency unknown|Read-time saved-report clarifications|Built before report spec/);
      expect(html).toContain("USD");
      for (const section of ["verdict", "business", "fundamentals", "balanceSheet", "valuation", "quality", "technicals", "leadership", "competitive", "catalystsRisks", "outlook", "appendix"]) expect(html).toContain(`id="report-${section}"`);
    }
  });
  it("loads the new fixture through the sample route", () => {
    const html = renderToStaticMarkup(createElement(SamplePage));
    expect(html).toContain("Mira Vale");
    expect(html).toContain("Synthetic demonstration");
    expect(html).not.toContain("sample report unavailable");
  });
  it("keeps a malformed fixture behind the friendly error", () => {
    state.malformed = true;
    expect(renderToStaticMarkup(createElement(SamplePage))).toContain("sample report unavailable");
  });
});
