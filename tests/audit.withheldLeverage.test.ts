/**
 * Audit O-3 (docs/audit/2026-10-20-independent-audit-fixes.md): once a debt
 * figure is withheld, nothing downstream may still score or print a leverage
 * number built from it.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { keyDataRows } from "@/report/presentation";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

describe("withheld debt leaves no leverage figure behind (audit O-3)", () => {
  /** Quarterly debt far too small for the interest the issuer pays. */
  function withheldDebt() {
    const bundle = completeCurrencyBundle({ debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture has quarterly balances");
    for (const row of bundle.statements.balanceQuarterly.value.data.rows) {
      row.totalDebt = 40e6;
      row.netDebt = -30e6;
    }
    return runStageB(bundle);
  }

  it("scores the balance sheet without net debt / EBITDA and with the weight renormalised", () => {
    const out = withheldDebt();
    expect(out.gaps.some((gap) => /^statements\.balance\.[^.]+\.totalDebt$/.test(gap.field))).toBe(true);
    const aspect = out.scores.aspects.balanceSheet;
    expect((aspect.signals ?? []).map((signal) => signal.id)).not.toContain("netDebtToEbitda");
    expect(aspect.score).not.toBeNull();
    expect(aspect.applicableCompleteness).toBeLessThan(1);
    expect(out.capital.current?.netDebtToEbitda ?? null).toBeNull();
  });

  it("withholds EV/EBITDA rather than computing it from the withheld debt", () => {
    const out = withheldDebt();
    expect(out.valuation.multiples?.enterpriseValue.value ?? null).toBeNull();
    expect(out.valuation.multiples?.multiples.find((m) => m.key === "evToEbitda")?.current ?? null).toBeNull();
  });

  it("marks the Key data EV/EBITDA row withheld instead of dropping it silently", () => {
    const report = loadTask28Fixture();
    const multiple = report.valuation.multiples[0]!;
    multiple.name = "EV/EBITDA";
    multiple.current = null;
    report.appendix.missingData.push({
      field: "statements.balance.2026-06-30.totalDebt",
      reason: "incomplete debt carrying value: annual interest expense implies 30.0% on resolved financing debt",
      severity: "warn",
    });
    const row = keyDataRows(report).find((candidate) => /^EV\/EBITDA/i.test(candidate.label));
    expect(row?.value).toBe("withheld");
    expect(row?.note).toMatch(/debt incomplete/);
  });

  it("still omits the row when EV/EBITDA is simply unavailable", () => {
    const report = loadTask28Fixture();
    Object.assign(report.valuation.multiples[0]!, { name: "EV/EBITDA", current: null });
    report.appendix.missingData = report.appendix.missingData.filter((gap) => !/\.totalDebt$/.test(gap.field));
    expect(keyDataRows(report).some((candidate) => /^EV\/EBITDA/i.test(candidate.label))).toBe(false);
  });
});
