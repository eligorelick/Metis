/**
 * Audit 2026-10-22 B-13 and A-3: there was no utility route. DUK, NEE and SO
 * were graded on the general balance-sheet bands (net debt / EBITDA, EBIT
 * coverage, FCF conversion, SBC) and on Altman Z'', all calibrated on
 * industrials, so a regulated utility in its capex cycle scored F.
 *
 * The owner's rule: a regulated-utility overlay on the general route for SIC
 * 4911, 4931, 4932, 4941 or 4924 with filed evidence of rate-regulated revenue
 * or regulatory assets. Its balance sheet is scored on Moody's "Regulated
 * Electric and Gas Utilities" factor ranges (CFO pre-working-capital / debt and
 * debt / book capitalization), with no Altman Z in quality and no FCF
 * conversion scoring. No other issuer changes route.
 */
import { describe, expect, it } from "vitest";

import type { CompanyFacts } from "@/edgar/xbrl";
import { runStageB } from "@/pipeline/compute";
import type { ScoringInputs } from "@/pipeline/stageB/grading";
import { describeScoreEvidence } from "@/pipeline/stageB/scoringEvidence";
import { signalLabel } from "@/report/presentation";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { selectAltmanVariant } from "@/pipeline/stageB/forensics";
import { deriveRoutingEvidence } from "@/pipeline/stageB/routingEvidence";
import { metricPolicy, routeCompany, type RoutingProfile, type RoutingStatements } from "@/pipeline/stageB/sectorRouting";
import { deferredIncomeTaxesAt, utilityCreditMetrics } from "@/pipeline/stageB/utilityCredit";
import type { FetchResult } from "@/types/core";
import { compositeNote } from "@/report/assessment";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { reportToMarkdown } from "@/report/export/markdown";

const pt = (end: string, val: number, form = "10-Q", filed = "2026-05-05", start?: string) =>
  ({ end, val, accn: `0001326160-26-${filed.slice(5, 7)}${filed.slice(8)}`, fy: 2026, fp: "Q1", form, filed, ...(start ? { start } : {}) });
const facts = (tags: Record<string, ReturnType<typeof pt>[]>): CompanyFacts =>
  ({ cik: 1326160, entityName: "TEST", facts: { "us-gaap": Object.fromEntries(Object.entries(tags).map(([t, pts]) => [t, { units: { USD: pts } }])) } }) as unknown as CompanyFacts;
const fetched = (f: CompanyFacts): FetchResult<CompanyFacts> =>
  ({ ok: true, value: { data: f, source: "edgar", fetchedAt: "2026-10-22T00:00:00Z" } }) as unknown as FetchResult<CompanyFacts>;

/** DUK's regulatory tags at 2026-03-31 (companyfacts CIK 1326160). */
const DUK_FACTS = facts({
  RegulatoryAssetsNoncurrent: [pt("2026-03-31", 15_059e6)],
  RegulatoryAssetsCurrent: [pt("2026-03-31", 2_201e6)],
  RegulatedOperatingRevenueElectricNonNuclear: [pt("2026-03-31", 7_803e6, "10-Q", "2026-05-05", "2026-01-01")],
  // A tag last filed in 2016 is not evidence of today's business.
  RegulatedEntityOtherAssetsNoncurrent: [pt("2016-12-31", 12_895e6, "10-K", "2017-02-21")],
  DeferredIncomeTaxesAndOtherTaxLiabilitiesNoncurrent: [pt("2026-03-31", 12_500e6)],
});

const profile = (sic: string | null): RoutingProfile => ({
  sector: "Utilities", industry: "Utilities - Regulated Electric", isAdr: false, isEtf: false, isFund: false,
  ipoDate: "2005-04-04", country: "US", currency: "USD", sic,
});
const statements: RoutingStatements = {
  incomeTtm: { date: "2026-03-31", revenue: 32_000e6, netIncome: 4_800e6, reportedCurrency: "USD" },
  incomeAnnual: null,
  cashflowTtm: { date: "2026-03-31", operatingCashFlow: 12_300e6 },
  cashflowAnnual: null,
  availableQuarters: 20,
};
const TODAY = "2026-10-22";

