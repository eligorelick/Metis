import { describe, expect, it } from "vitest";
import { evaluateResearch } from "@/evaluation/evaluation";

const hash = "a".repeat(64);
const basis = { currency: "USD", unit: "USD", shareBasis: "not_per_share", adjustmentsKnownAt: [] };
function filing(id: string, predicted = 12, actual = 10) {
  return { id, issuerId: id, symbol: id, kind: "filing" as const, snapshotHash: hash, analysisAt: "2024-01-01T00:00:00Z", predictionAvailableAt: "2024-01-01T00:00:00Z", inputsAvailableAt: ["2023-12-01T00:00:00Z"], membership: { includedAt: "2023-01-01", delistedAt: null }, basis, metric: "revenue", period: { start: "2024-01-01", end: "2024-12-31" }, prediction: { value: predicted, baseline: { name: "flat_prior_year", value: 10, availableAt: "2023-12-01" }, interval: { low: 9, high: 13, nominalCoverage: 0.8 } }, outcome: { value: actual, publishedAt: "2025-02-01", observedAt: "2025-02-02", version: "initial", accession: "0000000001-25-000001", source: "sec_filing", period: { start: "2024-01-01", end: "2024-12-31" }, basis }, missingFields: [] as string[], ablations: { without_momentum: { value: 11, availableAt: "2024-01-01" } } };
}
function dataset(samples: unknown[]) { return { version: "research-evaluation-v1", evidenceKind: "synthetic_fixture", evaluatedAt: "2026-10-13", universe: { id: "all-point-in-time", formedAt: "2023-01-01", selection: "point_in_time", includesDelisted: true }, rolling: { firstTestAt: "2024-01-01", testWindowDays: 366, minTrainSamples: 1, minTestSamples: 1 }, samples }; }

