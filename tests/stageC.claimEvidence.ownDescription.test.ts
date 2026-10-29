/**
 * AI-305 / AI-305-V1 (OD-1): an excerpt figure binds a claim only through its own description. D-63's clause-wide
 * word test still has to hold, and the words the sentence gives to the figure (the noun before it, the words up to
 * the next comma) must be named by the claim too.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { releaseNarrative } from "@/edgar/currentReports";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload, TextExcerpt } from "@/pipeline/stageC/payload";

const EX99 = readFileSync("fixtures/edgar/nvda-current-reports/q2fy27-ex99-2.txt", "utf8");
const sentence = (from: string): string => {
  const at = EX99.indexOf(from);
  expect(at).toBeGreaterThanOrEqual(0);
  return EX99.slice(at, EX99.indexOf(". ", at) + 1);
};
const onExcerpt = (claim: string, text: string, title: string, ignoreWords: readonly string[] = []) => {
  const excerpt: TextExcerpt = { title, text, source: "x:s", asOf: "2026-08-26", truncated: false, originalChars: text.length };
  return validateClaimNumericSupport({ label: "FACT", text: claim, source: "x:s", asOf: "2026-08-26" },
    { excerpts: [excerpt], sourceId: "x:s", reportingCurrency: "USD", ignoreWords });
};
const Q2 = "8-K Q2 FY2027";
const MU_CASH = "Micron ended the year with cash, marketable investments, and restricted cash of $73.48 billion.";
const MU_TITLE = "8-K EX-99.1 Q4 FY2026";

describe("AI-305 a figure the sentence gives to another noun is not the claim's metric", () => {
  it.each([
    ["NVDA: a record of nearly $26.0 billion to shareholders", sentence("These changes were driven by higher free cash flow"), Q2, "Free cash flow for Q2 FY2027 was USD 26.0 billion.", []],
    ["synthetic minimal pair", "Free cash flow funded the return of $26.0 billion to shareholders.", Q2, "Free cash flow for Q2 FY2027 was USD 26.0 billion.", []],
    ["MU: benefiting diluted EPS by $1.93", "Our results reflect a net benefit from tax incentive arrangements for our tax provision of $2.21 billion (benefiting our diluted earnings per share by $1.93).",
      "10-K Item 7 (reporting period ended 2026-09-03)", "Diluted earnings per share as of 2026-09-03 was USD 1.93.", []],
    ["AMZN: an annualized revenue run rate", "AWS net sales increased 37%—its fastest growth in 18 quarters—to a $169 billion annualized revenue run rate.",
      "8-K EX-99.1 (event 2026-07-30)", "Revenue as of 2026-07-30 was USD 169 billion.", []],
    ["MU: combined cash and restricted cash", MU_CASH, MU_TITLE, "Cash for Q4 FY2026 was USD 73.48 billion.", ["Micron"]],
    ["NVDA: cash and marketable debt securities", sentence("Cash, cash equivalents, and marketable debt securities were"), "8-K Q2 FY2027", "Cash and cash equivalents were USD 56.6 billion.", []],
  ] as const)("%s is not validated", (_name, text, title, claim, ignore) => {
    expect(onExcerpt(claim, text, title, ignore).status).not.toBe("validated");
  });
});

describe("AI-305 controls: a figure that is the claim's own description still validates", () => {
  it.each([
    ["Inventory was USD 31.6 billion.", sentence("Inventory was $31.6 billion"), Q2],
    ["Free cash flow for Q2 FY2027 was USD 21.3 billion.", "Free cash flow was $21.3 billion in the quarter.", Q2],
    ["Cash, marketable investments, and restricted cash were USD 73.48 billion.", MU_CASH, MU_TITLE],
    ["Cash and marketable investments totaled USD 73.45 billion as of September 3, 2026.", "Cash and marketable investments totaled $73.45 billion as of September 3, 2026.", "10-K Item 7 (reporting period ended 2026-09-03)"],
    ["As of September 3, 2026, we had purchase obligations of approximately USD 4.18 billion for the acquisition of property, plant, and equipment.",
      "As of September 3, 2026, we had purchase obligations of approximately $4.18 billion for the acquisition of property, plant, and equipment, of which most is due within a year.",
      "10-K Item 7 (reporting period ended 2026-09-03)"],
    // Review Focus 3: intro and trailing clauses do not defeat a correct figure.
    ["Revenue for the second quarter was USD 46.7 billion.", "Revenue for the second quarter was a record $46.7 billion, up 6% from the first quarter and up 56% from a year ago.", Q2],
    ["Data center revenue for the second quarter was USD 41.1 billion.", "In the second quarter, data center revenue was $41.1 billion.", Q2],
  ])("%s", (claim, text, title) => {
    expect(onExcerpt(claim, text, title, text === MU_CASH ? ["Micron"] : []).status).toBe("validated");
  });
});

describe("AI-305 words the sentence gives to the figure, not to the claim", () => {
  const NOTE = "Under the new lease accounting guidance, operating lease liabilities were $2.5 billion.";
  it("a fronted phrase is part of the figure's own description (recorded recall cost)", () => {
    expect(onExcerpt("Operating lease liabilities were USD 2.5 billion.", NOTE, "10-K notes (FY2026)").status).not.toBe("validated");
    expect(onExcerpt("Under the new lease accounting guidance, operating lease liabilities were USD 2.5 billion.", NOTE, "10-K notes (FY2026)").status).toBe("validated");
  });
  it("a hyphenated ordinal period phrase and a third-person pronoun are context words", () => {
    expect(onExcerpt("Revenue guidance is USD 108.0 billion.", "Our guidance for third-quarter revenue is $108.0 billion.", "8-K").status).toBe("validated");
    expect(onExcerpt("The grants had a combined target value of USD 12.9 million.", "He had grants with a combined target value of $12.9 million.", "8-K").status).toBe("validated");
  });
  it("the pair of a total and its per-share restatement shares the trailing metric", () => {
    const text = "During the third quarter of fiscal 2026, we returned $2.3 billion to stockholders, including $973 million, or $0.92 per share, of cash dividends paid";
    expect(onExcerpt("Cash dividends paid in the third quarter of fiscal 2026 were USD 973 million.", text, "Q3 FY2026 earnings release").status).toBe("validated");
  });
});

describe("AI-305 table rows (Review Focus 4)", () => {
  const TITLE = "10-K Item 7 — MD&A (reporting period ended 2026-01-25 (FY2026); filed 2026-02-25)";
  it("the first row of a statement table with a heading lead keeps its row description", () => {
    const text = "Jul 26, 2026 Jan 25, 2026 (In millions) Current assets: Cash and cash equivalents $ 22,443 $ 10,605 Other debt securities 34,143 39,065";
    // Fix round 2 (2026-10-28 ruling A): the own description never resolves an ambiguity, so this row stays at its base result, which is already validated (no ambiguity to resolve).
    expect(onExcerpt("Cash and cash equivalents as of 2026-07-26 were USD 22.44 billion.", text, "10-Q").status).toBe("validated");
  });

  it("each row binds only to its own description (control)", () => {
    const text = "Year Ended Jan 25, 2026 Jan 26, 2025 ($ in millions) Revenue $ 215,938 $ 130,497 Cost of revenue 62,475 32,639 Other matters follow.";
    expect(onExcerpt("Cost of revenue as of 2026-01-25 was USD 62.475 billion.", text, TITLE).status).toBe("validated");
    expect(onExcerpt("Revenue as of 2026-01-25 was USD 62.475 billion.", text, TITLE).status).not.toBe("validated");
  });
});

describe("AI-305-V1 the green check of a MetricRow cell", () => {
  const verify = async (text: string, title: string, label: string, value: number) => {
    const payload = {
      companyName: "Micron Technology, Inc.", symbol: "MU",
      provenanceRegistry: [{ id: "payload.statements.income.revenue", kind: "provider", value: 1, unit: "currency",
        currency: "USD", period: "2026-08-26", asOf: "2026-08-26", origin: "edgar", formulaVersion: null, displayPrecision: 0 }],
      citationRegistry: [{ id: "edgar:8-K EX-99.2", asOf: "2026-08-26", origin: "edgar:8-K EX-99.2", kind: "payload-text" }],
      filings: [{ source: "edgar:8-K EX-99.2", asOf: "2026-08-26", text, title, truncated: false, originalChars: text.length }],
    } as unknown as ContextPayload;
    const cell = { period: "2026-07-26", value: { value, unit: `USD billions: ${label}`, currency: "USD", sourceId: "edgar:8-K EX-99.2", source: "edgar:8-K EX-99.2", asOf: "2026-08-26", verified: null } };
    const result = await runVerifyPass({ runPass: () => { throw new Error("no judge in a verify test"); } } as unknown as PassDeps, payload,
      { fcf: [{ label, values: [cell] }] });
    return result.verifiedReport.fcf[0]!.values[0]!.value.verified;
  };
  it("a free-cash-flow cell is not checked against the record of nearly $26.0 billion returned", async () => {
    expect(await verify(sentence("These changes were driven by higher free cash flow"), Q2, "Free cash flow", 26.0)).toBe(false);
  });
  it("a cell whose label is the sentence's own description keeps its check (control)", async () => {
    expect(await verify(MU_CASH, MU_TITLE, "Cash, marketable investments, and restricted cash", 73.48)).toBe(true);
  });
});

// Fix round 1. The own-description rule may only make the verifier more careful: it never resolves a prose ambiguity (a claim the base left
// unchecked stays unchecked), so a wrong claim cannot validate and a true one cannot be contradicted through it.
describe("AI-305 fix round 1: no ambiguity resolution in prose", () => {
  const RELEASE = releaseNarrative(readFileSync("fixtures/edgar/nvda-current-reports/q2fy27-ex99-1.txt", "utf8"));
  const TITLE = "8-K EX-99.1 - earnings release, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)";
  it.each([
    "Revenue for the second quarter was USD %s billion.",
    "Revenue for the second quarter ended July 26, 2026 was USD %s billion.",
    "Second-quarter revenue was USD %s billion.",
  ])("the committed NVDA release: %s", (template) => {
    expect(onExcerpt(template.replace("%s", "89.0"), RELEASE, TITLE).status).not.toBe("validated");
    expect(onExcerpt(template.replace("%s", "96.2"), RELEASE, TITLE).status).not.toBe("contradicted");
  });
  it.each([
    "Total revenue was $46.7 billion. Data Center • Second-quarter revenue was $41.1 billion. Gaming revenue was $4.3 billion.",
    "Revenue, which includes services, was $46.7 billion. Data Center: revenue was $41.1 billion.",
  ])("a total-revenue claim against a segment of the same words: %s", (text) => {
    expect(onExcerpt("Total revenue was USD 41.1 billion.", text, Q2).status).not.toBe("validated");
    expect(onExcerpt("Total revenue was USD 46.7 billion.", text, Q2).status).not.toBe("contradicted");
    // Fix round 2 (ruling C): the form with a period fails first at 903b2cd (validated / contradicted there).
    expect(onExcerpt("Revenue for Q2 FY2027 was USD 41.1 billion.", text, Q2).status).not.toBe("validated");
    expect(onExcerpt("Revenue for Q2 FY2027 was USD 46.7 billion.", text, Q2).status).not.toBe("contradicted");
  });
  it("fix round 2 (2026-10-28 ruling A): a table does not resolve a base ambiguity either; the first row stays text-ambiguous", () => {
    const text = "Year Ended Jan 25, 2026 Jan 26, 2025 ($ in millions, except per share data) Revenue $ 215,938 $ 130,497 Cost of revenue 62,475 32,639 Other matters follow.";
    const title = "10-K Item 7 (reporting period ended 2026-01-25 (FY2026); filed 2026-02-25)";
    expect(onExcerpt("Revenue as of 2026-01-25 was USD 215.938 billion.", text, title).status).not.toBe("validated");
    expect(onExcerpt("Revenue as of 2026-01-25 was USD 62.475 billion.", text, title).status).not.toBe("validated");
    expect(onExcerpt("Revenue as of 2026-01-25 was USD 62.475 billion.", text, title).status).not.toBe("contradicted");
  });
  describe("fix round 2: no wrong row validates and no true figure is contradicted through a table", () => {
    const TABLE_TITLE = "10-Q (reporting period ended 2026-07-26)";
    const unchecked = (claim: string, text: string, title = TABLE_TITLE) => expect(onExcerpt(claim, text, title).status).toBe("unchecked");
    it.each([
      ["Product: Revenue", "Jul 26, 2026 Jul 27, 2025 (In millions) Product: Revenue $ 41,100 $ 30,000 Services revenue 5,600 5,000 Total revenue $ 46,700 $ 35,000 Other matters follow."],
      ["Data Center: Revenue", "Jul 26, 2026 Jul 27, 2025 (In millions) Total revenue $ 46,700 $ 35,000 Data Center: Revenue $ 41,100 $ 30,000 Other matters follow."],
      ["a prose total beside a table cell", "Total revenue was $46.7 billion. Jul 26, 2026 Jul 27, 2025 (In millions) Data Center: Revenue $ 41,100 $ 30,000 Other matters follow."],
    ])("%s", (_name, text) => {
      unchecked("Revenue as of 2026-07-26 was USD 41.1 billion.", text);
      unchecked("Revenue as of 2026-07-26 was USD 5.0 billion.", text);
      unchecked("Revenue as of 2026-07-26 was USD 46.7 billion.", text);
    });
    it("fix round 3 (N5): a 'respectively' list is a base ambiguity the own description cannot resolve", () => {
      const text = "Data center revenue and total revenue were $5.0 billion and $9.0 billion, respectively. Data Center: revenue was $5.0 billion.";
      expect(onExcerpt("Revenue was USD 5.0 billion.", text, Q2).status).not.toBe("validated");
      expect(onExcerpt("Revenue was USD 9.0 billion.", text, Q2).status).not.toBe("contradicted");
    });
    it("fix round 3 (N5b): each claim keeps its base result beside a respectively list", () => {
      const text = "Revenue was $5.0 billion. Data center and gaming revenue were $5.0 billion and $3.0 billion, respectively.";
      expect(onExcerpt("Revenue was USD 5.0 billion.", text, Q2).status).toBe("unchecked");
      expect(onExcerpt("Revenue was USD 3.0 billion.", text, Q2).status).toBe("unchecked");
    });
    it("an invalid date elsewhere in the excerpt keeps the claim period-mismatch (ruling B)", () => {
      const text = "On 03/04/2026, total revenue was $46.7 billion. Data Center: revenue was $41.1 billion.";
      for (const claim of ["Revenue was USD 41.1 billion.", "Revenue was USD 46.7 billion."]) {
        const result = onExcerpt(claim, text, Q2);
        expect([result.status, result.reason]).toEqual(["unchecked", "period-mismatch"]);
      }
    });
  });
});

describe("AI-305 fix round 1: a continuation names only the source figure's own words after the figure", () => {
  it.each([
    ["Revenue for Q2 FY2027 was USD 5.0 billion, and services drove the growth.", "Revenue from services was $5.0 billion, and revenue from products was $7.0 billion.", "Q2 FY2027 results"],
    ["Free cash flow for Q2 FY2027 was USD 26.0 billion and funded the return to shareholders.", "Free cash flow funded the return of $26.0 billion to shareholders.", Q2],
    ["Free cash flow for Q2 FY2027 was USD 26.0 billion while it funded the return to shareholders.", "Free cash flow funded the return of $26.0 billion to shareholders.", Q2],
  ])("not validated: %s", (claim, text, title) => {
    expect(onExcerpt(claim, text, title).status).not.toBe("validated");
  });
  it("research and development after the figure is named by the claim's continuation (control)", () => {
    expect(onExcerpt("NVIDIA has invested over USD 76.7 billion in research and development since its inception.",
      "We have invested over $76.7 billion in research and development since our inception, yielding inventions.", "10-K Item 1", ["NVIDIA"]).status).toBe("validated");
  });
  it("a fronted phrase after a comma is not the figure's own description", () => {
    const title = "10-K notes (FY2026)";
    expect(onExcerpt("Operating lease liabilities were USD 2.5 billion.", "Operating lease liabilities were $2.5 billion, under the new lease accounting guidance.", title).status).toBe("validated");
    expect(onExcerpt("Operating lease liabilities were USD 2.5 billion.", "Operating lease liabilities were $2.5 billion, under our new guidance.", title).status).not.toBe("validated");
  });
});

// Task 9 review carry (structural guard): the own description can only leave a claim unchecked. 66 probe cases from the
// Task 9 reviewer; `base` is the status before the own description existed (2b5a350). Synthetic sources and committed
// NVDA fixtures only.
type PropertyCase = { label: string; claim: string; source: string; title: string; ignore?: readonly string[]; base: string; baseReason: string };
const fx = (() => {
  const read = (name: string, dir = "nvda-current-reports"): string => readFileSync(`fixtures/edgar/${dir}/${name}`, "utf8");
  const from = (text: string, marker: string): string => {
    expect(text.indexOf(marker)).toBeGreaterThanOrEqual(0);
    return text.slice(text.indexOf(marker));
  };
  const sentenceOf = (text: string, marker: string): string => {
    const at = text.indexOf(marker);
    expect(at).toBeGreaterThanOrEqual(0);
    return text.slice(at, text.indexOf(". ", at) + 1);
  };
  return {
    ex992These: () => sentenceOf(read("q2fy27-ex99-2.txt"), "These changes were driven by higher free cash flow"),
    ex992Inventory: () => sentenceOf(read("q2fy27-ex99-2.txt"), "Inventory was $31.6 billion"),
    ex991Reported: () => from(read("q2fy27-ex99-1.txt"), "NVIDIA (NASDAQ: NVDA) today reported"),
    ex991Highlights: () => from(read("q2fy27-ex99-1.txt"), "Highlights"),
    ex991Narrative: () => releaseNarrative(read("q2fy27-ex99-1.txt")),
    notes: () => read("nvda-10q-q2fy27-notes.txt", "nvda-periodic-sections"),
  };
})();
const PROPERTY_CASES: readonly PropertyCase[] = [
  { label: "A1 fcf+and", claim: "Free cash flow for Q2 FY2027 was USD 26.0 billion and funded the return to shareholders.", source: "Free cash flow funded the return of $26.0 billion to shareholders.", title: "8-K Q2 FY2027", base: "validated", baseReason: "supported" },
  { label: "A1c fcf short (AI-305 defect)", claim: "Free cash flow for Q2 FY2027 was USD 26.0 billion.", source: "Free cash flow funded the return of $26.0 billion to shareholders.", title: "8-K Q2 FY2027", base: "validated", baseReason: "supported" },
  { label: "A1w fcf+while", claim: "Free cash flow for Q2 FY2027 was USD 26.0 billion while it funded the return to shareholders.", source: "Free cash flow funded the return of $26.0 billion to shareholders.", title: "8-K Q2 FY2027", base: "validated", baseReason: "supported" },
  { label: "A3b services+comma-and", claim: "Revenue for Q2 FY2027 was USD 5.0 billion, and services drove the growth.", source: "Revenue from services was $5.0 billion, and revenue from products was $7.0 billion.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "A3d products+comma-and", claim: "Revenue for Q2 FY2027 was USD 7.0 billion, and products drove the growth.", source: "Revenue from services was $5.0 billion, and revenue from products was $7.0 billion.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "A2 NVDA s1 (AI-305 defect)", claim: "Free cash flow for Q2 FY2027 was USD 26.0 billion.", source: fx.ex992These(), title: "8-K Q2 FY2027", base: "validated", baseReason: "supported" },
  { label: "A4 AMZN run rate (defect)", claim: "Revenue as of 2026-07-30 was USD 169 billion.", source: "AWS net sales increased 37%—its fastest growth in 18 quarters—to a $169 billion annualized revenue run rate.", title: "8-K EX-99.1 (event 2026-07-30)", base: "validated", baseReason: "supported" },
  { label: "A6 MU cash (defect)", claim: "Cash for Q4 FY2026 was USD 73.48 billion.", source: "Micron ended the year with cash, marketable investments, and restricted cash of $73.48 billion.", title: "8-K EX-99.1 Q4 FY2026", ignore: ["Micron"], base: "validated", baseReason: "supported" },
  { label: "A7 MU cash (control)", claim: "Cash, marketable investments, and restricted cash were USD 73.48 billion.", source: "Micron ended the year with cash, marketable investments, and restricted cash of $73.48 billion.", title: "8-K EX-99.1 Q4 FY2026", ignore: ["Micron"], base: "validated", baseReason: "supported" },
  { label: "A5 bounds R&D (control)", claim: "NVIDIA has invested over USD 76.7 billion in research and development since its inception.", source: "NVIDIA has invested over $76.7 billion in research and development since its inception.", title: "10-K Item 1", ignore: ["NVIDIA"], base: "validated", baseReason: "supported" },
  { label: "A8 inventory (control)", claim: "Inventory was USD 31.6 billion.", source: fx.ex992Inventory(), title: "8-K Q2 FY2027", base: "validated", baseReason: "supported" },
  { label: "B5 total fromLead ended", claim: "Revenue for the second quarter ended July 26, 2026 was USD 96.2 billion.", source: fx.ex991Reported(), title: "8-K EX-99.1 - earnings release, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)", ignore: ["NVIDIA","NVDA"], base: "unchecked", baseReason: "text-ambiguous" },
  { label: "B7 DC-as-total fromLead ended", claim: "Revenue for the second quarter ended July 26, 2026 was USD 89.0 billion.", source: fx.ex991Reported(), title: "8-K EX-99.1 - earnings release, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)", ignore: ["NVIDIA","NVDA"], base: "unchecked", baseReason: "text-ambiguous" },
  { label: "K2 total highlights", claim: "Revenue for the second quarter ended July 26, 2026 was USD 96.2 billion.", source: fx.ex991Highlights(), title: "8-K EX-99.1 - earnings release, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)", ignore: ["NVIDIA","NVDA"], base: "unchecked", baseReason: "text-ambiguous" },
  { label: "K3 DC-as-total highlights", claim: "Revenue for the second quarter ended July 26, 2026 was USD 89.0 billion.", source: fx.ex991Highlights(), title: "8-K EX-99.1 - earnings release, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)", ignore: ["NVIDIA","NVDA"], base: "unchecked", baseReason: "text-ambiguous" },
  { label: "N1 total narr ended", claim: "Revenue for the second quarter ended July 26, 2026 was USD 96.2 billion.", source: fx.ex991Narrative(), title: "8-K EX-99.1 - earnings release, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)", ignore: ["NVIDIA","NVDA"], base: "unchecked", baseReason: "text-ambiguous" },
  { label: "N2 DC-as-total narr ended", claim: "Revenue for the second quarter ended July 26, 2026 was USD 89.0 billion.", source: fx.ex991Narrative(), title: "8-K EX-99.1 - earnings release, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)", ignore: ["NVIDIA","NVDA"], base: "unchecked", baseReason: "text-ambiguous" },
  { label: "N3 total narr", claim: "Revenue for the second quarter was USD 96.2 billion.", source: fx.ex991Narrative(), title: "8-K EX-99.1 - earnings release, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)", ignore: ["NVIDIA","NVDA"], base: "unchecked", baseReason: "text-ambiguous" },
  { label: "N4 DC-as-total narr", claim: "Revenue for the second quarter was USD 89.0 billion.", source: fx.ex991Narrative(), title: "8-K EX-99.1 - earnings release, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)", ignore: ["NVIDIA","NVDA"], base: "unchecked", baseReason: "text-ambiguous" },
  { label: "N5 total narr hyph", claim: "Second-quarter revenue was USD 96.2 billion.", source: fx.ex991Narrative(), title: "8-K EX-99.1 - earnings release, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)", ignore: ["NVIDIA","NVDA"], base: "unchecked", baseReason: "text-ambiguous" },
  { label: "N6 DC-as-total narr hyph", claim: "Second-quarter revenue was USD 89.0 billion.", source: fx.ex991Narrative(), title: "8-K EX-99.1 - earnings release, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)", ignore: ["NVIDIA","NVDA"], base: "unchecked", baseReason: "text-ambiguous" },
  { label: "C1 seg wrong", claim: "Revenue for Q2 FY2027 was USD 41.1 billion.", source: "Total revenue was $46.7 billion. Data Center • Second-quarter revenue was $41.1 billion. Gaming • Second-quarter gaming revenue was $4.3 billion.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "C2 seg true", claim: "Revenue for Q2 FY2027 was USD 46.7 billion.", source: "Total revenue was $46.7 billion. Data Center • Second-quarter revenue was $41.1 billion. Gaming • Second-quarter gaming revenue was $4.3 billion.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "C3 seg2 wrong", claim: "Revenue for Q2 FY2027 was USD 41.1 billion.", source: "Total revenue was $46.7 billion. Data Center • Second quarter revenue was $41.1 billion. Gaming • Second quarter gaming revenue was $4.3 billion.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "C4 seg2 true", claim: "Revenue for Q2 FY2027 was USD 46.7 billion.", source: "Total revenue was $46.7 billion. Data Center • Second quarter revenue was $41.1 billion. Gaming • Second quarter gaming revenue was $4.3 billion.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "C5 colon wrong", claim: "Revenue for Q2 FY2027 was USD 41.1 billion.", source: "Revenue, which includes services, was $46.7 billion. Data Center: revenue was $41.1 billion.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "C6 colon true", claim: "Revenue for Q2 FY2027 was USD 46.7 billion.", source: "Revenue, which includes services, was $46.7 billion. Data Center: revenue was $41.1 billion.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "P1 pin text1 Q2 41.1", claim: "Revenue for Q2 FY2027 was USD 41.1 billion.", source: "Total revenue was $46.7 billion. Data Center • Second-quarter revenue was $41.1 billion. Gaming revenue was $4.3 billion.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "P2 pin text1 Q2 46.7", claim: "Revenue for Q2 FY2027 was USD 46.7 billion.", source: "Total revenue was $46.7 billion. Data Center • Second-quarter revenue was $41.1 billion. Gaming revenue was $4.3 billion.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "T1 table colon wrong", claim: "Revenue as of 2026-07-26 was USD 41.1 billion.", source: "Jul 26, 2026 Jul 27, 2025 (In millions) Total revenue $ 46,700 $ 35,000 Data Center: Revenue $ 41,100 $ 30,000 Operating income $ 20,000 $ 15,000", title: "10-Q", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "T2 table colon true", claim: "Revenue as of 2026-07-26 was USD 46.7 billion.", source: "Jul 26, 2026 Jul 27, 2025 (In millions) Total revenue $ 46,700 $ 35,000 Data Center: Revenue $ 41,100 $ 30,000 Operating income $ 20,000 $ 15,000", title: "10-Q", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "T3 mixed colon wrong", claim: "Revenue as of 2026-07-26 was USD 41.1 billion.", source: "Total revenue was $46.7 billion. Jul 26, 2026 Jul 27, 2025 (In millions) Data Center: Revenue $ 41,100 $ 30,000 Operating income $ 20,000 $ 15,000", title: "10-Q (quarter ended 2026-07-26)", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "T4 mixed colon true", claim: "Revenue as of 2026-07-26 was USD 46.7 billion.", source: "Total revenue was $46.7 billion. Jul 26, 2026 Jul 27, 2025 (In millions) Data Center: Revenue $ 41,100 $ 30,000 Operating income $ 20,000 $ 15,000", title: "10-Q (quarter ended 2026-07-26)", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "T5 cash+restricted (true)", claim: "Cash and cash equivalents as of 2026-07-26 were USD 22.443 billion.", source: "Jul 26, 2026 Jul 27, 2025 (In millions) Current assets: Cash and cash equivalents $ 22,443 $ 10,605 Restricted cash and cash equivalents 500 400", title: "10-Q", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "T6 cash+restricted (wrong)", claim: "Cash and cash equivalents as of 2026-07-26 were USD 0.5 billion.", source: "Jul 26, 2026 Jul 27, 2025 (In millions) Current assets: Cash and cash equivalents $ 22,443 $ 10,605 Restricted cash and cash equivalents 500 400", title: "10-Q", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "T7 product/services wrong", claim: "Revenue as of 2026-07-26 was USD 41.1 billion.", source: "Jul 26, 2026 Jul 27, 2025 (In millions) Product: Revenue $ 41,100 $ 30,000 Services revenue 5,600 5,000 Total revenue $ 46,700 $ 35,000", title: "10-Q", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "T8 product/services true", claim: "Revenue as of 2026-07-26 was USD 46.7 billion.", source: "Jul 26, 2026 Jul 27, 2025 (In millions) Product: Revenue $ 41,100 $ 30,000 Services revenue 5,600 5,000 Total revenue $ 46,700 $ 35,000", title: "10-Q", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "M1a pin wrong", claim: "Revenue as of 2026-07-26 was USD 41.1 billion.", source: "Jul 26, 2026 Jul 27, 2025 (In millions) Product: Revenue $ 41,100 $ 30,000 Services revenue 5,600 5,000 Total revenue $ 46,700 $ 35,000 Other matters follow.", title: "10-Q (reporting period ended 2026-07-26)", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "M1a pin true", claim: "Revenue as of 2026-07-26 was USD 46.7 billion.", source: "Jul 26, 2026 Jul 27, 2025 (In millions) Product: Revenue $ 41,100 $ 30,000 Services revenue 5,600 5,000 Total revenue $ 46,700 $ 35,000 Other matters follow.", title: "10-Q (reporting period ended 2026-07-26)", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "M1b pin wrong", claim: "Revenue as of 2026-07-26 was USD 41.1 billion.", source: "Jul 26, 2026 Jul 27, 2025 (In millions) Total revenue $ 46,700 $ 35,000 Data Center: Revenue $ 41,100 $ 30,000 Other matters follow.", title: "10-Q (reporting period ended 2026-07-26)", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "M1b pin true", claim: "Revenue as of 2026-07-26 was USD 46.7 billion.", source: "Jul 26, 2026 Jul 27, 2025 (In millions) Total revenue $ 46,700 $ 35,000 Data Center: Revenue $ 41,100 $ 30,000 Other matters follow.", title: "10-Q (reporting period ended 2026-07-26)", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "T10 mixed no-colon wrong", claim: "Revenue as of 2026-07-26 was USD 41.1 billion.", source: "Total revenue was $46.7 billion. Data Center segment Jul 26, 2026 Jul 27, 2025 (In millions) Revenue $ 41,100 $ 30,000 Operating income $ 20,000 $ 15,000", title: "10-Q (quarter ended 2026-07-26)", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "T11 mixed no-colon true", claim: "Revenue as of 2026-07-26 was USD 46.7 billion.", source: "Total revenue was $46.7 billion. Data Center segment Jul 26, 2026 Jul 27, 2025 (In millions) Revenue $ 41,100 $ 30,000 Operating income $ 20,000 $ 15,000", title: "10-Q (quarter ended 2026-07-26)", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "T12 brief Current assets cash", claim: "Cash and cash equivalents as of 2026-07-26 were USD 22.44 billion.", source: "Jul 26, 2026 Jan 25, 2026 (In millions) Current assets: Cash and cash equivalents $ 22,443 $ 10,605 Other debt securities 34,143 39,065", title: "10-Q", base: "validated", baseReason: "supported" },
  { label: "L1 first-row Revenue", claim: "Revenue as of 2026-01-25 was USD 215.938 billion.", source: "Year Ended Jan 25, 2026 Jan 26, 2025 ($ in millions, except per share data) Revenue $ 215,938 $ 130,497 Cost of revenue 62,475 32,639 Other matters follow.", title: "10-K Item 7 (reporting period ended 2026-01-25 (FY2026); filed 2026-02-25)", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "L2 first-row at CoR value", claim: "Revenue as of 2026-01-25 was USD 62.475 billion.", source: "Year Ended Jan 25, 2026 Jan 26, 2025 ($ in millions, except per share data) Revenue $ 215,938 $ 130,497 Cost of revenue 62,475 32,639 Other matters follow.", title: "10-K Item 7 (reporting period ended 2026-01-25 (FY2026); filed 2026-02-25)", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "D1 bad date elsewhere 2.0", claim: "Notes were USD 2.0 billion.", source: "On 03/04/2026, we repaid $1.0 billion of senior notes. Notes were $2.0 billion.", title: "10-Q", base: "unchecked", baseReason: "period-mismatch" },
  { label: "D2 bad date elsewhere 1.0", claim: "Notes were USD 1.0 billion.", source: "On 03/04/2026, we repaid $1.0 billion of senior notes. Notes were $2.0 billion.", title: "10-Q", base: "unchecked", baseReason: "period-mismatch" },
  { label: "D3 bad date on total, DC", claim: "Revenue was USD 41.1 billion.", source: "On 03/04/2026, total revenue was $46.7 billion. Data Center: revenue was $41.1 billion.", title: "10-Q", base: "unchecked", baseReason: "period-mismatch" },
  { label: "D4 bad date on total, true", claim: "Revenue was USD 46.7 billion.", source: "On 03/04/2026, total revenue was $46.7 billion. Data Center: revenue was $41.1 billion.", title: "10-Q", base: "unchecked", baseReason: "period-mismatch" },
  { label: "D5 bad date, own removes all", claim: "Revenue was USD 5.0 billion.", source: "On 03/04/2026, revenue was $5.0 billion from services.", title: "10-Q", base: "unchecked", baseReason: "period-mismatch" },
  { label: "E1 lease after comma", claim: "Operating lease liabilities were USD 2.5 billion.", source: "Operating lease liabilities were $2.5 billion, under the new lease accounting guidance.", title: "10-K notes (FY2026)", base: "validated", baseReason: "supported" },
  { label: "E2 lease our guidance", claim: "Operating lease liabilities were USD 2.5 billion.", source: "Operating lease liabilities were $2.5 billion, under our new guidance.", title: "10-K notes (FY2026)", base: "unchecked", baseReason: "text-context-mismatch" },
  { label: "G1 dividend pair", claim: "Cash dividends paid in the third quarter of fiscal 2026 were USD 973 million.", source: "During the third quarter of fiscal 2026, we returned $2.3 billion to stockholders, including $973 million, or $0.92 per share, of cash dividends paid", title: "Q3 FY2026 earnings release", base: "validated", baseReason: "supported" },
  { label: "G2 dividend per share", claim: "Cash dividends paid in the third quarter of fiscal 2026 were USD 0.92 per share.", source: "During the third quarter of fiscal 2026, we returned $2.3 billion to stockholders, including $973 million, or $0.92 per share, of cash dividends paid", title: "Q3 FY2026 earnings release", base: "validated", baseReason: "supported" },
  { label: "J1 third-quarter guidance", claim: "Revenue guidance is USD 108.0 billion.", source: "Our guidance for third-quarter revenue is $108.0 billion.", title: "8-K", base: "validated", baseReason: "supported" },
  { label: "R1 N5 wrong (total is 9.0)", claim: "Revenue was USD 5.0 billion.", source: "Data center revenue and total revenue were $5.0 billion and $9.0 billion, respectively. Data Center: revenue was $5.0 billion.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "R2 N5 true total", claim: "Revenue was USD 9.0 billion.", source: "Data center revenue and total revenue were $5.0 billion and $9.0 billion, respectively. Data Center: revenue was $5.0 billion.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "R3 N5b 5.0", claim: "Revenue was USD 5.0 billion.", source: "Revenue was $5.0 billion. Data center and gaming revenue were $5.0 billion and $3.0 billion, respectively.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "R4 N5b 6.0", claim: "Revenue was USD 6.0 billion.", source: "Revenue was $5.0 billion. Data center and gaming revenue were $5.0 billion and $3.0 billion, respectively.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "R5 N5b 3.0", claim: "Revenue was USD 3.0 billion.", source: "Revenue was $5.0 billion. Data center and gaming revenue were $5.0 billion and $3.0 billion, respectively.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "Q1 two figures", claim: "Revenue was USD 46.7 billion; gross margin was 75.0%.", source: "Total revenue was $46.7 billion. Gross margin was 75.0%. Data Center: revenue was $41.1 billion.", title: "8-K Q2 FY2027", base: "unchecked", baseReason: "text-ambiguous" },
  { label: "Z1 notes total qtr", claim: "Revenue for the three months ended 2026-07-26 was USD 96.221 billion.", source: fx.notes(), title: "10-Q notes (quarter ended 2026-07-26; Q2 FY2027)", ignore: ["NVIDIA"], base: "unchecked", baseReason: "text-ambiguous" },
  { label: "Z3 notes US as revenue", claim: "Revenue for the three months ended 2026-07-26 was USD 60.074 billion.", source: fx.notes(), title: "10-Q notes (quarter ended 2026-07-26; Q2 FY2027)", ignore: ["NVIDIA"], base: "unchecked", baseReason: "text-ambiguous" },
  { label: "Z4 notes DC as revenue", claim: "Revenue for the three months ended 2026-07-26 was USD 89.023 billion.", source: fx.notes(), title: "10-Q notes (quarter ended 2026-07-26; Q2 FY2027)", ignore: ["NVIDIA"], base: "unchecked", baseReason: "text-ambiguous" },
  { label: "Z7 notes cash", claim: "Cash and cash equivalents as of 2026-07-26 were USD 22.443 billion.", source: fx.notes(), title: "10-Q notes (quarter ended 2026-07-26; Q2 FY2027)", ignore: ["NVIDIA"], base: "unchecked", baseReason: "text-ambiguous" },
];

describe("Task 9 structural guard: the own description can only leave a claim unchecked", () => {
  it("covers the reviewer's 66 probe cases", () => { expect(PROPERTY_CASES).toHaveLength(66); });
  it.each(PROPERTY_CASES.map((c) => [c.label, c] as const))("%s", (_label, c) => {
    const result = onExcerpt(c.claim, c.source, c.title, c.ignore ?? []);
    expect([c.base, "unchecked"]).toContain(result.status);
  });
});
