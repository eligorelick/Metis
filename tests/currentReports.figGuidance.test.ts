import { describe, expect, it } from "vitest";
import { parseGuidance, parseGuidanceSentence } from "@/edgar/currentReports";
import { buildEarningsReleaseRecord, collectCurrentReports } from "@/providers/currentReports";
import type { EdgarClient, EdgarFiling } from "@/providers/edgar";

// Retained FIG EX-99.1 wording, accession 0001628280-26-053331, filed 2026-08-05.
// Unrelated product bullets are omitted; no network or ignored audit file is read.
const FIG_OUTLOOK = [
  "Third Quarter and Full Year 2026 Outlook:",
  "Based on information as of today, Figma is providing the following guidance:",
  "• Third Quarter 2026 Outlook:",
  "• Revenue between $373.0 million and $375.0 million, implying 36% year-over-year growth at the midpoint of the range.",
  "• Full Year 2026 Outlook:",
  "• Revenue between $1.463 billion and $1.467 billion, implying 39% year-over-year growth at the midpoint of the range and a raise of $40.0 million to Figma’s previously issued guidance.",
  "• Non-GAAP operating income between $125.0 million and $135.0 million, representing a non-GAAP operating margin of 9% at the midpoint of the range.",
].join(" ");
const FIG_RELEASE = "Figma Announces Second Quarter 2026 Financial Results. " +
  "Revenue for the quarter ended June 30, 2026 was $370.1 million, up 48% year-over-year. " +
  FIG_OUTLOOK + " Conference Call Details: Figma will host a conference call today, August 5, 2026.";
const filing: EdgarFiling = {
  accessionNumber: "0001628280-26-053331", filingDate: "2026-08-05", reportDate: "2026-08-05",
  form: "8-K", items: "2.02,9.01", primaryDocument: "cover.htm",
};
const releaseUrl = "https://www.sec.gov/Archives/edgar/data/1579878/000162828026053331/q226pressrelease.htm";

