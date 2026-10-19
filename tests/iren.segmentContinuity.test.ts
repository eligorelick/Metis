import { describe, expect, it } from "vitest";
import { buildQuarterlySegments, type RevenueFact } from "@/edgar/segmentFacts";
const axis = "srt:ProductOrServiceAxis";
const fact = (member: string | null, start: string, end: string, value: number): RevenueFact => ({ axis: member ? axis : null, member, start, end, value, currency: "USD", concept: "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" });
describe("unresolved segment member continuity", () => {
  it("retains conservative quarterly refusal with the concrete renamed-member coverage reason", () => {
    const annual = { accession: "0001878848-26-000052", form: "10-K", filingDate: "2026-08-27", concept: "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", facts: [fact(null, "2025-07-01", "2026-06-30", 707_007_000), fact("iren:AICloudServicesMember", "2025-07-01", "2026-06-30", 128_795_000), fact("iren:BitcoinMiningMember", "2025-07-01", "2026-06-30", 578_212_000)] };
    const interim = { accession: "0001878848-26-000026", form: "10-Q", filingDate: "2026-05-08", concept: annual.concept, facts: [fact(null, "2025-07-01", "2026-03-31", 600_000_000), fact("iren:AICloudServicesMember", "2025-07-01", "2026-03-31", 80_000_000), fact("iren:BitcoinMiningRevenueMember", "2025-07-01", "2026-03-31", 520_000_000)] };
    const series = buildQuarterlySegments([annual, interim], {});
    expect(series?.axes).toEqual([]);
    expect(series?.notes.join(" ")).toMatch(/fewer than two.*continuity|continuity.*fewer than two/);
    expect(series?.notes.join(" ")).toContain("iren:BitcoinMiningRevenueMember");
    // The two source annual observations are preserved in the fixture, not
    // relabeled as a proved quarterly recast. No member-name mapping is guessed.
    expect(annual.facts[1]!.value + annual.facts[2]!.value).toBe(707_007_000);
  });
});
