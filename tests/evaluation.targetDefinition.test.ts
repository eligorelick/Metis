import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { evaluateResearch } from "@/evaluation/evaluation";

const sha = (content: string) => createHash("sha256").update(content).digest("hex");
const source = { kind: "source", content: "TEST initial GAAP revenue 100", hash: sha("TEST initial GAAP revenue 100") };
const method = { kind: "method", content: "frozen-method-v1", hash: sha("frozen-method-v1") };
const input = { kind: "input", content: "frozen-inputs", hash: sha("frozen-inputs") };
const basis = { currency: "USD", unit: "USD", shareBasis: "not_per_share", adjustmentsKnownAt: [] };
const period = { start: "2024-01-01", end: "2024-12-31" };
const target = { schemaVersion: 2, targetId: "revenue", issuerId: "TEST", securityId: "issuer-level", metric: "revenue", accountingBasis: "GAAP", currency: "USD", unit: "USD", shareBasis: "not_per_share", corporateActionBasis: "unadjusted", periodStart: period.start, periodEnd: period.end, horizonMonths: 12, forecastKind: "forecast", createdAt: "2024-01-01", methodArtifactHash: method.hash, concept: "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" };
const observation = { targetId: target.targetId, issuerId: target.issuerId, securityId: target.securityId, metric: target.metric, accountingBasis: target.accountingBasis, currency: target.currency, unit: target.unit, shareBasis: target.shareBasis, corporateActionBasis: target.corporateActionBasis, periodStart: period.start, periodEnd: period.end, availableAt: "2025-02-01", accession: "0000000001-25-000001", concept: target.concept, sourceHash: source.hash, value: 100 };
function sample(id = "A") { return { id, issuerId: "TEST", symbol: "TEST", kind: "filing", snapshotHash: input.hash, analysisAt: "2024-01-01", predictionAvailableAt: "2024-01-01", inputsAvailableAt: ["2023-12-01"], membership: { includedAt: "2023-01-01", delistedAt: null }, basis, metric: "revenue", period, prediction: { value: 120, baseline: { name: "flat", value: 110, availableAt: "2023-12-01" } }, outcome: { value: 100, publishedAt: "2025-02-01", observedAt: "2025-02-02", version: "initial", accession: observation.accession, source: "sec_filing", period, basis, observation }, target }; }
function dataset(samples: unknown[], version = "research-evaluation-v2") { return { version, evidenceKind: "synthetic_fixture", evaluatedAt: "2031-01-01", universe: { id: "all", formedAt: "2023-01-01", selection: "point_in_time", includesDelisted: true }, rolling: { firstTestAt: "2024-01-01", testWindowDays: 366, minTrainSamples: 1, minTestSamples: 1 }, retainedArtifacts: [source, method, input], samples }; }