describe("B-13: regulated-utility evidence and routing", () => {
  it("reads recent regulatory assets and rate-regulated revenue, not tags retired years ago", () => {
    const ev = deriveRoutingEvidence(fetched(DUK_FACTS), { today: TODAY });
    expect(ev.regulatedUtility.map((s) => s.tag).sort()).toEqual(
      ["RegulatedOperatingRevenueElectricNonNuclear", "RegulatoryAssetsCurrent", "RegulatoryAssetsNoncurrent"]);
    expect(ev.suggests).toBeNull();
    const old = deriveRoutingEvidence(fetched(facts({ RegulatoryAssetsNoncurrent: [pt("2023-12-31", 9e9, "10-K", "2024-02-20")] })), { today: TODAY });
    expect(old.regulatedUtility).toEqual([]);
  });

  it("reads only evidence filed by the run date, as a replay saw it", () => {
    // Filed after the run: not evidence then, even when it is newer.
    const later = facts({ RegulatoryAssetsNoncurrent: [pt("2026-09-30", 16e9, "10-Q", "2026-11-05")] });
    expect(deriveRoutingEvidence(fetched(later), { today: TODAY }).regulatedUtility).toEqual([]);
    const both = facts({ RegulatoryAssetsNoncurrent: [pt("2026-03-31", 15e9), pt("2026-09-30", 16e9, "10-Q", "2026-11-05")] });
    expect(deriveRoutingEvidence(fetched(both), { today: TODAY }).regulatedUtility.map((sig) => sig.end)).toEqual(["2026-03-31"]);
    // A period re-filed after the run (next year's comparative column) is read as it was first filed.
    const refiled = facts({ RegulatedOperatingRevenueElectricNonNuclear: [
      pt("2025-12-31", 30e9, "10-K", "2026-02-20", "2025-01-01"), pt("2025-12-31", 30e9, "10-K", "2027-02-20", "2025-01-01")] });
    expect(deriveRoutingEvidence(fetched(refiled), { today: "2026-06-01" }).regulatedUtility.map((sig) => sig.accn)).toEqual(["0001326160-26-0220"]);
  });

  it("puts a utility SIC with regulatory evidence on the regulated-utility overlay of the general route", () => {
    for (const sic of ["4911", "4922", "4923", "4931", "4932", "4941", "4924 NATURAL GAS DISTRIBUTION"]) {
      const r = routeCompany(profile(sic), statements, { today: TODAY, evidence: deriveRoutingEvidence(fetched(DUK_FACTS), { today: TODAY }) });
      expect(r.base).toBe("general");
      expect(r.overlays).toEqual(["regulated-utility"]);
      expect(r.notes.join(" ")).toMatch(/regulated-utility overlay applied: SIC 49\d\d.*RegulatoryAssetsNoncurrent/);
    }
  });

  it("does not apply the overlay without filed evidence, or to a non-utility SIC", () => {
    const none = routeCompany(profile("4911"), statements, { today: TODAY, evidence: deriveRoutingEvidence(fetched(facts({})), { today: TODAY }) });
    expect(none.overlays).toEqual([]);
    expect(none.notes.join(" ")).toMatch(/regulated-utility overlay not applied: SIC 4911 .*no rate-regulated revenue or regulatory assets/);
    const telecom = routeCompany(profile("4813"), statements, { today: TODAY, evidence: deriveRoutingEvidence(fetched(DUK_FACTS), { today: TODAY }) });
    expect(telecom.overlays).toEqual([]);
    const noSic = routeCompany(profile(null), statements, { today: TODAY, evidence: deriveRoutingEvidence(fetched(DUK_FACTS), { today: TODAY }) });
    expect(noSic.overlays).toEqual([]);
  });

  it("withholds Altman Z from a regulated utility", () => {
    const p = metricPolicy({ base: "general", overlays: ["regulated-utility"], evidence: { sector: null, industry: null } });
    expect(p.suppress).toContain("altmanZ");
    expect(p.suppress).toContain("fcfDcf");
    expect(p.suppress).toContain("reverseDcf");
    expect(metricPolicy({ base: "general", overlays: [], evidence: { sector: null, industry: null } }).suppress).not.toContain("altmanZ");
    // A-3: the forensic table does not print a Z'' either.
    const utility = selectAltmanVariant({ base: "general", overlays: ["regulated-utility"], evidence: { sector: "Utilities", industry: null, sic: "4931" } });
    expect(utility.variant).toBeNull();
    expect(utility.notes[0]).toMatch(/not computed for a regulated utility/);
    expect(selectAltmanVariant({ base: "general", overlays: [], evidence: { sector: "Utilities", industry: null, sic: "4931" } }).variant).toBe("z2");
  });
});

