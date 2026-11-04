import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { CREDIBILITY_NOT_ASSESSED_REASON, EXECUTIVE_NOT_ASSESSED_REASON, LEGACY_EXECUTIVE_ASSESSMENT_REASON, executiveAssessmentNote, executiveAssessmentReason } from "@/report/executiveAssessment";
import { assessExecutiveEvidence } from "@/report/financialDiagnostics";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { filingFactTables } from "@/report/filingSupplementPresentation";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { macroDisplayRows, methodologyNotes, metricLabel, provisionalSessionBar } from "@/report/presentation";
import { unavailableCashFlowModel } from "@/report/readerConventions";
import type { Report, SourcedClaim, TracedNumber, VerificationLogEntry } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withoutPrintTokens } from "./helpers/printTokens";
import { loadTask28Fixture } from "./helpers/task28Report";

/**
 * FIGR extra-high paid audit (2026-11-02), reader-presentation findings that a
 * re-render of the stored report can correct without an AI call: B2-09
 * (which executive assessment is missing), B2-17 (a "last close" from a session
 * still open at fetch time), B2-18 (repeated qualifications, XBRL tags, parser
 * diagnostics and grade-contract enums in the reader), B2-19 (templates that
 * describe absent model outputs), B2-20 (quarter count) and A2-26 (macro
 * transform and observation month).
 */
function report(): Report {
  const r = loadTask28Fixture();
  r.meta.symbol = "FIGR";
  r.meta.reportId = 1;
  return r;
}

function surfaces(r: Report): [string, string, string] {
  return [reportToMarkdown(r), withoutPrintTokens(reportToPrintBody(r)), renderToStaticMarkup(createElement(ReportView, { report: r }))];
}

const figure = (source: string, value: number, unit: TracedNumber["unit"], asOf = "2026-06-30"): TracedNumber =>
  ({ value, unit, ...(unit === "currency" || unit === "currency/share" ? { currency: "USD" } : {}), source, sourceId: source, asOf, verified: true }) as TracedNumber;

const fact = (text: string, source = "computed.growth-margins.operating-margin-latest"): SourcedClaim => ({ label: "FACT", text, source, asOf: "2026-06-30" });

const intradayTiming = {
  version: "1", cutoffAt: null, quote: { observedAt: "2026-11-02T16:04:34.000Z", acquiredAt: "2026-11-02T16:04:38.426Z", stale: false },
  financialPeriods: [], filings: [], publications: [], acquisitions: [], calculationAsOf: null, calculatedAt: null, reportGeneratedAt: null,
} as unknown as NonNullable<Report["meta"]["evidenceTiming"]>;

