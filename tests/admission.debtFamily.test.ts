/**
 * D-254 (P13, P7): the debt family is admitted once per run by one shared
 * preparation (`@/pipeline/admission/debtFamily`), which decides nothing itself.
 *
 * Shapes covered. A balance row whose noncurrent-only operating lease total was
 * refused (the filing shape of the public EXPE 10-Q 0001324424-26-000053, the
 * case the lease-refusal reversal D-186 exists for), a compatible control (a
 * row with complete filed borrowings and no lease line, where the reversal has
 * nothing to restore) and an unrelated shape (a bundle with no confirmed SEC
 * facts, where nothing is admitted). No vendor data.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompanyFacts } from "@/edgar/xbrl";
import { DEBT_FAMILY_FIELDS, debtFamilyAdmission } from "@/pipeline/admission/debtFamily";
import { restoreLeaseFinancingProvenance } from "@/pipeline/stageB/leaseScope";
import type { DataBundle } from "@/pipeline/types";
import type { FmpBalanceSheetRow } from "@/providers/fmp";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

const state = vi.hoisted(() => ({ decided: 0 }));

vi.mock("@/edgar/financialEnrichment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/edgar/financialEnrichment")>();
  return {
    ...actual,
    admitDebtFields: (...args: Parameters<typeof actual.admitDebtFields>) => {
      state.decided += 1;
      return actual.admitDebtFields(...args);
    },
  };
});

const OBSERVED_AT = "2026-11-03T20:00:00Z";
const FILING = { end: "2026-06-30", accn: "0001324424-26-000053", filed: "2026-08-06", form: "10-Q" };
const LEASE_REFUSAL = "incomplete debt carrying value: the vendor lease line 226M USD is the 10-Q filing's noncurrent lease liabilities, but the filing establishes no total operating-lease liability; total debt and net debt are withheld";

/** The refused noncurrent-only operating lease total, with every borrowing stated in one filing. */
function partialLeaseCase(): { row: FmpBalanceSheetRow; facts: CompanyFacts } {
  const concept = (val: number) => ({ units: { USD: [{ ...FILING, val }] } });
  const facts: CompanyFacts = { cik: 1324424, entityName: "Example", facts: { "us-gaap": {
    LongTermDebtCurrent: concept(0), LongTermDebtNoncurrent: concept(5_459_000_000), OperatingLeaseLiabilityNoncurrent: concept(226_000_000),
  } } };
  const row = { date: FILING.end, cik: "0001324424", reportedCurrency: "USD", shortTermDebt: 0, longTermDebt: 5_459_000_000,
    capitalLeaseObligations: 226_000_000, capitalLeaseObligationsCurrent: 0, operatingLeaseLiability: null, totalDebt: null,
    cashAndCashEquivalents: 6_682_000_000, netDebt: null,
    fieldConflicts: { totalDebt: { vendorValue: 5_685_000_000, secValue: null, usable: false, reason: LEASE_REFUSAL },
      netDebt: { vendorValue: -997_000_000, secValue: null, usable: false, reason: LEASE_REFUSAL } } } as unknown as FmpBalanceSheetRow;
  return { row, facts };
}

/** Control: complete filed borrowings, no lease line. */
function completeDebtCase(): { row: FmpBalanceSheetRow; facts: CompanyFacts } {
  const point = { end: "2026-06-30", accn: "0000000042-26-000007", filed: "2026-08-01", form: "10-Q" };
  const concept = (val: number) => ({ units: { USD: [{ ...point, val }] } });
  const facts: CompanyFacts = { cik: 42, entityName: "Control", facts: { "us-gaap": {
    LongTermDebtCurrent: concept(100_000_000), LongTermDebtNoncurrent: concept(900_000_000),
  } } };
  const row = { date: point.end, cik: "0000000042", reportedCurrency: "USD", shortTermDebt: 100_000_000, longTermDebt: 900_000_000,
    totalDebt: 1_000_000_000, cashAndCashEquivalents: 250_000_000, netDebt: 750_000_000 } as unknown as FmpBalanceSheetRow;
  return { row, facts };
}

function bundleFor(facts: CompanyFacts | null, builtAt = OBSERVED_AT): DataBundle {
  const bundle = { ...completeCurrencyBundle({ symbol: "TEST", sic: "7372" }), builtAt };
  return facts === null ? bundle : withIssuerFacts(bundle, facts);
}

