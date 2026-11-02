import { describe, expect, it } from "vitest";
import { eightKEventBudget, PAYLOAD_BUDGETS } from "@/pipeline/stageC/payload";
import { EVENT_SELECTION_VERSION, selectMaterialEvidence } from "@/pipeline/stageC/evidenceSelection";

// FIGR paid audit 2026-11-02 (R1): fictional analogues of an acquisition's two
// 8-Ks. No real names; the structure, punctuation and lengths follow the
// filings. The completion 8-K's consideration sentence ("approximately $590
// million") was cut because a defined-term passage ("Northwind (the “Merger”)")
// came first in source order and used the room; the agreement 8-K lost its
// dated lead because a sub-heading sat between the item title and "On June 10".
const COMPLETION = "Item 2.01 (Completion of Acquisition or Disposition of Assets): On September 1, 2026, Example Lending Holdings, Inc. (the “Company”) completed its previously announced acquisition of Northwind Capital, Inc., a Delaware corporation (“Northwind”), pursuant to the Agreement and Plan of Merger, dated as of June 10, 2026 (the “Merger Agreement”), by and among the Company, Project Alpha Merger Sub, Inc., a Delaware corporation and wholly owned subsidiary of the Company (“Merger Sub”), Northwind, and Harbor Advisors LLC, as the securityholder representative. " +
  "Pursuant to the Merger Agreement, Merger Sub merged with and into Northwind (the “Merger”), with Northwind surviving as a wholly owned subsidiary of the Company. " +
  "At the closing of the Merger, the Company paid cash consideration, net of cash acquired of approximately $590 million, (the “Merger Consideration”) to acquire Northwind’s technology platform and DSCR (“Debt Service Coverage Ratio”) loans on Northwind’s balance sheet, which is subject to customary adjustments for Northwind’s cash, indebtedness, transaction expenses, and operating net working capital. " +
  "All closing conditions were satisfied or waived at or prior to the closing of the Merger. " +
  "The Company primarily funded the Merger Consideration using the net proceeds from its $600 million aggregate principal amount of 8.500% Senior Notes due 2031 (the “Notes”), which closed on July 14, 2026. " +
  "In connection with the closing of the Merger, on the closing date, (1) the Company repaid in full all outstanding obligations under that certain Third Amended and Restated Credit Agreement, dated as of December 19, 2024, among Northwind, Example Bank Trust Company, National Association, as paying agent, and the lenders party thereto, and (2) Northwind Funding, Inc. and Northwind Funding Trust 2 (each an indirect subsidiary of the Company) terminated that certain Master Repurchase Agreement, dated as of September 19, 2025, with Example Bank AG, New York Branch. " +
  "Upon such repayment and termination, all related financing documents were terminated and all liens securing the obligations thereunder were released. " +
  "The Merger was previously reported on the Current Report on Form 8-K filed by the Company with the Securities and Exchange Commission (the “SEC”) on June 10, 2026 (the “Original 8-K”), which disclosed the entry into the Merger Agreement. " +
  "The descriptions of the Merger and the Merger Agreement contained in the Original 8-K are incorporated by reference herein, and readers are referred to the Original 8-K for further details regarding the transaction. " +
  "The foregoing description of the Merger and the Merger Agreement does not purport to be complete and is qualified in its entirety by reference to the full text of the Merger Agreement, a copy of which was filed as Exhibit 2.1 to the Original 8-K and is incorporated by reference herein.";
const CONSIDERATION = "the Company paid cash consideration, net of cash acquired of approximately $590 million";
const FUNDING = "primarily funded the Merger Consideration using the net proceeds from its $600 million";
const COMPLETION_LEAD = "On September 1, 2026, Example Lending Holdings, Inc. (the “Company”) completed its previously announced acquisition of Northwind Capital, Inc.";

// The agreement 8-K prints defined terms with spaces inside the quotes ("(the “ Company ”)").
const AGREEMENT = "Item 1.01 (Entry into a Material Definitive Agreement): Merger Agreement On June 10, 2026, Example Lending Holdings, Inc., a Nevada corporation (the “ Company ”), entered into an Agreement and Plan of Merger (the “ Merger Agreement ”), by and among the Company, Project Alpha Merger Sub, Inc., a Delaware corporation and wholly owned subsidiary of the Company (“ Merger Sub ”), Northwind Capital, Inc., a Delaware corporation (“ Northwind ”), and Harbor Advisors LLC, in its capacity as the lawful and exclusive representative, agent, proxy, and attorney-in-fact (with full power of substitution) for and on behalf of the securityholders of Northwind, pursuant to which, subject to the terms and conditions set forth therein, Merger Sub will merge with and into Northwind (the “ Merger ”), with Northwind surviving such Merger as a wholly owned subsidiary of the Company. " +
  "Capitalized terms used herein but not otherwise defined shall have the meanings ascribed to such terms in the Merger Agreement. " +
  "Under the terms and subject to the conditions set forth in the Merger Agreement, at the closing of the Transaction (the “ Closing ”), the Company will pay to Northwind equityholders an aggregate $532,426,000 in cash, subject to certain customary adjustments specified in the Merger Agreement, including for Northwind’s cash, indebtedness, transaction expenses, operating net working capital and warehouse working capital. " +
  "The obligation of Northwind and the Company to consummate the transactions contemplated by the Merger Agreement is subject to the satisfaction or waiver of a number of customary conditions, including: (i) the approval and adoption of the Merger Agreement by a supermajority of the holders of the Northwind equityholders; (ii) the absence of laws or orders that make the consummation of the Merger illegal or otherwise prohibiting the consummation of the Merger; (iii) the expiration or termination of the applicable waiting period under the Hart-Scott-Rodino Antitrust Improvements Act of 1976, as amended; (iv) the representations and warranties of Northwind and the Company being true and correct, subject to the materiality standards contained in the Merger Agreement, and Northwind and the Company having complied in all material respects with their respective obligations under the Merger Agreement; and (v) the absence of a material adverse effect on Northwind. " +
  "In addition, the obligation of the Company to consummate the Merger is subject to the satisfaction or waiver of certain additional conditions, including the completion of a pre-closing restructuring, the contemporaneous closing of the sale of a subsidiary of Northwind to a newly formed joint venture between the Company and a third party and obtaining certain governmental and regulatory licenses and approvals. " +
  "The Merger Agreement contains representations, warranties and covenants that are customary for a transaction of this nature.";