describe("B2-09: executive assessment notes", () => {
  function withExecutives(r: Report): Report {
    r.leadership.executives = [
      { name: "Michael Tannenbaum", title: "Chief Executive Officer", tenureYears: null, grade: "B", credibilityGrade: "not-assessed",
        assessmentReason: LEGACY_EXECUTIVE_ASSESSMENT_REASON, reasoning: [fact("Operating margin for the quarter ended 2026-06-30 was 34.5%.")], evidence: {} },
      { name: "Jane Roe", title: "Chief Legal Officer", tenureYears: null, grade: "not-assessed", credibilityGrade: "not-assessed",
        assessmentReason: LEGACY_EXECUTIVE_ASSESSMENT_REASON, reasoning: [], evidence: {} },
    ];
    return r;
  }

  it("names which assessment is missing on every surface of a stored report", () => {
    for (const text of surfaces(withExecutives(report()))) {
      expect(text).not.toContain("execution and/or guidance-versus-actual evidence is absent");
      expect(text).toContain("Credibility is not assessed: no attributable, validated guidance-versus-actual record.");
      expect(text).toContain("Not assessed: Jane Roe (Chief Legal Officer). No attributable, validated execution or guidance-versus-actual record.");
    }
  });

  it("maps every gate outcome and keeps a specific stored reason", () => {
    expect(executiveAssessmentReason({ execution: false, credibility: false }, "B")).toBe(EXECUTIVE_NOT_ASSESSED_REASON);
    expect(executiveAssessmentReason({ execution: true, credibility: false }, "B")).toBe(CREDIBILITY_NOT_ASSESSED_REASON);
    expect(executiveAssessmentReason({ execution: true, credibility: false }, "not-assessed")).toBe("Credibility is not assessed: no attributable, validated guidance-versus-actual record.");
    expect(executiveAssessmentReason({ execution: true, credibility: true }, "B")).toBeUndefined();
    expect(executiveAssessmentNote({ grade: "B", credibilityGrade: "B", assessmentReason: LEGACY_EXECUTIVE_ASSESSMENT_REASON })).toBe(LEGACY_EXECUTIVE_ASSESSMENT_REASON);
    expect(executiveAssessmentNote({ grade: "B", credibilityGrade: "not-assessed", assessmentReason: " Tenure began 2024. " })).toBe("Tenure began 2024.");
    expect(executiveAssessmentNote({ grade: "B", credibilityGrade: "B", assessmentReason: "  " })).toBeUndefined();
    expect(executiveAssessmentNote({ grade: "B", credibilityGrade: "B" })).toBeUndefined();
  });

  it("writes the specific reason when the evidence gate withholds an assessment", () => {
    const r = withExecutives(report());
    const text = "Michael Tannenbaum: operating income for the fiscal year ended 2025-12-31 was USD 117.53 million.";
    const source = "payload.statements.income-annual.2025-12-31.operating-income";
    r.leadership.executives[0]!.evidence = { capitalAllocation: [{ label: "FACT", text, source, asOf: "2025-12-31" }] };
    const log = [{ path: "leadership.executives[0].evidence.capitalAllocation[0]", claim: text, source, validationStatus: "validated", executiveEvidenceKind: "execution", outcome: "verified" }] as unknown as VerificationLogEntry[];
    const out = assessExecutiveEvidence(r.leadership, log).executives;
    expect(out[0]).toMatchObject({ grade: "not-assessed", credibilityGrade: "not-assessed", assessmentReason: expect.stringContaining("no office start is established") });
    expect(out[1]).toMatchObject({ grade: "not-assessed", credibilityGrade: "not-assessed", assessmentReason: EXECUTIVE_NOT_ASSESSED_REASON });
  });
});

describe("B2-17: a daily bar from a session still open at fetch time", () => {
  function withTechnicals(r: Report, lastCloseAsOf: string, historyFetchedAt: string | null, lastCloseIn: "key" | "indicators" = "key"): Report {
    const lastClose = figure("computed.technicals.last-close", 21.93, "currency/share", lastCloseAsOf);
    const sma50 = figure("computed.technicals.sma50", 30.72, "currency/share", lastCloseAsOf);
    const sma200 = figure("computed.technicals.sma200", 34.09, "currency/share", lastCloseAsOf);
    r.technicals.graded.keyNumbers = lastCloseIn === "key" ? [lastClose, sma50] : [sma50];
    r.technicals.indicators = lastCloseIn === "key" ? [sma200] : [lastClose, sma200];
    r.appendix.sources = [
      { provider: "fmp", endpoint: "/stable/historical-price-eod/full?symbol=SPY&from=2021-11-02&to=2026-11-02 (2 chunk(s))", asOf: "2026-11-02", fetchedAt: "2026-11-02T16:04:38.946Z", stale: false },
      ...(historyFetchedAt === null ? [] : [{ provider: "fmp", endpoint: "/stable/historical-price-eod/full?symbol=FIGR&from=2021-11-02&to=2026-11-02 (2 chunk(s))", asOf: "2026-11-02", fetchedAt: historyFetchedAt, stale: false }]),
    ];
    r.meta.evidenceTiming = intradayTiming;
    return r;
  }

  it("names the unfinished session and its fetch time instead of a last close", () => {
    const r = withTechnicals(report(), "2026-11-02", "2026-11-02T16:04:38.646Z");
    expect(provisionalSessionBar(r)).toEqual({ date: "2026-11-02", fetchedAt: "2026-11-02T16:04:38.646Z", clock: "11:04" });
    for (const text of surfaces(r)) {
      expect(text).toContain("Price in the unfinished 2026-11-02 session (fetched 11:04 ET)");
      expect(text).toContain("fetched at 11:04 ET on 2026-11-02, while that session was still open");
    }
    expect(surfaces(r)[0]).not.toMatch(/\| Last close \|/);
  });

  it("falls back to the quote time when no price-history fetch is recorded", () => {
    expect(provisionalSessionBar(withTechnicals(report(), "2026-11-02", null))).toMatchObject({ date: "2026-11-02", clock: "11:04" });
  });

  it("keeps the last close when the session had settled or the close predates the open session", () => {
    expect(provisionalSessionBar(withTechnicals(report(), "2026-11-02", "2026-11-02T21:45:00.000Z"))).toBeNull();
    // A report built after the admission fix during the session: its last close is
    // the previous settled session, which an intraday quote must not rename.
    const prior = withTechnicals(report(), "2026-10-30", "2026-11-02T16:04:38.646Z", "indicators");
    expect(provisionalSessionBar(prior)).toBeNull();
    const [md, print] = surfaces(prior);
    expect(md).toMatch(/\| Last close \| \$21\.93 \| 2026-10-30 \|/);
    expect(print).toContain("<td>Last close</td>");
    // The key-data box rightly names the intraday quote; the technicals row must not.
    for (const text of [md, print]) {
      expect(text).not.toMatch(/Latest price \(intraday[^|<]*\)(?: \|\s*|<\/td><td>)\$21\.93/);
      expect(text).not.toContain("Price in the unfinished");
      expect(text).not.toContain("Price-history timing");
    }
  });
});

