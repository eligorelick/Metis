import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { dedupeFigureRows, figureRow, keyDataRows, metricLabel, plainFieldNames } from "@/report/presentation";
import { prepareReportForSurface } from "@/report/readerPreparation";
import { COMPANY_RECORD_PREFIX, companyRecordText, executiveCardClaims } from "@/report/executiveDecisions";
import { claimStatusMark, indexVerificationMarks } from "@/report/verificationMarks";
import {
  CONFIRMED_SHARE_DEFINITION, DATA_ONLY_STATEMENTS_TEXT, SUPPORT_BLOCK_HEADING, SUPPORT_LEVELS,
  confirmedShareText, confirmedStatementShare, supportLevel, supportLevelText,
} from "@/report/supportLevel";
import { ReportSchema, type FairValue, type Report, type SourcedClaim, type TracedNumber, type VerificationLogEntry } from "@/report/schema";
import type { FilingDisclosures } from "@/report/schema";
import { DCF_TAX_OPERANDS_FIELD } from "@/report/supportLevel";
import { REPORT_SPEC_VERSION, TAX_OPERAND_EVIDENCE_SINCE_SPEC } from "@/report/versions";
import { loadTask28Fixture } from "./helpers/task28Report";
import { readableHtml } from "./helpers/uiParityContract";

// Release brief W45 (D-300..D-303). Synthetic shapes only; every name is invented.
const source = "edgar:10-K item1";
const asOf = "2026-02-20";
const fact = (text: string, label: SourcedClaim["label"] = "FACT"): SourcedClaim => ({ text, label, source, asOf });

function logEntry(report: Report, path: string, status: NonNullable<VerificationLogEntry["validationStatus"]>): void {
  const node = path.split(/\.|\[(\d+)\]/).filter(Boolean).reduce<unknown>((at, key) => (at as Record<string, unknown>)[key], report) as SourcedClaim;
  (report.appendix.verificationLog ??= []).push({
    claim: node.text, outcome: status === "validated" || status === "cited" ? "verified" : "unverified",
    validationStatus: status, path, evidenceKind: "factual-claim", source,
  });
}

/** A current, available general-route value unless the patch says otherwise. */
const fairValue = (patch: Partial<FairValue>): FairValue => ({
  status: "available", method: "fcff-dcf", methodVersion: "FAIR_VALUE_TEST", upsidePct: 5, basis: [], reasons: [],
  perShare: { value: 48, unit: "usd", source: "computed.valuation.dcf.perShare", asOf: "2025-12-31", verified: true },
  currentUse: { status: "current", statementDate: "2025-12-31", valueDate: "2026-01-15", quoteDate: "2026-01-15", reason: "same-date" },
  ...patch,
} as FairValue);

/**
 * Review round 1 (D-300): full support needs recorded evidence. The task-28 fixture predates the grade
 * qualification and the typed tax-operand entry, so tests that mean "no limitation" record both: a
 * supported qualification and a current report stamp.
 */
function recorded(report: Report): Report {
  report.meta.specVersion = REPORT_SPEC_VERSION;
  withoutSyntheticValuationGap(report);
  const aspects = Object.fromEntries(["fundamentals", "valuation", "quality", "balanceSheet", "moat", "leadership", "technicals"].map(key => [key, { status: "supported", reasons: [] }]));
  report.scores = { ...report.scores, qualification: { aspects, composite: { status: "supported", reasons: [] } } } as unknown as Report["scores"];
  return report;
}

/**
 * D-309 review round 1: the demo fixture carries one synthetic `valuation.cet1Ratio` data-gap entry, a valuation
 * input gap that now limits support by itself. Tests that mean "no other limitation" remove only that entry.
 */
function withoutSyntheticValuationGap<T extends Pick<Report, "appendix">>(report: T): T {
  report.appendix.missingData = report.appendix.missingData.filter(gap => gap.field !== "valuation.cet1Ratio");
  return report;
}

const surfaces = (report: Report) => [
  reportToMarkdown(report),
  readableHtml(reportToPrintBody(report)).text,
  readableHtml(renderToStaticMarkup(createElement(ReportView, { report }))).text,
];

