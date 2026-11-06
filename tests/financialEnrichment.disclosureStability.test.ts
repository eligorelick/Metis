import { describe, expect, it } from "vitest";
import { admitDebtFields, enrichFinancialFields } from "@/edgar/financialEnrichment";
import { classifyLeaseEvidence, leaseDebtScopeRefusal, leaseEvidenceNote } from "@/pipeline/stageB/leaseScope";
import { debtBridge } from "@/pipeline/stageB/currentCapital";
import { runStageB } from "@/pipeline/compute";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";
import { companyFacts, enriched as evidence, M, OBSERVED, Q2 } from "./helpers/amzn51LeaseShape";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

const context = { cutoff: OBSERVED, acquiredAt: OBSERVED };
const partialFacts = () => companyFacts({ [Q2]: {
  LongTermDebtCurrent: 4, LongTermDebtNoncurrent: 100, OperatingLeaseLiabilityNoncurrent: 18,
} });
const vendor = (overrides: Partial<FmpBalanceSheetRow> = {}): FmpBalanceSheetRow => ({
  cik: "42", date: Q2, reportedCurrency: "USD", shortTermDebt: 4 * M, longTermDebt: 100 * M,
  capitalLeaseObligations: 18 * M, totalDebt: 122 * M, cashAndCashEquivalents: 10 * M, netDebt: 112 * M,
  ...overrides,
});
const sourced = (rows: FmpBalanceSheetRow[]): FetchResult<FmpPayload<FmpBalanceSheetRow>> => ({ ok: true,
  value: { source: "fmp", endpoint: "synthetic balance", asOf: Q2, fetchedAt: OBSERVED, data: { rows, raw: rows } },
});
const missing: FetchResult<FmpPayload<FmpCashFlowRow>> = { ok: false, gap: { field: "test", reason: "not needed", severity: "info" } };
function enriched(input: FetchResult<FmpPayload<FmpBalanceSheetRow>>, facts: CompanyFacts) {
  const result = enrichFinancialFields(input, missing, facts, "quarter", OBSERVED);
  if (!result.balance.ok) throw new Error("Missing synthetic balance");
  return { ...result, balance: result.balance, row: result.balance.value.data.rows[0]! };
}
const classify = (row: FmpBalanceSheetRow) => classifyLeaseEvidence({ ...row, leaseEvidenceContext: context });
function numericLeaves(value: unknown, path = "", leaves: Record<string, unknown> = {}): Record<string, unknown> {
  if (value === null || typeof value === "number" || typeof value === "boolean") leaves[path] = value;
  else if (typeof value === "object") for (const [key, child] of Object.entries(value)) {
    if (key !== "leaseEvidence") numericLeaves(child, `${path}.${key}`, leaves);
  }
  return leaves;
}

