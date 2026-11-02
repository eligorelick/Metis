import { describe, expect, it } from "vitest";
import { sectionRequestInstruction } from "@/pipeline/stageC/continuation";
import { checkCarriedJudgeSections } from "@/pipeline/stageC/passes";
import { SHARED_RULES_BLOCK } from "@/pipeline/stageC/prompts";
import { JUDGE_OUTPUT_KEYS } from "@/report/schema";

/**
 * FIGR paid runs (2026-11-02, high and extra-high): the judge's first
 * catalystsRisks section was rejected both times because every catalyst and
 * risk carried `reasoning` as a LIST of claims. The schema takes one claim
 * there; the shared rule "put your interpretation in a separate JUDGMENT claim"
 * and the list-shaped `reasoning` fields of the sections written just before
 * pulled the model toward a list. A repair request rewrote the section each
 * time (about $1.71 at extra-high effort).
 */
const claim = (text: string, label = "FACT") => ({ text, label, source: "edgar:10-K item1A", asOf: "2025-12-31" });
const listShaped = {
  catalystsRisks: {
    catalysts: [{ title: "Q3 results", expectedDate: "2026-11-12", direction: "mixed", significance: "high",
      reasoning: [claim("Results are due 2026-11-12."), claim("Our judgment: the take rate decides it.", "JUDGMENT")] }],
    risks: [],
  },
};

describe("single-claim reasoning in catalysts and risks", () => {
  it("still rejects a list where the schema takes one claim (the repair stays the safety net)", () => {
    expect(checkCarriedJudgeSections(listShaped).dropped).toEqual(["catalystsRisks"]);
    const single = structuredClone(listShaped);
    single.catalystsRisks.catalysts[0]!.reasoning = claim("Results are due 2026-11-12; our judgment: the take rate decides it.", "JUDGMENT") as never;
    expect(checkCarriedJudgeSections(single).dropped).toEqual([]);
  });

  it("states the single-claim shape in the request that asks for catalystsRisks", () => {
    const text = sectionRequestInstruction({}, ["catalystsRisks", "outlook", "macro", "disagreements"], JUDGE_OUTPUT_KEYS);
    expect(text).toMatch(/each catalyst's and each risk's `reasoning` is ONE claim object/);
    expect(text).toMatch(/not an array/);
    expect(text).toMatch(/label it JUDGMENT/);
    expect(sectionRequestInstruction({}, ["verdict", "business"], JUDGE_OUTPUT_KEYS)).not.toMatch(/ONE claim object/);
  });

  it("states the exception beside the shared FACT/JUDGMENT split rule", () => {
    expect(SHARED_RULES_BLOCK).toMatch(/Put your interpretation of it in a separate JUDGMENT claim/);
    expect(SHARED_RULES_BLOCK).toMatch(/each catalyst's and each risk's `reasoning`\) takes one claim, never an array/);
  });
});