describe("B2-19: absent model outputs", () => {
  function noModel(r: Report): Report {
    r.valuation.dcf = { ...r.valuation.dcf, perShare: null, upsidePct: null, assumptions: [], sensitivityGrid: [], forecastRows: [], excessReturnGrid: undefined };
    r.valuation.reverseDcf = { impliedMetric: "n/a", impliedValue: null, narrative: "No reverse DCF applies to this lender." };
    r.fairValue = { status: "suppressed", method: null, methodVersion: "test", perShare: null, upsidePct: null, basis: [], reasons: [{ field: "valuation.fairValue", reason: "Lender route.", severity: "info" }] };
    if (r.projections) r.projections = { ...r.projections, series: [] };
    return r;
  }

  it("states that no model output exists instead of describing one", () => {
    const modeled = report();
    expect(unavailableCashFlowModel(modeled)).toBe(false);
    expect(methodologyNotes(modeled).join(" ")).toContain("Intrinsic value, scenario values and projections are model ESTIMATEs");
    const r = noModel(report());
    expect(unavailableCashFlowModel(r)).toBe(true);
    const notes = methodologyNotes(r).join(" ");
    expect(notes).not.toContain("Intrinsic value, scenario values and projections are model ESTIMATEs");
    expect(notes).toContain("This report models no intrinsic value, scenario value or projection");
    for (const text of surfaces(r)) expect(text).not.toContain("scenario display weights are a fixed prior");
  });

  it("heads cash-flow observations without an FCF row as observations, not free cash flow", () => {
    const r = report();
    r.fundamentals.fcf = [
      { label: "Operating cash flow (includes held-for-sale loan originations and sales; not cash available to owners)", values: [{ period: "TTM", value: figure("computed.current-capital.operating-cash-flow", -86_490_000, "currency") }] },
      { label: "Stock-based compensation (cash-flow add-back)", values: [{ period: "TTM", value: figure("computed.current-capital.stock-based-compensation", 109_079_000, "currency") }] },
    ];
    const [md, print, app] = surfaces(r);
    expect(md).toContain("### Operating cash flow and SBC observations");
    expect(md).not.toContain("### Free cash flow\n");
    expect(print).toContain("Operating cash flow and SBC observations");
    expect(app).toMatch(/operating cash flow and SBC observations/i);
    r.fundamentals.fcf = [{ label: "Free cash flow (after SBC, house default)", values: [{ period: "FY2025", value: figure("computed.capital.fcf", 50_000_000, "currency") }] }];
    expect(surfaces(r)[0]).toContain("### Free cash flow\n");
  });
});

describe("B2-20: quarterly trend caption", () => {
  it("counts the quarters it shows", () => {
    const d = buildFilingDisclosures(completeCurrencyBundle({}))!;
    const base = d.quarterlyTrend[0]!;
    d.quarterlyTrend = ["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30", "2025-03-31", "2024-06-30"].map(periodEnd => ({ ...base, periodEnd, fiscalLabel: null, freeCashFlow: null }));
    const t = filingDisclosureTables(d, "fundamentals")[0]!;
    expect(t.rows).toHaveLength(7);
    expect(t.heading).toBe("Quarterly trend (latest seven available quarters)");
  });
});

