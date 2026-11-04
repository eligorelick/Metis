import { expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { foreignBundle } from "./helpers/foreignBundle";

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

it("names the failed ADS count construction behind the headline currency guard", () => {
  const b = foreignBundle();
  if (!b.edgar.companyFacts.ok) throw Error("fixture");
  const f = b.edgar.companyFacts.value.data.facts.dei!.EntityCommonStockSharesOutstanding as { units: { shares: { val: number }[] } };
  f.units.shares[0]!.val *= 1.08;
  const c = runStageB(b);
  expect(c.fairValue.status).toBe("suppressed");
  expect(c.fairValue.reasons[0]!.reason).toContain("standard ADS ratio within 1%");
});

it("names missing common-earnings years behind an unavailable financial payout assumption", () => {
  const b = completeCurrencyBundle({ bank: true });
  for (const m of [b.statements.balanceAnnual, b.statements.balanceQuarterly]) {
    if (!m.ok) throw Error("fixture");
    for (const r of m.value.data.rows) r.preferredStock = 10e6;
  }
  const c = runStageB(b);
  expect(c.fairValue.status).toBe("suppressed");
  expect(c.fairValue.reasons[0]!.reason).toMatch(/common earnings.*at least 2/i);
});
