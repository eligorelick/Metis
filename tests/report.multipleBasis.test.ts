import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { applyMultiples } from "@/pipeline/stageC/passes";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { ReportSchema, judgeOutputToJsonSchema } from "@/report/schema";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown, reportToAuditMarkdown } from "@/report/export/markdown";
import { keyDataRows } from "@/report/presentation";
import { reportToPrintBody } from "@/report/export/printHtml";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

function fixture() {
  const bundle = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  const computed = runStageB(bundle);
  const raw = computed.valuation.multiples!.multiples.find(m => m.key === "priceToBook")!;
  const report = loadTask28Fixture();
  report.valuation = applyMultiples(report.valuation, computed.valuation);
  return { bundle, computed, raw, report };
}
describe("admitted multiple basis survives report compilation", () => {
  it("retains the deterministic P/B basis and exact multiple through strict serialization", () => {
    const { report, raw } = fixture();
    expect(raw.basis).toContain("repurchases and omitted internally generated intangibles");
    const stored = ReportSchema.parse(report);
    expect(stored.valuation.multiples.find(m => m.name === "P/B")).toMatchObject({ current: raw.current, basis: raw.basis });
    const visit = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const props = (node as { properties?: Record<string, unknown> }).properties;
      if (props && "current" in props && "peerMedian" in props && "sectorAppropriate" in props) expect(props).not.toHaveProperty("basis");
      for (const child of Object.values(node)) visit(child);
    };
    visit(judgeOutputToJsonSchema());
  });
  it.each(["ui", "markdown", "print", "audit"])("shows the limitation beside the multiple in %s", surface => {
    const { report } = fixture();
    const text = surface === "ui" ? renderToStaticMarkup(createElement(ReportView, { report })) : surface === "markdown" ? reportToMarkdown(report) : surface === "print" ? reportToPrintBody(report) : reportToAuditMarkdown(report);
    expect(text).toContain("carrying parent common-equity measure");
    expect(text).toContain("repurchases and omitted internally generated intangibles");
    expect(text).toContain("does not independently establish expensiveness");
  });
  it("carries admitted row bases into the model payload with their metric identity", () => {
    const { bundle, computed, raw } = fixture();
    const section = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] }).computed.find(s => s.title === "Valuation (computed)");
    expect(section?.notes).toContain(`priceToBook: ${raw.basis}`);
  });
  it("reads legacy rows without manufacturing a basis", () => {
    const report = loadTask28Fixture();
    report.valuation.multiples = [{ name: "P/B", current: 2, peerMedian: null, own5yPercentile: null, sectorAppropriate: true }];
    expect(ReportSchema.parse(report).valuation.multiples[0]).not.toHaveProperty("basis");
    expect(() => reportToMarkdown(report)).not.toThrow();
  });
});

describe("P/E on gain-inflated earnings (AMZN audit 2026-10-20)", () => {
  it("carries the caveat to the headline P/E in Key data without asking the judge for it", () => {
    const { computed, report } = fixture();
    const pe = computed.valuation.multiples!.multiples.find(m => m.key === "peTtm")!;
    expect(pe.current).not.toBeNull();
    pe.gainInflatedEarnings = { nonOperatingSharePct: 46, basis: "non-operating income is 46% of pre-tax income" };
    report.valuation = applyMultiples(report.valuation, computed.valuation);
    const stored = ReportSchema.parse(report);
    const row = keyDataRows(stored).find(r => /^P\/E/.test(r.label));
    expect(row?.note).toBe("caveat: non-operating income is 46% of pre-tax income");
    expect(reportToMarkdown(stored)).toContain("caveat: non-operating income is 46% of pre-tax income");
    expect(JSON.stringify(judgeOutputToJsonSchema())).not.toContain("earningsCaveat");
  });

  // Codex review of PR #41: the caveat says the P/E is not ranked, so the
  // multiples table must not show an own-history rank for it either.
  it("shows no own-history rank for a P/E the caveat says is not ranked", () => {
    const { computed, report } = fixture();
    const pe = computed.valuation.multiples!.multiples.find(m => m.key === "peTtm")!;
    pe.ownHistory = { ...(pe.ownHistory ?? {}), percentileRank: 2.7, observations: 20, basis: "20 quarter-end observations", observationDetails: [] } as unknown as typeof pe.ownHistory;
    pe.gainInflatedEarnings = { nonOperatingSharePct: 46, basis: "non-operating income is 46% of pre-tax income" };
    const flagged = applyMultiples(report.valuation, computed.valuation).multiples.find(m => /^P\/E/.test(m.name))!;
    expect(flagged.own5yPercentile).toBeNull();
    expect(flagged.ownHistoryObservations).toBeNull();
    expect(flagged).not.toHaveProperty("ownHistoryDetails");
    expect(flagged.ownHistoryBasis).toBe("not ranked: non-operating income is 46% of pre-tax income");
    delete pe.gainInflatedEarnings;
    const ranked = applyMultiples(report.valuation, computed.valuation).multiples.find(m => /^P\/E/.test(m.name))!;
    expect(ranked.own5yPercentile).toBe(2.7);
    expect(ranked.ownHistoryObservations).toBe(20);
  });
});
