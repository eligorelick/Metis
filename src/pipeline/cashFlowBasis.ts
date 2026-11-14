import type { DataBundle } from "./types";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { admitStockCompensation, admitBalanceCash, admitQuarterlyCapex, admitCashFlowNetIncome, admitZeroCapex, readmitFiledOperatingCashFlow, zeroCapexEntries, type ZeroCapexRefusal } from "@/edgar/financialEnrichment";
import { supplementTemporaryEquity, temporaryEquityFiledEnds, temporaryEquityRows } from "@/edgar/temporaryEquityEnrichment";
import { conflictCauseMatches } from "@/edgar/refusalCauseRead";

/** Reapply SBC, annual cash-flow net income (D-231), the cash-capex zero rule (D-239), the filed operating cash flow of a reconciled statement (D-252) and same-filing cash admission without modifying the snapshot. */
export function withCashFlowSbcBasis(bundle: DataBundle): DataBundle {
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  if (!facts) return bundle;
  const gaps = [...bundle.gaps];
  const superseded = new Map<string, string>();
  const zeroCapex: ZeroCapexRefusal[] = [];
  const annualIncome = bundle.statements.incomeAnnual.ok ? bundle.statements.incomeAnnual.value.data.rows : [];
  const family = (key: "cashflowAnnual" | "cashflowQuarterly") => {
    const input = bundle.statements[key];
    if (!input.ok) return input;
    const rows = input.value.data.rows.map(row => {
      const sbc = admitStockCompensation(row, facts, key === "cashflowAnnual" ? "annual" : "quarter", bundle.builtAt);
      gaps.push(...sbc.gaps);
      // D-239 (P7, P10): a provider zero for capital spending stands only as a filed zero for the row's own period.
      const admitted = admitZeroCapex(sbc.row, facts, key === "cashflowAnnual" ? "annual" : "quarter", bundle.builtAt);
      if (admitted.refusal) zeroCapex.push(admitted.refusal);
      const prior = row.fieldConflicts?.stockBasedCompensation, current = admitted.row.fieldConflicts?.stockBasedCompensation;
      if (prior?.usable === false && current?.usable === true && current.resolution === "filed-family")
        superseded.set(`statements.cashflow.${row.date}.stockBasedCompensation`, prior.reason);
      if (key === "cashflowAnnual") {
        // D-252 (P8): a stored operating cash-flow refusal whose filing's own cash-flow statement reconciles takes the filed figure.
        const operating = readmitFiledOperatingCashFlow(admitted.row, facts, "annual", bundle.builtAt);
        gaps.push(...operating.gaps);
        if (operating.superseded !== null) superseded.set(`statements.cashflow.${row.date}.operatingCashFlow`, operating.superseded);
        // D-231 (P8): the row's net income against the filer's own profit for that fiscal year.
        const profit = admitCashFlowNetIncome(operating.row, facts, annualIncome.find(income => income.date === row.date), bundle.builtAt);
        gaps.push(...profit.gaps);
        return profit.row;
      }
      const capex = admitQuarterlyCapex(admitted.row, facts, bundle.statements.cashflowAnnual.ok ? bundle.statements.cashflowAnnual.value.data.rows : [], bundle.builtAt);
      gaps.push(...capex.gaps);
      return capex.row;
    });
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows } } };
  };
  const balance = (key: "balanceAnnual" | "balanceQuarterly") => {
    const input = bundle.statements[key];
    if (!input.ok) return input;
    const temporary = input.value.data.rows.some(row => ["temporaryEquity", "temporaryEquityAttributableToParent", "temporaryEquityAttributableToNoncontrollingInterest"].some(field => {
      const conflict = row.fieldConflicts?.[field];
      return conflict?.usable === false && conflictCauseMatches(conflict, "vendorSecTemporaryEquity");
    }))
      ? temporaryEquityRows(facts, key === "balanceAnnual" ? "annual" : "quarter", bundle.builtAt) : null;
    const rows = input.value.data.rows.map(row => {
      const temporaryAdmission = temporary ? supplementTemporaryEquity(row, temporary, facts.cik, temporaryEquityFiledEnds(facts)) : { row, gaps: [] };
      gaps.push(...temporaryAdmission.gaps);
      const admitted = admitBalanceCash(temporaryAdmission.row, facts, key === "balanceAnnual" ? "annual" : "quarter", bundle.builtAt, [bundle.edgar?.tenKNotes, bundle.edgar?.tenQNotes].flatMap(s => s?.ok ? [s.value.data] : []));
      gaps.push(...admitted.gaps);
      for (const field of Object.keys(row.fieldConflicts ?? {})) {
        const prior = row.fieldConflicts?.[field], current = admitted.row.fieldConflicts?.[field];
        if (prior?.usable === false && current?.usable === true && current.resolution === "filed-family")
          superseded.set(`statements.balance.${row.date}.${field}`, prior.reason);
      }
      return admitted.row;
    });
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows } } };
  };
  const statements = { ...bundle.statements, cashflowAnnual: family("cashflowAnnual"), cashflowQuarterly: family("cashflowQuarterly"),
    balanceAnnual: balance("balanceAnnual"), balanceQuarterly: balance("balanceQuarterly") };
  return { ...bundle, statements, gaps: [...gaps.filter(gap => superseded.get(gap.field) !== gap.reason), ...zeroCapexEntries(zeroCapex)] };
}
