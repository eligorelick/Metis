import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { enrichDataOnlyReport } from "@/pipeline/stageC/dataOnlyReport";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import { TRACED_NUMBER_UNIT_RULE } from "@/pipeline/stageC/prompts";
import { canonicalizeTracedUnit } from "@/pipeline/stageC/provenance";
import type { JudgeOutput } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

function inputs(currency: string | null) {
  const bundle = completeCurrencyBundle({ profileCurrency: currency });
  const computed = runStageB(bundle);
  computed.technicals.macd.histogram = 4.25;
  computed.technicals.rsi14 = 58.5;
  const payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
  return { bundle, computed, payload };
}
const macdRecord = "computed.technicals.macd-histogram";

describe("MACD histogram retains price dimensions", () => {
  it.each(["USD", "EUR", "JPY"])("carries admitted %s/share through payload, registry and data-only report, while RSI stays an index", currency => {
    const { bundle, computed, payload } = inputs(currency);
    const figures = payload.computed.flatMap(s => s.figures);
    expect(figures.find(f => f.label === "MACD histogram")).toMatchObject({ value: 4.25, unit: "currency/share", currency });
    expect(payload.provenanceRegistry?.find(r => r.id === macdRecord)).toMatchObject({ value: 4.25, unit: "currency-per-share", currency });
    expect(payload.provenanceRegistry?.find(r => r.id === "computed.technicals.rsi-14")).toMatchObject({ unit: "index", currency: null });
    const report = enrichDataOnlyReport(loadTask28Fixture(), { bundle, computed, reason: "synthetic unit test" });
    expect(report.technicals.indicators.find(n => n.source === "computed.technicals.macd")).toMatchObject({ value: 4.25, unit: "currency/share", currency });
    expect(report.technicals.indicators.find(n => n.source === "computed.technicals.rsi14")?.unit).toBe("index");
  });

  it("withholds a numeric MACD quote when the price currency is unknown, without defaulting to statement USD", () => {
    const { bundle, computed, payload } = inputs(null);
    expect((payload.provenanceRegistry ?? []).some(r => r.id === macdRecord)).toBe(false);
    expect(serializePayloadForPrompt(payload)).toContain("MACD price currency is unknown");
    const report = enrichDataOnlyReport(loadTask28Fixture(), { bundle, computed, reason: "synthetic unit test" });
    expect(report.technicals.indicators.some(n => n.source === "computed.technicals.macd")).toBe(false);
    expect(report.technicals.indicators.some(n => n.source === "computed.technicals.rsi14")).toBe(true);
  });

  it("verifies correct price aliases and rejects dimensionless or conflicting-currency MACD labels", async () => {
    const { payload } = inputs("EUR");
    const r = (payload.provenanceRegistry ?? []).find(n => n.id === macdRecord)!;
    const number = (unit: string, currency?: string) => ({ value: r.value, unit, ...(currency === undefined ? {} : { currency }), source: r.id, asOf: r.asOf, verified: null });
    const verified = await runVerifyPass({} as PassDeps, payload, { keyNumbers: [number("EUR/share"), number("currency/share", "EUR"), number("MACD histogram", "EUR"), number("index"), number("USD/share"), number("RSI")] } as unknown as JudgeOutput, { fetchedUrls: [] });
    expect(verified.log.filter(e => e.evidenceKind === "number").map(e => e.reason)).toEqual(["supported", "supported", "supported", "unit-mismatch", "currency-mismatch", "unit-mismatch"]);
    expect(canonicalizeTracedUnit("MACD histogram", "EUR")).toEqual({ unit: "currency-per-share", currency: "EUR" });
    expect(canonicalizeTracedUnit("MACD histogram", null)).toEqual({ unit: "currency-per-share", currency: null });
    expect(canonicalizeTracedUnit("RSI", "EUR")).toEqual({ unit: "index", currency: null });
  });

  it("tells the model to preserve MACD price units and keep RSI dimensionless", () => {
    expect(TRACED_NUMBER_UNIT_RULE).toContain("MACD histogram uses the admitted price currency/share");
    expect(TRACED_NUMBER_UNIT_RULE).toContain("RSI uses");
  });

  it.each([
    ["MACD histogram was EUR 4.25 per share.", true],
    ["MACD histogram was 4.25 index points.", false],
  ] as const)("checks price dimensions in factual prose: %s", async (text, supported) => {
    const { payload } = inputs("EUR");
    const record = (payload.provenanceRegistry ?? []).find(r => r.id === macdRecord)!;
    const result = await runVerifyPass({} as PassDeps, payload, { thesis: [{ text, label: "FACT", source: record.id, asOf: record.asOf }] } as unknown as JudgeOutput, { fetchedUrls: [] });
    const facts = result.log.filter(e => e.evidenceKind === "factual-claim");
    expect(facts.some(e => e.validationStatus === "validated")).toBe(supported);
  });
});
