import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ReportView } from "@/components/report/ReportView";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import type { DataBundle } from "@/pipeline/types";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { keyDataRows, metricLabel } from "@/report/presentation";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

// Audit 2026-10-22 B-9 and B-20: the P/E and EV/EBITDA labels say the period
// their earnings cover, and the P/E basis names the formula that produced it.

type Rows = Record<string, unknown>[];

function quarters(bundle: DataBundle): Rows {
  if (!bundle.statements.incomeQuarterly.ok) throw new Error("no quarterly income");
  return bundle.statements.incomeQuarterly.value.data.rows as unknown as Rows;
}

function report(bundle: DataBundle) {
  const computed = runStageB(bundle);
  return {
    computed,
    report: buildDataOnlyReport({ symbol: bundle.symbol, companyName: "Test General Co", generatedAt: bundle.builtAt, model: "none", costUsd: 0,
      bundle, validation: { checks: [], flags: [], gaps: [] } as unknown as ValidationReport, computed, costBreakdown: [], reason: "no analysis" }),
  };
}

function surfaces(r: ReturnType<typeof report>["report"]): string[] {
  return [reportToMarkdown(r), reportToPrintBody(r),
    renderToStaticMarkup(createElement(ReportView, { report: r })), renderToStaticMarkup(createElement(ReportView, { report: r, layout: "dossier" }))];
}

function multiple(computed: ReturnType<typeof runStageB>, key: string) {
  if (computed.valuation.kind === "pre-revenue") throw new Error("no multiples");
  return computed.valuation.multiples.multiples.find((m) => m.key === key)!;
}

describe("multiple labels follow the period their earnings cover (audit 2026-10-22 B-9)", () => {
  it("keeps (TTM) when four quarters are summed, and names that window in the record", () => {
    const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
    const { computed, report: r } = report(bundle);
    expect(multiple(computed, "peTtm").period).toBe("TTM to 2026-03-31");
    expect(multiple(computed, "evToEbitda").period).toBe("TTM to 2026-03-31");
    const names = r.valuation.multiples.map((m) => m.name);
    expect(names).toContain("P/E (TTM)");
    expect(names).toContain("EV/EBITDA");
    const labels = keyDataRows(r).map((row) => row.label);
    expect(labels).toContain("P/E (TTM)");
    expect(labels).toContain("EV/EBITDA (TTM)");
    const figure = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] } as unknown as ValidationReport).computed.flatMap((s) => s.figures).find((f) => f.source === "computed.valuation.multiples.peTtm")!;
    expect(figure).toMatchObject({ label: "peTtm (current)", period: "TTM to 2026-03-31" });
    expect(figure.fiscalPeriod).toBeUndefined();
  });

  it("names the fiscal year when TTM was suppressed, in every surface and the record", () => {
    const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
    // A missing 2025-12-31 quarter leaves no four contiguous quarters, so the
    // multiples fall back to FY2025.
    quarters(bundle).splice(1, 1);
    const { computed, report: r } = report(bundle);
    expect(multiple(computed, "peTtm").period).toBe("FY2025");
    expect(multiple(computed, "evToEbitda").period).toBe("FY2025");
    const names = r.valuation.multiples.map((m) => m.name);
    expect(names).toContain("P/E (FY2025)");
    expect(names).toContain("EV/EBITDA (FY2025)");
    const labels = keyDataRows(r).map((row) => row.label);
    expect(labels).toContain("P/E (FY2025)");
    expect(labels).toContain("EV/EBITDA (FY2025)");
    expect(labels.some((label) => /\bTTM\b/.test(label) && /^(P\/E|EV\/EBITDA)/.test(label))).toBe(false);
    for (const text of surfaces(r)) {
      expect(text).toContain("P/E (FY2025)");
      expect(text).not.toContain("P/E (TTM)");
      expect(text).not.toContain("EV/EBITDA (TTM)");
    }
    const figure = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] } as unknown as ValidationReport).computed.flatMap((s) => s.figures).find((f) => f.source === "computed.valuation.multiples.peTtm")!;
    expect(figure).toMatchObject({ label: "peTtm (current)", period: "FY2025", fiscalPeriod: "FY2025" });
    expect(metricLabel("computed.valuation.pettm-current", "", "FY2025")).toBe("P/E (FY2025)");
    expect(metricLabel("computed.valuation.evtoebitda-current", "", "FY2025")).toBe("EV/EBITDA (FY2025)");
    expect(metricLabel("computed.valuation.pettm-current", "", "TTM to 2026-03-31")).toBe("P/E (TTM)");
  });
});

describe("the P/E basis names the formula that ran (audit 2026-10-22 B-20)", () => {
  it("names price / diluted EPS alone when diluted EPS covers the window", () => {
    const { computed, report: r } = report(completeCurrencyBundle({ annualCurrency: "USD" }));
    const basis = multiple(computed, "peTtm").basis;
    expect(basis).toMatch(/^price \/ epsDiluted \(TTM\)/);
    expect(basis).not.toMatch(/fallback|marketCap \/ common income/);
    expect(keyDataRows(r).find((row) => row.label === "P/E (TTM)")?.note).toBeUndefined();
  });

  it("names market cap / common income alone, with the reason, when diluted EPS is missing for a quarter", () => {
    const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
    quarters(bundle)[0]!.epsDiluted = null;
    const { computed, report: r } = report(bundle);
    const pe = multiple(computed, "peTtm");
    expect(pe.current).not.toBeNull();
    expect(pe.basis).toMatch(/^marketCap \/ common income \(TTM; /);
    expect(pe.basis).toContain("diluted EPS not used: no positive diluted EPS covers the period");
    expect(pe.basis).not.toMatch(/price \/ epsDiluted|fallback/);
    const row = keyDataRows(r).find((x) => x.label === "P/E (TTM)");
    expect(row?.note).toBe("market cap / common income, not price / diluted EPS");
    for (const text of surfaces(r)) expect(text).toContain("market cap / common income, not price / diluted EPS");
  });
});
