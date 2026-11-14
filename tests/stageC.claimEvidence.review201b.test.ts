import { expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { TextExcerpt } from "@/pipeline/stageC/payload";

type Case = [name: string, excerptText: string, claim: string];
const run = (c: Case) => {
  const [, text, claim] = c;
  const ex: TextExcerpt = { title: "10-Q Item 2", source: "edgar:10-Q item2", asOf: "2026-06-30", text, truncated: false, originalChars: text.length };
  return validateClaimNumericSupport({ label: "FACT", text: claim, source: ex.source, asOf: ex.asOf },
    { excerpts: [ex], sourceId: ex.source, reportingCurrency: "USD" });
};
const G = "U.S. revenue was $24.4 billion. Operating income was $12.3 billion.";
const cases: Case[] = [
  ["direct-clause-control", "As of June 30, 2026, a 5 percent change in the consolidated sales return, rebate, and discount liability would result in a change in revenue of approximately $897 million.", "As of June 30, 2026, a 5 percent change in the consolidated sales return, rebate, and discount liability would result in a change in revenue of approximately $897 million."],
  ["whole-word-scope", "Segment revenue was $24.4 billion. Segments operating income was $12.3 billion.", "Segment revenue was $24.4 billion, segments operating income was $12.3 billion."],
  ["repeated-scope-control", "Services unit revenue was $24.4 billion. Services unit operating income was $12.3 billion.", "Services unit revenue was $24.4 billion, services unit operating income was $12.3 billion."],
  ["us-2", G, "For Lilly's U.S. business, revenue was $24.4 billion, operating income was $12.3 billion."],
  ["europe", "Europe revenue was $24.4 billion. Operating income was $12.3 billion.", "In Europe, revenue was $24.4 billion, operating income was $12.3 billion."],
  ["within-dc", "Data Center revenue was $24.4 billion. Operating income was $12.3 billion.", "Within Data Center, revenue was $24.4 billion, operating income was $12.3 billion."],
  ["dc-trailing", "Data Center revenue was $24.4 billion. Operating income was $12.3 billion.", "Revenue was $24.4 billion, operating income was $12.3 billion, both for Data Center."],
  ["local-ccy", "Revenue grew 12% in local currency. Operating income grew 8%. In local currency, operating income grew 10%.", "In local currency, revenue grew 12%, operating income grew 8%."],
  ["cc-trailing", "Revenue grew 12% in constant currency. Operating income grew 8%. In constant currency, operating income grew 10%.", "Revenue grew 12%, operating income grew 8%, both in constant currency."],
  ["nongaap-space", "Non GAAP revenue was $24.4 billion. Operating income was $12.3 billion. Non GAAP operating income was $14.0 billion.", "On a non GAAP basis, revenue was $24.4 billion, operating income was $12.3 billion."],
  ["nongaap-nbh", "Revenue was $24.4 billion. Operating income was $12.3 billion. Non‑GAAP operating income was $14.0 billion.", "On a non‑GAAP basis, revenue was $24.4 billion, operating income was $12.3 billion."],
  ["core", "Core revenue was $24.4 billion. Operating income was $12.3 billion. Core operating income was $14.0 billion.", "On a core basis, revenue was $24.4 billion, operating income was $12.3 billion."],
  ["pro-forma2", "Pro forma revenue was $24.4 billion. Operating income was $12.3 billion.", "On a pro forma basis, revenue was $24.4 billion, operating income was $12.3 billion."],
  ["including-acq", "Revenue was $24.4 billion. Operating income was $12.3 billion.", "Including the Verve acquisition, revenue was $24.4 billion, operating income was $12.3 billion."],
  ["ex-items", "Revenue was $24.4 billion. Operating income was $12.3 billion.", "Ex-items, revenue was $24.4 billion, operating income was $12.3 billion."],
  ["quarterly-window", "Quarterly revenue was $24.4 billion. Operating income for the year was $12.3 billion.", "Quarterly revenue was $24.4 billion, operating income was $12.3 billion."],
  ["ttm", "Trailing twelve month revenue was $24.4 billion. Operating income for the quarter was $12.3 billion.", "Trailing twelve month revenue was $24.4 billion, operating income was $12.3 billion."],
  ["neg-shared", "Revenue was $24.4 billion. Operating income was $12.3 billion.", "Neither did revenue exceed $24.4 billion, nor operating income $12.3 billion."],
  ["neg-shared2", "Revenue was $24.4 billion. Operating income was $12.3 billion.", "It is not true that revenue was $24.4 billion, operating income was $12.3 billion."],
  ["hypo-prefix", "Revenue was $24.4 billion. Operating income was $12.3 billion.", "Had the merger closed, revenue would have been $24.4 billion, operating income $12.3 billion."],
  ["hypo-single", "Operating income was $12.3 billion.", "Operating income would have been $12.3 billion."],
  ["hypo-single2", "Operating income was $12.3 billion.", "Operating income could reach $12.3 billion."],
  ["hypo-pair", "Revenue was $24.4 billion. Operating income was $12.3 billion.", "Revenue was $24.4 billion, operating income could reach $12.3 billion."],
  ["pts-points", "Gross margin percentage increased 2.1 points.", "Gross margin percentage increased 2.1%."],
  ["pts-point", "Gross margin percentage increased 2.1 point.", "Gross margin percentage increased 2.1%."],
  ["pts-ppts", "Gross margin percentage increased 2.1 ppts.", "Gross margin percentage increased 2.1%."],
  ["pts-ppt", "Gross margin percentage increased 2.1 ppt.", "Gross margin percentage increased 2.1%."],
  ["pts-pp", "Gross margin percentage increased 2.1 pp.", "Gross margin percentage increased 2.1%."],
  ["pts-pct-pts", "Gross margin percentage increased 2.1 percentage pts.", "Gross margin percentage increased 2.1%."],
  ["claim-points", "Gross margin percentage increased 2.1%.", "Gross margin percentage increased 2.1 points."],
  ["claim-pts", "Gross margin percentage increased 2.1%.", "Gross margin percentage increased 2.1 pts."],
  ["pct-of-pct", "The percentage of revenue from Mounjaro increased 2.1, to 35.2%.", "The percentage of revenue from Mounjaro increased 2.1%."],
  ["pct-times", "Revenue was 2.1 times the prior year. The percentage was not disclosed.", "Revenue percentage was 2.1."],
  ["percent-label-ratio", "Debt to equity percentage was 45.2.", "Debt to equity was 45.2%."],
  ["count-step", "Store count was 1,200.", "Store count was 1.2 thousand."],
  ["count-thousand-src", "Employee count was 12.3 thousand.", "Employee count was 12,300."],
  ["count-decimal-src", "Employee count was 12.3.", "Employee count was 12.3."],
  ["count-millions-users", "Monthly active user count was 3,350 million.", "Monthly active user count was 3,350."],
  ["count-scaled-src", "Employee count was 12 thousand.", "Employee count was 12,345."],
  ["count-dollar-row", "Store count was 1,234 dollars.", "Store count was 1,234."],
  ["count-vs-pct", "Employee count growth was 12.3%.", "Employee count growth was 12.3."],
  ["percent-vs-count", "Patient count was 53.", "Patient percentage was 53."],
  ["table-row-metric", "(in millions, except count)\nThree Months Ended June 30, 2026\nRevenue 24,400\nStore count 1,234\nOperating income 12,300", "Revenue count was 1,234."],
  ["multi-sentence-metric", "Employee count rose. The figure was 12,345 at year end.", "Employee count was 12,345."],
  ["respectively-pairs", S1(), "Revenue was $24.4 billion, operating income was $12.3 billion."],
];
function S1() { return "Revenue, operating income were $24.4 billion, $12.3 billion, respectively."; }

const expected = {
  "direct-clause-control": "validated",
  "whole-word-scope": "refuse",
  "repeated-scope-control": "validated",
  "us-2": "refuse",
  "europe": "refuse",
  "within-dc": "refuse",
  "dc-trailing": "refuse",
  "local-ccy": "refuse",
  "cc-trailing": "refuse",
  "nongaap-space": "refuse",
  "nongaap-nbh": "refuse",
  "core": "refuse",
  "pro-forma2": "refuse",
  "including-acq": "refuse",
  "ex-items": "refuse",
  "quarterly-window": "refuse",
  "ttm": "refuse",
  "neg-shared": "unchecked",
  "neg-shared2": "unchecked",
  "hypo-prefix": "unchecked",
  "hypo-single": "unchecked",
  "hypo-single2": "unchecked",
  "hypo-pair": "unchecked",
  "pts-points": "refuse",
  "pts-point": "refuse",
  "pts-ppts": "refuse",
  "pts-ppt": "refuse",
  "pts-pp": "refuse",
  "pts-pct-pts": "refuse",
  "claim-points": "refuse",
  "claim-pts": "refuse",
  "pct-of-pct": "refuse",
  "pct-times": "unchecked",
  "percent-label-ratio": "unchecked", // review round 2 (lead fix): no percent is inferred for a bare figure
  "count-step": "validated",
  "count-thousand-src": "unchecked",
  "count-decimal-src": "unchecked",
  "count-millions-users": "contradicted",
  "count-scaled-src": "unchecked",
  "count-dollar-row": "unchecked",
  "count-vs-pct": "unchecked",
  "percent-vs-count": "unchecked",
  "table-row-metric": "unchecked",
  "multi-sentence-metric": "unchecked",
  "respectively-pairs": "unchecked"
} as const;
it.each(cases)("D-274 reviewer reproduction: %s", (...c) => {
 const result = run(c);
 const status = expected[c[0] as keyof typeof expected];
 if (status === "refuse") expect(result.status).not.toBe("validated");
 else expect(result.status).toBe(status);
});
