import { describe, expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload, TextExcerpt } from "@/pipeline/stageC/payload";

// Exact retained QCOM EX-99.1 source span, offsets 2750–2934.
const SOURCE = " Return of Capital to Stockholders During the third quarter of fiscal 2026, we returned $2.3 billion to stockholders, including $973 million, or $0.92 per share, of cash dividends paid";
const CLAIM = "Cash dividends paid in the third quarter of fiscal 2026 were USD 973 million.";
const excerpt: TextExcerpt = {
  title: "Q3 FY2026 earnings release", source: "edgar:8-K EX-99.1", asOf: "2026-07-29",
  text: " ".repeat(2750) + SOURCE, originalChars: 2934, truncated: false,
  spans: [{ start: 2750, end: 2934, text: SOURCE }],
};
const check = (text = CLAIM, source = excerpt, asOf = excerpt.asOf) => validateClaimNumericSupport(
  { label: "FACT", text, source: source.source, asOf },
  { excerpts: [source], sourceId: source.source, reportingCurrency: "USD" },
);

describe("explicit total and per-share dividend appositives", () => {
  it("validates the actual QCOM total independently of its per-share restatement", () => {
    const result = check();
    expect(SOURCE).toHaveLength(184);
    expect(result.status).toBe("validated");
    expect(result.spans).toEqual([{ source: excerpt.source, asOf: excerpt.asOf, start: 2750, end: 2934, text: SOURCE }]);
    expect(check("Cash dividends paid in the third quarter of fiscal 2026 were USD 0.92 per share.").status).toBe("validated");
  });

  it.each([
    "Cash dividends paid in the third quarter of fiscal 2026 were USD 980 million.",
    "Cash dividends paid in the third quarter of fiscal 2026 were USD 973.",
    "Cash dividends paid in the third quarter of fiscal 2026 were USD 0.92.",
    "Cash dividends paid in the third quarter of fiscal 2026 were USD 973 per share.",
    "Cash dividends paid in the third quarter of fiscal 2026 were USD 0.95 per share.",
  ])("rejects a wrong total or per-share amount: %s", (text) => {
    expect(check(text)).toMatchObject({ status: "contradicted", reason: "value-mismatch" });
  });

  it("retains period, citation-date and currency requirements", () => {
    expect(check(CLAIM.replace("third quarter", "second quarter")).status).not.toBe("validated");
    expect(check(CLAIM.replace("2026", "2025")).status).not.toBe("validated");
    expect(check(CLAIM, excerpt, "2026-07-30").status).not.toBe("validated");
    expect(check(CLAIM.replace("USD", "EUR"))).toMatchObject({ status: "unchecked", reason: "currency-mismatch" });
    expect(check("Cash dividends paid in the third quarter of fiscal 2026 were EUR 0.92 per share.")).toMatchObject({ status: "unchecked", reason: "currency-mismatch" });
  });

  it("does not share a metric across an unproved pair, another metric or mixed currencies", () => {
    for (const text of [
      SOURCE.replace(", or $0.92 per share,", ", and $0.92 per share,"),
      SOURCE.replace("cash dividends paid", "stock repurchases"),
      SOURCE.replace("$0.92", "€0.92"),
      SOURCE.replace("$973", "973"),
    ]) {
      expect(check(CLAIM, { ...excerpt, text, spans: undefined }).status).not.toBe("validated");
    }
  });

  it("retains competing same-period source ambiguity instead of choosing the matching amount", () => {
    const text = SOURCE + ". Cash dividends paid in the third quarter of fiscal 2026 were $980 million.";
    expect(check(CLAIM, { ...excerpt, text, spans: undefined })).toMatchObject({ status: "unchecked", reason: "text-ambiguous" });
  });

  it("does not infer a dollar currency from the unit pair itself", () => {
    expect(validateClaimNumericSupport({ label: "FACT", text: CLAIM, source: excerpt.source, asOf: excerpt.asOf },
      { excerpts: [excerpt], sourceId: excerpt.source, reportingCurrency: null })).toMatchObject({ status: "unchecked", reason: "currency-mismatch" });
  });

  it("reverifies the original claim without changing its text, source or payload", async () => {
    const payload = { symbol: "QCOM", companyName: "QUALCOMM Incorporated", filings: [excerpt],
      citationRegistry: [{ id: excerpt.source, kind: "payload-text", origin: excerpt.source, asOf: excerpt.asOf }],
      provenanceRegistry: [{ id: "payload.statements.currency", currency: "USD" }],
    } as unknown as ContextPayload;
    const report = { balanceSheet: { capitalAllocation: [{ text: CLAIM, label: "FACT", source: excerpt.source, asOf: excerpt.asOf }] } };
    const before = JSON.stringify({ payload, report });
    const result = await runVerifyPass({ runPass: async () => { throw new Error("No model calls permitted"); } } as unknown as PassDeps, payload, report);
    expect(result.log.find((entry) => entry.path === "balanceSheet.capitalAllocation[0]")).toMatchObject({
      numericSupportStatus: "validated", claimSupportStatus: "numeric-only",
    });
    expect(JSON.stringify({ payload, report })).toBe(before);
  });
});
