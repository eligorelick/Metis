/**
 * A statement block holds one column per fiscal period, the row Stage B uses
 * (audit 2026-10-27 AI-505): the provably latest row, a period served twice with
 * no provable order left out and disclosed.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { matchProvenanceRecord } from "@/pipeline/stageC/provenance";
import type { DataBundle } from "@/pipeline/types";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;

function withRestatedYear(recency: "later" | "tied"): DataBundle {
  const bundle = completeCurrencyBundle({});
  const rows = (bundle.statements.incomeAnnual as unknown as { value: { data: { rows: Record<string, unknown>[] } } }).value.data.rows;
  rows.push({ ...rows[3], date: "2021-12-31", fiscalYear: "2021", revenue: 600e6, netIncome: 100e6 });   // a fifth distinct year, so the window can lose one
  const original = { ...rows[0], filingDate: "2026-02-20", ...(recency === "later" ? { acceptedDate: "2026-02-20 16:05:00" } : {}) };
  const restated = { ...original, revenue: 985e6, netIncome: 147.75e6,
    ...(recency === "later" ? { filingDate: "2026-05-15", acceptedDate: "2026-05-15 16:05:00" } : {}) };   // "tied": the same filing day, no acceptance time
  rows.splice(0, 1, original, restated);
  return bundle;
}
const REVENUE_FY2025 = "payload.statements.income-statement-annual.2025-12-31.revenue";

describe("statement blocks collapse a period served twice (AI-505)", () => {
  it("shows one column per fiscal period and registers only the restated figure (AI-505)", async () => {
    const bundle = withRestatedYear("later");
    const computed = runStageB(bundle);
    expect(computed.growth.revenueCagrs.find((c) => c.windowYears === 1)?.endValue).toBe(985e6);   // precondition: Stage B uses the restatement
    const payload = assembleContextPayload(bundle, computed, EMPTY_VALIDATION);
    const block = payload.statements.find((b) => b.title === "Income statement — annual")!;
    expect(block.periods).toEqual(["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"]);
    expect(block.notes).toContain("Fiscal period 2025-12-31 was served 2 times with different filing dates; only the provably latest filing is shown, the row Stage B uses.");
    const registry = payload.provenanceRegistry ?? [];
    expect(registry.filter((r) => r.id.startsWith(REVENUE_FY2025)).map((r) => [r.id, r.value])).toEqual([[REVENUE_FY2025, 985e6]]);
    const claim = (value: number) => ({ source: REVENUE_FY2025, value, unit: "currency", currency: "USD", period: "2025-12-31", asOf: "2025-12-31" });
    expect(matchProvenanceRecord(claim(1000e6) as never, registry).ok).toBe(false);   // the superseded figure
    expect(matchProvenanceRecord(claim(985e6) as never, registry).ok).toBe(true);     // control
    const verdict = async (text: string) => (await runVerifyPass({} as PassDeps, payload, { commentary: [{ label: "FACT", text, source: REVENUE_FY2025, asOf: "2025-12-31" }] }))
      .log.find((e) => e.evidenceKind === "factual-claim")?.validationStatus;
    expect(await verdict("Revenue for FY2025 was USD 1.000 billion.")).not.toBe("validated");
    expect(await verdict("Revenue for FY2025 was USD 0.985 billion.")).toBe("validated");   // control
  });

  it("leaves out a period served twice with no provable filing order, as Stage B does (review focus 6)", () => {
    const bundle = withRestatedYear("tied");
    const computed = runStageB(bundle);
    const payload = assembleContextPayload(bundle, computed, EMPTY_VALIDATION);
    const block = payload.statements.find((b) => b.title === "Income statement — annual")!;
    expect(block.periods).toEqual(["2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"]);
    expect(block.notes).toContain("Fiscal period 2025-12-31 was served more than once with no provably latest filing; it is left out, as Stage B leaves it out.");
    expect((payload.provenanceRegistry ?? []).some((r) => r.id.startsWith("payload.statements.income-statement-annual.2025-12-31."))).toBe(false);
    expect(computed.gaps.some((g) => g.field === "growth.incomeStatement.period" && g.reason.startsWith("annual income period 2025-12-31 dropped"))).toBe(true);   // Stage B agrees
  });

  it("collapses a restated quarterly balance sheet before the debt admission (review focus 6)", () => {
    const bundle = completeCurrencyBundle({});
    const rows = (bundle.statements.balanceQuarterly as unknown as { value: { data: { rows: Record<string, unknown>[] } } }).value.data.rows;
    const original = { ...rows[0], acceptedDate: "2026-05-01 16:05:00" };
    rows.splice(0, 1, original, { ...original, acceptedDate: "2026-08-03 16:05:00", totalAssets: 2100e6 });
    const block = assembleContextPayload(bundle, runStageB(bundle), EMPTY_VALIDATION).statements.find((b) => b.title === "Balance sheet — quarterly")!;
    expect(block.periods).toEqual(["2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30"]);
    expect(block.lineItems.find((l) => l.lineItem === "total assets")!.byPeriod[0]).toMatchObject({ period: "2026-03-31", value: 2100e6 });
    expect(block.notes[0]).toBe("Fiscal period 2026-03-31 was served 2 times with different filing dates; only the provably latest filing is shown, the row Stage B uses.");   // collapse notes lead
  });

  it("notes no duplicate older than the block's window (review focus 10; control, passes on HEAD too)", () => {
    const bundle = completeCurrencyBundle({});
    const rows = (bundle.statements.incomeAnnual as unknown as { value: { data: { rows: Record<string, unknown>[] } } }).value.data.rows;
    const year = (y: number, extra: Record<string, unknown> = {}) => ({ ...rows[3], date: `${y}-12-31`, fiscalYear: String(y), ...extra });
    rows.push(year(2021), year(2020), year(2019, { filingDate: "2020-02-20" }), year(2019, { filingDate: "2021-02-20", revenue: 500e6 }));
    const block = assembleContextPayload(bundle, runStageB(bundle), EMPTY_VALIDATION).statements.find((b) => b.title === "Income statement — annual")!;
    expect(block.periods).toEqual(["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"]);
    expect(block.notes.some((n) => n.startsWith("Fiscal period "))).toBe(false);
  });

  it("leaves a bundle with no duplicate period as it was (control)", () => {
    const payload = assembleContextPayload(completeCurrencyBundle({}), runStageB(completeCurrencyBundle({})), EMPTY_VALIDATION);
    for (const block of payload.statements) {
      expect(new Set(block.periods).size).toBe(block.periods.length);
      expect(block.notes.some((n) => n.startsWith("Fiscal period "))).toBe(false);
    }
    expect(payload.statements.find((b) => b.title === "Income statement — annual")!.periods).toEqual(["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31"]);
  });
});
