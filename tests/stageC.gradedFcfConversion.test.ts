/** AI-511: only the FCF conversion the balance-sheet score graded is called graded, and its window is named. */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import type { ValidationReport } from "@/pipeline/stageA/validate";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;
/** Labelling the sibling quarters makes the trailing-twelve-month window usable (the default fixture is on the annual basis). */
const TTM_USD = ["USD", "USD", "USD", "USD"] as const;

describe("graded FCF conversion (AI-511)", () => {
  it("calls graded only the FCF conversion the balance-sheet score graded, with its window (AI-511)", () => {
    const bundle = completeCurrencyBundle({ siblingQuarterCurrencies: TTM_USD });
    const computed = runStageB(bundle);
    const current = computed.capital.current!;
    expect(current).toMatchObject({ basis: "ttm", asOf: "2026-03-31", periodStart: "2025-04-01" }); // precondition
    const signal = (computed.scores.aspects.balanceSheet.signals ?? []).find((s) => s.id === "fcfConversionBeforeSbc")!;
    expect(signal.raw).toBeCloseTo(current.fcfConversionBeforeSbc!, 10); // grading.ts, unchanged
    expect(signal.raw).toBeCloseTo(1.0, 6);
    expect(computed.capital.fcf.latestConversionBeforeSbc).toBeCloseTo(1.2, 6); // the two windows differ here
    const payload = assembleContextPayload(bundle, computed, EMPTY_VALIDATION);
    const registry = payload.provenanceRegistry ?? [];
    expect(registry.filter((r) => /graded ratio/i.test(String(r.label ?? "")))).toEqual([]); // the defect
    expect(registry.find((r) => r.id === "computed.capital-cash.fcf-conversion-latest-fiscal-year-before-sbc"))
      .toMatchObject({ value: computed.capital.fcf.latestConversionBeforeSbc, asOf: "2025-12-31" });
    const notes = payload.computed.find((s) => s.title === "Current capital (computed)")!.notes;
    expect(notes).toContain(`The balance-sheet score grades "fcf conversion before sbc" from this section (ttm: ${current.periodStart} to 2026-03-31); "FCF conversion (latest fiscal year, before SBC)" under "Capital & cash (computed)" is the fiscal-year ratio, reported beside it and not graded.`);
    // Controls: the graded figure keeps both its ids (the D-62 alias group).
    expect(registry.some((r) => r.id === "computed.current-capital.fcf-conversion-before-sbc")).toBe(true);
    expect(registry.find((r) => r.id === "computed.capital.current.fcfConversionBeforeSbc")).toMatchObject({ value: signal.raw });
  });

  it("does not call the fiscal-year series the graded ratio in a data-only report", () => {
    const bundle = completeCurrencyBundle({});
    const report = buildDataOnlyReport({ symbol: bundle.symbol, companyName: "Test General Co", generatedAt: "2026-07-06T12:00:00.000Z", model: "none", costUsd: 0,
      bundle, validation: EMPTY_VALIDATION, computed: runStageB(bundle), costBreakdown: [], reason: "no analysis" });
    const row = report.fundamentals.fcf.find((r) => r.values[0]?.value.source === "computed.capital.fcf.conversionBeforeSbc")!;
    expect(row.label).toBe("FCF conversion (FCF before SBC / net income)");
    expect(report.fundamentals.fcf.some((r) => r.label === "FCF conversion (FCF after SBC / net income)")).toBe(true); // control
  });

  it("names the annual window when the snapshot falls back, and adds nothing where FCF conversion is not graded (review focus 9)", () => {
    const annual = completeCurrencyBundle({ siblingQuarterCurrencies: TTM_USD }); // TTM-capable, so the gap below is what forces the fallback
    (annual.statements as { cashflowQuarterly: unknown }).cashflowQuarterly = { ok: false, gap: { field: "fixture", reason: "fixture gap", severity: "info" } };
    const computed = runStageB(annual);
    const current = computed.capital.current!;
    expect(current.basis).toBe("annual");
    expect(assembleContextPayload(annual, computed, EMPTY_VALIDATION).computed.find((s) => s.title === "Current capital (computed)")!.notes
      .some((n) => n === `The balance-sheet score grades "fcf conversion before sbc" from this section (annual: ${current.periodStart} to ${current.asOf}); on this basis the graded value is computed over the latest fiscal year, the year "FCF conversion (latest fiscal year, before SBC)" under "Capital & cash (computed)" reports.`)).toBe(true);
    const bank = completeCurrencyBundle({ bank: true });
    expect(JSON.stringify(assembleContextPayload(bank, runStageB(bank), EMPTY_VALIDATION).computed)).not.toContain("The balance-sheet score grades");
  });
});
