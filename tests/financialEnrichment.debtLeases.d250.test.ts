import { describe, expect, it } from "vitest";
import { partialFinanceLeaseReason } from "@/edgar/debtCompleteness";
import { unclassifiedLiabilityLines } from "@/edgar/debtPresentation";
import { admitDebtFields } from "@/edgar/financialEnrichment";
import type { CompanyFacts, FactPoint } from "@/edgar/xbrl";
import type { CapitalBalanceRow } from "@/pipeline/stageB/capital";
import { debtBridge } from "@/pipeline/stageB/currentCapital";
import { leaseDebtConflict } from "@/pipeline/stageB/netDebt";
import type { ExtractedSection } from "@/pipeline/types";
import type { FmpBalanceSheetRow } from "@/providers/fmp";

// D-250 (P7). Two provider-row shapes the debt admission did not judge against the filing.

const OBSERVED = "2026-11-12T18:18:59.137Z";
/** The report's debt bridge for an admitted row. */
const bridge = (row: FmpBalanceSheetRow) => debtBridge(row as CapitalBalanceRow);

function companyFacts(cik: number, concepts: Record<string, FactPoint[]>): CompanyFacts {
  return { cik, entityName: "Issuer", facts: { "us-gaap": Object.fromEntries(Object.entries(concepts).map(([tag, points]) => [tag, { units: { USD: points } }])) } };
}

