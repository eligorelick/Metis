import { describe, expect, it } from "vitest";
import { parseGuidance } from "@/edgar/currentReports";
import { parseDocument } from "@/edgar/extract";
import { buildFilingDisclosures, nextPeriodRevenueGuidance } from "@/pipeline/filingDisclosures";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

// Synthetic issuer, periods and amounts. No retained provider response or filing.
const introduction = "Guidance Based on current market conditions, Juniper Homes is providing initial guidance for fiscal 2029 including:";
const bullets = [
  "Consolidated revenues in the range of $18.0 billion to $20.0 billion",
  "Homes closed by homebuilding operations of 45,000 homes to 50,000 homes",
  "Income tax rate of approximately 24.5%",
  "Consolidated cash flow provided by operations of approximately $2.2 billion",
  "Share repurchases of approximately $1.7 billion",
  "Dividend payments of approximately $300 million",
];
const guidanceText = `${introduction} \u2022 ${bullets.join(" \u2022 ")} The Company plans to also provide guidance for its first quarter of fiscal 2029 on its conference call today. Conference Call and Webcast Details The Company will host a call today.`;

describe("explicit annual guidance bullet scope", () => {
  it("retains annual revenue and tax without assigning the later conference-call quarter", () => {
    const guidance = parseGuidance(guidanceText);
    expect(guidance?.items.map(item => [item.metric, item.period.label, item.low, item.mid, item.high, item.form])).toEqual([
      ["revenue", "FY2029", 18e9, 19e9, 20e9, "range"],
      ["tax-rate", "FY2029", 24.5, 24.5, 24.5, "approximate"],
    ]);
    expect(guidance?.items.every(item => item.period.fiscalQuarter === null)).toBe(true);
    expect(guidance?.unparsed).toHaveLength(4);
    expect(guidance?.unparsed.join(" ")).toContain("45,000 homes");
    expect(guidance?.unparsed.join(" ")).toContain("$2.2 billion");
    for (const item of guidance?.items ?? []) {
      expect(guidanceText.slice(item.span!.start, item.span!.end)).toBe(item.span!.text);
      expect(guidanceText.slice(item.headerSpan!.start, item.headerSpan!.end)).toBe(introduction);
    }
  });

  it("preserves the annual source rows through the filing disclosure table without creating a quarterly anchor", () => {
    const document = parseDocument(`<h1>Juniper Reports Fourth Quarter Fiscal 2028 Results</h1><p>Quarter ended September 30, 2028.</p><p>${guidanceText}</p>`);
    const release = buildEarningsReleaseRecord({ filing: { accessionNumber: "synthetic-annual-guide", filingDate: "2028-10-30" },
      releaseUrl: "https://www.sec.gov/synthetic-guide.htm", commentaryUrl: null, releaseText: document.fullText,
      releaseDocument: document, commentaryText: null, includeNarrative: true });
    const bundle = completeCurrencyBundle({ annualCurrency: "USD", quarterlyRevenue: 5_000 });
    bundle.builtAt = "2028-11-05T00:00:00Z";
    bundle.edgar.currentReports = { ok: true, value: { source: "edgar", endpoint: release.releaseUrl!, asOf: "2028-10-30", fetchedAt: bundle.builtAt,
      data: { version: CURRENT_REPORTS_VERSION, releases: [release], events: [], notes: [] } } };
    expect(release.guidanceExhibit).toBe("EX-99.1");
    expect(buildFilingDisclosures(bundle)?.guidance?.rows.map(row => [row.metric, row.period, row.mid])).toEqual([
      ["revenue", "FY2029", 19e9], ["tax-rate", "FY2029", 24.5],
    ]);
    expect(nextPeriodRevenueGuidance(bundle)).toBeNull();
  });

  it.each([
    ["unscaled endpoint", "$18.0 to $20.0 billion"],
    ["reversed range", "$20.0 billion to $18.0 billion"],
    ["mixed currencies", "$18.0 billion to EUR20.0 billion"],
    ["a partial period", "$18.0 billion to $20.0 billion for the first half"],
    ["restricted business scope", "$18.0 billion to $20.0 billion excluding the Services business"],
  ])("does not admit revenue with %s", (_label, value) => {
    const result = parseGuidance(guidanceText.replace("$18.0 billion to $20.0 billion", value));
    expect(result?.items.some(item => item.metric === "revenue") ?? false).toBe(false);
  });

  it.each([
    "guidance for fiscal 2029 and 2030 including:",
    "guidance for the first quarter of fiscal 2029 including:",
    "guidance for the remaining months of fiscal 2029 including:",
    "guidance for fiscal 2029 excluding the Services business including:",
  ])("refuses an ambiguous or restricted introduction: %s", phrase => {
    expect(parseGuidance(guidanceText.replace("guidance for fiscal 2029 including:", phrase))?.items ?? []).toEqual([]);
  });

  it("does not promote segment scope or duplicate consolidated revenue bullets", () => {
    expect(parseGuidance(guidanceText.replace("Juniper Homes is providing", "The Homes segment is providing"))?.items ?? []).toEqual([]);
    const duplicate = guidanceText.replace(`\u2022 ${bullets[1]}`, `\u2022 Consolidated revenues in the range of $21 billion to $22 billion \u2022 ${bullets[1]}`);
    expect(parseGuidance(duplicate)?.items ?? []).toEqual([]);
  });

  it("refuses source-hidden guidance", () => {
    const hidden = parseDocument(`<div hidden>${guidanceText}</div>`);
    expect(parseGuidance(hidden.fullText, hidden)?.items ?? []).toEqual([]);
  });

  it("refuses trailing restrictions on the guided population", () => {
    const restricted = guidanceText.replace("Conference Call and Webcast Details", "These figures cover only the Homes segment. Conference Call and Webcast Details");
    expect(parseGuidance(restricted)?.items ?? []).toEqual([]);
  });

  it("does not turn a denied introduction into affirmative guidance", () => {
    const denied = guidanceText.replace("Juniper Homes is providing", "It is not the case that Juniper Homes is providing");
    expect(parseGuidance(denied)?.items ?? []).toEqual([]);
  });

  it("retains stated outlook assumptions alongside the annual rows", () => {
    const caveat = "The outlook assumes stable currency rates.";
    const result = parseGuidance(guidanceText.replace("Conference Call and Webcast Details", `${caveat} Conference Call and Webcast Details`));
    expect(result?.items).toHaveLength(2);
    expect(result?.qualifiers).toContain(caveat);
  });

  it("ends annual inheritance when a subsequent quarter heading appears between bullets", () => {
    const text = `${introduction} \u2022 ${bullets[0]}. First-quarter outlook: \u2022 ${bullets[2]}. Conference Call Details`;
    expect(parseGuidance(text)?.items.map(item => [item.metric, item.period.label])).toEqual([["revenue", "FY2029"]]);
  });

  it.each([" First-quarter outlook:", "\nFirst-quarter outlook", " Fiscal 2030 guidance:", " Fiscal 2030 guidance"])("does not inherit annual scope across an unpunctuated heading: %s", heading => {
    const text = `${introduction} \u2022 ${bullets[0]}${heading} \u2022 ${bullets[2]}. Conference Call Details`;
    expect(parseGuidance(text)?.items.some(item => item.metric === "tax-rate") ?? false).toBe(false);
  });

  it.each([
    "This range applies to the first half of the fiscal year.",
    "These amounts cover only the Homebuilding segment.",
    "The above figures relate to the remaining nine months.",
    "These amounts apply to fiscal 2030.",
    "These projections exclude the Services business.",
  ])("retains a trailing scope restriction while refusing annual consolidated figures: %s", restriction => {
    const text = `${introduction} \u2022 ${bullets[0]}. ${restriction} Conference Call Details`;
    const result = parseGuidance(text);
    expect(result?.items ?? []).toEqual([]);
    expect(result?.qualifiers).toContain(restriction);
  });

  it("does not carry annual scope past a promise of later quarterly guidance into another bullet", () => {
    const text = `${introduction} \u2022 ${bullets[0]}. The Company plans to provide guidance for its first quarter later. \u2022 ${bullets[2]}. Conference Call Details`;
    expect(parseGuidance(text)?.items.map(item => [item.metric, item.period.label])).toEqual([["revenue", "FY2029"]]);
  });
});
