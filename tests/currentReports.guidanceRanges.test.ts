/**
 * Audit 2026-10-22 B-25: hyphenated outlook ranges and full-year periods.
 *
 * Sentences are Meta's, Lilly's, NextEra's, AT&T's and Verizon's own EX-99.1
 * wording (public SEC filings; Meta 0001628280-26-003832, -028364, -050596 and
 * -066700). "$73-76 billion" was read as an unscaled $73 point and "15-17%" as
 * −17%; a full-year outlook that names its year without "full year" took the
 * outlook block's quarter.
 */
import { describe, expect, it } from "vitest";

import { moneyMentions, parseGuidanceSentence, type FiscalPeriod } from "@/edgar/currentReports";
import { buildFilingDisclosures, nextPeriodRevenueGuidance } from "@/pipeline/filingDisclosures";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const q = (fiscalYear: number, fiscalQuarter: 1 | 2 | 3 | 4): FiscalPeriod => ({ label: `Q${fiscalQuarter} FY${fiscalYear}`, fiscalYear, fiscalQuarter });
const read = (sentence: string, period: FiscalPeriod | null = null) =>
  parseGuidanceSentence(sentence, period).map((i) => [i.period.label, i.metric, i.form, i.low, i.mid, i.high]);

describe("hyphenated outlook ranges (audit 2026-10-22 B-25)", () => {
  it("shares a trailing scale word across both ends of a money range", () => {
    expect(read("We expect fourth quarter 2026 total revenue to be in the range of $73-76 billion.")).toEqual([
      ["Q4 FY2026", "revenue", "range", 73e9, 74.5e9, 76e9],
    ]);
    expect(read("We expect first quarter 2026 total revenue to be in the range of $53.5-56.5 billion.")).toEqual([
      ["Q1 FY2026", "revenue", "range", 53.5e9, 55e9, 56.5e9],
    ]);
    // En dash, a repeated symbol and a word connector read the same way.
    expect(read("We expect second quarter 2026 total revenue to be in the range of $58–61 billion.")[0]?.slice(3)).toEqual([58e9, 59.5e9, 61e9]);
    expect(read("We expect second quarter 2026 total revenue to be in the range of $58-$61 billion.")[0]?.slice(3)).toEqual([58e9, 59.5e9, 61e9]);
    expect(read("Revenue for the second quarter of 2026 is expected to be between $58 and $61 billion.")[0]?.slice(3)).toEqual([58e9, 59.5e9, 61e9]);
    expect(moneyMentions("in the range of $73-76 billion").map((m) => [m.value, m.symbol])).toEqual([[73e9, "$"], [76e9, "$"]]);
    // A stated scale on each end, and an unscaled per-share range, are unchanged.
    expect(read("For the first quarter of 2027, Acme expects revenue to be in the range of $1.20 billion to $1.25 billion.")[0]?.slice(3)).toEqual([1.2e9, 1.225e9, 1.25e9]);
    expect(read("Diluted earnings per share for the first quarter of 2027 is expected to be between $0.45 and $0.50.")[0]?.slice(3)).toEqual([0.45, 0.475, 0.5]);
  });

  it("never reads the hyphen of a percent range as a minus sign", () => {
    expect(read("Absent any changes to our tax landscape, we expect our fourth quarter 2026 tax rate to be between 15-17%.")).toEqual([
      ["Q4 FY2026", "tax-rate", "range", 15, 16, 17],
    ]);
    expect(read("Absent any changes to our tax landscape, we expect our full year 2026 tax rate to be 13-16%.")).toEqual([
      ["FY2026", "tax-rate", "range", 13, 14.5, 16],
    ]);
    expect(read("We expect our fourth quarter 2026 tax rate to be between 15%-17%.")[0]?.slice(3)).toEqual([15, 16, 17]);
    expect(read("We expect our fourth quarter 2026 tax rate to be between 15–17%.")[0]?.slice(3)).toEqual([15, 16, 17]);
    // A sign that follows no number is still a sign.
    expect(read("We expect fourth quarter 2026 operating margin to be -2%.")[0]?.slice(3)).toEqual([-2, -2, -2]);
  });

  it("reads the outlook, not the prior outlook it is compared with", () => {
    expect(read("Absent any changes to our tax landscape, we expect our tax rate for the remaining quarters of 2026 to be between 15-17%, an increase from our prior outlook of 13-16%.", q(2026, 3)))
      .toEqual([["Q3 FY2026", "tax-rate", "range", 15, 16, 17]]);
  });

  it("leaves a stated range unread rather than publishing one end as a point", () => {
    expect(read("We expect fourth quarter 2026 total revenue to be in the range of $73 billion to the high seventies.")).toEqual([]);
  });

  it("never takes a span of years for a range of values, and drops a 'vs.' comparison", () => {
    expect(read("Revenue for the fourth quarter of 2026 is expected to be approximately $5.0 billion, with growth continuing from 2027 to 2028."))
      .toEqual([["Q4 FY2026", "revenue", "approximate", 5e9, 5e9, 5e9]]);
    expect(read("We expect our tax rate for the fourth quarter of 2026 to be approximately 16%, and between now and 2028 to trend lower."))
      .toEqual([["Q4 FY2026", "tax-rate", "approximate", 16, 16, 16]]);
    expect(read("We expect fourth quarter 2026 revenue to be approximately $5.0 billion vs. $4.5 billion a year ago."))
      .toEqual([["Q4 FY2026", "revenue", "approximate", 5e9, 5e9, 5e9]]);
  });
});

