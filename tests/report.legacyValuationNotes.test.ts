import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { describe, expect, it } from "vitest";
import { ANNUALIZATION_CONVENTION_SPEC, withLegacyValuationNotes } from "@/report/legacyValuationNotes";
import { withLegacyBridgeMethod } from "@/report/legacyBridgeMethod";
import { withLegacyEdgarDerivedLines } from "@/report/legacyEdgarDerivedLines";
import { withLegacyPayloadRecordSafety } from "@/report/legacyPayloadRecordSafety";
import { withHistoricalEnterpriseValueSafety } from "@/report/enterpriseValueSafety";
import { withPrincipalSummarySafety } from "@/report/principalAggregationSafety";
import type { Report } from "@/report/schema";
import { cloneTask28, loadTask28Fixture } from "./helpers/task28Report";

const HOUSE_RULE = "(house rule D-60: consensus levels when consistent with admitted guidance extrapolation, then model extrapolation of quarterly guidance, then the run-rate)";
const LONG_QUARTER = "latest quarter ending 2026-09-03 × 4 = 216.92B";
function demoWith(basis = LONG_QUARTER, specVersion = "1.44.0", context: unknown = { kind: "duration", basis: "fiscal-quarter", start: "2026-05-29", end: "2026-09-03" }): Report {
  const r = cloneTask28(loadTask28Fixture());
  r.meta.specVersion = specVersion;
  r.valuation.dcf.assumptions = [{ name: "year-one revenue anchor", value: "100", basis }];
  r.fundamentals.graded.keyNumbers[0] = { ...r.fundamentals.graded.keyNumbers[0], periodContext: context } as typeof r.fundamentals.graded.keyNumbers[number];
  return r;
}
const noteFor = (r: Report, key: string) => withLegacyValuationNotes(r).appendix.missingData.find(g => g.field === `presentation.legacyValuation.${key}`);

