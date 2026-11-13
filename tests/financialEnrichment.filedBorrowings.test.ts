import { describe, expect, it } from "vitest";
import { admitDebtFields, filedBorrowingsAdmitted, filedBorrowingsOverVendorPerimeter } from "@/edgar/financialEnrichment";
import type { CompanyFacts, FactPoint } from "@/edgar/xbrl";
import type { ExtractedSection } from "@/pipeline/types";
import type { FmpBalanceSheetRow } from "@/providers/fmp";

// D-234 (P7, P8). FIGR's 10-Q for 2026-06-30 (0001628280-26-057061, filed 2026-08-14) tags LongTermDebt
// 962,995,000 and its balance sheet names it as three debt lines; the vendor's 1,474,457,000 "total debt"
// adds the 506,686,000 payables to third-party loan owners. The debt checks only asked whether a vendor
// row left a filed component out, never whether it added one, so the vendor total stood.
const CIK = 2064124;
const ACCN = "0001628280-26-057061";
const FILED = "2026-08-14";
const DATE = "2026-06-30";
const OBSERVED = "2026-11-01T05:37:22.984Z";

const SHEET = "FIGURE TECHNOLOGY SOLUTIONS, INC. CONDENSED CONSOLIDATED BALANCE SHEETS (UNAUDITED) (in thousands, except share and per share data) June 30, 2026 December 31, 2025 " +
  "ASSETS Current assets: Cash and cash equivalents $ 1,437,511 $ 1,198,141 Total assets $ 3,017,688 $ 2,317,523 LIABILITIES AND STOCKHOLDERS' EQUITY Current liabilities: " +
  "Accounts payable and accrued liabilities $ 58,215 $ 29,501 Payables to third-party loan owners 506,686 383,772 Debt, current ($ 120,105 and $ 100,519 at fair value) 222,505 160,959 " +
  "Debt, current to related parties ($ 424,640 and $ 166,135 at fair value) 424,640 166,135 Other current liabilities 73,078 105,642 Total current liabilities 1,285,124 846,009 " +
  "Debt, non-current 315,850 230,143 Lease liability, non-current 3,604 4,173 Total liabilities 1,604,578 1,080,325 " +
  "CONDENSED CONSOLIDATED STATEMENTS OF OPERATIONS (UNAUDITED) (in thousands) Total net revenue 225,588 106,077";

function point(val: number, extra: Partial<FactPoint> = {}): FactPoint {
  return { end: DATE, val, filed: FILED, accn: ACCN, form: "10-Q", fy: 2026, fp: "Q2", ...extra };
}

function facts(tags: Record<string, FactPoint[]> = {}): CompanyFacts {
  const concepts: Record<string, FactPoint[]> = {
    LongTermDebt: [point(962_995_000)], LongTermDebtNoncurrent: [point(315_850_000)],
    OperatingLeaseLiability: [point(4_776_000)], OperatingLeaseLiabilityNoncurrent: [point(3_604_000)], ...tags,
  };
  return { cik: CIK, entityName: "Figure Technology Solutions, Inc.", facts: { "us-gaap": Object.fromEntries(
    Object.entries(concepts).map(([tag, points]) => [tag, { units: { USD: points } }])) } };
}

function section(overrides: Partial<ExtractedSection> = {}): ExtractedSection {
  return { sectionName: "tenQNotes", text: "Notes to the condensed consolidated financial statements.", statementsText: SHEET, method: "toc-anchor", chars: 56,
    accession: ACCN, form: "10-Q", filingDate: FILED, reportDate: DATE,
    documentUrl: "https://www.sec.gov/Archives/edgar/data/2064124/000162828026057061/figr-20260630.htm", ...overrides } as ExtractedSection;
}

function vendorRow(overrides: Partial<FmpBalanceSheetRow> = {}): FmpBalanceSheetRow {
  return { date: DATE, period: "Q2", fiscalYear: "2026", symbol: "FIGR", cik: "0002064124", reportedCurrency: "USD", filingDate: FILED,
    totalDebt: 1_474_457_000, shortTermDebt: 1_153_831_000, longTermDebt: 315_850_000,
    capitalLeaseObligations: 4_776_000, capitalLeaseObligationsCurrent: 1_172_000, capitalLeaseObligationsNonCurrent: 3_604_000,
    operatingLeaseLiability: 4_776_000, cashAndCashEquivalents: 1_437_511_000, netDebt: 36_946_000,
    fieldProvenance: { operatingLeaseLiability: { source: "edgar", unit: "USD", periodStart: null, periodEnd: DATE, observedAt: OBSERVED,
      tags: ["us-gaap/OperatingLeaseLiability"], filings: [{ accn: ACCN, filed: FILED, form: "10-Q" }] } }, ...overrides };
}

