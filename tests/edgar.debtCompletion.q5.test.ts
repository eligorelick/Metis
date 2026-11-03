import { describe, expect, it } from "vitest";
import { admitDebtFields } from "@/edgar/financialEnrichment";
import { leaseDebtConflict } from "@/pipeline/stageB/netDebt";
import type { FmpBalanceSheetRow } from "@/providers/fmp";
import { ACCN, companyFacts, M, OBSERVED, Q2 } from "./helpers/amzn51LeaseShape";

const tagged: Record<string, number> = { LongTermDebtNoncurrent: 100, LongTermDebtCurrent: 4,
  OperatingLeaseLiabilityCurrent: 2, OperatingLeaseLiabilityNoncurrent: 18,
  FinanceLeaseLiabilityCurrent: 1, FinanceLeaseLiabilityNoncurrent: 5 };
const row = (over: Partial<FmpBalanceSheetRow> = {}): FmpBalanceSheetRow => ({ date: Q2, reportedCurrency: "USD", longTermDebt: 100 * M,
  shortTermDebt: 0, capitalLeaseObligations: 18 * M, totalDebt: 118 * M,
  cashAndCashEquivalents: 10 * M, ...over });
const admit = (tags = tagged, vendor = row()) => admitDebtFields(vendor, companyFacts({ [Q2]: tags }), "USD", OBSERVED);

describe("exact same-filing debt completion", () => {
  it("completes an operating-only noncurrent lease line and omitted current debt", () => {
    const out = admit();
    expect(out.row).toMatchObject({ shortTermDebt: 4 * M, capitalLeaseObligations: 26 * M,
      totalDebt: 130 * M, netDebt: 120 * M });
    expect(leaseDebtConflict(out.row)).toBeNull();
    expect(out.row.fieldProvenance?.totalDebt?.filings[0]?.accn).toBe(ACCN);
    expect(out.admissions[0]?.detail).toMatch(/same.filing|that filing/);
  });
  it("completes omitted current debt when the lease line already holds both totals", () => {
    expect(admit(tagged, row({ capitalLeaseObligations: 26 * M, totalDebt: 126 * M })).row.totalDebt).toBe(130 * M);
  });
  it("normalizes current operating leases inside vendor short-term debt exactly once", () => {
    expect(admit(tagged, row({ shortTermDebt: 6 * M, totalDebt: 124 * M })).row)
      .toMatchObject({ shortTermDebt: 4 * M, totalDebt: 130 * M });
  });
  it("normalizes finance leases inside tagged combined debt (HD shape)", () => {
    const leases = Object.fromEntries(Object.entries(tagged).filter(([tag]) => !tag.startsWith("LongTermDebt")));
    const out = admit({ ...leases, LongTermDebtAndCapitalLeaseObligations: 105,
      LongTermDebtAndCapitalLeaseObligationsCurrent: 5 }, row({ longTermDebt: 105 * M, shortTermDebt: 7 * M, totalDebt: 130 * M }));
    expect(out.row).toMatchObject({ longTermDebt: 100 * M, shortTermDebt: 4 * M, totalDebt: 130 * M });
  });
  it("reads the existing noncurrent notes-and-loans scope with current notes", () => {
    const tags: Record<string, number> = { ...tagged, LongTermNotesAndLoans: 100, NotesPayableCurrent: 4 };
    delete tags.LongTermDebtNoncurrent; delete tags.LongTermDebtCurrent;
    expect(admit(tags).row.totalDebt).toBe(130 * M);
  });
  it("does not complete contradictory current debt or an unreconciled vendor total", () => {
    expect(admit(tagged, row({ shortTermDebt: 9 * M, totalDebt: 127 * M })).row.totalDebt).toBeNull();
    expect(admit(tagged, row({ totalDebt: 119 * M })).row.totalDebt).toBeNull();
  });
  it("does not invent a new completeness refusal for a vendor line already on total lease scope", () => {
    const vendor = row({ capitalLeaseObligations: 26 * M, shortTermDebt: 10 * M, totalDebt: 136 * M });
    expect(admit(tagged, vendor).row.totalDebt).toBe(136 * M);
  });
  it("never mixes accessions or chooses an ambiguous value in one filing", () => {
    for (const ambiguous of [false, true]) {
      const facts = companyFacts({ [Q2]: tagged });
      const ps = (facts.facts["us-gaap"]!.LongTermDebtCurrent as { units: { USD: { val: number; accn: string }[] } }).units.USD;
      if (ambiguous) ps.push({ ...ps[0], val: 8 * M });
      else ps[0].accn = "0000000042-26-000099";
      expect(admitDebtFields(row(), facts, "USD", OBSERVED).row.totalDebt).toBeNull();
    }
  });
  it("reconciles debt including finance leases with pure debt when the noncurrent finance lease is zero", () => {
    // PR #86 review: pure 100, combined 120 and a zero noncurrent finance lease contradict by 20;
    // the vendor's 120 must not be admitted beside current debt as a 151 total.
    const tags = { ...tagged, LongTermDebtAndCapitalLeaseObligations: 120, LongTermDebtCurrent: 30, FinanceLeaseLiabilityNoncurrent: 0 };
    const vendor = row({ longTermDebt: 120 * M, shortTermDebt: 0, capitalLeaseObligations: 20 * M, totalDebt: 140 * M });
    expect(admit(tags, vendor).row.totalDebt).not.toBe(151 * M);
    expect(admit(tags, vendor).row.totalDebt).toBeNull();
    // Agreeing scopes with a zero finance lease still complete.
    expect(admit({ ...tags, LongTermDebtAndCapitalLeaseObligations: 100 }, row({ capitalLeaseObligations: 20 * M, totalDebt: 120 * M })).row.totalDebt).toBe(151 * M);
  });
  it("keeps the ambiguous combined/noncurrent finance-lease overlap refusal", () => {
    expect(admit({ ...tagged, LongTermDebtAndCapitalLeaseObligations: 100 }).row.totalDebt).toBeNull();
  });
  it("does not clear a collapse refusal or a refused component", () => {
    for (const field of ["totalDebt", "longTermDebt"]) {
      const out = admit(tagged, row({ fieldConflicts: { [field]: { usable: false,
        reason: "incomplete debt carrying value: resolved financing debt fell from 100 to 0", vendorValue: 118 * M, secValue: null } } }));
      expect(out.row.totalDebt).toBeNull();
    }
  });
});
