import { describe, expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload, TextExcerpt } from "@/pipeline/stageC/payload";
import release from "./fixtures/r5-figr-release.json";

const check = (text: string, excerpt: TextExcerpt = release) => validateClaimNumericSupport(
  { label: "FACT", text, source: excerpt.source, asOf: excerpt.asOf },
  { excerpts: [excerpt], sourceId: excerpt.source, reportingCurrency: "USD", ignoreWords: ["Figure", "FIGR"] });
const comparison = "Net take rate fell to 3.6% in Q2 2026 from 4.0% in Q2 2025. In our judgment, falling monetization per dollar of volume argues against present pricing power, even if mix shift explains part of it.";

describe("R5 FIGR excerpt columns and ordered level comparisons", () => {
  it("binds a net take rate to its explicit quarter/year table column", () => {
    expect(check("Net take rate was 3.6% in Q2 2026.").status).toBe("validated");
    expect(check("Net take rate was 4.0% in Q2 2025.").status).toBe("validated");
  });
  it("establishes a decline from two independently bound columns", () => {
    const result = check(comparison);
    expect(result.status).toBe("validated");
    expect(result.spans).toHaveLength(2);
    expect(result.spans.every(span => span.text.includes("Net Take Rate"))).toBe(true);
  });
  it("keeps numeric-only support when the same comparison precedes a qualitative conclusion", () => {
    expect(check("Net take rate fell to 3.6% in Q2 2026 from 4.0% in Q2 2025, so revenue per dollar of volume is declining as Figure Connect's share rises.").status).toBe("validated");
    expect(check("Net take rate fell to 3.6% in Q2 2026 from 4.0% in Q2 2025, on an adjusted basis.").status).not.toBe("validated");
  });
  it.each([
    comparison.replace("3.6%", "3.7%"),
    comparison.replace("in Q2 2026", "in Q1 2026"),
    comparison.replace("Net take rate", "Operating margin"),
    comparison.replace("fell to", "rose to"),
    comparison.replace("3.6%", "3.6 percentage points"),
    comparison.replace("3.6%", "4.0%").replace("from 4.0%", "from 3.6%"),
    comparison.replace("from 4.0% in Q2 2025", "from 4.0% in Q2 2024"),
    comparison.replace("fell to", "did not fall to"),
    comparison.replace("3.6%", "3.60%"),
    comparison.replace("from 4.0%", "from 4.0"),
    "Net take rate was 3.6% and 4.0% in Q2 2026 and Q2 2025, respectively.",
  ])("keeps comparison binding conservative: %s", text => {
    expect(check(text).status).not.toBe("validated");
  });
  it.each([
    release.text.replaceAll("2026 2025 2026 2025 YoY % YoY%", "2026 2026 2026 2025 YoY % YoY%"),
    release.text.replace("Net Take Rate 3.6 % 4.0 % 3.7 % 3.9 %", "Net Take Rate 3.6 % 4.0 % 3.9 %"),
    release.text.replace("Net Take Rate 3.6 % 4.0 % 3.7 % 3.9 %", "Net Take Rate 4.0 % 3.6 % 3.7 % 3.9 %"),
  ])("refuses a malformed or reversed source column layout", text => {
    expect(check(comparison, { ...release, text }).status).not.toBe("validated");
  });
  it("does not reuse an earlier table header across a malformed later header", () => {
    const at = release.text.indexOf("Selected Metrics");
    const text = release.text.slice(0, at) + release.text.slice(at).replace("2026 2025 2026 2025 YoY % YoY%", "2026 2026 2026 2025 YoY % YoY%");
    expect(check(comparison, { ...release, text }).status).not.toBe("validated");
    expect(check("Net take rate was 3.7% in 2026.").status).not.toBe("validated");
  });
  it("keeps the declared money scale and refuses a conflicting later declaration", () => {
    const claim = "Consumer Loan Marketplace volume was USD 4.259 billion in Q2 2026.";
    expect(check(claim).status).toBe("validated");
    expect(check(claim.replace("billion", "million")).status).not.toBe("validated");
    const at = release.text.indexOf("Selected Metrics");
    const text = release.text.slice(0, at) + release.text.slice(at).replace("YoY % YoY% Consumer Loan Marketplace Volume", "YoY % YoY% (In thousands) Consumer Loan Marketplace Volume");
    expect(check(claim, { ...release, text }).status).not.toBe("validated");
    expect(check(claim.replace("billion", "million"), { ...release, text }).status).not.toBe("validated");
  });
  it("keeps an ambiguous multi-metric benchmark sentence unchecked", () => {
    const text = "Additionally, the average production cost per loan was reduced to approximately $717 for the year ended December 31, 2025 from a mortgage industry average of $11,109 as of September 30, 2025, the most recent period available, according to the Mortgage Bankers Association (MBA).";
    const excerpt = { ...release, source: "edgar:10-K item1", title: "10-K Item 1 (FY2025)", text };
    expect(check("The 10-K states the average production cost per loan was about USD 717 for FY2025, against an MBA mortgage industry average of USD 11,109 as of September 30, 2025.", excerpt).status).toBe("unchecked");
    expect(check("The 10-K states the average production cost per loan was about USD 11,109 for FY2025, against an MBA mortgage industry average of USD 717 as of September 30, 2025.", excerpt).status).toBe("unchecked");
  });
  it("logs numeric-only excerpt support distinctly from a registry match", async () => {
    const payload = {
      provenanceRegistry: [{ id: "payload.statements.currency", kind: "provider", value: 1, unit: "currency", currency: "USD", asOf: release.asOf, period: null, origin: "test", formulaVersion: null, displayPrecision: 4 }],
      citationRegistry: [{ id: release.source, asOf: release.asOf, kind: "payload-text", origin: "filings" }], filings: [release],
    } as unknown as ContextPayload;
    const figure = { value: 3.6, unit: "% Net Take Rate", period: "Q2 2026", source: release.source, asOf: release.asOf, verified: null };
    const result = await runVerifyPass({} as PassDeps, payload, { claims: [{ label: "FACT", text: comparison, source: release.source, asOf: release.asOf }], figure });
    expect(result.verifiedReport.figure.verified).toBe(true);
    expect(result.log.find(e => e.path === "figure")).toMatchObject({ outcome: "verified", traceKind: "excerpt-match" });
    expect(result.log.find(e => e.path === "claims[0]")).toMatchObject({ outcome: "unverified", validationStatus: "validated", claimSupportStatus: "numeric-only", traceKind: "excerpt-match" });
  });
});
