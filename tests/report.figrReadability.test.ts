import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { runStageB } from "@/pipeline/compute";
import { computeDcfDisplay } from "@/pipeline/stageB/fairValue";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody, PRINT_CSS } from "@/report/export/printHtml";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { displayProse, figureRow, keyDataRows, metricLabel } from "@/report/presentation";
import type { Report } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";
import { withoutPrintTokens } from "./helpers/printTokens";

const REASON = "Owner FCF, P/FCF, FCF yield, FCF conversion/growth and cash runway are not applicable: SIC 6163 and the 10-Q cash-flow statement for 2026-06-30 place held-for-sale loan originations and loan-sale proceeds in operating activities. Warehouse and loan-owner funding is operating inventory finance; industrial EV/EBITDA, EV/Sales, net debt, net debt/EBITDA and interest coverage are not applicable. Capital adequacy is not modelled for non-bank lenders: industrial coverage and leverage do not measure solvency. Vendor gross margin is not a filed lender income-statement line. ROIC and ROIC-vs-WACC are not applicable because invested capital (debt + equity - cash) is undefined when debt funds operating inventory; ROTE is the capital-return convention. OCF less capex reflects loan inventory funding and turnover, not cash available to owners or an exhaustion clock. An FCF-based DCF (including reverse DCF and sensitivity) is not applicable. Filed OCF, capex, loan flows, earnings and book value remain source observations, subject to their own data checks. Source: https://www.sec.gov/Archives/edgar/data/2064124/figr.htm.";

function lenderReport(): Report {
  const r = loadTask28Fixture();
  r.meta.symbol = "FIGR";
  r.meta.reportId = 1;
  r.filingDisclosures = buildFilingDisclosures(completeCurrencyBundle({}))!;
  r.filingDisclosures.quarterlyGrossMarginNotApplicable = REASON;
  r.filingDisclosures.notes = [REASON];
  r.fundamentals.fcf = [{ label: "Owner FCF", values: [] }];
  r.balanceSheet.debtProfile.commentary = [{ label: "JUDGMENT", text: REASON, source: "computed.capital.current", asOf: null }];
  r.balanceSheet.graded!.oneLineWhy = `Capital grading basis: ${REASON}`;
  r.valuation.dcf = { ...r.valuation.dcf, perShare: null, upsidePct: null, assumptions: [], sensitivityGrid: [] };
  r.valuation.reverseDcf = { impliedMetric: "n/a", impliedValue: null, narrative: "No reverse DCF applies to this lender." };
  r.fairValue = { status: "suppressed", method: null, methodVersion: "test", perShare: null, upsidePct: null, basis: [], reasons: [{ field: "valuation.fairValue", reason: REASON, severity: "info" }] };
  r.valuation.multiples = ["EV/EBITDA", "EV/Sales", "P/FCF"].map(name => ({ name, current: null, peerMedian: null, own5yPercentile: null, sectorAppropriate: false, basis: REASON }));
  r.valuation.multiplesBasis = "EV context only: Payables to third-party loan owners 506686000 (statement currency, 2026-06-30).";
  r.valuation.scenarios = r.valuation.scenarios.map(s => ({ ...s, priceTarget: null, probability: null, assumptions: ["No model assumptions available."], horizon: "n/a" }));
  if (r.projections) r.projections = { ...r.projections, series: [], notApplicableReason: 'Forward FCFF projections are only modelled on the general route; this company routed to "dcf-suppressed".' };
  return r;
}

function surfaces(r: Report): string[] {
  return [reportToMarkdown(r), reportToPrintBody(r), renderToStaticMarkup(createElement(ReportView, { report: r }))];
}

