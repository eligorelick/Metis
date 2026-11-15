import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { applyFinancialDiagnostics } from "@/report/financialDiagnostics";
import { unavailableLiquidityTable } from "@/report/presentation";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { BalanceSheetSection } from "@/components/report/sections";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import { describe, expect, it } from "vitest";
import * as assessment from "@/report/assessment";
import { runStageB } from "@/pipeline/compute";
import { ScoreAspectSchema, judgeOutputToJsonSchema, type GradeBlock, type Scoring } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { currentValuationUseFixture, unavailableValuationUseFixture } from "./helpers/valuationUse";
import { task28SentinelReport } from "./helpers/task28Report";

function fullyObserved(): Scoring {
  const scores = structuredClone(runStageB(completeCurrencyBundle({})).scores);
  for (const key of ScoreAspectSchema.options) Object.assign(scores.aspects[key], {
    score: 75, band: "B", weightPct: 100 / 7, dataCompleteness: 1, applicableCompleteness: 1, signals: [], notApplicableReason: null,
  });
  scores.composite.score = 75; scores.composite.band = "B";
  for (const key of ScoreAspectSchema.options) scores.composite.weights[key] = 100 / 7;
  if (scores.assessments) scores.assessments.evidenceCompleteness = 1;
  delete scores.qualification;
  return scores;
}
const qualify = (scores: Scoring, use = currentValuationUseFixture()) =>
  assessment.withAssessmentQualification(scores, { valuationUse: use, financialEvidence: [] });
const block = (): GradeBlock => ({ grade: "B", confidence: "high", oneLineWhy: "Recorded assessment", reasons: [], caveats: [] } as unknown as GradeBlock);

describe("deterministic score-neutral qualification", () => {
  it("annotates a clone without changing any score, band, signal, weight or source byte", () => {
    const source = fullyObserved(), before = JSON.stringify(source), result = qualify(source);
    expect(result.qualification?.composite).toEqual({ status: "supported", reasons: [] });
    expect(result).not.toBe(source);
    const numeric = structuredClone(result); delete numeric.qualification;
    expect(JSON.stringify(numeric)).toBe(before); expect(JSON.stringify(source)).toBe(before);
  });
  it("labels an improved grade provisional when adverse valuation evidence disappears", () => {
    const bundle = completeCurrencyBundle({});
    if (!bundle.quote.ok) throw Error("fixture quote");
    bundle.quote.value.data.rows[0]!.timestamp = Date.parse("2026-07-05T20:00:00Z") / 1000;
    const before = runStageB(bundle);
    const missing = structuredClone(bundle);
    if (!missing.quote.ok) throw Error("fixture quote");
    delete missing.quote.value.data.rows[0]!.timestamp;
    const after = runStageB(missing);
    expect(after.scores.composite.score!).toBeGreaterThan(before.scores.composite.score!);
    const annotated = qualify(after.scores, after.fairValue.currentUse!);
    expect(annotated.composite).toEqual(after.scores.composite);
    expect(annotated.qualification?.composite.status).toBe("provisional");
    expect(annotated.qualification?.composite.reasons.some(r => r.code === "current-valuation-unavailable")).toBe(true);
  });
  it("qualifies missing weighted evidence but ignores zero-weight and route-inapplicable aspects", () => {
    for (const excluded of [false, "zero", "route"] as const) {
      const scores = fullyObserved(), aspect = scores.aspects.valuation;
      Object.assign(aspect, { score: null, band: null, dataCompleteness: 0, applicableCompleteness: excluded === "route" ? null : 0 });
      if (excluded === "zero") scores.composite.weights.valuation = 0;
      const result = qualify(scores);
      expect(result.qualification?.composite.status).toBe(excluded ? "supported" : "provisional");
      expect(result.qualification?.aspects.valuation.status).toBe(excluded ? "not-applicable" : "provisional");
    }
  });
  it("does not treat 75 percent multi-signal evidence alone as provisional", () => {
    const scores = fullyObserved();
    Object.assign(scores.aspects.quality, { dataCompleteness: .75, applicableCompleteness: .75, signals: [{}, {}] });
    expect(qualify(scores).qualification?.composite.status).toBe("supported");
  });
  it("retains the single partial signal limit and the stronger grade withhold", () => {
    const scores = fullyObserved();
    Object.assign(scores.aspects.quality, { dataCompleteness: .75, applicableCompleteness: .75, signals: [{}] });
    const qualified = qualify(scores), report = task28SentinelReport(); report.scores = qualified;
    const view = assessment.applyReportAssessmentStatus(report);
    expect(qualified.qualification?.aspects.quality.status).toBe("provisional");
    expect(assessment.gradeForDisplay(view.verdict.gradeStrip.quality)).toBeNull();
  });
  it("preserves the 0.4999 evidence floor", () => {
    const scores = fullyObserved(); scores.assessments!.evidenceCompleteness = .4999;
    expect(assessment.compositeDisplayForReader(qualify(scores, unavailableValuationUseFixture)).grade).toBeNull();
  });
  it("distinguishes deliberate route policy from missing current valuation", () => {
    const scores = fullyObserved();
    expect(qualify(scores, { ...unavailableValuationUseFixture, status: "not-applicable", reason: "route-policy" }).qualification?.composite.status).toBe("supported");
    expect(qualify(scores, unavailableValuationUseFixture).qualification?.aspects.valuation.status).toBe("provisional");
  });
  it("uses structured critical blockers and the selected WACC operand, never warning prose", () => {
    const gaps = [{ field: "returns.wacc.beta", severity: "critical" as const, reason: "Exact source refusal" },
      { field: "valuation.dcf", severity: "critical" as const, reason: "Expected route", expected: true },
      { field: "statements.old", severity: "info" as const, reason: "unverified consolidated operating scope" }];
    const evidence = { status: "unverified-derivation" as const, asOf: "2025-12-31", field: "statements.income.2025-12-31.waccOperatingIncome", usedInDiscountRate: false };
    const plain = assessment.financialEvidenceQualifications(gaps, evidence);
    expect(plain).toHaveLength(1); expect(plain[0]?.detail).toBe("Exact source refusal");
    const used = assessment.financialEvidenceQualifications(gaps, { ...evidence, usedInDiscountRate: true });
    const result = assessment.withAssessmentQualification(fullyObserved(), { valuationUse: currentValuationUseFixture(), financialEvidence: used });
    expect(result.qualification?.aspects.quality.reasons.some(r => r.code === "selected-operating-scope-unverified")).toBe(true);
    expect(result.qualification?.aspects.technicals.status).toBe("supported");
  });
  it("shows provisional status and reasons without replacing the raw eligible grade", () => {
    const scores = qualify(fullyObserved(), unavailableValuationUseFixture), report = task28SentinelReport(); report.scores = scores;
    const view = assessment.applyReportAssessmentStatus(report), grade = { ...block(), qualification: scores.qualification!.aspects.valuation };
    expect(view.verdict.gradeStrip.valuation.qualification).toEqual(scores.qualification!.aspects.valuation);
    expect(view.valuation.graded.qualification).toEqual(scores.qualification!.aspects.valuation);
    expect(assessment.gradeForDisplay(grade)).toBe("B");
    expect(assessment.gradeDisplayLabel(grade)).toBe("B — Provisional");
    expect(assessment.compositeDisplayForReader(scores).label).toBe("B — Provisional");
    expect(assessment.compositeNote(scores)).toMatch(/current valuation/i);
    expect(JSON.stringify(judgeOutputToJsonSchema())).not.toContain('"qualification"');
  });
  it("marks absent legacy qualification unknown without changing recorded scores", () => {
    const report = task28SentinelReport(); report.scores = fullyObserved();
    const before = JSON.stringify(report), view = assessment.applyReportAssessmentStatus(report);
    expect(view.verdict.gradeStrip.valuation.qualification?.status).toBe("unknown");
    expect(assessment.gradeDisplayLabel(view.verdict.gradeStrip.valuation)).toContain("Qualification unknown");
    expect(view.scores?.composite).toEqual(report.scores.composite); expect(JSON.stringify(report)).toBe(before);
  });
});


