import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { degradationPlan } from "@/pipeline/stageB/sectorRouting";
import { degradationDisclosures } from "@/pipeline/stageC/payload";
import type { CompanyFacts } from "@/edgar/xbrl";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

function bankRun() {
  const b = completeCurrencyBundle({ bank: true, symbol: "BNKV", sic: "6021" });
  const fact = (end: string, val: number) => ({ end, val, accn: "0000000001-26-000001", form: "10-K", filed: "2026-02-15", fy: 2025, fp: "FY" });
  withIssuerFacts(b, { cik: 1, entityName: "Synthetic bank", facts: { "us-gaap": {
    Deposits: { units: { USD: [fact("2025-12-31", 1_400_000_000), fact("2024-12-31", 1_300_000_000)] } },
    LoansAndLeasesReceivableNetReportedAmount: { units: { USD: [fact("2025-12-31", 1_100_000_000), fact("2024-12-31", 1_000_000_000)] } },
  } } } as unknown as CompanyFacts);
  return runStageB(b, { evIncludeLeases: false });
}

describe("FIN-120: bank forensics disclosure names the grade that actually runs", () => {
  it("names the capital, credit and funding inputs rather than claiming they are not modeled", () => {
    const r = bankRun();
    const row = degradationDisclosures(r.degradation).find(d => d.field === "degradation.forensics");
    expect(row).toBeDefined();
    expect(row!.reason).not.toMatch(/NOT modelled|no replacement solvency screen/);
    expect(row!.reason).toMatch(/tangible common equity \/ tangible assets/);
    expect(row!.reason).toMatch(/net charge-offs \/ average loans/);
    expect(row!.reason).toMatch(/CET1 is shown when the filer tags it and is never graded/);
    expect(r.degradation.items.find(i => i.target === "forensics")!.action).toBe("suppress");
  });
  it("control: the same bank is graded on tangible common equity over tangible assets", () => {
    const r = bankRun();
    expect(r.route.base).toBe("bank");
    expect(r.scores.aspects.balanceSheet.score).not.toBeNull();
    expect((r.scores.aspects.balanceSheet.signals ?? []).map(s => s.id)).toContain("tceToTangibleAssets");
  });
  it("control: the insurer disclosures retain their existing text", () => {
    const plan = degradationPlan("insurer", [], 8);
    expect(plan.items.filter(i => i.target === "forensics")).toEqual([]);
    expect(plan.items.slice(0, 3).map(i => i.disclosure)).toEqual([
      "EV/EBITDA suppressed for insurers — investment leverage pollutes enterprise value.",
      "FCF DCF replaced by excess-return / dividend-discount framing — reserve timing distorts insurer CFO.",
      "Company-reported combined ratio is the gold standard; any in-house XBRL computation is an approximation (GAAP vs statutory denominator) and labeled as such.",
    ]);
  });
});
