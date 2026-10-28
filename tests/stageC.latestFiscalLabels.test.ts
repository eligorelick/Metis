/**
 * Audit 2026-10-27 B3 Task 8E (decisions spec 4.3, unowned residual (a)): a (latest) or accrual-year computed
 * record carries the issuer's fiscal label of the year it was computed over, and that year's end as its period,
 * the two fields the annual statement cell of the same row carries.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import { assembleContextPayload, serializePayloadForPrompt, type ContextPayload } from "@/pipeline/stageC/payload";
import type { DataBundle } from "@/pipeline/types";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;

const LABELLED = [
  "computed.growth-margins.gross-margin-latest", "computed.growth-margins.operating-margin-latest", "computed.growth-margins.net-margin-latest",
  "computed.returns.roic-latest", "computed.returns.roe-latest-dupont",
  "computed.capital-cash.latest-fcf-after-sbc-house-default", "computed.capital-cash.latest-fcf-before-sbc-vendor-convention",
  "computed.capital-cash.fcf-conversion-latest-after-sbc", "computed.capital-cash.fcf-conversion-latest-fiscal-year-before-sbc",
  "computed.capital-cash.capex-revenue-latest", "computed.capital-cash.capex-d-a-latest",
  "computed.forensics.accrual-ratio-balance-sheet", "computed.forensics.accruals.balanceSheetAccrualRatio", "computed.forensics.accrual-ratio-cash-flow",
];
const build = (b: DataBundle) => assembleContextPayload(b, runStageB(b), EMPTY_VALIDATION);
const rec = (p: ContextPayload, id: string) => (p.provenanceRegistry ?? []).find((r) => r.id === id);
const verdict = async (p: ContextPayload, id: string, text: string) => (await runVerifyPass({} as PassDeps, p, { commentary: [{ label: "FACT", text, source: id, asOf: rec(p, id)!.asOf! }] }))
  .log.find((e) => e.evidenceKind === "factual-claim" && e.check === undefined)!;

describe("a (latest) computed row carries the fiscal label of its year (residual (a))", () => {
  it("gives each (latest) and accrual-year record the issuer's label of the year it was computed over", () => {
    const p = build(completeCurrencyBundle({}));
    // The annual statement cell's two fields: the row's ISO period end and its issuer label.
    for (const id of LABELLED) expect(rec(p, id), id).toMatchObject({ period: "2025-12-31", fiscalPeriod: "FY2025", asOf: "2025-12-31" });
    expect(rec(p, "computed.forensics.net-operating-assets-prior")).toMatchObject({ period: "2024-12-31", fiscalPeriod: "FY2024", asOf: "2024-12-31" });   // the prior year's instant
    // Controls: windows longer than one fiscal year, mixed inputs and current-capital rows carry no label. Each record exists, so no line passes vacuously.
    for (const id of ["computed.growth-margins.gross-margin-slope", "computed.growth-margins.revenue-cagr-3y", "computed.growth-margins.latest-revenue-yoy",
      "computed.returns.roic-wacc-spread", "computed.current-capital.fcf-conversion-before-sbc"]) {
      expect(rec(p, id), id).toBeDefined();
      expect(rec(p, id)!.fiscalPeriod, id).toBeUndefined();
    }
    expect(rec(p, "computed.growth-margins.gross-margin-slope")!.period).toBeNull();   // the slope shares the margin origin and gains no period
    expect(serializePayloadForPrompt(p)).not.toContain("fiscalPeriod");   // carried on the record, never printed
  });

  it("adds no label the payload does not hold (review focus 11)", () => {
    const bare = completeCurrencyBundle({});
    for (const row of (bare.statements.incomeAnnual as unknown as { value: { data: { rows: Record<string, unknown>[] } } }).value.data.rows) { delete row.fiscalYear; delete row.period; }
    const pb = build(bare);
    for (const id of LABELLED) expect(rec(pb, id), id).toBeDefined();   // the records exist; only the label is absent
    expect(LABELLED.map((id) => rec(pb, id)!.fiscalPeriod)).toEqual(LABELLED.map(() => undefined));
    expect(rec(pb, "computed.returns.roic-latest")!.period).toBeNull();   // no label, no period: HEAD's record
    // A newer cash-flow year with no income row: Stage B's FCF and capex rows end 2026-12-31, but the capital rows print cap.asOf 2025-12-31.
    const lagging = completeCurrencyBundle({});
    const cash = (lagging.statements.cashflowAnnual as unknown as { value: { data: { rows: Record<string, unknown>[] } } }).value.data.rows;
    cash.unshift({ ...cash[0], date: "2026-12-31" });
    const p = build(lagging);
    // capex/revenue (latest) is null here (the 2026-12-31 cash-flow year has no revenue), so it is not registered; capex/D&A is.
    expect(rec(p, "computed.capital-cash.capex-revenue-latest")).toBeUndefined();
    for (const id of ["computed.capital-cash.latest-fcf-after-sbc-house-default", "computed.capital-cash.fcf-conversion-latest-after-sbc", "computed.capital-cash.capex-d-a-latest"]) {
      expect(rec(p, id), id).toMatchObject({ asOf: "2025-12-31", period: null });
      expect(rec(p, id)!.fiscalPeriod, id).toBeUndefined();
    }
    expect(rec(p, "computed.returns.roic-latest")?.fiscalPeriod).toBe("FY2025");   // control: its window still ends on its as-of
  });

  it("lets prose name the fiscal year the label establishes, and only that year (consumer: claimEvidence basisWindows)", async () => {
    const p = build(completeCurrencyBundle({}));
    const v = Number((rec(p, "computed.returns.roic-latest")!.value as number).toFixed(2));   // 41.83
    expect((await verdict(p, "computed.returns.roic-latest", `ROIC for the fiscal year was ${v}%.`)).validationStatus).toBe("validated");
    expect((await verdict(p, "computed.returns.roic-latest", `ROIC for the fiscal year ended 2025-12-31 was ${v}%.`)).validationStatus).toBe("validated");
    expect((await verdict(p, "computed.returns.roic-latest", `ROIC was ${v}%.`)).validationStatus).toBe("validated");                                  // control
    expect((await verdict(p, "computed.growth-margins.gross-margin-latest", "Gross margin for the quarter was 40%.")).validationStatus).not.toBe("validated");   // control: a fiscal year is not a quarter
    // A wrong year never validates, before B1 too. The row's period makes the consistency period check run (consistency.ts:1563),
    // as on the annual statement cell. The first three are unchecked on HEAD and validated by a label without a period;
    // the fourth is validated on HEAD (AI-106).
    for (const [id, text] of [
      ["computed.returns.roic-latest", `ROIC for the fiscal year ended 2024-12-31 was ${v}%.`],
      ["computed.returns.roic-latest", `ROIC for fiscal year 2026 was ${v}%.`],
      ["computed.growth-margins.gross-margin-latest", "Gross margin for fiscal year 2024 was 40%."],
      ["computed.returns.roic-latest", `ROIC for FY2024 was ${v}%.`],
    ] as const) expect((await verdict(p, id, text)).validationStatus, text).not.toBe("validated");
  });
});
