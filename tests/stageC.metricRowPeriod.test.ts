import { expect, it } from "vitest";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";

const base: NumericProvenanceRecord = { id: "computed.margin", label: "gross margin", kind: "computed", value: 60, unit: "percent", currency: null, period: "2026-04-26", fiscalPeriod: "Q1 FY2027", asOf: "2026-05-28", origin: "computed", formulaVersion: "test", displayPrecision: 2 };
async function cell(column: string, rec = base, supplied?: string) {
  const result = await runVerifyPass({ runPass: async () => { throw Error("no model"); } } as unknown as PassDeps,
    { provenanceRegistry: [rec], citationRegistry: [], filings: [] } as unknown as ContextPayload,
    { row: { label: rec.label, values: [{ period: column, value: { value: rec.value, unit: rec.unit, currency: null, source: rec.id, asOf: rec.asOf, verified: false, ...(supplied ? { period: supplied } : {}) } }] } });
  return result.log.find(e => e.evidenceKind === "number")!;
}
it.each(["2026-07-26", "Q2 FY2027"])("AI-408 refuses column %s", async column => {
  expect(await cell(column)).toMatchObject({ outcome: "unverified", validationStatus: "unchecked", reason: "period-mismatch" });
});
it("refuses conflicting supplied periods on period-less records", async () => {
  expect(await cell("current", { ...base, period: null }, "2025-01-26")).toMatchObject({ reason: "period-mismatch" });
});
it.each(["2026-04-26", "Q1 FY2027"])("keeps established column %s", async column => {
  expect(await cell(column)).toMatchObject({ outcome: "verified" });
});
it.each(["current", "TTM to 2026-04-26"])("discloses unchecked column %s", async column => {
  expect(await cell(column)).toMatchObject({ outcome: "verified", note: expect.stringContaining("not period-checked") });
});
it("keeps matching period-less as-of decorations", async () => {
  expect(await cell(base.asOf, { ...base, period: null }, base.asOf)).toMatchObject({ outcome: "verified" });
});
it("retains refusal of a wrong cell period", async () => {
  expect(await cell(base.period!, base, "2026-07-26")).toMatchObject({ reason: "period-mismatch" });
});

it("AI-408 accepts source-declared context dates/fiscal labels and discloses windows", async () => {
 const rec = { ...base, period: null, fiscalPeriod: undefined, periodContext: { kind: "duration" as const, start: "2025-07-28", end: "2026-07-26", fiscalLabel: "Q2 FY2027" } };
 expect(await cell("2026-07-26", rec)).toMatchObject({ outcome: "verified" });
 expect(await cell("Q2 FY2027", rec)).toMatchObject({ outcome: "verified" });
 expect(await cell("FY2026", { ...base, period: null, fiscalPeriod: undefined })).toMatchObject({ reason: "period-mismatch" });
 expect(await cell("2026-06-30", { ...base, period: "ttm: 2025-07-01 to 2026-06-30" })).toMatchObject({ outcome: "verified", note: expect.stringContaining("not period-checked") });
});