describe("support level (D-300, R40)", () => {
  it("is full support for a general-route report with no typed limitation, on every surface near the top", () => {
    const report = recorded(ReportSchema.parse({ ...loadTask28Fixture(), fairValue: fairValue({}) }));
    expect(supportLevel(report)).toMatchObject({ level: "full", limitations: [] });
    for (const text of surfaces(report)) {
      expect(text).toContain(SUPPORT_BLOCK_HEADING);
      expect(text).toContain(`${SUPPORT_LEVELS.full.label}.`);
      const block = text.indexOf(SUPPORT_BLOCK_HEADING);
      // Near the top: before the first section heading and before the key-data box.
      expect(block).toBeLessThan(text.search(/Key data/i) < 0 ? Infinity : text.search(/Key data/i));
    }
  });

  it("names the bank route, a route without a per-share value and 6-K vendor interims (three filer shapes)", () => {
    const bank = loadTask28Fixture();
    bank.fairValue = fairValue({ method: "excess-return" });
    bank.routeMetrics = { route: "bank", metrics: [], notes: [], asOf: null };
    expect(supportLevelText(supportLevel(recorded(ReportSchema.parse(bank))))).toBe(
      "Limited support: bank route: valued on book value and excess returns on equity; cash-flow and invested-capital measures (free-cash-flow valuation, ROIC) do not apply.");

    const reit = loadTask28Fixture();
    reit.fairValue = fairValue({ status: "suppressed", method: null, perShare: null, upsidePct: null,
      currentUse: { status: "not-applicable", statementDate: null, valueDate: null, quoteDate: null, reason: "route-policy" } });
    expect(supportLevel(recorded(ReportSchema.parse(reit))).limitations.map(item => item.code)).toEqual(["route-no-per-share-value"]);

    const foreign = loadTask28Fixture();
    foreign.fairValue = fairValue({});
    foreign.appendix.missingData.push({ field: "statements.foreignInterim", reason: "any wording", severity: "info" });
    expect(supportLevel(recorded(ReportSchema.parse(foreign))).limitations.map(item => item.text)).toEqual(["interim figures from Form 6-K are vendor data not checked against a filing"]);
  });

  it("reads P12 qualifications and critical filing gaps by code and field, never by wording (P11)", () => {
    const report = withoutSyntheticValuationGap(loadTask28Fixture());
    report.fairValue = fairValue({ status: "suppressed", method: null, perShare: null, upsidePct: null,
      currentUse: { status: "unestablished", statementDate: null, valueDate: null, quoteDate: null, reason: "model-unavailable" } });
    report.appendix.missingData.push(
      { field: "edgar.latestTenK(EXMP)", reason: "x", severity: "critical" },
      // Control: wording that names a 6-K or a predecessor, on another field, changes nothing.
      { field: "business.note", reason: "Interim figures from Form 6-K are vendor data; the predecessor filed them.", severity: "warn" },
      // Control: an expected critical gap is a disclosure, not a missing filing.
      { field: "edgar.mdna(EXMP)", reason: "x", severity: "critical", expected: true },
    );
    const parsed = ReportSchema.parse(report);
    parsed.scores = { qualification: { aspects: {}, composite: { status: "provisional", reasons: [
      { code: "financial-evidence-blocked", aspect: "valuation", field: "returns.wacc.weights", detail: "free text" },
      { code: "limited-applicable-evidence", aspect: "moat", field: "scores.aspects.moat", detail: "free text" },
    ] } } } as unknown as Report["scores"];
    expect(supportLevel(parsed).limitations.map(item => item.code)).toEqual(["fair-value-withheld", "headline-input-withheld", "grade-evidence-limited", "filing-not-retrieved"]);
    expect(supportLevelText(supportLevel(parsed))).toContain("the moat grade rests on limited evidence");
    expect(supportLevelText(supportLevel(parsed))).toContain("the latest annual report (10-K); statements that need it are not covered");
  });

  it("review round 1: unchecked tax-rate operands, a saved report that does not record them, and unrecorded grade evidence are never full support", () => {
    // The typed manifest entry Stage B writes; its wording is not read.
    const vendorTax = recorded(ReportSchema.parse({ ...loadTask28Fixture(), fairValue: fairValue({}) }));
    vendorTax.appendix.missingData.push({ field: DCF_TAX_OPERANDS_FIELD, reason: "any wording", severity: "info" });
    expect(supportLevel(vendorTax)).toMatchObject({ level: "limited", limitations: [{ code: "tax-operands-vendor",
      text: "the tax rate of the cash-flow valuation uses provider tax and pre-tax income figures not checked against a filing" }] });
    // Control: the same wording on another field is not read as the tax-operand entry. D-309 review round 1: a
    // valuation-input field limits support by its own typed line, and a non-headline field not at all.
    const control = recorded(ReportSchema.parse({ ...loadTask28Fixture(), fairValue: fairValue({}) }));
    control.appendix.missingData.push({ field: "valuation.dcf.note", reason: "Tax rate operands: vendor data, not checked against a filing", severity: "info" });
    expect(supportLevel(control).limitations.map(item => item.code)).toEqual(["headline-input-qualified"]);
    const otherField = recorded(ReportSchema.parse({ ...loadTask28Fixture(), fairValue: fairValue({}) }));
    otherField.appendix.missingData.push({ field: "business.note", reason: "Tax rate operands: vendor data, not checked against a filing", severity: "info" });
    expect(supportLevel(otherField).level).toBe("full");
    // A saved report from before the entry existed does not record which; a cash-flow fair value is then not full support.
    const saved = recorded(ReportSchema.parse({ ...loadTask28Fixture(), fairValue: fairValue({}) }));
    saved.meta.specVersion = "1.97.0";
    expect(TAX_OPERAND_EVIDENCE_SINCE_SPEC).toBe("1.98.0");
    expect(supportLevel(saved).limitations.map(item => item.code)).toEqual(["tax-evidence-not-recorded"]);
    // ...but a saved excess-return report has no tax-rate input to record.
    const savedBank = recorded(ReportSchema.parse({ ...loadTask28Fixture(), fairValue: fairValue({ method: "excess-return" }) }));
    savedBank.meta.specVersion = "1.97.0";
    expect(supportLevel(savedBank).limitations.map(item => item.code)).toEqual(["financial-route"]);
    // A grade with no recorded qualification, or one marked unknown, is not shown to be supported.
    const legacy = withoutSyntheticValuationGap(ReportSchema.parse({ ...loadTask28Fixture(), fairValue: fairValue({}) }));
    legacy.meta.specVersion = REPORT_SPEC_VERSION;
    expect(legacy.scores?.qualification).toBeUndefined();
    expect(supportLevel(legacy).limitations.map(item => item.code)).toEqual(["grade-qualification-not-recorded"]);
    // Grades with no applicable evidence are named by their typed aspect, grouped once.
    const missing = recorded(ReportSchema.parse({ ...loadTask28Fixture(), fairValue: fairValue({}) }));
    missing.scores = { ...missing.scores, qualification: { aspects: {}, composite: { status: "provisional", reasons: [
      { code: "missing-applicable-aspect", aspect: "moat", field: "scores.aspects.moat", detail: "free text" },
      { code: "missing-applicable-aspect", aspect: "leadership", field: "scores.aspects.leadership", detail: "free text" },
      { code: "current-valuation-unavailable", aspect: "valuation", field: "valuation.currentUse", detail: "free text" },
    ] } } } as unknown as Report["scores"];
    expect(supportLevelText(supportLevel(missing))).toBe("Limited support: the valuation is not established as current at the quote date; the moat and leadership grades have no evidence that applies on this company's route.");
  });

  it("states the confirmed share from typed marks: validated FACT/ESTIMATE over all shown, repeats once, judgments and audit-only text excluded", () => {
    const report = loadTask28Fixture();
    report.appendix.verificationLog = [];
    report.business.whatTheySell = [fact("The company sells pumps."), fact("Pump revenue was $1.0 billion."), fact("Pumps are the best.", "JUDGMENT")];
    report.business.concentrationRisks = [fact("The company sells pumps."), fact("Distributors buy 40% of units.", "ESTIMATE")];
    logEntry(report, "business.whatTheySell[1]", "validated");
    logEntry(report, "business.whatTheySell[0]", "cited");
    // The repeat carries the same mark, so it is the same statement (review round 1: the identity includes the mark).
    logEntry(report, "business.concentrationRisks[0]", "cited");
    logEntry(report, "business.concentrationRisks[1]", "unchecked");
    const parsed = ReportSchema.parse(report);
    const { report: shown } = prepareReportForSurface(parsed, "markdown");
    const share = confirmedStatementShare(shown);
    // Every other FACT/ESTIMATE in the fixture counts too; the three distinct new ones add 3, one validated.
    const baseline = (() => { const r = loadTask28Fixture(); r.business.whatTheySell = []; r.business.concentrationRisks = [];
      return confirmedStatementShare(prepareReportForSurface(ReportSchema.parse(r), "markdown").report); })();
    expect(share.total - baseline.total).toBe(3);
    expect(share.confirmed - baseline.confirmed).toBe(1);
    expect(confirmedShareText(shown, true)).toMatch(/^\d+ of \d+ distinct statements were confirmed against their records by code \(\d+(?:\.\d)?%\); a statement repeated in another section counts once\.$/);
    // A data-only report has no AI-written statements to count.
    expect(confirmedShareText(shown, false)).toBe(DATA_ONLY_STATEMENTS_TEXT);
    for (const text of surfaces(parsed)) {
      // Markdown escapes the brackets of "[validated]"; the definition's opening words read the same everywhere.
      expect(text).toContain(CONFIRMED_SHARE_DEFINITION.slice(0, CONFIRMED_SHARE_DEFINITION.indexOf(" (its")));
      expect(text).not.toMatch(/statements were confirmed[^.]*citation/i);
    }
  });

  it("uses distinct reader identity for redundant citation fields and officer wording (D-311)", () => {
    const report = loadTask28Fixture();
    report.appendix.verificationLog = [];
    report.business.whatTheySell = [fact("The company sells pumps.")];
    report.business.concentrationRisks = [{ ...fact("The company sells pumps."), sourceId: source }];
    logEntry(report, "business.whatTheySell[0]", "validated");
    logEntry(report, "business.concentrationRisks[0]", "validated");
    const shown = prepareReportForSurface(ReportSchema.parse(report), "markdown").report;
    expect(confirmedStatementShare(shown).confirmed).toBe(1);
    // Control: another visible date is a different statement.
    report.business.concentrationRisks[0]!.asOf = "2025-02-20";
    expect(confirmedStatementShare(prepareReportForSurface(ReportSchema.parse(report), "markdown").report).confirmed).toBe(2);
  });

  it("review round 1: a validated and a contradicted copy of the same words are two statements, one confirmed", () => {
    const build = (second: "validated" | "contradicted") => {
      const report = loadTask28Fixture();
      report.appendix.verificationLog = [];
      report.business.whatTheySell = [fact("Pump revenue was $1.0 billion.")];
      report.business.concentrationRisks = [fact("Pump revenue was $1.0 billion.")];
      logEntry(report, "business.whatTheySell[0]", "validated");
      logEntry(report, "business.concentrationRisks[0]", second);
      const shown = prepareReportForSurface(ReportSchema.parse(report), "markdown").report;
      expect(claimStatusMark(shown.business.concentrationRisks[0]!)).toBe(second);
      return confirmedStatementShare(shown);
    };
    const same = build("validated"), split = build("contradicted");
    // Same mark: one statement, confirmed once. Different mark: two statements, and the contradicted one is not confirmed.
    expect(split.total - same.total).toBe(1);
    expect(split.confirmed).toBe(same.confirmed);
  });

  it("identifies contradicted statements by their displayed tag (D-311)", () => {
    const report = loadTask28Fixture();
    report.appendix.verificationLog = [];
    report.business.whatTheySell = [fact("Pump revenue was $1 billion.")];
    report.business.concentrationRisks = [fact("Pump revenue was $1 billion.")];
    logEntry(report, "business.whatTheySell[0]", "contradicted");
    logEntry(report, "business.concentrationRisks[0]", "contradicted");
    const before = confirmedStatementShare(prepareReportForSurface(ReportSchema.parse(report), "markdown").report);
    report.business.concentrationRisks[0]!.label = "ESTIMATE";
    // Both surfaces call these CONTRADICTED, so the hidden original tag is not another visible statement.
    expect(confirmedStatementShare(prepareReportForSurface(ReportSchema.parse(report), "markdown").report)).toEqual(before);
  });

  it("counts only statements a reader surface prints: grade-strip reasoning is not printed (control)", () => {
    const report = loadTask28Fixture();
    const shownBefore = confirmedStatementShare(prepareReportForSurface(ReportSchema.parse(report), "markdown").report);
    const strip = Object.values(report.verdict.gradeStrip).find(block => block !== undefined)!;
    strip.reasoning = [...strip.reasoning, fact("A statement only the grade strip holds.")];
    const after = confirmedStatementShare(prepareReportForSurface(ReportSchema.parse(report), "markdown").report);
    expect(after.total).toBe(shownBefore.total);
    expect(reportToMarkdown(ReportSchema.parse(report))).not.toContain("A statement only the grade strip holds.");
  });

  it("does not count an ESTIMATE on a fully not-assessed officer, which no surface prints (review round 1)", () => {
    const report = loadTask28Fixture();
    for (const e of report.leadership.executives) { e.grade = "not-assessed"; e.credibilityGrade = "not-assessed"; }
    const before = confirmedStatementShare(prepareReportForSurface(ReportSchema.parse(report), "markdown").report);
    report.leadership.executives[0]!.reasoning = [...report.leadership.executives[0]!.reasoning, fact("Margins will likely widen next year.", "ESTIMATE")];
    const parsed = ReportSchema.parse(report);
    expect(confirmedStatementShare(prepareReportForSurface(parsed, "markdown").report).total).toBe(before.total);
    expect(reportToMarkdown(parsed)).not.toContain("Margins will likely widen next year.");
    // Control: a graded officer's ESTIMATE is printed and counted.
    report.leadership.executives[0]!.grade = "B";
    expect(confirmedStatementShare(prepareReportForSurface(ReportSchema.parse(report), "markdown").report).total).toBe(before.total + 1);
  });

  it("describes a model-domain failure as a model limit, not missing evidence (review round 1)", () => {
    const domain = loadTask28Fixture();
    domain.fairValue = fairValue({ status: "outside-domain", method: null, perShare: null, upsidePct: null });
    const text = supportLevelText(supportLevel(ReportSchema.parse(domain)));
    expect(text).toContain("falls outside the range it is valid for");
    expect(text).not.toContain("an input could not be established");
  });

  it("never counts a figure's citation as a confirmed statement", () => {
    const report = loadTask28Fixture();
    report.appendix.verificationLog = [];
    report.business.whatTheySell = [fact("Cited only.")];
    logEntry(report, "business.whatTheySell[0]", "cited");
    const shown = prepareReportForSurface(ReportSchema.parse(report), "markdown").report;
    const before = confirmedStatementShare(shown);
    expect(claimStatusMark(shown.business.whatTheySell[0]!)).toBe("qualitative");
    expect(before.confirmed).toBe(0);
    expect(before.total).toBeGreaterThan(0);
  });
});

