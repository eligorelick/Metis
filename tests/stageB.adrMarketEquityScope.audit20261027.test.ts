import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { buildDataCompleteness } from "@/report/completeness";
import { adrMarketEquityBundle } from "./helpers/adrMarketEquityBundle";

const run = (options: Parameters<typeof adrMarketEquityBundle>[0] = {}) =>
  runStageB(adrMarketEquityBundle(options), { evIncludeLeases: false });

describe("FIN-307: ADR Altman market equity, with the WACC publication ruling", () => {
  it("substitutes calibrated book-equity Z-prime for an unproven ADR cap", () => {
    const c = run();
    expect(c.forensics.altman?.variant).toBe("private");
    expect(c.forensics.altman?.components.x4).toBeCloseTo(500e6 / 1_500e6, 10);
    expect(c.forensics.altman?.score).toBeCloseTo(1.14845, 10);
    expect(c.forensics.altman?.zone).toBe("distress");
    expect(c.forensics.altman?.thresholds).toEqual({ distressBelow: 1.23, safeAbove: 2.9 });
    expect(c.forensics.gaps.some(g => g.field === "forensics.altman.marketEquityScope")).toBe(true);
    expect(c.forensics.gaps.some(g => g.field === "forensics.economicClassBasis" && /ADR/.test(g.reason))).toBe(true);
    expect(run({ cap: 2_000e6 }).forensics.altman?.score).toBe(c.forensics.altman?.score);
  });
  it("preserves main's levered WACC and aggregate DCF without newly blocking the report", () => {
    const c = run(), ordinary = run({ adr: false });
    expect(c.returns.wacc.waccPct).toBe(ordinary.returns.wacc.waccPct);
    expect(c.returns.wacc.weightEquity).toBe(ordinary.returns.wacc.weightEquity);
    expect(c.returns.wacc.gaps.some(g => g.field === "returns.wacc.adrMarketEquityScope" && /not established.*issuer-common/.test(g.reason))).toBe(true);
    expect(c.valuation.kind).toBe("dcf");
    if (c.valuation.kind !== "dcf" || ordinary.valuation.kind !== "dcf") throw new Error("fixture valuation route");
    expect(c.valuation.dcf).not.toBeNull();
    // Main's ADR and ordinary aggregates already differ. Pin the actual
    // ADR main replay, not a counterfactual ordinary-security valuation.
    expect(c.valuation.dcf?.enterpriseValue).toBe(3_200_131_788.7891836);
    expect(c.valuation.dcf?.perShare).toBeNull(); // Existing B-19 ADS guard stays dominant.
    expect(buildDataCompleteness(c.gaps).state).not.toBe("blocked");
  });
  it("uses an issuer-common declaration only from the actual forensic cap source", () => {
    const declared = run({ profileScope: "issuer-common" });
    expect(declared.forensics.altman?.variant).toBe("original");
    expect(declared.forensics.altman?.score).toBeCloseTo(5.1595, 10);
    // Forensics keeps its existing profile-cap precedence; quote metadata
    // cannot validate the separately selected, unscoped profile cap.
    expect(run({ quoteScope: "issuer-common" }).forensics.altman?.variant).toBe("private");
  });
  it("keeps the existing currency refusal and debt-free cost-of-equity path", () => {
    const mismatch = run({ statementsCurrency: "EUR" });
    expect(mismatch.forensics.altman?.variant).toBe("private");
    expect(mismatch.forensics.gaps.some(g => g.field === "forensics.altman.currency")).toBe(true);
    expect(mismatch.returns.wacc.waccPct).toBeNull();
    const debtFree = run({ debt: 0 });
    expect(debtFree.returns.wacc.weightEquity).toBe(1);
    expect(debtFree.returns.wacc.waccPct).toBe(debtFree.returns.wacc.costOfEquityPct);
  });
  it("ordinary control preserves the market variant and missing-cap refusal", () => {
    const c = run({ adr: false });
    expect(c.forensics.altman?.variant).toBe("original");
    expect(c.forensics.altman?.components.x4).toBeCloseTo(10_000e6 / 1_500e6, 10);
    expect(c.forensics.altman?.score).toBeCloseTo(5.1595, 10);
    expect(c.returns.wacc.waccPct).toBeCloseTo(8.066, 3);
    const missing = run({ adr: false, cap: null });
    expect(missing.forensics.altman?.variant).toBe("original");
    expect(missing.forensics.altman?.score).toBeNull();
    expect(missing.forensics.gaps.some(g => g.field === "forensics.altman.marketCap")).toBe(true);
    expect(missing.forensics.gaps.some(g => g.field === "forensics.altman.marketEquityScope")).toBe(false);
  });
});
