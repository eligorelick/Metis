import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { selectMaterialEvidence } from "@/pipeline/stageC/evidenceSelection";

// Synthetic long MD&A: crowded numeric operating discussion, followed by
// separate earnings-quality and post-period funding disclosures. No live data.
const earningsBridge = "Other income (expense), net was $7.1 billion in Q2 2026 and $11.6 billion for the six months ended June 30, 2026, primarily from upward adjustments to preferred stock and reclassification of gains on convertible notes.";
const investmentContext = "We invested $8.7 billion in Example Robotics preferred stock for the six months ended June 30, 2026, including $3.2 billion in Q2 2026.";
const subsequentFunding = "Subsequent to June 30, 2026, we funded the remaining commitment amount of $2.3 billion.";
const boilerplate = "Forward-looking statements are subject to risks and uncertainties; see the general cautionary language elsewhere in this filing.";
function longMdna(): string {
  return [
    ...Array.from({ length: 100 }, (_, i) => `Operating income and revenue for business ${i} were $18 billion and $91 billion in Q2 2026, versus $16 billion and $85 billion in Q2 2025; gross margin was 41% versus 39% and operating margin was 21% versus 19%.`),
    "OTHER INCOME (EXPENSE), NET", earningsBridge,
    "LIQUIDITY AND CAPITAL RESOURCES", investmentContext, subsequentFunding,
    "We expect capital expenditures of $17 billion to $19 billion in 2026.",
    "Income tax expense was $4.2 billion for the six months ended June 30, 2026.",
    "Free cash flow was $3.4 billion for the twelve months ended June 30, 2026.",
    boilerplate,
  ].join("\n");
}