describe("B2-18: reader tables carry each qualification once and leave diagnostics to the audit export", () => {
  const source = { form: "10-Q", accession: "0001628280-26-057061", exhibit: null, filingDate: "2026-08-14", url: null };
  const SBC_NOTE = "Recognized expense and capitalized SBC are not additive as comprehensive current-service cost: amortization of previously capitalized SBC is unestablished, so comprehensive current-service cost is unestablished. No extra FCF deduction is made from this composition.";
  const sbcFact = (value: number, start: string) => ({
    key: "composition-sbc-recognized", label: "SBC recognized expense / amortization (as tagged)", value, unit: "currency" as const, asOf: "2026-06-30",
    period: `${start} to 2026-06-30`, qualifier: null, computed: null, sourceTag: "edgar:xbrl us-gaap/AllocatedShareBasedCompensationExpense", source,
    text: `${SBC_NOTE} us-gaap/AllocatedShareBasedCompensationExpense; USD; ${start} to 2026-06-30; 10-Q 0001628280-26-057061, filed 2026-08-14.`,
  });
  const receivables = {
    key: "composition-working-capital-receivables", label: "Accounts receivable cash-flow contribution", value: -37_858_000, unit: "currency" as const, asOf: "2026-06-30",
    period: "2026-01-01 to 2026-06-30", qualifier: null, computed: "37,858,000 USD tagged change x -1 = -37,858,000 USD cash-flow contribution", sourceTag: "edgar:xbrl us-gaap/IncreaseDecreaseInAccountsReceivable", source,
    text: "Signed cash-flow contributions for identified standard components only; other working-capital components remain unresolved. This is not total working capital or normalized FCF. us-gaap/IncreaseDecreaseInAccountsReceivable; USD; 2026-01-01 to 2026-06-30; 10-Q 0001628280-26-057061, filed 2026-08-14.",
  };

  it("states a composition table's shared qualification once and keeps XBRL tags out of the rows", () => {
    const [sbc, workingCapital] = filingFactTables({ currency: "USD", filingFacts: [sbcFact(51_976_000, "2026-01-01"), sbcFact(26_100_000, "2026-04-01"), receivables] });
    expect(JSON.stringify(sbc!.rows)).not.toContain("not additive as comprehensive");
    expect(sbc!.note!.match(/not additive as comprehensive/g)).toHaveLength(1);
    expect(JSON.stringify(workingCapital!.rows)).toContain("Derived: 37,858,000 USD tagged change x -1");
    expect(JSON.stringify(workingCapital!.rows)).toContain("Signed cash-flow contributions for identified standard components only");
    for (const t of [sbc!, workingCapital!]) expect(JSON.stringify(t)).not.toContain("us-gaap/");
    // The rows already say no FCF deduction is made, so the table does not add it again.
    expect(sbc!.note!.match(/FCF/g)).toHaveLength(1);

    const r = report();
    r.filingDisclosures = { ...buildFilingDisclosures(completeCurrencyBundle({}))!, filingFacts: [sbcFact(51_976_000, "2026-01-01"), sbcFact(26_100_000, "2026-04-01"), receivables] };
    for (const text of surfaces(r)) expect(text).not.toContain("us-gaap/AllocatedShareBasedCompensationExpense");
    expect(reportToAuditMarkdown(r)).toContain("us-gaap/AllocatedShareBasedCompensationExpense");
  });

  it("states the cash liquidity limit once, and still states it when the rows do not", () => {
    const cashFact = (key: string, value: number, asOf: string, text: string) => ({
      key, label: key, value, unit: "currency" as const, asOf, period: null, qualifier: null, computed: null, sourceTag: "edgar:xbrl", source, text,
    });
    const LIMIT = "Cash including restrictions is not all available liquidity. These are same-date, same-currency balances from one filing.";
    const [stated] = filingFactTables({ currency: "USD", filingFacts: [
      cashFact("composition-cash-unrestricted", 1.44e9, "2026-06-30", LIMIT), cashFact("composition-cash-combined", 1.53e9, "2026-06-30", LIMIT)] });
    expect(stated!.note!.match(/available liquidity/g)).toHaveLength(1);
    expect(stated!.note).toContain("Each balance keeps its own date and primary filing.");
    const [unstated] = filingFactTables({ currency: "USD", filingFacts: [cashFact("composition-cash-combined", 1.53e9, "2026-06-30", "Reported combined balance.")] });
    expect(unstated!.note).toContain("A combined balance including restrictions is not available liquidity.");
  });

  it("keeps parser diagnostics out of the reader's guidance notes", () => {
    const d = buildFilingDisclosures(completeCurrencyBundle({}))!;
    d.currencyBasis = 'Amounts printed with "$" in issuer filings are shown only when the source period\'s statement currency is established as current USD; explicit currency labels are checked separately. XBRL amounts carry their own ISO unit.';
    d.notes = [
      "Item 5 of 10-Q 0001628280-26-057061 mentions Rule 10b5-1 arrangements that could not be read as rows; the excerpt is in the AI context.",
      'Issuer outlook statement not read as structured guidance (8-K 0002064124-26-000031, filed 2026-08-13; release for Q2 FY2026): "Q3 2026 Guidance $ in billions Consumer Loan Marketplace Volume $4.8 - $5.2".',
      "no earnings, EPS or operating-income amount was read in 8-K 0001493152-26-046036 (2026-10-07); treated as an operating update. The earnings-release narrative and release figures are read from 8-K 0002064124-26-000031 (2026-08-13).",
      "Earnings inspection limited to 8 candidate filings including linked amendments; older candidates omitted.",
    ];
    const text = JSON.stringify(filingDisclosureTables(d, "outlook"));
    expect(text).toContain("Issuer outlook statement (8-K 0002064124-26-000031, filed 2026-08-13; release for Q2 FY2026)");
    expect(text).toContain("Q3 2026 Guidance $ in billions Consumer Loan Marketplace Volume $4.8 - $5.2");
    for (const diagnostic of ["could not be read as rows", "Earnings inspection limited", "no earnings, EPS or operating-income amount", "Amounts printed with", "not read as structured guidance"]) {
      expect(text).not.toContain(diagnostic);
    }
    const r = report();
    r.filingDisclosures = d;
    const audit = reportToAuditMarkdown(r);
    for (const diagnostic of ["could not be read as rows", "Earnings inspection limited", "Amounts printed with"]) expect(audit).toContain(diagnostic);
  });

  it("summarizes per-cell trend derivations for readers and keeps them in full in the audit export", () => {
    const d = buildFilingDisclosures(completeCurrencyBundle({}))!;
    const base = d.quarterlyTrend[0]!;
    d.quarterlyTrend = [
      { ...base, periodEnd: "2026-06-30", fiscalLabel: null, freeCashFlow: null, revenueGrowthNotes: [
        "YoY at 2026-06-30 uses filed revenue 225588000 / 106077000 USD from the current filing's comparative presentation; no vendor operand enters the rate.",
        "QoQ at 2026-06-30 uses filed revenue 225588000 / 167007000 USD on the canonical filed presentation; no vendor operand enters the rate.",
      ] },
      { ...base, periodEnd: "2026-03-31", fiscalLabel: null, freeCashFlow: null, revenueGrowthNotes: ["YoY not shown: quarterly revenue operands use different sources and no common filed presentation is established."] },
    ];
    d.notes = [
      "Quarterly operating cash flow for 2026-06-30 is derived (ytd-difference) from cumulative filed operands across filings: 10-Q 0001628280-26-057061, filed 2026-08-14; 10-Q 0002064124-26-000029, filed 2026-05-15. The canonical filing-lineage rule admits this derivation; it is not a directly filed standalone quarter.",
      "Quarterly operating cash flow for 2025-12-31 is derived (fy-minus-ytd) from cumulative filed operands across filings: 10-K 0002064124-26-000009, filed 2026-03-16; 10-Q 0002064124-25-000032, filed 2025-11-13. The canonical filing-lineage rule admits this derivation; it is not a directly filed standalone quarter.",
      "Operating expenses not shown for 2024-06-30: the quarters shown mix rows built from SEC filings with provider rows; one column cannot state one basis.",
    ];
    const note = filingDisclosureTables(d, "fundamentals")[0]!.note!;
    expect(note).not.toContain("uses filed revenue");
    expect(note).not.toContain("canonical filing-lineage rule");
    expect(note).toContain("no vendor figure enters a rate");
    expect(note).toContain("Quarterly operating cash flow for 2026-06-30 and 2025-12-31 is derived as a difference of cumulative filed amounts");
    expect(note).toContain("YoY not shown: quarterly revenue operands use different sources");
    expect(note).toContain("Operating expenses not shown for 2024-06-30");
    const r = report();
    r.filingDisclosures = d;
    const audit = reportToAuditMarkdown(r);
    expect(audit).toContain("YoY at 2026-06-30 uses filed revenue");
    expect(audit).toContain("The canonical filing-lineage rule admits this derivation");
  });

  it("prints a grade contract only when it changed the outcome, and lists every contract in the audit export", () => {
    const r = report();
    r.fundamentals.graded.gradeContract = { version: "GRADE_OVERRIDE_1", originalBand: "A", proposedGrade: "A", distance: 0, status: "unchanged", reason: "matches-deterministic-band" };
    r.quality.graded.gradeContract = { version: "GRADE_OVERRIDE_1", originalBand: null, proposedGrade: "C", distance: null, status: "unavailable", reason: "no-deterministic-band" };
    for (const text of surfaces(r)) {
      expect(text).not.toContain("matches-deterministic-band");
      expect(text).not.toContain("no-deterministic-band");
    }
    const audit = reportToAuditMarkdown(r);
    expect(audit).toContain("## Grade contracts");
    expect(audit).toContain("matches-deterministic-band");
    expect(audit).toContain("no-deterministic-band");
    // A refused override still explains the withheld letter in the reader:
    // tests/stageC.gradeContract.test.ts covers that through the real contract.
  });
});