// 1. Realty Income's 10-Q for 2026-09-30 (0000726728-26-000059, filed 2026-11-03). The balance sheet is unclassified;
// its four borrowing lines are 2,127,928 + 2,772,340 + 36,745 + 26,451,863 = 31,388,876 (thousands) and the filing
// tags OperatingLeaseLiability 409,910 and FinanceLeaseLiability 165,371. The provider row holds the borrowings and a
// lease line of 0, so the lease guard refused it: total debt was a gap. Filed total: 31,964,157 thousand.
describe("D-250: an unclassified balance sheet's own lines and tags complete a provider row with a lease line of zero", () => {
  const CIK = 726728, ACCN = "0000726728-26-000059", FILED = "2026-11-03", DATE = "2026-09-30";
  const SHEET = "Item 1: Financial Statements REALTY INCOME CORPORATION AND SUBSIDIARIES CONSOLIDATED BALANCE SHEETS (in thousands, except per share amounts) (unaudited) " +
    "September 30, 2026 December 31, 2025 ASSETS Real estate held for investment, net 56,030,530 53,413,903 Cash and cash equivalents 368,534 434,842 " +
    "Other assets, net 2,973,959 2,624,698 Total assets $ 77,950,414 $ 72,795,612 LIABILITIES AND EQUITY Distributions payable $ 265,518 $ 255,171 " +
    "Accounts payable and accrued expenses 1,094,942 1,060,969 Lease intangible liabilities, net 1,463,929 1,493,958 Other liabilities 1,062,753 1,066,809 " +
    "Revolving credit facilities and commercial paper 2,127,928 2,023,414 Term loans, net 2,772,340 1,701,615 Mortgages payable, net 36,745 37,761 " +
    "Notes payable, net 26,451,863 25,031,947 Total liabilities $ 35,276,018 $ 32,671,644 Commitments and contingencies (Note 18 ) " +
    "Redeemable noncontrolling interests $ 71,745 $ — Total equity $ 42,602,651 $ 40,123,968 Total liabilities and equity $ 77,950,414 $ 72,795,612 " +
    "CONSOLIDATED STATEMENTS OF INCOME AND COMPREHENSIVE INCOME (in thousands, except per share amounts) Total revenue 1,621,582 1,470,552";
  const point = (val: number, extra: Partial<FactPoint> = {}): FactPoint => ({ end: DATE, val, filed: FILED, accn: ACCN, form: "10-Q", fy: 2026, fp: "Q3", ...extra });
  const facts = (tags: Record<string, FactPoint[]> = {}): CompanyFacts => companyFacts(CIK, {
    Liabilities: [point(35_276_018_000)], NotesPayable: [point(26_451_863_000)], LoansPayable: [point(2_772_340_000)], SecuredDebt: [point(36_745_000)],
    CommercialPaper: [point(1_500_000_000)], OperatingLeaseLiability: [point(409_910_000)], FinanceLeaseLiability: [point(165_371_000)], ...tags });
  const section = (overrides: Partial<ExtractedSection> = {}): ExtractedSection => ({ sectionName: "tenQNotes", text: "Notes to consolidated financial statements.",
    statementsText: SHEET, method: "toc-anchor", chars: 43, accession: ACCN, form: "10-Q", filingDate: FILED, reportDate: DATE,
    documentUrl: "https://www.sec.gov/Archives/edgar/data/726728/000072672826000059/o-20260930.htm", ...overrides } as ExtractedSection);
  const lease = (tag: string) => ({ source: "edgar" as const, unit: "USD", periodStart: null, periodEnd: DATE, observedAt: OBSERVED,
    tags: [`us-gaap/${tag}`], filings: [{ accn: ACCN, filed: FILED, form: "10-Q" }] });
  const vendorRow = (overrides: Partial<FmpBalanceSheetRow> = {}): FmpBalanceSheetRow => ({ date: DATE, period: "Q3", fiscalYear: "2026", symbol: "O", cik: "0000726728",
    reportedCurrency: "USD", filingDate: FILED, cashAndCashEquivalents: 368_534_000, shortTermInvestments: 0, cashAndShortTermInvestments: 368_534_000,
    shortTermDebt: 2_127_928_000, longTermDebt: 29_260_948_000, capitalLeaseObligations: 0, capitalLeaseObligationsCurrent: 0, capitalLeaseObligationsNonCurrent: 0,
    operatingLeaseLiability: 409_910_000, financeLeaseLiability: 165_371_000, totalDebt: 31_388_876_000, netDebt: 31_020_342_000,
    fieldProvenance: { operatingLeaseLiability: lease("OperatingLeaseLiability"), financeLeaseLiability: lease("FinanceLeaseLiability") }, ...overrides });
  /** The row as the unchanged checks leave it: with no filing section the completion cannot apply. */
  const before = (row: FmpBalanceSheetRow, filed: CompanyFacts) => admitDebtFields(row, filed, "USD", OBSERVED, []);

  it("O 2026-09-30: total debt becomes the filed 31,964,157,000, each part from the one filing", () => {
    const row = vendorRow(), original = structuredClone(row);
    // Failing first: the row every report built. The provider total stands and the lease guard refuses it.
    const old = before(row, facts()).row;
    expect(old).toMatchObject({ totalDebt: 31_388_876_000, capitalLeaseObligations: 0 });
    expect(leaseDebtConflict(old)).toBe("operating-lease liability 409.91M (current + noncurrent) exceeds the vendor lease line 0M (noncurrent only) - the lease inputs are on different scopes and do not reconcile");
    expect(bridge(old).totalDebtIncludingLeases).toBeNull();

    const out = admitDebtFields(row, facts(), "USD", OBSERVED, [section()]);
    expect(out.row).toMatchObject({ shortTermDebt: 2_127_928_000, longTermDebt: 29_260_948_000, capitalLeaseObligations: 575_281_000,
      operatingLeaseLiability: 409_910_000, financeLeaseLiability: 165_371_000, totalDebt: 31_964_157_000, netDebt: 31_964_157_000 - 368_534_000, vendorNetDebt: 31_020_342_000 });
    expect(out.row.fieldConflicts?.totalDebt).toBeUndefined();
    expect(out.row.fieldProvenance?.totalDebt).toMatchObject({ source: "edgar", unit: "USD", periodStart: null, periodEnd: DATE, calculation: "same-filing-debt-completed",
      tags: ["us-gaap/LoansPayable", "us-gaap/SecuredDebt", "us-gaap/NotesPayable", "us-gaap/OperatingLeaseLiability", "us-gaap/FinanceLeaseLiability", "filing:balance-sheet:liability-lines"],
      filings: [{ accn: ACCN, filed: FILED, form: "10-Q" }] });
    expect(out.row.fieldProvenance?.capitalLeaseObligations).toMatchObject({ tags: ["us-gaap/OperatingLeaseLiability", "us-gaap/FinanceLeaseLiability"] });
    expect(out.admissions).toEqual([{ kind: "filing-completion", date: DATE, summary: "31,964.157M (vendor 31,388.876M; 0000726728-26-000059)",
      detail: "same-filing 10-Q 0000726728-26-000059 at 2026-09-30: the balance sheet is unclassified and its 8 liability lines add up to the tagged Liabilities 35,276.018M; " +
        "borrowings Revolving credit facilities and commercial paper 2,127.928M (balance-sheet line) + Term loans, net 2,772.34M (LoansPayable) + Mortgages payable, net 36.745M (SecuredDebt) + " +
        "Notes payable, net 26,451.863M (NotesPayable) = 31,388.876M + operating leases 409.91M + finance leases 165.371M = total debt 31,964.157M USD; " +
        "undisclosed vendor lease zero replaced by filed liabilities; vendor borrowings reconciled to the filing's lines" }]);
    // Every consumer reads the completed row: the lease guard passes and the bridge states the filed total.
    expect(leaseDebtConflict(out.row)).toBeNull();
    expect(bridge(out.row)).toMatchObject({ totalDebtIncludingLeases: 31_964_157_000, operatingLeases: 409_910_000, financeLeases: 165_371_000,
      netDebtIncludingLeases: 31_595_623_000, netDebtExcludingOperatingLeases: 31_185_713_000 });
    expect(row).toEqual(original);
    // Admitting the completed row again changes nothing.
    const again = admitDebtFields(out.row, facts(), "USD", OBSERVED, [section()]);
    expect(again.row).toEqual(out.row);
    expect(again.admissions).toEqual([]);
  });

  // Compatible controls: the same REIT shape with one part unproven keeps whatever the unchanged checks decide.
  const controls: [string, { row?: Partial<FmpBalanceSheetRow>; tags?: Record<string, FactPoint[]>; section?: Partial<ExtractedSection> }][] = [
    ["the liability lines do not add up to the sheet's total", { section: { statementsText: SHEET.replace("Other liabilities 1,062,753", "Other liabilities 1,062,754") } }],
    ["the sheet's total is not the tagged Liabilities", { tags: { Liabilities: [point(35_276_019_000)] } }],
    ["the filing tags no Liabilities", { tags: { Liabilities: [] } }],
    ["a tagged instrument debt is not one of the lines", { tags: { ConvertibleNotesPayable: [point(500_000_000)] } }],
    ["two lines carry the same tagged amount", { section: { statementsText: SHEET.replace("Other liabilities 1,062,753 1,066,809", "Other liabilities 36,745 37,761 Deferred items 1,026,008 1,029,048") } }],
    ["another line carries a borrowing-like caption", { section: { statementsText: SHEET.replace("Other liabilities 1,062,753", "Other borrowings 1,062,753") } }],
    ["the balance sheet is classified", { section: { statementsText: SHEET.replace("Distributions payable $ 265,518", "Current liabilities: Distributions payable $ 265,518") } }],
    ["tagged commercial paper exceeds the credit-facility line", { tags: { CommercialPaper: [point(2_500_000_000)] } }],
    ["commercial paper is tagged and the sheet has no credit-facility line", { section: { statementsText: SHEET.replace("Revolving credit facilities and commercial paper 2,127,928", "Accrued costs 2,127,928") } }],
    ["the filing tags a long-term debt aggregate", { tags: { LongTermDebtNoncurrent: [point(29_260_948_000)] } }],
    ["the filing tags a current-debt line", { tags: { ShortTermBorrowings: [point(2_127_928_000)] } }],
    ["a newer filing restates a borrowing at the same date", { tags: { NotesPayable: [point(26_451_863_000), point(26_500_000_000, { filed: "2026-11-10", accn: "0000726728-26-000070" })] } }],
    ["the borrowings are tagged in another filing than the balance sheet read", { section: { accession: "0000726728-26-000048", documentUrl: "https://www.sec.gov/Archives/edgar/data/726728/000072672826000048/o-20260930.htm" } }],
    ["the filing tags no finance lease liability", { tags: { FinanceLeaseLiability: [] }, row: { financeLeaseLiability: undefined, fieldProvenance: { operatingLeaseLiability: lease("OperatingLeaseLiability") } } }],
    ["the filing tags one operating maturity only", { tags: { OperatingLeaseLiability: [], OperatingLeaseLiabilityNoncurrent: [point(380_000_000)] }, row: { operatingLeaseLiability: undefined, fieldProvenance: { financeLeaseLiability: lease("FinanceLeaseLiability") } } }],
    ["the row's operating lease is not the filed one", { row: { operatingLeaseLiability: 400_000_000 } }],
    ["the vendor long-term debt is not the instrument lines", { row: { longTermDebt: 29_000_000_000, totalDebt: 31_127_928_000 } }],
    ["the vendor short-term debt is not the credit-facility line", { row: { shortTermDebt: 1_500_000_000, totalDebt: 30_760_948_000 } }],
    ["the vendor total is not its borrowings", { row: { totalDebt: 31_964_157_000 } }],
    ["the vendor lease line is not zero", { row: { capitalLeaseObligations: 575_281_000, totalDebt: 31_964_157_000 } }],
    ["the row's cash and net debt were already refused", { row: { netDebt: null as unknown as number, fieldConflicts: {
      cashAndCashEquivalents: { usable: false, vendorValue: 368_534_000, secValue: null, reason: "vendor/SEC conflict for cashAndCashEquivalents" },
      netDebt: { usable: false, vendorValue: 31_020_342_000, secValue: null, reason: "vendor/SEC conflict for cashAndCashEquivalents" } } } }],
    ["the vendor total was already refused", { row: { totalDebt: null as unknown as number, fieldConflicts: { totalDebt: { usable: false, vendorValue: 31_388_876_000, secValue: null, reason: "refused earlier" } } } }],
    ["the balance sheet is for another report date", { section: { reportDate: "2026-06-30" } }],
    ["the document is not this issuer's filing", { section: { documentUrl: "https://www.sec.gov/Archives/edgar/data/42/000072672826000059/o-20260930.htm" } }],
    ["the row belongs to another issuer", { row: { cik: "0000000042" } }],
  ];
  it.each(controls)("compatible control: not completed when %s", (_name, change) => {
    const row = vendorRow(change.row), filed = facts(change.tags), presentations = [section(change.section)];
    expect(admitDebtFields(row, filed, "USD", OBSERVED, presentations)).toEqual(before(row, filed));
  });

  // An unrelated issuer on the same rule: no credit-facility line, lease liabilities stated as two maturities.
  it("unrelated issuer: a net-lease REIT with two instrument lines and no credit facility is completed from its own filing", () => {
    const cik = 751364, accn = "0000751364-26-000041", filed = "2026-10-30";
    const at = (val: number): FactPoint => ({ end: DATE, val, filed, accn, form: "10-Q", fy: 2026, fp: "Q3" });
    const sheet = "NNN REIT, INC. and SUBSIDIARIES CONDENSED CONSOLIDATED BALANCE SHEETS (in thousands, except per share amounts) September 30, 2026 December 31, 2025 (unaudited) " +
      "ASSETS Real estate portfolio 9,100,000 8,900,000 Total assets $ 9,400,000 $ 9,200,000 LIABILITIES AND STOCKHOLDERS' EQUITY Mortgages payable $ 8,000 $ 9,000 " +
      "Notes payable, net of unamortized discount 4,600,000 4,400,000 Accrued interest payable 60,000 30,000 Other liabilities 132,000 131,000 Total liabilities 4,800,000 4,570,000 " +
      "Total liabilities and stockholders' equity $ 9,400,000 $ 9,200,000 CONDENSED CONSOLIDATED STATEMENTS OF INCOME";
    const out = admitDebtFields<FmpBalanceSheetRow>({ date: DATE, period: "Q3", fiscalYear: "2026", symbol: "NNN", cik: "0000751364", reportedCurrency: "USD", filingDate: filed,
      cashAndCashEquivalents: 150_000_000, shortTermDebt: 0, longTermDebt: 4_608_000_000, capitalLeaseObligations: 0, totalDebt: 4_608_000_000, netDebt: 4_458_000_000 },
    companyFacts(cik, { Liabilities: [at(4_800_000_000)], SecuredDebt: [at(8_000_000)], NotesPayable: [at(4_600_000_000)],
      OperatingLeaseLiabilityCurrent: [at(1_000_000)], OperatingLeaseLiabilityNoncurrent: [at(5_000_000)], FinanceLeaseLiability: [at(0)] }), "USD", OBSERVED,
    [{ sectionName: "tenQNotes", text: "Notes.", statementsText: sheet, method: "toc-anchor", chars: 6, accession: accn, form: "10-Q", filingDate: filed, reportDate: DATE,
      documentUrl: "https://www.sec.gov/Archives/edgar/data/751364/000075136426000041/nnn-20260930.htm" } as ExtractedSection]);
    expect(out.row).toMatchObject({ shortTermDebt: 0, longTermDebt: 4_608_000_000, capitalLeaseObligations: 6_000_000, operatingLeaseLiability: 6_000_000,
      financeLeaseLiability: 0, totalDebt: 4_614_000_000, netDebt: 4_464_000_000 });
    expect(out.row.fieldProvenance?.operatingLeaseLiability?.tags).toEqual(["us-gaap/OperatingLeaseLiabilityCurrent", "us-gaap/OperatingLeaseLiabilityNoncurrent"]);
    expect(bridge(out.row).totalDebtIncludingLeases).toBe(4_614_000_000);
  });

  it("the reader establishes an unclassified sheet's lines only when they foot in both columns", () => {
    expect(unclassifiedLiabilityLines(SHEET, DATE, DATE)).toEqual({ total: 35_276_018_000, lines: [
      { name: "Distributions payable", value: 265_518_000 }, { name: "Accounts payable and accrued expenses", value: 1_094_942_000 },
      { name: "Lease intangible liabilities, net", value: 1_463_929_000 }, { name: "Other liabilities", value: 1_062_753_000 },
      { name: "Revolving credit facilities and commercial paper", value: 2_127_928_000 }, { name: "Term loans, net", value: 2_772_340_000 },
      { name: "Mortgages payable, net", value: 36_745_000 }, { name: "Notes payable, net", value: 26_451_863_000 }] });
    // The comparative column is read for the prior balance date.
    expect(unclassifiedLiabilityLines(SHEET, DATE, "2025-12-31")?.total).toBe(32_671_644_000);
    expect(unclassifiedLiabilityLines(SHEET.replace("255,171", "255,172"), DATE, DATE)).toBeNull();
    expect(unclassifiedLiabilityLines(SHEET.replace("(in thousands, except per share amounts) (unaudited)", "(unaudited)"), DATE, DATE)).toBeNull();
    expect(unclassifiedLiabilityLines(SHEET, "2026-06-30", DATE)).toBeNull();
    expect(unclassifiedLiabilityLines(SHEET.replace("Mortgages payable, net 36,745", "Mortgages payable, net ( 36,745 )"), DATE, DATE)).toBeNull();
    expect(unclassifiedLiabilityLines(undefined, DATE, DATE)).toBeNull();
  });
});

