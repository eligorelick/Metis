import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ClaimCorpusSchema, evaluateClaimBenchmark, hashClaimCase, hashClaimCorpus, hashClaimText, hashSourceText, type ClaimCorpus, type ClaimCase } from "../src/evaluation/claimBenchmark";

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
function sample(id = "a", label: "supported" | "contradicted" | "insufficient" | "mixed" = "supported"): ClaimCase {
  const text = "SYNTHETIC: Alpha revenue increased 10% in 2025.";
  const item = {
    id, claim: { text: "Alpha revenue increased 10% in 2025.", sha256: sha("Alpha revenue increased 10% in 2025."), issuer: "SYNTHETIC-ALPHA", asOf: "2026-01-01", period: { start: "2025-01-01", end: "2025-12-31" } },
    sources: [{ id: "s", text, sha256: sha(text), issuer: "SYNTHETIC-ALPHA", publishedAt: "2025-12-31", period: { start: "2025-01-01", end: "2025-12-31" } }],
    spans: [{ sourceId: "s", start: 11, end: text.length, text: text.slice(11) }],
    reference: { kind: "synthetic" as const, label, caseHash: "0".repeat(64), rationale: "Synthetic test expectation, not human review." },
  };
  item.reference.caseHash = hashClaimCase(item);
  return item;
}
function corpus(cases = [sample()]): ClaimCorpus { return { schemaVersion: "claim-corpus/v1", kind: "synthetic", description: "Plainly synthetic controls", cases }; }
function predictions(c: ClaimCorpus, outputs: unknown[] = []) {
  return { schemaVersion: "claim-predictions/v1", checker: { id: "test-checker", version: "1" }, corpusHash: hashClaimCorpus(c), outputs };
}
function output(c: ClaimCorpus, id: string, label = "supported", scope = "whole-claim") { return { caseId: id, caseHash: hashClaimCase(c.cases.find(x => x.id === id)!), scope, label }; }
// Protocol-only declarations for tests, never real human review or corpus evidence.
function human(item = sample(), labels = ["supported", "supported"]) {
  return { schemaVersion: "claim-corpus/v1", kind: "human-reviewed", description: "Operator declared review", cases: [{ ...item, reference: { kind: "human-reviewed", reviews: labels.map((label, i) => ({ reviewerId: `reviewer-${i}`, role: "independent", independent: true, scope: "whole-claim", label, caseHash: hashClaimCase(item) })) } }] };
}

