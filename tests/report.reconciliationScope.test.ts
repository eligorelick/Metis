import { describe, expect, it } from "vitest";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import type { FilingDisclosures, FilingRef } from "@/report/schema";

type Fact = NonNullable<FilingDisclosures["reconciliation"]>[number];
const release: FilingRef = { form: "8-K", accession: "0000000000-26-000001", filingDate: "2026-08-26", exhibit: "EX-99.1", url: "https://www.sec.gov/Archives/edgar/data/1/release.htm" };
const commentary: FilingRef = { ...release, exhibit: "EX-99.2", url: "https://www.sec.gov/Archives/edgar/data/1/commentary.htm" };
function fact(metric: Fact["metric"], value: number, source = release, overrides: Partial<Fact> = {}): Fact {
  return { metric, value, source, periodEnd: "2026-07-26", months: 3,
    unit: metric.endsWith("eps") ? "currency-per-share" : "currency", ...overrides };
}
function disclosure(reconciliation: Fact[]): FilingDisclosures {
  return { version: "1.0.0", currency: "USD", currencyBasis: "fixture statement currency", guidance: null,
    guidanceChecks: [], freeCashFlow: [], freeCashFlowDefinition: null, capitalReturn: null,
    events: [], segments: [], quarterlyTrend: [], reconciliation, notes: [] };
}
const tables = (d: FilingDisclosures) => filingDisclosureTables(d, "fundamentals");
const adjustments = (d: FilingDisclosures) => tables(d).flatMap(t => t.rows).filter(r => /^(?:Non-GAAP adjustments,|Reported EPS difference)/.test(r[0] ?? ""));
const text = (d: FilingDisclosures) => JSON.stringify(tables(d));