describe("R3 FIGR reader presentation", () => {
  it("1: states lender conventions once and uses metric-specific cross-references without mutating the report", () => {
    const r = lenderReport();
    const before = JSON.stringify(r);
    for (const text of surfaces(r)) {
      expect(text).toContain("Lender conventions");
      expect(text.match(/Owner FCF, P\/FCF, FCF yield/g)).toHaveLength(1);
      expect(text).toContain("loan funding is operating inventory finance (see Lender conventions)");
      expect(text).toContain("owner cash flow is not established (see Lender conventions)");
    }
    expect(reportToAuditMarkdown(r)).toContain("Capital adequacy is not modelled for non-bank lenders");
    expect(JSON.stringify(r)).toBe(before);
  });

  it("2: gives market EV one short sentence while retaining its complete basis in the audit", () => {
    const r = lenderReport();
    // Use the resolved scope already exercised by the market-scope contract.
    r.valuation.marketValueScope = { status: "resolved", enterpriseValue: 5e9, enterpriseValueBasis: "Capitalization hash abc123; lease methodology; Payables to third-party loan owners 506686000", currency: "USD", marketCap: 4e9, economicShares: null, basis: "test", shareCountAsOf: null, priceAsOf: null } as Report["valuation"]["marketValueScope"];
    r.valuation.multiplesBasis = r.valuation.marketValueScope!.enterpriseValueBasis!;
    const row = keyDataRows(r).find(x => x.label === "Enterprise value (market)")!;
    expect(row.note).toBe("Issuer-common market capitalization plus the disclosed net claims; full bridge in the companion audit export.");
    for (const text of surfaces(r)) {
      expect(text).not.toContain("Capitalization hash abc123");
      expect(text).not.toContain("lease methodology");
    }
    expect(reportToAuditMarkdown(r)).toContain("Capitalization hash abc123");
  });

  it("1 legacy: finds the recorded lender explanation even without filing disclosures", () => {
    const r = lenderReport();
    delete r.filingDisclosures;
    for (const text of surfaces(r)) {
      expect(text).toContain("Lender conventions");
      expect(text.match(/Owner FCF, P\/FCF, FCF yield/g)).toHaveLength(1);
    }
  });

  it("3 control: preserves an available entity model when only its per-share output is withheld", () => {
    const r = lenderReport();
    r.valuation.dcf.forecastRows = computeDcfDisplay(runStageB(completeCurrencyBundle({})).valuation).forecastRows;
    expect(reportToMarkdown(r)).toContain("### Reverse DCF");
  });

  it("3: suppresses absent DCF scaffolding and machine route ids on every reader surface", () => {
    const r = lenderReport();
    r.appendix.missingData.push({ field: "data.route", reason: 'Targets unavailable: company routed to "dcf-suppressed".', severity: "warn" });
    for (const text of surfaces(r)) {
      expect(text).not.toContain("Implied n/a");
      expect(text).not.toContain("dcf-suppressed");
      expect(text).not.toContain("bull and bear are DCF sensitivities");
      expect(text).not.toContain("Assumptions common to every scenario");
      expect(text).not.toContain("No model assumptions available");
      expect(text).not.toContain("Weighted Projections");
      expect(text).toContain("DCF, reverse DCF, scenario targets and weighted projections are unavailable");
    }
  });

  it("3a/4: describes available quarters, names a missing quarter, and defines only shown FCF", () => {
    const d = lenderReport().filingDisclosures!;
    const base = d.quarterlyTrend[0]!;
    d.quarterlyTrend = ["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30", "2025-03-31", "2024-12-31", "2024-06-30"].map(periodEnd => ({ ...base, periodEnd, fiscalLabel: null, freeCashFlow: null }));
    const t = filingDisclosureTables(d, "fundamentals")[0]!;
    expect(t.heading).toBe("Quarterly trend (latest eight available quarters)");
    expect(t.note).toContain("2024-09-30");
    expect(t.note).not.toContain("FCF here is");
    expect(t.rows).toHaveLength(8);
    d.quarterlyTrend[0]!.freeCashFlow = 12;
    expect(filingDisclosureTables(d, "fundamentals")[0]!.note).toContain("FCF here is");
  });

  it("5a: preserves an explicit record label and shortens legacy financial Piotroski labels", () => {
    expect(metricLabel("computed.arbitrary-slug", "% Piotroski F (financial variant, 5 of 9 signals — 4 withheld: cfoPositive, accrualQuality, liquidityUp, marginUp)")).toBe("Piotroski F (financial variant, 5 of 9 signals)");
    expect(metricLabel("computed.forensics.piotroski-f-financial-variant-5-of-9-signals-4-withheld-cfopositive-accrualquality-liquidityup-marginup", "score")).toBe("Piotroski F (financial variant, 5 of 9 signals)");
  });

  it.each([["capex", "Capital expenditure"], ["buybacks", "Share repurchases"]])("5b: displays %s as a cash outflow without changing payload labels", (slug, label) => {
    expect(metricLabel(`payload.statements.${slug}-negative-year-ended-2025-12-31`)).toBe(`${label} (cash outflow) (year ended 2025-12-31)`);
  });

  it("5c/d/f: shows completeness as percent, case strength with its scale and grouped base-unit amounts", () => {
    expect(displayProse("Fundamentals evidence completeness was 0.65.")).toContain("65%");
    expect(displayProse("Self-assessed case strength (1-5, the analyst's own score for its own side): bull 3, bear 3.")).toContain("bull 3 of 5, bear 3 of 5");
    expect(displayProse("filed revenue 225588000 / 106077000 USD; Payables to third-party loan owners 506686000")).toBe("filed revenue 225,588,000 / 106,077,000 USD; Payables to third-party loan owners 506,686,000");
    expect(figureRow({ value: .75, unit: "fraction", source: "computed.deterministic-aspect-scores.moat-evidence-completeness", asOf: null, verified: null }).value).toBe("75%");
  });

  it("5e: separates guidance notes and leaves parser diagnostics in the audit", () => {
    const r = lenderReport();
    r.filingDisclosures!.notes = ["First coverage note", "Second coverage note", "8-K 0002064124-26-000031: no structured guidance could be extracted from the release or commentary", '8-K 0002064124-26-000031: outlook sentence not read as guidance: "Q3 2026 Guidance Consumer Loan Marketplace Volume $4.8 - $5.2 billion"'];
    const tables = filingDisclosureTables(r.filingDisclosures, "outlook");
    const text = JSON.stringify(tables);
    expect(text).not.toContain("no structured guidance could be extracted");
    expect(text).not.toContain("outlook sentence not read as guidance");
    expect(text).toContain("First coverage note.");
    expect(text).toContain("Second coverage note.");
    expect(text).toContain("Consumer Loan Marketplace Volume");
    expect(reportToAuditMarkdown(r)).toContain("no structured guidance could be extracted");
  });

  it("5f: formats signed filing derivations and large base-unit amounts while the audit retains raw text", () => {
    const r = lenderReport();
    r.valuation.multiples[0]!.basis = "Using filed revenue 225588000 USD.";
    r.filingDisclosures!.filingFacts = [{ key: "composition-working-capital-receivables", label: "Receivables cash-flow contribution", value: -37_858_000, unit: "currency", asOf: "2026-06-30", period: "2026-01-01 to 2026-06-30", qualifier: null,
      computed: "37858000 USD tagged change x -1 = -37858000 USD", text: "Compared with filed revenue 10000000000 USD.", sourceTag: "us-gaap/IncreaseDecreaseInAccountsReceivable",
      source: { form: "10-Q", accession: "0001628280-26-057061", exhibit: null, filingDate: "2026-08-14", url: "https://www.sec.gov/Archives/edgar/data/2064124/figr.htm" } }];
    const rendered = surfaces(r).map(withoutPrintTokens);
    for (const text of [JSON.stringify(filingDisclosureTables(r.filingDisclosures, "balanceSheet")), ...rendered]) {
      expect(text).toContain("37,858,000 USD tagged change");
      expect(text).toContain("-37,858,000 USD");
      expect(text).toContain("10,000,000,000 USD");
    }
    for (const text of rendered) expect(text).toContain("225,588,000 USD");
    expect(reportToAuditMarkdown(r)).toContain("37858000 USD tagged change x -1 = -37858000 USD");
  });

  it("6: truncates a long unpunctuated gap only at a word boundary", () => {
    const r = loadTask28Fixture();
    const reason = `${"abcdefghij ".repeat(29)}filer's measurement remains unavailable after review`;
    r.appendix.missingData.push({ field: "data.longReason", reason, severity: "warn" });
    const md = reportToMarkdown(r);
    expect(md).not.toContain("f …");
    expect(md).toContain("abcdefghij … (full text in the audit export)");
    expect(reportToAuditMarkdown(r)).toContain("filer's measurement remains unavailable");
  });

  it("7: wraps descriptions at spaces, protects numeric/date tokens and splits wide print tables", () => {
    expect(PRINT_CSS).toMatch(/th, td\s*\{[^}]*overflow-wrap:\s*normal/);
    expect(PRINT_CSS).toMatch(/\.print-token\s*\{[^}]*white-space:\s*nowrap/);
    const r = lenderReport();
    const d = r.filingDisclosures!;
    d.quarterlyTrend[0] = { ...d.quarterlyTrend[0]!, revenue: 72_870_000, revenueYoyPct: 12.5, periodEnd: "2026-06-30", operatingExpenses: 12, operatingCashFlow: 34, freeCashFlow: 56, nonGaapEpsDiluted: 1.2, equitySecuritiesGains: 50 };
    const html = reportToPrintBody(r);
    expect(html).toContain('<span class="print-token">$72.87M</span>');
    expect(html).toContain('<span class="print-token">2026-06-30</span>');
    expect(html).toContain('class="print-table-part"');
  });

  it("8: names the downloaded audit companion and keeps the API link in the app", () => {
    const r = lenderReport();
    for (const text of [reportToMarkdown(r), reportToPrintBody(r)]) {
      expect(text).toContain("FIGR-report-1-audit.md");
      expect(text).not.toContain("/api/export/1?format=audit");
    }
    expect(renderToStaticMarkup(createElement(ReportView, { report: r }))).toContain("/api/export/1?format=audit");
  });

  it("9: labels an excluded provider peer list as scale context, not comparables", () => {
    const r = lenderReport();
    const p = r.competitive.peerTable[0]!;
    r.competitive.peerTable = [{ ...p, symbol: "COIN", name: "Coinbase" }];
    r.valuation.peerCoverage = { candidates: 1, evaluated: 1, eligible: [], methodology: [], exclusions: [{ symbol: "COIN", reason: "business model excluded" }] } as unknown as NonNullable<Report["valuation"]["peerCoverage"]>;
    for (const text of surfaces(r)) {
      expect(text).toContain("Provider peer list");
      expect(text).toContain("shown for scale only");
      expect(text).toContain("not used as comparables");
    }
  });
});