describe("bounded material filing evidence", () => {
  it.each(["financial", "interim"] as const)("preserves distribution costs and their adjacent marketing offset in the %s reading", (profile) => {
    const definition = "Selling and marketing direct costs include traffic generation costs and private label and affiliate program commissions.";
    const driver = "Selling and marketing direct increased $199 million for the three months ended June 30, 2026, primarily driven by an increase in partner commissions to support revenue growth.";
    const offset = "The increase in the year-to-date period was partially offset by a decrease in marketing spend in the consumer segment, which had significant marketing leverage.";
    const original = `${longMdna()}\n${definition}\n${driver}\n${offset}`;
    const selected = selectMaterialEvidence(original, 8_000, profile);
    for (const sentence of [definition, driver, offset]) expect(selected.text).toContain(sentence);
    expect(selected.text.length).toBeLessThanOrEqual(8_000);
    expect(selected.coverage.categories).toEqual(expect.arrayContaining([expect.objectContaining({ category: "distribution-costs", status: "retained" })]));
    for (const span of selected.spans) expect(original.slice(span.start, span.end)).toBe(span.text);
  });
  it("withholds a referring marketing offset if its commission-driver context cannot fit", () => {
    const driver = `Selling and marketing direct increased $199 million from partner commissions ${"under the distribution agreement ".repeat(30)}.`;
    const offset = "The increase was partially offset by a decrease in consumer marketing spend.";
    const selected = selectMaterialEvidence(`${driver}\n${offset}`, 400, "interim");
    expect(selected.text).not.toContain(offset);
    expect(selected.text.length).toBeLessThanOrEqual(400);
  });
  it("retains investment-driven earnings explanations amid dense operating results", () => {
    const selected = selectMaterialEvidence(longMdna(), 8_000);
    expect(selected.text).toContain(earningsBridge);
    expect(selected.coverage.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "earnings-quality", status: "retained" }),
    ]));
  });

  it("retains subsequent funding with the preceding investment referent and period", () => {
    const selected = selectMaterialEvidence(longMdna(), 8_000);
    expect(selected.text).toContain(investmentContext);
    expect(selected.text).toContain(subsequentFunding);
    expect(selected.coverage.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "subsequent-liquidity", status: "retained" }),
    ]));
  });

  it("preserves exact nonoverlapping source spans within the cap and excludes low-value boilerplate", () => {
    const original = longMdna();
    const selected = selectMaterialEvidence(original, 8_000);
    expect(selected.text.length).toBeLessThanOrEqual(8_000);
    expect(selected.truncated).toBe(true);
    expect(selected.text).not.toContain(boilerplate);
    let previousEnd = 0;
    for (const span of selected.spans) {
      expect(span.start).toBeGreaterThanOrEqual(previousEnd);
      expect(original.slice(span.start, span.end)).toBe(span.text);
      expect(selected.text).toContain(span.text);
      previousEnd = span.end;
    }
    expect(selected.coverage.retainedChars + selected.coverage.omittedChars).toBe(original.length);
    expect(selectMaterialEvidence(original, 8_000)).toEqual(selected);
  });

  it("preserves all short input and reports unavailable families without inferring their absence", () => {
    const original = "Revenue was $3 billion in Q2 2026.";
    const selected = selectMaterialEvidence(original, 1_000);
    expect(selected.text).toBe(original);
    expect(selected.truncated).toBe(false);
    expect(selected.spans).toEqual([{ start: 0, end: original.length, text: original }]);
    expect(selected.coverage.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "earnings-quality", status: "not-found" }),
      expect.objectContaining({ category: "subsequent-liquidity", status: "not-found" }),
    ]));
  });

  it("omits an unbound remaining commitment when its investment context cannot fit", () => {
    const original = `We invested $8.7 billion in preferred stock subject to ${"contractual terms ".repeat(45)}for the six months ended June 30, 2026.\n${subsequentFunding}`;
    const selected = selectMaterialEvidence(original, 400);
    expect(selected.text).not.toContain(subsequentFunding);
    expect(selected.text.length).toBeLessThanOrEqual(400);
    expect(selected.coverage.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "subsequent-liquidity", status: "omitted", retainedPassages: 0 }),
    ]));
  });

  it("keeps available business-risk narrative even without a numeric or material-family keyword", () => {
    const narrative = "We rely on a concentrated supplier base, and interruptions may delay deliveries to customers.";
    const original = `Management discussion.\n${narrative}\n${"Operational description without numeric claims. ".repeat(100)}`;
    expect(selectMaterialEvidence(original, 800).text).toContain(narrative);
  });

  // AMZN audit 2026-10-20 finding 6: the revenue note's backlog (public text,
  // Amazon.com 10-Q for the quarter ended June 30, 2026) lost its family turn
  // to higher-scoring commitments; only the lead sentence, without the amount,
  // reached the passes.
  const rpoLead = "Additionally, we have performance obligations, primarily related to AWS, associated with commitments in customer contracts for future services that we expect to fulfill but have not yet been recognized in our financial statements.";
  const rpoAmount = "For contracts with original terms that exceed one year, those commitments not yet recognized were approximately $ 496 billion as of June 30, 2026.";
  const rpoLife = "The weighted-average remaining life of our long-term contracts is 6.4 years.";
  const crowdedNotes = (filler: number): string => [
    ...Array.from({ length: filler }, (_, i) => `Purchase obligations and supply commitments for program ${i} were $ ${i + 12}.1 billion, $ 8.4 billion and $ 3.2 billion, including guarantees of $ 1.${i % 10} billion.`),
    `${rpoLead} ${rpoAmount} ${rpoLife}`,
    ...Array.from({ length: filler }, (_, i) => `Unconditional purchase obligations and capacity agreements for site ${i} were $ ${i + 30}.5 billion, $ 6.1 billion and $ 2.7 billion as of June 30, 2026.`),
  ].join(" ");
  it("keeps a quantified remaining-performance-obligation backlog with its referent and life in crowded notes", () => {
    const original = crowdedNotes(120);
    const selected = selectMaterialEvidence(original, 14_000, "notes");
    expect(selected.text).toContain(`${rpoLead} ${rpoAmount} ${rpoLife}`);
    expect(selected.text.length).toBeLessThanOrEqual(14_000);
    expect(selected.coverage.categories).toContainEqual(expect.objectContaining({ category: "performance-obligations", status: "retained" }));
    for (const span of selected.spans) expect(original.slice(span.start, span.end)).toBe(span.text);
  });
  it("keeps the annual notes' remaining performance obligations and their twelve-month share (NVDA 10-K)", () => {
    const annual = readFileSync(path.join(process.cwd(), "fixtures", "edgar", "nvda-periodic-sections", "nvda-10k-fy2026-notes.txt"), "utf8");
    const selected = selectMaterialEvidence(annual, 10_000, "notes");
    expect(selected.text).toContain("revenue related to remaining performance obligations from contracts greater than one year in length was $ 2.3 billion");
    expect(selected.text).toMatch(/Approximately 42 % of revenue from contracts greater than one year in length will be recognized over the next twelve months/);
  });

  // AMZN audit 2026-10-20 finding 16: the antitrust cases brought by the FTC
  // and state attorneys general (public text, Amazon.com 10-Q for the quarter
  // ended June 30, 2026) named no notes family and no pending-case clause, so
  // only an orphaned "one class action has been certified" reached the passes.
  const antitrust = "Since March 2020, private litigants, state Attorneys General, and the Federal Trade Commission have filed cases in the U.S., Canada, and the United Kingdom alleging, among other things: price fixing arrangements between each of Amazon and its vendors and Amazon and its third-party sellers; abuse of dominance, monopolization, and attempted monopolization; and consumer protection and unjust enrichment claims, in violation of federal and state antitrust, state consumer protection, and Canadian and U.K. antitrust laws.";
  const relief = "These complaints seek billions of dollars of alleged damages, treble damages, punitive damages, injunctive relief, structural relief, civil penalties, attorneys’ fees, and costs.";
  // Synthetic: a dated trial, as legal notes state one.
  const trial = "The trial in the Federal Trade Commission’s case is scheduled to begin in February 2027.";
  const patentFiller = (i: number) => `In March 202${i % 6}, Example Patents ${i} LLC filed a complaint alleging that a device infringes U.S. Patent No. ${7_000_000 + i}; the complaint sought an unspecified amount of damages, enhanced damages, attorneys’ fees, costs, and interest of $ ${i + 1}.2 million.`;
  it.each([["notes", 14_000], ["risk", 14_000]] as const)("keeps government antitrust cases, the relief they seek and a dated trial in the %s reading", (profile, budget) => {
    const original = [...Array.from({ length: 200 }, (_, i) => patentFiller(i)), antitrust, relief, trial,
      ...Array.from({ length: 200 }, (_, i) => `Litigation and other contingencies of $ ${i + 2}.4 billion, $ 1.1 billion and $ 0.${i % 9} billion were accrued for tax matters and commitments.`)].join(" ");
    const selected = selectMaterialEvidence(original, budget, profile);
    for (const sentence of [antitrust, relief, trial]) expect(selected.text).toContain(sentence);
    expect(selected.text.length).toBeLessThanOrEqual(budget);
    for (const span of selected.spans) expect(original.slice(span.start, span.end)).toBe(span.text);
  });
  // Codex re-review of PR #42: a real case keeps its place when a later clause
  // only describes a possible consequence.
  it("keeps an actual government case whose sentence goes on to a possible consequence", () => {
    const sentence = "In 2023 the FTC filed a case alleging monopolization, which could result in structural relief.";
    for (const profile of ["notes", "risk"] as const) {
      const original = [...Array.from({ length: 300 }, (_, i) => `Collaboration revenue of $ ${i + 3}.1 billion and milestone payments of $ 0.${i % 9} billion were recognized under license agreements.`), sentence].join(" ");
      expect(selectMaterialEvidence(original, 4_000, profile).text).toContain(sentence);
    }
  });
  it("does not read a clinical trial's schedule as a pending case", () => {
    const original = [...Array.from({ length: 300 }, (_, i) => `Collaboration revenue of $ ${i + 3}.1 billion and milestone payments of $ 0.${i % 9} billion were recognized under license agreements.`),
      "The Phase 3 trial is scheduled to begin in February 2027."].join(" ");
    expect(selectMaterialEvidence(original, 4_000, "notes").text).not.toContain("Phase 3 trial");
  });
  // Independent review of the deferred AMZN fixes: the pending-case clauses
  // also kept clinical and commercial trials, a company's own divestitures,
  // hypothetical antitrust claims and "reports filed by us with the SEC".
  it.each([
    "Our Phase 2b trial of XR-12 is scheduled to begin in March 2027.",
    "The Phase IIb trial is scheduled for the second half of 2027.",
    "Our Phase 1/2 trial is set to begin in early 2027.",
    "The trial of our lead product candidate is scheduled to begin in 2027.",
    "Our free trial period is set for 30 days.",
    "The Company is seeking divestitures of certain non-core businesses.",
    "We may be subject to claims alleging that our pricing practices are anticompetitive.",
    "Additional information is included in reports filed by us with the Securities and Exchange Commission.",
    // Codex review of PR #42: a modal before any proceeding verb is a risk, not a case.
    "Regulators could bring actions alleging antitrust violations against us.",
    "Antitrust proceedings may seek structural relief, including divestitures of businesses.",
    "A court might impose fines of up to 10% of our worldwide revenue.",
  ])("does not read %j as a pending case", (sentence) => {
    for (const profile of ["notes", "risk"] as const) {
      const original = [...Array.from({ length: 300 }, (_, i) => `Collaboration revenue of $ ${i + 3}.1 billion and milestone payments of $ 0.${i % 9} billion were recognized under license agreements.`), sentence].join(" ");
      expect(selectMaterialEvidence(original, 4_000, profile).text).not.toContain(sentence);
    }
  });

  it.each([0, 1, 30, 210, 500])("does not invent retained evidence in a %i-character budget", (budget) => {
    const original = longMdna();
    const selected = selectMaterialEvidence(original, budget);
    expect(selected.text.length).toBeLessThanOrEqual(budget);
    for (const span of selected.spans) {
      expect(original.slice(span.start, span.end)).toBe(span.text);
      expect(selected.text).toContain(span.text);
    }
  });
});
