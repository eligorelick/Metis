import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { reportToMarkdown } from "@/report/export/markdown";
import type { CompanyFacts } from "@/edgar/xbrl";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

const pt = (val: number, start?: string) => ({ units: { USD: [{ ...(start ? { start } : {}), end: "2025-12-31", val,
  accn: "0000000001-26-000001", form: "10-K", filed: "2026-02-15", fy: 2025, fp: "FY" }] } });

function run(bankFacts: boolean, broadSic = false) {
  const b = completeCurrencyBundle({ symbol: "TECHBANK", sic: broadSic ? "6199" : "3571" });
  if (!b.statements.balanceAnnual.ok || !b.profile.ok) throw new Error("fixture inputs missing");
  for (const row of b.statements.balanceAnnual.value.data.rows) Object.assign(row, {
    totalCurrentAssets: 700_000_000, totalCurrentLiabilities: 300_000_000, retainedEarnings: 600_000_000,
  });
  if (broadSic) Object.assign(b.profile.value.data.rows[0]!, { sector: "", industry: "" });
  withIssuerFacts(b, { cik: 1, entityName: "Synthetic hardware maker with a deposit-taking arm", facts: { "us-gaap": bankFacts ? {
    Deposits: pt(400_000_000), LoansAndLeasesReceivableNetReportedAmount: pt(500_000_000),
    InterestIncomeExpenseNet: pt(30_000_000, "2025-01-01"),
  } : {} } } as unknown as CompanyFacts);
  const computed = runStageB(b, { evIncludeLeases: false });
  const report = buildDataOnlyReport({ symbol: b.symbol, companyName: "Synthetic hardware maker", generatedAt: b.builtAt,
    model: "none", costUsd: 0, bundle: b, computed, validation: { checks: [], flags: [], gaps: [] },
    costBreakdown: [], reason: "Offline synthetic forensics regression" });
  return { computed, report };
}

describe("FIN-124: forensics when model eligibility is unresolved", () => {
  it("withholds Altman Z with an eligibility reason and blanks its report cell", () => {
    const { computed, report } = run(true);
    expect(computed.route.base).toBe("general");
    expect(computed.route.modelEligibility?.status).toBe("unresolved");
    expect(computed.forensics.altman?.score ?? null).toBeNull();
    expect(computed.forensics.altmanSelection.variant).toBeNull();
    expect(computed.forensics.gaps.find(g => g.field === "forensics.altmanZ")?.reason)
      .toMatch(/Altman Z withheld: Altman Z eligibility unresolved/);
    expect(report.quality.forensicScores?.altman?.score).toBeNull();
    expect(report.quality.forensicScores?.altman?.zone).toBeNull();
    expect(reportToMarkdown(report)).not.toMatch(/\| Altman Z \| original \| 5\.49 \| safe/);
  });
  it("names unresolved applicability on Beneish, accruals and Piotroski instead of a financial classification", () => {
    const fx = run(true).computed.forensics;
    for (const field of ["forensics.beneishM", "forensics.accrualsRatio"]) {
      const reason = fx.gaps.find(g => g.field === field)?.reason;
      expect(reason, field).toMatch(/model applicability unresolved/);
      expect(reason, field).not.toMatch(/for a financial company/);
    }
    const piotroskiNote = fx.notes.find(n => n.startsWith("Piotroski F-score"));
    expect(piotroskiNote).toMatch(/model applicability unresolved/);
    expect(piotroskiNote).not.toMatch(/for a financial company/);
    expect(fx.piotroski?.variant).toBe("eligibility-unresolved");
    expect(fx.piotroski?.notes.join(" ")).toMatch(/model applicability unresolved/);
  });
  it("control: the same operating issuer without bank facts retains its Altman figure", () => {
    const { computed } = run(false);
    expect(computed.route.modelEligibility).toBeUndefined();
    expect(computed.forensics.altmanSelection.variant).toBe("original");
    expect(computed.forensics.altman?.score).toBeCloseTo(5.4895, 10);
  });
  it("control: broad SIC6199 keeps its own unresolved-eligibility wording", () => {
    const fx = run(false, true).computed.forensics;
    expect(fx.piotroski?.variant).toBe("eligibility-unresolved");
    expect(fx.piotroski?.notes.join(" ")).toContain("broad SIC 6199 alone");
    expect(fx.gaps.find(g => g.field === "forensics.beneishM")?.reason).toBe(
      "Beneish M-score eligibility unresolved: broad SIC 6199 alone does not validate the operating business model; withheld pending methodology review.");
  });
});