describe("D-204: regulated utilities retain relative valuation without an FCFF target", () => {
  function utilityBundle(regulated = true) {
    const b = completeCurrencyBundle({ sic: "4911" });
    if (!b.profile.ok) throw Error("fixture");
    Object.assign(b.profile.value.data.rows[0]!, { sector: "Utilities",
      industry: regulated ? "Utilities - Regulated Electric" : "Utilities - Independent Power Producers" });
    b.builtAt = `${TODAY}T00:00:00Z`;
    b.edgar.cik = { ok: true, value: { source: "edgar", endpoint: "company_tickers.json", fetchedAt: b.builtAt, asOf: TODAY,
      data: { cik: 1326160, cik10: "0001326160", ticker: b.symbol, title: "TEST" } } };
    b.edgar.companyFacts = fetched(regulated ? DUK_FACTS : facts({}));
    return b;
  }
  const utility = (regulated = true) => runStageB(utilityBundle(regulated));

  it("withholds the fair value, reverse DCF and fan with the utility reason, preserving multiples", () => {
    const c = utility();
    expect(c.route.overlays).toContain("regulated-utility");
    expect(c.valuation.kind).toBe("dcf-suppressed");
    expect(c.fairValue).toMatchObject({ status: "suppressed", perShare: null });
    expect(c.fairValue.reasons[0]?.reason).toMatch(/regulated utility.*external capital.*allowed return/i);
    expect(c.scenarioTargets.status).toBe("suppressed");
    expect(c.scenarioTargets.targets).toEqual([]);
    expect(c.scenarioTargets.missingReasons[0]?.reason).toMatch(/regulated utility/i);
    expect(c.valuation).not.toHaveProperty("reverseDcf");
    expect(c.valuation.multiples?.multiples.find(m => m.key === "peTtm")?.current).toBeGreaterThan(0);
    expect(c.valuation.multiples?.multiples.find(m => m.key === "evToEbitda")?.current).toBeGreaterThan(0);
    expect(c.scores.aspects.valuation.score).toBeNull();
    expect(compositeNote(c.scores)).toMatch(/Valuation.*counts as neutral.*Not directly comparable/);
  });

  it("keeps an independent generator without regulatory evidence on the FCFF route", () => {
    const c = utility(false);
    expect(c.route.overlays).not.toContain("regulated-utility");
    expect(c.valuation.kind).toBe("dcf");
  });
  it("prints the utility refusal, current multiples and D-201 neutral-weight note in a report", () => {
    const b = utilityBundle(), c = runStageB(b);
    const report = buildDataOnlyReport({ symbol: b.symbol, companyName: "Synthetic utility", generatedAt: b.builtAt,
      model: "none", costUsd: 0, bundle: b, computed: c, validation: { checks: [], flags: [], gaps: [] },
      costBreakdown: [], reason: "Offline utility regression" });
    expect(report.valuation.multiples.some(m => m.current !== null)).toBe(true);
    const markdown = reportToMarkdown(report);
    expect(markdown).toMatch(/Regulated utility: large capital spending/);
    expect(markdown).toMatch(/P\/E/);
    expect(markdown).toMatch(/EV\/EBITDA/);
    expect(markdown).toMatch(/Valuation.*counts as neutral.*Not directly comparable/);
  });
});

