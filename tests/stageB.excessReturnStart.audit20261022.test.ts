/**
 * Audit 2026-10-22 C-10: the excess-return fair value started from an
 * acquisition-depressed fiscal-year ROTE, and that one year also cancelled the
 * terminal carry.
 *
 * COF's FY2025 ROTE was 4.20% (the $8.8B Day-1 allowance on the acquired
 * Discover loans went through provision) while its trailing four quarters
 * earned about 17% and FY2021-24 earned 29.2 / 19.0 / 13.0 / 11.3% against a
 * 9.6% cost of equity. The model faded from 4.2% and the "every one of the last
 * 4+ years" terminal rule held the terminal ROTE at the cost of equity, so the
 * headline read $81.38 (−61%). The owner's rule:
 *  - start from the trailing four quarters when that window is complete and
 *    newer than the latest fiscal year, and show the fiscal-year start beside
 *    the headline whenever the two starts differ by more than 5pp;
 *  - carry the terminal excess when the return beat the cost of equity in at
 *    least 4 of the last 5 fiscal years;
 *  - a year with business-combination evidence is annotated and does not count
 *    against that rule.
 */
import { describe, expect, it } from "vitest";

import {
  BUSINESS_COMBINATION_MATERIALITY_PCT,
  businessCombinationYears,
  computeTtmCommonReturn,
} from "@/pipeline/stageB/excessReturnStart";
import { computeFairValue } from "@/pipeline/stageB/fairValue";
import { EXCESS_RETURN_START_GAP_PP, excessReturnModel, terminalRoic, valueCompany, type DcfRoicYear, type ExcessReturnInputs, type MultiplesFrameworkInputs } from "@/pipeline/stageB/valuation";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { CompanyRoute } from "@/types/core";
import { keyDataRows } from "@/report/presentation";
import { task28SentinelReport } from "./helpers/task28Report";

const COE = 9.6;
const acquisitionYear = "2025-12-31";
const history = (combination: string | null): DcfRoicYear[] => [
  { date: "2021-12-31", roicPct: 29.2, waccPct: COE },
  { date: "2022-12-31", roicPct: 19.0, waccPct: COE },
  { date: "2023-12-31", roicPct: 13.0, waccPct: COE },
  { date: "2024-12-31", roicPct: 11.3, waccPct: COE },
  { date: acquisitionYear, roicPct: 4.2, waccPct: COE, combinationEvidence: combination },
];

const bank = (over: Partial<ExcessReturnInputs> = {}): ExcessReturnInputs => ({
  bookValue: 1000,
  bookValueBasis: "tangible-common-equity",
  currentRoePct: 16.5,
  currentRoeBasis: "ttm-rote",
  currentRoeAsOf: "2026-06-30",
  asOf: "2026-06-30",
  costOfEquityPct: COE,
  payoutRatioPct: 30,
  dilutedShares: 100,
  marketCap: 2000,
  riskFreePct: 4.2,
  tangibleCommonEquity: 1000,
  rotePct: 16.5,
  roeHistory: history("goodwill rose 1,345 (24% of opening common equity)"),
  startAlternative: { roePct: 4.2, basis: "fiscal-year-rote", asOf: acquisitionYear, bookValue: 950 },
  ...over,
});

