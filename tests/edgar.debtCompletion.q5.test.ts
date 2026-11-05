import { describe, expect, it } from "vitest";
import { admitBalanceCash, admitDebtFields, balanceAdmissionEntries, enrichFinancialFields } from "@/edgar/financialEnrichment";
import { leaseDebtConflict } from "@/pipeline/stageB/netDebt";
import { leaseDebtScopeRefusal } from "@/pipeline/stageB/leaseScope";
import { mergeManifest } from "@/pipeline/stageA/manifest";
import type { FmpBalanceSheetRow } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";
import { ACCN, companyFacts, enriched, M, OBSERVED, Q2 } from "./helpers/amzn51LeaseShape";

const tagged: Record<string, number> = { LongTermDebtNoncurrent: 100, LongTermDebtCurrent: 4,
  OperatingLeaseLiabilityCurrent: 2, OperatingLeaseLiabilityNoncurrent: 18,
  FinanceLeaseLiabilityCurrent: 1, FinanceLeaseLiabilityNoncurrent: 5 };
const row = (over: Partial<FmpBalanceSheetRow> = {}): FmpBalanceSheetRow => ({ date: Q2, reportedCurrency: "USD", longTermDebt: 100 * M,
  shortTermDebt: 0, capitalLeaseObligations: 18 * M, totalDebt: 118 * M,
  cashAndCashEquivalents: 10 * M, ...over });
const admit = (tags = tagged, vendor = row()) => admitDebtFields(vendor, companyFacts({ [Q2]: tags }), "USD", OBSERVED);

