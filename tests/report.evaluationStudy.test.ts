import { describe, expect, it, vi } from "vitest";
import { createStudy, registerStudyReport, evaluateStudy, verifyStudy } from "@/report/evaluationStudy";

const issuer = { scheme: "cik", id: "0000000123", symbol: "TEST" };
const selection = { id: "revenue", metric: "revenue", scenario: "base", periodLabel: "FY2025",
  periodStart: "2025-01-01", periodEnd: "2025-12-31", unit: "USD", currency: "USD", basis: "US-GAAP-consolidated-as-reported" };
const definition = { schemaVersion: 1, issuer, identitySource: "retained issuer filing", asOf: "2025-01-15", methodVersion: "test-method", operating: [selection], market: [] };
export const studyProtocolFixture = () => ({ schemaVersion: 1, id: "prospective-test", description: "Synthetic forward cohort",
  universe: { source: "Dated universe including failed issuers", includesDelisted: true, selection: "point_in_time" },
  slots: [
    { id: "test-jan", sector: "Technology", registerBy: "2025-01-15T23:00:00.000Z", definition: structuredClone(definition),
      baselines: [{ selectionId: "revenue", name: "flat revenue", value: 90, unit: "USD", currency: "USD", basis: selection.basis, availableAt: "2024-12-01T00:00:00.000Z", source: "prior annual statement" }] },
    { id: "failed-jan", sector: "Technology", registerBy: "2025-01-15T23:00:00.000Z", definition: { ...structuredClone(definition), issuer: { ...issuer, id: "0000000999", symbol: "FAIL" } }, baselines: [] },
  ] });
export const studyReportFixture = () => ({ meta: { symbol: "TEST", generatedAt: "2025-01-15T12:00:00.000Z", specVersion: "1", pipelineVersion: "pipeline-test" },
  projections: { notApplicableReason: null, series: [{ metric: "revenue", unit: "USD", base: [{ period: "FY2025", periodStart: selection.periodStart, periodEnd: selection.periodEnd,
    value: { value: 120, unit: "USD", source: "computed.projections.revenue.base", asOf: "2024-12-31" } }] }] } });
const outcome = { kind: "operating", ...selection, issuer, value: 100, availableDate: "2026-02-01", source: "first annual release" };
// The existing outcome contract has no scenario/period label: identity is its registered id.
const { scenario: _scenario, periodLabel: _label, ...actual } = outcome;
void _scenario; void _label;
const createdAt = "2025-01-01T00:00:00.000Z";
const registeredAt = "2025-01-15T12:01:00.000Z";
const makeStudy = () => createStudy(studyProtocolFixture(), createdAt);
const packets = () => ({ schemaVersion: 1, slots: [{ slotId: "test-jan", outcomes: { schemaVersion: 1, outcomes: [structuredClone(actual)] } }] });

