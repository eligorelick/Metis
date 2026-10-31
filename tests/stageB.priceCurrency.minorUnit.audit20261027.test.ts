import { describe, expect, it } from "vitest";
import { statementCurrencies } from "@/pipeline/compute";
import { peerDiscoveryScreen } from "@/pipeline/peers";
import { comparePriceCurrency } from "@/pipeline/stageB/priceCurrency";
import { normalizeReportedCurrency } from "@/pipeline/stageB/sectorRouting";
import { buildDataCompleteness } from "@/report/completeness";
import { buildSyntheticRouteBundle, runResearchRoutePanel } from "./helpers/researchRoutePanel";

function london(code: string, debt = false) {
  const bundle = buildSyntheticRouteBundle("general");
  for (const result of Object.values(bundle.statements)) if (result.ok) {
    for (const row of result.value.data.rows) row.reportedCurrency = "GBP";
  }
  if (!bundle.profile.ok || !bundle.quote.ok) throw new Error("fixture");
  Object.assign(bundle.profile.value.data.rows[0], { currency: code, price: code === "GBP" ? 100 : 10000, country: "GB" });
  Object.assign(bundle.quote.value.data.rows[0], { price: code === "GBP" ? 100 : 10000 });
  if (debt) {
    for (const result of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (!result.ok) throw new Error("fixture");
      for (const row of result.value.data.rows) Object.assign(row, { totalDebt: 300e6, shortTermDebt: 100e6, longTermDebt: 200e6 });
    }
    for (const result of [bundle.statements.incomeAnnual, bundle.statements.incomeQuarterly]) {
      if (!result.ok) throw new Error("fixture");
      for (const row of result.value.data.rows) row.interestExpense = result === bundle.statements.incomeAnnual ? 12e6 : 3e6;
    }
  }
  return bundle;
}

describe("FIN-107 minor-unit quote currencies", () => {
  it("refuses pence as an unproven unit, not an FX mismatch", () => {
    const comparison = comparePriceCurrency("GBP", " GBp ");
    expect(comparison).toMatchObject({ comparable: false, mismatch: false });
    if (comparison.comparable) throw new Error("pence must be refused");
    expect(comparison.reason).toContain("GBp (pence, a minor unit of GBP)");
  });

  it.each(["GBp", "GBX", "GBx", "ZAc", "ZAC", "ILA", "ILa"])("refuses %s on either side, including equal raw codes", (code) => {
    expect(comparePriceCurrency("GBP", code)).toMatchObject({ comparable: false, mismatch: false });
    expect(comparePriceCurrency(code, "GBP")).toMatchObject({ comparable: false, mismatch: false });
    expect(comparePriceCurrency(code, code)).toMatchObject({ comparable: false, mismatch: false });
    expect(normalizeReportedCurrency(code)).toBeNull();
  });

  it("retains ordinary case-folded ISO controls", () => {
    expect(comparePriceCurrency("cad", " CAD ")).toEqual({ comparable: true, currency: "CAD" });
    expect(comparePriceCurrency("GBP", "gbp")).toEqual({ comparable: true, currency: "GBP" });
    expect(normalizeReportedCurrency("gbp")).toBe("GBP");
  });

  it("withholds pence price comparisons and never labels technical prices as pounds", () => {
    const bundle = london("GBp");
    expect(statementCurrencies(bundle).trading).toBeNull();
    const { computed, report } = runResearchRoutePanel(bundle);
    expect(computed.gaps.find(g => g.field === "valuation.priceComparison.currency")?.reason).toMatch(/pence/);
    expect(computed.valuation.multiples?.multiples.find(m => m.key === "peTtm")?.current ?? null).toBeNull();
    expect(computed.fairValue.upsidePct).toBeNull();
    expect(computed.valuation.gaps.some(g => g.field === "valuation.multiples.currency" && /pence/.test(g.reason))).toBe(true);
    const prices = report.technicals.indicators.filter(n => n.unit === "currency/share");
    // Existing provenance rule: an unknown currency cannot be a verified
    // monetary indicator. Raw technical levels remain available without scaling.
    expect(prices).toEqual([]);
    expect(computed.technicals.lastClose).toBe(100);
    expect(report.technicals.read.keyLevels).toBe("SMA50 98.78 · SMA200 95.03 · 52-week high n/a · 52-week low n/a");
  });

  it("pins main's pound P/E, intrinsic value and report completeness", () => {
    const { computed } = runResearchRoutePanel(london("GBP"));
    expect(computed.valuation.multiples?.multiples.find(m => m.key === "peTtm")?.current).toBe(55.55555555555556);
    expect(computed.fairValue.upsidePct).not.toBeNull();
    expect(computed.valuation.kind).toBe("dcf");
    if (computed.valuation.kind !== "dcf") throw new Error("control must reach DCF");
    expect(computed.valuation.dcf?.perShare).toBe(33.071586064921725);
    expect(buildDataCompleteness(computed.gaps)).toMatchObject({ state: "degraded", criticalCount: 0 });
  });

  it.each(["GBP", "GBp"])("preserves main's publishable levered valuation for %s", (code) => {
    const { computed, report } = runResearchRoutePanel(london(code, true));
    expect(computed.returns.wacc.waccPct).toBe(8.345631067961166);
    expect(computed.valuation.kind).toBe("dcf");
    if (computed.valuation.kind !== "dcf") throw new Error("levered control must reach DCF");
    expect(computed.valuation.dcf?.perShare).toBe(29.5563830296073);
    expect(computed.fairValue.status).toBe("available");
    expect(buildDataCompleteness(computed.gaps)).toMatchObject({ state: "degraded", criticalCount: 0 });
    expect(report.appendix.missingData.filter(g => g.severity === "critical").map(g => g.field)).toEqual(["analysis.llm"]);
    if (code === "GBp") expect(computed.returns.wacc.notes.join(" ")).toMatch(/legacy.*unproven.*unit/i);
  });

  it("does not restore WACC for a quote main already refused", () => {
    const { computed } = runResearchRoutePanel(london("GBX", true));
    expect(computed.returns.wacc.waccPct).toBeNull();
    expect(computed.gaps.some(g => g.field === "returns.wacc.weights.currency" && g.severity === "critical")).toBe(true);
  });

  it("preserves B3's established-currency and same-market discovery policy", () => {
    const input = { subjectSymbol: "ROOT.L", subjectCap: 1e9, peerSymbol: "PEER.L", peerCap: 1e3 };
    expect(peerDiscoveryScreen({ ...input, subjectCurrency: "GBp", peerCurrency: "GBP" })).toEqual({
      kind: "not-compared", reason: "size not compared: listed in GBP, the subject in an unestablished currency; no currency conversion",
    });
    expect(peerDiscoveryScreen({ ...input, subjectCurrency: "GBP", peerCurrency: "GBp" })).toEqual({
      kind: "excluded", reason: "size screen: market cap 0M is 1,000,000× smaller than the subject's 1.00B, outside the 100× comparable-size band (house rule D-65)",
    });
  });
});
