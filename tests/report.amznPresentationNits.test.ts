/**
 * AMZN audit 2026-10-20 finding 20: presentation nits in deterministic
 * report text.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { applyMultiples } from "@/pipeline/stageC/passes";
import { computeAccruals, type ForensicsPeriod } from "@/pipeline/stageB/forensics";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { executiveGroups, metricLabel, sourceLabel } from "@/report/presentation";
import { ReportSchema, type SourcedClaim } from "@/report/schema";
import { ReportView } from "@/components/report/ReportView";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

/** Adobe's captured 10-Q bundle (see tests/adbeReportAudit.regressions.test.ts). */
function adobeBundle() {
  const b = completeCurrencyBundle({ symbol: "ADBE" });
  const captured = JSON.parse(readFileSync("fixtures/company-ir/adobe-20261019/audit-financial-inputs.json", "utf8"));
  Object.assign(b, { builtAt: captured.builtAt, profile: captured.profile, quote: captured.quote, statements: captured.statements });
  Object.assign(b.edgar, captured.edgar);
  return b;
}

describe("the remaining repurchase authorization in the filing's notes", () => {
  it("is read from the 10-Q notes in the issuer's own wording, so the report never says none was read", () => {
    const b = adobeBundle();
    if (!b.edgar.tenQMdna?.ok) throw Error("source fixture");
    const mdna = b.edgar.tenQMdna.value;
    // Move the authorization out of Item 2 and state it in the notes the way
    // Amazon's 10-Q for 2026-06-30 does ("we have $ 6.1 billion remaining").
    mdna.data.text = mdna.data.text.replace(/As of August 28, 2026, a total of \$24\.55 billion remained under our April 2026 stock repurchase authority\./, "");
    b.edgar.tenQNotes = { ...b.edgar.tenQMdna, value: { ...mdna, endpoint: mdna.endpoint.replace("(10-Q Item 2)", "(10-Q Item 1)"),
      data: { ...mdna.data, sectionName: "tenQNotes", text: "Stock Repurchase Activity In March 2022, the Board of Directors authorized a program to repurchase up to $ 10.0 billion of our common stock, with no fixed expiration. " +
        "As of August 28, 2026, we have $ 6.1 billion remaining under the repurchase program. Stock Award Plans Employees vest in restricted stock unit awards." } } };
    expect(buildFilingDisclosures(b)?.capitalReturn).toMatchObject({ authorizationRemaining: 6.1e9, authorizationRemainingAsOf: "2026-08-28",
      authorizationRemainingSource: { form: "10-Q", accession: "0000796343-26-000156" } });
    const basis = runStageB(b).projections?.series.find((s) => s.metric === "epsDiluted")?.capitalReturn?.basis ?? "";
    expect(basis).not.toContain("No remaining repurchase authorization was read from the filings.");
    expect(basis).toContain("6.1B of repurchase authorization remaining");
  });
});

describe("the accrual scaler's label", () => {
  it("does not name net operating assets when the scaler may be average total assets", () => {
    // Negative net operating assets: the house rule rescales by average total assets.
    const year = (date: string, totalAssets: number): ForensicsPeriod => ({
      income: { date, revenue: 100, netIncome: 5 },
      balance: { date, totalAssets, cashAndShortTermInvestments: totalAssets * 0.9, totalLiabilities: totalAssets * 0.8, totalDebt: 0 },
      cashFlow: { date, netIncome: 5, netCashProvidedByOperatingActivities: 9 },
    });
    const accruals = computeAccruals(year("2025-12-31", 120), year("2024-12-31", 100));
    expect(accruals.scaler).toBe("avgTotalAssets");
    for (const id of ["computed.forensics.accruals.scalerValue", "computed.forensics.accrual-scaler-value"]) {
      expect(metricLabel(id)).not.toMatch(/net operating assets/i);
      expect(sourceLabel(id)).toBe(metricLabel(id));
      expect(metricLabel(id)).toMatch(/^Accrual scaler/);
    }
  });
});

describe("officers the report does not assess", () => {
  it("lists their cited facts under the not-assessed line, not the withdrawn assessment", () => {
    const report = loadTask28Fixture();
    const base = report.leadership.executives[0]!;
    const claim = (label: SourcedClaim["label"], text: string): SourcedClaim => ({ label, text, source: "edgar:10-Q item2", asOf: "2026-06-30" });
    const assessment = "Matthew S. Garman's execution grade recognizes AWS commercial growth and profitability.";
    report.leadership.executives = [base, { ...base, name: "Matthew S. Garman", title: "CEO Amazon Web Services",
      grade: "not-assessed", credibilityGrade: "not-assessed",
      assessmentReason: "Attributable, validated execution and/or guidance-versus-actual evidence is absent.",
      // Independent review of these fixes: an ESTIMATE is not a cited fact either.
      reasoning: [claim("FACT", "Matthew S. Garman has served as CEO Amazon Web Services since June 2024."), claim("JUDGMENT", assessment),
        claim("ESTIMATE", "Matthew S. Garman's AWS margin will likely exceed 40% next year.")],
      evidence: { capitalAllocation: [claim("FACT", "Matthew S. Garman: AWS revenue for the quarter ended 2026-06-30 was USD 42.23 billion.")] } }];
    const groups = executiveGroups(report.leadership.executives);
    expect(groups.notAssessedClaims.map((c) => c.text)).toEqual([
      "Matthew S. Garman has served as CEO Amazon Web Services since June 2024.",
      "Matthew S. Garman: AWS revenue for the quarter ended 2026-06-30 was USD 42.23 billion.",
    ]);
    const parsed = ReportSchema.parse(report);
    for (const text of [reportToMarkdown(parsed), reportToPrintBody(parsed)]) {
      expect(text).toContain("Not assessed: Matthew S. Garman (CEO Amazon Web Services).");
      expect(text).toContain("AWS revenue for the quarter ended 2026-06-30");
      expect(text).not.toContain("execution grade recognizes AWS commercial growth");
      expect(text).not.toContain("will likely exceed 40%");
    }
  });
});

describe("the enterprise-value bridge beside the multiples", () => {
  it("is stated once, without the operator setting that changes it", () => {
    const computed = runStageB(completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] }));
    const bridge = computed.valuation.multiples!.enterpriseValue!.basis;
    expect(bridge).toContain("EV/EBITDA uses this same EV.");
    const report = loadTask28Fixture();
    report.valuation = applyMultiples(report.valuation, computed.valuation);
    const stored = ReportSchema.parse(report);
    const surfaces = [reportToMarkdown(stored), reportToPrintBody(stored), renderToStaticMarkup(createElement(ReportView, { report: stored }))];
    for (const text of surfaces) {
      expect(text.split("EV/EBITDA uses this same EV.").length - 1).toBe(1);
      expect(text).not.toContain("THESIS_EV_INCLUDE_LEASES");
      expect(text).not.toContain("THESIS\\_EV\\_INCLUDE\\_LEASES");
    }
    // Each EV row still says which EV it divides by.
    for (const name of ["EV/EBITDA", "EV/Sales"]) {
      expect(stored.valuation.multiples.find((m) => m.name === name)?.basis).toMatch(/enterprise-value bridge note/);
    }
  });
});