describe("source-bound issuer reconciliation presentation", () => {
  it("does not fabricate a per-share bridge across two supplying exhibits", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2), fact("non-gaap-diluted-eps", 5, commentary)]);
    const original = structuredClone(d);
    expect(adjustments(d)).toEqual([]);
    expect(text(d)).toContain("$2.00");
    expect(text(d)).toContain("$5.00");
    expect(text(d)).toContain("EX-99.1");
    expect(text(d)).toContain("EX-99.2");
    expect(d).toEqual(original);
  });

  it.each([
    { form: "8-K/A" }, { accession: "0000000000-26-000002" },
    { filingDate: "2026-08-27" }, { url: "https://www.sec.gov/Archives/edgar/data/1/other.htm" },
  ])("does not join an EPS pair with a different source component %j", changes => {
    const d = disclosure([fact("gaap-diluted-eps", 2), fact("non-gaap-diluted-eps", 5, { ...release, ...changes })]);
    expect(adjustments(d)).toEqual([]);
  });

  it("attributes separately captured tax observations to their own source", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2), fact("non-gaap-diluted-eps", 5), fact("non-gaap-tax-impact", 25e6, commentary)]);
    const tax = tables(d).find(t => t.rows.some(r => r[0] === "Tax effect of non-GAAP adjustments"));
    expect(tax?.note).toContain("EX-99.2");
    expect(tax?.note).not.toContain("EX-99.1");
    expect(adjustments(d)).toEqual([["Reported EPS difference (non-GAAP less GAAP)", "$3.00"]]);
  });

  it("does not treat filing-only legacy provenance as a known common document", () => {
    const unknown: FilingRef = { ...release, exhibit: null, url: null };
    const d = disclosure([fact("gaap-diluted-eps", 2, unknown), fact("non-gaap-diluted-eps", 5, unknown)]);
    expect(adjustments(d)).toEqual([]);
    expect(text(d)).toContain("$2.00");
    expect(text(d)).toContain("$5.00");
    expect(text(d)).toMatch(/supplying document.*not established/i);
  });

  it("retains conflicting observations without choosing a favorable EPS bridge", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2), fact("gaap-diluted-eps", 2.5), fact("non-gaap-diluted-eps", 5)]);
    expect(adjustments(d)).toEqual([]);
    expect(text(d)).toContain("$2.50");
    expect(text(d)).toMatch(/conflicting/i);
  });

  it("does not subtract an amount from a per-share number", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2, release, { unit: "currency" }), fact("non-gaap-diluted-eps", 5)]);
    expect(adjustments(d)).toEqual([]);
    expect(text(d)).toMatch(/unit/i);
  });

  it("deduplicates identical observations for a supported negative adjustment", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2.46), fact("gaap-diluted-eps", 2.46), fact("non-gaap-diluted-eps", 2.22)]);
    expect(adjustments(d)).toEqual([["Reported EPS difference (non-GAAP less GAAP)", "\u2212$0.24"]]);
  });

  it.each([0, -3, 13])("retains unsupported %s-month observations without deriving EPS", months => {
    const d = disclosure([fact("gaap-diluted-eps", 2, release, { months }), fact("non-gaap-diluted-eps", 5, release, { months })]);
    expect(adjustments(d)).toEqual([]);
    expect(text(d)).toMatch(/duration/i);
  });

  it("does not calculate an EPS bridge for a nonexistent calendar date", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2, release, { periodEnd: "2026-02-30" }), fact("non-gaap-diluted-eps", 5, release, { periodEnd: "2026-02-30" })]);
    expect(adjustments(d)).toEqual([]);
  });

  it("does not present a derived monetary EPS difference with unknown currency", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2), fact("non-gaap-diluted-eps", 5)]);
    d.currency = null;
    expect(adjustments(d)).toEqual([]);
  });

  it.each([
    { periodEnd: "2026-07-29", source: release },
    { periodEnd: "2026-07-26", source: commentary },
  ])("does not insert an issuer FCF amount from a different scope %j", scope => {
    const d = disclosure([fact("operating-cash-flow", 600e6), fact("total-capital-expenditures", 150e6)]);
    d.freeCashFlow = [{ ...scope, months: 3, value: 450e6 }];
    const bridge = tables(d).find(t => t.heading === "Issuer free-cash-flow reconciliation");
    expect(bridge?.rows.some(r => r[0] === "Free cash flow (issuer definition, as reported)")).toBe(false);
    expect(text(d)).toContain("$450M"); // retained in its separately sourced reported-facts table
  });

  it("retains an exactly scoped issuer FCF reconciliation without implying discretionary funding", () => {
    const d = disclosure([fact("operating-cash-flow", 600e6), fact("total-capital-expenditures", 150e6)]);
    d.freeCashFlow = [{ periodEnd: "2026-07-26", source: release, months: 3, value: 450e6 }];
    const bridge = tables(d).find(t => t.heading === "Issuer free-cash-flow reconciliation");
    expect(bridge?.rows).toContainEqual(["Free cash flow (issuer definition, as reported)", "$450M"]);
    expect(bridge?.note).toMatch(/not.*(?:funding capacity|discretionary)/i);
  });

  it("does not choose one of two conflicting issuer FCF observations", () => {
    const d = disclosure([fact("operating-cash-flow", 600e6), fact("total-capital-expenditures", 150e6)]);
    d.freeCashFlow = [450e6, 400e6].map(value => ({ periodEnd: "2026-07-26", source: release, months: 3, value }));
    const bridge = tables(d).find(t => t.heading === "Issuer free-cash-flow reconciliation");
    expect(bridge?.rows.some(r => r[0] === "Free cash flow (issuer definition, as reported)")).toBe(false);
    expect(text(d)).toContain("$450M");
    expect(text(d)).toContain("$400M");
  });

  it("withholds a nonfinite derived difference while retaining finite reported operands", () => {
    const d = disclosure([fact("gaap-diluted-eps", -1e308), fact("non-gaap-diluted-eps", 1e308)]);
    expect(adjustments(d)).toEqual([]);
    expect(text(d)).not.toMatch(/NaN|Infinity/);
  });

  it("does not combine different reported durations from the same document", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2), fact("non-gaap-diluted-eps", 5, release, { months: 6 })]);
    expect(adjustments(d)).toEqual([]);
  });

  it("retains the exact issuer basis note without assigning it an invented document source", () => {
    const d = disclosure([fact("gaap-diluted-eps", 2), fact("non-gaap-diluted-eps", 5)]);
    d.nonGaapBasisNote = "Beginning with this fiscal year, the issuer no longer excludes stock-based compensation.";
    const note = tables(d).find(t => t.rows.some(r => r[0] === d.nonGaapBasisNote));
    expect(note?.note).toMatch(/does not bind.*specific supplying document/);
    expect(note?.note).not.toContain("EX-99.1");
  });
});
