import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { debtBridge } from "@/pipeline/stageB/currentCapital";
import { incompleteLeaseCoverage } from "@/pipeline/stageB/leaseScope";
import { buildDcfAssumptions } from "@/pipeline/stageB/valuation";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { applyFinancialDiagnostics } from "@/report/financialDiagnostics";
import { applyMultiples } from "@/pipeline/stageC/passes";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { ReportView } from "@/components/report/ReportView";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

function fixture() {
  const bundle = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  if (!bundle.statements.balanceQuarterly.ok) throw new Error("Missing fixture balances");
  const row = bundle.statements.balanceQuarterly.value.data.rows[0]!;
  Object.assign(row, { totalDebt: 5685e6, shortTermDebt: 0, longTermDebt: 5459e6, capitalLeaseObligations: 226e6,
    operatingLeaseLiability: 226e6, financeLeaseLiability: undefined, cashAndCashEquivalents: 6682e6, shortTermInvestments: 445e6, cashAndShortTermInvestments: 7127e6 });
  row.fieldProvenance = { capitalLeaseObligations: { source: "edgar", unit: "USD", periodStart: null, periodEnd: row.date!, observedAt: bundle.builtAt,
    tags: ["us-gaap/OperatingLeaseLiabilityNoncurrent"], filings: [{ accn: "0000000001-26-000001", filed: "2026-05-01", form: "10-Q" }] } };
  for (const [field, tag] of [["shortTermDebt", "LongTermDebtCurrent"], ["longTermDebt", "LongTermDebtNoncurrent"]]) row.fieldProvenance[field!] = { ...row.fieldProvenance.capitalLeaseObligations!, tags: [`us-gaap/${tag}`] };
  return { bundle, row };
}
describe("legacy lease operands retain their disclosed maturity scope", () => {
  it("does not relabel a retained noncurrent-only 226m operand as full lease-inclusive debt", () => {
    const { row } = fixture();
    const bridge = debtBridge({ ...row, date: row.date! });
    expect(bridge).toMatchObject({ totalDebtIncludingLeases: null, operatingLeases: null, netDebtIncludingLeases: null,
      debtIncludingDisclosedLeasePortion: 5685e6, operatingLeasesNoncurrent: 226e6, netDebtIncludingDisclosedLeasePortion: -1442e6,
      netDebtExcludingDisclosedOperatingLeasePortion: -1668e6 });
    expect(bridge.leaseScopeNote).toMatch(/noncurrent only.*current portion.*unverified/i);
  });
  it.each([{ tags: ["us-gaap/OperatingLeaseLiability"] }, { tags: ["us-gaap/OperatingLeaseLiabilityCurrent", "us-gaap/OperatingLeaseLiabilityNoncurrent"] }])("preserves an established total from %j", ({ tags }) => {
    const { row } = fixture();
    row.fieldProvenance!.operatingLeaseLiability = { ...row.fieldProvenance!.capitalLeaseObligations!, tags };
    const bridge = debtBridge({ ...row, date: row.date! });
    expect(bridge).toMatchObject({ totalDebtIncludingLeases: 5685e6, operatingLeases: 226e6, netDebtExcludingOperatingLeases: -1668e6 });
    expect(bridge.leaseScopeNote).toBeUndefined();
  });
  it("does not infer incomplete coverage from a vendor number without partial-tag evidence", () => {
    expect(incompleteLeaseCoverage(null)).toBeNull();
    expect(incompleteLeaseCoverage({ operatingLeaseLiability: 10 })).toBeNull();
    expect(incompleteLeaseCoverage({ financeLeaseLiability: 10, fieldProvenance: { financeLeaseLiability: { tags: ["us-gaap/CapitalLeaseObligations"] } } })).toBeNull();
  });
  it.each(["current", "noncurrent"] as const)("keeps independently tagged %s operating and finance portions separate", maturity => {
    const suffix = maturity === "current" ? "Current" : "Noncurrent";
    const bridge = debtBridge({ date: "2026-06-30", totalDebt: 100, operatingLeaseLiability: 10, financeLeaseLiability: 5,
      cashAndShortTermInvestments: 20, fieldProvenance: {
        operatingLeaseLiability: { tags: [`us-gaap/OperatingLeaseLiability${suffix}`] }, financeLeaseLiability: { tags: [`us-gaap/FinanceLeaseLiability${suffix}`] },
      } });
    expect(bridge.totalDebtIncludingLeases).toBeNull();
    expect(bridge.operatingLeases).toBeNull();
    expect(bridge.financeLeases).toBeNull();
    expect(maturity === "current" ? bridge.operatingLeasesCurrent : bridge.operatingLeasesNoncurrent).toBe(10);
    expect(maturity === "current" ? bridge.financeLeasesCurrent : bridge.financeLeasesNoncurrent).toBe(5);
    expect(bridge.leaseScopeNote).toContain(maturity === "current" ? "noncurrent portion is unverified" : "current portion is unverified");
  });
  it("qualifies every report surface and payload, preserves the lease-excluded EV arithmetic, and never imports an older current portion", () => {
    const { bundle } = fixture();
    if (bundle.statements.balanceAnnual.ok) bundle.statements.balanceAnnual.value.data.rows[0]!.operatingLeaseLiability = 61e6;
    const computed = runStageB(bundle, { evIncludeLeases: false });
    expect(computed.capital.current?.debtBridge.operatingLeases).toBeNull();
    expect(computed.capital.current?.debtBridge.operatingLeasesNoncurrent).toBe(226e6);
    const ev = computed.valuation.multiples!.enterpriseValue;
    expect(ev.excludingLeases).not.toBeNull();
    expect(ev.includingLeases).toBeNull();
    expect(ev.basis).toMatch(/disclosed operating-lease portion/i);
    let report = loadTask28Fixture();
    report.valuation = applyMultiples(report.valuation, computed.valuation);
    report = applyFinancialDiagnostics(report, computed, bundle);
    for (const text of [reportToMarkdown(report), reportToPrintBody(report), renderToStaticMarkup(createElement(ReportView, { report }))]) {
      expect(text).toContain("Operating leases (noncurrent only)");
      expect(text).toContain("current portion is unverified");
      expect(text).not.toContain("Total debt including leases");
    }
    const audit = reportToAuditMarkdown(report);
    expect(audit).toContain("operatingLeasesNoncurrent");
    expect(audit).toContain("current portion is unverified");
    const payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
    const section = payload.computed.find(s => s.title === "Current capital (computed)");
    expect(section?.notes.join(" ")).toContain("current portion is unverified");
    expect(section?.figures.some(f => f.label === "total debt including leases" && f.value !== null)).toBe(false);
    expect(payload.statements.find(s => /^Balance sheet.*quarterly$/.test(s.title))?.notes.join(" ")).toContain("current portion is unverified");
  });
  // Audit 2026-10-19 FCX-1: proven financing components let sales-to-capital
  // run on the lease-excluded basis rather than withholding the DCF.
  it("measures sales-to-capital excluding the disclosed operating-lease portion when lease-inclusive coverage is incomplete", () => {
    const note = incompleteLeaseCoverage(fixture().row)!.note;
    const result = buildDcfAssumptions({ revenueCagr3yPct: 8, revenueCagr5yPct: 8, analystEstimates: null, waccPct: 10, riskFreePct: 4, marketCap: 20e9,
      incomeTtm: { date: "2026-03-31", revenue: 1000e6, operatingIncome: 200e6, incomeBeforeTax: 180e6, incomeTaxExpense: 36e6 },
      incomeHistory: [2023, 2024, 2025].map(y => ({ date: `${y}-12-31`, revenue: 900e6, operatingIncome: 180e6, incomeBeforeTax: 160e6, incomeTaxExpense: 32e6 })),
      balance: { ...fixture().row, date: "2026-03-31", basis: "quarter", totalDebt: 5685e6, totalStockholdersEquity: 3000e6, totalEquity: 3000e6, cashAndShortTermInvestments: 7127e6, leaseCoverageNote: note },
    });
    expect(result.assumptions).not.toBeNull();
    expect(result.gaps.some(g => g.field === "valuation.dcf.salesToCapital")).toBe(false);
    expect(result.assumptions!.salesToCapital.basis).toContain("current portion is unverified");
    expect(result.assumptions!.salesToCapital.basis).toContain("excludes the disclosed operating-lease portion 226000000");
  });
});