const reader = (convention: "bundle-statement-row" | "stage-b-balance-row", currency: string | null = "USD") =>
  ({ statement: "balanceQuarterly" as const, convention, currency });

afterEach(() => { state.decided = 0; });

describe("D-254: one admission of a balance row per run", () => {
  it("decides a row once for two readers that present the same content, and gives each its own copy", () => {
    const { row, facts } = partialLeaseCase();
    const stageB = debtFamilyAdmission(bundleFor(facts));
    // A second reader builds its own view of the bundle and its own row object.
    const payload = debtFamilyAdmission(bundleFor(facts));
    const first = stageB.admit(row, reader("stage-b-balance-row"));
    const second = payload.admit(structuredClone(row), reader("bundle-statement-row"));
    expect(state.decided).toBe(1);
    expect(payload.counts()).toEqual({ presented: 2, decided: 1 });
    expect(second.row).toEqual(first.row);
    expect(second.admitted.fields).toEqual(first.admitted.fields);
    expect(second.admitted.gaps).toEqual(first.admitted.gaps);
    // The decision is one; the identities say whose row each was.
    expect(first.admitted.identity.convention).toBe("stage-b-balance-row");
    expect(second.admitted.identity.convention).toBe("bundle-statement-row");
    // Nothing is shared between callers or with the kept decision.
    first.admitted.gaps.push({ field: "written.by.caller", reason: "x", severity: "info" });
    first.row.fieldProvenance!.totalDebt!.tags.push("written-by-caller");
    const third = payload.admit(structuredClone(row), reader("bundle-statement-row"));
    expect(third.row).toEqual(second.row);
    expect(third.admitted.gaps).toEqual(second.admitted.gaps);
    expect(state.decided).toBe(1);
  });

  it("finds a decision only by the exact inputs that produced it", () => {
    const { row, facts } = partialLeaseCase();
    const admission = debtFamilyAdmission(bundleFor(facts));
    admission.admit(row, reader("bundle-statement-row"));
    expect(state.decided).toBe(1);
    // Another currency, another cutoff, other facts and another row content each decide again.
    admission.admit(row, reader("bundle-statement-row", "EUR"));
    expect(state.decided).toBe(2);
    debtFamilyAdmission(bundleFor(facts, "2026-11-04T20:00:00Z")).admit(row, reader("bundle-statement-row"));
    expect(state.decided).toBe(3);
    debtFamilyAdmission(bundleFor(structuredClone(facts))).admit(row, reader("bundle-statement-row"));
    expect(state.decided).toBe(4);
    admission.admit({ ...row, cashAndCashEquivalents: 1 }, reader("bundle-statement-row"));
    expect(state.decided).toBe(5);
    // The same cells in another order are another row: the admitted row keeps its input's order.
    admission.admit(Object.fromEntries(Object.entries(row).reverse()) as FmpBalanceSheetRow, reader("bundle-statement-row"));
    expect(state.decided).toBe(6);
    // A row written in place after it was presented is a different row: nothing stale is served.
    row.longTermDebt = 5_000_000_000;
    admission.admit(row, reader("bundle-statement-row"));
    expect(state.decided).toBe(7);
  });

  it("returns the caller's own row when the admission leaves it untouched, and never the kept one when it does not", () => {
    const { row, facts } = completeDebtCase();
    const admission = debtFamilyAdmission(bundleFor(facts));
    const untouched = admission.admit(row, reader("bundle-statement-row", null));
    expect(untouched.row).toBe(row);
    const copy = structuredClone(row);
    expect(admission.admit(copy, reader("bundle-statement-row", null)).row).toBe(copy);
    const changedCase = partialLeaseCase();
    const changing = debtFamilyAdmission(bundleFor(changedCase.facts));
    const a = changing.admit(changedCase.row, reader("bundle-statement-row"));
    const b = changing.admit(changedCase.row, reader("bundle-statement-row"));
    expect(a.row).not.toBe(changedCase.row);
    expect(b.row).not.toBe(a.row);
    expect(b.row).toEqual(a.row);
  });

  it("carries what the decision is about, and no cell outside the family", () => {
    const { row, facts } = completeDebtCase();
    const bundle = bundleFor(facts);
    const result = debtFamilyAdmission(bundle).admit(row, reader("stage-b-balance-row"));
    expect(result.admitted.identity).toEqual({
      issuer: { symbol: "TEST", cik: 42 }, statement: "balanceQuarterly",
      source: bundle.statements.balanceQuarterly.ok ? bundle.statements.balanceQuarterly.value.source : null,
      periodEnd: "2026-06-30", fiscalYear: null, fiscalPeriod: null, currency: "USD", observedAt: OBSERVED_AT,
      convention: "stage-b-balance-row", debtBasis: "retained",
    });
    expect(Object.keys(result.admitted.fields).sort()).toEqual([...DEBT_FAMILY_FIELDS].sort());
    expect(Object.keys(result.admitted).sort()).toEqual(["admissions", "fields", "gaps", "identity"]);
    expect(result.admitted.fields.totalDebt.value).toBe(result.row.totalDebt);
  });

  it("admits nothing without confirmed SEC facts: the row passes through", () => {
    const { row } = completeDebtCase();
    const admission = debtFamilyAdmission(bundleFor(null));
    const result = admission.admit(row, reader("bundle-statement-row"));
    expect(admission.issuer).toBeNull();
    expect(result.row).toBe(row);
    expect(result.admitted.identity.issuer).toEqual({ symbol: "TEST", cik: null });
    expect(result.admitted.gaps).toEqual([]);
    expect(state.decided).toBe(0);
    expect(admission.counts()).toEqual({ presented: 0, decided: 0 });
  });
});

