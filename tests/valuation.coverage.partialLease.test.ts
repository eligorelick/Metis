import { expect, it } from "vitest";
import { leaseDebtScopeRefusal, restoreLeaseFinancingProvenance } from "@/pipeline/stageB/leaseScope";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow } from "@/providers/fmp";

// Public EXPE 10-Q 0001324424-26-000053, 2026-06-30. The operating
// maturity is incomplete; all financing borrowings are stated in one filing.
function fixture() {
  const point = { end: "2026-06-30", accn: "0001324424-26-000053", filed: "2026-08-06", form: "10-Q" };
  const concept = (val: number) => ({ units: { USD: [{ ...point, val }] } });
  const facts: CompanyFacts = { cik: 1324424, entityName: "Example", facts: { "us-gaap": {
    LongTermDebtCurrent: concept(0), LongTermDebtNoncurrent: concept(5_459_000_000), OperatingLeaseLiabilityNoncurrent: concept(226_000_000),
  } } };
  const reason = "incomplete debt carrying value: the vendor lease line 226M USD is the 10-Q filing's noncurrent lease liabilities, but the filing establishes no total operating-lease liability; total debt and net debt are withheld";
  // Retained admission refusals serialize null, unlike optional provider fields.
  const row = { date: point.end, cik: "0001324424", reportedCurrency: "USD", shortTermDebt: 0, longTermDebt: 5_459_000_000,
    capitalLeaseObligations: 226_000_000, capitalLeaseObligationsCurrent: 0, operatingLeaseLiability: null, totalDebt: null,
    cashAndCashEquivalents: 6_682_000_000, netDebt: null,
    fieldConflicts: { totalDebt: { vendorValue: 5_685_000_000, secValue: null, usable: false, reason }, netDebt: { vendorValue: -997_000_000, secValue: null, usable: false, reason } } } as unknown as FmpBalanceSheetRow;
  return {row,facts};
}

it("admits cancellation of a refused noncurrent-only operating lease from independently complete borrowings", () => {
  const {row,facts}=fixture(), before=JSON.stringify(row);
  const restored=restoreLeaseFinancingProvenance(row,facts,"2026-11-03T20:00:00Z");
  expect(leaseDebtScopeRefusal(restored,false)).toBeNull();
  expect(restored.totalDebt! - restored.operatingLeaseLiability!).toBe(5_459_000_000);
  expect(leaseDebtScopeRefusal(restored,true)).toMatch(/current portion is unverified/);
  expect(JSON.stringify(row)).toBe(before);
});

it("preserves an unrelated net-debt refusal", () => {
  const {row,facts}=fixture();
  row.fieldConflicts!.netDebt!.reason="cash components are disputed";
  expect(restoreLeaseFinancingProvenance(row,facts,"2026-11-03T20:00:00Z").fieldConflicts?.netDebt?.reason).toBe("cash components are disputed");
});

it("keeps refusing legacy finance-lease maturity evidence", () => {
  const {row,facts}=fixture();
  facts.facts["us-gaap"]!.CapitalLeaseObligationsNoncurrent=structuredClone(facts.facts["us-gaap"]!.OperatingLeaseLiabilityNoncurrent);
  expect(restoreLeaseFinancingProvenance(row,facts,"2026-11-03T20:00:00Z").totalDebt).toBeNull();
});

it.each(["missing current", "other filing", "finance lease", "extra borrowing", "combined current financing", "notes payable", "debt collapse", "component conflict", "different total", "other issuer", "future filing"])("keeps refusing %s", mode => {
  const {row,facts}=fixture();
  const f=facts.facts["us-gaap"]!;
  const raw=(tag:string)=>f[tag] as {units:{USD:{val:number;accn:string;filed:string}[]}};
  if(mode==="missing current") delete f.LongTermDebtCurrent;
  if(mode==="other filing") raw("LongTermDebtCurrent").units.USD[0]!.accn="0001324424-26-000099";
  if(mode==="finance lease") f.FinanceLeaseLiabilityNoncurrent=structuredClone(f.OperatingLeaseLiabilityNoncurrent);
  if(mode==="extra borrowing") f.CommercialPaper=structuredClone(f.OperatingLeaseLiabilityNoncurrent);
  if(mode==="combined current financing") f.LongTermDebtAndCapitalLeaseObligationsCurrent=structuredClone(f.OperatingLeaseLiabilityNoncurrent);
  if(mode==="notes payable") f.NotesAndLoansPayableCurrent=structuredClone(f.OperatingLeaseLiabilityNoncurrent);
  if(mode==="debt collapse") row.fieldConflicts!.totalDebt!.reason="incomplete debt carrying value: financing debt fell without repayment";
  if(mode==="component conflict") row.fieldConflicts!.longTermDebt={vendorValue:row.longTermDebt!,secValue:null,usable:false,reason:"carrying scope disputed"};
  if(mode==="different total") row.fieldConflicts!.totalDebt!.vendorValue=6_000_000_000;
  if(mode==="other issuer") row.cik="99";
  if(mode==="future filing") raw("LongTermDebtCurrent").units.USD[0]!.filed="2027-01-01";
  expect(restoreLeaseFinancingProvenance(row,facts,"2026-11-03T20:00:00Z").totalDebt).toBeNull();
});
