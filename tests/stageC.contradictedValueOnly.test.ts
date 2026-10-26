/**
 * Audit 2026-10-22 F-22 / B-10: "contradicted" means a value conflict only.
 * A period, unit or currency the cited record does not establish is a
 * metadata gap: the claim is unverified, not contradicted. The META deep dive
 * counted eight correct TTM claims ("ended June 30, 2026" against a
 * 2025-07-01 to 2026-06-30 window) as contradicted, and stored report #43
 * counted a salary written in another unit.
 */
import { describe, expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import { runVerifyPass } from "@/pipeline/stageC/passes";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import { validateBundle } from "@/pipeline/stageA/validate";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import type { VerificationLogEntry } from "@/report/schema";

const annual: NumericProvenanceRecord = {
  id: "computed.capital.interestCoverage", kind: "computed", label: "interest coverage",
  value: 71.48, unit: "ratio", currency: null, period: "2024-12-31", asOf: "2025-12-31",
  origin: "computed.capital.interestCoverage", formulaVersion: null, displayPrecision: 4,
};
const check = (text: string, record: NumericProvenanceRecord = annual) =>
  validateClaimNumericSupport({ label: "FACT", text, source: record.id, asOf: record.asOf },
    { record, excerpts: [], sourceId: record.id, reportingCurrency: "USD" });

describe("F-22: contradicted is reserved for value conflicts", () => {
  it("leaves a matching figure whose prose period the record does not establish unverified", () => {
    expect(check("Interest coverage for 2025-12-31 was 71.48x.")).toMatchObject({ status: "unchecked", reason: "period-mismatch" });
  });
  it("leaves a unit the record does not establish unverified", () => {
    expect(check("Interest coverage was 71.48%.")).toMatchObject({ status: "unchecked", reason: "unit-mismatch" });
  });
  it("leaves a currency the record does not establish unverified", () => {
    const salary: NumericProvenanceRecord = { ...annual, id: "payload.compensation.ceo-salary", label: "annual salary", value: 185_000,
      unit: "currency", currency: "USD", period: null, origin: "fmp:executive-compensation" };
    expect(check("The annual salary was EUR 185,000.", salary)).toMatchObject({ status: "unchecked", reason: "currency-mismatch" });
  });
  it("still contradicts a value or sign conflict", () => {
    expect(check("Interest coverage for 2024-12-31 was 80.0x.")).toMatchObject({ status: "contradicted", reason: "value-mismatch" });
    const change: NumericProvenanceRecord = { ...annual, id: "computed.growth.revenue-change", label: "revenue change", value: -5, unit: "percent" };
    expect(check("Revenue change for 2024-12-31 rose 5%.", change)).toMatchObject({ status: "contradicted", reason: "direction-mismatch" });
  });

  const ttm: NumericProvenanceRecord = {
    id: "computed.current-capital.operating-cash-flow", kind: "computed", label: "operating cash flow",
    value: 130_301e6, unit: "currency", currency: "USD", period: "ttm: 2025-07-01 to 2026-06-30", asOf: "2026-06-30",
    origin: "computed.capital.current.cashBridge.operatingCashFlow", formulaVersion: null, displayPrecision: 4,
  };
  const verify = async (text: string, record: NumericProvenanceRecord = ttm) => {
    const bundle = completeCurrencyBundle({});
    bundle.edgar.companyFacts = { ok: false, gap: { field: "synthetic.companyFacts", reason: "Synthetic fixture has no SEC facts", severity: "info" } };
    const payload = assembleContextPayload(bundle, runStageB(bundle), validateBundle(bundle));
    payload.provenanceRegistry = [...payload.provenanceRegistry!.filter((existing) => existing.id !== record.id), record];
    return runVerifyPass({ model: "must-not-call", runPass: async () => { throw new Error("No model call permitted"); } },
      payload, { claims: [{ label: "FACT" as const, text, source: record.id, asOf: record.asOf }] });
  };

  it("contradicts a direction conflict even when the same claim's period word also fails (review of F-22)", async () => {
    const change: NumericProvenanceRecord = { ...annual, id: "computed.growth.revenue-change", label: "revenue change", value: -5, unit: "percent", period: "2025-12-31" };
    const verified = await verify("Revenue change rose 5% in 2024.", change);
    const entry = verified.log.find((row) => row.path === "claims[0]" && row.check === undefined);
    expect(verified.log.some((row) => row.path === "claims[0]" && row.check === "period")).toBe(true);
    expect(verified.log.some((row) => row.path === "claims[0]" && row.check === "direction")).toBe(true);
    expect(entry).toMatchObject({ validationStatus: "contradicted", reason: "direction-mismatch" });
    expect(verified.coverage.factualValidation?.contradicted).toBe(1);
  });

  it("does not count a period-word check failure on a correct TTM figure as a contradiction (META deep dive)", async () => {
    const verified = await verify("Operating cash flow for the trailing twelve months ended June 30, 2026 was USD 130.30 billion.");
    const entry = verified.log.find((row) => row.path === "claims[0]" && row.check === undefined);
    expect(entry?.validationStatus).toBe("unchecked");
    expect(entry?.claimSupportStatus).toBe("cited");
    expect(verified.coverage.factualValidation?.contradicted).toBe(0);
    expect(verified.coverage.factualValidation?.unchecked).toBe(1);
    // The check itself is still recorded for the audit export.
    expect(verified.log.some((row) => row.path === "claims[0]" && row.check === "period")).toBe(true);
  });
  it("still counts a value conflict on the same record as a contradiction", async () => {
    const verified = await verify("Operating cash flow for the trailing twelve months ended 2026-06-30 was USD 140.30 billion.");
    expect(verified.coverage.factualValidation?.contradicted).toBe(1);
  });
});

describe("F-22: stored reports written before the rule", () => {
  // Report #45 and the META deep dive: a correct claim recorded contradicted
  // for a period word, and a cited figure recorded contradicted for its unit.
  const coverage = {
    numeric: { supported: 3, total: 3, rate: 1 },
    factualClaims: { supported: 3, total: 3, rate: 1 },
    factualValidation: { cited: 3, validated: 1, unchecked: 0, contradicted: 2, qualitative: 0, total: 3, rate: 1 / 3 },
    judgments: { cited: 0, total: 0, rate: null },
  };
  const claim = (path: string, validationStatus: "validated" | "contradicted", reason: VerificationLogEntry["reason"]): VerificationLogEntry => ({
    claim: path, outcome: "unverified" as const, note: "", path, evidenceKind: "factual-claim" as const, reason, validationStatus, traceKind: "source-cited" as const,
  });
  const log: VerificationLogEntry[] = [
    claim("a[0]", "validated", "supported"),
    claim("a[1]", "contradicted", "period-word-mismatch"),
    claim("a[2]", "contradicted", "value-mismatch"),
    { ...claim("a[1]", "contradicted", "period-word-mismatch"), check: "period" as const, traceKind: "untraced" as const },
    { claim: "185000 currency", outcome: "unverified" as const, note: "", path: "x", evidenceKind: "number" as const, reason: "unit-mismatch", validationStatus: "contradicted" as const, traceKind: "untraced" as const },
  ];
  it("counts only the value conflict as contradicted", async () => {
    const { trustHeadline, trustRows } = await import("@/report/presentation");
    expect(trustHeadline(coverage, log)).toContain("1 contradicted");
    expect(trustHeadline(coverage, log)).not.toContain("cited figure");
    expect(trustRows(coverage, log).find((row) => row.label === "Claims contradicted by their cited source")?.value).toBe("1");
  });
  it("shows the audit export's recorded status beside the reading", async () => {
    const { displayedValidationStatus } = await import("@/report/presentation");
    expect(displayedValidationStatus(log[1])).toBe("unchecked");
    expect(displayedValidationStatus(log[2])).toBe("contradicted");
    expect(displayedValidationStatus(log[4])).toBe("unchecked");
  });
});