describe("D-290 foreign statement qualifications", () => {
  it("labels unverified foreign interim figures and propagates the limitation", () => {
    const bundle = completeCurrencyBundle({});
    withIssuerFacts(bundle, { cik: 1, entityName: "Foreign", facts: { "ifrs-full": { Revenue: { units: {} } } } });
    bundle.edgar!.registrant = { ...bundle.edgar!.registrant, forms: ["20-F", "6-K"] } as NonNullable<typeof bundle.edgar>["registrant"];
    expect(assessment.statementEvidenceNotes(bundle).join(" ")).toContain("vendor data, not checked against a filing");
    const gap = { field: "statements.foreignInterim", reason: assessment.statementEvidenceNotes(bundle).join(" "), severity: "info" as const };
    expect(assessment.financialEvidenceQualifications([gap], null)).toEqual([]); // no suitable vendor-unverified code exists
  });
  it("does not label a domestic control as foreign interim", () => {
    expect(assessment.statementEvidenceNotes(completeCurrencyBundle({}))).toEqual([]);
  });
});


it("D-290 labels a converted ordinary EPS as derived ADS precision", () => {
  const bundle = completeCurrencyBundle({});
  if (!bundle.statements.incomeAnnual.ok) throw Error("fixture");
  const row = bundle.statements.incomeAnnual.value.data.rows[0]!;
  row.fieldProvenance = { epsDiluted: { source: "edgar", unit: "TWD/shares", periodStart: "2025-01-01", periodEnd: "2025-12-31", observedAt: bundle.builtAt,
    tags: ["ifrs-full/DilutedEarningsLossPerShare"], filings: [], shareUnitConversion: { ordinarySharesPerQuotedUnit: 5, sourceIds: ["filing"] } } };
  expect(assessment.statementEvidenceNotes(bundle).join(" ")).toContain("derived (ordinary EPS times ADS ratio)");
});

