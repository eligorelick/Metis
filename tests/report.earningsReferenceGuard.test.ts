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
