/**
 * Live MSFT check (2026-10-26, report #47): "Our DCF per share as of
 * 2026-10-26 is USD 320.63." cited the DCF per-share record (USD 320.63 per
 * share) and was counted as contradicted ("prose unit contradicts the cited
 * numeric record"). The prose names the per-share basis in its metric words
 * rather than after the figure; that is the record's unit, not another one.
 */
import { describe, expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import type { SourcedClaim } from "@/report/schema";

const dcf: NumericProvenanceRecord = {
  id: "computed.valuation.dcf-per-share", label: "DCF per share", value: 320.6312, unit: "currency-per-share",
  kind: "computed", currency: "USD", period: null, asOf: "2026-10-26", origin: "computed.valuation.dcf-per-share", formulaVersion: null, displayPrecision: 2,
};
const check = (text: string, record: NumericProvenanceRecord = dcf) => {
  const claim: SourcedClaim = { label: "FACT", text, source: record.id, asOf: record.asOf };
  return validateClaimNumericSupport(claim, { record, excerpts: [], sourceId: record.id, reportingCurrency: "USD" }).status;
};

describe("a per-share basis named in the metric words", () => {
  it("validates the live MSFT sentence and its after-the-figure form alike", () => {
    expect(check("Our DCF per share as of 2026-10-26 is USD 320.63.")).toBe("validated");
    expect(check("Our DCF as of 2026-10-26 is USD 320.63 per share.")).toBe("validated");
  });

  it("still contradicts a wrong value, and never reads a total as per share", () => {
    expect(check("Our DCF per share as of 2026-10-26 is USD 330.63.")).toBe("contradicted");
    const total: NumericProvenanceRecord = { ...dcf, id: "computed.valuation.equity-value", label: "DCF equity value", value: 2_400e9, unit: "currency" };
    expect(check("The DCF equity value per share is USD 2,400 billion.", total)).not.toBe("validated");
    expect(check("Our DCF per share as of 2026-10-26 is USD 2,400 billion.")).not.toBe("validated");
  });

  it("does not take a per-share unit from words that do not say per share", () => {
    expect(check("Our DCF as of 2026-10-26 is USD 320.63.")).not.toBe("validated");
  });
});
