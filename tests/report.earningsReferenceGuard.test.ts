import { describe, expect, it } from "vitest";
import { guardEarningsReferences } from "@/report/earningsReferences";

const claim = (text: string) => ({ text, label: "FACT", source: "edgar:10-Q item2", asOf: "2026-06-30" });

describe("rendered reported-earnings references", () => {
  it("withholds the actual unsupported bridge promise and retains an audit trail", () => {
    const original = { fundamentals: { commentary: [claim("Reported amounts should be read using the earnings bridge below.")] } };
    const frozen = structuredClone(original);
    const out = guardEarningsReferences(original, false);
    expect(out.report.fundamentals.commentary[0]).toMatchObject({ source: "pipeline:report-reference", asOf: null });
    expect(out.report.fundamentals.commentary[0].text).toContain("unavailable");
    expect(out.report.fundamentals.commentary[0].text).not.toContain("bridge below");
    expect(out.log).toMatchObject([{ outcome: "removed", reason: "unsupported-report-reference", path: "fundamentals.commentary[0]", claim: frozen.fundamentals.commentary[0].text }]);
    expect(original).toEqual(frozen);
  });
  it.each(["See the earnings reconciliation below.", "The following earnings bridge reconciles the reported amounts.", "The net-income bridge above shows reported tax."])("withholds a specific absent destination: %s", (text) => {
    expect(guardEarningsReferences({ claims: [claim(text)] }, false).log).toHaveLength(1);
  });
  it("uses a stable section destination when the complete reconciliation renders", () => {
    const report = { claims: [claim("See the earnings reconciliation below.")] };
    const out = guardEarningsReferences(report, true);
    expect(out.report.claims[0].text).toBe("See the reported earnings reconciliation in the Fundamentals section.");
    expect(out.log[0].reason).toBe("report-reference-normalized");
    expect(report.claims[0].text).toContain("below");
  });
  it.each([
    ["The earnings reconciliation, based on reported GAAP tax, appears below.",
      "The reported earnings reconciliation, based on reported GAAP tax, appears in the Fundamentals section."],
    ["The net-income bridge, using reported tax, is above.",
      "The reported earnings reconciliation, using reported tax, is in the Fundamentals section."],
    ["The following source-bound earnings bridge explains the reported tax movement.",
      "The source-bound reported earnings reconciliation in the Fundamentals section explains the reported tax movement."],
    ["Read the below source-bound earnings reconciliation with the tax footnote.",
      "Read the source-bound reported earnings reconciliation in the Fundamentals section with the tax footnote."],
  ])("preserves qualifiers when normalizing an available destination: %s", (text, expected) => {
    const report = { claims: [claim(text)] };
    const out = guardEarningsReferences(report, true);
    expect(out.report.claims[0]).toEqual({ ...report.claims[0], text: expected });
    expect(out.log).toMatchObject([{
      claim: text, reason: "report-reference-normalized", validationStatus: "unchecked",
      claimSupportStatus: "unreviewed", evidenceKind: "factual-claim",
    }]);
    expect(report.claims[0].text).toBe(text);
    expect(guardEarningsReferences(out.report, true)).toEqual({ report: out.report, log: [] });
  });
  it("normalizes each repeated reference without consuming intervening analysis", () => {
    const text = "See the earnings bridge below and the earnings bridge below. The following source-bound net-income reconciliation explains reported tax.";
    const out = guardEarningsReferences({ claims: [claim(text)] }, true);
    expect(out.report.claims[0].text).toBe("See the reported earnings reconciliation in the Fundamentals section and the reported earnings reconciliation in the Fundamentals section. The source-bound reported earnings reconciliation in the Fundamentals section explains reported tax.");
    expect(out.log).toHaveLength(1);
    expect(out.log[0].claim).toBe(text);
  });
  it("preserves explicit absence sentences alongside an available reference", () => {
    const text = "No earnings bridge is shown below. The earnings reconciliation, based on reported GAAP tax, appears below. The net-income bridge above is unavailable.";
    const out = guardEarningsReferences({ claims: [claim(text)] }, true);
    expect(out.report.claims[0].text).toBe("No earnings bridge is shown below. The reported earnings reconciliation, based on reported GAAP tax, appears in the Fundamentals section. The net-income bridge above is unavailable.");
    expect(out.log[0].claim).toBe(text);
  });
  it("leaves explicit absence unchanged when the reconciliation renders", () => {
    const report = { claims: [claim("No earnings bridge is shown below."), claim("The earnings reconciliation above is unavailable.")] };
    expect(guardEarningsReferences(report, true)).toEqual({ report, log: [] });
  });
  it("does not mistake cash/debt bridges or general analytical discussion for a promised earnings destination", () => {
    const report = { claims: [claim("See the cash bridge below."), claim("The debt bridge below separates lease liabilities."), claim("A recurring earnings bridge requires further tax evidence."), claim("No earnings bridge is shown below.")] };
    expect(guardEarningsReferences(report, false)).toEqual({ report, log: [] });
  });
  it("is idempotent and does not inspect its own audit entries", () => {
    const first = guardEarningsReferences({ claims: [claim("See the earnings bridge below.")], appendix: { verificationLog: [{ claim: "earnings bridge below", outcome: "removed" }] } }, false);
    expect(guardEarningsReferences(first.report, false).log).toEqual([]);
    expect(first.report.appendix.verificationLog).toHaveLength(1);
  });
});
