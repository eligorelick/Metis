import { computeCapital, type CapitalBalanceRow, type CapitalCashFlowRow, type CapitalIncomeRow, type CapitalResult } from "./capital";
import { deriveFcf } from "./financialValues";
import { resolveNetDebt } from "./netDebt";
import type { SectorRoute } from "@/types/core";

export interface CashFlowBridge {
  operatingCashFlow: number | null; cashCapitalExpenditure: number | null; standardizedFcf: number | null;
  financeLeasePrincipalPayments: number | null; leaseAdjustedFcf: number | null; issuerFcf: number | null; stockBasedCompensation: number | null;
  afterSbcStandardizedFcf: number | null; afterSbcIssuerFcf: number | null; definition: string;
}
export interface DebtBridge {
  totalDebtIncludingLeases: number | null; operatingLeases: number | null; financeLeases: number | null;
  cashAndShortTermInvestments: number | null; netDebtIncludingLeases: number | null; netDebtExcludingOperatingLeases: number | null;
}
export interface CurrentCapitalSnapshot {
  industrialMetricsApplicable?: boolean;
  basis: "ttm" | "annual"; asOf: string | null; periodStart: string | null; currency: string | null; fallbackReason: string | null;
  netDebtToEbitda: number | null; netDebt: number | null; ebitda: number | null;
  interestCoverage: number | null; fcfConversionBeforeSbc: number | null; sbcPctOfFcf: number | null;
  ebit?: number | null; interestExpense?: number | null; fcfBeforeSbc?: number | null; netIncome?: number | null;
  cashBridge: CashFlowBridge; debtBridge: DebtBridge;
}
const finite = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const sub = (a: number | null, b: number | null): number | null => a !== null && b !== null ? a - b : null;
export function cashFlowBridge(row: CapitalCashFlowRow | null): CashFlowBridge {
  const operatingCashFlow = finite(row?.operatingCashFlow), capex = finite(row?.capitalExpenditure);
  const standardizedFcf = deriveFcf(operatingCashFlow, capex);
  const principalRaw = finite(row?.financeLeasePrincipalPayments);
  const principal = principalRaw !== null && principalRaw >= 0 ? principalRaw : null;
  const issuer = finite(row?.issuerFreeCashFlow);
  const sbc = finite(row?.stockBasedCompensation);
  return { operatingCashFlow, cashCapitalExpenditure: capex, standardizedFcf, financeLeasePrincipalPayments: principal,
    leaseAdjustedFcf: sub(standardizedFcf, principal), issuerFcf: issuer, stockBasedCompensation: sbc, afterSbcStandardizedFcf: sub(standardizedFcf, sbc), afterSbcIssuerFcf: sub(issuer, sbc),
    definition: row?.issuerFreeCashFlowDefinition ?? "Standardized FCF = operating cash flow minus cash PP&E; lease-adjusted FCF additionally subtracts finance-lease principal when disclosed. Issuer convention must be checked before comparison. SBC is a separate economic adjustment; historical FCF is levered, forecast FCFF is unlevered.",
  };
}
export function debtBridge(row: CapitalBalanceRow | null): DebtBridge {
  const debt = finite(row?.totalDebt), operating = finite(row?.operatingLeaseLiability), finance = finite(row?.financeLeaseLiability);
  const combined = finite(row?.cashAndShortTermInvestments), cash = finite(row?.cashAndCashEquivalents), sti = finite(row?.shortTermInvestments);
  const liquidity = combined ?? (cash !== null && sti !== null ? cash + sti : null);
  const net = resolveNetDebt(row ?? {}).value;
  return { totalDebtIncludingLeases: debt, operatingLeases: operating, financeLeases: finance, cashAndShortTermInvestments: liquidity,
    netDebtIncludingLeases: net, netDebtExcludingOperatingLeases: sub(net, operating) };
}
function periodEndTime(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  // Date.parse rolls invalid February dates into March. A financial period must
  // retain the exact supplied calendar date, including for balance alignment.
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value ? time : null;
}
function yearStart(end: string | null): string | null {
  const time = periodEndTime(end);
  if (time === null) return null;
  const date = new Date(time);
  const day = date.getUTCDate(), month = date.getUTCMonth(), year = date.getUTCFullYear()-1;
  const lastDay = new Date(Date.UTC(year, month+1, 0)).getUTCDate();
  date.setUTCFullYear(year, month, Math.min(day,lastDay));
  date.setUTCDate(date.getUTCDate()+1);
  return date.toISOString().slice(0,10);
}