describe("a full-year outlook that names its year without \"full year\" (audit 2026-10-22 B-25)", () => {
  it("labels the guide with the year it names, not the outlook block's quarter", () => {
    expect(read("We anticipate 2026 capital expenditures, including principal payments on finance leases, to be in the range of $115-135 billion, with year-over-year growth driven by increased investment.", q(2026, 1)))
      .toEqual([["FY2026", "capital-expenditures", "range", 115e9, 125e9, 135e9]]);
    expect(read("NextEra Energy continues to expect 2026 adjusted earnings per share to be in the range of $3.92 to $4.02 and is targeting the high end of that range.", q(2026, 3)))
      .toEqual([["FY2026", "eps", "range", 3.92, 3.97, 4.02]]);
    expect(read("Adjusted EPS* of $2.25 to $2.35 in 2026 with a double-digit 3-year CAGR through 2028. ◦ The Company's outlook for adjusted EPS* anticipates that its acquisitions will be modestly dilutive.", q(2025, 2)))
      .toEqual([["FY2026", "eps", "range", 2.25, 2.3, 2.35]]);
    expect(read("In addition, Verizon remains on track to meet its investment goals for 2025 and expects capital expenditures to be within or below the previously guided range of $17.5 billion to $18.5 billion.", q(2025, 1)))
      .toEqual([["FY2025", "capital-expenditures", "range", 17.5e9, 18e9, 18.5e9]]);
  });

  it("never takes a maturity year or a past year for the outlook's year", () => {
    expect(read("We expect capital expenditures to be approximately $2.0 billion, funded in part by notes due 2030.", q(2026, 2))?.[0]?.[0]).toBe("Q2 FY2026");
    expect(read("Excluding the impact of the 2024 divestiture, we expect revenue to be approximately $5.0 billion.", q(2026, 3))?.[0]?.[0]).toBe("Q3 FY2026");
    // A year after "over", "above" or "than" is the comparison base.
    expect(read("We expect capital expenditures to be approximately $2.0 billion, higher than 2026.", q(2026, 4))?.[0]?.[0]).toBe("Q4 FY2026");
    expect(read("We expect revenue to be approximately $5.0 billion, representing growth of 10% over 2026.", q(2026, 4))?.[0]?.[0]).toBe("Q4 FY2026");
  });

  it("reads a money guide beside a percent range, and a percent guide beside a money range", () => {
    expect(read("We expect fourth quarter 2026 revenue to be approximately $5.0 billion, up 2-3% year over year."))
      .toEqual([["Q4 FY2026", "revenue", "approximate", 5e9, 5e9, 5e9]]);
    expect(read("We expect our fourth quarter 2026 tax rate to be approximately 16%, on pre-tax income of $1.0-1.2 billion."))
      .toEqual([["Q4 FY2026", "tax-rate", "approximate", 16, 16, 16]]);
  });

  it("labels an unyeared full-year outlook with the outlook block's fiscal year", () => {
    expect(read("Financial Guidance The company has increased full-year revenue guidance to be in the range of $63.0 billion to $63.5 billion, primarily driven by strong underlying business performance.", q(2025, 3)))
      .toEqual([["FY2025", "revenue", "range", 63e9, 63.25e9, 63.5e9]]);
  });

  it("keeps the quarter when the sentence names one, or speaks of the rest of the year", () => {
    expect(read("In 2026, we expect second quarter revenue to be between $1.20 billion and $1.25 billion.", q(2026, 2))[0]?.[0]).toBe("Q2 FY2026");
    expect(read("We expect our tax rate for the remaining quarters of 2026 to be between 13-16%.", q(2026, 2))[0]?.[0]).toBe("Q2 FY2026");
  });
});