/** The row as the unchanged checks leave it: with no filing section the new admission cannot apply. */
const before = (row: FmpBalanceSheetRow, companyFacts: CompanyFacts) => admitDebtFields(row, companyFacts, "USD", OBSERVED, []);

describe("D-234: the filing's own debt replaces a vendor total that adds payables to third-party loan owners", () => {
  it("FIGR 2026-06-30: total debt becomes filed borrowings 962,995,000 plus the operating lease 4,776,000", () => {
    const row = vendorRow(), original = structuredClone(row);
    // Failing first: without the filing's balance sheet (the path every row took before) the vendor perimeter stands.
    expect(before(row, facts()).row.totalDebt).toBe(1_474_457_000);
    const out = admitDebtFields(row, facts(), "USD", OBSERVED, [section()]);
    expect(out.row).toMatchObject({ totalDebt: 967_771_000, shortTermDebt: 647_145_000, longTermDebt: 315_850_000,
      capitalLeaseObligations: 4_776_000, operatingLeaseLiability: 4_776_000, netDebt: 967_771_000 - 1_437_511_000, vendorNetDebt: 36_946_000 });
    expect(out.row.financeLeaseLiability).toBeUndefined();
    expect(out.row.fieldConflicts?.totalDebt).toMatchObject({ usable: true, resolution: "filed-family", vendorValue: 1_474_457_000, secValue: 967_771_000 });
    expect(out.row.fieldConflicts?.shortTermDebt).toMatchObject({ usable: true, resolution: "filed-family", vendorValue: 1_153_831_000, secValue: 647_145_000 });
    expect(out.row.fieldProvenance?.totalDebt).toMatchObject({ source: "edgar", unit: "USD", periodStart: null, periodEnd: DATE, calculation: "same-filing-debt-completed",
      tags: ["us-gaap/LongTermDebt", "us-gaap/OperatingLeaseLiability", "filing:balance-sheet:debt-lines"], filings: [{ accn: ACCN, filed: FILED, form: "10-Q" }] });
    expect(filedBorrowingsAdmitted(out.row)).toBe(true);
    expect(filedBorrowingsAdmitted(row)).toBe(false);
    expect(out.gaps).toEqual([expect.objectContaining({ field: `statements.balance.${DATE}.totalDebt`, severity: "info", expected: true,
      reason: "debt is the filed borrowings, not the vendor total: the 10-Q 0001628280-26-057061 for 2026-06-30 tags LongTermDebt 962.995M (LongTermDebtNoncurrent 315.85M, so 647.145M current), " +
        "and its balance sheet names it as Debt, current 222.505M + Debt, current to related parties 424.64M + Debt, non-current 315.85M; with OperatingLeaseLiability 4.776M, total debt is 967.771M USD. " +
        "The vendor total 1,474.457M also counted the balance sheet's Payables to third-party loan owners 506.686M, which the filing does not present as debt. The filing tags no finance lease, so none is included" })]);
    expect(row).toEqual(original);
    // Admitting the admitted row again changes nothing.
    expect(admitDebtFields(out.row, facts(), "USD", OBSERVED, [section()]).row).toMatchObject({ totalDebt: 967_771_000, shortTermDebt: 647_145_000, longTermDebt: 315_850_000 });
  });

  it("reports what it established, each part from the one filing", () => {
    expect(filedBorrowingsOverVendorPerimeter(vendorRow(), facts(), "USD", OBSERVED, [section()])).toMatchObject({
      borrowings: 962_995_000, currentDebt: 647_145_000, noncurrentDebt: 315_850_000, loanOwnerPayables: 506_686_000, operatingLease: 4_776_000,
      totalDebt: 967_771_000, vendorTotal: 1_474_457_000, filing: { accn: ACCN, filed: FILED, form: "10-Q" },
      lines: [{ name: "Debt, current", value: 222_505_000 }, { name: "Debt, current to related parties", value: 424_640_000 }, { name: "Debt, non-current", value: 315_850_000 }] });
  });

  // Compatible controls: the same lender shape with one part unproven keeps whatever the unchanged checks decide.
  const controls: [string, { row?: Partial<FmpBalanceSheetRow>; tags?: Record<string, FactPoint[]>; section?: Partial<ExtractedSection> }][] = [
    ["the balance sheet's debt lines do not add up to the tagged LongTermDebt", { tags: { LongTermDebt: [point(900_000_000)] } }],
    ["the non-current line is not the tagged LongTermDebtNoncurrent", { tags: { LongTermDebtNoncurrent: [point(300_000_000)] } }],
    ["the filing tags no inclusive LongTermDebt", { tags: { LongTermDebt: [] } }],
    ["the filing tags short-term borrowings as well", { tags: { ShortTermBorrowings: [point(50_000_000)] } }],
    ["the filing tags a finance lease", { tags: { FinanceLeaseLiability: [point(2_000_000)] } }],
    ["a newer filing restates the borrowings at the same date", { tags: { LongTermDebt: [point(962_995_000), point(970_000_000, { filed: "2026-10-20", accn: "0001628280-26-066000" })] } }],
    ["the tagged totals come from another filing than the balance sheet read", { section: { accession: "0001628280-26-040000", documentUrl: "https://www.sec.gov/Archives/edgar/data/2064124/000162828026040000/figr-20260630.htm" } }],
    ["the balance sheet is for another report date", { section: { reportDate: "2026-03-31" } }],
    ["the document is not this issuer's filing", { section: { documentUrl: "https://www.sec.gov/Archives/edgar/data/42/000162828026057061/figr-20260630.htm" } }],
    ["the balance sheet is not stated in thousands", { section: { statementsText: SHEET.replace("(in thousands, except share and per share data)", "(in millions)") } }],
    ["the balance sheet names no payables to third-party loan owners", { section: { statementsText: SHEET.replace("Payables to third-party loan owners 506,686 383,772 ", "") } }],
    ["the vendor total is not the filed debt plus that payable", { row: { totalDebt: 1_500_000_000, shortTermDebt: 1_179_374_000 } }],
    ["the vendor long-term debt is not the filed non-current debt", { row: { longTermDebt: 300_000_000, shortTermDebt: 1_169_681_000 } }],
    ["the vendor lease line is not the filed operating lease liability", { row: { capitalLeaseObligations: 3_604_000, totalDebt: 1_473_285_000 } }],
    ["the vendor total was already refused", { row: { totalDebt: null, fieldConflicts: { totalDebt: { usable: false, vendorValue: 1_474_457_000, secValue: null, reason: "refused earlier" } } } }],
    ["the row belongs to another issuer", { row: { cik: "0000000042" } }],
  ];
  it.each(controls)("compatible control: not admitted when %s", (_name, change) => {
    const row = vendorRow(change.row), companyFacts = facts(change.tags), presentations = [section(change.section)];
    expect(filedBorrowingsOverVendorPerimeter(row, companyFacts, "USD", OBSERVED, presentations)).toBeNull();
    expect(admitDebtFields(row, companyFacts, "USD", OBSERVED, presentations)).toEqual(before(row, companyFacts));
  });

  it("compatible control: an unestablished currency admits nothing", () => {
    expect(filedBorrowingsOverVendorPerimeter(vendorRow(), facts(), null, OBSERVED, [section()])).toBeNull();
    expect(admitDebtFields(vendorRow(), facts(), null, OBSERVED, [section()]).row.totalDebt).toBe(1_474_457_000);
  });

  it("unrelated shape: an industrial balance sheet with ordinary debt captions is left to the unchanged checks", () => {
    const industrial = "CONSOLIDATED BALANCE SHEETS (In millions, except per share) June 30, 2026 December 31, 2025 ASSETS Total assets 9,000 8,000 " +
      "Current liabilities: Accounts payable 500 400 Short-term debt 300 200 Total current liabilities 800 600 Long-term debt 1,200 1,100 Total liabilities 2,000 1,700 CONSOLIDATED STATEMENTS OF OPERATIONS";
    const companyFacts: CompanyFacts = { cik: CIK, entityName: "Industrial", facts: { "us-gaap": {
      LongTermDebtNoncurrent: { units: { USD: [point(1_200_000_000)] } }, LongTermDebtCurrent: { units: { USD: [point(300_000_000)] } },
      OperatingLeaseLiability: { units: { USD: [point(40_000_000)] } } } } };
    const row = vendorRow({ totalDebt: 1_540_000_000, shortTermDebt: 300_000_000, longTermDebt: 1_200_000_000, capitalLeaseObligations: 40_000_000,
      capitalLeaseObligationsCurrent: undefined, capitalLeaseObligationsNonCurrent: undefined, operatingLeaseLiability: 40_000_000, netDebt: 102_489_000 });
    const presentations = [section({ statementsText: industrial })];
    expect(filedBorrowingsOverVendorPerimeter(row, companyFacts, "USD", OBSERVED, presentations)).toBeNull();
    expect(admitDebtFields(row, companyFacts, "USD", OBSERVED, presentations)).toEqual(before(row, companyFacts));
    expect(admitDebtFields(row, companyFacts, "USD", OBSERVED, presentations).row.totalDebt).toBe(1_540_000_000);
  });
});
