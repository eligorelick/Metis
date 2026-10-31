import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { confidenceCeilingFor } from "@/pipeline/stageC/confidenceCeiling";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { ScoreAspect } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

const point = (val: number) => ({ units: { USD: [{ end: "2025-12-31", val, accn: "0000000001-26-000001",
  form: "10-K", filed: "2026-02-15", fy: 2025, fp: "FY" }] } });
function run(conflict: boolean) {
  const b = completeCurrencyBundle({ symbol: "CREDIT" });
  if (!b.profile.ok) throw new Error("fixture profile missing");
  Object.assign(b.profile.value.data.rows[0]!, { sector: "Financial Services", industry: "Credit Services" });
  withIssuerFacts(b, { cik: 1, entityName: "Synthetic deposit-funded credit company", facts: { "us-gaap": conflict ? {
    Deposits: point(1_000_000_000), LoansAndLeasesReceivableNetReportedAmount: point(1_200_000_000),
  } : {} } } as unknown as CompanyFacts);
  const computed = runStageB(b, { evIncludeLeases: false });
  const report = buildDataOnlyReport({ symbol: b.symbol, companyName: "Synthetic credit company", generatedAt: b.builtAt,
    model: "none", costUsd: 0, bundle: b, computed, validation: { checks: [], flags: [], gaps: [] },
    costBreakdown: [], reason: "Offline synthetic valuation evidence regression" });
  return { computed, report };
}

describe("FIN-123: unresolved valuation is applicable but missing evidence", () => {
  it("keeps the valuation unscored, names the hold and caps confidence low", () => {
    const { computed, report } = run(true);
    expect(computed.valuation.kind).toBe("ineligible");
    const v = computed.scores.aspects.valuation;
    expect(v.score).toBeNull();
    expect(v.notApplicableReason).toBe("Valuation withheld: model applicability unresolved (see valuation.modelEligibility) — counted as missing evidence, not as a route without valuation");
    expect(v.notApplicableReason).not.toMatch(/\d|no applicable signals for this route/);
    expect(v.applicableCompleteness).toBe(0);
    expect(confidenceCeilingFor("valuation", report)).toEqual({ ceiling: "low", reason: "the deterministic valuation score is unscored" });
  });
  it("counts the valuation's still-applicable share in the composite evidence ceiling", () => {
    const s = run(true).computed.scores;
    let actualEvidence = 0, otherCeiling = 0;
    for (const key of Object.keys(s.aspects) as ScoreAspect[]) {
      if (key === "valuation") continue;
      const a = s.aspects[key], weight = s.composite.weights[key];
      if (a.applicableCompleteness === null) continue;
      // The D-96 hold also leaves balance-sheet coverage/conversion/SBC
      // (55 of 85 weight units) and ROIC level/floor (75 of 100) applicable
      // but missing. Zero/zero stored ratios cannot recover those ceilings.
      if (a.applicableCompleteness === 0) {
        expect(["balanceSheet", "moat"]).toContain(key);
        expect(a.score).toBeNull();
        expect(a.dataCompleteness).toBe(0);
        otherCeiling += weight * (key === "balanceSheet" ? 0.55 / 0.85 : 0.75);
        continue;
      }
      expect(a.applicableCompleteness, key).toBeGreaterThan(0);
      otherCeiling += weight * a.dataCompleteness / a.applicableCompleteness!;
      if (a.score !== null) actualEvidence += weight * a.dataCompleteness;
    }
    expect(s.assessments?.evidenceCompleteness).toBeCloseTo(
      actualEvidence / (otherCeiling + s.composite.weights.valuation * 0.3), 10);
  });
  it("control: an unconflicted credit company still scores its valuation", () => {
    const { computed } = run(false);
    expect(computed.route.modelEligibility).toBeUndefined();
    expect(computed.scores.aspects.valuation.score).not.toBeNull();
  });
});
