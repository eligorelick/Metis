import { describe, expect, it } from "vitest";
import { buildBearFraming, buildBullFraming, buildJudgeFraming } from "@/pipeline/stageC/prompts";

/**
 * FIGR extra-high paid run (2026-11-02): the fact review (AUDIT-A2) and the
 * reasoning review (AUDIT-B2) found analysis errors the evidence did not
 * cause. Stored prose is immutable, so these are generic rules for future
 * runs, given to both analysts and the judge. Each case names the finding.
 */
const RULES: Array<[string, RegExp]> = [
  // B2-01 / A2-01: servicing-asset marks are revenue, yet the report called operating income clean of them.
  ["an item recorded in revenue is inside operating income", /recorded in revenue or operating expenses[^.]*is inside operating income/],
  ["operating income removes tax effects, not revenue marks", /removes income-tax effects, not revenue marks/],
  // B2-03 / A2-24: "the weak quarter holds the trailing multiple down".
  ["lower earnings raise a multiple", /lower earnings raise P\/E/],
  // B2-02 / A2-23: DuPont parent-income ROE set against common-income ROTE.
  ["one return basis", /parent-income ROE[^.]*common-income ROTE/],
  ["conditional normalization", /normalized[^.]*conditional on the stated tax and allocation assumptions/],
  // B2-06 / A2-02: TTM SBC add-back against a six-month figure, and add-back read as GAAP expense.
  ["matched windows", /twelve-month total against a six-month total is not a growth rate/],
  ["SBC bases", /cash-flow SBC add-back and allocated SBC expense are different measures/],
  // B2-07 / A2-17: "much of the disposal volume is tax withholding".
  ["share of a total needs the category total", /share of a total[^.]*only from that category's total over the same window/],
  // A2-03, A2-04, A2-11, B2-14: "the filings reviewed do not quantify ...".
  ["absence is scoped to the excerpts", /not in the retained excerpts/],
  // A2-09: a result inside the guided range called a beat.
  ["met versus beat", /within a guided range met it/],
  // A2-20, B2-09: liquidity "kept" after a later acquisition payment.
  ["post-transaction liquidity", /last reported balance does not show liquidity after a later transaction/],
  // A2-22: "bought with advertising rather than drawn by brand".
  ["no unsupported either/or cause", /either\/or cause/],
  // A2-25: "platform fees are growing fastest".
  ["scoped superlatives", /superlative[^.]*every line it ranks/],
  // B2-09: execution evidence is company results, not a measured personal record.
  ["executive attribution", /company results during an officer's tenure/],
  // B2-04 / A2-19: "no valuation measure suited to this lender is available" beside three sector-appropriate multiples.
  ["multiples versus anchors", /missing valuation anchor[^.]*not that no suitable multiple exists/],
  // A2-08 / B2-10: the Q2 guide and its above-range result were omitted.
  ["every retained guidance period", /every period for which both are retained, not only the latest/],
  // B2-05 / A2-16: a lower net take rate read as proof of pricing pass-through.
  ["KPI movement is not its cause", /possible explanations[^.]*unless the source states the cause/],
  // B2-18: DSCR, UPB and VIE were left unexplained.
  ["define specialist terms", /Define a specialist term[^.]*on first use/],
];

describe("FIGR extra-high audit rules reach every analysis role", () => {
  const framings = { bull: buildBullFraming(), bear: buildBearFraming(), judge: buildJudgeFraming(), sectionedJudge: buildJudgeFraming(undefined, true) };
  for (const [name, pattern] of RULES) {
    it(name, () => {
      for (const [role, text] of Object.entries(framings)) expect(text, role).toMatch(pattern);
    });
  }
});

// The judge explains the deterministic scores; the analysts do not receive that block.
const JUDGE_RULES: Array<[string, RegExp]> = [
  // A2-27: "the four aspects with no score are pulled toward the midpoint".
  ["route-excluded aspects do not move the composite", /no signal that applies on the route are left out of the composite and do not move it/],
  ["missing applicable evidence shrinks the composite, not the aspects", /distance from 50 is scaled by the\s+evidence-completeness share\. Unscored aspects are not themselves pulled toward any value/],
];

describe("FIGR extra-high audit rules for the judge's score explanation", () => {
  const framings = { judge: buildJudgeFraming(), sectionedJudge: buildJudgeFraming(undefined, true) };
  for (const [name, pattern] of JUDGE_RULES) {
    it(name, () => {
      for (const [role, text] of Object.entries(framings)) expect(text, role).toMatch(pattern);
    });
  }
});
