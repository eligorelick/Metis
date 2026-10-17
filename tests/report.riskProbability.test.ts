import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalystsRisksPanel } from "@/components/report/sections";
import { RiskSchema, ReportSchema, judgeOutputToJsonSchema } from "@/report/schema";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { loadTask28Fixture } from "./helpers/task28Report";

const risk = (probability: string) => ({ title: "Likelihood evidence unavailable", severity: "high", probability,
  source: "payload.filings.risk-factors", reasoning: { text: "The timing and likelihood are uncertain in the evidence reviewed.",
    label: "JUDGMENT", source: "payload.filings.risk-factors", asOf: "2026-07-01" } });

describe("unknown risk probability", () => {
  it.each(["low", "medium", "high", "unknown"])("accepts %s without changing the impact scale", (probability) => {
    expect(RiskSchema.safeParse(risk(probability)).success).toBe(true);
    expect(RiskSchema.safeParse({ ...risk(probability), severity: "unknown" }).success).toBe(false);
  });

  it("offers unknown probability in the actual structured judge response schema", () => {
    const schema = judgeOutputToJsonSchema();
    const risks = (schema.properties as Record<string, { properties: Record<string, { items: { properties: Record<string, { enum?: string[]; $ref?: string }> } }> }>).catalystsRisks.properties.risks;
    const probability = risks.items.properties.probability;
    const definition = probability.$ref
      ? (schema.$defs as Record<string, { enum: string[] }>)[probability.$ref.split("/").at(-1)!]
      : probability;
    expect(definition.enum).toContain("unknown");
  });

  it("keeps an unknown likelihood out of ranked matrix cells and retains its list entry", () => {
    const output = renderToStaticMarkup(createElement(CatalystsRisksPanel, {
      catalystsRisks: { catalysts: [], risks: [RiskSchema.parse(risk("unknown")), RiskSchema.parse({ ...risk("medium"), title: "Dated evidence supports medium" })] },
    }));
    expect(output).toContain("1 risk has unknown probability and is not placed in the matrix");
    expect(output).toContain("probability unknown");
    expect(output.match(/Likelihood evidence unavailable/g)).toHaveLength(1);
    expect(output.match(/Dated evidence supports medium/g)).toHaveLength(3); // cell title, cell text, list text
  });

  it.each([["Markdown", reportToMarkdown], ["print", reportToPrintBody]] as const)("preserves unknown probability in %s", (_surface, render) => {
    const report = loadTask28Fixture();
    const parsed = ReportSchema.parse({ ...report, catalystsRisks: { catalysts: [], risks: [risk("unknown")] } });
    const output = render(parsed);
    expect(output).toContain("Likelihood evidence unavailable");
    expect(output).toMatch(/high(?:<\/td><td>| \| )unknown/);
  });
});
