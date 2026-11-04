import { describe, expect, it } from "vitest";
import { compositeNote } from "@/report/assessment";
import type { Scoring } from "@/report/schema";

const WEIGHTS = { fundamentals: 20, valuation: 20, quality: 15, balanceSheet: 15, moat: 15, leadership: 10, technicals: 5 };

function scores(unscored: readonly (keyof typeof WEIGHTS)[], weights: Partial<typeof WEIGHTS> = {}): Scoring {
  const aspects = Object.fromEntries(Object.keys(WEIGHTS).map((key) => [key, {
    score: unscored.includes(key as keyof typeof WEIGHTS) ? null : 60,
    band: unscored.includes(key as keyof typeof WEIGHTS) ? null : "C",
    dataCompleteness: unscored.includes(key as keyof typeof WEIGHTS) ? 0 : 1,
  }]));
  return {
    aspects,
    composite: { score: 55, band: "C", weights: { ...WEIGHTS, ...weights }, methodology: "synthetic" },
  } as unknown as Scoring;
}

describe("a composite that lost an aspect says so", () => {
  it("names an unscored aspect and its weight, because its weight counts as neutral", () => {
    expect(compositeNote(scores(["valuation"]))).toMatch(/Valuation \(20% of the score\) has no score, so its weight counts as neutral/);
    expect(compositeNote(scores(["valuation"]))).toMatch(/Not directly comparable/);
  });

  it("names every unscored aspect", () => {
    const note = compositeNote(scores(["valuation", "balanceSheet"]));
    expect(note).toMatch(/Valuation \(20%\) and Balance sheet \(15%\) of the score have no score/);
  });

  it("does not mention an aspect the route gives no weight to", () => {
    expect(compositeNote(scores(["moat"], { moat: 0 }))).not.toMatch(/no score/);
  });

  it("leaves a fully scored composite's note unchanged", () => {
    const note = compositeNote(scores([]));
    expect(note).not.toMatch(/no score|counts as neutral|comparable/i);
    expect(note).toMatch(/^evidence for|^bands /);
  });

  it("still works for a caller that supplies no aspects", () => {
    const { composite, assessments } = scores(["valuation"]);
    expect(compositeNote({ composite, assessments })).not.toMatch(/no score/);
  });
});
