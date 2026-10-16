import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reconcileDebtPresentation, type DebtPresentationInput } from "@/edgar/debtPresentation";

const fixture = JSON.parse(readFileSync("fixtures/edgar/qcom-debt-presentation-20260628.json", "utf8")) as DebtPresentationInput;
const withText = (text: string): DebtPresentationInput => ({ ...fixture, text });

describe("source-bound debt presentation reconciliation", () => {
  it("establishes QCOM's filed noncurrent carrying amount independently of the inclusive taxonomy contract", () => {
    const result = reconcileDebtPresentation(fixture);
    expect(result).toMatchObject({ status: "established", scope: "noncurrent", noncurrentDebt: 12_781e6, currentDebt: 2_489e6 });
    expect(result.evidence).toMatchObject({ source: "edgar", unit: "USD", periodStart: null, periodEnd: "2026-06-28", filings: [{ accn: "0000804328-26-000086", filed: "2026-07-29", form: "10-Q" }] });
    expect(result.noncurrentDebt! + result.currentDebt!).toBe(15_270e6);
  });

  it("preserves a genuinely inclusive tag rather than universally removing current maturities", () => {
    expect(reconcileDebtPresentation({ ...fixture, tagValue: 12_781e6 + 1_991e6 })).toMatchObject({ status: "established", scope: "inclusive", noncurrentDebt: 12_781e6 });
    expect(reconcileDebtPresentation({ ...fixture, tagValue: 13_000e6 })).toMatchObject({ status: "conflict", scope: null, noncurrentDebt: null });
  });

  it("requires exact source filing, issuer, period and currency identity", () => {
    const changes: Partial<DebtPresentationInput>[] = [
      { periodEnd: "2026-03-29" }, { currency: "CAD" },
      { source: { ...fixture.source, accession: "0000804328-26-000061" } },
      { source: { ...fixture.source, filingDate: "2026-07-30" } },
      { source: { ...fixture.source, reportDate: "2026-03-29" } },
      { source: { ...fixture.source, documentUrl: fixture.source.documentUrl.replace("/804328/", "/123456/") } },
      { source: { ...fixture.source, documentUrl: "not-a-document-url" } },
      { tagSource: { ...fixture.tagSource, cik: "0000123456" } },
      { tagSource: { ...fixture.tagSource, periodEnd: "2025-09-28" } },
      { tagSource: { ...fixture.tagSource, unit: "EUR" } },
    ];
    for (const change of changes) expect(reconcileDebtPresentation({ ...fixture, ...change }).status).toBe("unestablished");
  });

  it("will not override from unknown units, a partial table, conflicting columns or an unbound debt label", () => {
    const changes = [
      fixture.text.replace("(In millions, except par value amounts)", "(In unspecified units)"),
      fixture.text.replace("(In millions, except par value amounts)", "CAD (In millions, except par value amounts)"),
      fixture.text.replace("(In millions, except par value amounts)", "(In millions, CAD amounts)"),
      fixture.text.replace("Other liabilities 5,434 4,911", ""),
      fixture.text.replace("June 28, 2026 September 28, 2025", "September 28, 2025 June 28, 2026"),
      fixture.text.replace("June 28, 2026 September 28, 2025", "June 28, 2026 June 28, 2026"),
      fixture.text.replace("Long-term debt 12,781 14,811", "Long-term investments 12,781 14,811"),
      fixture.text.replace("Long-term debt 12,781 14,811", "Long-term debt 12,781"),
      fixture.text.replace("(In millions, except par value amounts)", "(In billions, except par value amounts)"),
    ];
    for (const text of changes) {
      const result = reconcileDebtPresentation(withText(text));
      expect(result.status).not.toBe("established");
      expect(result.noncurrentDebt).toBeNull();
    }
  });

  it("checks both column reconciliations and requires an actual noncurrent position", () => {
    expect(reconcileDebtPresentation(withText(fixture.text.replace("Other liabilities 5,434 4,911", "Other liabilities 5,434 4,900"))).status).toBe("conflict");
    expect(reconcileDebtPresentation(withText(fixture.text.replace("Short-term debt 2,489 —", "Short-term debt 2,400 —"))).status).toBe("conflict");
    expect(reconcileDebtPresentation(withText(fixture.text.replace("Total current liabilities 11,413 9,144 Unearned revenues 81 71 Long-term debt 12,781 14,811", "Long-term debt 12,781 14,811 Total current liabilities 11,413 9,144 Unearned revenues 81 71"))).status).not.toBe("established");
    expect(reconcileDebtPresentation(withText(fixture.text.replace("Total liabilities 29,709 28,937", ""))).status).toBe("unestablished");
  });
});