describe("D-254: the lease-refusal reversal stays Stage B's convention (D-186)", () => {
  it("the same balance row is decided differently on the two readers' rows, and each decision names its convention", () => {
    const { row, facts } = partialLeaseCase();
    const admission = debtFamilyAdmission(bundleFor(facts));
    // The payload's statement extract presents the row as the bundle carries it.
    const asCarried = admission.admit(row, reader("bundle-statement-row"));
    // Stage B restores the refused operating portion first (its rule stays in leaseScope.ts), then presents the row.
    const restored = restoreLeaseFinancingProvenance(row, facts, OBSERVED_AT);
    const stageB = admission.admit(restored, reader("stage-b-balance-row"));
    expect(state.decided).toBe(2);
    // Both readers hold the same total debt.
    expect(asCarried.admitted.fields.totalDebt.value).toBe(5_685_000_000);
    expect(stageB.admitted.fields.totalDebt.value).toBe(5_685_000_000);
    // As carried, the admission completes the row from the one filing and writes net debt.
    expect(asCarried.admitted.fields.totalDebt.provenance?.calculation).toBe("same-filing-debt-completed");
    expect(asCarried.admitted.fields.netDebt.value).toBe(-997_000_000);
    expect(asCarried.admitted.fields.vendorNetDebt.value).toBe(-997_000_000);
    expect(asCarried.admitted.fields.financeLeaseLiability.value).toBe(0);
    // On Stage B's row the reversal already restored the total, so the admission completes nothing:
    // the total carries the reversal's plain filing tags and net debt stays empty on the row.
    expect(stageB.admitted.fields.totalDebt.provenance?.calculation).toBeUndefined();
    expect(stageB.admitted.fields.totalDebt.provenance?.tags).toEqual(["us-gaap/LongTermDebtCurrent", "us-gaap/LongTermDebtNoncurrent", "us-gaap/OperatingLeaseLiabilityNoncurrent"]);
    expect(stageB.admitted.fields.netDebt.value).toBeNull();
    expect(stageB.admitted.fields.vendorNetDebt.value).toBeUndefined();
    expect(stageB.admitted.fields.financeLeaseLiability.value).toBeUndefined();
    expect(stageB.admitted.fields.totalDebt.conflict).toBeUndefined();
    expect(asCarried.admitted.fields.totalDebt.conflict).toBeUndefined();
  });

  it("control: a row the reversal has nothing to restore is one decision under both conventions", () => {
    const { row, facts } = completeDebtCase();
    const admission = debtFamilyAdmission(bundleFor(facts));
    const asCarried = admission.admit(row, reader("bundle-statement-row"));
    const restored = restoreLeaseFinancingProvenance(row, facts, OBSERVED_AT);
    expect(restored).toBe(row);
    const stageB = admission.admit(restored, reader("stage-b-balance-row"));
    expect(state.decided).toBe(1);
    expect(stageB.admitted.fields).toEqual(asCarried.admitted.fields);
  });
});
