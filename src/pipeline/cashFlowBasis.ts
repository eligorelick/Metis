import type { DataBundle } from "./types";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { admitStockCompensation, admitBalanceCash, admitQuarterlyCapex } from "@/edgar/financialEnrichment";

/** Reapply SBC and same-filing cash admission without modifying the snapshot. */
export function withCashFlowSbcBasis(bundle: DataBundle): DataBundle {
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  if (!facts) return bundle;
  const gaps = [...bundle.gaps];
  const superseded = new Map<string, string>();
  const family = (key: "cashflowAnnual" | "cashflowQuarterly") => {
    const input = bundle.statements[key];
    if (!input.ok) return input;
    const rows = input.value.data.rows.map(row => {
      const admitted = admitStockCompensation(row, facts, key === "cashflowAnnual" ? "annual" : "quarter", bundle.builtAt);
      gaps.push(...admitted.gaps);
      const prior = row.fieldConflicts?.stockBasedCompensation, current = admitted.row.fieldConflicts?.stockBasedCompensation;
      if (prior?.usable === false && current?.usable === true && current.resolution === "filed-family")
        superseded.set(`statements.cashflow.${row.date}.stockBasedCompensation`, prior.reason);
      if (key === "cashflowAnnual") return admitted.row;
      const capex = admitQuarterlyCapex(admitted.row, facts, bundle.statements.cashflowAnnual.ok ? bundle.statements.cashflowAnnual.value.data.rows : [], bundle.builtAt);
      gaps.push(...capex.gaps);
      return capex.row;
    });
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows } } };
  };
  const balance = (key: "balanceAnnual" | "balanceQuarterly") => {
    const input = bundle.statements[key];
    if (!input.ok) return input;
    const rows = input.value.data.rows.map(row => {
      const admitted = admitBalanceCash(row, facts, key === "balanceAnnual" ? "annual" : "quarter", bundle.builtAt);
      gaps.push(...admitted.gaps);
      const prior = row.fieldConflicts?.cashAndCashEquivalents, current = admitted.row.fieldConflicts?.cashAndCashEquivalents;
      if (prior?.usable === false && current?.usable === true && current.resolution === "filed-family")
        superseded.set(`statements.balance.${row.date}.cashAndCashEquivalents`, prior.reason);
      return admitted.row;
    });
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows } } };
  };
  const statements = { ...bundle.statements, cashflowAnnual: family("cashflowAnnual"), cashflowQuarterly: family("cashflowQuarterly"),
    balanceAnnual: balance("balanceAnnual"), balanceQuarterly: balance("balanceQuarterly") };
  return { ...bundle, statements, gaps: gaps.filter(gap => superseded.get(gap.field) !== gap.reason) };
}