describe("offline claim benchmark", () => {
  it("hashes exact UTF8 retained bytes without normalization and excludes edited evidence", () => {
    expect(hashSourceText("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashClaimText("é")).not.toBe(hashClaimText("e\u0301"));
    const c = corpus(); c.cases[0].sources[0].text += " ";
    expect(evaluateClaimBenchmark(c, predictions(c)).excluded[0].reasons).toContain("source-hash-mismatch");
  });
  it("binds reviews to claim, source and metadata, even after component hashes are repaired", () => {
    for (const edit of [(x: ClaimCase) => { x.claim.issuer = "OTHER"; }, (x: ClaimCase) => { x.sources[0].publishedAt = "2025-12-30"; }, (x: ClaimCase) => { x.claim.text += " Allegation."; x.claim.sha256 = sha(x.claim.text); }]) {
      const c = corpus(); edit(c.cases[0]);
      expect(evaluateClaimBenchmark(c, predictions(c)).excluded[0].reasons).toContain("review-case-hash-mismatch");
    }
  });
  it("excludes invalid or ambiguous spans, duplicate cases and incomplete reference labels", () => {
    const c = corpus([sample("badspan"), sample("duplicate"), sample("duplicate")]); c.cases[0].spans[0].start++;
    const result = evaluateClaimBenchmark(c, predictions(c));
    expect(result.eligibleCases).toBe(0); expect(result.excluded).toHaveLength(3);
    expect(result.excluded[0].reasons).toContain("invalid-source-span");
    expect(result.excluded[1].reasons).toContain("duplicate-case-id");
    expect(() => evaluateClaimBenchmark({ ...corpus(), unexpected: true }, predictions(corpus()))).toThrow();

  });
  it("requires two distinct independent whole-claim human reviewers or a distinct third adjudicator", () => {
    const h = human(); const p = () => predictions(h as ClaimCorpus);
    expect(evaluateClaimBenchmark(h, p()).eligibleCases).toBe(1);
    h.cases[0].reference.reviews[1].reviewerId = "reviewer-0";
    expect(evaluateClaimBenchmark(h, p()).eligibleCases).toBe(0);
    const conflict = human(sample(), ["supported", "contradicted"]);
    expect(evaluateClaimBenchmark(conflict, predictions(conflict as ClaimCorpus)).eligibleCases).toBe(0);
    conflict.cases[0].reference.reviews.push({ reviewerId: "third", role: "adjudicator", independent: true, scope: "whole-claim", label: "mixed", caseHash: hashClaimCase(conflict.cases[0]) });
    expect(evaluateClaimBenchmark(conflict, predictions(conflict as ClaimCorpus)).references).toEqual({ a: "mixed" });
    const missing = human(sample(), ["supported"]);
    expect(evaluateClaimBenchmark(missing, predictions(missing as ClaimCorpus)).eligibleCases).toBe(0);
  });
  it("keeps foreign-issuer and future evidence as insufficient adversarial controls", () => {
    const c = corpus([sample("foreign", "insufficient"), sample("future", "insufficient"), sample("period", "insufficient")]);
    c.cases[0].sources[0].issuer = "SYNTHETIC-BETA"; c.cases[1].sources[0].publishedAt = "2026-02-01"; c.cases[2].sources[0].period.end = "2024-12-31"; c.cases[2].sources[0].period.start = "2024-01-01";
    c.cases.forEach(x => { if (x.reference.kind === "synthetic") x.reference.caseHash = hashClaimCase(x); });
    const result = evaluateClaimBenchmark(c, predictions(c)); expect(result.eligibleCases).toBe(3);
    expect(result.evidenceChallenges).toHaveLength(3);
    const h = human(c.cases[0]); expect(evaluateClaimBenchmark(h, predictions(h as ClaimCorpus)).excluded[0].reasons).toContain("inadmissible-human-reference"); const insufficient = human(c.cases[0], ["insufficient", "insufficient"]); expect(evaluateClaimBenchmark(insufficient, predictions(insufficient as ClaimCorpus)).eligibleCases).toBe(1);
  });
  it("uses all eligible cases as agreement denominator and separately reports attempted agreement", () => {
    const c = corpus([sample("a"), sample("b", "contradicted"), sample("c", "mixed"), sample("d", "insufficient"), sample("e"), sample("f"), sample("g"), sample("h")]);
    const outs = [output(c, "a"), output(c, "b"), output(c, "c", "mixed"), output(c, "d", "abstain"), output(c, "e", "supported", "numeric-only"), output(c, "f"), output(c, "f"), { ...output(c, "g"), caseHash: "0".repeat(64) }, { ...output(c, "a"), caseId: "unknown" }];
    const r = evaluateClaimBenchmark(c, predictions(c, outs));
    expect(r.metrics).toEqual({ eligible: 8, attempted: 3, agreed: 2, coverage: 3 / 8, agreementAllEligible: 2 / 8, agreementAttempted: 2 / 3, predictedSupported: 2, falseSupported: 1, supportedPrecision: 1 / 2 });
    expect(r.statusCounts).toEqual({ assessed: 3, abstained: 1, numericOnly: 1, duplicateOutput: 1, hashMismatch: 1, missing: 1 });
    expect(r.unknownOutputs).toEqual(["unknown"]); expect(r.confusion.supported.supported).toBe(1); expect(r.confusion.contradicted.supported).toBe(1);
  });
  it("rejects manifest mismatch and invalid dates, unicode, source intervals, unknown fields and synthetic/human mixing", () => {
    const c = corpus(); expect(() => evaluateClaimBenchmark(c, { ...predictions(c), corpusHash: "0".repeat(64) })).toThrow(/corpus hash/i);
    c.cases[0].claim.asOf = "2025-02-30"; expect(ClaimCorpusSchema.safeParse(c).success).toBe(false);
    c.cases[0].claim.asOf = "2026-01-01"; c.cases[0].sources[0].text = "\ud800"; expect(ClaimCorpusSchema.safeParse(c).success).toBe(false);
    expect(ClaimCorpusSchema.safeParse({ ...corpus(), kind: "human-reviewed" }).success).toBe(false);
  });
});

it("rejects non-independent or partial-scope human reviews and reviewer/adjudicator collisions", () => {
  const independent = human();
  const invalidIndependence = JSON.parse(JSON.stringify(independent)); invalidIndependence.cases[0].reference.reviews[0].independent = false;
  expect(ClaimCorpusSchema.safeParse(invalidIndependence).success).toBe(false);
  const partial = JSON.parse(JSON.stringify(independent)); partial.cases[0].reference.reviews[0].scope = "numeric-only";
  expect(ClaimCorpusSchema.safeParse(partial).success).toBe(false);
  const collision = human(sample(), ["supported", "contradicted"]);
  collision.cases[0].reference.reviews.push({ reviewerId: " REVIEWER-0 ", role: "adjudicator", independent: true, scope: "whole-claim", label: "mixed", caseHash: hashClaimCase(collision.cases[0]) });
  expect(evaluateClaimBenchmark(collision, predictions(collision as ClaimCorpus)).excluded[0].reasons).toContain("duplicate-reviewer-identity");
  const noConflict = human(); noConflict.cases[0].reference.reviews.push({ reviewerId: "third", role: "adjudicator", independent: true, scope: "whole-claim", label: "supported", caseHash: hashClaimCase(noConflict.cases[0]) });
  expect(evaluateClaimBenchmark(noConflict, predictions(noConflict as ClaimCorpus)).eligibleCases).toBe(0);
});
it("fails closed on corrupted claim hash, absent sources, reversed spans and duplicate source IDs", () => {
  for (const mutate of [(c: ClaimCase) => { c.claim.sha256 = "0".repeat(64); }, (c: ClaimCase) => { c.spans[0].sourceId = "missing"; }, (c: ClaimCase) => { c.spans[0].end = c.spans[0].start; }, (c: ClaimCase) => { c.sources.push({ ...c.sources[0] }); }]) {
    const c = corpus(); mutate(c.cases[0]); expect(evaluateClaimBenchmark(c, predictions(c)).eligibleCases).toBe(0);
  }
  const c = corpus(); c.cases[0].sources[0].period.start = "2026-12-31";
  expect(ClaimCorpusSchema.safeParse(c).success).toBe(false);
});
it("discloses outputs for excluded cases and null metrics when nothing is assessable", () => {
  const c = corpus(); c.cases[0].claim.sha256 = "0".repeat(64);
  const r = evaluateClaimBenchmark(c, predictions(c, [output(c, "a")]));
  expect(r.outputsForExcludedCases).toEqual(["a"]);
  expect(r.metrics).toMatchObject({ eligible: 0, attempted: 0, agreementAllEligible: null, agreementAttempted: null, coverage: null, supportedPrecision: null });
  const good = corpus(); expect(evaluateClaimBenchmark(good, predictions(good)).metrics.agreementAllEligible).toBe(0);
});
it("retains future-claim challenges and includes every metadata field in review binding", () => {
  const c = corpus([sample("future-claim", "insufficient")]); c.cases[0].claim.period.end = "2026-01-02";
  if (c.cases[0].reference.kind === "synthetic") c.cases[0].reference.caseHash = hashClaimCase(c.cases[0]);
  expect(evaluateClaimBenchmark(c, predictions(c)).evidenceChallenges[0].reasons).toContain("claim-period-after-cutoff");
  const h = human(); h.cases[0].reference.reviews[0].caseHash = "0".repeat(64);
  expect(evaluateClaimBenchmark(h, predictions(h as ClaimCorpus)).excluded[0].reasons).toContain("review-case-hash-mismatch");
});
it("rejects malformed checker outputs and discloses duplicates even for unknown cases", () => {
  const c = corpus(); const unknown = { ...output(c, "a"), caseId: "unknown" };
  expect(evaluateClaimBenchmark(c, predictions(c, [unknown, unknown])).duplicateOutputIds).toEqual(["unknown"]);
  for (const malformed of [{ ...output(c, "a"), unexpected: true }, { ...output(c, "a"), label: "true" }, { ...output(c, "a"), scope: "numbers" }]) {
    expect(() => evaluateClaimBenchmark(c, predictions(c, [malformed]))).toThrow();
  }
});
it("never upgrades a numeric-only compound match into whole-claim support", () => {
  const c = corpus(); c.cases[0].claim.text += " Management fabricated customer contracts."; c.cases[0].claim.sha256 = hashClaimText(c.cases[0].claim.text);
  if (c.cases[0].reference.kind === "synthetic") { c.cases[0].reference.label = "mixed"; c.cases[0].reference.caseHash = hashClaimCase(c.cases[0]); }
  const result = evaluateClaimBenchmark(c, predictions(c, [output(c, "a", "supported", "numeric-only")]));
  expect(result.metrics).toMatchObject({ eligible: 1, attempted: 0, agreed: 0, predictedSupported: 0, supportedPrecision: null, agreementAllEligible: 0 });
  expect(result.statusCounts.numericOnly).toBe(1);
});

it("assesses admissibility of every retained source, including an unspanned second source", () => {
  for (const change of [(s: ClaimCase["sources"][number]) => { s.publishedAt = "2027-01-01"; }, (s: ClaimCase["sources"][number]) => { s.issuer = "OTHER-ISSUER"; }, (s: ClaimCase["sources"][number]) => { s.period = { start: "2024-01-01", end: "2024-12-31" }; }]) {
    const item = sample(); const extra = structuredClone(item.sources[0]); extra.id = "unspanned"; change(extra); item.sources.push(extra);
    const supported = human(item); const supportedResult = evaluateClaimBenchmark(supported, predictions(supported as ClaimCorpus, [output(supported as ClaimCorpus, "a")]));
    expect(supportedResult.eligibleCases).toBe(0); expect(supportedResult.evidenceChallenges).toHaveLength(1);
    expect(supportedResult.excluded[0].reasons).toContain("inadmissible-human-reference");
    const insufficient = human(item, ["insufficient", "insufficient"]);
    expect(evaluateClaimBenchmark(insufficient, predictions(insufficient as ClaimCorpus)).eligibleCases).toBe(1);
    const synthetic = corpus([item]); if (item.reference.kind === "synthetic") { item.reference.label = "insufficient"; item.reference.caseHash = hashClaimCase(item); }
    expect(evaluateClaimBenchmark(synthetic, predictions(synthetic)).eligibleCases).toBe(1);
  }
});
