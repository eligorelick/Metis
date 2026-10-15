import { describe, expect, it } from "vitest";
import { evaluateResearch } from "@/evaluation/evaluation";

const basis = { currency: "USD", unit: "USD", shareBasis: "not_per_share" };
function sample(id: string) { return { id, issuerId: id, symbol: id, kind: "filing", snapshotHash: "a".repeat(64), analysisAt: "2024-01-01", predictionAvailableAt: "2024-01-01", inputsAvailableAt: ["2023-12-01"], membership: { includedAt: "2023-01-01", delistedAt: null }, basis, metric: "revenue", period: { start: "2024-01-01", end: "2024-12-31" }, prediction: { value: 120, baseline: { name: "flat", value: 140, availableAt: "2023-12-01" } }, outcome: { value: 100, publishedAt: "2025-02-01", observedAt: "2025-02-02", version: "initial", accession: "1-25-1", source: "sec_filing", period: { start: "2024-01-01", end: "2024-12-31" }, basis } }; }
function dataset(samples: unknown[]) { return { version: "research-evaluation-v1", evidenceKind: "synthetic_fixture", evaluatedAt: "2031-01-01", universe: { id: "all", formedAt: "2023-01-01", selection: "point_in_time", includesDelisted: true }, rolling: { firstTestAt: "2024-01-01", testWindowDays: 366, minTrainSamples: 1, minTestSamples: 1 }, samples }; }
describe("diagnostic breadth and comparability", () => {
  it("withholds an inferential interval for six issuers sharing one forecast date", () => {
    const out = evaluateResearch(dataset(Array.from({ length: 6 }, (_, i) => sample(String(i)))));
    expect(out.groups[0]?.uncertainty).toMatchObject({ available: false, readiness: "insufficient", issuerClusters: 6, nonoverlappingDateBlocks: 1 });
    expect(out.groups[0]?.uncertainty).not.toHaveProperty("mae");
  });
  it("does not pool legacy forecasts with the same annual period length and different forecast leads", () => {
    const a = sample("A"), b = sample("B"); const period = { start: "2029-01-01", end: "2029-12-31" };
    expect(evaluateResearch(dataset([a, { ...b, period, outcome: { ...b.outcome, period, publishedAt: "2030-02-01", observedAt: "2030-02-02" } }])).groups).toHaveLength(2);
  });
  it("reports equal-issuer loss and explicitly supplied point-in-time normalization without using the actual as a denominator", () => {
    const a = sample("A"), b = sample("B"), c = sample("C");
    const out = evaluateResearch(dataset([
      { ...a, issuerId: "ONE", prediction: { ...a.prediction, value: 102 }, normalization: { value: 10, availableAt: "2023-12-01" } },
      { ...b, issuerId: "ONE", prediction: { ...b.prediction, value: 104 }, normalization: { value: 10, availableAt: "2023-12-01" } },
      { ...c, issuerId: "TWO", prediction: { ...c.prediction, value: 106 }, normalization: { value: 20, availableAt: "2023-12-01" } },
    ]));
    expect(out.groups[0]).toMatchObject({ model: { mae: 4 }, equalIssuer: { issuerN: 2, mae: 4.5 }, normalized: { n: 3, model: { mae: expect.closeTo(0.3) }, pairedMaeImprovement: expect.closeTo(3.0333333333333337) } });
    const future = { ...a, normalization: { value: 10, availableAt: "2024-01-02" } };
    expect(evaluateResearch(dataset([future])).rejected[0]?.reasons).toContain("normalization_unavailable_at_analysis");
  });
  it("keeps binary event diagnostics with different forecast leads out of a shared Brier pool", () => {
    const event = { definition: "target met", probability: 0.8, outcome: 1, resolvedAt: "2030-02-01" };
    const a = { ...sample("A"), event }, b = sample("B"), period = { start: "2029-01-01", end: "2029-12-31" };
    const out = evaluateResearch(dataset([a, { ...b, event, period, outcome: { ...b.outcome, period, publishedAt: "2030-02-01", observedAt: "2030-02-02" } }]));
    expect(out.events).toHaveLength(2);
    expect(out.events.map(e => e.n)).toEqual([1, 1]);
    expect(out.events[0]?.brier).toBe(0.04);
  });
});
