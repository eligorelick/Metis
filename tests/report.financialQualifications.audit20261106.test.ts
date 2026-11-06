import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { enrichDataOnlyReport } from "@/pipeline/stageC/dataOnlyReport";
import { applyForensicScores } from "@/pipeline/stageC/passes";
import { applyFinancialDiagnostics } from "@/report/financialDiagnostics";
import { ReportSchema } from "@/report/schema";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";

const report = () => ReportSchema.parse(JSON.parse(fs.readFileSync("fixtures/report/DEMO-sample.json", "utf8")));
describe("financial dates and source qualifications", () => {
  it("dates debt cost to its TTM interest window and WACC to the current valuation observation", () => {
    const bundle = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    const computed = runStageB(bundle);
    expect(computed.returns.wacc.asOf?.statements).toBe("2026-03-31");
    computed.returns.wacc.costOfDebtPct = 5; computed.returns.wacc.waccPct = 8;
    computed.returns.wacc.asOf!.marketCap = "2026-07-05";
    const out = enrichDataOnlyReport(report(), { bundle, computed, reason: "fixture" });
    const rows = out.fundamentals.returns;
    const payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
    const wacc = payload.computed.flatMap(section => section.figures).find(figure => figure.source === "computed.returns.wacc");
    expect(wacc?.asOf).toBe(bundle.builtAt.slice(0, 10));
    expect(rows.find(r => r.label === "WACC")?.values[0]?.value.asOf).toBe(wacc?.asOf);
    expect(computed.returns.wacc.asOf?.marketCap).toBe("2026-07-05");
    expect(rows.find(r => r.label === "Pre-tax cost of debt")?.values[0]?.value.asOf).toBe("2026-03-31");
    if (!bundle.statements.incomeQuarterly.ok) throw Error("fixture");
    delete bundle.statements.incomeQuarterly.value.data.rows[0]!.interestExpense;
    expect(runStageB(bundle).returns.wacc.asOf?.statements).toBe("2025-12-31");
  });
  it("identifies weighted-average share gaps without claiming an outstanding award pool or buyback cause", () => {
    const bundle = completeCurrencyBundle({});
    if (!bundle.statements.incomeAnnual.ok) throw Error("fixture");
    for (const row of bundle.statements.incomeAnnual.value.data.rows) row.weightedAverageShsOut = 80 * M;
    const computed = runStageB(bundle);
    expect(computed.capital.dilution.note).toMatch(/weighted-average.*gap/i);
    expect(computed.capital.dilution.note).not.toContain("Dilution from outstanding awards");
    const out = enrichDataOnlyReport(report(), { bundle, computed, reason: "fixture" });
    const claim = out.balanceSheet.capitalAllocation.find(c => c.source === "computed.capital.shareCount")?.text;
    expect(claim).not.toMatch(/; buyback\)|; dilution\)/);
    expect(claim).toContain("does not establish");
  });
  it("marks neutralized/clamped Beneish inputs and retains the model's proxy limitations", () => {
    const computed = runStageB(completeCurrencyBundle({}));
    const bx = computed.forensics.beneish;
    if (!bx) throw Error("fixture");
    bx.score = -2.7; bx.neutralized = ["GMI"]; bx.clamped = ["DSRI"];
    bx.notes = ["GMI set to neutral 1.0 because inputs are missing.", "DEPI uses combined depreciation and amortisation.", "A very negative M does not prove conservative accounting."];
    const variant = applyForensicScores(report().quality, computed.forensics).forensicScores.beneish.variant;
    expect(variant).toContain("neutralized: GMI"); expect(variant).toContain("clamped: DSRI");
    const out = applyFinancialDiagnostics(report(), computed);
    for (const note of bx.notes) expect(out.quality.notes).toContain(note);
    expect(out.quality.flags.some(f => bx.notes.includes(f.text))).toBe(false);
    expect(bx.score).toBe(-2.7);
  });
});
