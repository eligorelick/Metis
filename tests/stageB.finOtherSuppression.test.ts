import { describe, expect, it } from "vitest";

import { metricPolicy } from "@/pipeline/stageB/sectorRouting";
import { isFinancialForensicsSuppressed } from "@/pipeline/stageB/forensics";
import type { CompanyRoute } from "@/types/core";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

/**
 * FIN-OTHER: a financial company that is not a bank, insurer or mortgage REIT.
 *
 * `sectorRouting.ts:272` deliberately routes FMP sector "Financial Services"
 * with no bank/insurance/REIT industry to base "general" — asset managers,
 * exchanges, brokers, insurance brokers. But `isFinancialForensicsSuppressed`
 * returns true on the SECTOR alone, so `runForensics` nulls Altman, Beneish AND
 * the accrual ratios for exactly those companies.
 *
 * The "general" policy suppresses nothing, so all three signals counted toward
 * the quality aspect's `applicableWeight` while contributing nothing to
 * `usedWeight` — a phantom missing-data penalty on 43% of quality weight
 * (altmanZ 0.16 + beneishM 0.12 + accrualsRatioAbs 0.15) for data the pipeline
 * itself refuses to compute. The two predicates must agree.
 */
const finRoute = (
  base: CompanyRoute["base"],
  sector: string | null,
  sic: string | null = null,
): CompanyRoute => ({
  base,
  overlays: [],
  evidence: { sector, industry: null, ...(sic === null ? {} : { sic }) },
});

const FORENSIC_SIGNALS = ["altmanZ", "beneishM", "accrualsRatio"] as const;

describe("FIN-OTHER forensic suppression agrees with the forensics classifier", () => {
  it.each([true, false])("L8 uses Beneish applicability for the receivables flag (financial=%s)", financial => {
    const b = completeCurrencyBundle({});
    if (!b.profile.ok || !b.statements.balanceAnnual.ok) throw Error("fixture");
    if (financial) Object.assign(b.profile.value.data.rows[0]!, { sector: "Financial Services", industry: "Financial - Capital Markets" });
    Object.assign(b.statements.balanceAnnual.value.data.rows[0]!, { accountsReceivables: 400e6, netReceivables: 400e6 });
    Object.assign(b.statements.balanceAnnual.value.data.rows[1]!, { accountsReceivables: 100e6, netReceivables: 100e6 });
    const c = runStageB(b);
    expect(c.forensics.flags.some(f => f.id === "receivables-vs-revenue")).toBe(!financial);
    if (financial) {
      expect(c.forensics.beneish).toBeNull();
      expect(c.forensics.gaps.find(g => g.field === "forensics.flags.receivablesApplicability")?.reason).toMatch(/Beneish.*DSRI|DSRI.*Beneish/i);
    }
  });
  it("suppresses the three forensic signals for a general-route asset manager", () => {
    const route = finRoute("general", "Financial Services");

    // Precondition: forensics really does refuse to compute them here.
    expect(isFinancialForensicsSuppressed(route)).toBe(true);

    const { suppress } = metricPolicy(route);
    for (const signal of FORENSIC_SIGNALS) expect(suppress).toContain(signal);
  });

  it("suppresses them for a SIC 6000-6799 issuer routed to general", () => {
    const route = finRoute("general", null, "6282");

    expect(isFinancialForensicsSuppressed(route)).toBe(true);

    const { suppress } = metricPolicy(route);
    for (const signal of FORENSIC_SIGNALS) expect(suppress).toContain(signal);
  });

  it("leaves an ordinary non-financial issuer scored on all three", () => {
    const route = finRoute("general", "Technology");

    expect(isFinancialForensicsSuppressed(route)).toBe(false);

    const { suppress } = metricPolicy(route);
    for (const signal of FORENSIC_SIGNALS) expect(suppress).not.toContain(signal);
  });

  it("does not suppress them for an equity REIT, which stays on the general forensic map", () => {
    const route = finRoute("reit", "Real Estate", "6798");

    expect(isFinancialForensicsSuppressed(route)).toBe(false);

    const { suppress } = metricPolicy(route);
    for (const signal of FORENSIC_SIGNALS) expect(suppress).not.toContain(signal);
  });

  it("still suppresses them on the routes that already did", () => {
    for (const base of ["bank", "insurer", "reit-mortgage"] as const) {
      const { suppress } = metricPolicy(finRoute(base, null));
      for (const signal of FORENSIC_SIGNALS) expect(suppress).toContain(signal);
    }
  });

  it("keeps the bare-SectorRoute form working (no evidence to classify on)", () => {
    // Callers that pass just the base string get the base policy unchanged.
    expect(metricPolicy("general").suppress).not.toContain("altmanZ");
    expect(metricPolicy("bank").suppress).toContain("altmanZ");
  });
});