/** Receives only already-normalized, currency-compatible complete TTM windows. */
export function attachCurrentCapital(annual: CapitalResult, input: {
  income: CapitalIncomeRow | null; cashFlow: CapitalCashFlowRow | null; balance: CapitalBalanceRow | null;
  currency: string | null; annualCashFlow?: CapitalCashFlowRow | null; annualBalance?: CapitalBalanceRow | null;
  route?: SectorRoute;
}): CapitalResult {
  const { income, cashFlow, balance } = input;
  const usable = income !== null && cashFlow !== null && input.currency !== null && income.date === cashFlow.date &&
    (annual.asOf === null || income.date >= annual.asOf) && periodEndTime(income.date) !== null;
  const basis = usable ? "ttm" : "annual";
  const asOf = usable ? income.date : annual.asOf;
  const aligns = (date: string | null | undefined): boolean => {
    const dateTime = periodEndTime(date), anchorTime = periodEndTime(asOf);
    return dateTime !== null && anchorTime !== null && Math.abs(dateTime-anchorTime) <= 5*86400000;
  };
  // A stale balance cannot supply a current leverage numerator.
  const sameBalance = balance && aligns(balance.date) ? balance : null;
  const industrialMetricsApplicable = !["bank", "insurer", "reit-mortgage"].includes(input.route ?? "general");
  const snapshot = usable ? computeCapital([income], [cashFlow], sameBalance ? [sameBalance] : [], [], { price: null }, {route:input.route}) : annual;
  const bridgeRow = usable ? cashFlow : input.annualCashFlow && aligns(input.annualCashFlow.date) ? input.annualCashFlow : null;
  const bridgeBalance = usable ? sameBalance : input.annualBalance && aligns(input.annualBalance.date) ? input.annualBalance : null;
  const bridge = industrialMetricsApplicable ? cashFlowBridge(bridgeRow) : cashFlowBridge(null);
  if (!industrialMetricsApplicable) bridge.definition = "Industrial FCF, net debt/EBITDA and EBIT interest coverage are not applicable to this financial-company route.";
  const annualFcf = snapshot.fcf.series.find(row=>aligns(row.date));
  const netIncome = industrialMetricsApplicable && bridgeRow ? finite(bridgeRow.netIncome) ?? finite(annualFcf?.netIncome) : null;
  const fcf = bridge.standardizedFcf, sbc = bridge.stockBasedCompensation;
  const current: CurrentCapitalSnapshot = {
    industrialMetricsApplicable,
    basis, asOf, periodStart: yearStart(asOf), currency: input.currency,
    fallbackReason: usable ? null : "Complete, current, currency-compatible TTM income and cash-flow windows unavailable; using latest annual capital metrics. Cash/debt components with a different year are withheld rather than relabeled.",
    netDebtToEbitda: bridgeBalance ? snapshot.netDebtToEbitda.value : null, netDebt: bridgeBalance ? snapshot.netDebtToEbitda.netDebt : null, ebitda: snapshot.netDebtToEbitda.ebitda,
    ebit: snapshot.interestCoverage.ebit, interestExpense: snapshot.interestCoverage.interestExpense, fcfBeforeSbc:fcf, netIncome,
    interestCoverage: snapshot.interestCoverage.value,
    fcfConversionBeforeSbc: fcf !== null && netIncome !== null && netIncome > 0 ? fcf/netIncome : null,
    sbcPctOfFcf: fcf !== null && fcf > 0 && sbc !== null ? sbc/fcf*100 : null,
    cashBridge: bridge, debtBridge: debtBridge(industrialMetricsApplicable ? bridgeBalance : null),
  };
  return { ...annual, current };
}
