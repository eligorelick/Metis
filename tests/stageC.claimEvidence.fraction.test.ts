import { describe, expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

type FractionRecord = NumericProvenanceRecord & { unitScale?: "fraction" };
const fraction: FractionRecord = { id: "computed.valuation.dcf-terminal-value-share", label: "DCF terminal value share", kind: "computed",
  value: 0.48934032909518077, unit: "ratio", unitScale: "fraction", currency: null, period: null,
  asOf: "2026-10-18", origin: "computed.valuation.dcf.terminalShare", formulaVersion: "stage-b-v1", displayPrecision: 4 };
const check = (text: string, record: FractionRecord = fraction) => validateClaimNumericSupport({ label: "FACT", text, source: record.id, asOf: record.asOf },
  { record, excerpts: [], sourceId: record.id, reportingCurrency: "USD" });

describe("explicit fraction provenance in numeric claims", () => {
  it("validates the rounded percent representation of an explicitly registered unit fraction", () => {
    expect(check("The DCF terminal-value share is 48.9%.").status).toBe("validated");
  });
  it("continues to reject the wrong percent amount and hundredfold scale errors", () => {
    expect(check("The DCF terminal-value share is 48.0%.")).toMatchObject({ status: "contradicted", reason: "value-mismatch" });
    expect(check("The DCF terminal-value share is 0.489%.")).toMatchObject({ status: "contradicted", reason: "value-mismatch" });
  });
  it("does not infer fraction semantics from a metric name or an untyped legacy ratio", () => {
    const legacy = { ...fraction };
    delete legacy.unitScale;
    expect(check("The DCF terminal-value share is 48.9%.", legacy)).toMatchObject({ status: "unchecked", reason: "unit-mismatch" });
  });
  it("does not turn an ordinary valuation multiple into a percentage", () => {
    const multiple = { ...fraction, id: "computed.price-to-earnings", label: "price to earnings", origin: "computed.pe", value: 20, unitScale: undefined };
    expect(check("Price to earnings is 20%.", multiple)).toMatchObject({ status: "unchecked", reason: "unit-mismatch" });
    expect(check("Price to earnings is 20x.", multiple).status).toBe("validated");
  });
  it("does not confuse a fractional level with percentage-point changes", () => {
    expect(check("The DCF terminal-value share is 48.9 percentage points.")).toMatchObject({ status: "unchecked", reason: "unit-mismatch" });
  });
  it("retains explicit fraction semantics when assembling the real computed payload registry", () => {
    const bundle = completeCurrencyBundle({});
    const computed = runStageB(bundle);
    const payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
    const record = payload.provenanceRegistry?.find(r => r.id === fraction.id) as FractionRecord | undefined;
    expect(record).toMatchObject({ unit: "ratio", unitScale: "fraction", origin: "computed.valuation.dcf.terminalShare" });
  });
});