describe("A2-26: macro series", () => {
  it("names a transformed series by what it measures and dates monthly observations by month", () => {
    const r = report();
    r.macro.relevantSeries = [
      { seriesId: "CPILFESL", name: "Core consumer price index (excluding food and energy)", relevance: "The inflation path shapes the outlook for policy and long rates.",
        latest: figure("payload.macro.cpilfesl-core", 2.5658, "%", "2026-09-01") },
      { seriesId: "DGS10", name: "10-year Treasury yield", relevance: "Discount rates.", latest: figure("payload.macro.dgs10-core", 4.1, "%", "2026-10-29") },
    ];
    const rows = macroDisplayRows(r.macro);
    expect(rows.map(s => [s.name, s.observation])).toEqual([
      ["Core CPI inflation (excluding food and energy), year over year", "Sep 2026"],
      ["10-year Treasury yield", "2026-10-29"],
    ]);
    for (const text of surfaces(r)) {
      expect(text).toContain("Core CPI inflation (excluding food and energy), year over year");
      expect(text).toContain("Sep 2026");
    }
  });
});

describe("A2-02: SBC basis in reader labels", () => {
  it("labels the SBC-to-revenue ratio with its cash-flow add-back basis", () => {
    expect(metricLabel("computed.capital-cash.sbc-revenue")).toBe("SBC (cash-flow add-back) as % of revenue (latest fiscal year)");
  });
  // R9 names the basis in the registry ids of future reports; each reads as its basis, not run-together words.
  it.each([
    ["computed.capital-cash.sbc-cash-flow-add-back-revenue", "SBC (cash-flow add-back) as % of revenue (latest fiscal year)"],
    ["computed.capital-cash.sbc-cash-flow-add-back-fcf", "SBC (cash-flow add-back) as % of FCF (latest fiscal year)"],
    ["computed.current-capital.sbc-cash-flow-add-back", "SBC (cash-flow add-back)"],
    ["computed.current-capital.sbc-allocated-expense", "SBC (allocated expense)"],
    ["computed.capital.current.allocatedSbcExpense", "SBC (allocated expense)"],
    ["computed.current-capital.sbc-cash-flow-add-back-filed-prior-year-ytd-operand-sharebasedcompensation", "SBC (cash-flow add-back) (filed prior-year year-to-date operand)"],
    ["computed.current-capital.sbc-allocated-expense-filed-fiscal-year-operand-allocatedsharebasedcompensationexpense", "SBC (allocated expense) (filed fiscal-year operand)"],
    ["computed.current-capital.capitalexpenditure-filed-current-ytd-operand-paymentstodevelopsoftware", "Capital expenditure (filed current year-to-date operand)"],
    ["computed.current-capital.stockbasedcompensation-filed-fiscal-year-operand-sharebasedcompensation", "Stock-based compensation (filed fiscal-year operand)"],
    ["payload.statements.cash-flow-annual.2025-12-31.sbc-cash-flow-add-back", "SBC (cash-flow add-back) (year ended 2025-12-31)"],
    ["payload.statements.cash-flow-quarterly.2026-06-30.sbc-cash-flow-add-back", "SBC (cash-flow add-back) (quarter ended 2026-06-30)"],
    ["payload.filing-facts.sbc-allocated-expense-2026-04-01-to-2026-06-30", "SBC (allocated expense), 2026-04-01 to 2026-06-30"],
    ["payload.filing-facts.sbc-cash-flow-add-back-2025-01-01-to-2025-12-31", "SBC (cash-flow add-back), 2025-01-01 to 2025-12-31"],
  ])("labels %s by its basis", (id, label) => {
    expect(metricLabel(id)).toBe(label);
  });
});
