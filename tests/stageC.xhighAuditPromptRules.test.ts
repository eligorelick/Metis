import { describe, expect, it } from "vitest";
import { buildAnalystResearchFraming, buildBearFraming, buildBullFraming, buildJudgeFraming } from "@/pipeline/stageC/prompts";

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
  // A2-14: a first-half commitment increase blended with later financing events as "since then".
  ["balance-date changes and later events apart", /change between balance dates and a later event[^.]*in separate sentences, each dated/],
  // A2-15: two annual purchaser-concentration disclosures disagreed; the report chose one (rule from the prior round).
  ["conflicting passages are both cited", /two retained passages give different figures for one measure, say so and cite both/],
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
  ["lead with the business and investment debate", /summary leads with the business and the investment debate[^.]*what drives value[^.]*market is weighing/],
  ["interpret available multiples without an intrinsic or peer anchor", /no intrinsic value or peer median[^.]*P\/E on filed earnings, P\/B or P\/TBV[^.]*growth, returns\s+and earnings quality/],
  ["reserve an unjudgeable price for meaningless multiples", /price cannot be judged[^.]*only when no multiple is meaningful/],
  ["request market economics and sourced size, growth and share", /business\.marketStructure[^.]*size and growth[^.]*industry is structured[^.]*value accrues[^.]*position and share/],
  ["request named competitors and the basis of competition", /competitive\.competitors[^.]*10-K business excerpt[^.]*cited sources[^.]*how each competes[^.]*wins or loses/],
  ["do not invent market sizes", /FACT only with a source[^.]*JUDGMENT for interpretation[^.]*never invent market sizes/],
  // Q1 (owner request 2026-11-02): recent developments and management actions, as a sell-side analyst covers them.
  ["request at most eight dated recent developments, newest first", /verdict\.recentDevelopments[^.]*at most 8 dated developments[^.]*last six months, newest first/],
  ["developments are past events with cited facts and labelled judgments", /past events only[^.]*upcoming events are catalysts/],
  ["each development states what happened, why it matters, direction and the part of the case", /`whatHappened`[^.]*cited FACT[^.]*`whyItMatters`[^.]*JUDGMENT[^.]*`direction`[^.]*`affects`/],
  ["the verdict weighs the top development, catalyst and risk beside the numbers", /synthesis and the executive summary weigh the most important recent development and the top catalyst and risk alongside the numbers/],
  ["request at most eight dated management actions", /leadership\.managementActions[^.]*at most 8 dated actions[^.]*CEO, other executives or the board/],
  ["management actions cover the action types a sell-side analyst tracks", /Item 5\.02[^.]*strategy[^.]*acquisitions and divestitures[^.]*buybacks, dividends, debt raised or repaid[^.]*guidance raised, cut or reaffirmed[^.]*insider[^.]*10b5-1[^.]*compensation/],
  ["assess shareholder alignment and the record against earlier promises from evidence only", /`assessment`[^.]*aligned with shareholders[^.]*earlier stated plans or guidance[^.]*evidence only[^.]*never a guess at motive/],
  ["an actor is a role; a name belongs in a cited claim", /`actor` is a role[^.]*name a person only inside a cited claim/],
  ["the summary is cited claims, not prose", /`summary` is 2–3 cited JUDGMENT claims/],
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

// Review of the combined priority fixes (2026-11-03), findings 3 and 6.
describe("priority-fix review rules", () => {
  it.each([["bull", buildBullFraming()], ["bear", buildBearFraming()]])("the %s writer carries sourced market and competitor findings to the judge", (_side, framing) => {
    expect(framing).toContain("market and competitor findings that bear on your case");
    expect(framing).toContain("its fetched URL, so the judge can use them for the market-structure and competitor sections");
  });
  // Q1: the writers carry dated news and management findings as they carry market findings (D-172).
  it.each([["bull", buildBullFraming()], ["bear", buildBearFraming()]])("the %s writer carries dated news and management findings to the judge", (_side, framing) => {
    expect(framing).toMatch(/dated news and management findings[^.]*executive and board changes[^.]*capital-allocation and guidance decisions[^.]*insider trades[^.]*event date[^.]*recent-developments and management-actions sections/);
  });
  it.each(["bull", "bear"] as const)("the %s research request looks for recent developments and management actions", (side) => {
    expect(buildAnalystResearchFraming(side)).toMatch(/last six months[^.]*management and board actions[^.]*executive changes[^.]*acquisitions or divestitures[^.]*buybacks, dividends, debt[^.]*guidance changes/);
  });
  it("takes the price stance from sector-appropriate multiples on a named earnings basis, never an unverified provider EPS", () => {
    const judge = buildJudgeFraming();
    expect(judge).toContain("sector-appropriate");
    expect(judge).toContain("against the company's OWN growth, returns");
    expect(judge).toContain("provider-EPS multiple whose accounting basis is unverified");
  });
});

describe("paid-run completeness rules (D-182)", () => {
  const rules = [buildJudgeFraming(), buildJudgeFraming(undefined, true)].join(" ");
  it("asks for each material dated development and management action, without padding", () => {
    expect(rules).toMatch(/Include each material development the evidence dates[\s\S]{0,160}never pad/);
    expect(rules).toMatch(/Guidance issued with results, financings[\s\S]{0,200}never padding with routine items/);
  });
  it("describes the industry from the filing when no market size is sourced", () => {
    expect(rules).toMatch(/When no source states a market size, say so once and still describe the industry structure/);
    expect(rules).toContain("use [] only when neither discusses the industry");
  });
});

describe("fresh-filing caution rule (D-175)", () => {
  it("asks the summary to call figures from a filing SEC has not yet confirmed provisional", () => {
    const rules = [buildJudgeFraming(), buildJudgeFraming(undefined, true)].join(" ");
    expect(rules).toMatch(/manifest\.validation\.freshFiling[\s\S]{0,200}provisional because SEC data has not yet confirmed them/);
  });
});
