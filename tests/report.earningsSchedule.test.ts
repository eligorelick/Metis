import { describe, expect, it } from "vitest";
import { isCountedClaimEntry } from "@/report/claimMatching";
import { guardEarningsSchedule } from "@/report/earningsSchedule";

const note = "next scheduled earnings date per provider calendar (a provider schedule, not a company confirmation): 2026-11-04 [finnhub:earnings-calendar · 2026-11-01]";

describe("provider earnings-date qualification boundaries", () => {
  it.each(["Earnings rose 5% year over year; the special dividend is payable 2026-11-04.", "Earnings rose 5%, the dividend is payable 2026-11-04."])("keeps coincident dividend dates: %s", text => {
    const input = { verdict: { executiveSummary: [{ text, label: "FACT", source: "fmp:profile", asOf: "2026-11-01" }] } };
    expect(guardEarningsSchedule(input, [note])).toMatchObject({ report: input, log: [] });
  });
  it("keeps registered SEC confirmation", () => {
    const input = { verdict: { executiveSummary: [{ text: "Company confirmed it will report results on 2026-11-04 in its 8-K.", label: "FACT", source: "edgar:8-K", asOf: "2026-11-01" }] } };
    expect(guardEarningsSchedule(input, [note], [{ id: "edgar:8-K", kind: "payload-text", origin: "edgar:8-K", asOf: "2026-11-01" }])).toMatchObject({ report: input, log: [] });
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
    expect(out.report.outlook.scenarioNarratives.y1[0]!.text).toContain("Finnhub calendar estimate; company confirmation not established");
    expect(out.report.outlook.scenarioNarratives.y1[0]!.asOf).toBe("2026-11-01");
    expect(out.report.appendix).toEqual(input.appendix);
    expect(out.log[0]!.claim).toBe(input.outlook.scenarioNarratives.y1[0]!.text);
    expect(guardEarningsSchedule(out.report, [note]).log).toEqual([]);
    expect(input).toEqual(before);
  });
});