describe("strict evaluation target and observation dimensions", () => {
  it("rejects conflicting unknown accounting metadata instead of silently discarding it", () => {
    const legacy = sample(); Reflect.deleteProperty(legacy, "target"); Reflect.deleteProperty(legacy.outcome, "observation");
    const out = evaluateResearch(dataset([{ ...legacy, basis: { ...basis, accountingDefinition: "adjusted" } }], "research-evaluation-v1"));
    expect(out.accepted).toBe(0);
    expect(out.rejected[0]?.reasons.join(" ")).toMatch(/accountingDefinition/);
  });
  it("admits exact declared dimensions bound to retained bytes without asserting source truth", () => {
    const out = evaluateResearch(dataset([sample()]));
    expect(out).toMatchObject({ accepted: 1, pending: 0, readiness: "diagnostic", predictiveValidation: false });
    expect(out.groups[0]).toMatchObject({ n: 1, model: { mae: 20 }, baseline: { pairedMaeImprovement: -10 } });
  });
  it.each([
    ["issuer_mismatch", { issuerId: "OTHER" }], ["metric_mismatch", { metric: "netIncome" }],
    ["accounting_basis_mismatch", { accountingBasis: "adjusted" }], ["security_mismatch", { securityId: "other-share-class" }],
    ["concept_mismatch", { concept: "us-gaap:NetIncomeLoss" }], ["corporate_action_basis_mismatch", { corporateActionBasis: "future-split" }],
    ["source_unbound", { sourceHash: "b".repeat(64) }], ["future_outcome", { availableAt: "2032-01-01" }],
  ])("excludes %s", (reason, patch) => {
    const s = sample();
    const out = evaluateResearch(dataset([{ ...s, outcome: { ...s.outcome, observation: { ...observation, ...patch } } }]));
    expect(out.accepted).toBe(0);
    expect(out.rejected[0]?.reasons).toContain(reason);
  });
  it("rejects changed retained bytes, an unbound method or input artifact", () => {
    const d = dataset([sample()]);
    expect(evaluateResearch({ ...d, retainedArtifacts: [{ ...source, content: "changed" }, method, input] }).rejected[0]?.reasons).toContain("source_unbound");
    expect(evaluateResearch({ ...d, retainedArtifacts: [source, input] }).rejected[0]?.reasons).toContain("method_unbound");
    expect(evaluateResearch({ ...d, retainedArtifacts: [source, method] }).rejected[0]?.reasons).toContain("input_unbound");
  });
  it("keeps one-year and six-year forecast leads and different methods in distinct groups", () => {
    const a = sample(); const p = { start: "2029-01-01", end: "2029-12-31" };
    const b = { ...sample("B"), period: p, target: { ...target, periodStart: p.start, periodEnd: p.end }, outcome: { ...a.outcome, period: p, publishedAt: "2030-02-01", observedAt: "2030-02-02", observation: { ...observation, periodStart: p.start, periodEnd: p.end, availableAt: "2030-02-01" } } };
    expect(evaluateResearch(dataset([a, b])).groups).toHaveLength(2);
    const other = { kind: "method", content: "another-method", hash: sha("another-method") };
    const d = dataset([a, { ...sample("C"), target: { ...target, methodArtifactHash: other.hash } }]);
    expect(evaluateResearch({ ...d, retainedArtifacts: [...d.retainedArtifacts, other] }).groups).toHaveLength(2);
  });
  it("separates exact fiscal periods sharing an annual duration category", () => {
    const a = sample(); const p = { ...period, start: "2024-01-11" };
    const b = { ...sample("B"), period: p, target: { ...target, periodStart: p.start }, outcome: { ...a.outcome, period: p, observation: { ...observation, periodStart: p.start } } };
    const event = { definition: "revenue exceeds 99", probability: 0.8, outcome: 1, resolvedAt: "2025-02-01" };
    const out = evaluateResearch(dataset([{ ...a, event }, { ...b, event }]));
    expect(out.groups).toHaveLength(2);
    expect(out.events).toHaveLength(2);
    expect(out.events.map(e => ({ n: e.n, brier: e.brier }))).toEqual([{ n: 1, brier: 0.04 }, { n: 1, brier: 0.04 }]);
  });
  it("separates distinct declared SEC concepts even when issuer, metric and fiscal dates match", () => {
    const concept = "us-gaap:Revenues";
    const a = sample(), b = { ...sample("B"), target: { ...target, concept }, outcome: { ...a.outcome, observation: { ...observation, concept } } };
    const event = { definition: "revenue exceeds 99", probability: 0.8, outcome: 1, resolvedAt: "2025-02-01" };
    const out = evaluateResearch(dataset([{ ...a, event }, { ...b, event }]));
    expect(out.groups).toHaveLength(2);
    expect(out.events).toHaveLength(2);
  });
  it("keeps readable legacy samples diagnostic-only with explicit unverifiable dimensions", () => {
    const s = sample(); Reflect.deleteProperty(s, "target"); Reflect.deleteProperty(s.outcome, "observation");
    const out = evaluateResearch(dataset([s], "research-evaluation-v1"));
    expect(out.accepted).toBe(1);
    expect(out).toMatchObject({ predictiveValidation: false, incomparable: [{ id: "A", reasons: expect.arrayContaining(["legacy_dimensions_unverified"]) }] });
    expect(out.groups[0]?.model.mae).toBe(20);
  });
  it("excludes explicit wrong issuer/metric in legacy outcomes rather than treating them as compatibility metadata", () => {
    const s = sample(); Reflect.deleteProperty(s, "target"); Reflect.deleteProperty(s.outcome, "observation");
    const out = evaluateResearch(dataset([{ ...s, outcome: { ...s.outcome, issuerId: "OTHER", metric: "netIncome" } }], "research-evaluation-v1"));
    expect(out.rejected[0]?.reasons).toEqual(expect.arrayContaining(["issuer_mismatch", "metric_mismatch"]));
  });
  it("requires distinct frozen security and benchmark IDs in total-return observations", () => {
    const s = sample();
    const returnTarget = { ...target, metric: "excess_total_return", securityId: "stock:TEST", benchmarkId: "index:TEST", unit: "fraction_total_return" };
    const actual = { ...observation, metric: returnTarget.metric, securityId: returnTarget.securityId, benchmarkId: returnTarget.benchmarkId, unit: returnTarget.unit, value: 0.1 };
    const stock = { ...s, kind: "total_return", metric: returnTarget.metric, basis: { ...basis, unit: returnTarget.unit }, prediction: { value: 0.1 }, target: returnTarget, outcome: { publishedAt: "2025-02-01", observedAt: "2025-02-02", source: "frozen_total_returns", observation: actual, security: { id: returnTarget.securityId, totalReturn: 0.3, currency: "USD", period, includesDistributions: true, includesDelistingReturn: true }, benchmark: { id: returnTarget.benchmarkId, totalReturn: 0.2, currency: "USD", period, includesDistributions: true } } };
    expect(evaluateResearch(dataset([stock])).groups[0]).toMatchObject({ model: { mae: 0 }, baseline: { mae: 0.1 } });
    const wrong = { ...stock, target: { ...returnTarget, benchmarkId: returnTarget.securityId } };
    expect(evaluateResearch(dataset([wrong])).rejected[0]?.reasons.join(" ")).toMatch(/same_security_benchmark/);
    const wrongLeg = { ...stock, outcome: { ...stock.outcome, benchmark: { ...stock.outcome.benchmark, id: stock.outcome.security.id } } };
    expect(evaluateResearch(dataset([wrongLeg])).rejected[0]?.reasons).toContain("same_security_benchmark");
  });
});
