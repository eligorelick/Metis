import { describe, expect, it } from "vitest";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import { trustRows } from "@/report/presentation";
import { supplementalNumericAudit, supplementalNumericInventoryText } from "@/report/supplementalNumericAudit";

describe("supplemental deterministic-table numerical audit", () => {
  it("avoids duplicate traced cells and excludes unavailable/nonfinite observations", () => {
    const report = { filingDisclosures: { traced: { value: 7, unit: "USD", source: "source", verified: null }, missing: null,
      invalid: [NaN, Infinity, -Infinity], partial: { value: 0, unit: "USD", source: "source" }, text: "8" }, marketData: undefined };
    const log = supplementalNumericAudit(report);
    expect(log.map(entry => [entry.path, entry.claim])).toEqual([["filingDisclosures.partial.value", "0"]]);
    expect(log[0]).toMatchObject({ outcome: "unverified", validationStatus: "unchecked" });
    expect(supplementalNumericInventoryText(undefined)).toBeNull();
    expect(supplementalNumericInventoryText([])).toBeNull();
    expect(supplementalNumericInventoryText([{ ...log[0]!, note: "Different audit" }])).toBeNull();
  });
  it("inventories filing and market scalar cells separately without claiming source validation", async () => {
    const input = { filingDisclosures: { quarterlyTrend: [{ periodEnd: "2026-09-30", epsDiluted: 2.75, revenue: 10e9 }], segments: [{ rows: [{ values: [4e9, 3e9] }], derivedCells: 1 }] }, marketData: { quote: { price: 100 }, estimates: [{ date: "2027-09-30", revenueAvg: 12e9, epsAvg: 2.75 }] } };
    const payload = { provenanceRegistry: [], citationRegistry: [], filings: [] } as unknown as ContextPayload;
    const result = await runVerifyPass({} as PassDeps, payload, input);
    expect(result.log.map(e => e.path)).toContain("filingDisclosures.quarterlyTrend[0].epsDiluted");
    expect(result.log.map(e => e.path)).toContain("marketData.estimates[0].epsAvg");
    expect(result.log.filter(e => e.evidenceKind === "number")).toHaveLength(8);
    expect(result.log.every(e => e.validationStatus === "unchecked" && e.outcome === "unverified")).toBe(true);
    expect(result.coverage.numeric).toEqual({ supported: 0, total: 0, rate: null });
    expect(trustRows(result.coverage, result.log).map(r => r.value).join(" ")).toContain("8 cells/operands inventoried; metric, unit, period and accounting basis not independently matched; excluded from the tracing rate");
    expect(result.verifiedReport).toEqual(input);
  });
  it("does not treat equal bare values as a metric/period/accounting match", async () => {
    const payload = { provenanceRegistry: [{ id: "payload.unrelated", label: "non-GAAP annual EPS", value: 2.75, unit: "currency-per-share", currency: "USD", period: "FY2025", kind: "provider", asOf: "2026-01-01", origin: "provider", formulaVersion: null, displayPrecision: 2 }], citationRegistry: [], filings: [] } as unknown as ContextPayload;
    const result = await runVerifyPass({} as PassDeps, payload, { filingDisclosures: { quarterlyTrend: [{ periodEnd: "2026-09-30", epsDiluted: 2.75 }] } });
    expect(result.log[0]).toMatchObject({ path: "filingDisclosures.quarterlyTrend[0].epsDiluted", validationStatus: "unchecked", traceKind: "untraced" });
    expect(result.log[0]!.note).toContain("accounting basis not independently matched");
  });
});