describe("exact same-filing debt completion", () => {
  it.each([103.48, 104.52])("uses reconciled components for a minor vendor-total difference (%sM), with both observations disclosed", total => {
    const vendor = row({ shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: total * M });
    const before = JSON.stringify(vendor);
    const out = admit(tagged, vendor);
    expect(out.row.totalDebt).toBe(130 * M);
    expect(out.row.netDebt).toBe(120 * M);
    expect(out.admissions[0]?.detail).toContain(`vendor total ${total.toLocaleString('en-US')}M`);
    expect(out.admissions[0]?.detail).toContain('component sum 104M');
    expect(out.admissions[0]?.detail).toMatch(/minor difference.*not filed equality.*no balancing plug/);
    expect(JSON.stringify(vendor)).toBe(before);
  });
  it("applies the same boundary to the older noncurrent-only lease completion", () => {
    const out = admit(tagged, row({ shortTermDebt: 4 * M, capitalLeaseObligations: 23 * M, totalDebt: 126.365 * M }));
    expect(out.row.totalDebt).toBe(130 * M);
    expect(out.row.fieldProvenance?.totalDebt?.calculation).toBe('noncurrent-lease-line-completed');
    expect(out.admissions[0]?.detail).toContain('vendor total 126.365M');
    expect(out.admissions[0]?.detail).toContain('component sum 127M');
  });
  it("keeps both minor-difference observations visible after acquisition has already completed the row", () => {
    const out = admit(tagged, row({ shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: 103.48 * M }));
    const repeated = admit(tagged, out.row);
    expect(repeated.row.totalDebt).toBe(130 * M);
    const basis = mergeManifest([{ field: 'statements.balance.totalDebt', reason: 'older annual lease completion',
      severity: 'info', expected: true }], balanceAdmissionEntries(repeated.admissions)).map(entry => entry.reason).join(' ');
    expect(basis).toContain('vendor total 103.48M');
    expect(basis).toContain('component sum 104M');
    expect(basis).toContain('reconciled components used');
  });
  it.each([103.479, 104.523])("refuses above the minor-total band and names both amounts (%sM)", total => {
    const out = admit(tagged, row({ shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: total * M }));
    expect(out.row.totalDebt).toBeNull();
    expect(out.row.fieldConflicts?.totalDebt?.reason).toContain(`${total.toLocaleString('en-US')}M`);
    expect(out.row.fieldConflicts?.totalDebt?.reason).toContain('104M');
  });
  it("does not let a minor total difference establish overlapping current borrowing scopes", () => {
    const out = admit({ OperatingLeaseLiabilityCurrent: 2, OperatingLeaseLiabilityNoncurrent: 18,
      LongTermDebtNoncurrent: 100, LongTermDebtAndCapitalLeaseObligationsCurrent: 4,
      ShortTermBorrowings: 4.001, DebtCurrent: 4.001 },
      row({ shortTermDebt: 6.001 * M, capitalLeaseObligations: 18 * M, totalDebt: 124.002 * M }));
    expect(out.row.totalDebt).toBeNull();
    expect(out.admissions).toEqual([]);
  });
  it.each([false, true])("re-evaluates its own stale total-sum refusal beside a filed noncurrent component, preserving cash refusal %s", cashRefused => {
    const reason = 'incomplete debt carrying value: the vendor lease line 23M USD is noncurrent, but the vendor total debt 122.5M is not its short-term debt + long-term debt + lease line, so its composition is unknown; the row is not completed from that filing, so total debt and net debt are withheld';
    const facts = companyFacts({ [Q2]: { ...tagged, ...(cashRefused ? { CashAndCashEquivalentsAtCarryingValue: 9 } : {}) } });
    let vendor = row({ capitalLeaseObligations: 23 * M,
      fieldProvenance: { longTermDebt: enriched(Q2, 'LongTermDebtNoncurrent') },
      fieldConflicts: { totalDebt: { usable: false, vendorValue: 122.5 * M, secValue: null, reason },
        netDebt: { usable: false, vendorValue: 112.5 * M, secValue: null, reason } } });
    Object.assign(vendor, { totalDebt: null, netDebt: null });
    if (cashRefused) vendor = admitBalanceCash(vendor, facts, 'quarter', OBSERVED).row;
    const out = admitDebtFields(vendor, facts, 'USD', OBSERVED);
    expect(out.row.totalDebt).toBe(130 * M);
    expect(out.row.fieldConflicts?.totalDebt?.usable).toBe(true);
    expect(out.row.netDebt).toBe(cashRefused ? null : 120 * M);
    if (cashRefused) expect(out.row.fieldConflicts?.netDebt?.reason).toMatch(/cashAndCashEquivalents conflict/);
    expect(balanceAdmissionEntries(out.admissions).map(e => e.reason).join(' ')).toContain('component sum 123M');
  });
  it("does not use a minor total difference to establish positive vendor current debt with no filed current scope", () => {
    const tags = { ...tagged };
    delete (tags as Record<string, number>).LongTermDebtCurrent;
    const out = admit(tags, row({ shortTermDebt: 4 * M, capitalLeaseObligations: 23 * M, totalDebt: 126.5 * M }));
    expect(out.row.totalDebt).toBeNull();
    expect(out.row.fieldConflicts?.totalDebt?.reason).toMatch(/current.*scope.*unproven/);
    expect(out.row.fieldConflicts?.totalDebt?.reason).toContain('126.5M');
    expect(out.row.fieldConflicts?.totalDebt?.reason).toContain('127M');
  });
  it("reconciles debt independently of a cash refusal in either pass order and retains that refusal", () => {
    const facts = companyFacts({ [Q2]: { ...tagged, CashAndCashEquivalentsAtCarryingValue: 9 } });
    const vendor = row({ shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: 104 * M });
    const cashFirst = admitDebtFields(admitBalanceCash(vendor, facts, 'quarter', OBSERVED).row, facts, 'USD', OBSERVED).row;
    const debtFirst = admitBalanceCash(admitDebtFields(vendor, facts, 'USD', OBSERVED).row, facts, 'quarter', OBSERVED).row;
    for (const out of [cashFirst, debtFirst]) {
      expect(out.totalDebt).toBe(130 * M);
      expect(out.cashAndCashEquivalents).toBeNull();
      expect(out.netDebt).toBeNull();
      expect(out.fieldConflicts?.netDebt?.reason).toMatch(/cashAndCashEquivalents conflict/);
    }
    expect(cashFirst.fieldProvenance?.totalDebt).toEqual(debtFirst.fieldProvenance?.totalDebt);
    const stale = admitBalanceCash(vendor, facts, 'quarter', OBSERVED).row;
    const oldDebtReason = 'incomplete debt carrying value: the vendor lease line was incomplete';
    Object.assign(stale, { totalDebt: null, netDebt: null, fieldConflicts: { ...stale.fieldConflicts,
      totalDebt: { usable: false, vendorValue: 104 * M, secValue: null, reason: oldDebtReason },
      netDebt: { usable: false, vendorValue: 94 * M, secValue: null, reason: oldDebtReason } } });
    const recovered = admitDebtFields(stale, facts, 'USD', OBSERVED).row;
    expect(recovered.totalDebt).toBe(130 * M);
    expect(recovered.fieldConflicts?.netDebt?.reason).toMatch(/cashAndCashEquivalents conflict/);
  });
  it("uses the vendor row's original filing in both direct replay and acquisition enrichment", () => {
    const facts = companyFacts({ [Q2]: Object.fromEntries(Object.entries(tagged).filter(([tag]) => !tag.startsWith('Finance'))) });
    for (const [tag, concept] of Object.entries(facts.facts['us-gaap']!)) {
      if (tag.includes('LeaseLiability') && !tag.endsWith('Noncurrent')) continue;
      const ps = (concept as { units: { USD: Record<string, unknown>[] } }).units.USD;
      ps.push({ ...ps[0], accn: '0000000042-26-000099', filed: '2026-10-01' });
    }
    const vendor = row({ shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: 104 * M, filingDate: '2026-07-31' });
    const balance = { ok: true as const, value: { source: 'fmp' as const, endpoint: 'test', asOf: OBSERVED, fetchedAt: OBSERVED, data: { rows: [vendor], raw: [] } } };
    const missing: FetchResult<never> = { ok: false, gap: { field: 'test', reason: 'not needed', severity: 'info' } };
    const fresh = enrichFinancialFields(balance, missing, facts, 'quarter', OBSERVED).balance;
    if (!fresh.ok) throw new Error('fixture');
    const replay = admitDebtFields(vendor, facts, 'USD', OBSERVED).row;
    expect(replay.totalDebt).toBe(124 * M);
    expect(fresh.value.data.rows[0]?.totalDebt).toBe(replay.totalDebt);
    expect(fresh.value.data.rows[0]?.fieldProvenance?.totalDebt?.filings).toEqual(replay.fieldProvenance?.totalDebt?.filings);
  });
  it.each([false, true])("cancels a proved noncurrent operating portion with %s vendor-zero borrowings", zero => {
    const tags: Record<string, number> = zero ? { OperatingLeaseLiabilityNoncurrent: 18 } : {
      OperatingLeaseLiabilityNoncurrent: 18, LongTermDebtAndCapitalLeaseObligations: 100, DebtCurrent: 4 };
    const vendor = row({ shortTermDebt: (zero ? 0 : 4) * M, longTermDebt: (zero ? 0 : 100) * M,
      capitalLeaseObligations: 18 * M,
      fieldConflicts: { totalDebt: { usable: false, vendorValue: (zero ? 18 : 122) * M, secValue: null,
        reason: 'incomplete debt carrying value: the vendor lease line 18M but no total operating-lease liability' } } });
    Object.assign(vendor, { totalDebt: null, netDebt: null });
    const out = admit(tags, vendor);
    expect(out.row.totalDebt).toBe((zero ? 18 : 122) * M);
    expect(leaseDebtConflict(out.row)).toBeNull();
    expect(leaseDebtScopeRefusal(out.row, false)).toBeNull();
    expect(leaseDebtScopeRefusal(out.row, true)).toMatch(/unverified/);
    expect(out.row.fieldProvenance?.financeLeaseLiability).toBeUndefined();
  });
  it("cancels partial operating leases beside reconciled combined current maturities and separate short-term borrowings", () => {
    const out = admit({ OperatingLeaseLiabilityNoncurrent: 18, LongTermDebtAndCapitalLeaseObligations: 100,
      LongTermDebtAndCapitalLeaseObligationsCurrent: 3, ShortTermBorrowings: 1 },
      row({ shortTermDebt: 4 * M, capitalLeaseObligations: 18 * M, totalDebt: 122 * M }));
    expect(out.row.totalDebt).toBe(122 * M);
    expect(out.row.operatingLeaseLiability).toBe(18 * M);
    expect(leaseDebtScopeRefusal(out.row, false)).toBeNull();
  });
  it("completes an undisclosed vendor lease zero from reconciled same-filing borrowings and leases", () => {
    const vendor = row({ shortTermDebt: 7 * M, capitalLeaseObligations: 0, totalDebt: 107 * M,
      operatingLeaseLiability: 20 * M, financeLeaseLiability: 6 * M });
    const before = JSON.stringify(vendor);
    const out = admit({ ...tagged, CommercialPaper: 3 }, vendor);
    expect(out.row).toMatchObject({ shortTermDebt: 7 * M, longTermDebt: 100 * M,
      capitalLeaseObligations: 26 * M, totalDebt: 133 * M, netDebt: 123 * M });
    expect(leaseDebtConflict(out.row)).toBeNull();
    expect(out.admissions[0]?.detail).toMatch(/undisclosed.*zero/i);
    expect(JSON.stringify(vendor)).toBe(before);
  });
  it("counts operating leases embedded in vendor noncurrent debt exactly once when its separate lease line is zero", () => {
    const vendor = row({ longTermDebt: 118 * M, shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: 122 * M,
      operatingLeaseLiability: 20 * M, financeLeaseLiability: 6 * M });
    const out = admit(tagged, vendor);
    expect(out.row).toMatchObject({ longTermDebt: 100 * M, shortTermDebt: 4 * M, capitalLeaseObligations: 26 * M, totalDebt: 130 * M });
    expect(leaseDebtConflict(out.row)).toBeNull();
    expect(out.admissions[0]?.detail).toContain("noncurrent operating leases inside vendor long-term debt");
  });
  it("preserves a true zero lease line when no filed leases exist", () => {
    const out = admit({ LongTermDebtNoncurrent: 100, LongTermDebtCurrent: 4 },
      row({ shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: 104 * M }));
    expect(out.row.totalDebt).toBe(104 * M);
    expect(out.admissions).toEqual([]);
  });
  it("admits reconciled borrowings with an undisclosed finance family, explicitly as an assumption", () => {
    const onlyOperating = Object.fromEntries(Object.entries(tagged).filter(([tag]) => !tag.startsWith("FinanceLease")));
    const vendor = row({ shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: 104 * M,
      operatingLeaseLiability: 20 * M });
    const out = admit(onlyOperating, vendor);
    expect(out.row.totalDebt).toBe(124 * M);
    expect(out.admissions[0]?.detail).toMatch(/finance leases.*not separately material.*assum/i);
    expect(out.row.fieldProvenance?.financeLeaseLiability).toBeUndefined();
    expect(leaseDebtConflict(out.row)).toBeNull();
  });
  it("uses a filed current-debt aggregate instead of double-counting its maturities", () => {
    const out = admit({ ...tagged, DebtCurrent: 7 }, row({ shortTermDebt: 7 * M, capitalLeaseObligations: 0, totalDebt: 107 * M }));
    expect(out.row).toMatchObject({ shortTermDebt: 7 * M, totalDebt: 133 * M });
  });
  it.each([[true, "beside the combined current tag"], [false, "by exact arithmetic alone"]])("counts current finance leases once when DebtCurrent holds them, %s (%s)", combinedFiled => {
    const tags: Record<string, number> = { ...tagged, DebtCurrent: 5, ...(combinedFiled ? { LongTermDebtAndCapitalLeaseObligationsCurrent: 5 } : {}) };
    const out = admit(tags, row({ shortTermDebt: 0, capitalLeaseObligations: 20 * M, totalDebt: 120 * M }));
    expect(out.row).toMatchObject({ shortTermDebt: 4 * M, longTermDebt: 100 * M, capitalLeaseObligations: 26 * M, totalDebt: 130 * M });
  });
  it("keeps a DebtCurrent that exceeds the maturities by something other than the current finance lease", () => {
    const out = admit({ ...tagged, DebtCurrent: 6 }, row({ shortTermDebt: 0, capitalLeaseObligations: 20 * M, totalDebt: 120 * M }));
    expect(out.row).toMatchObject({ shortTermDebt: 6 * M, totalDebt: 132 * M });
  });
  it.each(["NotesPayable", "LongTermNotesPayable", "SeniorNotes", "SeniorLongTermNotes", "LoansPayable", "LongTermLoansPayable",
    "SecuredDebt", "SecuredLongTermDebt", "ConvertibleNotesPayable", "ConvertibleDebtNoncurrent", "ConvertibleLongTermNotesPayable", "LongTermLineOfCredit",
    "NotesPayableCurrent", "SeniorNotesCurrent", "LongTermNotesPayableCurrent", "LoansPayableCurrent", "LongTermLoansPayableCurrent", "SecuredDebtCurrent",
    "ConvertibleDebtCurrent", "ConvertibleNotesPayableCurrent", "LinesOfCreditCurrent", "NotesAndLoansPayableCurrent"])("does not accept vendor zero borrowings when the filing reports positive %s", tag => {
    const reason = 'incomplete debt carrying value: the vendor lease line 18M but no total operating-lease liability';
    const vendor = row({ shortTermDebt: 0, longTermDebt: 0, capitalLeaseObligations: 18 * M,
      fieldConflicts: { totalDebt: { usable: false, vendorValue: 18 * M, secValue: null, reason } } });
    Object.assign(vendor, { totalDebt: null, netDebt: null });
    const out = admit({ OperatingLeaseLiabilityNoncurrent: 18, [tag]: 100 }, vendor);
    expect(out.row.totalDebt).toBeNull();
    expect(out.row.fieldConflicts?.totalDebt?.usable).toBe(false);
    expect(out.row.fieldConflicts?.totalDebt?.reason).toMatch(/^incomplete debt carrying value/);
    expect(out.admissions).toEqual([]);
  });
  it("still accepts vendor zero borrowings when an instrument-level element is filed as zero", () => {
    const vendor = row({ shortTermDebt: 0, longTermDebt: 0, capitalLeaseObligations: 18 * M,
      fieldConflicts: { totalDebt: { usable: false, vendorValue: 18 * M, secValue: null,
        reason: 'incomplete debt carrying value: the vendor lease line 18M but no total operating-lease liability' } } });
    Object.assign(vendor, { totalDebt: null, netDebt: null });
    const out = admit({ OperatingLeaseLiabilityNoncurrent: 18, NotesPayable: 0 }, vendor);
    expect(out.row.totalDebt).toBe(18 * M);
    expect(leaseDebtScopeRefusal(out.row, false)).toBeNull();
  });
  it("does not complete an undisclosed lease zero over positive instrument-level current debt", () => {
    const out = admit({ LongTermDebtNoncurrent: 100, OperatingLeaseLiabilityCurrent: 2, OperatingLeaseLiabilityNoncurrent: 18, ConvertibleDebtCurrent: 50 },
      row({ shortTermDebt: 0, capitalLeaseObligations: 0, totalDebt: 100 * M }));
    expect(out.admissions).toEqual([]);
    expect(out.row.fieldProvenance?.totalDebt?.calculation).not.toBe('same-filing-debt-completed');
  });
  it("admits an operating-only lease line beside a filed finance total with no maturity split", () => {
    const tags = { ...tagged, FinanceLeaseLiability: 6 };
    delete (tags as Record<string, number>).FinanceLeaseLiabilityCurrent;
    delete (tags as Record<string, number>).FinanceLeaseLiabilityNoncurrent;
    const out = admit(tags, row({ shortTermDebt: 4 * M, capitalLeaseObligations: 20 * M, totalDebt: 124 * M }));
    expect(out.row.totalDebt).toBe(130 * M);
    expect(out.row.financeLeaseLiability).toBe(6 * M);
    expect(leaseDebtConflict(out.row)).toBeNull();
  });
  it("leaves a reconciled full operating-only total unchanged when no numeric completion is needed", () => {
    const tags = { LongTermDebtNoncurrent: 100, LongTermDebtCurrent: 4, OperatingLeaseLiability: 20 };
    const vendor = row({ shortTermDebt: 4 * M, capitalLeaseObligations: 20 * M, totalDebt: 124 * M,
      operatingLeaseLiability: 20 * M });
    const out = admit(tags, vendor);
    expect(out.row).toBe(vendor);
    expect(out.admissions).toEqual([]);
  });
  it("recognizes a vendor operating-only line from complete operating evidence without asserting a finance maturity split", () => {
    const vendor = row({ shortTermDebt: 4 * M, capitalLeaseObligations: 20 * M, totalDebt: 124 * M,
      operatingLeaseLiability: 20 * M, financeLeaseLiability: 6 * M,
      fieldProvenance: { operatingLeaseLiability: { source: 'edgar', unit: 'USD', periodStart: null, periodEnd: Q2,
        observedAt: OBSERVED, tags: ['us-gaap/OperatingLeaseLiability'], filings: [{ accn: ACCN, filed: '2026-07-31', form: '10-Q' }] } } });
    expect(leaseDebtConflict(vendor)).toBeNull();
    expect(leaseDebtConflict({ ...vendor, financeLeaseLiability: 30 * M })).toBeNull();
    expect(leaseDebtConflict({ ...vendor, fieldProvenance: { operatingLeaseLiability: {
      ...vendor.fieldProvenance!.operatingLeaseLiability!, periodEnd: '2025-12-31' } } })).not.toBeNull();
    expect(leaseDebtConflict({ ...vendor, capitalLeaseObligations: 19 * M })).not.toBeNull();
    expect(leaseDebtConflict({ ...vendor, fieldProvenance: {} })).not.toBeNull();
    expect(leaseDebtConflict({ ...vendor, totalDebt: 25 * M })).not.toBeNull();
    expect(leaseDebtConflict({ ...vendor, date: undefined, fieldProvenance: { operatingLeaseLiability: {
      ...vendor.fieldProvenance!.operatingLeaseLiability!, periodEnd: undefined } } })).not.toBeNull();
  });
  it("recognizes a gross combined debt fact only when the same filing's signed discount ties to carrying debt", () => {
    const tags = { LongTermDebtNoncurrent: 100, LongTermDebtCurrent: 4, LongTermDebt: 104,
      DebtLongtermAndShorttermCombinedAmount: 108, DebtInstrumentUnamortizedDiscountPremiumAndDebtIssuanceCostsNet: -4 };
    const vendor = row({ shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: 104 * M });
    expect(admit(tags, vendor).row.totalDebt).toBe(104 * M);
    expect(admit(tags, { ...vendor, cik: '99' }).row.totalDebt).toBeNull();
    expect(admit({ ...tags, DebtInstrumentUnamortizedDiscountPremiumAndDebtIssuanceCostsNet: -3 }, vendor).row.totalDebt).toBeNull();
    const facts = companyFacts({ [Q2]: tags });
    const discount = facts.facts['us-gaap']!.DebtInstrumentUnamortizedDiscountPremiumAndDebtIssuanceCostsNet as { units: { USD: { accn: string }[] } };
    discount.units.USD[0]!.accn = '0000000042-26-000099';
    expect(admitDebtFields(vendor, facts, 'USD', OBSERVED).row.totalDebt).toBeNull();
  });
  it("leaves an unproved zero-line composition to the existing integrity guard without adding a debt refusal", () => {
    const vendor = row({ shortTermDebt: 9 * M, capitalLeaseObligations: 0, totalDebt: 109 * M,
      operatingLeaseLiability: 20 * M, financeLeaseLiability: 6 * M });
    const out = admit(tagged, vendor);
    expect(out.row.totalDebt).toBe(109 * M);
    expect(out.admissions).toEqual([]);
    expect(out.row.fieldConflicts?.totalDebt).toBeUndefined();
    expect(leaseDebtConflict(out.row)).toMatch(/do not reconcile/);
  });
  it("does not replace a filed zero or reconcile an incomplete lease or disputed borrowing with a vendor zero", () => {
    for (const mode of ["filed zero", "incomplete finance", "unreconciled total", "different issuer", "refused lease", "current notes", "contradictory vendor split"]) {
      const tags = { ...tagged };
      const vendor = row({ shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: 104 * M });
      if (mode === "filed zero") vendor.fieldProvenance = { capitalLeaseObligations: {
        source: "edgar", tags: ["us-gaap/OperatingLeaseLiability"], unit: "USD", periodStart: null,
        periodEnd: Q2, observedAt: OBSERVED, filings: [{ accn: ACCN, form: "10-Q", filed: "2026-08-01" }] } };
      if (mode === "incomplete finance") delete tags.FinanceLeaseLiabilityCurrent;
      if (mode === "unreconciled total") vendor.totalDebt = 105 * M;
      if (mode === "different issuer") vendor.cik = "99";
      if (mode === "current notes") tags.NotesPayableCurrent = 2;
      if (mode === "contradictory vendor split") vendor.capitalLeaseObligationsCurrent = 2 * M;
      if (mode === "refused lease") vendor.fieldConflicts = { financeLeaseLiability: {
        usable: false, vendorValue: 6 * M, secValue: null, reason: "lease scope disputed" } };
      expect(admit(tags, vendor).admissions, mode).toEqual([]);
    }
  });
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
