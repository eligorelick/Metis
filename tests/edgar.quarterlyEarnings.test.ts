import { describe, expect, it } from "vitest";
import { parseQuarterlyEarnings } from "@/edgar/quarterlyEarnings";
const text = `Synthetic Incorporated CONSOLIDATED STATEMENTS OF OPERATIONS (In millions, except per share data) (Unaudited)
Three Months Ended Twelve Months Ended September 27, 2026 September 28, 2025 September 27, 2026 September 28, 2025
Revenues $ 100 $ 90 $ 400 $ 360 Net income $ 20 $ (30) $ 80 $ 60
Basic earnings (loss) per share $ 2.00 $ (3.00) $ 8.00 $ 6.00
Diluted earnings (loss) per share $ 1.82 $ (3.00) $ 7.27 $ 5.45
Shares used in per share calculations: Basic 10 10 10 10 Diluted 11 10 11 11
CONSOLIDATED STATEMENTS OF CASH FLOWS`;
describe("direct consolidated quarterly EPS and share evidence", () => {
  it("reads each quarter's direct loss EPS and antidiluted shares without borrowing annual columns", () => {
    expect(parseQuarterlyEarnings(text)).toEqual([
      { periodEnd: "2026-09-27", months: 3, symbol: "$", netIncome: 20e6, eps: 2, epsDiluted: 1.82, weightedAverageShsOut: 10e6, weightedAverageShsOutDil: 11e6 },
      { periodEnd: "2025-09-28", months: 3, symbol: "$", netIncome: -30e6, eps: -3, epsDiluted: -3, weightedAverageShsOut: 10e6, weightedAverageShsOutDil: 10e6 },
    ]);
  });
  it.each([
    "NON-GAAP: ", "Non-GAAP financial information \u2014 ", "Adjusted (Unaudited) ",
    "NON-GAAP FINANCIAL INFORMATION. ", "Adjusted results (in millions): ",
    "Adjusted figures are unaudited. ",
    "Non-GAAP figures are presented below. These amounts are unaudited. ",
    "Adjusted financial information is presented separately below. ",
    "The following adjusted figures are presented separately. ",
    "Adjusted financial information is presented in a separate reconciliation below. ",
  ])("refuses a governing adjusted heading: %s", heading => {
    expect(parseQuarterlyEarnings(text.replace("CONSOLIDATED STATEMENTS", heading + "CONSOLIDATED STATEMENTS"))).toEqual([]);
  });
  it.each([
    "We also discuss non-GAAP earnings elsewhere in this release. ",
    "Adjusted operating results are provided in a separate reconciliation. ",
    "We discuss adjusted operating results separately. Those figures are supplied elsewhere in this release. ",
  ])("keeps the GAAP statement after unrelated adjusted discussion: %s", discussion => {
    expect(parseQuarterlyEarnings(discussion + text)).toHaveLength(2);
  });
  it("separates a prior balance sheet from the current statement's accounting scope", () => {
    const previous = "We also discuss non-GAAP results. CONSOLIDATED BALANCE SHEETS Assets $ 100 Liabilities $ 40 ";
    expect(parseQuarterlyEarnings(previous + text)).toHaveLength(2);
    expect(parseQuarterlyEarnings(previous + text.replace("CONSOLIDATED STATEMENTS", "Adjusted (Unaudited): CONSOLIDATED STATEMENTS"))).toEqual([]);
  });
  it.each([
    text.replace("CONSOLIDATED STATEMENTS OF OPERATIONS", "NON-GAAP RECONCILIATION"),
    text.replace("CONSOLIDATED STATEMENTS OF OPERATIONS", "NON-GAAP CONSOLIDATED STATEMENTS OF OPERATIONS"),
    text.replace("Net income $", "Adjusted net income $"),
    text.replace("Three Months Ended", "Nine Months Ended"),
    text.replace("(In millions, except per share data)", ""),
    text.replace("except per share data", "except share and per share data"),
    text.replace("September 28, 2025 September 27", "September 27"),
    text.replace("Diluted 11 10 11 11", "Diluted 11 11 11 11"),
    text.replace("$ (3.00)", "$ (5.00)"),
  ])("refuses incomplete or incompatible table", value => expect(parseQuarterlyEarnings(value)).toEqual([]));
});
