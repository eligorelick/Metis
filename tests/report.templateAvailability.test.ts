import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { runStageB } from "@/pipeline/compute";
import { computeDcfDisplay } from "@/pipeline/stageB/fairValue";
import { valuationAuditTables } from "@/report/auditTables";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { DISCLAIMER_TEXT, type FilingDisclosures } from "@/report/schema";
import { applyScenarioPresentation, buildScenarioPresentation } from "@/report/scenarioPresentation";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

const surfaces = [
  ["live", (report: ReturnType<typeof loadTask28Fixture>) => renderToStaticMarkup(createElement(ReportView, { report }))],
  ["Markdown", reportToMarkdown], ["print", reportToPrintBody],
] as const;
const geographyNote = "Annual geographic revenue (2025-12-31; USD; filed 2026-02-12; https://www.sec.gov/Archives/edgar/data/42/annual.htm). Disclosed allocation basis: Revenue is attributed by the point of sale, except advertising allocated by advertiser location.";

describe("report availability labels follow the retained data", () => {
  it.each(surfaces)("preserves entity DCF and operating paths when per-share targets are withheld in %s", (_name, render) => {
    const computed = runStageB(completeCurrencyBundle({}));
    if (computed.valuation.kind !== "dcf" || !computed.valuation.dcf) throw new Error("fixture DCF");
    computed.valuation.dcf.perShare = null;
    computed.valuation.dcf.bridge.dilutedShares = null;
    computed.scenarioTargets.status = "suppressed";
    computed.scenarioTargets.targets.forEach(target => { target.perShare = null; });
    const report = loadTask28Fixture();
    report.valuation.dcf = { ...report.valuation.dcf, ...computeDcfDisplay(computed.valuation, "USD") };
    report.valuation = applyScenarioPresentation(report.valuation, computed, false);
    report.valuation.scenarios.forEach(s => { s.priceTarget = null; s.horizon = "n/a"; });
    report.scenarioPresentation = buildScenarioPresentation(computed);
    report.projections = computed.projections;
    const text = render(report);
    expect(text).toContain("Entity DCF and numerical operating scenario paths are available");
    expect(text).toContain("per-share scenario targets are withheld");
    expect(text).toContain("Revenue growth path");
    expect(text).toContain("per-share target unavailable");
    expect(/Bull - unavailable \(n\/a\)/.test(text)).toBe(false);
    expect(text).not.toContain("Computational DCF scenarios are unavailable");
    expect(text).not.toContain("Deterministic scenario inputs unavailable");
  });

  it.each(surfaces)("distinguishes undisclosed claims modeled at zero from explicit zero and a missing net-debt bridge in %s", (_name, render) => {
    const report = loadTask28Fixture();
    report.valuation.dcf.bridge = { enterpriseValue: 100, netDebt: 10, minorityInterest: null, preferredEquity: null, equityValue: 90, dilutedShares: null, presentValueExplicit: 50, presentValueTerminal: 50, currency: "USD", asOf: "2025-12-31" };
    const table = () => valuationAuditTables(report.valuation.dcf)[0]!;
    expect(table().rows.find(r => r[0] === "Less preferred equity")?.[1]).toContain("not disclosed; model uses 0");
    expect(table().rows.find(r => r[0] === "Less minority interest")?.[1]).toContain("not disclosed; model uses 0");
    expect(render(report)).toContain("not disclosed; model uses 0");
    report.valuation.dcf.bridge.preferredEquity = 0;
    expect(table().rows.find(r => r[0] === "Less preferred equity")?.[1]).not.toContain("not disclosed");
    report.valuation.dcf.bridge.netDebt = null;
    report.valuation.dcf.bridge.equityValue = null;
    expect(table().rows.find(r => r[0] === "Less net debt (negative means net cash)")?.[1]).toBe("unavailable");
  });

  it.each(surfaces)("qualifies the disclaimer without asserting that withheld targets are present in %s", (_name, render) => {
    expect(DISCLAIMER_TEXT).toContain("Where present, A-F letter grades and scenario price targets");
    expect(DISCLAIMER_TEXT).not.toContain("This report contains");
    const report = loadTask28Fixture();
    report.meta.disclaimer = DISCLAIMER_TEXT;
    report.valuation.scenarios.forEach(s => { s.priceTarget = null; });
    expect(render(report)).toContain("Where present, A-F letter grades and scenario price targets");
  });

  it.each(surfaces)("keeps annual primary geography beside its table and out of guidance in %s", (_name, render) => {
    const report = loadTask28Fixture();
    report.business.segments.geographic = [{ name: "Point-of-sale geography", revenue: { value: 100, unit: "currency", currency: "USD", source: "https://www.sec.gov/Archives/edgar/data/42/annual.htm", asOf: "2025-12-31", verified: null, verificationNote: geographyNote }, sharePct: 100 }];
    report.business.segments.product[0]!.name = "UNNECESSARY_ANNUAL_PRODUCT";
    report.filingDisclosures = { version: "1.0.0", currency: "USD", currencyBasis: "USD", guidance: null, guidanceChecks: [], freeCashFlow: [], freeCashFlowDefinition: null, capitalReturn: null, events: [], quarterlyTrend: [], reconciliation: [], commitments: [], notes: [geographyNote],
      segments: [{ axis: "BusinessSegments", axisLabel: "Business", currency: "USD", quarters: ["2026-03-31"], rows: [{ label: "Current business segment", childOf: null, values: [100] }], total: [100], priorPresentation: [], derivedCells: 0, sources: ["10-Q"] }],
    } satisfies FilingDisclosures;
    const text = render(report);
    expect(text).toContain("Point-of-sale geography");
    expect(text).toContain("Revenue is attributed by the point of sale");
    expect(text).not.toContain("UNNECESSARY_ANNUAL_PRODUCT");
    expect(filingDisclosureTables(report.filingDisclosures, "outlook").map(t => t.note).join(" ")).not.toContain("Annual geographic revenue");
    expect(reportToAuditMarkdown(report)).toContain("Point-of-sale geography");
    expect(reportToAuditMarkdown(report)).toContain("Revenue is attributed by the point of sale");
  });
});