describe("one figure shown once (D-301, R29)", () => {
  const ratio = (source: string, extra: Partial<TracedNumber> = {}): TracedNumber => ({ value: 937.2, unit: "x", source, sourceId: source, asOf: "2026-09-03", verified: true, ...extra } as TracedNumber);

  // Review round 2 (lead decision): strict. Rows merge only on an identical underlying value, metric (same source or
  // registered alias), window, basis and verification mark; a window is never inferred and a failed mark never dropped.
  const pair = (a: TracedNumber, b: TracedNumber) => dedupeFigureRows([figureRow(a), figureRow(b)]).length;
  const accrual = (source: string, extra: Partial<TracedNumber> = {}) =>
    ratio(source, { value: 0.1821367793673119, period: "2025-12-31", asOf: "2025-12-31", ...extra });

  it("keeps a contradicted AI copy beside the checked code figure (the reviewer's repro), in either order", () => {
    const code = figureRow(accrual("computed.forensics.accruals.cashFlowAccrualRatio"));
    const ai = { ...figureRow(accrual("computed.forensics.accrual-ratio-cash-flow", { value: 0.18214, period: undefined, verified: false })), cited: "contradicted" };
    expect(code.cited).toBe("✓");
    expect(code.value).toBe(ai.value); // both print "18%"
    for (const rows of [dedupeFigureRows([code, ai]), dedupeFigureRows([ai, code])]) {
      expect(rows.map(row => [row.trace.value, row.cited, row.period]).sort()).toEqual(
        [[0.1821367793673119, "✓", "2025-12-31"], [0.18214, "contradicted", null]].sort());
    }
    // Same value, window and basis, but a different mark: still two rows.
    const sameValueContradicted = { ...figureRow(accrual("computed.forensics.accrual-ratio-cash-flow")), cited: "contradicted" };
    expect(dedupeFigureRows([code, sameValueContradicted]).map(row => row.cited)).toEqual(["✓", "contradicted"]);
    const unconfirmed = { ...figureRow(accrual("computed.forensics.accrual-ratio-cash-flow")), cited: "not confirmed" };
    expect(dedupeFigureRows([unconfirmed, code]).map(row => row.cited)).toEqual(["not confirmed", "✓"]);
  });

  it("merges registered aliases only when value, window, basis and mark are all identical (control)", () => {
    const rows = dedupeFigureRows([
      figureRow(accrual("computed.forensics.accruals.cashFlowAccrualRatio")),
      figureRow(accrual("computed.forensics.accrual-ratio-cash-flow")),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.trace.source).toBe("computed.forensics.accruals.cashFlowAccrualRatio");
    expect(pair(ratio("computed.current-capital.interest-coverage", { value: 937.21, period: "ttm: 2025-08-29 to 2026-09-03" }),
      ratio("computed.capital.current.interestCoverage", { value: 937.21, period: "ttm: 2025-08-29 to 2026-09-03" }))).toBe(1);
  });

  it("never infers a window, never rounds a value and never merges different definitions (controls)", () => {
    // An omitted window is not the window ending on the shared date (D-264's omitted-period merge is retired).
    expect(pair(ratio("computed.current-capital.interest-coverage"), ratio("computed.capital.current.interestCoverage", { period: "ttm: 2025-08-29 to 2026-09-03" }))).toBe(2);
    expect(pair(ratio("computed.current-capital.interest-coverage", { period: undefined }), ratio("computed.capital.current.interestCoverage", { period: "2026-09-03" }))).toBe(2);
    expect(pair(ratio("computed.current-capital.interest-coverage"), ratio("computed.capital.current.interestCoverage", { period: "ttm: 2025-06-01 to 2026-05-31" }))).toBe(2);
    // Equal display text is not an equal figure: 937.21x and 937.24x both print "937.2x"; a four-decimal copy is another value.
    expect(pair(ratio("computed.current-capital.interest-coverage", { value: 937.21 }), ratio("computed.capital.current.interestCoverage", { value: 937.24 }))).toBe(2);
    expect(pair(accrual("computed.forensics.accruals.cashFlowAccrualRatio"), accrual("computed.forensics.accrual-ratio-cash-flow", { value: 0.1821 }))).toBe(2);
    expect(pair(ratio("computed.current-capital.net-debt-to-ebitda", { value: -0.4 }), ratio("computed.capital.current.interestCoverage", { value: -0.4 }))).toBe(2);
    // Equal values under different definitions never merge: statement total debt vs the lease-inclusive bridge.
    expect(pair({ value: 49.5e9, unit: "currency", currency: "USD", source: "payload.statements.balance-sheet-quarterly.2026-09-30.total-debt", asOf: "2026-09-30", period: "2026-09-30", verified: true } as TracedNumber,
      { value: 49.5e9, unit: "currency", currency: "USD", source: "computed.capital.current.debtBridge.totalDebtIncludingLeases", asOf: "2026-09-30", period: "2026-09-30", verified: true } as TracedNumber)).toBe(2);
    // A currency amount needs the same recorded currency.
    expect(pair({ value: 5e9, unit: "currency", currency: "USD", source: "computed.current-capital.net-debt", asOf: "2026-09-30", verified: true } as TracedNumber,
      { value: 5e9, unit: "currency", currency: null, source: "computed.capital.current.netDebt", asOf: "2026-09-30", verified: true } as TracedNumber)).toBe(2);
  });

  it("labels the statement field cash-sti in plain words on every statement table", () => {
    for (const id of ["payload.statements.balance-sheet-quarterly.2026-09-30.cash-sti", "payload.statements.balance-sheet-annual.2025-12-31.cash-sti"]) {
      expect(metricLabel(id, "currency")).toMatch(/^Cash and short-term investments \(at \d{4}-\d{2}-\d{2}\)$/);
    }
  });

  it("shows one issuer FCF figure stated in two exhibits of one filing once, and keeps different filings apart", () => {
    const ref = (exhibit: string, accession = "0000000000-26-000001") => ({ accession, exhibit, filingDate: "2026-08-26", form: "8-K", url: "https://example.invalid/x.htm" });
    const d = { currency: "USD", freeCashFlow: [
      { periodEnd: "2026-07-26", months: 3, value: 2.1e9, source: ref("EX-99.1") },
      { periodEnd: "2026-07-26", months: 3, value: 2.1e9, source: ref("EX-99.2") },
      { periodEnd: "2026-04-26", months: 3, value: 1.9e9, source: ref("EX-99.1") },
      { periodEnd: "2026-04-26", months: 3, value: 1.9e9, source: ref("EX-99.1", "0000000000-26-000002") },
    ], capitalReturn: null, dividends: undefined } as unknown as FilingDisclosures;
    const rows = filingDisclosureTables({ ...emptyDisclosures(), ...d }, "fundamentals").flatMap(table => table.rows).filter(row => /^Free cash flow \(issuer definition\)/.test(row[0]!));
    expect(rows).toHaveLength(3);
    expect(rows[0]![2]).toBe("8-K EX-99.1 and EX-99.2 filed 2026-08-26 (0000000000-26-000001)");
    expect(rows.filter(row => row[0]!.includes("2026-04-26"))).toHaveLength(2);
  });

  it("gives raw statement field names plain labels in recorded reasons, leaving identifiers inside citations alone", () => {
    expect(plainFieldNames("4 field(s) in 1 vendor row(s) (2021-12-31 … 2021-12-31; eps, epsDiluted, weightedAverageShsOut, weightedAverageShsOutDil) withheld"))
      .toBe("4 field(s) in 1 vendor row(s) (2021-12-31 … 2021-12-31; basic EPS, diluted EPS, basic weighted share count, diluted weighted share count) withheld");
    expect(plainFieldNames("Vendor flows kept unverified for 2016-12-31: depreciationAndAmortization, changeInWorkingCapital."))
      .toBe("Vendor flows kept unverified for 2016-12-31: depreciation and amortization, change in working capital.");
    for (const kept of ["us-gaap/EarningsPerShareDiluted", "edgar:companyfacts/us-gaap/LongTermDebtNoncurrent", "computed.capital.current.netDebt", "fmp:netDebt", "statements.netDebt.cashBasis", "The EPS rose."]) expect(plainFieldNames(kept)).toBe(kept);
  });

  it("formats raw base-unit amounts in key-data caveats with the shared number format", () => {
    const report = loadTask28Fixture();
    const rows = keyDataRows(ReportSchema.parse(report));
    for (const row of rows) if (row.note) expect(row.note).not.toMatch(/(?<![\d.])[1-9]\d{9,}(?![\d.])/);
  });
});

describe("company record during an officer's tenure (D-302, R35)", () => {
  it("rewrites a card statement that opens with the card officer's name, for full and short spellings", () => {
    expect(companyRecordText("Andrea Q. Example", "Andrea Q. Example: operating cash flow for FY2026 was USD 10.0 billion."))
      .toBe(`${COMPANY_RECORD_PREFIX}operating cash flow for FY2026 was USD 10.0 billion.`);
    expect(companyRecordText("Morgan Lee Example", "Morgan Example: return on invested capital for FY2025 was 12.0%."))
      .toBe(`${COMPANY_RECORD_PREFIX}return on invested capital for FY2025 was 12.0%.`);
  });

  it("keeps the officer's name in a list that pools several officers' statements", () => {
    expect(companyRecordText("Morgan Lee Example", "Morgan Example: free cash flow for the quarter was USD 1.0 billion.", "named"))
      .toBe("Company record during the tenure of Morgan Example: free cash flow for the quarter was USD 1.0 billion.");
    const report = loadTask28Fixture();
    for (const e of report.leadership.executives) { e.grade = "not-assessed"; e.credibilityGrade = "not-assessed"; }
    const exec = report.leadership.executives[1]!;
    // Control: compensation describes the person and keeps its wording.
    exec.evidence = { capitalAllocation: [fact(`${exec.name}: revenue for FY2025 was USD 3.000 billion.`)], compensation: [fact(`${exec.name}: base salary was USD 1.0 million.`)] };
    for (const text of surfaces(ReportSchema.parse(report))) {
      expect(text).toContain(`${exec.name}: base salary was USD 1.0 million.`);
      expect(text).not.toContain(`tenure of ${exec.name}: base salary`);
      expect(text).toContain(`Company record during the tenure of ${exec.name}: revenue for FY2025`);
      // Every occurrence of the officer-prefixed sentence is the company-record form.
      expect(text.split(`${exec.name}: revenue for FY2025`).length).toBe(text.split(`tenure of ${exec.name}: revenue for FY2025`).length);
    }
  });

  it("leaves other statements alone (controls: another person, a one-word label, no prefix)", () => {
    for (const text of ["Jordan Other: operating cash flow was USD 1.0 billion.", "Cloud: revenue was USD 1.0 billion.", "Operating cash flow was USD 1.0 billion."]) {
      expect(companyRecordText("Morgan Lee Example", text)).toBe(text);
    }
  });

  it("keeps the statement's verification mark through the reader copy, on every surface", () => {
    const report = loadTask28Fixture();
    report.appendix.verificationLog = [];
    const exec = report.leadership.executives[0]!;
    exec.evidence = { capitalAllocation: [fact(`${exec.name}: operating cash flow for FY2025 was USD 2.000 billion.`)] };
    logEntry(report, "leadership.executives[0].evidence.capitalAllocation[0]", "validated");
    const parsed = ReportSchema.parse(report);
    indexVerificationMarks(parsed);
    const [shown] = executiveCardClaims(parsed.leadership.executives[0]!, parsed.leadership.executives[0]!.evidence.capitalAllocation!);
    expect(shown!.text).toBe(`${COMPANY_RECORD_PREFIX}operating cash flow for FY2025 was USD 2.000 billion.`);
    expect(claimStatusMark(shown!)).toBe("validated");
    // The stored claim is unchanged (P21).
    expect(parsed.leadership.executives[0]!.evidence.capitalAllocation![0]!.text).toMatch(/^Morgan Example: /);
    for (const text of surfaces(parsed)) {
      expect(text).toContain("Company record during this tenure: operating cash flow for FY2025");
      expect(text).not.toContain(`${exec.name}: operating cash flow`);
    }
  });
});

describe("README support levels (D-300, R41)", () => {
  it("states the same two levels the reports print", () => {
    const readme = readFileSync("README.md", "utf8");
    for (const level of Object.values(SUPPORT_LEVELS)) {
      expect(readme).toContain(level.label);
      expect(readme).toContain(level.definition);
    }
  });
});

function emptyDisclosures(): FilingDisclosures {
  return {
    version: "test", currency: "USD", currencyBasis: null, guidance: null, guidanceChecks: [], freeCashFlow: [], freeCashFlowDefinition: null,
    capitalReturn: null, events: [], segments: null, quarterlyTrend: [], reconciliation: null, commitments: [], notes: [],
  } as unknown as FilingDisclosures;
}
