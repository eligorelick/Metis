import { describe, expect, it } from "vitest";
import { admitBalanceCash } from "@/edgar/financialEnrichment";
import { ACCN, companyFacts, enriched, M, OBSERVED, Q2 } from "./helpers/amzn51LeaseShape";
import type { FmpBalanceSheetRow } from "@/providers/fmp";

const totalTag = "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents";
const tags = { CashAndCashEquivalentsAtCarryingValue: 5413, [totalTag]: 6976 };
const vendor = (): FmpBalanceSheetRow => ({ date: Q2, reportedCurrency: "USD", cashAndCashEquivalents: 6976 * M,
  cashAndShortTermInvestments: 7296 * M, totalDebt: 6476 * M, netDebt: -500 * M });

describe("vendor cash that exactly matches the same filing's restricted-inclusive scope", () => {
  it("uses directly filed unrestricted cash and retains the original inclusive observation", () => {
    const row = vendor();
    const out = admitBalanceCash(row, companyFacts({ [Q2]: tags }), "quarter", OBSERVED);
    expect(out.row.cashAndCashEquivalents).toBe(5413 * M);
    expect(out.row.fieldConflicts?.cashAndCashEquivalents).toMatchObject({ usable: true, vendorValue: 6976 * M, secValue: 5413 * M });
    expect(out.row.fieldProvenance?.cashAndCashEquivalents?.tags).toEqual(["us-gaap/CashAndCashEquivalentsAtCarryingValue"]);
    expect(out.row.cashAndShortTermInvestments).toBeNull();
    expect(out.row.netDebt).toBeNull();
    expect(out.row.vendorNetDebt).toBe(-500 * M);
    expect(row.cashAndCashEquivalents).toBe(6976 * M);
  });
  it("recomputes net debt only when total debt has compatible admitted SEC evidence", () => {
    const row: FmpBalanceSheetRow = { ...vendor(), fieldProvenance: { totalDebt: enriched(Q2, "LongTermDebtNoncurrent") } };
    const out = admitBalanceCash(row, companyFacts({ [Q2]: tags }), "quarter", OBSERVED).row;
    expect(out.netDebt).toBe(1063 * M);
    expect(out.vendorNetDebt).toBe(-500 * M);
    expect(out.fieldProvenance?.netDebt?.tags).toContain("us-gaap/CashAndCashEquivalentsAtCarryingValue");
  });
  it.each([-700 * M, null])("preserves an existing vendor net-debt observation %s", vendorNetDebt => {
    const row: FmpBalanceSheetRow = { ...vendor(), vendorNetDebt,
      fieldProvenance: { totalDebt: enriched(Q2, "LongTermDebtNoncurrent") } };
    const out = admitBalanceCash(row, companyFacts({ [Q2]: tags }), "quarter", OBSERVED).row;
    expect(out.vendorNetDebt).toBe(vendorNetDebt);
    expect(out.netDebt).toBe(1063 * M);
  });
  it.each(["debt filing", "debt refusal", "net debt refusal"])("preserves %s while admitting cash", kind => {
    const row = { ...vendor(), fieldProvenance: { totalDebt: enriched(Q2, "LongTermDebtNoncurrent") } } as FmpBalanceSheetRow;
    if (kind === "debt filing") row.fieldProvenance!.totalDebt!.filings[0]!.accn = "0000000042-26-000099";
    else row.fieldConflicts = { [kind === "debt refusal" ? "totalDebt" : "netDebt"]: {
      usable: false, vendorValue: null, secValue: null, reason: "independent refusal" } };
    const out = admitBalanceCash(row, companyFacts({ [Q2]: tags }), "quarter", OBSERVED).row;
    expect(out.cashAndCashEquivalents).toBe(5413 * M);
    expect(out.netDebt).toBeNull();
    if (kind !== "debt filing") expect(out.fieldConflicts?.[kind === "debt refusal" ? "totalDebt" : "netDebt"]?.reason).toBe("independent refusal");
  });
  it.each(["amount", "accession", "future", "currency", "refusal"])("keeps the cash refusal for incompatible %s evidence", kind => {
    const facts = companyFacts({ [Q2]: tags });
    const c = facts.facts["us-gaap"]![totalTag] as { units: Record<string, Record<string, unknown>[]> };
    const p = c.units.USD![0]!;
    if (kind === "amount") p.val = 6977 * M;
    if (kind === "accession") p.accn = ACCN.replace(/.$/, "9");
    if (kind === "future") p.filed = "2028-01-01";
    if (kind === "currency") c.units = { EUR: c.units.USD! };
    const row = vendor();
    if (kind === "refusal") row.fieldConflicts = { cashAndCashEquivalents: { usable: false, vendorValue: 6976 * M, secValue: null, reason: "unrelated refusal" } };
    const out = admitBalanceCash(row, facts, "quarter", OBSERVED).row;
    expect(out.cashAndCashEquivalents).toBeNull();
    expect(out.netDebt).toBeNull();
    expect(out.fieldConflicts?.cashAndCashEquivalents?.usable).toBe(false);
  });
  it.each(["conflicting same-filing values", "invalid latest filing"])("does not admit cash from %s", kind => {
    const facts = companyFacts({ [Q2]: tags });
    const cash = facts.facts["us-gaap"]!.CashAndCashEquivalentsAtCarryingValue as { units: Record<string, Record<string, unknown>[]> };
    cash.units.USD!.push({ ...cash.units.USD![0], val: kind === "invalid latest filing" ? -1 : 6000 * M,
      ...(kind === "invalid latest filing" ? { filed: "2026-08-01", accn: "0000000042-26-000099" } : {}) });
    const out = admitBalanceCash(vendor(), facts, "quarter", OBSERVED).row;
    expect(out.cashAndCashEquivalents).toBeNull();
    expect(out.fieldConflicts?.cashAndCashEquivalents?.usable).toBe(false);
    expect(out.netDebt).toBeNull();
  });
});
