import { expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

it("uses only complete debt balances and keeps the current market-value weights", () => {
  const bundle = completeCurrencyBundle({ debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  const baseline = runStageB(bundle);
  const annual = bundle.statements.balanceAnnual;
  if (!annual.ok) throw new Error("fixture");
  const row = annual.value.data.rows[1]!;
  row.totalDebt = undefined;
  row.fieldConflicts = { totalDebt: { usable: false, vendorValue: 1, secValue: null,
    reason: "incomplete debt carrying value: a component is ambiguous" } };
  const after = runStageB(bundle);
  expect(after.returns.wacc.waccPct).not.toBeNull();
  expect(after.returns.wacc.weightDebt).toBeCloseTo(baseline.returns.wacc.weightDebt!, 10);
  expect(after.returns.wacc.notes.join(" ")).toMatch(/complete|excluded|not used/);
});

it("withholds WACC when no complete balance remains", () => {
  const bundle = completeCurrencyBundle({ debt: 300 });
  for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
    const statement = bundle.statements[key];
    if (!statement.ok) throw new Error("fixture");
    for (const row of statement.value.data.rows) {
      row.totalDebt = undefined;
      row.fieldConflicts = { totalDebt: { usable: false, vendorValue: 1, secValue: null,
        reason: "incomplete debt carrying value: a component is ambiguous" } };
    }
  }
  expect(runStageB(bundle).returns.wacc.waccPct).toBeNull();
});
