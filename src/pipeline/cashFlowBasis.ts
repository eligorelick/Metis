import type { DataBundle } from "./types";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { admitStockCompensation, admitBalanceCash } from "@/edgar/financialEnrichment";

/** Reapply SBC and same-filing cash admission without modifying the snapshot. */
export function withCashFlowSbcBasis(bundle: DataBundle): DataBundle {
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  if (!facts) return bundle;
  const gaps = [...bundle.gaps];
  const family = (key: "cashflowAnnual" | "cashflowQuarterly") => {
    const input = bundle.statements[key];
    if (!input.ok) return input;
    const rows = input.value.data.rows.map(row => {
      const admitted = admitStockCompensation(row, facts, key === "cashflowAnnual" ? "annual" : "quarter", bundle.builtAt);
      gaps.push(...admitted.gaps);
      return admitted.row;
    });
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows } } };
  };
  const balance = (key: "balanceAnnual" | "balanceQuarterly") => {
    const input = bundle.statements[key];
    if (!input.ok) return input;
    const rows = input.value.data.rows.map(row => {
      const admitted = admitBalanceCash(row, facts, key === "balanceAnnual" ? "annual" : "quarter", bundle.builtAt);
      gaps.push(...admitted.gaps);
      return admitted.row;
    });
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows } } };
  };
  return { ...bundle, statements: { ...bundle.statements, cashflowAnnual: family("cashflowAnnual"), cashflowQuarterly: family("cashflowQuarterly"),
    balanceAnnual: balance("balanceAnnual"), balanceQuarterly: balance("balanceQuarterly") }, gaps };
}