const AGREEMENT_LEAD = "Merger Agreement On June 10, 2026, Example Lending Holdings, Inc., a Nevada corporation";
const PRICE = "the Company will pay to Northwind equityholders an aggregate $532,426,000 in cash";

describe("8-K transaction excerpts keep the deal's terms (FIGR paid audit R1)", () => {
  it("keeps an acquisition's consideration ahead of a defined-term passage, at the default event budget", () => {
    const cut = selectMaterialEvidence(COMPLETION, PAYLOAD_BUDGETS.eightKEventChars, "event");
    expect(cut.text).toContain(COMPLETION_LEAD);
    expect(cut.text).toContain(CONSIDERATION);
    expect(cut.coverage.version).toBe(`${EVENT_SELECTION_VERSION}/event`);
    expect(EVENT_SELECTION_VERSION).toBe("section-evidence-6");
  });

  it("gives an acquisition or merger-agreement 8-K the larger transaction budget", () => {
    expect(eightKEventBudget(["2.01"], COMPLETION)).toBe(PAYLOAD_BUDGETS.eightKTransactionEventChars);
    expect(eightKEventBudget(["1.01"], AGREEMENT)).toBe(PAYLOAD_BUDGETS.eightKTransactionEventChars);
    expect(PAYLOAD_BUDGETS.eightKTransactionEventChars).toBeGreaterThan(PAYLOAD_BUDGETS.eightKEventChars);
    // An ordinary agreement or another item keeps the default budget.
    expect(eightKEventBudget(["1.01"], "Item 1.01 (Entry into a Material Definitive Agreement): On May 1, 2026, the Company entered into a supply agreement with Example Parts Co.")).toBe(PAYLOAD_BUDGETS.eightKEventChars);
    expect(eightKEventBudget(["5.07"], "Item 5.07 (Submission of Matters to a Vote of Security Holders): The Annual Meeting was held on June 4, 2026.")).toBe(PAYLOAD_BUDGETS.eightKEventChars);
  });

  it("keeps the completion's lead, consideration and funding at the transaction budget", () => {
    const cut = selectMaterialEvidence(COMPLETION, eightKEventBudget(["2.01"], COMPLETION), "event");
    for (const part of [COMPLETION_LEAD, CONSIDERATION, FUNDING]) expect(cut.text).toContain(part);
  });

  it("reads a dated lead after an item sub-heading, and defined terms with spaced quotes, as the operative paragraph", () => {
    const cut = selectMaterialEvidence(AGREEMENT, eightKEventBudget(["1.01"], AGREEMENT), "event");
    expect(cut.text).toContain(AGREEMENT_LEAD);
    expect(cut.text).toContain(PRICE);
  });

  it("ranks an amount written out in digits with the amounts, ahead of a passage that only defines a party", () => {
    const lead = "Item 1.01 (Entry into a Material Definitive Agreement): On May 4, 2026, Example Lending Holdings, Inc. (the “Company”) entered into a Loan Purchase Agreement with Harbor Funding Trust, a Delaware statutory trust.";
    // Long enough that, kept first in source order, it leaves no room for the amount.
    const party = "Harbor Funding Trust is sponsored by Example Bank AG (the “Sponsor”), and its beneficial interests are held by investment funds that Harbor Advisors LLC (the “Manager”) manages, each of which has purchased loans from the Company and from the Company's origination partners under similar arrangements in prior periods, as the Company has previously disclosed in its periodic reports, and each of which is party to the master servicing arrangements that the Sponsor, the Manager and the Company's servicing subsidiary maintain for the loans the Company sells to institutional purchasers.";
    const amount = "Under the agreement, the trust committed to buy up to $750,000,000 of home equity loans originated through the Company's platform over the eighteen months following the closing, at prices set by reference to a market index plus a margin, subject to customary eligibility criteria and concentration limits.";
    const boilerplate = "The foregoing description of the agreement does not purport to be complete and is qualified in its entirety by reference to the full text of the agreement, a copy of which the Company expects to file as an exhibit to its next periodic report, and the Company will seek confidential treatment for certain of its terms.";
    const cut = selectMaterialEvidence([lead, party, amount, boilerplate].join(" "), PAYLOAD_BUDGETS.eightKEventChars, "event");
    expect(cut.text).toContain("On May 4, 2026, Example Lending Holdings, Inc.");
    expect(cut.text).toContain("up to $750,000,000 of home equity loans");
  });
});