describe("C-10: the terminal carry needs 4 of the last 5 years, and a combination year does not count against it", () => {
  it("carries the evidenced excess when one of five years missed, and annotates the combination year", () => {
    const rule = terminalRoic(COE, history("goodwill rose 1,345 (24% of opening common equity)"), { ret: "ROTE", rate: "cost of equity" }, { rule: "four-of-five" });
    expect(rule.excessPp).toBeGreaterThan(0);
    expect(rule.basis).toMatch(/4 of the last 5 fiscal years/);
    expect(rule.basis).toMatch(/set aside as business-combination year, not counted as a miss: 2025-12-31 \(ROTE 4\.2%/);
  });

  it("sets a below-hurdle combination year aside, so a second ordinary miss alone does not veto the carry", () => {
    const twoMisses = history("goodwill rose 1,345 (24% of opening common equity)");
    twoMisses[3] = { ...twoMisses[3], roicPct: 8 };
    const withEvidence = terminalRoic(COE, twoMisses, { ret: "ROTE", rate: "cost of equity" }, { rule: "four-of-five" });
    expect(withEvidence.excessPp).toBeGreaterThan(0);
    expect(withEvidence.basis).toMatch(/set aside/i);

    const noEvidence = terminalRoic(COE, twoMisses.map((y) => ({ ...y, combinationEvidence: null })), { ret: "ROTE", rate: "cost of equity" }, { rule: "four-of-five" });
    expect(noEvidence.excessPp).toBe(0);
    expect(noEvidence.note).toMatch(/3 of the last 5/);
  });

  it("sets aside one combination year at most, so set-aside years cannot stand in for the evidence", () => {
    // 2022-2025: above in 2022 and 2024 only; 2023 and 2025 are both below-hurdle combination years.
    const four = history("goodwill rose 1,345 (24% of opening common equity)").slice(1);
    four[1] = { ...four[1], roicPct: 5, combinationEvidence: "goodwill rose 900 (30% of opening common equity)" };
    const rule = terminalRoic(COE, four, { ret: "ROTE", rate: "cost of equity" }, { rule: "four-of-five" });
    expect(rule.excessPp).toBe(0);
    expect(rule.note).toMatch(/only one business-combination year is set aside/);
    expect(rule.note).toMatch(/2023-12-31: ROTE 5%/);
  });

  it("counts the set-aside year in the stated basis when it completes the four", () => {
    const threeAbove = history("goodwill rose 1,345 (24% of opening common equity)");
    threeAbove[3] = { ...threeAbove[3], roicPct: 8 };
    const rule = terminalRoic(COE, threeAbove, { ret: "ROTE", rate: "cost of equity" }, { rule: "four-of-five" });
    expect(rule.excessPp).toBeGreaterThan(0);
    expect(rule.basis).toMatch(/exceeded cost of equity in 3 of the last 5 fiscal years, and the set-aside business-combination year counts toward the at least 4 of the last 5 required/);
    expect(rule.basis).not.toMatch(/3 of the last 5 fiscal years, at least 4/);
  });

  it("keeps a missing return inside the last five years, so an older year cannot fill the window", () => {
    // 2025 unestablished, 2022-2024 above, 2021 a miss, 2020 above: three of the
    // last five beat the hurdle, so nothing is carried (Codex review, PR #49).
    const gapped: DcfRoicYear[] = [
      { date: "2020-12-31", roicPct: 20, waccPct: COE },
      { date: "2021-12-31", roicPct: 8, waccPct: COE },
      { date: "2022-12-31", roicPct: 19, waccPct: COE },
      { date: "2023-12-31", roicPct: 13, waccPct: COE },
      { date: "2024-12-31", roicPct: 11.3, waccPct: COE },
      { date: "2025-12-31", roicPct: null, waccPct: COE },
    ];
    const rule = terminalRoic(COE, gapped, { ret: "ROTE", rate: "cost of equity" }, { rule: "four-of-five" });
    expect(rule.excessPp).toBe(0);
    expect(rule.note).toMatch(/only 3 of the last 5 fiscal years/);
    expect(rule.note).toMatch(/2025-12-31 not established/);
    // With the 2025 return on record and above the hurdle, four of five carry.
    const filled = gapped.map((y) => (y.date === "2025-12-31" ? { ...y, roicPct: 12 } : y));
    expect(terminalRoic(COE, filled, { ret: "ROTE", rate: "cost of equity" }, { rule: "four-of-five" }).excessPp).toBeGreaterThan(0);
  });

  it("leaves the general DCF's every-year rule unchanged", () => {
    const dcfRule = terminalRoic(COE, history(null));
    expect(dcfRule.excessPp).toBe(0);
    expect(dcfRule.note).toMatch(/1 of the last 5/);
  });
});

describe("C-10: the model starts from the trailing return and exposes the fiscal-year start", () => {
  it("fades from the TTM ROTE, carries the evidenced excess, and prices the fiscal-year start beside it", () => {
    const er = excessReturnModel(bank());
    expect(er.roePathPct.value[0]).toBeCloseTo(16.5, 6);
    expect(er.roePathPct.basis).toMatch(/TTM .*ROTE/);
    expect(er.financialAssumptions?.terminalExcessReturnPp).toBeGreaterThan(0);
    expect(er.roePathPct.basis).toMatch(/4 of the last 5 fiscal years/);
    expect(er.roePathPct.basis).toMatch(/business-combination year.*2025-12-31/i);

    const alt = er.startAlternative;
    expect(alt).toBeDefined();
    expect(alt!.startRoePct).toBe(4.2);
    expect(alt!.asOf).toBe(acquisitionYear);
    expect(alt!.differencePp).toBeCloseTo(-12.3, 6);
    expect(alt!.besideHeadline).toBe(true);
    expect(alt!.perShare!).toBeLessThan(er.perShare!);
    expect(alt!.label).toMatch(/FY 2025-12-31 ROTE start 4\.2%/);
  });

  it("does not put the alternative beside the headline when the two starts are within 5pp", () => {
    const er = excessReturnModel(bank({ startAlternative: { roePct: 16.5 - EXCESS_RETURN_START_GAP_PP + 0.1, basis: "fiscal-year-rote", asOf: acquisitionYear, bookValue: 950 } }));
    expect(er.startAlternative?.besideHeadline).toBe(false);
  });

  it("names the alternative in the fair value and beside the Key data headline", () => {
    const route: CompanyRoute = { base: "bank", overlays: [], evidence: { sector: null, industry: null } };
    const multiples: MultiplesFrameworkInputs = {
      quote: { price: 20, marketCap: 2000, currency: "USD" },
      reportedCurrency: "USD",
      incomeTtm: null,
      cashFlowTtm: null,
      balance: null,
    };
    const valuation = valueCompany(route, { currentPrice: 20, waccPct: null, netDebt: null, dilutedShares: 100, dcfInputs: null, multiples, excessReturn: bank(), reit: null });
    const fairValue = computeFairValue({ valuation, currentPrice: 20, currency: "USD", asOf: "2026-10-22" });
    expect(fairValue.status).toBe("available");
    expect(fairValue.alternative?.perShare).toBeGreaterThan(0);
    expect(fairValue.alternative?.label).toMatch(/FY 2025-12-31 ROTE start/);
    expect(fairValue.basis.join(" ")).toMatch(/TTM ROTE to 2026-06-30/);
    expect(fairValue.basis.join(" ")).toMatch(/FY 2025-12-31 ROTE start 4\.2% gives/);

    const report = task28SentinelReport();
    report.fairValue = fairValue;
    // Stage C's applyFairValue writes the fair value over the DCF headline.
    report.valuation.dcf.perShare = fairValue.perShare;
    report.valuation.dcf.upsidePct = fairValue.upsidePct;
    const row = keyDataRows(report).find((r) => r.label === "Model fair value (DCF)");
    expect(row?.note).toMatch(/FY 2025-12-31 ROTE start 4\.2%: \$/);
  });

  it("explains a floored excess-return value in book-value terms, not the DCF's bridge", () => {
    const route: CompanyRoute = { base: "bank", overlays: [], evidence: { sector: null, industry: null } };
    const multiples: MultiplesFrameworkInputs = { quote: { price: 20, marketCap: 2000, currency: "USD" }, reportedCurrency: "USD", incomeTtm: null, cashFlowTtm: null, balance: null };
    const valuation = valueCompany(route, { currentPrice: 20, waccPct: null, netDebt: null, dilutedShares: 100, dcfInputs: null, multiples, excessReturn: bank({ currentRoePct: -150, startAlternative: null }), reit: null });
    const fairValue = computeFairValue({ valuation, currentPrice: 20, currency: "USD", asOf: "2026-10-22" });
    const floor = fairValue.reasons.find((g) => g.field === "valuation.dcf.perShare.floor");
    expect(floor?.reason).toMatch(/book value plus the present value of the excess returns/);
    expect(floor?.reason).not.toMatch(/enterprise value/);
    // The reader-facing basis says the same (Codex review, PR #49).
    expect(fairValue.basis.join(" ")).toMatch(/book value plus the present value of the excess returns is at or below zero/);
    expect(fairValue.basis.join(" ")).not.toMatch(/enterprise value|net debt/);
  });
});

describe("C-10: TTM common return and business-combination evidence", () => {
  const balances = [
    { date: "2026-06-30", totalStockholdersEquity: 1200, goodwill: 150, intangibleAssets: 30, preferredStock: 20 },
    { date: "2026-03-31", totalStockholdersEquity: 1180, goodwill: 150, intangibleAssets: 30, preferredStock: 20 },
    { date: "2025-12-31", totalStockholdersEquity: 1100, goodwill: 150, intangibleAssets: 30, preferredStock: 20 },
    { date: "2025-06-30", totalStockholdersEquity: 1000, goodwill: 150, intangibleAssets: 30, preferredStock: 20 },
    { date: "2024-12-31", totalStockholdersEquity: 700, goodwill: 15, intangibleAssets: 5, preferredStock: 20 },
  ];

  it("divides four quarters of common earnings by the average equity at the window's two ends", () => {
    const ttm = computeTtmCommonReturn({ income: { netIncome: 170, netIncomeAvailableToCommon: 160 }, asOf: "2026-06-30", periodStart: "2025-07-01", balances, basis: "tangible-common-equity" });
    // TCE 1000 at 2026-06-30 and 800 at 2025-06-30.
    expect(ttm.closingEquity).toBe(1000);
    expect(ttm.averageEquity).toBe(900);
    expect(ttm.returnPct).toBeCloseTo((160 / 900) * 100, 9);
    expect(ttm.withheldReason).toBeNull();

    const insurer = computeTtmCommonReturn({ income: { netIncome: 170, netIncomeAvailableToCommon: 160 }, asOf: "2026-06-30", periodStart: "2025-07-01", balances, basis: "common-equity" });
    expect(insurer.averageEquity).toBe(1080);
  });

  it("withholds the return when the common earnings or the closing balance are missing", () => {
    expect(computeTtmCommonReturn({ income: { netIncome: 170, commonIncomeWithheldReason: "preferred allocation unknown" }, asOf: "2026-06-30", balances, basis: "tangible-common-equity" }).withheldReason).toMatch(/preferred allocation unknown/);
    expect(computeTtmCommonReturn({ income: { netIncome: 170, netIncomeAvailableToCommon: 160 }, asOf: "2027-06-30", balances, basis: "tangible-common-equity" }).returnPct).toBeNull();
    // Preferred stock is outstanding, so plain net income cannot stand in for common earnings.
    expect(computeTtmCommonReturn({ income: { netIncome: 170 }, asOf: "2026-06-30", balances, basis: "tangible-common-equity" }).withheldReason).toMatch(/preferred claims/);
    expect(computeTtmCommonReturn({ income: null, asOf: "2026-06-30", balances, basis: "tangible-common-equity" }).withheldReason).toMatch(/no complete trailing/);
  });

  it("takes the latest filing when two balance rows share the window's end date", () => {
    const stale = { date: "2026-06-30", totalStockholdersEquity: 900, goodwill: 150, intangibleAssets: 30, preferredStock: 20, acceptedDate: "2026-07-30 16:00:00" };
    const restated = { ...stale, totalStockholdersEquity: 1200, acceptedDate: "2026-09-15 16:00:00" };
    const rest = balances.filter((b) => b.date !== "2026-06-30");
    for (const rows of [[stale, restated, ...rest], [restated, stale, ...rest]]) {
      const ttm = computeTtmCommonReturn({ income: { netIncome: 170, netIncomeAvailableToCommon: 160 }, asOf: "2026-06-30", periodStart: "2025-07-01", balances: rows, basis: "tangible-common-equity" });
      expect(ttm.closingEquity).toBe(1000);
    }
  });

  it("says when the balance sheet four quarters earlier has no equity figure, rather than that there is none", () => {
    const gapped = balances.map((b) => (b.date === "2025-06-30" ? { ...b, totalStockholdersEquity: null } : b));
    const ttm = computeTtmCommonReturn({ income: { netIncome: 170, netIncomeAvailableToCommon: 160 }, asOf: "2026-06-30", periodStart: "2025-07-01", balances: gapped, basis: "tangible-common-equity" });
    expect(ttm.averageEquity).toBe(1000);
    expect(ttm.basisText).toMatch(/the 2025-06-30 balance sheet four quarters earlier has no tangible common equity/);
    expect(ttm.basisText).not.toMatch(/no balance sheet four quarters earlier/);
  });

  it("flags a year whose goodwill step-up or acquisition tags reach the materiality threshold", () => {
    const facts: CompanyFacts = {
      cik: 1,
      entityName: "Fixture Bancorp",
      facts: {
        "us-gaap": {
          GoodwillAcquiredDuringPeriod: {
            units: { USD: [{ start: "2023-01-01", end: "2023-12-31", val: 5, accn: "a", fy: 2023, fp: "FY", form: "10-K", filed: "2024-02-01" }] },
          },
          BusinessCombinationConsiderationTransferred1: {
            units: { USD: [{ start: "2025-01-01", end: "2025-12-31", val: 400, accn: "b", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" }] },
          },
        },
      },
    };
    const annual = [
      { date: "2025-12-31", totalStockholdersEquity: 1100, goodwill: 150, intangibleAssets: 30, preferredStock: 20 },
      { date: "2024-12-31", totalStockholdersEquity: 700, goodwill: 15, intangibleAssets: 5, preferredStock: 20 },
      { date: "2023-12-31", totalStockholdersEquity: 650, goodwill: 15, intangibleAssets: 5, preferredStock: 20 },
      { date: "2022-12-31", totalStockholdersEquity: 600, goodwill: 10, intangibleAssets: 5, preferredStock: 20 },
    ];
    const years = businessCombinationYears(facts, annual, "USD");
    // 2025: goodwill +135 and consideration 400 against opening common equity 680.
    expect(years.get("2025-12-31")).toMatch(/goodwill rose 135/);
    expect(years.get("2025-12-31")).toMatch(/BusinessCombinationConsiderationTransferred1 400/);
    // 2023: GoodwillAcquiredDuringPeriod 5 and a 5 step-up are under 10% of 580.
    expect(years.has("2023-12-31")).toBe(false);
    expect(BUSINESS_COMBINATION_MATERIALITY_PCT).toBe(10);
    expect(businessCombinationYears(null, annual, "USD").get("2025-12-31")).toMatch(/goodwill rose 135/);
  });

  const flatGoodwill = [
    { date: "2025-12-31", totalStockholdersEquity: 1100, goodwill: 15, intangibleAssets: 5, preferredStock: 20 },
    { date: "2024-12-31", totalStockholdersEquity: 700, goodwill: 15, intangibleAssets: 5, preferredStock: 20 },
  ];
  const considerationFacts = (points: object[]): CompanyFacts => ({
    cik: 1, entityName: "Fixture Bancorp", facts: { "us-gaap": { BusinessCombinationConsiderationTransferred1: { units: { USD: points } } } },
  });
  const fy2025 = { start: "2025-01-01", end: "2025-12-31", fy: 2025, fp: "FY" };

  it("reads acquisition facts from every supported annual form, 20-F and 40-F included", () => {
    for (const form of ["20-F", "20-F/A", "40-F"]) {
      const years = businessCombinationYears(considerationFacts([{ ...fy2025, val: 400, accn: "f", form, filed: "2026-03-01" }]), flatGoodwill, "USD");
      expect(years.get("2025-12-31")).toMatch(/BusinessCombinationConsiderationTransferred1 400/);
    }
    // Quarterly and other forms still do not count.
    expect(businessCombinationYears(considerationFacts([{ ...fy2025, val: 400, accn: "q", form: "8-K", filed: "2026-03-01" }]), flatGoodwill, "USD").has("2025-12-31")).toBe(false);
  });

  it("compares acquisition facts in the balance sheet's currency, not USD", () => {
    // Opening common equity 680 in EUR, so the threshold is 68 (Codex review, PR #49).
    const filing = { ...fy2025, form: "20-F", filed: "2026-03-01" };
    const dual = (usd: number, eur: number): CompanyFacts => ({
      cik: 1, entityName: "Fixture Bancorp", facts: { "us-gaap": { BusinessCombinationConsiderationTransferred1: {
        units: { USD: [{ ...filing, val: usd, accn: "u" }], EUR: [{ ...filing, val: eur, accn: "e" }] } } } },
    });
    expect(businessCombinationYears(dual(400, 40), flatGoodwill, "EUR").has("2025-12-31")).toBe(false);
    expect(businessCombinationYears(dual(40, 400), flatGoodwill, "EUR").get("2025-12-31")).toMatch(/BusinessCombinationConsiderationTransferred1 400/);
    // No fact in the statement currency, or no established currency: the tag is not read.
    const usdOnly = considerationFacts([{ ...filing, val: 400, accn: "u" }]);
    expect(businessCombinationYears(usdOnly, flatGoodwill, "EUR").has("2025-12-31")).toBe(false);
    expect(businessCombinationYears(usdOnly, flatGoodwill, null).has("2025-12-31")).toBe(false);
  });

  it("takes the latest filing of a restated acquisition figure, not the largest", () => {
    const original = { ...fy2025, val: 400, accn: "a1", form: "10-K", filed: "2026-02-01" };
    const restated = { ...fy2025, val: 40, accn: "a2", form: "10-K", filed: "2027-02-01" };
    expect(businessCombinationYears(considerationFacts([original, restated]), flatGoodwill, "USD").has("2025-12-31")).toBe(false);
    expect(businessCombinationYears(considerationFacts([restated, original]), flatGoodwill, "USD").has("2025-12-31")).toBe(false);
  });
});