describe("stored valuation convention notes (D136)", () => {
  it("explains the 14-week run-rate while preserving all stored bytes and figures", () => {
    const stored = demoWith();
    // Filed SEC quarter, stored in report 46: this avoids rounding 216.916B twice.
    Object.assign(stored.fundamentals.graded.keyNumbers[0], { value: 54.229e9, sourceId: "payload.statements.income-statement-quarterly.2026-09-03.revenue" });
    const before = JSON.stringify(stored);
    const view = withLegacyValuationNotes(stored);
    expect(noteFor(stored, "quarterLength")!.reason).toMatch(/14-week quarter ending 2026-09-03 × 4 \(216\.92B\).*× 13\/14\): 201\.42B/);
    expect(JSON.stringify(stored)).toBe(before);
    expect(view.valuation).toBe(stored.valuation);
    expect(view.verdict).toBe(stored.verdict);
    expect(view.appendix.verificationLog).toBe(stored.appendix.verificationLog);
    expect(view.appendix.missingData.at(-1)).toMatchObject({ severity: "info", expected: true });
    expect(withLegacyValuationNotes(view)).toBe(view);
  });
  it("labels an estimate from a rounded run-rate when no matching filed revenue is stored", () => {
    expect(noteFor(demoWith(), "quarterLength")!.reason).toContain("201.43B (approximate, calculated from the rounded stored run-rate)");
  });
  it("notes the off-weekday provider year end without inventing the real end", () => {
    const context = { kind: "duration", basis: "fiscal-quarter", start: "2026-04-27", end: "2026-07-26" };
    const basis = "the fiscal year ending 2027-01-25 contributes 240B";
    const note = noteFor(demoWith(basis, "1.44.0", context), "fiscalYearEnd")!.reason;
    expect(note).toMatch(/fiscal-year date 2027-01-25 \(a Monday\); this issuer's fiscal periods end on Sundays/);
    expect(note).not.toMatch(/2027-01-31/);
    expect(noteFor(demoWith(basis, "1.44.0", { ...context, start: "2026-04-01", end: "2026-06-30" }), "fiscalYearEnd")).toBeUndefined();
    expect(noteFor(demoWith(basis.replace("2027-01-25", "2027-01-24"), "1.44.0", context), "fiscalYearEnd")).toBeUndefined();
  });
  it.each(["model extrapolation of quarterly guidance: 108B", "consensus sits below the guided run-rate and is not used for year one"])("identifies the guidance branch: %s", basis => {
    expect(noteFor(demoWith(basis), "guidedTimesFour")!.reason).toMatch(/growth-adjusted share.*below eight quarters/);
  });
  it("does not confuse the generic house-rule sentence with the guidance branch", () => {
    const r = demoWith(`run-rate: ${HOUSE_RULE}`);
    expect(withLegacyValuationNotes(r)).toBe(r);
  });
  it("discloses the stored guided-times-four consistency floor", () => {
    const r = demoWith("at or above the guided run-rate (management guidance 108B for Q3 × 4 = 432B; low end × 4 = 423.36B)");
    expect(noteFor(r, "guidedFloorTimesFour")!.reason).toMatch(/tested against the guided quarter × 4 \(432B; low end 423\.36B\)/);
    expect(noteFor(r, "guidedTimesFour")).toBeUndefined();
  });
  it("reads the consistency floor through its parenthesized filing citation (stored 47)", () => {
    const r = demoWith("at or above the guided run-rate (management guidance 108B for the quarter ending 2026-10-25 (sec:8-K EX-99.1 0001045810-26-000073, 2026-08-26) × 4 = 432B; low end × 4 = 423.36B)");
    expect(noteFor(r, "guidedFloorTimesFour")!.reason).toContain("(432B; low end 423.36B)");
  });
  it.each([ANNUALIZATION_CONVENTION_SPEC, "1.52.0", "2.0.0"])("keeps reports at or after the frozen cutoff unchanged: %s", spec => {
    const r = demoWith(undefined, spec);
    expect(withLegacyValuationNotes(r)).toBe(r);
  });
  it.each(["", "unknown", "1.9.0"])("uses the shared numeric version comparator: %s", spec => {
    expect(noteFor(demoWith(undefined, spec), "quarterLength")).toBeDefined();
  });
  it.each([undefined, null, {}, { kind: "instant", at: "2026-09-03" }, { kind: "duration", start: "2026-05-29", end: "2026-09-03" },
    { kind: "duration", basis: "fiscal-quarter", start: "bad", end: "2026-09-03" }, { kind: "duration", basis: "fiscal-quarter", start: "2026-06-05", end: "2026-09-03" },
    { kind: "duration", basis: "fiscal-quarter", start: "2026-05-30", end: "2026-09-03" }])("skips insufficient or non-extra-week period evidence: %j", context => {
    const r = demoWith();
    r.fundamentals.graded.keyNumbers[0].periodContext = context as never;
    expect(withLegacyValuationNotes(r)).toBe(r);
  });
  it("leaves the checked-in 1.2.0 sample alone and tolerates absent assumptions", () => {
    const r = loadTask28Fixture();
    expect(withLegacyValuationNotes(r)).toBe(r);
    r.valuation.dcf.assumptions = [];
    expect(withLegacyValuationNotes(r)).toBe(r);
  });
  it("is idempotent through the complete composed view chain", () => {
    const chain = (r: Report) => withLegacyValuationNotes(withLegacyBridgeMethod(withLegacyEdgarDerivedLines(withLegacyPayloadRecordSafety(withHistoricalEnterpriseValueSafety(withPrincipalSummarySafety(r))))));
    const r = demoWith();
    expect(chain(chain(r))).toEqual(chain(r));
  });
});

