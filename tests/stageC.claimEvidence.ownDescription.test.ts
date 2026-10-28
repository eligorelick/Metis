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
    expect(onExcerpt("Cash and cash equivalents as of 2026-07-26 were USD 22.44 billion.", text, "10-Q").status).toBe("validated");
  });
  it("the first row under a scale declaration is not asked to name the declaration (a documented move toward validated)", () => {
    const text = "Year Ended Jan 25, 2026 Jan 26, 2025 ($ in millions, except per share data) Revenue $ 215,938 $ 130,497 Cost of revenue 62,475 32,639 Other matters follow.";
    expect(onExcerpt("Revenue as of 2026-01-25 was USD 215.938 billion.", text, TITLE).status).toBe("validated");
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
  });
  it("a table cell is still resolved by its row lead (the documented first-row move)", () => {
    const text = "Year Ended Jan 25, 2026 Jan 26, 2025 ($ in millions, except per share data) Revenue $ 215,938 $ 130,497 Cost of revenue 62,475 32,639 Other matters follow.";
    expect(onExcerpt("Revenue as of 2026-01-25 was USD 215.938 billion.", text, "10-K Item 7 (reporting period ended 2026-01-25 (FY2026); filed 2026-02-25)").status).toBe("validated");
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