describe("a revenue outlook far from the statements (audit 2026-10-22 B-25)", () => {
  const filing = (accessionNumber: string, filingDate: string) => ({ accessionNumber, filingDate, form: "8-K", items: "2.02", acceptanceDateTime: undefined });
  // A release whose revenue outlook prints its scale in a form no rule reads.
  const release = (reported: string, guided: string, amount: string) => [
    `Acme Corp. Reports ${reported} Quarter 2026 Results. Revenue for the ${reported.toLowerCase()} quarter ended ${reported === "First" ? "March 31" : "June 30"}, 2026 was $1.1 billion.`,
    `Business Outlook For the ${guided} quarter of 2026, Acme expects revenue to be ${amount}. About Acme Corp. Acme makes things.`,
  ].join(" ");

  function bundleWith(releases: { text: string; accession: string; filed: string }[]) {
    const bundle = completeCurrencyBundle({ annualCurrency: "USD", estimates: false });
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("quarterly fixture required");
    const rows = bundle.statements.incomeQuarterly.value.data.rows;
    rows.unshift({ ...rows[0]!, date: "2026-06-30" });
    for (const row of rows) row.revenue = 1.1e9;
    const records = releases.map((r) => buildEarningsReleaseRecord({ filing: filing(r.accession, r.filed), releaseUrl: `https://www.sec.gov/${r.accession}`,
      commentaryUrl: null, releaseText: r.text, commentaryText: null, includeNarrative: false }));
    bundle.edgar.currentReports = { ok: true, value: { data: { version: CURRENT_REPORTS_VERSION, releases: records, events: [], notes: [] },
      asOf: releases[0]!.filed, source: "edgar", endpoint: "fixture", fetchedAt: "2026-10-15T00:00:00.000Z" } };
    return bundle;
  }

  it("never anchors the DCF or a guidance check on a revenue guide outside 0.2-5x the last quarter", () => {
    // "$1.2 bn" is read as $1.2: no scale word follows the number.
    const bundle = bundleWith([{ text: release("First", "second", "approximately $1.2 bn"), accession: "0000000001-26-000010", filed: "2026-04-28" }]);
    expect(nextPeriodRevenueGuidance(bundle)).toBeNull();
    const disclosures = buildFilingDisclosures(bundle)!;
    expect(disclosures.guidance?.rows ?? []).toEqual([]);
    expect(disclosures.notes.join(" ")).toMatch(/Q2 FY2026 revenue guide of 1\.2 is outside 0\.2-5x the last reported quarter's revenue \(1\.1e\+?9|Q2 FY2026 revenue guide .* outside 0\.2-5x/);
  });

  it("names the currency, not a misread scale, for a guide printed in another currency", () => {
    const bundle = bundleWith([{ text: release("First", "second", "approximately ¥180 billion"), accession: "0000000001-26-000010", filed: "2026-04-28" }]);
    const notes = buildFilingDisclosures(bundle)!.notes.join(" ");
    expect(notes).toMatch(/currency is not the statements'/);
    expect(notes).not.toMatch(/scale was misread/);
  });

  it("anchors on a plausible guide for the same quarter when the first one read is out of band", () => {
    const text = release("First", "second", "approximately $1.2 bn").replace(" About Acme Corp.",
      " For the second quarter of 2026, Acme expects GAAP revenue to be approximately $1.18 billion. About Acme Corp.");
    const anchor = nextPeriodRevenueGuidance(bundleWith([{ text, accession: "0000000001-26-000010", filed: "2026-04-28" }]));
    expect(anchor).toMatchObject({ periodLabel: "Q2 FY2026", mid: 1.18e9 });
  });

  it("keeps a plausible revenue guide as the anchor and scores it against the quarter that reported it", () => {
    const guided = { text: release("First", "second", "in the range of $1.15-1.25 billion"), accession: "0000000001-26-000010", filed: "2026-04-28" };
    expect(nextPeriodRevenueGuidance(bundleWith([guided]))).toMatchObject({ periodLabel: "Q2 FY2026", low: 1.15e9, mid: 1.2e9, high: 1.25e9 });
    const reported = { text: release("Second", "third", "in the range of $1.2-1.3 billion"), accession: "0000000001-26-000020", filed: "2026-07-28" };
    const checks = buildFilingDisclosures(bundleWith([reported, guided]))!.guidanceChecks;
    for (const check of checks) expect(Math.abs(check.difference)).toBeLessThanOrEqual(1000);
    expect(checks.find((c) => c.metric === "revenue")).toMatchObject({ period: "Q2 FY2026", guidedMid: 1.2e9, actual: 1.1e9, position: "below" });
  });
});
