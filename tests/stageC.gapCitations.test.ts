/**
 * D-43 (2026-10-13) — every tag the payload prints is citable, and what a
 * citation of it can support depends on what the row shows.
 *
 * Reports 25 (META) and 26 (JPM) logged as unknown-source every claim citing
 * a tag the prompt told the model to cite but the verifier never registered:
 * an n/a row ("net debt/EBITDA: n/a [computed.capital.netDebtToEbitda · …]"),
 * a money row of unknown currency (peer market caps, compensation totals,
 * the consensus price target), and the missing-data manifest, whose lines had
 * no tag at all, so the model wrote the source "unsupported".
 *
 * These tests pin both halves of the fix, on the real assembled payload:
 *  1. a number-free statement citing such a row now verifies;
 *  2. nothing that failed before for a real reason now passes — a number on
 *     an absence, a currency on a figure of unknown currency, a person or
 *     title the cited row does not give, a weight the row does not show.
 */

import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import type { DataBundle } from "@/pipeline/types";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import {
  assembleContextPayload,
  manifestCitationId,
  serializePayloadForPrompt,
  type ContextPayload,
} from "@/pipeline/stageC/payload";
import type { JudgeOutput } from "@/report/schema";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

const VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;

function fmpRows<T>(rows: T[], asOf: string, endpoint: string) {
  return {
    ok: true as const,
    value: { data: { rows, raw: {} }, asOf, source: "fmp" as const, endpoint, fetchedAt: "2026-07-06T00:00:00.000Z" },
  };
}

function build(bank: boolean, edit: (bundle: DataBundle) => void = () => {}): ContextPayload {
  const bundle = completeCurrencyBundle({ bank });
  edit(bundle);
  return assembleContextPayload(bundle, runStageB(bundle), VALIDATION);
}

async function verify(payload: ContextPayload, root: object) {
  return runVerifyPass({} as PassDeps, payload, root as unknown as JudgeOutput, { fetchedUrls: [] });
}

function fact(text: string, source: string, asOf: string | null) {
  return { text, label: "FACT", source, asOf };
}

describe("every printed tag resolves to a registry record (D-43)", () => {
  it.each([false, true])("bank route %s: computed sections and manifest", (bank) => {
    const payload = build(bank);
    const prompt = serializePayloadForPrompt(payload);
    const ids = new Set([
      ...(payload.provenanceRegistry ?? []).map((record) => record.id),
      ...(payload.citationRegistry ?? []).map((record) => record.id),
    ]);
    // Assembler-owned tags: an id with a provider prefix or a dotted path,
    // optionally dated. Severity markers ("[warn]") and degradation actions
    // carry neither.
    const tags = [...prompt.matchAll(/\[([a-z][\w:.()\-/]*[:.][\w:.()\-/]*)(?: · \d{4}-\d{2}-\d{2})?\]/gi)].map((m) => m[1]);
    expect(tags.length).toBeGreaterThan(20);
    expect(tags.filter((tag) => !ids.has(tag))).toEqual([]);
  });

  it("registers a bank's n/a rows and manifest entries as gaps, and shows no weights where nothing is weighted", () => {
    const payload = build(true);
    const citations = payload.citationRegistry ?? [];
    expect(citations).toContainEqual({
      id: "computed.capital.netDebtToEbitda", kind: "payload-gap", asOf: "2025-12-31", origin: "computed.capital.netDebtToEbitda",
    });
    expect(citations).toContainEqual({
      id: "computed.scores.balanceSheet", kind: "payload-gap", asOf: null, origin: "computed.scores.balanceSheet",
    });
    expect(citations).toContainEqual({
      id: "computed.projections", kind: "payload-gap", asOf: null, origin: "computed.projections",
    });
    expect(citations).toContainEqual({
      id: "manifest.financialMetrics.cet1Reported", kind: "payload-gap", asOf: null, origin: "financialMetrics.cet1Reported",
    });
    const prompt = serializePayloadForPrompt(payload);
    expect(prompt).toContain("- weighted projections: n/a [computed.projections]");
    expect(prompt).toMatch(/financialMetrics\.cet1Reported: .* \[manifest\.financialMetrics\.cet1Reported\]/);
    expect(prompt).not.toContain("computed.projections.scenarioWeights");
    // The general route weights its projections and shows the weights as a row.
    expect(serializePayloadForPrompt(build(false))).toContain(
      "- scenario weights bull/base/bear in percent (fixed, unbacktested prior; not calibrated probabilities): 25/50/25 [computed.projections.scenarioWeights]",
    );
  });

  it("leaves a manifest field that cannot be one source id untagged", () => {
    expect(manifestCitationId("fmp.insiderTradingSearch(JPM)")).toBe("manifest.fmp.insiderTradingSearch(JPM)");
    expect(manifestCitationId("a field")).toBeNull();
    expect(manifestCitationId("x[1]")).toBeNull();
  });
});

