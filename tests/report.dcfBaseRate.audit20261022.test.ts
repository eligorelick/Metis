/**
 * Audit 2026-10-22 B-30: the general-route FCFF DCF sat below price for 16 of
 * the census's 18 general-route companies (median −53%; 15 of 18 more than 30%
 * below), so a reader seeing one DCF far below price could not tell a house
 * base rate from a company signal. The owner's remedy for this batch: state the
 * base rate, with the census date, beside the DCF headline and in
 * METHODOLOGY.md.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { computeFairValue, DCF_BASE_RATE_CENSUS, dcfBaseRateText } from "@/pipeline/stageB/fairValue";
import { excessReturnModel, valueCompany, type DcfAssumptionInputs, type MultiplesFrameworkInputs } from "@/pipeline/stageB/valuation";
import { reportToMarkdown } from "@/report/export/markdown";
import { keyDataRows } from "@/report/presentation";
import type { FairValue } from "@/report/schema";
import type { CompanyRoute } from "@/types/core";
import { task28SentinelReport } from "./helpers/task28Report";

const multiples: MultiplesFrameworkInputs = {
  quote: { price: 100, marketCap: 10000, currency: "USD" },
  reportedCurrency: "USD",
  incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 200, depreciationAndAmortization: 50, netIncome: 144, epsDiluted: 1.44 },
  cashFlowTtm: { date: "2025-12-31", operatingCashFlow: 180, capitalExpenditure: -30, depreciationAndAmortization: 50 },
  balance: { date: "2025-12-31", totalDebt: 300, cashAndShortTermInvestments: 100, totalStockholdersEquity: 500, goodwill: 50, intangibleAssets: 50, minorityInterest: 0, preferredStock: 0 },
};
const steady: DcfAssumptionInputs = {
  revenueCagr3yPct: 10, revenueCagr5yPct: 10, analystEstimates: null, waccPct: 9, riskFreePct: 4.48,
  incomeTtm: { date: "2025-12-31", revenue: 1000, operatingIncome: 200, incomeBeforeTax: 180, incomeTaxExpense: 36 },
  incomeHistory: [
    { date: "2025-12-31", revenue: 1000, operatingIncome: 200 },
    { date: "2024-12-31", revenue: 900, operatingIncome: 180 },
    { date: "2023-12-31", revenue: 800, operatingIncome: 160 },
  ],
  balance: { date: "2025-12-31", basis: "annual", totalDebt: 300, totalStockholdersEquity: 500, cashAndShortTermInvestments: 100 },
  marketCap: 5000,
};
const general: CompanyRoute = { base: "general", overlays: [], evidence: { sector: null, industry: null } };

function reportWith(fairValue: FairValue) {
  const report = task28SentinelReport();
  report.fairValue = fairValue;
  report.valuation.dcf.perShare = fairValue.perShare;
  report.valuation.dcf.upsidePct = fairValue.upsidePct;
  return report;
}

describe("B-30: the house DCF base rate beside the headline", () => {
  it("records the 2026-10-22 audit census", () => {
    expect(DCF_BASE_RATE_CENSUS).toEqual({ asOf: "2026-10-22", companies: 18, belowPrice: 16, medianUpsidePct: -53, moreThan30PctBelow: 15 });
    expect(dcfBaseRateText()).toBe(
      "house base rate: 16 of 18 general-route DCFs in the 2026-10-22 audit census were below price (median −53%; 15 of 18 more than 30% below)",
    );
  });

  it("puts the base rate in the Key data note of a general-route DCF headline and the markdown export", () => {
    const valuation = valueCompany(general, { currentPrice: 100, waccPct: 9, netDebt: 200, dilutedShares: 100, dcfInputs: steady, multiples, excessReturn: null, reit: null });
    const fairValue = computeFairValue({ valuation, currentPrice: 100, currency: "USD", asOf: "2026-10-22" });
    expect(fairValue.method).toBe("fcff-dcf");
    const report = reportWith(fairValue);
    const row = keyDataRows(report).find((r) => r.label === "Model fair value (DCF)");
    expect(row?.note).toContain(dcfBaseRateText());
    expect(row?.note).toMatch(/vs price; house base rate/);
    expect(reportToMarkdown(report)).toContain(dcfBaseRateText());
  });

  it("does not put the general-route base rate beside an excess-return headline", () => {
    const er = excessReturnModel({
      bookValue: 1000, bookValueBasis: "tangible-common-equity", currentRoePct: 14, currentRoeBasis: "ttm-rote", currentRoeAsOf: "2026-06-30",
      asOf: "2026-06-30", costOfEquityPct: 9.6, payoutRatioPct: 30, dilutedShares: 100, marketCap: 2000, riskFreePct: 4.2,
    });
    const fairValue: FairValue = {
      status: "available", method: "excess-return", methodVersion: "x", basis: [], reasons: [], upsidePct: 10,
      perShare: { value: er.perShare!, unit: "USD/share", source: "computed.valuation.excessReturn.perShare", asOf: "2026-06-30" } as FairValue["perShare"],
    };
    const row = keyDataRows(reportWith(fairValue)).find((r) => r.label === "Model fair value (excess return)");
    expect(row).toBeDefined();
    expect(row?.note ?? "").not.toContain("base rate");
  });

  it("states the same base rate in METHODOLOGY.md", () => {
    const methodology = readFileSync(join(process.cwd(), "docs", "METHODOLOGY.md"), "utf8").replace(/\s+/g, " ");
    expect(methodology).toContain("16 of 18 general-route DCFs in the 2026-10-22 audit census were below price");
    expect(methodology).toMatch(/median −53%; 15 of 18 more than 30% below/);
  });
});
