/**
 * Audit 2026-10-22 E-6: SIC 6324 (hospital and medical service plans:
 * UnitedHealth, Elevance, Cigna, Humana, Centene, Molina) mapped to "Insurance
 * - Life" and routed to the insurer map, which withholds financial debt and
 * values on excess return over book. Managed care is measured by its earnings
 * and free cash flow, and its debt is financing debt, not float. Owner
 * decision: the general route, with a sector note.
 */
import { describe, expect, it } from "vitest";

import { sectorIndustryForSic } from "@/edgar/sic";
import { runStageB } from "@/pipeline/compute";
import { deriveRoutingEvidence } from "@/pipeline/stageB/routingEvidence";
import { routeCompany, type RoutingProfile } from "@/pipeline/stageB/sectorRouting";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FetchResult } from "@/types/core";
import { currencyBundle } from "./helpers/currencyBundle";

/** Premiums earned and claim reserves: what a health plan files, and the insurer evidence rule's signals. */
function planFacts(): FetchResult<CompanyFacts> {
  const usd = (val: number, start?: string) => ({ units: { USD: [{ ...(start ? { start } : {}), end: "2025-12-31", val, accn: "0000731766-26-000010", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-15" }] } });
  const data = { cik: 731766, entityName: "Health Plan", facts: { "us-gaap": {
    PremiumsEarnedNet: usd(344_000_000_000, "2025-01-01"),
    LiabilityForClaimsAndClaimsAdjustmentExpense: usd(39_000_000_000),
  } } } as unknown as CompanyFacts;
  return { ok: true, value: { data, asOf: "2025-12-31", source: "edgar", endpoint: "xbrl/companyfacts", fetchedAt: "2026-07-06T00:00:00.000Z" } };
}
function route(over: Partial<RoutingProfile>) {
  const profile: RoutingProfile = { sector: null, industry: null, isAdr: false, isEtf: false, isFund: false, ipoDate: "1984-10-17", country: "US", currency: "USD", sic: null, ...over };
  return routeCompany(profile, { incomeTtm: null, incomeAnnual: null, cashflowTtm: null, cashflowAnnual: null, availableQuarters: null }, { today: "2026-07-06", evidence: deriveRoutingEvidence(planFacts()) });
}

describe("managed care is not a life insurer (audit 2026-10-22 E-6)", () => {
  it("labels SIC 6324 as a healthcare plan", () => {
    expect(sectorIndustryForSic("6324")).toEqual({ sic: 6324, sector: "Healthcare", industry: "Medical - Healthcare Plans" });
    expect(sectorIndustryForSic("6311")).toMatchObject({ industry: "Insurance - Life" });
  });

  it.each([
    ["keyless (SIC label)", { ...sectorIndustryForSic("6324"), sic: "6324" }],
    ["vendor industry", { sector: "Healthcare", industry: "Medical - Healthcare Plans", sic: "6324" }],
    ["SIC only", { sic: "6324" }],
  ] as const)("routes a health plan to the general map despite insurer-like tags (%s)", (_label, over) => {
    const result = route(over);
    expect(result.base).toBe("general");
    expect(result.notes.some(n => /SIC 6324.*managed care.*general map/.test(n))).toBe(true);
    expect(result.gaps.some(g => g.field === "route.evidence.conflict")).toBe(false);
  });

  it("keeps a health plan's financing debt in its WACC and enterprise value, whatever the vendor's industry label", () => {
    const run = (sic: string) => {
      const bundle = currencyBundle({ sic });
      if (bundle.profile.ok) Object.assign(bundle.profile.value.data.rows[0]!, { sector: "Financial Services", industry: "Insurance - Life" });
      return runStageB(bundle);
    };
    const plan = run("6324");
    expect(plan.route.base).toBe("general");
    expect(plan.returns.wacc.costOfDebtPct).not.toBeNull();
    expect(plan.returns.wacc.weightDebt).toBeGreaterThan(0);
    expect(plan.valuation.multiples?.enterpriseValue.value).not.toBeNull();
    const lifeInsurer = run("6311");
    expect(lifeInsurer.route.base).toBe("insurer");
    expect(lifeInsurer.returns.wacc.waccPct).toBeNull();
  });

  it("keeps a life insurer on the insurer map", () => {
    expect(route({ ...sectorIndustryForSic("6311"), sic: "6311" }).base).toBe("insurer");
    expect(route({ sic: "6311" }).base).toBe("insurer");
  });
});