describe("B-13: Moody's financial-strength ratios", () => {
  it("reads the net deferred income tax liability at the balance date", () => {
    expect(deferredIncomeTaxesAt(DUK_FACTS, "2026-03-31", "USD", TODAY)?.value).toBe(12_500e6);
    expect(deferredIncomeTaxesAt(DUK_FACTS, "2025-12-31", "USD", TODAY)).toBeNull();
  });

  it("computes CFO before working capital over debt, and debt over book capitalization including deferred taxes", () => {
    const m = utilityCreditMetrics({
      asOf: "2026-03-31", operatingCashFlow: 12_300e6, changeInWorkingCapital: -700e6,
      totalDebt: 90_000e6, totalEquity: 55_000e6, deferredIncomeTaxes: { value: 12_500e6, basis: "us-gaap/DeferredIncomeTaxesAndOtherTaxLiabilitiesNoncurrent" },
    });
    // (12.3 + 0.7) / 90 and 90 / (90 + 55 + 12.5)
    expect(m.cfoPreWcToDebtPct).toBeCloseTo(1300 / 90, 9);
    expect(m.debtToBookCapitalizationPct).toBeCloseTo(9000 / 157.5, 9);
  });

  it("withholds each ratio, with the reason, when an input is not on file", () => {
    const m = utilityCreditMetrics({
      asOf: "2026-03-31", operatingCashFlow: 12_300e6, changeInWorkingCapital: null,
      totalDebt: 90_000e6, totalEquity: 55_000e6, deferredIncomeTaxes: null,
    });
    expect(m.cfoPreWcToDebtPct).toBeNull();
    expect(m.debtToBookCapitalizationPct).toBeNull();
    expect(m.notes.join(" ")).toMatch(/working-capital change is not on file/);
    expect(m.notes.join(" ")).toMatch(/deferred income taxes are not tagged/);
    const negative = utilityCreditMetrics({
      asOf: "2026-03-31", operatingCashFlow: 1, changeInWorkingCapital: 0, totalDebt: 10, totalEquity: -30, deferredIncomeTaxes: { value: 5, basis: "x" },
    });
    expect(negative.debtToBookCapitalizationPct).toBeNull();
    expect(negative.notes.join(" ")).toMatch(/book capitalization is not positive/);
  });
});

describe("B-13: the utility balance-sheet signals' evidence", () => {
  const credit = utilityCreditMetrics({
    asOf: "2026-03-31", operatingCashFlow: 12_300e6, changeInWorkingCapital: -700e6,
    totalDebt: 90_000e6, totalEquity: 55_000e6, deferredIncomeTaxes: { value: 12_500e6, basis: "us-gaap/DeferredIncomeTaxesAndOtherTaxLiabilitiesNoncurrent" },
  });
  function inputs(): ScoringInputs {
    const c = runStageB(completeCurrencyBundle({}), { evIncludeLeases: false });
    return { route: { ...c.route, overlays: ["regulated-utility"] }, policy: metricPolicy(c.route), growth: c.growth, ...c.returns,
      capital: c.capital, forensics: c.forensics, technicals: c.technicals, valuation: c.valuation, financialMetrics: c.financialMetrics,
      utilityCredit: credit, currentPrice: 100, asOf: "2026-10-17" };
  }

  it("names the two Moody's ratios in words", () => {
    expect(signalLabel("cfoPreWcToDebt")).toBe("CFO before working-capital changes / debt");
    expect(signalLabel("debtToBookCapitalization")).toBe("Debt / book capitalization (with deferred taxes)");
  });

  it("traces each ratio to its operands at the utility balance date, not the industrial capital snapshot", () => {
    const cfo = describeScoreEvidence(inputs(), "balanceSheet", "cfoPreWcToDebt");
    expect(cfo.endDate).toBe("2026-03-31");
    expect(cfo.fallbackReason).toBeNull();
    expect(cfo.operands.map((o) => [o.name, o.value])).toEqual([
      ["operating cash flow", 12_300e6], ["working-capital change", -700e6], ["total debt", 90_000e6], ["CFO before working capital / debt, percent", credit.cfoPreWcToDebtPct]]);
    const cap = describeScoreEvidence(inputs(), "balanceSheet", "debtToBookCapitalization");
    expect(cap.endDate).toBe("2026-03-31");
    expect(cap.operands.map((o) => [o.name, o.value])).toEqual([
      ["total debt", 90_000e6], ["total equity", 55_000e6], ["deferred income taxes", 12_500e6], ["debt / book capitalization, percent", credit.debtToBookCapitalizationPct]]);
    const missing = describeScoreEvidence({ ...inputs(), utilityCredit: null }, "balanceSheet", "cfoPreWcToDebt");
    expect(missing.fallbackReason).toMatch(/not computed/);
  });
});
