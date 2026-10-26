/**
 * Audit 2026-10-22 B-31 (batch 2b): bank, insurer and mortgage-REIT reports
 * printed a WACC and a pre-tax cost of debt, with a tick, although those
 * routes value equity at the cost of equity alone. On a bank the cost of debt
 * is not a borrowing cost at all: BAC's 22.7% is all interest expense, mostly
 * on deposits and repo, over long-term debt alone.
 *
 * The owner's rule: withhold the cost of debt and the WACC on those routes,
 * with a note that the route values equity at the cost of equity, so no
 * surface shows a figure the route does not use. Keep the cost of equity.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { computeWacc, waccByFiscalYear, waccDisclosure, type WaccInputs } from "@/pipeline/stageB/returns";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

// BAC's trailing inputs (audit/refutation/B-31.md): $74.09B interest expense
// over $326.64B average long-term debt.
const BAC: WaccInputs = {
  beta: 1.3, riskFreePct: 4.12, erpPct: 4.18, interestExpenseTtm: 74.09e9, totalDebtAvg: 326.64e9,
  marketCap: 341e9, effectiveTaxRate: 0.233, ebitTtm: 35e9, analysisDate: "2026-10-22", isFinancial: true,
  reportedCurrency: "USD", quoteCurrency: "USD",
};
const RF = [{ date: "2023-12-29", value: 3.88 }, { date: "2024-12-31", value: 4.58 }, { date: "2025-12-31", value: 4.18 }];
const YEARS = ["2023-12-31", "2024-12-31", "2025-12-31"];

describe("B-31: WACC and cost of debt withheld on equity-valued routes", () => {
  it("keeps the cost of equity and withholds the WACC and cost of debt, saying why", () => {
    const priced = computeWacc({ ...BAC, isFinancial: false });
    expect(priced.costOfDebtPct).not.toBeNull();
    const w = computeWacc({ ...BAC, equityOnlyRoute: "bank" });
    expect(w.costOfEquityPct).toBe(priced.costOfEquityPct);
    expect(w.waccPct).toBeNull();
    expect(w.waccRawPct).toBeNull();
    expect(w.costOfDebtPct).toBeNull();
    expect(w.weightDebt).toBeNull();
    expect(w.syntheticRating).toBeNull();
    expect(w.withheld).toMatch(/bank route values equity at the cost of equity/);
    expect(w.notes[0]).toBe(w.withheld);
    expect(w.notes.join(" ")).not.toMatch(/22\.68|cost of debt \d/);
    expect(w.gaps).toContainEqual(expect.objectContaining({ field: "returns.wacc", severity: "info", expected: true }));
    expect(w.gaps.some((g) => g.severity !== "info")).toBe(false);
    const summary = waccDisclosure(w).summary;
    expect(summary).toMatch(/^Cost of equity [\d.]+%: .*; WACC and pre-tax cost of debt withheld on this route$/);
    expect(summary).not.toMatch(/WACC n\/a|cost of debt unavailable/);
  });

  it("withholds them, saying why, even when the cost of equity itself cannot be computed", () => {
    for (const missing of [{ erpPct: null, analysisDate: "2030-06-30" }, { beta: null }, { riskFreePct: null }] as const) {
      const w = computeWacc({ ...BAC, ...missing, equityOnlyRoute: "bank" });
      expect(w.costOfEquityPct).toBeNull();
      expect(w.withheld).toMatch(/bank route values equity at the cost of equity/);
      expect(w.notes[0]).toBe(w.withheld);
      expect(w.gaps).toContainEqual(expect.objectContaining({ field: "returns.wacc", severity: "info", expected: true }));
      expect(waccDisclosure(w).summary).toMatch(/WACC and pre-tax cost of debt withheld on this route$/);
    }
  });

  it("computes no per-fiscal-year WACC history and says nothing about one", () => {
    // The excess-return evidence compares each year's return with the current
    // cost of equity, as it did before the WACC was withheld.
    const w = computeWacc({ ...BAC, equityOnlyRoute: "insurer" });
    for (const years of [YEARS, []]) {
      const history = waccByFiscalYear(w, years, RF);
      expect(history.points).toEqual([]);
      expect(history.notes).toEqual([]);
      expect(history.gaps).toEqual([]);
      expect(history.basis).not.toMatch(/WACC/);
    }
  });

  it.each([
    ["JPM", "Banks - Diversified", "bank"],
    ["PGR", "Insurance - Property & Casualty", "insurer"],
    ["NLY", "REIT - Mortgage", "reit-mortgage"],
  ] as const)("%s: no surface shows a WACC or cost of debt, and the fair value is unchanged in kind", (symbol, industry, route) => {
    const b = completeCurrencyBundle({ symbol });
    if (!b.profile.ok) throw new Error("profile absent");
    Object.assign(b.profile.value.data.rows[0]!, { sector: industry.startsWith("REIT") ? "Real Estate" : "Financial Services", industry });
    const computed = runStageB(b);
    expect(computed.route.base).toBe(route);
    expect(computed.valuation.kind).toBe("excess-return");
    expect(computed.returns.wacc.costOfEquityPct).not.toBeNull();
    expect(computed.returns.wacc.waccPct).toBeNull();
    expect(computed.returns.wacc.costOfDebtPct).toBeNull();
    expect(computed.returns.notes.join(" ")).not.toMatch(/WACC \d|cost of debt \d/);
    expect(computed.returns.notes.join(" ")).not.toMatch(/per-fiscal-year WACC/);
    expect(computed.gaps.map((g) => g.reason).join(" ")).toMatch(new RegExp(`${route} route values equity at the cost of equity`));

    const payload = serializePayloadForPrompt(assembleContextPayload(b, computed, { checks: [], flags: [], gaps: [] }));
    expect(payload).not.toMatch(/^- WACC:|^- cost of debt \(pre-tax\):/m);
    expect(payload).toMatch(/^- cost of equity: [\d.]+ %/m);
    expect(payload).not.toMatch(/WACC \d|cost of debt \d/);
    expect(payload).toMatch(/route values equity at the cost of equity/);

    const report = buildDataOnlyReport({ symbol: b.symbol, companyName: "Synthetic financial", generatedAt: b.builtAt,
      model: "none", costUsd: 0, bundle: b, computed, validation: { checks: [], flags: [], gaps: [] },
      costBreakdown: [], reason: "Offline route regression" });
    const rows = report.fundamentals.returns.map((row) => row.label);
    expect(rows).toContain(`Cost of equity (the ${route} route values equity at the cost of equity; no WACC or cost of debt is used)`);
    expect(rows).not.toContain("WACC");
    expect(rows).not.toContain("Pre-tax cost of debt");
    for (const surface of [reportToMarkdown(report), reportToPrintBody(report), reportToAuditMarkdown(report)]) {
      expect(surface).not.toMatch(/\| WACC \||>WACC<|Pre-tax cost of debt/);
      expect(surface).toMatch(/values equity at the cost of equity/);
    }
  });
});
