import { capitalizedInterestMisclassification } from "@/edgar/borrowingCosts";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { admitFiledInterestExpense } from "@/edgar/financialEnrichment";
import type { DataBundle } from "@/pipeline/types";

/** Calculation view only: original provider observations and stored bundles stay intact. */
export function withBorrowingCostBasis(bundle: DataBundle): DataBundle {
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const acquired = bundle.edgar?.companyFacts?.ok ? bundle.edgar.companyFacts.value.fetchedAt : null;
  if (!facts || !acquired || !Number.isFinite(Date.parse(acquired)) || Date.parse(acquired) > Date.parse(bundle.builtAt)) return bundle;
  const gaps = [...bundle.gaps];
  const family = (name: "incomeAnnual" | "incomeQuarterly") => {
    const input = bundle.statements[name];
    if (!input.ok) return input;
    const rows = input.value.data.rows.map(row => {
      if (typeof row.interestExpense !== "number" || row.interestExpense < 0 || row.fieldConflicts?.interestExpense?.usable === false ||
          !row.date || !row.reportedCurrency) return row;
      const admitted = admitFiledInterestExpense(row, facts, name === "incomeAnnual" ? "annual" : "quarter", bundle.builtAt);
      if (admitted.row !== row && admitted.row.fieldProvenance?.interestExpense) {
        gaps.push(...admitted.gaps);
        return admitted.row;
      }
      const refusal = capitalizedInterestMisclassification(facts, { end: row.date,
        periodStart: typeof row.periodStart === "string" ? row.periodStart : undefined, unit: row.reportedCurrency,
        value: row.interestExpense, frequency: name === "incomeAnnual" ? "annual" : "quarter", observedAt: acquired });
      if (!refusal) {
        gaps.push(...admitted.gaps);
        return admitted.row;
      }
      gaps.push({ field: `statements.income.${row.date}.interestExpense`, severity: "warn", reason: refusal.reason });
      return { ...row, interestExpense: undefined, fieldConflicts: { ...row.fieldConflicts,
        interestExpense: { usable: false, cause: "borrowing-cost-scope" as const, vendorValue: row.interestExpense, secValue: null, reason: refusal.reason, secEvidence: refusal.evidence } } };
    });
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows } } };
  };
  return { ...bundle, statements: { ...bundle.statements, incomeAnnual: family("incomeAnnual"), incomeQuarterly: family("incomeQuarterly") }, gaps };
}
