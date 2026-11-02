import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function fixture(options: { bank?: boolean; recent?: boolean; beta?: number } = {}) {
  const b = completeCurrencyBundle({ bank: options.bank });
  if (!b.profile.ok) throw new Error("fixture profile");
  Object.assign(b.profile.value.data.rows[0]!, { ipoDate: options.recent === false ? "2000-01-01" : "2025-09-12", beta: options.beta ?? -0.02 });
  const dates = ["2025-09-30", "2025-10-31", "2025-11-28", "2025-12-31", "2026-01-30", "2026-02-27", "2026-03-31", "2026-04-30", "2026-05-29", "2026-06-30"];
  const rows = dates.map((date, i) => ({ date, close: 100 + i * 2 + i % 3, adjClose: 100 + i * 2 + i % 3 }));
  const price = { ok: true as const, value: { source: "fmp" as const, endpoint: "prices", asOf: "2026-06-30", fetchedAt: b.builtAt, data: { rows, raw: rows } } };
  b.eodPrices = price;
  b.benchmarkPrices.spy = price;
  return b;
}

describe("R-FIGR-2 recent-IPO cost-of-equity refusal", () => {
  it("explains the failed issuer-history and unavailable bottom-up alternatives without manufacturing a discount rate", () => {
    const b = fixture(); const before = JSON.stringify(b);
    const c = runStageB(b); const w = c.returns.wacc;
    expect(w.costOfEquityPct).toBeNull();
    expect(w.waccPct).toBeNull();
    expect(w.betaRaw).toBe(-0.02);
    expect(w.betaFinal).toBeNull();
    expect(w.notes.join(" ")).toMatch(/recent IPO.*9.*24.*peer price histories/i);
    expect(w.notes.join(" ")).toMatch(/sector ETF.*issuer.*beta/i);
    expect(w.gaps.find(g => g.field === "returns.wacc.beta")?.reason).toMatch(/bottom-up beta.*not substituted/i);
    expect(c.returns.waccInputs.summary).toMatch(/peer price histories/i);
    expect(serializePayloadForPrompt(assembleContextPayload(b, c, { checks: [], flags: [], gaps: [] }))).toMatch(/peer price histories/i);
    expect(JSON.stringify(b)).toBe(before);
  });

  it("F9 distinguishes discovered candidates from a peer collection with no populated candidate", () => {
    const b = fixture();
    b.peerFundamentals = { candidates: {}, candidateCount: 9, exclusions: [], notes: [] };
    const notes = runStageB(b).returns.wacc.notes.join(" ");
    expect(notes).toContain("No peer candidate was populated (9 discovered; see exclusions)");
    expect(notes).toMatch(/would retain profiles, quotes and quarterly statements only, without peer price histories/);
    expect(notes).not.toContain("retains 0 candidate(s), with profiles");
  });

  it("keeps the refusal and explanation on a recent bank without changing bank routing", () => {
    const c = runStageB(fixture({ bank: true }));
    expect(c.route.base).toBe("bank");
    expect(c.returns.wacc.costOfEquityPct).toBeNull();
    expect(c.returns.wacc.notes.join(" ")).toMatch(/recent IPO/i);
  });

  it("preserves the existing valid-beta path and makes no claim of an approved fallback", () => {
    const c = runStageB(fixture({ beta: 1.1 }));
    expect(c.returns.wacc.costOfEquityPct).toBeGreaterThan(0);
    expect(c.returns.wacc.betaRaw).toBe(1.1);
    expect(c.returns.wacc.notes.join(" ")).not.toContain("Bottom-up beta was not substituted");
  });

  it("keeps a mature issuer's existing beta refusal without calling it a recent IPO", () => {
    const c = runStageB(fixture({ recent: false }));
    expect(c.returns.wacc.costOfEquityPct).toBeNull();
    expect(c.returns.wacc.notes.join(" ")).not.toMatch(/recent IPO/i);
  });

  it("retains the explanation on saved-report readers and all exports without changing the report bytes", () => {
    const b = fixture(); const computed = runStageB(b);
    const report = buildDataOnlyReport({ symbol: b.symbol, companyName: "Example", generatedAt: b.builtAt, model: "none", costUsd: 0,
      bundle: b, validation: { checks: [], flags: [], gaps: [] }, computed, costBreakdown: [], reason: "offline" });
    const before = JSON.stringify(report);
    for (const output of [renderToStaticMarkup(createElement(ReportView, { report })),
      renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" })),
      reportToMarkdown(report), reportToPrintHtml(report, { autoPrint: false }), reportToAuditMarkdown(report)]) {
      expect(output).toContain("peer price histories");
    }
    expect(JSON.stringify(report)).toBe(before);
  });
});