describe("enrichment retains the evidence scope used by disclosure consumers", () => {
  const impossibleMaturities: Partial<Record<"current" | "noncurrent" | "total", number>>[] = [
    { current: 25 }, { noncurrent: 25 }, { current: 5, noncurrent: 14 }, { current: 1, total: 0 },
  ];
  it.each(impossibleMaturities.flatMap(components => (["Operating", "Finance"] as const).map(prefix => [prefix, components] as const)))(
    "does not certify contradictory %s lease maturities %j", (prefix, components) => {
      const other = prefix === "Operating" ? "Finance" : "Operating";
      const facts = companyFacts({ [Q2]: { LongTermDebtCurrent: 4, LongTermDebtNoncurrent: 100,
        [`${prefix}LeaseLiability`]: components.total ?? 20,
        ...("current" in components ? { [`${prefix}LeaseLiabilityCurrent`]: components.current! } : {}),
        ...("noncurrent" in components ? { [`${prefix}LeaseLiabilityNoncurrent`]: components.noncurrent! } : {}),
        [`${other}LeaseLiabilityCurrent`]: 1, [`${other}LeaseLiabilityNoncurrent`]: 5 } });
      // Exercise both an omitted family and the older noncurrent-line entry
      // point; prefilled complete amounts would bypass the actual repair.
      const lease = components.noncurrent !== undefined ? components.noncurrent + 5 : components.total ?? 20;
      const row = vendor({ capitalLeaseObligations: lease * M,
        totalDebt: (104 + lease) * M, netDebt: (94 + lease) * M });
      const frozen = JSON.stringify({ row, facts });
      const direct = admitDebtFields(row, facts, "USD", OBSERVED).row;
      const acquired = enriched(sourced([row]), facts).row;
      const repeated = enriched(sourced([acquired]), facts).row;
      for (const out of [direct, acquired, repeated]) {
        const family = prefix === "Operating" ? "operating" : "finance";
        expect(classify(out)[family].coverage, `${prefix} ${JSON.stringify(components)}`).not.toBe("complete");
        expect(out.fieldProvenance?.totalDebt?.calculation).not.toBe("same-filing-debt-completed");
      }
      expect(JSON.stringify({ row, facts })).toBe(frozen);
    });

  // Copying the debt composition's union/calculation onto a filed lease field
  // must fail these assertions: the consumer cannot recognize that evidence.
  it.each([0, 4])("retains noncurrent-only operating evidence beside %sM current financing debt", current => {
    const facts = companyFacts({ [Q2]: { LongTermDebtCurrent: current, LongTermDebtNoncurrent: 100, OperatingLeaseLiabilityNoncurrent: 18 } });
    const original = sourced([vendor({ shortTermDebt: current * M, totalDebt: (118 + current) * M, netDebt: (108 + current) * M })]);
    const frozen = JSON.stringify(original);
    const once = enriched(original, facts);
    const twice = enriched(once.balance, facts);
    for (const row of [once.row, twice.row]) {
      expect(classify(row)).toMatchObject({ operating: { coverage: "noncurrent-only", verifiedZero: false },
        finance: { coverage: "unverified", verifiedZero: false }, combined: { coverage: "partial", verifiedZero: false } });
      expect(row).toMatchObject({ totalDebt: (118 + current) * M, netDebt: (108 + current) * M,
        operatingLeaseLiability: 18 * M, financeLeaseLiability: 0 });
      expect(row.fieldProvenance?.totalDebt?.calculation).toBe("same-filing-debt-completed");
      expect(row.fieldProvenance?.financeLeaseLiability).toBeUndefined();
      expect(leaseDebtScopeRefusal(row, false)).toBeNull();
      expect(leaseDebtScopeRefusal(row, true)).toMatch(/current portion is unverified/);
      const bridge = debtBridge({ ...row, date: Q2, leaseEvidenceContext: context });
      expect(bridge).toMatchObject({ totalDebtIncludingLeases: null, operatingLeasesNoncurrent: 18 * M,
        debtIncludingDisclosedLeasePortion: (118 + current) * M });
      expect(leaseEvidenceNote({ ...row, leaseEvidenceContext: context }, { removed: 18 * M })).toMatch(/noncurrent-only.*Combined lease coverage is partial/);
    }
    expect(JSON.stringify(original)).toBe(frozen);
    expect(once.balance.value.data.raw).toBe(original.ok && original.value.data.raw);
  });

  it("keeps complete lease-field evidence separate from the calculated debt composition", () => {
    const facts = companyFacts({ [Q2]: { LongTermDebtCurrent: 4, LongTermDebtNoncurrent: 100,
      OperatingLeaseLiability: 20, OperatingLeaseLiabilityCurrent: 2, OperatingLeaseLiabilityNoncurrent: 18,
      FinanceLeaseLiabilityCurrent: 1, FinanceLeaseLiabilityNoncurrent: 5 } });
    const once = enriched(sourced([vendor({ capitalLeaseObligations: 20 * M, totalDebt: 124 * M })]), facts);
    const twice = enriched(once.balance, facts);
    for (const row of [once.row, twice.row]) {
      expect(row).toMatchObject({ totalDebt: 130 * M, netDebt: 120 * M, operatingLeaseLiability: 20 * M, financeLeaseLiability: 6 * M });
      expect(classify(row)).toMatchObject({ operating: { coverage: "complete" }, finance: { coverage: "complete" } });
      expect(row.fieldProvenance?.totalDebt?.calculation).toBe("same-filing-debt-completed");
      expect(leaseDebtScopeRefusal(row, true)).toBeNull();
    }
  });

  it.each(["missing", "other-currency", "other-period", "future-filing", "other-issuer"])("does not invent operating scope for %s evidence", defect => {
    const facts = partialFacts();
    const concept = facts.facts["us-gaap"]!.OperatingLeaseLiabilityNoncurrent as { units: Record<string, Record<string, unknown>[]> };
    if (defect === "missing") delete facts.facts["us-gaap"]!.OperatingLeaseLiabilityNoncurrent;
    if (defect === "other-currency") { concept.units.EUR = concept.units.USD!; delete concept.units.USD; }
    if (defect === "other-period") concept.units.USD![0]!.end = "2026-03-31";
    if (defect === "future-filing") concept.units.USD![0]!.filed = "2026-12-01";
    if (defect === "other-issuer") facts.cik = 99;
    const out = enriched(sourced([vendor()]), facts);
    expect(classify(out.row)).toMatchObject({ operating: { coverage: "unverified", verifiedZero: false }, combined: { coverage: "unverified" } });
    expect(out.row.operatingLeaseLiability).toBeUndefined();
  });

  it("does not treat a missing finance maturity as cancellable operating debt", () => {
    const facts = companyFacts({ [Q2]: { LongTermDebtCurrent: 4, LongTermDebtNoncurrent: 100,
      OperatingLeaseLiability: 20, OperatingLeaseLiabilityCurrent: 2,
      OperatingLeaseLiabilityNoncurrent: 18, FinanceLeaseLiabilityNoncurrent: 6 } });
    const out = enriched(sourced([vendor({ capitalLeaseObligations: 24 * M, totalDebt: 128 * M,
      financeLeaseLiability: 6 * M, fieldProvenance: { financeLeaseLiability: evidence(Q2, "FinanceLeaseLiabilityNoncurrent") } })]), facts);
    expect(out.row.totalDebt).toBeNull();
    expect(out.row.fieldConflicts?.totalDebt?.usable).toBe(false);
    expect(out.admissions).toEqual([]);
    expect(leaseDebtScopeRefusal(out.row, false)).toMatch(/Finance lease liability is noncurrent only/);
  });

  it("keeps Stage B numeric results and qualifications stable when acquisition completes a retained partial lease first", () => {
    const bundle = completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
    const points: Record<string, Record<string, number>> = {};
    for (const family of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (!family.ok) throw new Error("Missing synthetic balance");
      for (const row of family.value.data.rows) {
        points[row.date!] = { LongTermDebtCurrent: 4, LongTermDebtNoncurrent: 100, OperatingLeaseLiabilityNoncurrent: 18 };
        Object.assign(row, { cik: "42", shortTermDebt: 4 * M, longTermDebt: 100 * M, capitalLeaseObligations: 18 * M,
          operatingLeaseLiability: 18 * M, financeLeaseLiability: 0, totalDebt: null, netDebt: null,
          fieldProvenance: {}, fieldConflicts: { totalDebt: { usable: false, vendorValue: 122 * M, secValue: null,
            reason: "incomplete debt carrying value: the vendor lease line 18M but no total operating-lease liability" } } });
      }
    }
    const facts = companyFacts(points, "2026-05-01");
    withIssuerFacts(bundle, facts);
    const frozen = JSON.stringify(bundle);
    const direct = runStageB(bundle, { evIncludeLeases: false });
    const statements = { ...bundle.statements };
    for (const key of ["balanceAnnual", "balanceQuarterly"] as const) {
      statements[key] = enrichFinancialFields(statements[key], missing, facts,
        key === "balanceAnnual" ? "annual" : "quarter", bundle.builtAt).balance;
    }
    const afterAcquisition = runStageB({ ...bundle, statements }, { evIncludeLeases: false });
    // Finite/null leaves catch changed financial outputs, fair values, targets,
    // scores and availability; descriptions are checked independently below.
    expect(numericLeaves(afterAcquisition)).toEqual(numericLeaves(direct));
    expect(afterAcquisition.scores.qualification).toEqual(direct.scores.qualification);
    expect(afterAcquisition.fairValue.currentUse).toEqual(direct.fairValue.currentUse);
    expect(afterAcquisition.capital.current?.debtBridge.leaseEvidence?.operating.coverage).toBe("noncurrent-only");
    expect(afterAcquisition.capital.current?.debtBridge.leaseEvidence?.combined.coverage).toBe("partial");
    expect(afterAcquisition.capital.current?.debtBridge.leaseScopeNote).toMatch(/current portion is unverified/);
    expect(JSON.stringify(bundle)).toBe(frozen);
  });
});

