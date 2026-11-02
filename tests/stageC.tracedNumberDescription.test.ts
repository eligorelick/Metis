import { describe, expect, it } from "vitest";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";

const record = (label: string | undefined, id = "computed.metric", unit: NumericProvenanceRecord["unit"] = "percent"): NumericProvenanceRecord => ({
  id, label, kind: "computed", value: 58.1, unit, currency: unit.startsWith("currency") ? "USD" : null,
  period: null, asOf: "2026-07-26", origin: "computed", formulaVersion: "test", displayPrecision: 4,
});
async function check(rec: NumericProvenanceRecord, label?: string, kind = "metric", unit = rec.unit as string, source = rec.id) {
  const n = { value: rec.value, unit, currency: rec.currency, source, sourceId: rec.id, asOf: rec.asOf, verified: false };
  const root = label === undefined ? { number: n } : kind === "metric" ? { row: { label, values: [{ period: "2026-07-26", value: n }] } } : { row: { name: label, revenue: n } };
  const result = await runVerifyPass({ runPass: async () => { throw new Error("no model"); } } as unknown as PassDeps,
    { provenanceRegistry: [rec, record("revenue", "payload.revenue", "currency")], citationRegistry: [], filings: [] } as unknown as ContextPayload, root);
  return result.log.find(e => e.evidenceKind === "number")!;
}
describe("AI-407 printed registry descriptions", () => {
  it.each([
    [record("operating margin"), "FACT — Quarterly gross margin", "metric", "percent"],
    [record("product: Data Center", "payload.segments.product-data-center", "currency"), "Gaming", "named", "currency"],
    [record("Product / market platform: Data Center revenue, quarter ended 2026-07-26", "payload.segment-revenue.data-center", "currency"), "Gaming", "named", "currency"],
    [record("operating margin"), undefined, "metric", "% gross margin"],
    [record("net income", "payload.income", "currency"), "Revenue", "metric", "currency"],
    [record("basic EPS", "computed.eps", "currency-per-share"), "Diluted EPS", "metric", "currency-per-share"],
    [record("adjusted revenue", "computed.revenue", "currency"), "Revenue", "metric", "currency"],
    [record("revenue", "computed.revenue", "currency"), "Adjusted revenue", "metric", "currency"],
  ])("refuses a conflicting printed description %#", async (rec, label, kind, unit) => {
    expect(await check(rec, label, kind, unit)).toMatchObject({ outcome: "unverified", validationStatus: "unchecked", reason: "text-context-mismatch" });
  });
  it("refuses another registry source used for presentation", async () => {
    expect(await check(record("net income", "payload.income", "currency"), undefined, "metric", "currency", "payload.revenue")).toMatchObject({ validationStatus: "unchecked", reason: "text-context-mismatch" });
  });
  it.each([
    [record("gross margin"), "FACT — Quarterly gross margin", "metric"],
    [record("product: Data Center", "payload.segments.data-center", "currency"), "Data Center", "named"],
    [record("Product: Data Center revenue, quarter ended 2026-07-26", "payload.segment-revenue.data-center", "currency"), "Data Center", "named"],
    [record("diluted EPS", "computed.eps", "currency-per-share"), "Diluted EPS (annual, GAAP)", "metric"],
    [record("ROIC (latest)"), "Latest annual ROIC", "metric"],
    [record("roe"), "Return on equity", "metric"],
    [record("revenue weighted 12M ending 2027-06-30"), "ESTIMATE: Weighted projected revenue", "metric"],
    [record("revenue"), "Revenue (annual)", "metric"],
    [record("netDebtToEbitda (latest)"), "Leverage", "metric"],
    [record("DGS10 (core)", "payload.macro.dgs10-core"), "FACT: Ten-year Treasury yield", "named"],
    [record("AMD — Advanced Micro Devices, Inc.", "payload.peers.peer", "currency"), "Advanced Micro Devices, Inc.", "named"],
    [record(undefined, "payload.computed.scenario-targets.base.per-share", "currency-per-share"), "base", "named"],
  ])("keeps a valid description %#", async (rec, label, kind) => {
    expect(await check(rec, label, kind)).toMatchObject({ outcome: "verified", validationStatus: "validated" });
  });
  it("retains SEC reader URLs and nonregistry source decorations", async () => {
    const rec = record("geographic: CHINA", "payload.segments.geographic-china", "currency");
    for (const source of ["https://www.sec.gov/Archives/edgar/data/123/filing.htm", "computed"]) {
      expect(await check(rec, "CHINA", "named", "currency", source)).toMatchObject({ outcome: "verified" });
    }
  });
  it("keeps standalone segment key numbers with no printed description", async () => {
    expect(await check(record("Product: Cloud revenue, quarter ended 2026-07-26", "payload.segment-revenue.cloud", "currency"))).toMatchObject({ outcome: "verified" });
  });
  it("keeps the indicator identity guard", async () => {
    expect(await check(record("MACD", "computed.technicals.macd", "index"), undefined, "metric", "RSI")).toMatchObject({ reason: "unit-mismatch" });
  });
});
