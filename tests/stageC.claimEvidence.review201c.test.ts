import { expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { TextExcerpt } from "@/pipeline/stageC/payload";
const H = "Three Months Ended Six Months Ended Jul 26, 2026 Jul 27, 2025 Jul 26, 2026 Jul 27, 2025 (In millions) ";
const cases: [string, string, string][] = [
  ["tbl-count-millions", H + "Subscriber count 260 250 255 245 Revenue $ 96,221 $ 46,743 $ 177,837 $ 90,805", "Subscriber count for the three months ended July 26, 2026 was 260."],
  ["tbl-count-millions-claimM", H + "Subscriber count 260 250 255 245 Revenue $ 96,221 $ 46,743 $ 177,837 $ 90,805", "Subscriber count for the three months ended July 26, 2026 was 260 million."],
  ["tbl-shares-count", H + "Weighted average share count 897 901 899 903 Revenue $ 96,221 $ 46,743 $ 177,837 $ 90,805", "Weighted average share count for the three months ended July 26, 2026 was 897."],
  ["tbl-pct", H + "Gross margin percentage 53.2 50.1 52.0 49.0 Revenue $ 96,221 $ 46,743 $ 177,837 $ 90,805", "Gross margin percentage for the three months ended July 26, 2026 was 53.2%."],
  ["tbl-pct-wrongcol", H + "Gross margin percentage 53.2 50.1 52.0 49.0 Revenue $ 96,221 $ 46,743 $ 177,837 $ 90,805", "Gross margin percentage for the six months ended July 26, 2026 was 53.2%."],
  ["tbl-two-figs", H + "Gross margin percentage 53.2 50.1 52.0 49.0 Revenue $ 96,221 $ 46,743 $ 177,837 $ 90,805", "Revenue for the three months ended July 26, 2026 was USD 96,221 million, gross margin percentage was 53.2%."],
  ["tbl-two-figs-ok", H + "Gross margin percentage 53.2 50.1 52.0 49.0 Revenue $ 96,221 $ 46,743 $ 177,837 $ 90,805", "Revenue for the three months ended July 26, 2026 was USD 96,221 million, gross margin percentage for the three months ended July 26, 2026 was 53.2%."],
  ["tbl-two-figs-wrongrow", H + "Gross margin percentage 53.2 50.1 52.0 49.0 Operating margin percentage 30.1 28.0 29.0 27.0 Revenue $ 96,221 $ 46,743 $ 177,837 $ 90,805", "Revenue for the three months ended July 26, 2026 was USD 96,221 million, operating margin percentage for the three months ended July 26, 2026 was 53.2%."],
];
const expected = {
  "tbl-count-millions": "refuse",
  "tbl-count-millions-claimM": "refuse",
  "tbl-shares-count": "refuse",
  "tbl-pct": "validated",
  "tbl-pct-wrongcol": "contradicted",
  "tbl-two-figs": "unchecked",
  "tbl-two-figs-ok": "validated",
  "tbl-two-figs-wrongrow": "contradicted"
} as const;
it.each(cases)("D-274 reviewer table reproduction: %s", (name, text, claim) => {
 const ex: TextExcerpt = { title: "10-Q Item 2", source: "edgar:10-Q item2", asOf: "2026-07-26", text, truncated: false, originalChars: text.length };
 const result = validateClaimNumericSupport({ label: "FACT", text: claim, source: ex.source, asOf: ex.asOf }, { excerpts: [ex], sourceId: ex.source, reportingCurrency: "USD" });
 const status = expected[name as keyof typeof expected];
 if (status === "refuse") expect(result.status).toBe("unchecked");
 else expect(result.status).toBe(status);
});
