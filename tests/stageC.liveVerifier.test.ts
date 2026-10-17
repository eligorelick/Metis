import { describe, expect, it } from "vitest";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";

const record = (over: Partial<NumericProvenanceRecord>): NumericProvenanceRecord => ({ id: "computed.value", label: "DCF per share", kind: "computed", value: 217.04, unit: "currency-per-share", currency: "USD", period: null, asOf: "2026-10-16", origin: "computed.value", formulaVersion: "test", displayPrecision: 4, ...over });
async function check(text: string, cited: NumericProvenanceRecord) {
  const result = await runVerifyPass({} as PassDeps, { provenanceRegistry: [cited], citationRegistry: [], filings: [] } as unknown as ContextPayload,
    { commentary: [{ label: "FACT", text, source: cited.id, asOf: cited.asOf }] });
  return result;
}
describe("live NVDA verifier regressions", () => {
  it("reads an explicit score suffix without treating a bare number or ratio as a score", async () => {
    const score = record({ id: "computed.beneish", label: "Beneish score", value: -1.7, unit: "score", currency: null });
    expect((await check("Beneish score was negative 1.7 score.", score)).log[0]).toMatchObject({ validationStatus: "validated" });
    expect((await check("Beneish score was negative 1.7.", score)).coverage.factualValidation?.validated).toBe(0);
    expect((await check("Beneish score was negative 1.7 times.", score)).coverage.factualValidation?.validated).toBe(0);
  });
  it("reads per-share units immediately before an amount, retaining total/currency controls", async () => {
    expect((await check("Our DCF per share is USD 217.04.", record({}))).log[0]).toMatchObject({ validationStatus: "validated" });
    const dividend = record({ id: "payload.dividend", label: "quarterly cash dividend per share", value: 0.25 });
    expect((await check("Quarterly cash dividend per share was USD 0.25.", dividend)).log[0]).toMatchObject({ validationStatus: "validated" });
    expect((await check("Quarterly cash dividend was USD 0.25.", dividend)).log[0]).toMatchObject({ validationStatus: "contradicted", reason: "unit-mismatch" });
    expect((await check("Quarterly cash dividend per share was EUR 0.25.", dividend)).log[0]).toMatchObject({ validationStatus: "contradicted", reason: "currency-mismatch" });
    expect((await check("Quarterly cash dividend per share was USD 0.25.", { ...dividend, unit: "currency" })).coverage.factualValidation?.validated).toBe(0);
  });
  it("uses explicit fiscal evidence without accepting another quarter/year or guessing a fiscal calendar", async () => {
    const dso = record({ id: "payload.filing-facts.dso", label: "days sales outstanding (DSO), Q2 FY2027", value: 60, unit: "days", currency: null, period: "2026-07-26", fiscalPeriod: "Q2 FY2027", asOf: "2026-08-26" });
    const correct = await check("Days sales outstanding for Q2 FY2027 was 60 days.", dso);
    expect(correct.log[0]).toMatchObject({ validationStatus: "validated" });
    expect(correct.checks.period.failed).toBe(0);
    for (const period of ["Q1 FY2027", "Q2 FY2026", "Q2 2026"]) expect((await check(`Days sales outstanding for ${period} was 60 days.`, dso)).coverage.factualValidation?.validated).toBe(0);
    const unknownFiscal = await check("Days sales outstanding for Q2 FY2027 was 60 days.", { ...dso, fiscalPeriod: undefined });
    expect(unknownFiscal.coverage.factualValidation?.validated).toBe(0);
    expect(unknownFiscal.coverage.factualValidation?.contradicted).toBe(0);
    expect(unknownFiscal.checks.period.failed).toBe(0);
  });
});
