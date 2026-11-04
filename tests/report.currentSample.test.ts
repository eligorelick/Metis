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
    expect(report.verdict.executiveSummary?.length).toBeGreaterThanOrEqual(4);
    expect(report.business.whatTheySell.length).toBeGreaterThanOrEqual(4);
    expect(report.business.marketStructure?.length).toBeGreaterThanOrEqual(3);
    expect(report.competitive.competitors?.length).toBeGreaterThanOrEqual(4);
    expect(report.catalystsRisks.catalysts.length).toBeGreaterThanOrEqual(4);
    expect(report.catalystsRisks.catalysts.every(c => /^\d{4}-\d{2}-\d{2}$/.test(c.expectedDate ?? ""))).toBe(true);
    expect(report.catalystsRisks.risks.length).toBeGreaterThanOrEqual(5);
    expect(report.leadership.managementActions?.length).toBeGreaterThanOrEqual(5);
    expect(report.leadership.executives.map(e => e.title)).toEqual(expect.arrayContaining(["Chief Executive Officer", "Chief Financial Officer"]));
    expect(report.leadership.executives.some(e => /^[A-F]$/.test(e.grade))).toBe(true);
    expect(report.business.segments.product.length).toBeGreaterThanOrEqual(2);
    expect(report.leadership.executives.every(e => e.credibilityGrade === "not-assessed")).toBe(true);
    expect(report.appendix.verificationLog?.filter(e => e.executiveEvidenceKind === "execution" && e.validationStatus === "validated").length).toBeGreaterThanOrEqual(2);
    expect(report.meta.verificationRate).toBeGreaterThan(0.30);
    const prose: string[] = [];
    const collectProse = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        if (["text", "synthesis", "oneLineWhy", "narrative"].includes(key) && typeof value === "string") prose.push(value);
        else if (typeof value === "object") collectProse(value);
      }
    };
    for (const section of [report.verdict, report.business, report.fundamentals, report.leadership, report.competitive, report.catalystsRisks]) collectProse(section);
    expect(prose.join(" ")).not.toMatch(/Stage [ABC]|D-\d+|GRADE_OVERRIDE|stage-b-v\d|registry|payload|judge output/i);
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
