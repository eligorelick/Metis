import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { assembleReport, MockRunPass, runJudgeVerifyAssemble, runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import { JUDGE_OUTPUT_KEYS, JUDGE_OUTPUT_SCHEMA, ReportSchema, type AnalystCase } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const pointer = "See the earnings reconciliation below.";
const generatedAt = "2026-07-06T12:00:00.000Z";
const analyst: AnalystCase = { thesis: [], keyDrivers: [], risksToCase: [], catalysts: [],
  priceTarget: { value: 100, horizon: "12mo", assumptions: [] }, evidence: [] };

function inputs(compatible: boolean) {
  const bundle = completeCurrencyBundle({});
  if (!bundle.statements.incomeQuarterly.ok) throw new Error("Quarterly fixture unavailable");
  const row = bundle.statements.incomeQuarterly.value.data.rows[0]!;
  row.incomeBeforeTax = 100; row.incomeTaxExpense = 20; row.netIncome = 80; row.equityMethodIncomeLoss = 0;
  if (compatible) row.fieldProvenance = Object.fromEntries(["incomeBeforeTax", "incomeTaxExpense", "netIncome", "equityMethodIncomeLoss"].map(metric => [metric,
    { source: "edgar", unit: "USD", periodStart: "2026-01-01", periodEnd: "2026-03-31", observedAt: "2026-05-05", tags: [metric], filings: [] },
  ]));
  const computed = runStageB(bundle);
  const payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
  const fixture = ReportSchema.parse(JSON.parse(readFileSync("fixtures/report/DEMO-sample.json", "utf8")));
  const picked = Object.fromEntries(JUDGE_OUTPUT_KEYS.map(key => [key, fixture[key as keyof typeof fixture]]));
  const judge = JUDGE_OUTPUT_SCHEMA.parse(picked);
  judge.fundamentals.commentary = [{ text: pointer, label: "FACT", source: "edgar:10-Q", asOf: "2026-05-05" }];
  return { bundle, computed, payload, judge };
}

describe("standalone judge earnings-reference parity", () => {
  it.each([true, false])("uses the same actual rendered destination as full-report verification (compatible operands: %s)", async compatible => {
    const { bundle, computed, payload, judge } = inputs(compatible);
    const mock = new MockRunPass().onJson("llm.judge", judge);
    const deps: PassDeps = { model: "chatgpt/gpt-6.1-sol", runPass: mock.runPass };
    const provisional = assembleReport({ symbol: bundle.symbol, bundle, computed, judgeOutput: judge,
      verify: { verificationRate: null, log: [] }, model: deps.model, costEntries: [], provisionalVerification: true }, generatedAt);
    const full = await runVerifyPass(deps, payload, provisional);
    const standalone = await runJudgeVerifyAssemble(deps, payload, analyst, analyst,
      { symbol: bundle.symbol, bundle, computed, priorCostEntries: [] }, generatedAt);
    expect(standalone.ok).toBe(true);
    if (!standalone.ok) throw new Error(JSON.stringify(standalone.error));
    const report = standalone.report!;
    expect(report.sourceFactSummary?.earningsReconciliation.status).toBe(compatible ? "available" : "unavailable");
    expect(report.fundamentals.commentary).toEqual(full.verifiedReport.fundamentals.commentary);
    const reference = report.fundamentals.commentary[0]!;
    if (compatible) {
      expect(reference.text).toBe("See the reported earnings reconciliation in the Fundamentals section.");
      expect(reference.source).toBe("edgar:10-Q");
      expect(report.appendix.verificationLog).not.toContainEqual(expect.objectContaining({ reason: "unsupported-report-reference" }));
    } else {
      expect(reference.source).toBe("pipeline:report-reference");
      expect(reference.text).toContain("unavailable");
    }
    expect(report.appendix.verificationLog).toContainEqual(expect.objectContaining({ claim: pointer,
      reason: compatible ? "report-reference-normalized" : "unsupported-report-reference" }));
    expect(ReportSchema.safeParse(report).success).toBe(true);
    expect(judge.fundamentals.commentary[0]!.text).toBe(pointer);
  });
});
