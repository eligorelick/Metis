import { describe, expect, it } from "vitest";
import { normalizeJudgeOutput } from "@/pipeline/stageC/passes";

// FIGR paid audit 2026-11-02 (AUDIT-B B-17): FACT claims carried the analyst's
// interpretation ("… from 4.0% in Q2 2025. In our judgment, falling
// monetization … argues against present pricing power."), so a citation that
// supports the figure also appeared to support the opinion.
const fact = (text: string) => ({ text, label: "FACT", source: "edgar:8-K EX-99.1", sourceId: "edgar:8-K EX-99.1", asOf: "2026-08-13" });
const judgment = (text: string) => ({ ...fact(text), label: "JUDGMENT" });
type Claims = { reasoning: unknown[] };
const reasoningOf = (raw: unknown) => (normalizeJudgeOutput({ competitive: { moatGraded: { reasoning: [raw] } } }) as { competitive: { moatGraded: Claims } }).competitive.moatGraded.reasoning;

describe("a FACT carries only its sourced statement (FIGR paid audit R4)", () => {
  it("moves an embedded 'In our judgment' sentence into its own JUDGMENT claim with the same citation", () => {
    expect(reasoningOf(fact("Net take rate fell to 3.6% in Q2 2026 from 4.0% in Q2 2025. In our judgment, falling monetization per dollar of volume argues against present pricing power, even if mix shift explains part of it."))).toEqual([
      fact("Net take rate fell to 3.6% in Q2 2026 from 4.0% in Q2 2025."),
      judgment("In our judgment, falling monetization per dollar of volume argues against present pricing power, even if mix shift explains part of it."),
    ]);
  });

  it("keeps every sentence from the first judgment on in the JUDGMENT claim", () => {
    expect(reasoningOf(fact("The 10-K lists brand awareness among competitive factors. In our view the filings offer no evidence of a brand premium. That may change."))).toEqual([
      fact("The 10-K lists brand awareness among competitive factors."),
      judgment("In our view the filings offer no evidence of a brand premium. That may change."),
    ]);
  });

  it("relabels a FACT that opens as a judgment", () => {
    expect(reasoningOf(fact("In our judgment the buyer side of the marketplace is still thin."))).toEqual([judgment("In our judgment the buyer side of the marketplace is still thin.")]);
  });

  it("leaves a FACT without a sentence-initial judgment, and every JUDGMENT or ESTIMATE, unchanged", () => {
    const plain = fact("Management states the reserve is adequate in its judgment, and the 10-Q repeats it.");
    expect(reasoningOf(plain)).toEqual([plain]);
    const own = judgment("Revenue grew. In our judgment growth will slow.");
    expect(reasoningOf(own)).toEqual([own]);
    const estimate = { ...fact("Consensus revenue is USD 886.33 million. In our judgment it is stale."), label: "ESTIMATE" };
    expect(reasoningOf(estimate)).toEqual([estimate]);
  });

  it("does not split a claim that stands alone outside a claim list", () => {
    const single = fact("The notes accrue interest at 8.500%. In our judgment the coupon is high.");
    const out = normalizeJudgeOutput({ catalystsRisks: { risks: [{ risk: "x", reasoning: single }] } }) as { catalystsRisks: { risks: { reasoning: unknown }[] } };
    expect(out.catalystsRisks.risks[0]!.reasoning).toEqual(single);
  });
});