describe("a citation of an absence supports the absence only (D-43)", () => {
  it("verifies report 26's gap statements and rejects a number on the same rows", async () => {
    const payload = build(true);
    const root = {
      balanceSheet: {
        coverage: [
          // Report 26 balanceSheet.coverage.commentary[3], verbatim.
          fact("EBIT interest coverage is not meaningful for this bank; interest expense is part of its operating economics.", "computed.capital.interestCoverage", "2025-12-31"),
          // The fabrication the guard exists for: verified without it (simulated 2026-10-13).
          fact("Net debt/EBITDA is 1.2x.", "computed.capital.netDebtToEbitda", "2025-12-31"),
          fact("The CET1 ratio (as reported) is withheld.", "manifest.financialMetrics.cet1Reported", null),
          fact("Tier 1 capital and Form 4 activity for FY2025 are not in the 10-K excerpt reviewed.", "manifest.financialMetrics.cet1Reported", null),
          { text: "No quantitative balance-sheet score is available. The C grade is a provisional judgment.", label: "JUDGMENT", source: "computed.scores.balanceSheet", asOf: null },
          { text: "Numerical probability-weighted revenue and EPS forecasts are unavailable.", label: "JUDGMENT", source: "computed.projections", asOf: null },
        ],
      },
      keyNumbers: [{ value: 1.2, unit: "x", source: "computed.capital.netDebtToEbitda", asOf: "2025-12-31", verified: false }],
    };
    const result = await verify(payload, root);
    const reasonOf = (text: string) => result.log.find((entry) => entry.claim === text && entry.check === undefined)?.reason;
    expect(reasonOf("EBIT interest coverage is not meaningful for this bank; interest expense is part of its operating economics.")).toBe("supported");
    expect(reasonOf("Net debt/EBITDA is 1.2x.")).toBe("gap-source-number");
    expect(reasonOf("The CET1 ratio (as reported) is withheld.")).toBe("supported");
    expect(reasonOf("Tier 1 capital and Form 4 activity for FY2025 are not in the 10-K excerpt reviewed.")).toBe("supported");
    expect(result.coverage.factualClaims).toEqual({ supported: 3, total: 4, rate: 0.75 });
    expect(result.coverage.judgments).toEqual({ cited: 2, total: 2, rate: 1 });
    // A structured number on an n/a row says what the row is, not "text-source".
    expect(result.log.find((entry) => entry.evidenceKind === "number")?.reason).toBe("gap-source-number");
  });

  it("lets the weights row support only the weights it shows", async () => {
    const payload = build(false);
    const result = await verify(payload, {
      notes: [
        { text: "The scenario weights are a fixed 25/50/25 prior, not calibrated probabilities.", label: "JUDGMENT", source: "computed.projections.scenarioWeights", asOf: null },
        { text: "The scenario weights are a fixed 30/40/30 prior.", label: "JUDGMENT", source: "computed.projections.scenarioWeights", asOf: null },
      ],
    });
    expect(result.log.map((entry) => entry.reason)).toEqual(["supported", "value-mismatch"]);
  });

  // Review 2026-10-13: each of these verified before the reviewer's guards.
  it("rejects a number written in words or glued to a currency code on an absence", async () => {
    const payload = build(true);
    const texts = [
      "Net debt/EBITDA is two times.",
      "Net debt is EUR5bn.",
      "Net debt runs at twice EBITDA.",
    ];
    const result = await verify(payload, {
      notes: texts.map((text) => fact(text, "computed.capital.netDebtToEbitda", "2025-12-31")),
    });
    expect(result.log.map((entry) => entry.reason)).toEqual(["gap-source-number", "gap-source-number", "gap-source-number"]);
  });

  // Review of D-48: "12-1 month" read as the numbers 12 and 1, so an absence
  // written in the row's own label failed. The window name is a label; a
  // figure on the same n/a row still fails.
  it("lets an absence on the withheld 12-1 month row use the row's own label", async () => {
    const payload = build(false);
    expect(serializePayloadForPrompt(payload)).toContain(
      "- relative strength vs SPY, 12-1 month (latest month skipped): n/a [computed.technicals.relativeStrength.12m1m]",
    );
    const result = await verify(payload, {
      notes: [
        fact("The 12-1 month relative strength vs SPY is not available.", "computed.technicals.relativeStrength.12m1m", null),
        fact("Relative strength vs SPY over the 12-1-month window is withheld.", "computed.technicals.relativeStrength.12m1m", null),
        fact("The 12-1 month relative strength vs SPY is 8pp.", "computed.technicals.relativeStrength.12m1m", null),
      ],
    });
    expect(result.log.map((entry) => entry.reason)).toEqual(["supported", "supported", "gap-source-number"]);
  });

  it("lets the weights row support its numbers only in the row's own order", async () => {
    const result = await verify(build(false), {
      notes: [
        // 50 is one of the row's numbers, but it is the base weight, not the bull's.
        { text: "The bull scenario carries a 50% weight.", label: "JUDGMENT", source: "computed.projections.scenarioWeights", asOf: null },
        { text: "Bull, base and bear are weighted 25%, 50% and 25%.", label: "JUDGMENT", source: "computed.projections.scenarioWeights", asOf: null },
        { text: "The base case is weighted twice the bull case.", label: "JUDGMENT", source: "computed.projections.scenarioWeights", asOf: null },
      ],
    });
    expect(result.log.map((entry) => entry.reason)).toEqual(["value-mismatch", "supported", "value-mismatch"]);
  });
});

