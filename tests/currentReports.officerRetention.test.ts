import { describe, expect, it } from "vitest";
import { buildMaterialEventFiling } from "@/providers/currentReports";

const filing = { accessionNumber: "officer-source", form: "8-K", filingDate: "2026-04-23", items: "5.02" };
describe("bounded officer disclosure retention", () => {
  it("retains later compensation terms in a readable officer-change item", () => {
    const text = `Item 5.02 Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers; Compensatory Arrangements of Certain Officers. On April 23, 2026, the Company appointed a new Chief Financial Officer. ${"Employment terms remain subject to the written agreement. ".repeat(95)}The officer received an equity award with a grant-date value of $17 million.`;
    const event = buildMaterialEventFiling(filing, text, "https://www.sec.gov/officer.htm");
    expect(event.sections[0]?.text).toContain("grant-date value of $17 million");
    expect(event.sections[0]?.text.length).toBeLessThanOrEqual(10_000);
  });
  it("discloses the full source size when an officer item exceeds its bounded retention", () => {
    const text = `Item 5.02 Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers. ${"Additional officer terms are disclosed here. ".repeat(300)}`;
    const section = buildMaterialEventFiling(filing, text, "https://www.sec.gov/officer.htm").sections[0];
    expect(section).toMatchObject({ truncated: true });
    expect(section?.originalChars).toBeGreaterThan(10_000);
    expect(section?.text.length).toBeLessThanOrEqual(10_000);
  });
});
