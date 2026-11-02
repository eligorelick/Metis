import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { buildDataCompleteness } from "@/report/completeness";
import { metricPolicy } from "@/pipeline/stageB/sectorRouting";
import { buildMarketData } from "@/pipeline/marketData";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function lender(options: { bank?: boolean; sic?: string; statement?: string } = {}) {
  const b = completeCurrencyBundle({ bank: options.bank, sic: options.sic ?? "6163" });
  if (!b.profile.ok) throw new Error("fixture profile");
  Object.assign(b.profile.value.data.rows[0]!, { cik: "0000000042", sector: "Financial Services", industry: options.bank ? "Banks - Regional" : "Financial - Capital Markets", ipoDate: "2025-09-12" });
  b.edgar.registrant = { cik10: "0000000042", name: "Example", tickers: [b.symbol], exchanges: ["Nasdaq"], sic: options.sic ?? "6163", sicDescription: "Loan Brokers", fiscalYearEnd: "1231", stateOfIncorporation: "DE", forms: ["10-Q"] };
  b.edgar.tenQNotes = { ok: true, value: { source: "edgar", endpoint: "filing:notes", asOf: "2026-03-31", fetchedAt: b.builtAt,
    data: { sectionName: "tenQNotes", text: "Loan origination and distribution.", statementsText: options.statement ?? "CONSOLIDATED STATEMENTS OF CASH FLOWS (in thousands) Operating activities: Net income 50 Adjustments to reconcile net income to net cash provided by operating activities: Proceeds from loan sales, net of repurchases 4,500 Originations of loans held for sale (2,600) Purchases of loans held for sale (2,400) Net cash used in operating activities (450) Investing activities: Capital expenditure (10) Financing activities: Proceeds from debt 500",
      method: "toc-anchor", chars: 35, accession: "0000000042-26-000001", form: "10-Q", filingDate: "2026-05-06", reportDate: "2026-03-31", documentUrl: "https://www.sec.gov/Archives/edgar/data/42/000000004226000001/quarter.htm" } } };
  return b;
}

