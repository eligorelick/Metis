import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import { runResearchRoutePanel } from "./helpers/researchRoutePanel";

const tag = "AvailableForSaleSecuritiesDebtSecurities";
function fixture(point: Record<string, unknown> = {}, unit = "USD", confirmed = true) {
  const b = completeCurrencyBundle({ debt: 300 });
  withIssuerFacts(b, { cik: 42, entityName: "Test", facts: { "us-gaap": {
    [tag]: { units: { [unit]: [{ end: "2025-12-31", val: 97.9e9, form: "10-Q", filed: "2026-04-30", accn: "test", ...point }] } },
  } } }, confirmed);
  return b;
}
const field = "valuation.dcf.fairValueFinancialAssets";

describe("F8 / VAL-14: excluded assets are left out and named", () => {
  it("discloses the AMZN-shaped 97.9B total without admitting a new asset", () => {
    const control = runStageB(completeCurrencyBundle({ debt: 300 })).valuation;
    const { computed, report, surfaces } = runResearchRoutePanel(fixture());
    if (control.kind !== "dcf" || computed.valuation.kind !== "dcf") throw new Error("fixture DCF");
    expect(computed.valuation.dcf).toEqual(control.dcf);
    const gap = computed.valuation.gaps.find(g => g.field === field)!;
    expect(gap).toBeDefined();
    expect(gap.severity).toBe("warn");
    expect(gap.reason).toContain(tag);
    expect(gap.reason).toContain("97,900M");
    expect(gap.reason).toContain("left out");
    expect(computed.gaps).toContainEqual(gap);
    expect(JSON.stringify(report)).toContain(gap.reason);
    for (const text of Object.values(surfaces)) {
      expect(text).toContain(tag);
      expect(text).toContain("97,900M");
    }
  });
  it.each([
    [{ val: 0 }, "USD", true], [{ end: "2024-12-31" }, "USD", true],
    [{ filed: "2027-01-01" }, "USD", true], [{ form: "8-K" }, "USD", true],
    [{ start: "2026-01-01" }, "USD", true], [{ dimensions: { member: "segment" } }, "USD", true],
    [{}, "EUR", true], [{}, "USD", false],
  ] as const)("does not disclose an ineligible total %j / %s / confirmed=%s", (point, unit, confirmed) => {
    expect(runStageB(fixture(point, unit, confirmed)).valuation.gaps.some(g => g.field === field)).toBe(false);
  });
  it("does not label an already counted tagged asset as excluded", () => {
    const b = fixture();
    for (const result of [b.statements.balanceAnnual, b.statements.balanceQuarterly]) {
      if (!result.ok) throw new Error("balance");
      for (const row of result.value.data.rows) {
        row.longTermInvestments = 97.9e9;
        row.fieldProvenance = { ...row.fieldProvenance, longTermInvestments: { source: "edgar", unit: "USD", periodStart: null, periodEnd: String(row.date), observedAt: b.builtAt, filings: [{ accn: "test", filed: "2026-04-30", form: "10-Q" }], tags: [`us-gaap/${tag}`] } };
      }
    }
    expect(runStageB(b).valuation.gaps.some(g => g.field === field)).toBe(false);
  });
});
