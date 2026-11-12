// P11 (D-226): the "Revenue scope unresolved" copy in `admitRevenue` keeps the
// code it was written with and no other. Synthetic issuer; no saved data.
import { describe, expect, it } from "vitest";
import { admitRevenue } from "@/edgar/revenueAdmission";
import { contractRevenueScopeRefusal } from "@/edgar/incomeClassification";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FiledIncomeLine, FmpIncomeStatementRow, StatementFieldConflict, StatementFieldProvenance } from "@/providers/fmp";

const M = 1e6;
const FILED = "2026-02-01";
const SENTENCE = "Revenue scope unresolved: the contract-revenue fact is not established as consolidated operating revenue; a complete same-period operating line is required.";
const proof = (tag: string, accn = "annual"): StatementFieldProvenance => ({ source: "edgar", unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31",
  observedAt: "2026-03-01", tags: [`us-gaap/${tag}`], filings: [{ accn, filed: FILED, form: "10-K" }] });
const line = (value: number, tag: string, accn?: string): FiledIncomeLine => ({ value: value * M, proof: proof(tag, accn) });
const CONTRACT = "RevenueFromContractWithCustomerExcludingAssessedTax";
const row = (revenue: number | undefined, extra: Partial<FmpIncomeStatementRow> = {}): FmpIncomeStatementRow => ({ date: "2025-12-31", periodStart: "2025-01-01",
  period: "FY", fiscalYear: "2025", cik: "42", reportedCurrency: "USD", filingDate: FILED, ...(revenue === undefined ? {} : { revenue: revenue * M }), ...extra });
const emptyFacts: CompanyFacts = { cik: 42, entityName: "Synthetic", facts: { "us-gaap": {} } };
/** The filing presents only an ASC 606 contract-revenue line, below the vendor's 1,100. */
const contractOnly = row(undefined, { filedIncomeLines: { [CONTRACT]: line(1000, CONTRACT) } });
const admit = (r: FmpIncomeStatementRow, current: FmpIncomeStatementRow, facts = emptyFacts, policy?: { sales: boolean; salesTags: string[] }) =>
  admitRevenue(r, current, [], { rows: [r], raw: [r] }, facts, "annual", policy);
/** The form the line wrote before D-226: the old refusal with only its sentence replaced. */
const before = (conflict: StatementFieldConflict) => ({ ...conflict, reason: SENTENCE });

/** Reach the "Revenue scope unresolved" line with `incoming` as the row's refused revenue conflict. */
function scopeUnresolved(incoming: FmpIncomeStatementRow) {
  const out = admit(incoming, contractOnly);
  expect(out.handled).toBe(true);
  expect(out.gaps).toEqual([{ field: "statements.income.2025-12-31.revenue", reason: SENTENCE, severity: "info" }]);
  return out;
}

