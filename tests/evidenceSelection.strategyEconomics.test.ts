import { describe, expect, it } from "vitest";
import { selectMaterialEvidence, type EvidenceProfile } from "@/pipeline/stageC/evidenceSelection";

const crowd = Array.from({ length: 100 }, (_, i) => `Our products serve customers in region ${i}; revenue was $90 million and operating income was $20 million, with 40% growth and $50 million of cash.`).join("\n");
function reading(body: string, profile: EvidenceProfile, cap = 4_000) {
  const source = `${crowd}\n${body}\n${crowd}`;
  const selected = selectMaterialEvidence(source, cap, profile);
  expect(selected.text.length).toBeLessThanOrEqual(cap);
  for (const span of selected.spans) expect(source.slice(span.start, span.end)).toBe(span.text);
  return selected;
}

describe("material strategy economics survive bounded evidence selection", () => {
  it("retains customer consideration together with vesting and contra-revenue terms", () => {
    const terms = "On May 4, 2026, we issued a warrant to customer Northstar for up to 12 million shares at an exercise price of $125 per share. The warrant vests over eight years subject to customer purchase milestones. Its grant-date fair value of $900 million will be recognized as a reduction of revenue as the conditions are satisfied.";
    expect(reading(terms, "notes").text).toContain(terms);
  });

  it("retains acquisition consideration and distinguishes service compensation", () => {
    const deal = "In April 2026, we acquired Cedar Software for a purchase price of $1.4 billion. Of the shares issued, 2 million are subject to continued employment and will be recognized as compensation expense over the service period. The acquisition generated $700 million of goodwill.";
    expect(reading(deal, "notes").text).toContain(deal);
  });

  it("keeps named-party warrant terms when the customer label is a separate heading", () => {
    const terms = "In September 2026, we issued a warrant to an affiliate of Northstar Services, Inc. to acquire up to 12 million shares (Warrant Shares) at an exercise price of $125.50 per share. The warrant has an exercise and vesting term of eight years. The Warrant Shares vest in tranches tied to commercial arrangements and customer purchase milestones and are recorded as a reduction to revenues as related revenues are recognized. The grant date fair value of the warrant was $800 million. As of September 30, 2026, 12 million Warrant Shares were outstanding and unexercised, of which 2 million had vested upon issuance.";
    expect(reading(`Customer Warrant. ${terms}`, "notes", 10_000).text).toContain(terms);
    const tooSmall = reading(`Customer Warrant. ${terms}`, "notes", 500).text;
    expect(tooSmall).not.toContain("12 million Warrant Shares were outstanding");
    expect(tooSmall).not.toContain("The grant date fair value");
  });

  it("retains a segment perimeter change and its effective period", () => {
    const change = "Beginning in the first quarter of fiscal 2027, our Infrastructure business will be included in the Components reportable segment. Previously, Infrastructure was included in nonreportable businesses.";
    expect(reading(change, "business").text).toContain(change);
  });

  it("retains commercial deployment timing and absence of disclosed economics", () => {
    const commercial = "Customer Northstar selected our radio platform under a multi-year commercial agreement. Deployment is planned to begin in 2027. Contract revenue and margins have not been disclosed.";
    expect(reading(commercial, "business").text).toContain(commercial);
  });

  it("keeps missing economics and cancellation conditions with a commercial agreement", () => {
    const commercial = "Customer Northstar selected our radio platform under a multi-year commercial agreement. We have not disclosed the contract revenue or margins. Customer purchases remain subject to cancellation without penalty.";
    expect(reading(commercial, "business").text).toContain(commercial);
  });

  it("retains research spending and its adjacent driver", () => {
    const costs = "Research and development expense increased by $900 million in fiscal 2026. The increase primarily reflected $500 million of development costs for new computing products.";
    const selected = reading(costs, "financial");
    for (const sentence of costs.split(/(?<=\.) /)) expect(selected.text).toContain(sentence);
  });

  it("keeps acquisition terms that follow the acquiree's business description", () => {
    const deal = "On July 8, 2026, we completed the acquisition of Cedar Software (Cedar). Cedar provides an open software platform. The acquisition is expected to strengthen our development tools. The transaction values Cedar at approximately $1.4 billion, with consideration consisting of 8 million shares. This included 2 million shares subject to a four-year service requirement, a portion of which will be recognized as compensation expense.";
    expect(reading(deal, "notes").text).toContain(deal);
  });

  it("does not retain orphaned warrant terms when their counterparty cannot fit", () => {
    const introduction = `We issued a warrant to customer Northstar ${"under a performance-based purchase arrangement ".repeat(50)}.`;
    const terms = "The warrant vests over eight years subject to customer purchase milestones.";
    const text = reading(`${introduction} ${terms}`, "notes", 500).text;
    expect(text).not.toContain(terms);
  });
  it.each(["notes", "event", "financial"] as const)("keeps plural warrant context atomic in %s", profile => {
    const introduction = `We issued warrants to customer Northstar ${"under a performance-based purchase arrangement ".repeat(50)}.`;
    const terms = "The warrants vest over eight years subject to customer purchase milestones.";
    expect(selectMaterialEvidence(`${introduction} ${terms}`, 500, profile).text).not.toContain(terms);
  });
});