it("qualifies the historical tax seed without changing stored assumptions (FIN-502)", () => {
  const r = cloneTask28(loadTask28Fixture());
  r.meta.specVersion = "1.44.0";
  r.valuation.dcf.assumptions.push({name:"EBIT margin (yr1 -> yrN)",value:"26%",basis:"TTM, excluding tagged one-off items"},
    {name:"forecast tax rate (yr1 -> yrN)",value:"35%",basis:"TTM effective rate 35% fading to 21%"});
  const before = JSON.stringify(r);
  const view = withLegacyValuationNotes(r);
  expect(view.appendix.missingData.find(g => g.field.endsWith("taxSeedOneOff"))?.reason).toMatch(/tax rate.*35%.*tagged one-off/);
  expect(JSON.stringify(r)).toBe(before);
  expect(withLegacyValuationNotes(view)).toBe(view);
  r.meta.specVersion = "1.56.0";
  expect(withLegacyValuationNotes(r)).toBe(r);
});

it("qualifies old scenario sigmas at house bounds without inventing uncapped history (FIN-512)",()=>{
  const r=cloneTask28(loadTask28Fixture());r.meta.specVersion="1.44.0";
  r.scenarioTargets={status:"available",method:"dcf-dispersion",methodVersion:"old",basis:[],dispersion:{growthSigmaPp:25,marginSigmaPp:12,sigmaSource:"own-history"},targets:[],missingReasons:[]};
  const view=withLegacyValuationNotes(r);
  expect(view.appendix.missingData.find(g=>g.field.endsWith("sigmaCap"))?.reason).toMatch(/house.*25pp.*12pp.*uncapped/);
  expect(withLegacyValuationNotes(view)).toBe(view);
  r.meta.specVersion="1.56.0";expect(withLegacyValuationNotes(r)).toBe(r);
});