describe("prospective report study", () => {
  it("does not mark a deadline later today as missed, and records the evaluated instant", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2025-01-15T12:00:00.000Z"));
    try {
      const study = makeStudy();
      const before = evaluateStudy(study, [], { schemaVersion: 1, slots: [] }, "2025-01-15");
      expect(before.counts).toMatchObject({ missingRegistrations: 0, awaitingRegistrations: 2 });
      expect(before.evaluatedThrough).toBe("2025-01-15T12:00:00.000Z");
      clock.mockReturnValue(Date.parse("2025-01-15T23:01:00.000Z"));
      const after = evaluateStudy(study, [], { schemaVersion: 1, slots: [] }, "2025-01-15");
      expect(after.counts).toMatchObject({ missingRegistrations: 2, awaitingRegistrations: 0 });
      expect(after.evaluationHash).not.toBe(before.evaluationHash);
    } finally { clock.mockRestore(); }
  });
  it("predeclares the cohort, preserves every missing issuer and computes hand-checked paired errors", () => {
    const study = makeStudy();
    const report = studyReportFixture();
    const original = JSON.stringify(report);
    const registration = registerStudyReport(study, "test-jan", report, registeredAt);
    const result = evaluateStudy(study, [registration], packets(), "2026-03-01");
    expect(result.counts).toMatchObject({ plannedReports: 2, registeredReports: 1, missingRegistrations: 1, operatingIncluded: 1 });
    expect(result.slots.find(s => s.slotId === "failed-jan")).toMatchObject({ status: "missing-registration", issuer: { symbol: "FAIL" } });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ sector: "Technology", forecastKind: "partial-year", n: 1, issuerCount: 1, mae: 20, rmse: 20, bias: 20, meanAbsolutePercentageError: 20,
      baseline: { n: 1, modelMae: 20, baselineMae: 10, improvementMae: -10 } });
    expect(result).toMatchObject({ predictiveValidation: false, custodyStatus: "local-unwitnessed", measurementStatus: "operator-declared-dimensions" });
    expect(JSON.stringify(report)).toBe(original);
  });

  it("keeps not-yet-due outcomes pending and missing matured outcomes visible", () => {
    const study = makeStudy();
    const registration = registerStudyReport(study, "test-jan", studyReportFixture(), registeredAt);
    const empty = { schemaVersion: 1, slots: [] };
    expect(evaluateStudy(study, [registration], empty, "2025-02-01").counts).toMatchObject({ pendingOperating: 1, missingOperating: 0 });
    expect(evaluateStudy(study, [registration], empty, "2026-03-01").counts).toMatchObject({ pendingOperating: 0, missingOperating: 1 });
  });

  it("rejects duplicate slots, duplicate issuer/date slots and late baselines", () => {
    const p = studyProtocolFixture();
    expect(() => createStudy({ ...p, slots: [p.slots[0], p.slots[0]] }, createdAt)).toThrow(/duplicate/i);
    expect(() => createStudy({ ...p, slots: [p.slots[0], { ...p.slots[0], id: "copy" }] }, createdAt)).toThrow(/issuer.*date|duplicate/i);
    p.slots[0].baselines[0].availableAt = "2025-01-02T00:00:00.000Z";
    expect(() => createStudy(p, createdAt)).toThrow(/baseline.*available/i);
    expect(() => createStudy(studyProtocolFixture(), "2025-01-16T00:00:00.000Z")).toThrow(/report.*date|deadline|prospective/i);
  });

  it("rejects late, retrospective, unknown, mismatched and unverified forecast registrations", () => {
    const study = makeStudy();
    expect(() => registerStudyReport(study, "test-jan", studyReportFixture(), "2025-01-16T00:00:00.000Z")).toThrow(/deadline/i);
    expect(() => registerStudyReport(study, "unknown", studyReportFixture(), registeredAt)).toThrow(/slot/i);
    expect(() => registerStudyReport(study, "failed-jan", studyReportFixture(), registeredAt)).toThrow(/symbol/i);
    const report = studyReportFixture();
    report.meta.generatedAt = "2024-12-31T12:00:00.000Z";
    expect(() => registerStudyReport(study, "test-jan", report, registeredAt)).toThrow(/predates|before|as-of/i);
    const undated = studyReportFixture();
    undated.projections.series[0].base[0].periodStart = "2025-01-02";
    expect(() => registerStudyReport(study, "test-jan", undated, registeredAt)).toThrow(/period/i);
  });

  it("refuses edited protocol/registrations and duplicate or unplanned outcome packets", () => {
    const study = makeStudy();
    const changed = structuredClone(study);
    changed.protocol.slots.pop();
    expect(() => verifyStudy(changed)).toThrow(/integrity/i);
    const registration = registerStudyReport(study, "test-jan", studyReportFixture(), registeredAt);
    expect(() => evaluateStudy(study, [registration, registration], packets(), "2026-03-01")).toThrow(/duplicate/i);
    expect(() => evaluateStudy(study, [registration], { schemaVersion: 1, slots: [...packets().slots, ...packets().slots] }, "2026-03-01")).toThrow(/duplicate/i);
    expect(() => evaluateStudy(study, [registration], { schemaVersion: 1, slots: [{ ...packets().slots[0], slotId: "unplanned" }] }, "2026-03-01")).toThrow(/unplanned|unknown/i);
    registration.snapshot.operatingForecasts[0].forecastValue = 200;
    expect(() => evaluateStudy(study, [registration], packets(), "2026-03-01")).toThrow(/integrity/i);
  });

  it("never compares a mismatched actual or treats zero actual as a percentage denominator", () => {
    const study = makeStudy();
    const registration = registerStudyReport(study, "test-jan", studyReportFixture(), registeredAt);
    const wrong = packets();
    wrong.slots[0].outcomes.outcomes[0].currency = "EUR";
    expect(evaluateStudy(study, [registration], wrong, "2026-03-01").groups).toEqual([]);
    const zero = packets();
    zero.slots[0].outcomes.outcomes[0].value = 0;
    expect(evaluateStudy(study, [registration], zero, "2026-03-01").groups[0]).toMatchObject({ mae: 120, meanAbsolutePercentageError: null, percentageErrorN: 0 });
  });

  it("separates sector/method/horizon observations and conserves the complete target denominator", () => {
    const protocol = studyProtocolFixture();
    protocol.slots[1].sector = "Industrials";
    protocol.slots[1].definition.methodVersion = "different-method";
    const study = createStudy(protocol, createdAt);
    const second = studyReportFixture(); second.meta.symbol = "FAIL";
    const registrations = [registerStudyReport(study, "test-jan", studyReportFixture(), registeredAt), registerStudyReport(study, "failed-jan", second, registeredAt)];
    const input = packets();
    input.slots.push({ slotId: "failed-jan", outcomes: { schemaVersion: 1, outcomes: [{ ...actual, issuer: protocol.slots[1].definition.issuer, value: 80 }] } });
    const result = evaluateStudy(study, registrations, input, "2026-03-01");
    expect(result.groups).toHaveLength(2);
    expect(result.groups.find(g => g.sector === "Industrials")).toMatchObject({ n: 1, mae: 40, methodVersion: "different-method", baseline: { n: 0 } });
    const c = result.counts;
    expect(c.plannedOperating).toBe(c.operatingIncluded + c.pendingOperating + c.missingOperating + c.excludedOperating + c.unregisteredOperating);
  });

  it("rejects incompatible EPS targets and late evaluation inputs", () => {
    const protocol = studyProtocolFixture();
    protocol.slots[0].definition.operating[0] = { ...selection, metric: "epsDiluted", unit: "USD/share", basis: "diluted-EPS;share-basis=as-reported" };
    expect(() => createStudy(protocol, createdAt)).toThrow(/Operating EPS.*GAAP/i);
    const study = makeStudy();
    const registration = registerStudyReport(study, "test-jan", studyReportFixture(), registeredAt);
    expect(() => evaluateStudy(study, [registration], { schemaVersion: 1, slots: [] }, "2025-01-14")).toThrow(/predates/i);
    const future = packets(); future.slots[0].outcomes.outcomes[0].availableDate = "2026-04-01";
    expect(evaluateStudy(study, [registration], future, "2026-03-01").counts).toMatchObject({ pendingOperating: 1, operatingIncluded: 0 });
  });
});
