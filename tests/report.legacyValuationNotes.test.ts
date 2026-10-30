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
