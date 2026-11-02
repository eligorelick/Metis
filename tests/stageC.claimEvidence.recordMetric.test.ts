import { expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
const inc: NumericProvenanceRecord = { id: "computed.forensics.increase-in-goodwill-and-other-intangible-assets", label: "increase in goodwill and other intangible assets", kind: "computed", value: 18143000000, unit: "currency", currency: "USD", period: "2026-01-25", asOf: "2026-01-25", origin: "computed", formulaVersion: null, displayPrecision: 4 };
function check(text: string, record = inc) {
  return validateClaimNumericSupport({ label: "FACT", text, source: record.id, asOf: record.asOf }, { record, excerpts: [], sourceId: record.id, reportingCurrency: "USD" }).status;
}
it.each([inc.id, "computed.forensics.accruals.acquiredGoodwillAndIntangibles"])("AI-501 refuses a level citing increase %s", id => {
  expect(check("Goodwill and other intangible assets as of 2026-01-25 were USD 18.14 billion.", { ...inc, id })).toBe("unchecked");
});
it("AI-501 retains noun-form increase and movement refusals", () => {
  expect(check("The increase in goodwill and other intangible assets as of 2026-01-25 was USD 18.14 billion.")).toBe("validated");
  expect(check("Goodwill and other intangible assets rose USD 18.14 billion.")).toBe("unchecked");
});

it("AI-501 refuses share-of-level and omitted gains", () => {
  const share = { ...inc, id: "computed.forensics.goodwill-and-intangibles-increase-as-a-share-of-the-net-operating-asset-increase", label: "goodwill and intangibles increase as a share of the net-operating-asset increase", value: 44.36158, unit: "percent" as const, currency: null };
  expect(check("Goodwill and intangibles as a share of net operating assets as of 2026-01-25 was 44.36%.", share)).toBe("unchecked");
  const gains = { ...inc, id: "payload.quarterly-trend.net-gains-from-equity-securities-quarter-ended-2026-07-26", label: "net gains from equity securities, quarter ended 2026-07-26", period: "2026-07-26", asOf: "2026-07-26", value: 2100000000 };
  expect(check("Net equity securities for the quarter ended 2026-07-26 were USD 2.1 billion.", gains)).toBe("unchecked");
  expect(check("Net gains from equity securities for the quarter ended 2026-07-26 were USD 2.1 billion.", gains)).toBe("validated");
});
