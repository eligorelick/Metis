import { describe, expect, it } from "vitest";
import { PAYLOAD_BUDGETS } from "@/pipeline/stageC/payload";
import { selectMaterialEvidence } from "@/pipeline/stageC/evidenceSelection";

// AI-101 (B3 Task 8): a fictional Item 5.02 analogue. No real names, amounts, plan names or filing dates.
const TITLE = "Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers; Compensatory Arrangements of Certain Officers";
const TEXT = "On September 8, 2026, the Board of Directors of Example Holdings, Inc. (the “Company”) elected Alan R. Testcase as a director of the Company and also appointed him to the Audit Committee and Security Committee of the Board. " +
  "Mr. Testcase has served as Chief Executive Officer of Northwind Labs, Inc., a cybersecurity company he founded, since September 2025. " +
  "Mr. Testcase has also served as General Partner of Harbor Point Ventures, a venture capital firm he co-founded, since June 2024 and previously served as Strategic Partner from December 2021 to June 2024. " +
  "He served as Chief Executive Officer of Contoso Security, Inc., a cybersecurity firm acquired by Fabrikam LLC in September 2022, from June 2016 to July 2024 and as a director from February 2016 to September 2022. " +
  "In connection with his election, Mr. Testcase was granted a restricted stock unit award under the Company’s 2011 Stock Incentive Plan for 4,912 shares of common stock of the Company, to vest in three equal annual installments beginning on November 15, 2027, assuming continued service as a director. " +
  "Mr. Testcase also entered into an indemnification agreement with the Company in the same form as its other directors have entered, which is filed as an exhibit to Amendment No. 2, filed March 14, 2011, to the Company’s Registration Statement on Form S-1 (Registration No. 333-00000). " +
  "Jane Testcase, an employee of the Company, is the sister-in-law of Mr. Testcase. Ms. Testcase’s annual salary is $172,000. " +
  "In 2026, she was also granted a restricted stock unit award under the Company’s 2011 Stock Incentive Plan with respect to 117 shares of common stock of the Company, vesting over 1.9 years. " +
  "Her compensation is consistent with the total compensation provided to other employees of the same level with similar responsibilities.";
const BODY = [`Item 5.02 (${TITLE}): 3`, `Item 5.02 (${TITLE}): ${TEXT}`].join("\n\n");
const REFERENT_AND_SALARY = "Jane Testcase, an employee of the Company, is the sister-in-law of Mr. Testcase. Ms. Testcase’s annual salary is $172,000.";

describe("8-K event excerpts keep a person's amount with the sentence that names the person (AI-101)", () => {
  it("keeps the appointee's award and never a relative's pay without the sentence naming her", () => {
    const cut = selectMaterialEvidence(BODY, PAYLOAD_BUDGETS.eightKEventChars, "event");
    expect(cut.text).toContain("for 4,912 shares of common stock");
    // The relative is introduced here; whether her pay also fits is the budget's call, and the 1,700 case below pins that it travels with it.
    expect(cut.text).toContain("Jane Testcase, an employee of the Company, is the sister-in-law of Mr. Testcase.");
    if (cut.text.includes("annual salary")) expect(cut.text).toContain(REFERENT_AND_SALARY);
    for (const orphan of ["omitted…]\nMs. Testcase", "omitted…]\nIn 2026, she", "omitted…]\nHer compensation"]) expect(cut.text).not.toContain(orphan);
    expect(cut.coverage.version).toBe("section-evidence-5/event");
  });
  it("keeps the related-person amount with its referent when there is room", () => {
    expect(selectMaterialEvidence(BODY, 1_700, "event").text).toContain(REFERENT_AND_SALARY);
  });
  it("binds a possessive honorific to the full name, not to an apostrophe form (regression guard for the surname capture)", () => {
    // With a capture that swallows "’s", this budget keeps the salary sentence alone after an omission marker.
    for (const budget of [1_200, 1_300, 1_400, 1_500, 1_600, 1_700, 1_800]) {
      const text = selectMaterialEvidence(BODY, budget, "event").text;
      expect(text, String(budget)).not.toContain("omitted…]\nMs. Testcase");
      if (text.includes("Ms. Testcase’s annual salary")) expect(text, String(budget)).toContain(REFERENT_AND_SALARY);
    }
  });
  it("does not let a share count change the other profiles’ selection", () => {
    // Equal-scoring passages rank by position, so a share-count term would lift the share-bearing passage
    // at position 20 (of 30) above its neighbours into a small budget. The one at position 2 is kept either way, so
    // the selection always holds a share count and the comparison is not between two empty or share-free picks.
    const line = (n: number) => `Revenue from customers grew to $5 billion in quarter ${n}.`;
    const lines = Array.from({ length: 30 }, (_, n) => ([2, 20].includes(n) ? "Revenue from customers grew to $5 billion and 7,000 shares were awarded." : line(n)));
    const text = lines.join("\n");
    // "shares" -> "shaves" keeps every length and position, so only a share-count quantity could differ.
    const altered = text.split(" shares").join(" shaves");
    expect(altered.length).toBe(text.length);
    for (const profile of ["financial", "business", "interim"] as const) {
      for (const budget of [700, 900]) {
        const a = selectMaterialEvidence(text, budget, profile);
        const b = selectMaterialEvidence(altered, budget, profile);
        const label = `${profile} ${budget}`;
        expect(a.spans.length, label).toBeGreaterThan(0);
        expect(a.spans.some((span) => /\d shares\b/.test(span.text)), label).toBe(true);
        expect(a.spans.map((span) => [span.start, span.end]), label).toEqual(b.spans.map((span) => [span.start, span.end]));
      }
    }
  });

  it("leaves the other profiles' coverage version unchanged", () => {
    for (const profile of ["financial", "business", "interim"] as const) {
      expect(selectMaterialEvidence(BODY, 600, profile).coverage.version).toBe(profile === "financial" ? "section-evidence-2" : `section-evidence-2/${profile}`);
    }
  });
});
