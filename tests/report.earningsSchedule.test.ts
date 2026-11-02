import { describe, expect, it } from "vitest";
import { isCountedClaimEntry } from "@/report/claimMatching";
import { guardEarningsSchedule } from "@/report/earningsSchedule";

const note = "next scheduled earnings date per provider calendar (a provider schedule, not a company confirmation): 2026-11-04 [finnhub:earnings-calendar · 2026-11-01]";

describe("provider earnings-date qualification boundaries", () => {
  const figrNote = "next scheduled earnings date per provider calendar (a provider schedule, not a company confirmation): 2026-11-12 [fmp:earnings-calendar · 2026-11-02]";
  const news = "2026-10-22 [news] GlobeNewswire: Figure Technology Solutions Announces Date for Third Quarter 2026 Results — Figure Technology Solutions will report third quarter results on November 12, 2026. [fmp:news · 2026-10-22]";
  const context = { issuerName: "Figure Technology Solutions, Inc.", newsNotes: [news], passages: [] };
  it("uses one company-announced newswire status across claims, expected cells and scenario strings", () => {
    const input = { summary: { text: "Results are due 2026-11-12.", label: "FACT", source: "fmp:news" },
      catalysts: [{ name: "Q3 results", expected: "November 12, 2026" }], scenarios: ["The results call on 12 November 2026 could clarify growth."] };
    const result = guardEarningsSchedule(input, [figrNote], [{ id: "fmp:news", kind: "payload-text", origin: "fmp:news", asOf: "2026-10-22" }], [], context);
    for (const text of [result.report.summary.text, result.report.catalysts[0]!.expected, result.report.scenarios[0]!]) {
      expect(text).toContain("company-announced via newswire on 2026-10-22");
      expect(text).not.toContain("calendar estimate");
    }
    expect(result.report.summary.label).toBe("FACT");
    expect(guardEarningsSchedule(result.report, [figrNote], [], [], context).log).toEqual([]);
  });
  it("recognizes issuer authorship when the provider company name includes the quoted class", () => {
    const result = guardEarningsSchedule({ text: "Results are due 2026-11-12.", label: "FACT", source: "fmp:news" }, [figrNote], [], [], {
      ...context, issuerName: "Figure Technology Solutions Inc. Class A Common Stock",
    });
    expect(result.report.text).toContain("company-announced via newswire on 2026-10-22");
  });
  it.each(["2026-11-12", "November 12, 2026", "12 November 2026"])("qualifies vendor-only dates spelled %s", date => {
    const result = guardEarningsSchedule({ scenarios: [`Results are due ${date}.`] }, [figrNote]);
    expect(result.report.scenarios[0]).toContain("FMP calendar estimate");
  });
  it("does not treat a third-party article mentioning the issuer and date as an issuer announcement", () => {
    const result = guardEarningsSchedule({ text: "Results are due 2026-11-12.", label: "FACT", source: "fmp:news" }, [figrNote], [], [], {
      ...context, newsNotes: [news.replace("Figure Technology Solutions Announces Date for Third Quarter 2026 Results", "Analyst previews Figure Technology Solutions earnings")],
    });
    expect(result.report.text).toContain("FMP calendar estimate");
  });
  it("does not infer issuer authorship from a third-party headline repeating an announcement", () => {
    const result = guardEarningsSchedule({ text: "Results are due 2026-11-12.", label: "FACT", source: "fmp:news" }, [figrNote], [], [], {
      ...context, newsNotes: [news.replace("GlobeNewswire:", "Reuters:")],
    });
    expect(result.report.text).toContain("FMP calendar estimate");
  });
  it("does not exempt an SEC citation whose passage does not establish the event date", () => {
    const result = guardEarningsSchedule({ text: "Results are due 2026-11-12.", label: "FACT", source: "edgar:8-K" }, [figrNote],
      [{ id: "edgar:8-K", kind: "payload-text", origin: "edgar:8-K", asOf: "2026-10-22" }], [],
      { issuerName: context.issuerName, newsNotes: [], passages: [{ source: "edgar:8-K", text: "On November 12, 2026, a dividend is payable. Prior earnings rose 5%.", asOf: "2026-10-22" }] });
    expect(result.report.text).toContain("FMP calendar estimate");
  });
  it("does not treat a negated or speculative schedule in an SEC passage as confirmation", () => {
    const result = guardEarningsSchedule({ text: "Results are due 2026-11-12.", label: "FACT", source: "edgar:8-K" }, [figrNote],
      [{ id: "edgar:8-K", kind: "payload-text", origin: "edgar:8-K", asOf: "2026-10-22" }], [],
      { issuerName: null, newsNotes: [], passages: [{ source: "edgar:8-K", text: "It is not confirmed whether results will be reported on November 12, 2026.", asOf: "2026-10-22" }] });
    expect(result.report.text).toContain("FMP calendar estimate");
  });
  it("does not confuse the month May with speculative wording in a confirmed schedule", () => {
    const input = { text: "Results are due May 12, 2026.", label: "FACT", source: "edgar:8-K" };
    const mayNote = figrNote.replace("2026-11-12", "2026-05-12").replace("2026-11-02", "2026-05-01");
    expect(guardEarningsSchedule(input, [mayNote], [{ id: "edgar:8-K", kind: "payload-text", origin: "edgar:8-K", asOf: "2026-05-01" }], [],
      { issuerName: null, newsNotes: [], passages: [{ source: "edgar:8-K", text: "Company will report results on May 12, 2026.", asOf: "2026-05-01" }] }).report).toEqual(input);
  });
  it.each(["Earnings rose 5% year over year; the special dividend is payable 2026-11-04.", "Earnings rose 5%, the dividend is payable 2026-11-04."])("keeps coincident dividend dates: %s", text => {
    const input = { verdict: { executiveSummary: [{ text, label: "FACT", source: "fmp:profile", asOf: "2026-11-01" }] } };
    expect(guardEarningsSchedule(input, [note])).toMatchObject({ report: input, log: [] });
  });
  // A spaced em/en dash separates clauses just like a semicolon (written as
  // escapes so file encoding cannot change the character).
  it.each(["Earnings rose 5% year over year \u2014 the special dividend is payable 2026-11-04.",
    "Earnings rose 5% year over year \u2013 the special dividend is payable 2026-11-04."])("keeps a dividend date after a dash: %s", text => {
    const input = { verdict: { executiveSummary: [{ text, label: "FACT", source: "fmp:profile", asOf: "2026-11-01" }] } };
    expect(guardEarningsSchedule(input, [note])).toMatchObject({ report: input, log: [] });
  });
  // A bare date phrase set off by a comma still belongs to the event clause beside it.
  it.each(["On 2026-11-04, Figma will report third-quarter results.",
    "Figma will report results after the close on Wednesday, 2026-11-04."])("qualifies an earnings date in a bare date phrase: %s", text => {
    const input = { verdict: { executiveSummary: [{ text, label: "FACT", source: "finnhub:earnings-calendar", asOf: "2026-11-01" }] } };
    const out = guardEarningsSchedule(input, [note]);
    expect(out.report.verdict.executiveSummary[0]!.text).toContain("2026-11-04 (Finnhub calendar estimate; not confirmed by an SEC filing or a company-hosted release)");
    expect(out.report.verdict.executiveSummary[0]!.label).toBe("ESTIMATE");
    expect(out.log).toHaveLength(1);
  });
  it("qualifies only the comma piece that states the event when the same date appears twice", () => {
    const text = "Results are due 2026-11-04, and the dividend is payable 2026-11-04.";
    const input = { verdict: { executiveSummary: [{ text, label: "FACT", source: "finnhub:earnings-calendar", asOf: "2026-11-01" }] } };
    expect(guardEarningsSchedule(input, [note]).report.verdict.executiveSummary[0]!.text).toBe(
      "Results are due 2026-11-04 (Finnhub calendar estimate; not confirmed by an SEC filing or a company-hosted release), and the dividend is payable 2026-11-04.");
  });
  // R9: the model's own assertion about a release is not retained source evidence.
  // With no source passage supplied, this event remains vendor-calendar-only.
  it("keeps a vendor qualification when only model prose asserts that a newswire release exists", () => {
    const fmpNote = "next scheduled earnings date per provider calendar (a provider schedule, not a company confirmation): 2026-11-12 [fmp:earnings-calendar · 2026-11-02]";
    const text = "The provider earnings calendar schedules the Q3 2026 report for 2026-11-12, and a company newswire release of 2026-10-22 gives the same date.";
    const input = { catalystsRisks: { catalysts: [{ reasoning: { text, label: "JUDGMENT", source: "fmp:earnings-calendar", asOf: "2026-11-02" } }] } };
    const out = guardEarningsSchedule(input, [fmpNote]).report.catalystsRisks.catalysts[0]!.reasoning.text;
    expect(out).toBe("The provider earnings calendar schedules the Q3 2026 report for 2026-11-12 (FMP calendar estimate; not confirmed by an SEC filing or a company-hosted release), and a company newswire release of 2026-10-22 gives the same date.");
    expect(out).not.toContain("company confirmation not established");
  });
  // Pre-run check for the FIGR extra-high run (2026-11-02): the high-effort report's
  // executive summary wrote "(scheduled for 2026-11-12)" and the qualifier nested a
  // second parenthesis inside it. Inside parentheses the qualifier follows a comma.
  it("qualifies a date already inside parentheses without nesting a second parenthesis", () => {
    const fmpNote = "next scheduled earnings date per provider calendar (a provider schedule, not a company confirmation): 2026-11-12 [fmp:earnings-calendar · 2026-11-02]";
    const text = "Three things would move the view. A Q3 2026 report (scheduled for 2026-11-12) showing revenue tracking volume at the top of guidance would make the price look undemanding.";
    const input = { verdict: { executiveSummary: [{ text, label: "JUDGMENT", source: "fmp:earnings-calendar", asOf: "2026-11-02" }] } };
    const out = guardEarningsSchedule(input, [fmpNote]);
    const qualified = out.report.verdict.executiveSummary[0]!.text;
    expect(qualified).toBe("Three things would move the view. A Q3 2026 report (scheduled for 2026-11-12, an FMP calendar estimate not confirmed by an SEC filing or a company-hosted release) showing revenue tracking volume at the top of guidance would make the price look undemanding.");
    expect(qualified).not.toMatch(/\([^()]*\(/);
    expect(out.log).toHaveLength(1);
    // Idempotent: a second pass over its own output adds nothing.
    const again = guardEarningsSchedule(out.report, [fmpNote]);
    expect(again.report.verdict.executiveSummary[0]!.text).toBe(qualified);
    expect(again.log).toHaveLength(0);
  });
  it("keeps registered SEC confirmation", () => {
    const input = { verdict: { executiveSummary: [{ text: "Company confirmed it will report results on 2026-11-04 in its 8-K.", label: "FACT", source: "edgar:8-K", asOf: "2026-11-01" }] } };
    expect(guardEarningsSchedule(input, [note], [{ id: "edgar:8-K", kind: "payload-text", origin: "edgar:8-K", asOf: "2026-11-01" }], [],
      { issuerName: null, newsNotes: [], passages: [{ source: "edgar:8-K", text: "Company will report results on 2026-11-04.", asOf: "2026-11-01" }] })).toMatchObject({ report: input, log: [] });
  });
  it("keeps a registered official company source without trusting an unregistered source name", () => {
    const source = "https://issuer.example/news/results";
    const input = { verdict: { executiveSummary: [{ text: "Company will report results on 2026-11-04.", label: "FACT", sourceId: source, source: "legacy", asOf: "2026-11-01" }] } };
    const registry = [{ id: source, kind: "payload-text" as const, origin: source, asOf: "2026-11-01" }];
    expect(guardEarningsSchedule(input, [note], registry, [source],
      { issuerName: null, newsNotes: [], passages: [{ source, text: "Company will report results on 2026-11-04.", asOf: "2026-11-01" }] })).toMatchObject({ report: input, log: [] });
    expect(guardEarningsSchedule(input, [note], [], [source]).log).toHaveLength(1);
  });
  it("does not count qualification audit rows as another claim", () => {
    const input = { verdict: { executiveSummary: [{ text: "Earnings are due 2026-11-04.", label: "FACT", source: "finnhub:earnings-calendar", asOf: "2026-11-01" }] } };
    const out = guardEarningsSchedule(input, [note]);
    expect(out.log).toHaveLength(1);
    expect(out.log.filter(entry => isCountedClaimEntry(entry, "factual-claim"))).toEqual([]);
  });
  it("does not apply an earnings qualification to a date in a different sentence", () => {
    const input = { verdict: { executiveSummary: [{ text: "The results exceeded expectations. The filing was signed on 2026-11-04.", label: "FACT", source: "edgar:8-K", asOf: "2026-11-04" }] } };
    expect(guardEarningsSchedule(input, [note])).toMatchObject({ report: input, log: [] });
  });

  it("uses only a validated assembler-owned note and does not edit dates or log metadata", () => {
    const input = { outlook: { scenarioNarratives: { y1: [{ text: "Earnings are due 2026-11-04.", label: "ESTIMATE", source: "finnhub:earnings-calendar", asOf: "2026-11-01" }] } },
      appendix: { verificationLog: [{ claim: "Earnings are due 2026-11-04." }] } };
    const before = structuredClone(input);
    for (const bad of [note.replace("2026-11-04", "2026-02-30"), note.replace("finnhub", "untrusted"), `Source said ${note}`]) {
      expect(guardEarningsSchedule(input, [bad]).log).toEqual([]);
    }
    const out = guardEarningsSchedule(input, [note]);
    expect(out.report.outlook.scenarioNarratives.y1[0]!.text).toContain("Finnhub calendar estimate; not confirmed by an SEC filing or a company-hosted release");
    expect(out.report.outlook.scenarioNarratives.y1[0]!.asOf).toBe("2026-11-01");
    expect(out.report.appendix).toEqual(input.appendix);
    expect(out.log[0]!.claim).toBe(input.outlook.scenarioNarratives.y1[0]!.text);
    expect(guardEarningsSchedule(out.report, [note]).log).toEqual([]);
    expect(input).toEqual(before);
  });
});