it("D-290 carries the vendor tax operand limitation into the valuation assumption", () => {
  const computed = runStageB(completeCurrencyBundle({}));
  if (computed.valuation.kind !== "dcf" || !computed.valuation.assumptions) throw Error("fixture");
  expect(computed.valuation.assumptions.taxRatePath.basis).toContain("vendor data, not checked against a filing");
});


it("D-290 review: non-ADR non-IFRS foreign vendor interim is labelled without an IFRS framework claim", () => {
  const bundle=completeCurrencyBundle({});
  withIssuerFacts(bundle,{cik:1,entityName:"Foreign",facts:{}});
  bundle.edgar!.registrant={...bundle.edgar!.registrant,forms:["20-F","6-K"]} as NonNullable<typeof bundle.edgar>["registrant"];
  const note=assessment.statementEvidenceNotes(bundle).join(" ");
  expect(note).toContain("vendor data, not checked against a filing");
  expect(note).not.toContain("accounting-framework");
});


it("D-287 review: a withheld liquidity total occupies the same row in all reader surfaces", () => {
  const bundle=completeCurrencyBundle({}); const computed=runStageB(bundle);
  if(!computed.capital.current) throw Error("fixture current capital");
  computed.capital.current.debtBridge.cashAndShortTermInvestments=null;
  computed.gaps.push({field:`statements.balance.${computed.capital.current.asOf}.shortTermInvestments`,reason:"scope unproved",severity:"info"});
  const report=applyFinancialDiagnostics(task28SentinelReport(),computed,bundle);
  const tables=unavailableLiquidityTable(report.balanceSheet.debtProfile.commentary);
  expect(tables[0]?.rows[0]).toEqual(["Cash and short-term investments","Unavailable",expect.stringContaining("separation from cash")]);
  for(const text of [reportToMarkdown(report),reportToPrintBody(report),renderToStaticMarkup(createElement(BalanceSheetSection,{balanceSheet:report.balanceSheet,index:7,report}))]) {
    expect(text).toContain("Cash and short-term investments");
    expect(text).toContain("Unavailable");
    expect(text).toContain("separation from cash");
  }
});

it("D-287 review: an unadjusted FCF series never claims an after-SBC deduction", () => {
  const bundle=completeCurrencyBundle({});const computed=runStageB(bundle);
  computed.capital.fcf.series[0]!.stockBasedCompensation=null;
  const report=task28SentinelReport();report.fundamentals.fcf=[{label:"Free cash flow (after SBC, house default)",values:[{period:"FY2025",value:{value:10,unit:"currency",currency:"USD",source:"computed.capital.fcf",asOf:"2025-12-31",verified:true}}]}];
  expect(applyFinancialDiagnostics(report,computed,bundle).fundamentals.fcf[0]!.label).toContain("otherwise before SBC");
});


it("D-290 review: the vendor limitation is in the quarterly table caption", () => {
  const disclosures=buildFilingDisclosures(completeCurrencyBundle({}));
  if(!disclosures)throw Error("fixture disclosures");
  const note="Vendor interim figures: vendor data, not checked against a filing.";
  disclosures.notes.push(note);
  const trend=filingDisclosureTables(disclosures,"fundamentals").find(table=>table.heading.startsWith("Quarterly trend"));
  expect(trend?.note).toContain(note);
});


it("D-288 review: a both-present missing-history refusal survives repaired liquidity", () => {
  const bundle=completeCurrencyBundle({});
  if(!bundle.statements.balanceAnnual.ok)throw Error("fixture");
  bundle.statements.balanceAnnual.value.data.rows.forEach(row=>{row.cashConflictReconciled=true;});
  const computed=runStageB(bundle);
  expect(computed.returns.roic.latestRoicPct).not.toBeNull();
  expect(computed.returns.wacc.waccPct).not.toBeNull();
  expect(computed.returns.roicVsWacc.note).toContain("no WACC history point");
  expect(computed.returns.roicVsWacc.note).not.toBe("ROIC minus WACC withheld because ");
});


it("D-290 review: a filed XBRL quarter is a control for the interim vendor label", () => {
  const bundle=completeCurrencyBundle({});
  withIssuerFacts(bundle,{cik:1,entityName:"Transition filer",facts:{"us-gaap":{RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[{start:"2026-01-01",end:"2026-03-31",val:123,form:"10-Q",filed:"2026-04-15",accn:"0000000001-26-000001"}]}}}}});
  bundle.edgar!.registrant={...bundle.edgar!.registrant,forms:["6-K","10-Q"]} as NonNullable<typeof bundle.edgar>["registrant"];
  if(!bundle.statements.incomeQuarterly.ok)throw Error("fixture");
  bundle.statements.incomeQuarterly.value.data.rows=[{date:"2026-03-31",periodStart:"2026-01-01",reportedCurrency:"USD",revenue:123}];
  expect(assessment.statementEvidenceEntries(bundle)).toEqual([]);
});