describe("rows of unestablished currency support number-free prose only (D-43)", () => {
  const withRows = (bundle: DataBundle): void => {
    const b = bundle as unknown as Record<string, unknown>;
    b.peers = fmpRows([{ symbol: "C", companyName: "Citigroup Inc.", mktCap: 221_304_234_781 }], "2026-07-01", "stock-peers");
    b.compensation = fmpRows([
      { nameAndPosition: "Douglas Petno Co-CEO, Commercial & Investment Bank", year: 2025, total: 20_062_612, filingDate: "2026-04-06" },
    ], "2026-07-01", "executive-compensation");
  };

  it("registers the printed tags as unestablished, with the currency flagged unknown", () => {
    const citations = build(false, withRows).citationRegistry ?? [];
    for (const [id, asOf] of [
      ["fmp:stock-peers", "2026-07-01"],
      ["fmp:executive-compensation", "2026-04-06"],
      ["fmp:price-target-consensus", "2026-07-01"],
    ] as const) {
      expect(citations).toContainEqual({ id, kind: "payload-unestablished", asOf, origin: id, currencyUnknown: true });
    }
  });

  it("verifies report 26's number-free claims and rejects a number or a currency on the same rows", async () => {
    const payload = build(false, withRows);
    const claims = [
      // Report 26 competitive.moatGraded.reasoning[4] and valuation.graded.reasoning[5], verbatim.
      { text: "Peer records disclose market capitalization with unspecified currencies, not comparable profitability or valuation multiples. They do not establish a relative-valuation premium or discount.", label: "JUDGMENT", source: "fmp:stock-peers", asOf: null },
      { text: "The analyst-consensus target has an undisclosed currency. It is not used as a comparable USD scenario value or as evidence of a probability-weighted return.", label: "JUDGMENT", source: "fmp:price-target-consensus", asOf: null },
      // Report 26 leadership.executives[3].evidence.compensation[0], verbatim.
      fact("The annual compensation record identifies Douglas Petno as Co-CEO of Commercial & Investment Bank. The compensation currency is undisclosed, and no preceding-year comparison for him appears in the available annual table.", "fmp:executive-compensation", "2026-04-06"),
      fact("The consensus target is $781.", "fmp:price-target-consensus", "2026-07-01"),
      fact("Citigroup's market capitalization is 221.3 billion.", "fmp:stock-peers", "2026-07-01"),
      fact("The compensation record identifies Douglas Petno as CEO.", "fmp:executive-compensation", "2026-04-06"),
    ];
    const result = await verify(payload, {
      leadership: { executives: [{ name: "Douglas Petno", evidence: { compensation: [claims[2]] } }] },
      notes: [claims[0], claims[1], claims[3], claims[4], claims[5]],
      peerTable: [{ value: 221_304_234_781, unit: "currency", source: "fmp:stock-peers", asOf: "2026-07-01", verified: false }],
    });
    const coverage = (text: string) => result.log.find((entry) => entry.claim === text && entry.check === undefined);
    expect(coverage(claims[0].text)).toMatchObject({ outcome: "unverified", validationStatus: "cited" });
    expect(coverage(claims[1].text)).toMatchObject({ outcome: "unverified", validationStatus: "cited" });
    expect(coverage(claims[2].text)).toMatchObject({ outcome: "unverified", validationStatus: "cited" });
    expect(coverage(claims[3].text)).toMatchObject({ outcome: "unverified", reason: "currency-not-established" });
    expect(coverage(claims[4].text)).toMatchObject({ outcome: "unverified", reason: "gap-source-number" });
    expect(coverage(claims[5].text)).toMatchObject({ outcome: "unverified", reason: "named-individual-title-mismatch" });
    // The peer cap itself still never verifies as a number.
    expect(result.log.find((entry) => entry.evidenceKind === "number")).toMatchObject({ outcome: "unverified", reason: "gap-source-number" });
  });

  // Review 2026-10-13: before the reviewer's fixes every one of these
  // verified on the compensation row's tag — a name no list or pattern knew
  // was invisible, and a title written "is the CEO" or before the name was
  // never read.
  it("rejects a person the compensation rows do not list, or a title they do not give, however it is written", async () => {
    const payload = build(false, withRows);
    const texts = [
      "Sheryl Sandberg is CEO.",
      "Douglas Petno is the CEO.",
      "CEO Douglas Petno received the largest award.",
      "The firm's CFO, Douglas Petno, received the largest award.",
    ];
    const result = await verify(payload, {
      notes: texts.map((text) => fact(text, "fmp:executive-compensation", "2026-04-06")),
    });
    const coverage = (text: string) => result.log.find((entry) => entry.claim === text && entry.check === undefined);
    expect(coverage(texts[0])).toMatchObject({ outcome: "unverified", reason: "named-individual-not-in-source" });
    for (const text of texts.slice(1)) {
      expect(coverage(text), text).toMatchObject({ outcome: "unverified", reason: "named-individual-title-mismatch" });
    }
    // The row's own wording still verifies.
    const right = await verify(payload, {
      notes: [fact("Douglas Petno is the Co-CEO of Commercial & Investment Bank.", "fmp:executive-compensation", "2026-04-06")],
    });
    expect(right.log[0]).toMatchObject({ outcome: "unverified", validationStatus: "cited" });
  });
});