describe("the revenue-scope-unresolved copy keeps only the code it is written with (D-226)", () => {
  it("revenue-scope from the sales-basis refusal: same bytes as before, and the code still decides the next pass", () => {
    // Pass 1, the real writer: the sales basis is established, but this period has no sales line.
    const first = admit(row(1100), contractOnly, emptyFacts, { sales: true, salesTags: ["SalesRevenueNet"] });
    const refused = first.row.fieldConflicts!.revenue!;
    expect(refused).toMatchObject({ usable: false, cause: "revenue-scope", secValue: null });
    expect(refused.secEvidence).toBeUndefined();
    // Pass 2 (income classification runs again in incomeBasis.ts) reaches the line.
    const second = scopeUnresolved(first.row);
    expect(second.row.fieldConflicts!.revenue).toStrictEqual(before(refused));
    expect(JSON.stringify(second.row)).toBe(JSON.stringify({ ...first.row, fieldConflicts: { ...first.row.fieldConflicts, revenue: before(refused) } }));
    expect(second.row.fieldConflicts!.revenue!.cause).toBe("revenue-scope");
    // A third pass is unchanged too.
    expect(scopeUnresolved(second.row).row).toStrictEqual(second.row);
    // Why the code is kept, not dropped: without it this refusal (no SEC evidence, no agreeing
    // value) is no longer reconsidered, so dropping it would change the decision.
    const uncoded: StatementFieldConflict = { ...refused };
    delete uncoded.cause;
    const withoutCode = admit({ ...first.row, fieldConflicts: { ...first.row.fieldConflicts, revenue: uncoded } }, contractOnly);
    expect(withoutCode.handled).toBe(false);
    expect(withoutCode.row.fieldConflicts!.revenue!.reason).toBe(refused.reason);
  });

  it("revenue-scope from the conflicting-observations refusal: same bytes as before", () => {
    // Pass 1, the real writer: the selected Revenues line has two filed values for one filing.
    const facts: CompanyFacts = { cik: 42, entityName: "Synthetic", facts: { "us-gaap": { Revenues: { units: { USD: [
      { start: "2025-01-01", end: "2025-12-31", val: 1000 * M, accn: "annual", filed: FILED, form: "10-K", fy: 2025, fp: "FY" },
      { start: "2025-01-01", end: "2025-12-31", val: 1010 * M, accn: "annual", filed: FILED, form: "10-K", fy: 2025, fp: "FY" },
    ] } } } } };
    const first = admit(row(1100), row(undefined, { filedIncomeLines: { Revenues: line(1000, "Revenues") } }), facts);
    const refused = first.row.fieldConflicts!.revenue!;
    expect(refused).toMatchObject({ usable: false, cause: "revenue-scope", reason: "Revenue withheld: the filed observations conflict or the alleged quarter duplicates a full-year amount." });
    expect(refused.secEvidence).toBeDefined();
    const second = scopeUnresolved(first.row);
    expect(second.row.fieldConflicts!.revenue).toStrictEqual(before(refused));
    expect(JSON.stringify(second.row.fieldConflicts!.revenue)).toBe(JSON.stringify(before(refused)));
  });

  it("a refusal without a code (the keyless contract-revenue refusal) stays without one, as before", () => {
    // The sentence from its real writer, in the shape applyKeylessFallbacks stores (keyless.ts).
    const evidence = proof(CONTRACT);
    const reason = contractRevenueScopeRefusal(evidence, 1100 * M, 1000 * M)!;
    expect(reason).toMatch(/^Revenue scope unresolved: vendor revenue /);
    const refused: StatementFieldConflict = { usable: false, vendorValue: 1100 * M, secValue: 1000 * M, secEvidence: evidence, reason };
    const out = scopeUnresolved(row(undefined, { fieldConflicts: { revenue: refused } }));
    expect(out.row.fieldConflicts!.revenue).toStrictEqual(before(refused));
    expect(out.row.fieldConflicts!.revenue).not.toHaveProperty("cause");
  });

  it("drops a code from another writer instead of keeping it beside the new sentence", () => {
    // No current writer puts this code on revenue; the copy must still not carry it.
    const refused: StatementFieldConflict = { usable: false, vendorValue: 1100 * M, secValue: 1000 * M, secEvidence: proof(CONTRACT),
      cause: "vendor-sec-value-conflict", reason: "vendor/SEC revenue conflict: another writer's sentence" };
    const out = scopeUnresolved(row(1100, { fieldConflicts: { revenue: refused } }));
    const { cause: _dropped, ...rest } = refused;
    expect(out.row.fieldConflicts!.revenue).toStrictEqual({ ...rest, reason: SENTENCE });
  });

  it("leaves a usable revenue conflict, and a row with no contract note, unchanged", () => {
    const usable: StatementFieldConflict = { usable: true, vendorValue: 1100 * M, secValue: 1000 * M, reason: "kept" };
    const unchanged = admit(row(1100, { fieldConflicts: { revenue: usable } }), contractOnly);
    expect(unchanged.handled).toBe(false);
    expect(unchanged.row.fieldConflicts!.revenue).toBe(usable);
  });
});