describe("R-FIGR-1 held-for-sale lending cash-flow applicability", () => {
  it("L5 omits lender quarterly gross margin while preserving the non-lender column", () => {
    const b = lender(), c = runStageB(b);
    if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
    b.statements.incomeQuarterly.value.data.rows[0]!.grossProfit = 100e6;
    const d = buildFilingDisclosures(b, c.route.cashFlowApplicability)!;
    expect(d.quarterlyTrend.every(r => r.grossMarginPct === null)).toBe(true);
    expect(filingDisclosureTables(d, "fundamentals").find(t => t.heading.startsWith("Quarterly trend"))?.headers).not.toContain("Gross margin");
    const control = completeCurrencyBundle({});
    if (!control.statements.incomeQuarterly.ok) throw Error("fixture");
    control.statements.incomeQuarterly.value.data.rows[0]!.grossProfit = 100e6;
    expect(buildFilingDisclosures(control)!.quarterlyTrend.some(r => r.grossMarginPct !== null)).toBe(true);
  });
  it("L5 marks provider EV not applicable with the evidenced lender reason", () => {
    const b = lender();
    b.enterpriseValues = { ok: true, value: { data: { rows: [{ date: "2026-03-31", enterpriseValue: 6.77e9, addTotalDebt: 300e6 }], raw: [] }, source: "fmp", endpoint: "retained", asOf: "2026-03-31", fetchedAt: b.builtAt } };
    const c = runStageB(b);
    const report = buildDataOnlyReport({ symbol: b.symbol, companyName: "Example", generatedAt: b.builtAt, model: "none", costUsd: 0,
      bundle: b, validation: { checks: [], flags: [], gaps: [] }, computed: c, costBreakdown: [], reason: "offline" });
    expect(report.marketData?.enterpriseValue).toBeNull();
    expect(report.marketData?.enterpriseValueNote).toMatch(/Provider enterprise value not applicable.*held-for-sale/i);
    expect(reportToMarkdown(report)).toMatch(/Provider enterprise value not applicable/i);
    const control = completeCurrencyBundle({}); control.enterpriseValues = b.enterpriseValues;
    expect(buildMarketData(control)?.enterpriseValue).not.toBeNull();
  });
  it("makes owner-FCF measures inapplicable without hiding filed OCF, capex, income or book value", () => {
    const b = lender(); const before = JSON.stringify(b);
    const c = runStageB(b);
    expect(c.route.base).toBe("general");
    expect(c.route.overlays).not.toContain("unprofitable");
    expect(c.capital.fcf.latestFcf).toBeNull();
    expect(c.capital.current?.cashBridge.operatingCashFlow).toBeGreaterThan(0);
    expect(c.capital.current?.cashBridge.cashCapitalExpenditure).not.toBeNull();
    expect(c.capital.current?.cashBridge.standardizedFcf).toBeNull();
    expect(c.runway?.runwayQuarters).toBeNull();
    expect(c.runway?.notes.join(" ")).toMatch(/not applicable.*held-for-sale/i);
    expect(c.valuation.kind).toBe("dcf-suppressed");
    expect(c.valuation.multiples!.multiples.find(m => m.key === "priceToFcf")).toMatchObject({ current: null, ownHistory: null, peers: null, basis: expect.stringMatching(/not applicable/i) });
    expect(c.valuation.multiples!.multiples.find(m => m.key === "priceToBook")?.current).toBeGreaterThan(0);
    const policy = metricPolicy(c.route);
    expect(policy.suppress).toEqual(expect.arrayContaining(["fcfGrowth", "fcfDcf", "fcfYield", "fcfConversion", "sbcPctOfFcf"]));
    // F2: industrial leverage/coverage and FCF signals cannot model lender solvency.
    expect(c.scores.aspects.balanceSheet.applicableCompleteness).toBeNull();
    expect(c.scores.aspects.balanceSheet.signals).toEqual([]);
    expect(c.scores.aspects.balanceSheet.note).toMatch(/capital adequacy.*not (?:modelled|computed)/i);
    const p = assembleContextPayload(b, c, { checks: [], flags: [], gaps: [] });
    const prompt = serializePayloadForPrompt(p);
    expect(prompt).toMatch(/not applicable.*held-for-sale/i);
    expect(p.computed.flatMap(s => s.figures).some(f => /operating cash flow/.test(f.label) && f.value !== null)).toBe(true);
    expect(buildFilingDisclosures(b, c.route.cashFlowApplicability)?.quarterlyTrend.every(r => r.freeCashFlow === null)).toBe(true);
    expect(JSON.stringify(b)).toBe(before);
  });

  it("L9 records a refused, unconsumed lender discount rate as disclosure only", () => {
    const b = lender();
    if (!b.profile.ok) throw new Error("fixture");
    b.profile.value.data.rows[0]!.beta = -0.02;
    const c = runStageB(b);
    expect(c.valuation.kind).toBe("dcf-suppressed");
    expect(c.returns.wacc.waccPct).toBeNull();
    expect(c.returns.wacc.costOfEquityPct).toBeNull();
    expect(c.returns.wacc.gaps.find(g => g.field === "returns.wacc.beta")).toMatchObject({ severity: "info", reason: expect.stringMatching(/no applicable.*discount rate/i) });
    expect(c.gaps.find(g => g.field === "returns.wacc.beta")?.severity).toBe("info");
    expect(buildDataCompleteness(c.gaps).state).not.toBe("blocked");
  });
  it.each(["general", "bank", "insurer"])("L9 retains critical beta severity for the %s route", kind => {
    const b = lender({ bank: kind === "bank", sic: kind === "bank" ? "6022" : "3571" });
    if (!b.profile.ok) throw new Error("fixture");
    b.profile.value.data.rows[0]!.beta = -0.02;
    if (kind === "insurer") Object.assign(b.profile.value.data.rows[0]!, { industry: "Insurance - Property & Casualty", sector: "Financial Services" });
    const c = runStageB(b);
    expect(c.route.base).toBe(kind === "general" ? "general" : kind);
    expect(c.gaps.find(g => g.field === "returns.wacc.beta")?.severity).toBe("critical");
    expect(buildDataCompleteness(c.gaps).state).toBe("blocked");
  });
  it("F1/F2 remove industrial lender multiples and leverage from numbers and scoring", () => {
    const c = runStageB(lender());
    const p = metricPolicy(c.route);
    expect(p.suppress).toEqual(expect.arrayContaining(["evEbitda", "evToSales", "netDebt", "netDebtToEbitda", "interestCoverage", "grossMargin"]));
    expect(p.lead).not.toContain("evEbitda");
    for (const key of ["evToEbitda", "evToSales"]) {
      expect(c.valuation.multiples!.multiples.find(m => m.key === key)).toMatchObject({ current: null, ownHistory: null, peers: null, basis: expect.stringMatching(/warehouse.*operating inventory finance/i) });
      expect(c.valuation.multiples!.sectorAppropriate).not.toContain(key);
    }
    expect(c.capital.netDebtToEbitda.value).toBeNull();
    expect(c.capital.netDebtToEbitda.netDebt).toBeNull();
    expect(c.capital.interestCoverage.value).toBeNull();
    expect(c.capital.interestCoverage.note).toMatch(/not applicable/i);
    expect(c.capital.current?.netDebt).toBeNull();
    expect(c.capital.current?.interestCoverage).toBeNull();
    expect(c.growth.margins.gross.series).toEqual([]);
  });

  it("F1 retains EV only as context with a tied filed debt composition", () => {
    const b = lender();
    if (!b.edgar.tenQNotes?.ok || !b.statements.balanceQuarterly.ok) throw new Error("fixture");
    b.edgar.tenQNotes.value.data.statementsText = "CONSOLIDATED BALANCE SHEETS (in thousands) Liabilities: Payables to third-party loan owners 506,686 383,772 Debt, current ($120,105 at fair value) 222,505 160,959 Debt, current to related parties ($424,640 at fair value) 424,640 166,135 Debt, non-current 315,850 230,143 Total liabilities 1,604,578 1,080,325 " + b.edgar.tenQNotes.value.data.statementsText;
    Object.assign(b.statements.balanceQuarterly.value.data.rows[0]!, { reportedCurrency: "USD", totalDebt: 1_474_457_000, operatingLeaseLiability: 4_776_000 });
    const ev = runStageB(b).valuation.multiples!.enterpriseValue;
    expect(ev.value).not.toBeNull();
    expect(ev.basis).toMatch(/context only/i);
    expect(ev.basis).toMatch(/payables to third-party loan owners 506686000/i);
    expect(ev.basis).toMatch(/Debt, current to related parties 424640000/i);
    // F1: a stale whole-row fallback cannot claim the newer filing's debt components.
    delete b.statements.balanceQuarterly.value.data.rows[0]!.reportedCurrency;
    expect(runStageB(b).valuation.multiples!.enterpriseValue.value).toBeNull();
  });

  it("F12 scores tangible common returns for evidenced lenders while retaining filed operating margin", () => {
    const c = runStageB(lender());
    const p = metricPolicy(c.route);
    expect(p.suppress).toContain("roic");
    expect(p.suppress).toContain("roicVsWacc");
    expect(p.suppress).not.toContain("rote");
    expect(p.suppress).not.toContain("operatingMargin");
    expect(c.returns.roic.latestRoicPct).toBeNull();
    expect(c.returns.roicVsWacc.spreadPctPts).toBeNull();
    expect(c.returns.rote.latestRotePct).not.toBeNull();
    expect(c.scores.aspects.moat.signals?.map(s => s.id)).toContain("roteLevel");
    expect(c.scores.aspects.moat.signals?.map(s => s.id)).not.toContain("roicLevel");
    expect(c.growth.margins.operating.series.length).toBeGreaterThan(0);
  });

  it("F12 discloses why filed common earnings cannot enter lender ROTE at the cutoff", () => {
    const b = lender();
    if (!b.statements.incomeAnnual.ok) throw new Error("fixture");
    for (const row of b.statements.incomeAnnual.value.data.rows) {
      row.netIncomeAvailableToCommon = 140_000_000;
      row.fieldProvenance = { ...row.fieldProvenance, netIncomeAvailableToCommon: { source: "edgar", unit: "USD",
        periodStart: `${row.date!.slice(0, 4)}-01-01`, periodEnd: row.date!, observedAt: "2026-07-06T00:00:03.000Z",
        tags: ["us-gaap/NetIncomeLossAvailableToCommonStockholdersBasic"], filings: [{ accn: "0000000042-26-000001", filed: "2026-05-06", form: "10-Q" }] } };
    }
    const c = runStageB(b);
    expect(c.returns.rote.latestRotePct).toBeNull();
    expect(c.returns.rote.gaps.find(g => g.field === "returns.rote")?.reason).toContain("observation is not proven available at the analysis cutoff");
    const report = buildDataOnlyReport({ symbol: b.symbol, companyName: "Example", generatedAt: b.builtAt, model: "none", costUsd: 0,
      bundle: b, validation: { checks: [], flags: [], gaps: [] }, computed: c, costBreakdown: [], reason: "offline" });
    expect(reportToAuditMarkdown(report)).toContain("observation is not proven available at the analysis cutoff");
  });

  it.each([
    ["a fee-based financial issuer", {}],
    ["a non-lender SIC", { sic: "3571" }],
    ["an unresolved financial SIC", { sic: "6199" }],
    ["lending in investing activities", { statement: "STATEMENTS OF CASH FLOWS Operating activities: Net cash from operating activities 50 Investing activities: Proceeds from loan sales 500 Originations of loans held for sale (400) Financing activities: Debt 10" }],
    ["an originator without evidenced loan sales", { statement: "STATEMENTS OF CASH FLOWS Operating activities: Originations of loans held for sale (400) Net cash used in operating activities (400) Investing activities: None Financing activities: Debt 10" }],
  ])("keeps normal cash-flow treatment for %s", (name, opts) => {
    const b = lender(opts);
    if (name === "a fee-based financial issuer" && b.edgar.tenQNotes?.ok) b.edgar.tenQNotes.value.data.statementsText = "Operating activities: Collection of fees 500 Net cash provided by operating activities 500 Investing activities: Capex (10)";
    const c = runStageB(b);
    expect(c.capital.fcf.latestFcf).not.toBeNull();
    expect(metricPolicy(c.route).suppress).not.toContain("fcfConversion");
    for (const key of ["evToEbitda", "evToSales"]) expect(c.valuation.multiples!.multiples.find(m => m.key === key)?.current).not.toBeNull();
  });

  it("keeps bank routing and its established metric policy", () => {
    const c = runStageB(lender({ bank: true, sic: "6022" }));
    expect(c.route.base).toBe("bank");
    expect(c.valuation.kind).toBe("excess-return");
    expect(metricPolicy(c.route).suppress).not.toContain("fcfConversion");
  });

  it.each(["foreign source", "future filing", "wrong issuer source", "zero originations"])("does not infer applicability from %s", name => {
    const b = lender();
    if (!b.edgar.tenQNotes?.ok) throw new Error("fixture notes");
    const note = b.edgar.tenQNotes.value.data;
    if (name === "foreign source") note.documentUrl = "https://example.com/quarter.htm";
    if (name === "future filing") note.filingDate = "2027-05-06";
    if (name === "wrong issuer source") note.documentUrl = note.documentUrl.replace("/42/", "/99/");
    if (name === "zero originations") note.statementsText = note.statementsText!.replace("(2,600)", "(0)");
    expect(runStageB(b).capital.fcf.latestFcf).toBe(170_000_000);
  });

  it("carries the applicability explanation through saved reports, both layouts and exports without mutating stored bytes", () => {
    const b = lender(); const computed = runStageB(b);
    const report = buildDataOnlyReport({ symbol: b.symbol, companyName: "Example", generatedAt: b.builtAt, model: "none", costUsd: 0,
      bundle: b, validation: { checks: [], flags: [], gaps: [] }, computed, costBreakdown: [], reason: "offline" });
    const before = JSON.stringify(report);
    expect(report.filingDisclosures?.quarterlyTrend.every(row => row.freeCashFlow === null)).toBe(true);
    for (const output of [renderToStaticMarkup(createElement(ReportView, { report })),
      renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" })),
      reportToMarkdown(report), reportToPrintHtml(report, { autoPrint: false }), reportToAuditMarkdown(report)]) {
      expect(output).toMatch(/not applicable[^<\n]*held-for-sale/i);
    }
    expect(JSON.stringify(report)).toBe(before);
  });
});