// 2. Rivian's 10-Q for 2026-09-30 (0001874178-26-000066, filed 2026-10-29) tags FinanceLeaseLiabilityNoncurrent 99M and
// neither the current portion (inside a combined current line under the filer's own element) nor a total. The
// provider lease line 985M is the operating leases 886M plus that 99M, so its total debt 5,431M stood incomplete.
describe("D-250: a provider total beside a finance lease the filing discloses with one maturity only is withheld", () => {
  const CIK = 1874178, ACCN = "0001874178-26-000066", FILED = "2026-10-29", DATE = "2026-09-30";
  const point = (val: number, extra: Partial<FactPoint> = {}): FactPoint => ({ end: DATE, val, filed: FILED, accn: ACCN, form: "10-Q", fy: 2026, fp: "Q3", ...extra });
  const facts = (tags: Record<string, FactPoint[]> = {}): CompanyFacts => companyFacts(CIK, { LongTermDebtNoncurrent: [point(4_446_000_000)],
    OperatingLeaseLiabilityCurrent: [point(122_000_000)], OperatingLeaseLiabilityNoncurrent: [point(764_000_000)], FinanceLeaseLiabilityNoncurrent: [point(99_000_000)], ...tags });
  const vendorRow = (overrides: Partial<FmpBalanceSheetRow> = {}): FmpBalanceSheetRow => ({ date: DATE, period: "Q3", fiscalYear: "2026", symbol: "RIVN", cik: "0001874178",
    reportedCurrency: "USD", filingDate: FILED, cashAndCashEquivalents: 3_509_000_000, shortTermInvestments: 1_993_000_000, cashAndShortTermInvestments: 5_502_000_000,
    shortTermDebt: 0, longTermDebt: 4_446_000_000, capitalLeaseObligations: 985_000_000, capitalLeaseObligationsCurrent: 122_000_000, capitalLeaseObligationsNonCurrent: 863_000_000,
    operatingLeaseLiability: 886_000_000, totalDebt: 5_431_000_000, netDebt: 1_922_000_000,
    fieldProvenance: { operatingLeaseLiability: { source: "edgar", unit: "USD", periodStart: null, periodEnd: DATE, observedAt: OBSERVED,
      tags: ["us-gaap/OperatingLeaseLiabilityCurrent", "us-gaap/OperatingLeaseLiabilityNoncurrent"], filings: [{ accn: ACCN, filed: FILED, form: "10-Q" }] } }, ...overrides });
  const REASON = "Finance lease liability incomplete: current and noncurrent portions are both required when no tagged total is available; complete debt is withheld " +
    "(FinanceLeaseLiabilityNoncurrent 99M is tagged at 2026-09-30 in 10-Q 0001874178-26-000066; no FinanceLeaseLiabilityCurrent or finance-lease total is)";

  it("RIVN 2026-09-30: total debt 5,431M and net debt become disclosed gaps naming the one tagged maturity", () => {
    const row = vendorRow(), original = structuredClone(row);
    const out = admitDebtFields(row, facts(), "USD", OBSERVED, []);
    expect(out.row).toMatchObject({ totalDebt: null, netDebt: null, shortTermDebt: 0, longTermDebt: 4_446_000_000, capitalLeaseObligations: 985_000_000, operatingLeaseLiability: 886_000_000 });
    expect(out.row.fieldConflicts?.totalDebt).toEqual({ usable: false, vendorValue: 5_431_000_000, secValue: null, reason: REASON });
    expect(out.row.fieldConflicts?.netDebt).toEqual({ usable: false, vendorValue: 1_922_000_000, secValue: null, reason: REASON });
    expect(out.gaps).toEqual([{ field: `statements.balance.${DATE}.totalDebt`, reason: REASON, severity: "warn" }, { field: `statements.balance.${DATE}.netDebt`, reason: REASON, severity: "warn" }]);
    expect(bridge(out.row)).toMatchObject({ totalDebtIncludingLeases: null, netDebtIncludingLeases: null, netDebtExcludingOperatingLeases: null, operatingLeases: 886_000_000,
      compositionNote: `Total debt including leases withheld at 2026-09-30: ${REASON}.` });
    expect(row).toEqual(original);
    // Admitting the refused row again keeps the refusal.
    expect(admitDebtFields(out.row, facts(), "USD", OBSERVED, []).row).toEqual(out.row);
  });

  // Compatible controls: the same row when the filing's finance lease family is complete, or is not the provider's to prove.
  const controls: [string, Record<string, FactPoint[]>, Partial<FmpBalanceSheetRow>][] = [
    ["the filing tags both finance maturities", { FinanceLeaseLiabilityCurrent: [point(3_000_000)] }, {}],
    ["the filing tags a finance lease total", { FinanceLeaseLiability: [point(102_000_000)] }, {}],
    ["the filing tags the legacy capital lease total", { CapitalLeaseObligations: [point(102_000_000)] }, {}],
    ["the one maturity is tagged at another date only", { FinanceLeaseLiabilityNoncurrent: [point(91_000_000, { end: "2025-12-31" })] }, {}],
    ["the one maturity is tagged after the cutoff", { FinanceLeaseLiabilityNoncurrent: [point(99_000_000, { filed: "2026-11-20" })] }, {}],
    ["the row's lease line was built from SEC facts", {}, { fieldProvenance: { capitalLeaseObligations: { source: "edgar", unit: "USD", periodStart: null, periodEnd: DATE,
      observedAt: OBSERVED, tags: ["us-gaap/OperatingLeaseLiabilityCurrent", "us-gaap/OperatingLeaseLiabilityNoncurrent"], filings: [{ accn: ACCN, filed: FILED, form: "10-Q" }] } } }],
    ["the row belongs to another issuer", {}, { cik: "0000000042" }],
  ];
  it.each(controls)("compatible control: the provider total stands when %s", (_name, tags, row) => {
    const out = admitDebtFields(vendorRow(row), facts(tags), "USD", OBSERVED, []);
    expect(out.row.totalDebt).toBe(5_431_000_000);
    expect(out.gaps.map(gap => gap.reason).filter(reason => reason.startsWith("Finance lease liability incomplete"))).toEqual([]);
  });

  it("unrelated issuer: a filer that tags only the current finance maturity is withheld on its own facts", () => {
    const accn = "0000012345-26-000009", at = (val: number): FactPoint => ({ end: "2026-06-30", val, filed: "2026-08-05", accn, form: "10-Q", fy: 2026, fp: "Q2" });
    const out = admitDebtFields<FmpBalanceSheetRow>({ date: "2026-06-30", period: "Q2", fiscalYear: "2026", symbol: "XYZ", cik: "0000012345", reportedCurrency: "USD", filingDate: "2026-08-05",
      cashAndCashEquivalents: 40_000_000, shortTermDebt: 25_000_000, longTermDebt: 600_000_000, capitalLeaseObligations: 12_000_000, totalDebt: 637_000_000, netDebt: 597_000_000 },
    companyFacts(12345, { LongTermDebtCurrent: [at(25_000_000)], LongTermDebtNoncurrent: [at(600_000_000)], FinanceLeaseLiabilityCurrent: [at(12_000_000)] }), "USD", OBSERVED, []);
    expect(out.row).toMatchObject({ totalDebt: null, netDebt: null });
    expect(out.row.fieldConflicts?.totalDebt?.reason).toBe("Finance lease liability incomplete: current and noncurrent portions are both required when no tagged total is available; " +
      "complete debt is withheld (FinanceLeaseLiabilityCurrent 12M is tagged at 2026-06-30 in 10-Q 0000012345-26-000009; no FinanceLeaseLiabilityNoncurrent or finance-lease total is)");
  });

  it("unrelated shape: a filer that tags no finance lease keeps its provider total (D-202 rule 1)", () => {
    const out = admitDebtFields(vendorRow({ capitalLeaseObligations: 886_000_000, capitalLeaseObligationsNonCurrent: 764_000_000, totalDebt: 5_332_000_000, netDebt: 1_823_000_000 }),
      facts({ FinanceLeaseLiabilityNoncurrent: [] }), "USD", OBSERVED, []);
    expect(out.row.totalDebt).toBe(5_332_000_000);
  });

  it("the SEC statements builder and the provider-row admission state one sentence", () => {
    expect(partialFinanceLeaseReason()).toBe("Finance lease liability incomplete: current and noncurrent portions are both required when no tagged total is available; complete debt is withheld");
    expect(REASON.startsWith(`${partialFinanceLeaseReason()} (`)).toBe(true);
  });
});
