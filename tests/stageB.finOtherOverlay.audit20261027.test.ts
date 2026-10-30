import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { metricPolicy } from "@/pipeline/stageB/sectorRouting";
import { buildDataCompleteness } from "@/report/completeness";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function brokerBundle() {
  const b = completeCurrencyBundle({ burning: true, sic: "6211", symbol: "BRKV" });
  if (!b.profile.ok || !b.profile.value.data.rows[0]) throw new Error("fixture profile missing");
  Object.assign(b.profile.value.data.rows[0], { sector: "Financial Services", industry: "Financial - Capital Markets" });
  return b;
}

describe("FIN-121: profitable FIN-OTHER issuers with negative operating cash flow", () => {
  it("retains profitability, applicable P/E and Piotroski and a DCF when inputs support one", () => {
    const r = runStageB(brokerBundle(), { evIncludeLeases: false });
    expect(r.route.base).toBe("general");
    expect(r.route.overlays).not.toContain("unprofitable");
    expect(metricPolicy(r.route).suppress).not.toContain("pe");
    expect(metricPolicy(r.route).suppress).not.toContain("piotroskiF");
    expect(r.valuation.kind).toBe("dcf");
    expect(r.valuation.notes.join(" ")).not.toMatch(/unprofitable overlay/);
    expect(buildDataCompleteness(r.gaps).state).not.toBe("blocked");
  });
  it("control: the same bank flows do not label a bank unprofitable", () => {
    const r = runStageB(completeCurrencyBundle({ burning: true, bank: true, symbol: "BNKV" }), { evIncludeLeases: false });
    expect(r.route.base).toBe("bank");
    expect(r.route.overlays).not.toContain("unprofitable");
  });
  it("control: the same non-financial flows retain the unprofitable overlay", () => {
    const r = runStageB(completeCurrencyBundle({ burning: true, symbol: "TECHV" }), { evIncludeLeases: false });
    expect(r.route.overlays).toContain("unprofitable");
    expect(r.valuation.kind).toBe("dcf-suppressed");
  });
  it("preserves main's publishable withheld valuation if operating-income inputs are missing", () => {
    const b = brokerBundle();
    for (const rows of [b.statements.incomeAnnual, b.statements.incomeQuarterly]) {
      if (!rows.ok) throw new Error("fixture income rows missing");
      for (const row of rows.value.data.rows) delete row.operatingIncome;
    }
    const r = runStageB(b, { evIncludeLeases: false });
    expect(buildDataCompleteness(r.gaps).state, JSON.stringify(r.gaps.filter(g => g.severity === "critical"))).not.toBe("blocked");
    expect(r.valuation.kind).toBe("dcf-suppressed");
    expect(r.route.overlays).not.toContain("unprofitable");
    expect(r.valuation.gaps.find(g => g.field === "valuation.dcf")?.reason).toMatch(/Prior DCF suppression retained.*no EBIT margin/);
    expect(r.valuation.notes.join(" ")).not.toContain("unprofitable overlay");
    expect(r.fairValue.basis.join(" ")).toMatch(/no EBIT margin/);
  });
  it("preserves main's withheld valuation when the newly admitted DCF would mix currencies", () => {
    const b = brokerBundle();
    if (!b.profile.ok) throw new Error("fixture profile missing");
    b.profile.value.data.rows[0]!.currency = "EUR";
    const r = runStageB(b, { evIncludeLeases: false });
    expect(buildDataCompleteness(r.gaps).state).not.toBe("blocked");
    expect(r.valuation.kind).toBe("dcf-suppressed");
    expect(r.valuation.multiples).not.toBeNull();
    expect(r.valuation.multiples!.multiples.find(m => m.key === "peTtm")?.current).toBeNull();
  });
  it("control: a genuinely missing cost of equity keeps its existing critical failure", () => {
    const b = brokerBundle();
    if (!b.profile.ok) throw new Error("fixture profile missing");
    b.profile.value.data.rows[0]!.beta = 0;
    const r = runStageB(b, { evIncludeLeases: false });
    expect(r.returns.wacc.waccPct).toBeNull();
    expect(buildDataCompleteness(r.gaps).state).toBe("blocked");
    expect(r.returns.gaps.some(g => g.severity === "critical")).toBe(true);
  });
  it("control: an already applicable non-financial DCF keeps its critical missing-margin check", () => {
    const b = completeCurrencyBundle({ symbol: "TECHV" });
    for (const rows of [b.statements.incomeAnnual, b.statements.incomeQuarterly]) {
      if (!rows.ok) throw new Error("fixture income rows missing");
      for (const row of rows.value.data.rows) delete row.operatingIncome;
    }
    const r = runStageB(b, { evIncludeLeases: false });
    expect(r.valuation.kind).toBe("dcf");
    expect(r.gaps.find(g => g.field === "valuation.dcf.ebitMargin")?.severity).toBe("critical");
    expect(buildDataCompleteness(r.gaps).state).toBe("blocked");
  });
});