describe("repeated debt admission retains established refusal evidence", () => {
  // A generic failed-composition attempt must not replace the independently
  // established positive current-debt fact when the total is already null.
  it("keeps the specific current-debt cause through acquisition and repeated Stage B admission", () => {
    const facts = companyFacts({ [Q2]: { LongTermDebtCurrent: 4, LongTermDebtNoncurrent: 100,
      OperatingLeaseLiability: 20, OperatingLeaseLiabilityCurrent: 2, OperatingLeaseLiabilityNoncurrent: 18,
      FinanceLeaseLiability: 6, FinanceLeaseLiabilityCurrent: 1, FinanceLeaseLiabilityNoncurrent: 5 } });
    const op = facts.facts["us-gaap"]!.OperatingLeaseLiability as { units: { USD: Record<string, unknown>[] } };
    op.units.USD.push({ ...op.units.USD[0], val: 21 * M, accn: "0000000042-26-000099", filed: "2026-09-01" });
    // Recorded refusals carry null although the provider input type is optional-number.
    const row = vendor({ shortTermDebt: 0, capitalLeaseObligations: 20 * M, totalDebt: null as never,
      operatingLeaseLiability: 21 * M, financeLeaseLiability: 6 * M,
      fieldConflicts: { totalDebt: { usable: false, vendorValue: 120 * M, secValue: null,
        reason: "incomplete debt carrying value: same-filing completion refused: current debt or vendor composition cannot be reconciled" } } });
    const original = JSON.stringify(row);
    const direct = admitDebtFields(row, facts, "USD", OBSERVED).row;
    const acquired = enriched(sourced([row]), facts).row;
    const repeated = admitDebtFields(acquired, facts, "USD", OBSERVED).row;
    const third = admitDebtFields(repeated, facts, "USD", OBSERVED).row;
    for (const out of [direct, acquired, repeated, third]) {
      expect(out).toMatchObject({ totalDebt: null, netDebt: null, shortTermDebt: 0, longTermDebt: 100 * M, capitalLeaseObligations: 20 * M });
      expect(out.fieldConflicts?.totalDebt).toMatchObject({ usable: false, vendorValue: 120 * M });
      expect(out.fieldConflicts?.totalDebt?.reason).toMatch(/same-period filing tags current debt \(LongTermDebtCurrent 4M\)/);
      expect(out.fieldConflicts?.netDebt?.reason).toBe(out.fieldConflicts?.totalDebt?.reason);
    }
    expect(repeated.fieldConflicts?.totalDebt?.reason).toBe(direct.fieldConflicts?.totalDebt?.reason);
    expect(JSON.stringify(row)).toBe(original);
  });

  it("retains a generic composition refusal when no specific current-debt fact exists", () => {
    const facts = companyFacts({ [Q2]: { LongTermDebtNoncurrent: 100, OperatingLeaseLiability: 20,
      OperatingLeaseLiabilityCurrent: 2, OperatingLeaseLiabilityNoncurrent: 18,
      FinanceLeaseLiability: 6, FinanceLeaseLiabilityCurrent: 1, FinanceLeaseLiabilityNoncurrent: 5 } });
    const out = admitDebtFields(vendor({ shortTermDebt: 0, capitalLeaseObligations: 20 * M, totalDebt: 120 * M }), facts, "USD", OBSERVED).row;
    expect(out.totalDebt).toBeNull();
    expect(out.fieldConflicts?.totalDebt?.reason).toMatch(/same-filing completion refused/);
    expect(out.fieldConflicts?.totalDebt?.reason).not.toMatch(/filing tags current debt/);
  });
});