describe("compact dated guidance in the FIG release", () => {
  it("retains the quarterly and annual ranges and the annual non-GAAP operating-income basis", () => {
    const release = buildEarningsReleaseRecord({ filing, releaseUrl, commentaryUrl: null, releaseText: FIG_RELEASE,
      commentaryText: null, includeNarrative: true });
    expect(release.guidance?.period?.label).toBe("Q3 FY2026");
    expect(release.guidance?.items.map(i => [i.period.label, i.metric, i.basis, i.symbol, i.low, i.mid, i.high])).toEqual([
      ["Q3 FY2026", "revenue", "unspecified", "$", 373e6, 374e6, 375e6],
      ["FY2026", "revenue", "unspecified", "$", 1.463e9, 1.465e9, 1.467e9],
      ["FY2026", "operating-income", "non-gaap", "$", 125e6, 130e6, 135e6],
    ]);
    expect(release.guidanceExhibit).toBe("EX-99.1");
    expect(release.releaseUrl).toBe(releaseUrl);
    expect(release.reported).toMatchObject({ fiscal: { label: "Q2 FY2026" }, periodEnd: "2026-06-30" });
    expect(release.guidance?.unparsed).toEqual([]);
  });

  it("binds a compact range to its immediately preceding dated outlook heading", () => {
    const guidance = parseGuidance("Third Quarter 2026 Outlook: Revenue between $373.0 million and $375.0 million. " +
      "Full Year 2026 Outlook: Non-GAAP operating income between $125.0 million and $135.0 million.");
    expect(guidance?.items.map(i => [i.period.label, i.metric, i.low, i.high])).toEqual([
      ["Q3 FY2026", "revenue", 373e6, 375e6], ["FY2026", "operating-income", 125e6, 135e6],
    ]);
  });

  it("does not import actuals before the outlook or compact ranges after the next section", () => {
    const actuals = "Second Quarter 2026 Results: Revenue between $360.0 million and $370.0 million. ";
    const after = " Conference Call Details: Revenue between $900.0 million and $950.0 million.";
    const guidance = parseGuidance(actuals + "Third Quarter 2026 Outlook: Revenue between $373.0 million and $375.0 million." + after);
    expect(guidance?.items.map(i => [i.period.label, i.low, i.high])).toEqual([["Q3 FY2026", 373e6, 375e6]]);
    expect(parseGuidance(actuals)).toBeNull();
    expect(parseGuidanceSentence("Revenue between $373.0 million and $375.0 million.",
      { label: "Q3 FY2026", fiscalYear: 2026, fiscalQuarter: 3 })).toEqual([]);
  });

  it("carries a changed dated heading into a conventional expectation sentence", () => {
    const guidance = parseGuidance("Third Quarter 2026 Outlook: • Revenue between $373.0 million and $375.0 million. " +
      "Full Year 2026 Outlook: • We expect revenue to be between $1.463 billion and $1.467 billion.");
    expect(guidance?.items.map(i => [i.period.label, i.low, i.high])).toEqual([
      ["Q3 FY2026", 373e6, 375e6], ["FY2026", 1.463e9, 1.467e9],
    ]);
  });

  it.each([
    "Third Quarter 2026 Outlook: Revenue between $1.463 billion and $1.467 billion, for full year 2026.",
    "Full Year 2026 Outlook: Revenue between $373 million and $375 million, for the third quarter of 2026.",
  ])("refuses a range whose explicit period conflicts with its heading: %s", text => {
    const parsed = parseGuidance(text);
    expect(parsed?.items).toEqual([]);
    expect(parsed?.unparsed).toHaveLength(1);
  });

  it("does not treat a comparison-base period as the compact range's forecast period", () => {
    const parsed = parseGuidance("Third Quarter 2026 Outlook: Revenue between $373 million and $375 million, compared with revenue for the third quarter of 2025.");
    expect(parsed?.items.map(i => [i.period.label, i.low, i.high])).toEqual([["Q3 FY2026", 373e6, 375e6]]);
  });

  it.each(["Revenue between", "We expect revenue to be between"])("does not choose a period from an undifferentiated combined heading: %s", prefix => {
    expect(parseGuidance(`Third Quarter and Full Year 2026 Outlook: ${prefix} $373.0 million and $375.0 million.`))
      .toMatchObject({ items: [] });
  });

  it.each([
    "Revenue growth between 35% and 39%, an increase of $40.0 million.",
    "Revenue increased between $30.0 million and $40.0 million.",
    "Revenue between $373.0 million and the high three hundreds.",
    "Revenue between $375.0 million and $373.0 million.",
    "Revenue between $373.0 million and €375.0 million.",
  ])("leaves an unsupported compact observation unparsed: %s", (sentence) => {
    expect(parseGuidance(`Third Quarter 2026 Outlook: ${sentence}`)).toMatchObject({ items: [] });
  });

  it("keeps an unsupported bullet visible as an extraction limit, not a missing outlook", () => {
    const guidance = parseGuidance("Third Quarter 2026 Outlook: • Revenue between $373.0 million and the high three hundreds.");
    expect(guidance).toMatchObject({ period: { label: "Q3 FY2026" }, items: [] });
    expect(guidance?.unparsed.join(" ")).toContain("Revenue between $373.0 million and the high three hundreds");
  });
});

describe("current-report guidance extraction disclosures", () => {
  const collected = async (text: string) => {
    const sourced = <T,>(data: T, endpoint: string) => ({ ok: true as const, value: {
      data, source: "edgar" as const, endpoint, asOf: filing.filingDate, fetchedAt: "2026-08-05T20:10:00Z",
    } });
    const client = {
      filingIndexHeaders: async () => sourced({ documents: [{ type: "EX-99.1", filename: "q226pressrelease.htm" }],
        typeByFilename: { "q226pressrelease.htm": "EX-99.1" } }, "fixture:index"),
      fetchFilingDocument: async () => sourced(`<html><body>${text}</body></html>`, releaseUrl),
    } as unknown as EdgarClient;
    const result = await collectCurrentReports(client, "1579878", [filing], "2026-11-01", "fixture:submissions");
    if (!result.ok) throw new Error(result.gap.reason);
    return result.value.data;
  };

  it("does not describe an unreadable explicit outlook as absent", async () => {
    const result = await collected("Figma Announces Second Quarter 2026 Financial Results. " +
      "Third Quarter 2026 Outlook: Revenue between $373.0 million and the high three hundreds.");
    expect(result.releases[0]?.guidance).toMatchObject({ items: [] });
    expect(result.notes.join(" ")).toMatch(/outlook section was found|could not be read|not read as guidance/);
    expect(result.notes.join(" ")).not.toMatch(/no outlook section/);
  });

  it("describes a null parse as an extraction limit without claiming the source has no outlook", async () => {
    const result = await collected("Figma Announces Second Quarter 2026 Financial Results. " +
      "Business Outlook: Our revenue guidance for 2026 remains under review.");
    expect(result.releases[0]?.guidance).toBeNull();
    expect(result.notes.join(" ")).toMatch(/no structured guidance.*extract/i);
    expect(result.notes.join(" ")).not.toMatch(/no outlook section/);
  });
});
