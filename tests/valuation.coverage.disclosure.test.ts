import { expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

it("names the loss overlay trigger without asserting that positive free cash flow is negative", () => {
  const b = completeCurrencyBundle({});
  if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
  for (const r of b.statements.incomeQuarterly.value.data.rows) r.netIncome = -1;
  const c = runStageB(b);
  expect(c.valuation.kind).toBe("dcf-suppressed");
  expect(c.fairValue.reasons[0]!.reason).toMatch(/netIncome=-4.*ttm/);
  expect(c.fairValue.reasons[0]!.reason).not.toContain("structurally negative");
});

it("carries the admitted share-unit refusal into the per-share withholding", () => {
  const b = completeCurrencyBundle({});
  for (const m of [b.statements.incomeAnnual, b.statements.incomeQuarterly]) {
    if (!m.ok) throw Error("fixture");
    for (const r of m.value.data.rows) { delete r.weightedAverageShsOut; delete r.weightedAverageShsOutDil; }
  }
  b.gaps.push({ field: "keyless.incomeQuarterly.shareBasis", reason: "vendor diluted count 711100000 differs from filed 711.1; exact quarter", severity: "warn" });
  const c = runStageB(b);
  expect(c.fairValue.status).toBe("suppressed");
  expect(c.fairValue.reasons[0]!.reason).toContain("711100000 differs from filed 711.1");
});
