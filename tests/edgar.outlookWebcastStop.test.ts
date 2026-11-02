import { describe, expect, it } from "vitest";
import { outlookBlock, parseGuidance } from "@/edgar/currentReports";

/**
 * Pre-run check for the FIGR Opus 5.5 extra-high run (2026-11-02). FIGR's Q2 and
 * Q1 2026 releases put a "Webcast Information" heading right after the
 * one-row guidance table. The outlook block ran on to the next stop heading,
 * so the quoted issuer statement (shown to the reader and sent to the passes)
 * ended "... $4.8 - $5.2 Webcast Information Figure will host a conference
 * call and webca st at 8:30 a.m.". The release's webcast notice ends the block.
 */
// 8-K 0002064124-26-000031 EX-99.1 (filed 2026-08-13), text as extracted from the filing.
const FIGR_Q2_2026_OUTLOOK = "Outlook The guidance for Consumer Loan Marketplace volume provided below constitutes forward-looking information within the meaning of applicable securities laws and is based on a number of assumptions and subject to a number of risks. See cautionary note regarding “Forward-looking Statements” in this press release. Q3 2026 Guidance $ in billions Consumer Loan Marketplace Volume $4.8 - $5.2 Webcast Information Figure will host a conference call and webca st at 8:30 a.m. Eastern Time, August 13, 2026 to discuss its results and outlook. A link to the live discussion and accompanying presentation will be made available on the Company’s investor relations website at https://investors.figure.com/ . A replay will also be made available following the discussion at the same website. Forward-Looking Statements Disclosure This press release contains forward-looking statements intended to be covered by the safe harbor provisions of Section 27A of the Securities Act of 1933, as amended, and Section 21E of the Securities Exchange Act of 1934, as amended. All statements other than statements of historical fact contained in this press release, including without limitation statements regarding our pending Kiavi acquisition and the related anticipated benefits, future financial performance and guidance, including our expectations regarding our Consumer Loan Marketplace Volume; our ability to determine reserves, and ability to remain profitable; our ability to maintain, expand, and enter into new relationships with partners and loan purchasers on the secondary market; our ability to broaden our network of partners; and our ability to successfully execute our business and growth strategy; m";

describe("an outlook block ends at the release's webcast notice", () => {
  it("quotes FIGR's guidance line without the webcast paragraph", () => {
    const guidance = parseGuidance(FIGR_Q2_2026_OUTLOOK);
    expect(guidance?.unparsed).toEqual(["Q3 2026 Guidance $ in billions Consumer Loan Marketplace Volume $4.8 - $5.2"]);
  });

  it("ends only at the heading, not at a webcast mentioned inside the outlook", () => {
    const text = "Business Outlook We expect third quarter revenue of $4.8 billion to $5.2 billion, as management will discuss on the webcast later today. Webcast Information The company will host a call.";
    expect(outlookBlock(text)).toBe("Business Outlook We expect third quarter revenue of $4.8 billion to $5.2 billion, as management will discuss on the webcast later today.");
  });
});
