import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { applyFinancialDiagnostics } from "@/report/financialDiagnostics";
import type { ComputedMetrics } from "@/pipeline/compute";
import { ReportSchema } from "@/report/schema";
import { computeCapital } from "@/pipeline/stageB/capital";
import { attachCurrentCapital } from "@/pipeline/stageB/currentCapital";

const report = () => ReportSchema.parse(JSON.parse(fs.readFileSync("fixtures/report/DEMO-sample.json","utf8")));
const capital = () => attachCurrentCapital(computeCapital([],[],[],[],{ price: null }), {
  income: { date:"2026-06-30",revenue:100,netIncome:20,operatingIncome:30,interestExpense:2 },
  cashFlow: {date:"2026-06-30",operatingCashFlow:40,capitalExpenditure:-25,stockBasedCompensation:9,financeLeasePrincipalPayments:3},
  balance: {date:"2026-06-30",totalDebt:30,cashAndShortTermInvestments:15,operatingLeaseLiability:10},currency:"USD",
});
describe("deterministic financial explanation",()=>{
  it("renders the current basis and its cash/debt bridge without changing annual history",()=>{
    const r=report();
    const out=applyFinancialDiagnostics(r,{capital:capital()} as ComputedMetrics);
    expect(out.balanceSheet.coverage.numbers.some(n=>n.source==="computed.capital.current.cashBridge.standardizedFcf" && n.value===15)).toBe(true);
    expect(out.balanceSheet.debtProfile.numbers.some(n=>n.source==="computed.capital.current.debtBridge.netDebtExcludingOperatingLeases" && n.value===5)).toBe(true);
    expect(out.balanceSheet.coverage.commentary.at(-1)?.text).toContain("ttm");
    expect(r.balanceSheet.coverage.numbers).not.toEqual(out.balanceSheet.coverage.numbers);
  });
  it("does not invent executive execution or credibility grades from empty attributable evidence",()=>{
    const r=report();
    r.leadership.executives=[{name:"Officer",title:"CFO",tenureYears:null,grade:"C",credibilityGrade:"C",reasoning:[],evidence:{}}];
    const out=applyFinancialDiagnostics(r,{capital:capital()} as ComputedMetrics);
    expect(out.leadership.executives[0]).toMatchObject({grade:"not-assessed",credibilityGrade:"not-assessed"});
    expect(ReportSchema.safeParse(out).success).toBe(true);
  });
  it("does not count unknown, rejected or non-evidence claims as an executive track record",()=>{
    const r=report();
    r.leadership.executives=[{name:"Officer Smith",title:"CFO",tenureYears:null,grade:"A",credibilityGrade:"A",reasoning:[],evidence:{guidanceVsActuals:[{label:"JUDGMENT",source:"unknown",asOf:null,text:"No guidance-versus-actual evidence is available."}]}}];
    expect(applyFinancialDiagnostics(r,{capital:capital()} as ComputedMetrics).leadership.executives[0]).toMatchObject({grade:"not-assessed",credibilityGrade:"not-assessed"});
    r.leadership.executives[0]!.evidence.guidanceVsActuals=[{label:"FACT",source:"edgar:10-Q",asOf:"2026-06-30",text:"Officer Smith met 99% of guidance targets."}];
    r.appendix.verificationLog=[{path:"leadership.executives[0].evidence.guidanceVsActuals[0]",claim:"Officer Smith met 99% of guidance targets.",outcome:"unverified",validationStatus:"contradicted"}];
    expect(applyFinancialDiagnostics(r,{capital:capital()} as ComputedMetrics).leadership.executives[0]).toMatchObject({grade:"not-assessed",credibilityGrade:"not-assessed"});
  });
  it("retains a proposed assessment only for attributable pipeline-classified metric evidence",()=>{
    const r=report(), text="Officer Smith met 95% of guidance targets.";
    r.leadership.executives=[{name:"Officer Smith",title:"CFO",tenureYears:null,grade:"B",credibilityGrade:"B",reasoning:[],evidence:{guidanceVsActuals:[{label:"FACT",source:"edgar:10-Q",asOf:"2026-06-30",text}]}}];
    // The verify pass never marks prose "verified"; numeric validation is its strongest outcome.
    r.appendix.verificationLog=[{path:"leadership.executives[0].evidence.guidanceVsActuals[0]",claim:text,source:"edgar:10-Q",outcome:"unverified",validationStatus:"validated"}];
    expect(applyFinancialDiagnostics(r,{capital:capital()} as ComputedMetrics).leadership.executives[0]).toMatchObject({grade:"not-assessed",credibilityGrade:"not-assessed"});
    r.appendix.verificationLog[0]!.executiveEvidenceKind="guidance-track-record";
    expect(applyFinancialDiagnostics(r,{capital:capital()} as ComputedMetrics).leadership.executives[0]).toMatchObject({grade:"B",credibilityGrade:"B"});
  });
});