describe("P2 stored DCF input conventions",()=>{
  const old=()=>{const r=cloneTask28(loadTask28Fixture());r.meta.specVersion="1.44.0";return r;};
  it("names skipped terminal years using elapsed fiscal years and distinguishes full week calendars",()=>{
    const r=old();r.valuation.dcf.assumptions.push({name:"terminal ROIC",value:"14%",basis:"ROIC beat WACC in each of the last 4 fiscal years (2021-12-31 to 2025-12-31)"});
    expect(noteFor(r,"terminalYearSkipped")?.reason).toMatch(/read 4.*2021-12-31.*2025-12-31/);
    r.valuation.dcf.assumptions.at(-1)!.basis="ROIC beat WACC in each of the last 5 fiscal years (2022-01-30 to 2026-01-25)";
    expect(noteFor(r,"terminalYearSkipped")).toBeUndefined();
  });
  it("qualifies an old all-equity WACC beside established positive latest debt and an unsupported growth bound",()=>{
    const r=old();r.valuation.dcf.assumptions.push({name:"WACC",value:"9%",basis:"WACC: E 100% / D 0%"});
    const number=r.balanceSheet.debtProfile.numbers[0]!;
    r.balanceSheet.debtProfile.numbers=[{...number,value:20,source:"computed.capital.current.debtBridge.totalDebtIncludingLeases"},{...number,value:0,source:"computed.capital.current.debtBridge.operatingLeases"}];
    r.appendix.missingData.push({field:"valuation.reverseDcf.growthBracket",reason:"the price implies year-one growth above 60%",severity:"warn"});
    expect(noteFor(r,"newBorrower")?.reason).toMatch(/all-equity.*latest balance carried debt/);
    expect(noteFor(r,"reverseRangeEnd")?.reason).toMatch(/outside.*domain/);
    r.balanceSheet.debtProfile.numbers[0]!.value=0;
    expect(noteFor(r,"newBorrower")).toBeUndefined();
  });
  it.each(["annual","quarters"])("corrects only metadata from established %s contexts, preserving claim text and stored bytes",mode=>{
    const r=old(),a="2025-09-04",f="2025-08-29",end="2026-09-03";
    const context=(start:string,end:string,basis:"fiscal-quarter"|"fiscal-year")=>({kind:"duration" as const,start,end,basis});
    const sample=r.fundamentals.graded.keyNumbers[0]!;
    r.fundamentals.graded.keyNumbers=mode==="annual"?[{...sample,periodContext:context(f,end,"fiscal-year")}]:[
      ["2025-08-29","2025-11-27"],["2025-11-28","2026-02-26"],["2026-02-27","2026-05-28"],["2026-05-29",end]
    ].map(([start,end])=>({...sample,periodContext:context(start!,end!,"fiscal-quarter")}));
    r.scores!.aspects.balanceSheet.signals=runStageB(completeCurrencyBundle({})).scores.aspects.balanceSheet.signals;
    for(const n of [...r.balanceSheet.coverage.numbers,...r.scores!.aspects.balanceSheet.drivers])n.period=`ttm: ${a} to ${end}`;
    for(const signal of r.scores!.aspects.balanceSheet.signals??[]){signal.period=`ttm: ${a} to ${end}`;signal.startDate=a;}
    const claim=r.balanceSheet.coverage.commentary[0]!;claim.text=`Capital grading basis: ttm: ${a} to ${end}. Stored wording.`;
    const before=JSON.stringify(r),view=withLegacyValuationNotes(r);
    expect(view.balanceSheet.coverage.numbers[0]!.period).toBe(`ttm: ${f} to ${end}`);
    expect(view.scores!.aspects.balanceSheet.signals?.[0]?.startDate).toBe(f);
    expect(view.balanceSheet.coverage.commentary[0]!.text).toBe(claim.text);
    expect(noteFor(r,"currentCapitalStart")?.reason).toContain(f);
    expect(JSON.stringify(r)).toBe(before);expect(withLegacyValuationNotes(view)).toBe(view);
    r.fundamentals.graded.keyNumbers=r.fundamentals.graded.keyNumbers.slice(0,1).map(n=>({...n,periodContext:context("2026-05-29",end,"fiscal-quarter")}));
    expect(noteFor(r,"currentCapitalStart")).toBeUndefined();
  });
  it("removes unused stored degradation members and preserves remaining actual dependencies",()=>{
    const r=old();r.fairValue=runStageB(completeCurrencyBundle({})).fairValue;
    r.fairValue.reasons=[{field:"valuation.fairValue.degradedInputs",severity:"warn",reason:"Degraded inputs: the SPY benchmark prices and market-cap history are from Yahoo, not FMP. A run with these providers healthy can give a different value."}];
    for(const member of ["spy","marketCapHistory"])r.appendix.missingData.push({field:`keyless.${member}`,reason:"served by yahoo (fixture) because FMP quota/rate limit (HTTP 429)",severity:"info"});
    expect(withLegacyValuationNotes(r).fairValue?.reasons.some(g=>g.field==="valuation.fairValue.degradedInputs")).toBe(false);
    r.appendix.missingData.push({field:"keyless.incomeAnnual",reason:"served by edgar (fixture) because FMP quota/rate limit (HTTP 429)",severity:"info"});
    expect(withLegacyValuationNotes(r).fairValue?.reasons[0]?.reason).toMatch(/annual income statement/);
    r.meta.specVersion="1.56.0";expect(withLegacyValuationNotes(r)).toBe(r);
  });
  it("adapts only obsolete scenario-method text below the frozen cutoff",()=>{
    const r=old(),text="Targets are labeled by per-share value; a negative perturbed equity value is floored at zero. No scenario is a future-price forecast.";
    r.valuation.scenarios[0]!.assumptions.push(text);
    const view=withLegacyValuationNotes(r);
    expect(view.valuation.scenarios[0]!.assumptions.join(" ")).not.toContain("floored at zero");
    expect(r.valuation.scenarios[0]!.assumptions).toContain(text);
  });
});

it("accepts early stored reports without score evidence arrays",()=>{
  const r=cloneTask28(loadTask28Fixture());r.meta.specVersion="1.33.0";
  delete (r as unknown as {scores?:unknown}).scores;
  expect(()=>withLegacyValuationNotes(r)).not.toThrow();
});
