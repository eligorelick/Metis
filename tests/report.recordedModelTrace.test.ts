import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CapitalBridge } from "@/components/report/CapitalBridge";
import { ValuationSensitivityTables } from "@/components/report/ValuationSensitivityTables";
import { valuationAuditTables } from "@/report/auditTables";
import { recordedValuationTrace } from "@/report/fairValueText";
import { ValuationSection } from "@/components/report/sections";
import { withValuationUseSafety } from "@/report/valuationUseSafety";
import { task28SentinelReport } from "./helpers/task28Report";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { assembleContextPayload } from "@/pipeline/stageC/payload";

function recorded(currency: string | null = "EUR") {
  const report = task28SentinelReport();
  const endpoint = { value: 50, unit: "currency/share", currency, source: "bridge:original:per-share", sourceId: "bridge:original:per-share", asOf: "2026-01-15", verified: false };
  report.valuation.dcf.perShare = endpoint;
  report.valuation.dcf.bridge = { enterpriseValue: 1200, netDebt: 200, minorityInterest: 0, preferredEquity: 0,
    equityValue: 1000, dilutedShares: 20, presentValueExplicit: 600, presentValueTerminal: 600, currency, asOf: "2026-01-15" };
  report.valuation.dcf.excessReturnGrid = { rows: [{ label: "Recorded start", startReturnPct: 12, bookValue: 1000 }], costOfEquityPcts: [10], perShare: [[48]], notes: ["Recorded diagnostic, not current valuation evidence"] };
  report.fairValue = { status: "available", method: "excess-return", methodVersion: "recorded", perShare: endpoint, upsidePct: 25, basis: ["Recorded model"], reasons: [] };
  delete report.valuation.marketValueScope;
  return { original: report, view: withValuationUseSafety(report) };
}

it("keeps known currency in retained sensitivity diagnostics without reopening the headline", () => {
  const { original, view } = recorded();
  expect(view.valuation.dcf.perShare).toBeNull(); expect(view.fairValue?.perShare).toBeNull(); expect(view.fairValue?.upsidePct).toBeNull();
  const trace = view.fairValue?.auditValue ?? null;
  expect(trace).toEqual(original.valuation.dcf.perShare);
  const html = renderToStaticMarkup(createElement(ValuationSensitivityTables, { dcf: view.valuation.dcf, recordedPerShare: trace }));
  expect(html.includes("EUR")).toBe(true);
  expect(valuationAuditTables(view.valuation.dcf, trace).find(t => t.heading.includes("starting return"))?.rows[0]?.join(" ")).toContain("EUR");
});

it("keeps recorded excess-return currency in the classic report table", () => {
  const { view } = recorded();
  const html = renderToStaticMarkup(createElement(ValuationSection, {
    valuation: view.valuation, fairValue: view.fairValue, presentation: "classic", index: 7,
  }));
  const grid = html.slice(html.indexOf("Sensitivity (per share"));
  expect(grid).toContain("EUR");
  expect(grid).not.toContain("48.00 (currency unknown)");
  expect(view.fairValue?.perShare).toBeNull();
});

it("retains original bridge endpoint provenance as an explicit audit diagnostic", () => {
  const { view } = recorded();
  const html = renderToStaticMarkup(createElement(CapitalBridge, { dcf: view.valuation.dcf, recordedPerShare: view.fairValue?.auditValue ?? null }));
  expect(html.includes("Recorded bridge per-share endpoint")).toBe(true);
  expect(html.includes("bridge:original:per-share")).toBe(true); expect(html.includes("2026-01-15")).toBe(true);
  expect(html).toContain("audit only"); expect(view.valuation.dcf.perShare).toBeNull();
});

it("preserves unknown denomination instead of borrowing the listing currency", () => {
  const { view } = recorded(null), trace = view.fairValue?.auditValue ?? null;
  const html = renderToStaticMarkup(createElement(ValuationSensitivityTables, { dcf: view.valuation.dcf, recordedPerShare: trace }));
  expect(/currency (?:unknown|not recorded)/.test(html)).toBe(true); expect(html.includes("EUR")).toBe(false);
  expect(view.fairValue?.currentUse?.status).toBe("unestablished");
});

it.each(["missing-quote", "future-quote", "dated-reference"] as const)("keeps a new %s model trace diagnostic-only with its own date and units", mode => {
  const bundle = completeCurrencyBundle({});
  if (!bundle.quote.ok) throw Error("fixture quote");
  if (mode === "missing-quote") delete bundle.quote.value.data.rows[0]!.timestamp;
  if (mode === "dated-reference") {
    bundle.builtAt = "2026-11-05T22:00:00Z";
    bundle.quote.value.data.rows[0]!.timestamp = Date.parse("2026-11-04T20:00:00Z") / 1000;
  }
  const c = runStageB(bundle), before = JSON.stringify(c);
  expect(c.fairValue.status).toBe(mode === "dated-reference" ? "dated-reference" : "suppressed");
  const report = buildDataOnlyReport({ symbol: bundle.symbol, companyName: "Synthetic diagnostic", generatedAt: bundle.builtAt,
    model: "none", costUsd: 0, bundle, computed: c, validation: { checks: [], flags: [], gaps: [] }, costBreakdown: [], reason: "offline diagnostic" });
  expect(report.valuation.dcf.perShare).toBeNull(); expect(report.valuation.dcf.upsidePct).toBeNull();
  const trace = recordedValuationTrace(report.valuation.dcf, report.fairValue);
  expect(trace?.unit).toBe("USD/share"); expect(trace?.asOf).toBe("2026-03-31");
  expect(trace?.value).toBe(34.59);
  const payload = assembleContextPayload(bundle, c, { checks: [], flags: [], gaps: [] });
  const extrema = payload.computed.find(section => section.title === "Deterministic scenario interpretation")!.figures.filter(figure => figure.label.includes("sensitivity-grid value"));
  expect(extrema).toHaveLength(2);
  for (const figure of extrema) { expect(figure.unit).toBe("USD/share"); expect(figure.asOf).toBe("2026-03-31"); }
  expect(report.valuation.scenarios.every(scenario => scenario.priceTarget === null)).toBe(true);
  expect(JSON.stringify(c)).toBe(before);
});
