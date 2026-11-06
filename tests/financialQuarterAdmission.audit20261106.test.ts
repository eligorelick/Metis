import { describe, expect, it } from "vitest";
import { withCashFlowSbcBasis } from "@/pipeline/cashFlowBasis";
import { admitStockCompensation } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpCashFlowRow } from "@/providers/fmp";
import type { DataBundle } from "@/pipeline/types";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";

const at = "2026-11-06T21:00:34Z";
const point = (val: number, start: string, end: string, filed: string, accn = filed) => ({ val: val * M, start, end, filed, accn, form: end.endsWith("12-31") ? "10-K" : "10-Q", fy: Number(end.slice(0, 4)), fp: "FY" });
function fixture() {
  const facts: CompanyFacts = { cik: 123, entityName: "Synthetic", facts: { "us-gaap": {
    PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [
      point(770, "2025-01-01", "2025-12-31", "2026-02-13"),
      point(585, "2025-01-01", "2025-09-30", "2025-11-07"),
      point(396, "2025-01-01", "2025-06-30", "2025-08-08"),
    ] } },
  } } };
  const b = completeCurrencyBundle({}); b.builtAt = at;
  b.edgar = { ...b.edgar, cik: { ok: true, value: { data: { cik: 123, cik10: "0000000123", ticker: b.symbol }, source: "edgar", endpoint: "fixture", fetchedAt: at, asOf: at } },
    companyFacts: { ok: true, value: { data: facts, source: "edgar", endpoint: "fixture", fetchedAt: at, asOf: at } } } as DataBundle["edgar"];
  if (!b.statements.cashflowQuarterly.ok || !b.statements.cashflowAnnual.ok) throw Error("fixture");
  const row: FmpCashFlowRow = { date: "2025-09-30", periodStart: "2025-07-01", filingDate: "2025-11-07", reportedCurrency: "USD", operatingCashFlow: -497 * M, capitalExpenditure: 396 * M, freeCashFlow: -101 * M };
  b.statements.cashflowQuarterly.value.data.rows = [row];
  b.statements.cashflowAnnual.value.data.rows = [{ date: "2025-12-31", filingDate: "2026-02-13", reportedCurrency: "USD", capitalExpenditure: -770 * M }];
  return { b, row, facts };
}
function quarter(b: DataBundle) {
  const r = withCashFlowSbcBasis(b).statements.cashflowQuarterly;
  if (!r.ok) throw Error("fixture"); return r.value.data.rows[0]!;
}
describe("standalone capex on an independently established annual tag basis", () => {
  it("reconciles a misplaced cumulative amount and dependent FCF without mutating observations", () => {
    const { b, row } = fixture();
    expect(quarter(b)).toMatchObject({ capitalExpenditure: -189 * M, freeCashFlow: -686 * M,
      fieldConflicts: { capitalExpenditure: { usable: true, vendorValue: 396 * M, secValue: -189 * M } },
      fieldProvenance: { capitalExpenditure: { derivation: "ytd-difference", periodStart: "2025-07-01" } } });
    expect(row.capitalExpenditure).toBe(396 * M);
    expect(withCashFlowSbcBasis(withCashFlowSbcBasis(b)).statements).toEqual(withCashFlowSbcBasis(b).statements);
  });
  it.each([false, true])("handles later comparative copies without admitting a changed presentation (changed=%s)", changed => {
    const { b, facts } = fixture();
    const tag = facts.facts["us-gaap"]!.PaymentsToAcquirePropertyPlantAndEquipment as { units: { USD: object[] } };
    tag.units.USD.push(point(changed ? 700 : 585, "2025-01-01", "2025-09-30", "2026-11-05"), point(396, "2025-01-01", "2025-06-30", "2026-08-06"));
    expect(quarter(b).capitalExpenditure).toBe(changed ? null : -189 * M);
    expect(quarter(b).freeCashFlow).toBe(changed ? null : -686 * M);
  });
  it.each(["currency", "period", "filing", "annual basis", "ambiguous tag", "refusal"])("does not recover from incompatible %s evidence", kind => {
    const { b, row, facts } = fixture();
    if (kind === "currency") row.reportedCurrency = "EUR";
    if (kind === "period") row.periodStart = "2025-01-01";
    if (kind === "filing") row.filingDate = "2025-11-08";
    if (kind === "annual basis" && b.statements.cashflowAnnual.ok) b.statements.cashflowAnnual.value.data.rows[0]!.capitalExpenditure = -999 * M;
    if (kind === "ambiguous tag") facts.facts["us-gaap"]!.PaymentsToDevelopSoftware = structuredClone(facts.facts["us-gaap"]!.PaymentsToAcquirePropertyPlantAndEquipment);
    if (kind === "refusal") row.fieldConflicts = { capitalExpenditure: { usable: false, vendorValue: 396 * M, secValue: null, reason: "Independent refusal" } };
    expect(quarter(b).capitalExpenditure).not.toBe(-189 * M);
    if (kind === "refusal") expect(quarter(b).freeCashFlow).toBeNull();
  });
});
describe("recoverable vendor SBC zero placeholders", () => {
  it("supersedes only its own resolved refusal in the current manifest", () => {
    const { b, facts } = fixture();
    facts.facts["us-gaap"]!.ShareBasedCompensation = { units: { USD: [point(90, "2025-07-01", "2025-09-30", "2025-11-07")] } };
    if (!b.statements.cashflowQuarterly.ok) throw Error("fixture");
    const row = b.statements.cashflowQuarterly.value.data.rows[0]!;
    const admitted = admitStockCompensation({ ...row, stockBasedCompensation: 0 }, facts, "quarter", at).row;
    const reason = "vendor/SEC stockBasedCompensation conflict: vendor zero; field unavailable until reconciled";
    Object.assign(row, { stockBasedCompensation: null, fieldConflicts: { stockBasedCompensation: { usable: false, vendorValue: 0, secValue: 90 * M, reason, secEvidence: admitted.fieldProvenance?.stockBasedCompensation } } });
    b.gaps.push({ field: "statements.cashflow.2025-09-30.stockBasedCompensation", reason, severity: "warn" },
      { field: "statements.cashflow.2025-09-30.stockBasedCompensation", reason: "Separate evidence limitation", severity: "warn" });
    const out = withCashFlowSbcBasis(b);
    expect(out.gaps.some(g => g.reason === reason)).toBe(false);
    expect(out.gaps.some(g => g.reason === "Separate evidence limitation")).toBe(true);
    expect(b.gaps.some(g => g.reason === reason)).toBe(true);
  });
  it.each(["direct", "derived"])("recovers a %s compatible quarter while retaining the original refusal observation", kind => {
    const { facts } = fixture();
    const ps = kind === "direct" ? [point(103, "2026-01-01", "2026-03-31", "2026-05-08")]
      : [point(398, "2025-01-01", "2025-12-31", "2026-02-13"), point(293, "2025-01-01", "2025-09-30", "2025-11-07")];
    facts.facts["us-gaap"]!.ShareBasedCompensation = { units: { USD: ps } };
    const date = kind === "direct" ? "2026-03-31" : "2025-12-31", start = kind === "direct" ? "2026-01-01" : "2025-10-01", value = kind === "direct" ? 103 : 105;
    const row: FmpCashFlowRow = { date, periodStart: start, filingDate: ps[0]!.filed, reportedCurrency: "USD", stockBasedCompensation: 0 };
    // Fresh acquisition and replay of its own refusal must agree.
    const first = admitStockCompensation(row, facts, "quarter", at).row;
    expect(first.stockBasedCompensation).toBe(value * M);
    expect(first.fieldConflicts?.stockBasedCompensation?.vendorValue).toBe(0);
    const prior = { ...row, stockBasedCompensation: null, fieldConflicts: { stockBasedCompensation: { usable: false as const, vendorValue: 0, secValue: value * M,
      reason: "vendor/SEC stockBasedCompensation conflict: exact period; field unavailable until reconciled", secEvidence: first.fieldProvenance?.stockBasedCompensation } } };
    expect(admitStockCompensation(prior, facts, "quarter", at).row.stockBasedCompensation).toBe(value * M);
    prior.fieldConflicts.stockBasedCompensation.reason = "Independent refusal";
    expect(admitStockCompensation(prior, facts, "quarter", at).row.stockBasedCompensation).toBeNull();
  });
});
