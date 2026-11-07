import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportView } from "@/components/report/ReportView";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { buildExecutionMetadataEntry } from "@/report/execution";
import { passLine, usageSummary } from "@/report/presentation";
import { CostBreakdownEntrySchema, type Report } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

// FIGR paid run (2026-11-02, R1): "$4.712836 recorded API cost; 134,019 input /
// 29,782 output tokens". The dollars covered all eight requests, but the
// tokens covered only each pass's accepted attempt. That missed the two
// discarded first attempts and the three judge section-group requests whose
// twelve sections the report kept.
const MODEL = "claude-opus-5-5";
const row = (step: string, costUsd: number, inputTokens: number | undefined, outputTokens: number | undefined, discarded = false) => ({
  step, model: MODEL, costUsd,
  ...(inputTokens === undefined ? {} : { inputTokens }), ...(outputTokens === undefined ? {} : { outputTokens }),
  ...(discarded ? { discarded: true, discardedReason: "its output did not satisfy the report schema" } : {}),
});
const LEDGER = [
  row("bull", 0.812187, 6329, 5714, true),
  row("bear", 0.365528, 6391, 15653, true),
  row("bull", 0.376056, 6843, 16089),
  row("bear", 0.277256, 16513, 9215),
  row("synthesize", 1.192798, 47106, 21323),
  row("synthesize", 0.573615, 47106, 17669),
  row("synthesize", 0.557618, 47105, 14432),
  row("synthesize", 0.557778, 110663, 4478),
];

function paidReport(ledger: Report["appendix"]["costBreakdown"]): Report {
  const r = loadTask28Fixture();
  const usage: Record<string, [number, number]> = { bull: [6843, 16089], bear: [16513, 9215], synthesize: [110663, 4478] };
  r.meta.execution = (["bull", "bear", "synthesize"] as const).map((step) => buildExecutionMetadataEntry({
    step, requestedModel: MODEL, effectiveModel: MODEL, requestedEffort: "high", fallbackUsed: false,
    usage: { input_tokens: usage[step]![0], output_tokens: usage[step]![1] },
  }));
  r.appendix.costBreakdown = ledger;
  return r;
}

describe("run usage counts every recorded request (FIGR paid audit R1)", () => {
  it.each([
    ["chatgpt/gpt-6.1-sol", "ChatGPT plan"],
    ["gemini/gemini-model", "Gemini CLI"],
    ["claude/claude-opus-5-5", "Claude Code account"],
  ])("attributes %s usage to its account in the report and exports", (model, allowance) => {
    const report = loadTask28Fixture();
    report.meta.execution = [buildExecutionMetadataEntry({
      step: "bull", requestedModel: model, effectiveModel: model, requestedEffort: null, fallbackUsed: false,
      usage: { input_tokens: 1000, output_tokens: 100 },
    })];
    report.appendix.costBreakdown = [];
    const expected = `1,000 input / 100 output tokens on the ${allowance} allowance (no API charge recorded)`;
    expect(usageSummary(report)).toBe(expected);
    for (const output of [reportToMarkdown(report), reportToAuditMarkdown(report), reportToPrintBody(report), renderToStaticMarkup(createElement(ReportView, { report }))]) {
      expect(output).toContain(expected);
    }
  });

  it("accepts per-request token counts in the cost breakdown and still reads rows without them", () => {
    for (const entry of LEDGER) expect(CostBreakdownEntrySchema.safeParse(entry).success).toBe(true);
    expect(CostBreakdownEntrySchema.safeParse({ step: "bull", model: MODEL, costUsd: 0.1 }).success).toBe(true);
    expect(CostBreakdownEntrySchema.safeParse({ step: "bull", model: MODEL, costUsd: 0.1, outputTokens: -1 }).success).toBe(false);
  });

  it("totals tokens over the same requests as the cost, and says how many there were and were discarded", () => {
    expect(usageSummary(paidReport(LEDGER))).toBe("$4.712836 recorded API cost across 8 requests (2 discarded); 288,056 input / 104,573 output tokens");
  });

  it("gives each pass its requests and their tokens", () => {
    const r = paidReport(LEDGER);
    const [bull, , judge] = r.meta.execution!;
    expect(passLine(bull!, r.appendix.costBreakdown)).toBe(`bull: ${MODEL}, high effort; 2 requests (1 discarded); 13,172 input / 21,803 output tokens`);
    expect(passLine(judge!, r.appendix.costBreakdown)).toBe(`judge: ${MODEL}, high effort; 4 requests; 251,980 input / 57,902 output tokens`);
  });

  it("keeps the earlier wording for a report whose ledger rows carry no tokens", () => {
    const legacy = LEDGER.map((entry) => {
      const rest: Partial<typeof entry> = { ...entry };
      delete rest.inputTokens;
      delete rest.outputTokens;
      return rest as typeof entry;
    });
    const r = paidReport(legacy);
    expect(usageSummary(r)).toBe("$4.712836 recorded API cost; 134,019 input / 29,782 output tokens");
    expect(passLine(r.meta.execution![0]!, r.appendix.costBreakdown)).toBe(`bull: ${MODEL}, high effort; 6,843 input / 16,089 output tokens`);
    expect(passLine(r.meta.execution![0]!)).toBe(`bull: ${MODEL}, high effort; 6,843 input / 16,089 output tokens`);
  });
});
