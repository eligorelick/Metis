/**
 * Audit 2026-10-22 F-20: statements the code writes about its own method —
 * the capital grading basis, the debt-bridge convention, the HEURISTIC
 * maintenance-capex and buyback-price proxies, score-to-band mappings and
 * data-gap notes — were stamped FACT, so a reader took house approximations
 * for issuer-reported facts. The only written labelling rule (prompts.ts:
 * "Methodology, data-gap and coverage statements describe this analysis: label
 * them JUDGMENT, not issuer FACT") now holds for the deterministic writers too.
 * Sentences that state a computed figure stay FACT.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import type { ComputedMetrics } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { computeCapital } from "@/pipeline/stageB/capital";
import { attachCurrentCapital } from "@/pipeline/stageB/currentCapital";
import { applyFinancialDiagnostics } from "@/report/financialDiagnostics";
import { ReportSchema, type Report } from "@/report/schema";
import { buildSyntheticRouteBundle, runResearchRoutePanel, SYNTHETIC_ROUTES } from "./helpers/researchRoutePanel";

type Labelled = { text: string; label: string };

function labelledClaims(node: unknown, out: Labelled[] = []): Labelled[] {
  if (node === null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) labelledClaims(item, out);
    return out;
  }
  const record = node as Record<string, unknown>;
  if (typeof record.text === "string" && typeof record.label === "string") out.push({ text: record.text, label: record.label });
  for (const value of Object.values(record)) labelledClaims(value, out);
  return out;
}

/** The audit's regression rule, widened to every template note the census showed. */
function isTemplateStatement(text: string): boolean {
  return (
    /^(Capital grading basis|The debt bridge|HEURISTIC|NET_DEBT_V\d|Dilution overhang unavailable|Not applicable to financial companies)/.test(text) ||
    /^Deterministic .* score (unavailable|[\d.]+\/100 maps to band)/.test(text) ||
    /coverage n\/m/.test(text) ||
    /proxy/.test(text)
  );
}

const factTemplates = (report: Report) =>
  labelledClaims(report).filter((claim) => claim.label === "FACT" && isTemplateStatement(claim.text));

describe("template statements carry JUDGMENT, never FACT (audit 2026-10-22 F-20)", () => {
  it.each(SYNTHETIC_ROUTES)("labels no code-written method or data-gap note FACT on the %s route", (route) => {
    const { report } = runResearchRoutePanel(buildSyntheticRouteBundle(route));
    const templates = labelledClaims(report).filter((claim) => isTemplateStatement(claim.text));
    expect(templates.length).toBeGreaterThan(0);
    expect(factTemplates(report)).toEqual([]);
    expect(templates.every((claim) => claim.label === "JUDGMENT")).toBe(true);
  });

  it("keeps the computed figures FACT", () => {
    const texts = SYNTHETIC_ROUTES.flatMap((route) =>
      labelledClaims(runResearchRoutePanel(buildSyntheticRouteBundle(route)).report).filter((claim) => claim.label === "FACT").map((claim) => claim.text),
    );
    for (const prefix of ["Net debt is ", "Capex runs at ", "Diluted share count changed ", "Stock-based compensation is ", "Repurchased "]) {
      expect(texts.some((text) => text.startsWith(prefix))).toBe(true);
    }
  });

  it("states the repurchase total as FACT and its price-proxy comparison as JUDGMENT", () => {
    const bundle = buildSyntheticRouteBundle("pre-revenue");
    const { validation, computed } = runResearchRoutePanel(bundle);
    const priced = structuredClone(computed);
    Object.assign(priced.capital!.buybackPriceAnalysis, { premiumDiscountPct: 48.7, timingPct: 3.2 });
    const report = ReportSchema.parse(buildDataOnlyReport({
      symbol: bundle.symbol,
      companyName: `Synthetic ${bundle.symbol} company`,
      generatedAt: "2026-07-06T12:00:00.000Z",
      model: "none",
      costUsd: 0,
      bundle,
      validation,
      computed: priced,
      costBreakdown: [],
      reason: "Synthetic offline accounting-route control",
    }));
    const repurchase = report.balanceSheet.capitalAllocation.filter((claim) => /repurchase/i.test(claim.text));
    expect(repurchase.find((claim) => claim.text.startsWith("Repurchased "))).toMatchObject({ label: "FACT", text: expect.stringMatching(/^Repurchased \S+ USD of stock across the analysed years\.$/) });
    expect(repurchase.find((claim) => claim.text.includes("48.7% above the average repurchase price proxy"))).toMatchObject({ label: "JUDGMENT" });
    expect(repurchase.find((claim) => claim.text.includes("3.2% more than was paid"))).toMatchObject({ label: "JUDGMENT" });
    expect(factTemplates(report)).toEqual([]);
  });

  it("labels the capital grading basis and debt-bridge notes JUDGMENT on the LLM path too", () => {
    const report = ReportSchema.parse(JSON.parse(fs.readFileSync("fixtures/report/DEMO-sample.json", "utf8")));
    const capital = attachCurrentCapital(computeCapital([], [], [], [], { price: null }), {
      income: { date: "2026-06-30", revenue: 100, netIncome: 20, operatingIncome: 30, interestExpense: 2 },
      cashFlow: { date: "2026-06-30", operatingCashFlow: 40, capitalExpenditure: -25, stockBasedCompensation: 9, financeLeasePrincipalPayments: 3 },
      balance: { date: "2026-06-30", totalDebt: 30, cashAndShortTermInvestments: 15, operatingLeaseLiability: 10, capitalLeaseObligations: 10 },
      currency: "USD",
    });
    const out = applyFinancialDiagnostics(report, { capital } as ComputedMetrics);
    expect(out.balanceSheet.coverage.commentary.at(-1)).toMatchObject({ label: "JUDGMENT", text: expect.stringMatching(/^Capital grading basis: /) });
    expect(out.balanceSheet.debtProfile.commentary.at(-1)?.label).toBe("JUDGMENT");
    expect(factTemplates(out)).toEqual([]);
  });
});