describe("frozen point-in-time research evaluator", () => {
  it("computes hand-checked errors, interval coverage and paired baseline/ablation deltas", () => {
    const a = filing("A", 12, 10);
    const b = { ...filing("B", 8, 12), missingFields: ["lease_principal"] };
    const out = evaluateResearch(dataset([a, b]));
    expect(out.groups[0]).toMatchObject({ n: 2, model: { mae: 3, bias: -1, rmse: Math.sqrt(10) }, baseline: { n: 2, mae: 1, bias: -1, pairedMaeImprovement: -2 }, intervals: [{ n: 2, nominalCoverage: 0.8, coverage: 1, meanWidth: 4 }], ablations: { without_momentum: { n: 2, mae: 1, pairedMaeImprovement: 2 } }, missingness: { complete: { n: 1, mae: 2 }, missing: { n: 1, mae: 4 } } });
    expect(out).toMatchObject({ accepted: 2, pending: 0, productionThresholds: "unchanged_uncalibrated", evidenceKind: "synthetic_fixture" });
    expect(out.groups[0]?.uncertainty).toMatchObject({ available: false });
  });
  it.each([
    ["future input", (s: ReturnType<typeof filing>) => ({ ...s, inputsAvailableAt: ["2024-01-02"] })],
    ["future forecast", (s: ReturnType<typeof filing>) => ({ ...s, predictionAvailableAt: "2024-01-02" })],
    ["future adjustment", (s: ReturnType<typeof filing>) => ({ ...s, basis: { ...basis, adjustmentsKnownAt: ["2024-01-02"] } })],
    ["future restatement", (s: ReturnType<typeof filing>) => ({ ...s, outcome: { ...s.outcome, version: "amended" } })],
    ["different fiscal period", (s: ReturnType<typeof filing>) => ({ ...s, outcome: { ...s.outcome, period: { start: "2024-04-01", end: "2025-03-31" } } })],
    ["currency conflict", (s: ReturnType<typeof filing>) => ({ ...s, outcome: { ...s.outcome, basis: { ...basis, currency: "EUR" } } })],
    ["future outcome observation", (s: ReturnType<typeof filing>) => ({ ...s, outcome: { ...s.outcome, observedAt: "2026-10-14" } })],
  ])("rejects %s", (_name, mutate) => {
    const out = evaluateResearch(dataset([mutate(filing("A"))]));
    expect(out.accepted).toBe(0);
    expect(out.rejected).toHaveLength(1);
    expect(out.rejected[0]?.reasons.length).toBeGreaterThan(0);
  });
  it("rejects survivorship-filtered cohorts and missing delisting coverage", () => {
    const d = dataset([filing("A")]);
    expect(() => evaluateResearch({ ...d, universe: { ...d.universe, selection: "current_constituents_only" } })).toThrow(/survivorship/i);
    expect(() => evaluateResearch({ ...d, universe: { ...d.universe, includesDelisted: false } })).toThrow(/delist/i);
  });
  it("builds chronological holdouts and excludes training labels not available at cutoff", () => {
    const old = { ...filing("OLD"), analysisAt: "2023-01-01", predictionAvailableAt: "2023-01-01", inputsAvailableAt: ["2022-12-01"], prediction: { value: 12 }, ablations: {}, outcome: { ...filing("OLD").outcome, publishedAt: "2023-12-01", observedAt: "2023-12-02", period: { start: "2023-01-01", end: "2023-09-30" } }, period: { start: "2023-01-01", end: "2023-09-30" } };
    const late = { ...old, id: "LATE", outcome: { ...old.outcome, publishedAt: "2024-02-01", observedAt: "2024-02-02" } };
    const test = { ...filing("TEST"), event: { definition: "acquisition closes", probability: 0.8, outcome: 1, resolvedAt: "2025-02-01" } };
    const out = evaluateResearch(dataset([old, late, test]));
    expect(out.folds[0]).toMatchObject({ trainN: 1, labelsUnavailableAtCutoff: 1, testN: 1, status: "evaluated" });
    expect(out.folds[0]?.testIds).toEqual(["TEST"]);
    expect(out.folds[0]?.trainIds).toEqual(["OLD"]);
    expect(out.folds[0]?.events).toMatchObject([{ n: 1, brier: 0.04 }]);
  });
  it("uses proper observed binary labels for Brier/reliability and reports factual coverage and order sensitivity", () => {
    const a = { ...filing("A"), event: { definition: "revenue exceeds 9", probability: 0.8, outcome: 1, resolvedAt: "2025-02-01" }, writing: { adjudicatedAt: "2025-03-01", claims: ["supported", "contradicted", "unchecked"] }, orderProbe: { original: 50, permutations: [52, 49] } };
    const b = { ...filing("B"), event: { definition: "revenue exceeds 9", probability: 0.2, outcome: 0, resolvedAt: "2025-02-01" } };
    const out = evaluateResearch(dataset([a, b]));
    expect(out.events[0]).toMatchObject({ n: 2, brier: 0.04, definition: "revenue exceeds 9" });
    expect(out.events[0]?.reliability.filter((r) => r.n)).toMatchObject([{ n: 1, meanProbability: 0.2, observedRate: 0 }, { n: 1, meanProbability: 0.8, observedRate: 1 }]);
    expect(out.writing).toMatchObject({ materialClaims: 3, checkedClaims: 2, contradictedClaims: 1, uncheckedClaims: 1, coverage: 2 / 3, factualErrorRateAmongChecked: 0.5 });
    expect(out.orderSensitivity).toMatchObject({ n: 2, meanAbsoluteChange: 1.5, maxAbsoluteChange: 2 });
  });
  it("keeps stock/benchmark total-return horizons distinct from prospective SEC filing outcomes", () => {
    const a = filing("A");
    const stock = { ...a, id: "RETURN", kind: "total_return", metric: "excess_total_return", basis: { ...basis, unit: "fraction_total_return" }, period: { start: "2024-01-01", end: "2024-12-31" }, prediction: { value: 0.1 }, outcome: { publishedAt: "2025-01-02", observedAt: "2025-01-02", source: "frozen_total_returns", security: { totalReturn: 0.3, currency: "USD", period: a.period, includesDistributions: true, includesDelistingReturn: true }, benchmark: { totalReturn: 0.2, currency: "USD", period: a.period, includesDistributions: true } } };
    const out = evaluateResearch(dataset([a, stock]));
    expect(out.groups).toHaveLength(2);
    expect(out.groups.find((g) => g.kind === "total_return")).toMatchObject({ n: 1, model: { mae: 0 }, baseline: { name: "zero_excess_return", mae: 0.1 } });
    const wrong = { ...stock, outcome: { ...stock.outcome, benchmark: { ...stock.outcome.benchmark, period: { ...a.period, end: "2024-12-30" } } } };
    expect(evaluateResearch(dataset([wrong])).rejected).toHaveLength(1);
  });
  it("keeps future outcomes pending and withholds inference when issuer breadth has only one date", () => {
    const pending = { ...filing("PENDING"), outcome: null };
    const samples = Array.from({ length: 6 }, (_, i) => filing(`ISSUER${i}`, 10 + i, 10));
    const a = evaluateResearch(dataset([...samples, pending]));
    const b = evaluateResearch(dataset([...samples, pending]));
    expect(a).toEqual(b);
    expect(a.pending).toBe(1);
    expect(a.groups[0]?.uncertainty).toMatchObject({ available: false, readiness: "insufficient", issuerClusters: 6, nonoverlappingDateBlocks: 1 });
    const limited = evaluateResearch({ ...dataset([pending]), limitations: ["Single issuer reconstructed inputs; no historical holdout claim"] });
    expect(limited.limitations).toEqual(["Single issuer reconstructed inputs; no historical holdout claim"]);
    expect(limited.pendingSamples).toMatchObject([{ id: "PENDING", reason: "No observed outcome supplied" }]);
  });
  it("measures grade stability only across comparable methodology versions", () => {
    const a = { ...filing("A"), issuerId: "SAME", grade: { score: 80, version: "v1" } };
    const b = { ...filing("B"), issuerId: "SAME", analysisAt: "2024-04-01", predictionAvailableAt: "2024-04-01", grade: { score: 75, version: "v1" } };
    const c = { ...filing("C"), issuerId: "SAME", analysisAt: "2024-07-01", predictionAvailableAt: "2024-07-01", grade: { score: 95, version: "v2" } };
    expect(evaluateResearch(dataset([a, b, c])).gradeStability).toMatchObject({ pairs: 1, meanAbsoluteScoreChange: 5, incomparableVersionPairs: 1 });
  });
  it("refuses invalid probability labels and unknown currency instead of treating them as calibrated samples", () => {
    const invalid = { ...filing("A"), event: { definition: "beat", probability: 80, outcome: 1, resolvedAt: "2025-02-01" } };
    expect(evaluateResearch(dataset([invalid])).rejected).toHaveLength(1);
    const unknown = { ...filing("B"), basis: { ...basis, currency: "XXX" }, outcome: { ...filing("B").outcome, basis: { ...basis, currency: "XXX" } } };
    expect(evaluateResearch(dataset([unknown])).rejected).toHaveLength(1);
  });
  it("groups identical targets by basis and counts duplicate sample ids only once", () => {
    const usd = filing("USD");
    const eur = { ...filing("EUR"), basis: { ...basis, currency: "EUR" }, outcome: { ...filing("EUR").outcome, basis: { ...basis, currency: "EUR" } } };
    const out = evaluateResearch(dataset([usd, usd, eur]));
    expect(out.accepted).toBe(2);
    expect(out.groups).toHaveLength(2);
    expect(out.rejected).toMatchObject([{ id: "USD", reasons: ["duplicate sample identifier"] }]);
  });
  it("counts an actual outside the interval as a coverage miss", () => {
    const out = evaluateResearch(dataset([filing("A", 12, 10), filing("B", 12, 15)]));
    expect(out.groups[0]?.intervals).toMatchObject([{ n: 2, coverage: 0.5, meanWidth: 4 }]);
  });
});
