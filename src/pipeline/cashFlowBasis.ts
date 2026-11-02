import type { DataBundle } from "./types";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { admitStockCompensation } from "@/edgar/financialEnrichment";

/** Reapply SBC admission to retained vendor rows without modifying the snapshot. */
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
  return { ...bundle, statements: { ...bundle.statements, cashflowAnnual: family("cashflowAnnual"), cashflowQuarterly: family("cashflowQuarterly") }, gaps };
}
