/**
 * AMZN audit 2026-10-20 finding 13: a member is shown as a component of
 * another only when the filing's figures make it one in every quarter, not
 * because one quarter happens to add up.
 *
 * Amounts are Amazon's Q2 2026 10-Q (0001018724-26-000026, filed 2026-07-31)
 * "Net sales by groups of similar products and services" and its product /
 * service split, in millions, for the three months ended June 30, 2026 and
 * 2025. Its product-or-service axis carries two partitions of the same
 * revenue. In 2026 online stores + third-party seller services + physical
 * stores (123,006) came within 2 of net service sales (123,004); in 2025 they
 * did not (107,428 against 99,456).
 */
import { describe, expect, it } from "vitest";

import { buildQuarterlySegments, type RevenueFact } from "@/edgar/segmentFacts";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import type { FilingDisclosures } from "@/report/schema";

const AXIS = "srt:ProductOrServiceAxis";
const CONCEPT = "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax";
const Q2_2026 = { start: "2026-04-01", end: "2026-06-30" };
const Q2_2025 = { start: "2025-04-01", end: "2025-06-30" };

/** Member -> [Q2 2026, Q2 2025], USD millions. */
const LINES: Record<string, [number, number]> = {
  "us-gaap:ProductMember": [77_602, 68_246],
  "us-gaap:ServiceMember": [123_004, 99_456],
  "amzn:OnlineStoresMember": [70_432, 61_485],
  "amzn:ThirdPartySellerServicesMember": [46_780, 40_348],
  "amzn:PhysicalStoresMember": [5_794, 5_595],
  "amzn:AdvertisingServicesMember": [19_809, 15_694],
  "amzn:SubscriptionServicesMember": [13_730, 12_208],
  "amzn:AmazonWebServicesMember": [42_232, 30_873],
  "amzn:OtherServicesMember": [1_829, 1_499],
};
const TOTAL: [number, number] = [200_606, 167_702];

function fact(member: string | null, window: { start: string; end: string }, millions: number): RevenueFact {
  return { axis: member === null ? null : AXIS, member, ...window, value: millions * 1e6, currency: "USD", concept: CONCEPT };
}

function filing(lines: Record<string, [number, number]>, total: [number, number]) {
  const facts = [
    fact(null, Q2_2026, total[0]), fact(null, Q2_2025, total[1]),
    ...Object.entries(lines).flatMap(([member, [now, prior]]) => [fact(member, Q2_2026, now), fact(member, Q2_2025, prior)]),
  ];
  return { accession: "0001018724-26-000026", form: "10-Q", filingDate: "2026-07-31", facts, concept: CONCEPT };
}

const LABELS = {
  "us-gaap:ProductMember": "Net product sales", "us-gaap:ServiceMember": "Net service sales",
  "amzn:OnlineStoresMember": "Online stores", "amzn:ThirdPartySellerServicesMember": "Third-party seller services",
  "amzn:PhysicalStoresMember": "Physical stores",
};

describe("segment hierarchy from the filing's own sums", () => {
  it("does not nest rows under a member they add up to in one quarter only", () => {
    const series = buildQuarterlySegments([filing(LINES, TOTAL)], LABELS)!;
    const axis = series.axes.find((a) => a.axis === AXIS)!;
    expect(axis.rows.map((r) => [r.label, r.childOf])).toEqual(expect.arrayContaining([
      ["Online stores", null], ["Third-party seller services", null], ["Physical stores", null], ["Net service sales", null],
    ]));
    expect(axis.rows.every((r) => r.childOf === null)).toBe(true);

    const disclosures = {
      version: "1.0.0", currency: "USD", currencyBasis: "statements in USD", guidance: null, guidanceChecks: [],
      freeCashFlow: [], freeCashFlowDefinition: null, capitalReturn: null, events: [], quarterlyTrend: [], notes: [],
      segments: [{ axis: axis.axis, axisLabel: axis.axisLabel, currency: "USD", quarters: axis.quarters.map((q) => q.end),
        rows: axis.rows.map((r) => ({ label: r.label, childOf: r.childOf, values: r.values })), total: axis.total,
        priorPresentation: [], derivedCells: 0, sources: ["10-Q 0001018724-26-000026 (filed 2026-07-31)"] }],
    } satisfies FilingDisclosures;
    const rendered = JSON.stringify(filingDisclosureTables(disclosures, "business"));
    expect(rendered).not.toContain("↳ Online stores");
    expect(rendered).not.toContain("Indented rows are components of the row above them");
  });

  it("still nests a subtotal that holds in every quarter the filing tags", () => {
    // Net product sales split into two lines that sum to it in both quarters.
    const lines = { ...LINES, "acme:HardwareMember": [50_000, 40_000] as [number, number], "acme:DevicesMember": [27_602, 28_246] as [number, number] };
    const series = buildQuarterlySegments([filing(lines, TOTAL)], { ...LABELS, "acme:HardwareMember": "Hardware", "acme:DevicesMember": "Devices" })!;
    const rows = series.axes.find((a) => a.axis === AXIS)!.rows;
    expect(rows.find((r) => r.label === "Hardware")!.childOf).toBe("us-gaap:ProductMember");
    expect(rows.find((r) => r.label === "Devices")!.childOf).toBe("us-gaap:ProductMember");
    expect(rows.find((r) => r.label === "Online stores")!.childOf).toBeNull();
  });
});
