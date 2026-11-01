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
  it("does not validate a contradictory billion-versus-million revenue claim merely because the correct raw amount also appears", async () => {
    const revenue = record({ id: "payload.revenue", label: "quarterly revenue", value: 188219000, unit: "currency", currency: "USD", period: "2026-06-30", asOf: "2026-06-30" });
    expect((await check("Quarterly revenue for 2026-06-30 was USD 188.219 million.", revenue)).log[0]).toMatchObject({ validationStatus: "validated" });
    expect((await check("Quarterly revenue for 2026-06-30 was USD 188.22 billion; more precisely the provider figure is 188,219,000 USD.", revenue)).coverage.factualValidation?.validated).toBe(0);
  });

  it("recognizes an explicitly named share price as per-share currency while retaining value, date and currency checks", async () => {
    const quote = record({ id: "payload.quote.price", label: "price", origin: "fmp:quote", kind: "provider", formulaVersion: null, value: 164.79, asOf: "2026-10-30" });
    expect((await check("The share price was USD 164.79 on 2026-10-30.", quote)).log[0]).toMatchObject({ validationStatus: "validated" });
    expect((await check("The share price was EUR 164.79 on 2026-10-30.", quote)).log[0]).toMatchObject({ validationStatus: "unchecked", reason: "currency-mismatch" });
    expect((await check("The share price was USD 165.79 on 2026-10-30.", quote)).log[0]).toMatchObject({ validationStatus: "contradicted", reason: "value-mismatch" });
    expect((await check("The share price was USD 164.79 on 2026-10-29.", quote)).log[0]).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
    expect((await check("The share price was USD 164.79 in FY2026.", quote)).log[0]).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
    expect((await check("The share price was USD 164.79 on 2026-10-30.", { ...quote, asOf: "" })).coverage.factualValidation?.validated).toBe(0);
    expect((await check("The share price was USD 164.79 on 2026-10-30.", { ...quote, unit: "currency" })).log[0]).toMatchObject({ validationStatus: "unchecked", reason: "unit-mismatch" });
    expect((await check("The share price was USD 164.79 million on 2026-10-30.", quote)).coverage.factualValidation?.validated).toBe(0);
    expect((await check("The total market capitalization was USD 164.79.", quote)).coverage.factualValidation?.validated).toBe(0);
  });
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
    expect((await check("Quarterly cash dividend was USD 0.25.", dividend)).log[0]).toMatchObject({ validationStatus: "unchecked", reason: "unit-mismatch" });
    expect((await check("Quarterly cash dividend per share was EUR 0.25.", dividend)).log[0]).toMatchObject({ validationStatus: "unchecked", reason: "currency-mismatch" });
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
