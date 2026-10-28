// Audit 2026-10-27 batch B1. Records are synthetic, shaped like NVDA #50 /
// AMZN #43 EDGAR registry rows; amounts come from the committed SEC fixtures
// (fixtures/edgar/nvda-current-reports/) or are round numbers. No provider,
// network, database or model call.
import { describe, expect, it } from "vitest";
import { runVerifyPass, type PassDeps, type VerifyResult } from "@/pipeline/stageC/passes";
import { consistencyManifestEntries } from "@/pipeline/stageC/consistency";
import type { ContextPayload, TextExcerpt } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import type { VerificationLogEntry } from "@/report/schema";

const NO_MODEL = { model: "must-not-call", runPass: async () => { throw new Error("no model call permitted"); } } as unknown as PassDeps;

function rec(fields: Partial<NumericProvenanceRecord> & Pick<NumericProvenanceRecord, "id" | "value">): NumericProvenanceRecord {
  return {
    kind: "provider", unit: "currency", currency: "USD", period: null, asOf: "2026-07-26",
    origin: "edgar:test", formulaVersion: null, displayPrecision: 4, ...fields,
  };
}

// One USD statement row, so a printed "$" resolves to the issuer's reporting
// currency (D-45: passes.ts derives reportingCurrency from payload.statements.* rows).
export const USD_ROW = rec({ id: "payload.statements.balance-sheet-quarterly.2026-07-26.cash-and-equivalents", label: "cash and equivalents",
  value: 1e9, period: "2026-07-26", origin: "edgar:balance-sheet(quarter)" });

export async function cite(registry: NumericProvenanceRecord[], id: string, text: string): Promise<{
  entry: VerificationLogEntry; out: VerifyResult<object>; periodRow: VerificationLogEntry | undefined; manifest: string[] }> {
  const record = registry.find((r) => r.id === id)!;
  const payload = { provenanceRegistry: registry, citationRegistry: [], filings: [], companyName: "NVIDIA Corporation", symbol: "NVDA" } as unknown as ContextPayload;
  const out = await runVerifyPass(NO_MODEL, payload, { commentary: [{ label: "FACT", text, source: id, asOf: record.asOf }] });
  const entry = out.log.find((e) => e.check === undefined)!;
  return { entry, out, periodRow: out.log.find((e) => e.check === "period"), manifest: consistencyManifestEntries(out.checks).map((m) => m.field) };
}

export async function citeExcerpt(excerpt: TextExcerpt, text: string): Promise<{ entry: VerificationLogEntry; out: VerifyResult<object> }> {
  const payload = { provenanceRegistry: [USD_ROW], citationRegistry: [{ id: excerpt.source, asOf: excerpt.asOf, origin: excerpt.source, kind: "payload-text" }],
    filings: [excerpt], companyName: "NVIDIA Corporation", symbol: "NVDA" } as unknown as ContextPayload;
  const out = await runVerifyPass(NO_MODEL, payload, { commentary: [{ label: "FACT", text, source: excerpt.source, asOf: excerpt.asOf }] });
  return { entry: out.log.find((e) => e.check === undefined)!, out };
}

const GM = rec({ id: "computed.growth-margins.gross-margin-latest", label: "gross margin (latest)", kind: "computed", unit: "percent", currency: null,
  value: 71.1, asOf: "2026-01-25", origin: "computed.growth.margins.gross", formulaVersion: "stage-b-v1" });
const OM = rec({ ...GM, id: "computed.growth-margins.operating-margin-latest", label: "operating margin (latest)", value: 60.4 });
const FCF_AFTER_SBC = rec({ id: "computed.capital-cash.latest-fcf-after-sbc-house-default", label: "latest FCF (after SBC, house default)", kind: "computed",
  value: 90.29e9, asOf: "2026-01-25", origin: "computed.capital.fcf" });
const PE = rec({ id: "computed.valuation.pettm-current", label: "peTtm (current)", kind: "computed", unit: "ratio", currency: null,
  value: 27.3, asOf: "2026-10-27", origin: "computed.valuation.multiples.peTtm" });
const GM_FY = { ...GM, id: "computed.test.gross-margin-fy-labelled", fiscalPeriod: "FY2026" };

describe("AI-106 period-less records", () => {
  it.each([
    [GM, "Gross margin for FY2024 was 71.1%."],
    [GM, "Gross margin for Q2 FY2027 was 71.1%."],
    [OM, "Operating margin in fiscal 2023 was 60.4%."],
    [FCF_AFTER_SBC, "Latest FCF after SBC (house default) for FY2024 was USD 90.29 billion."],
    [PE, "Current TTM P/E as of 2025-01-26 was 27.3x."],
  ])("AI-106: a year, quarter or date a period-less record does not carry leaves the claim unverified (%#)", async (record, text) => {
    const { entry, out } = await cite([record], record.id, text);
    expect(entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
    expect(out.coverage.factualValidation?.validated).toBe(0);
  });
  it("AI-106 control: the record's own as-of date and no period still validate", async () => {
    for (const [record, text] of [[GM, "Gross margin for the period ended 2026-01-25 was 71.1%."], [PE, "Current TTM P/E as of 2026-10-27 was 27.3x."], [GM, "Gross margin was 71.1%."]] as const)
      expect((await cite([record], record.id, text)).entry.validationStatus).toBe("validated");
  });
  it("AI-106: a declared fiscal label establishes that label only, named as fiscal", async () => {
    expect((await cite([GM_FY], GM_FY.id, "Gross margin for FY2026 was 71.1%.")).entry.validationStatus).toBe("validated");
    expect((await cite([GM_FY], GM_FY.id, "Gross margin for FY2025 was 71.1%.")).entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
    expect((await cite([GM_FY], GM_FY.id, "Gross margin in 2026 was 71.1%.")).entry.validationStatus).toBe("unchecked");
    // OD-1 residual: the claim reader reads a bare "fiscal 2026" as the year 2026.
    expect((await cite([GM_FY], GM_FY.id, "Gross margin for fiscal 2026 was 71.1%.")).entry.validationStatus).toBe("unchecked");
  });
});
