import type { DataBundle } from "@/pipeline/types";
import type { CapitalResult } from "./capital";
import type { CompanyRoute } from "@/types/core";
import type { FmpStatementRow } from "@/providers/fmp";
import { lenderDebtLines } from "@/edgar/debtPresentation";
import { filedBorrowingsAdmitted } from "@/edgar/financialEnrichment";

export const LENDER_DEBT_PERIMETER_LABEL = "Provider debt perimeter (includes payables to third-party loan owners)";

const day = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
/** Primary-statement rule; neither sector labels nor a negative CFO establish it. */
/**
 * `admittedBalances` are the report's balance rows after `admitDebtFields`. When the row at the filing's
 * date took the filed borrowings in place of the provider perimeter (D-234), the EV context and the
 * perimeter evidence say so (`filedDebt`); the provider label then names nothing the report shows.
 */
export function lenderCashFlowApplicability(bundle: DataBundle, route: CompanyRoute, admittedBalances: readonly FmpStatementRow[] = []): CompanyRoute["cashFlowApplicability"] {
  const registrant = bundle.edgar.registrant;
  const cutoff = bundle.builtAt.slice(0, 10);
  const sic = bundle.edgar.sic;
  if (route.base !== "general" || route.modelEligibility || !registrant || !day(cutoff) ||
    !["6141", "6153", "6159", "6162", "6163"].includes(sic ?? "") || registrant.sic !== sic || !/^\d{10}$/.test(registrant.cik10)) return undefined;
  const notes = [bundle.edgar.tenQNotes, bundle.edgar.tenKNotes].flatMap(s => s?.ok ? [s.value.data] : [])
    .filter(s => /^(?:10-Q|10-K)(?:\/A)?$/.test(s.form) && day(s.filingDate) && s.filingDate <= cutoff)
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  const source = notes[0];
  if (!source || !day(source.reportDate) || source.reportDate > source.filingDate || !/^\d{10}-\d{2}-\d{6}$/.test(source.accession)) return undefined;
  if ([bundle.edgar.latestTenQ, bundle.edgar.latestTenK].some(s => s?.ok && s.value.data.filingDate <= cutoff && s.value.data.filingDate > source.filingDate)) return undefined;
  const latestCashDate = [bundle.statements.cashflowAnnual, bundle.statements.cashflowQuarterly]
    .flatMap(s => s.ok ? s.value.data.rows : []).map(r => typeof r.date === "string" ? r.date : "").filter(d => day(d) && d <= cutoff).sort().at(-1);
  if (latestCashDate !== source.reportDate) return undefined;
  try {
    const url = new URL(source.documentUrl);
    if (url.protocol !== "https:" || !["www.sec.gov", "sec.gov"].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash ||
      !new RegExp(`^/Archives/edgar/data/${Number(registrant.cik10)}/${source.accession.replaceAll("-", "")}/[a-zA-Z0-9_.-]+\\.html?$`).test(url.pathname)) return undefined;
  } catch { return undefined; }
  const cash = (source.statementsText ?? "").split(/\bSTATEMENTS? OF CASH FLOWS\b/i)[1];
  const operating = cash ? /\bOperating activities:\s*([\s\S]*?)\bInvesting activities:/i.exec(cash)?.[1] : undefined;
  if (!operating || !/Net cash[^:]{0,80}\boperating activities\b/i.test(operating)) return undefined;
  const origination = /\bOriginations of loans held for sale\s*\(?\s*\$?\s*([\d,]+)/i.exec(operating);
  const sale = /\bProceeds from (?:loan sales(?:, net of repurchases)?|sales of loans(?: held for sale)?)\s*\(?\s*\$?\s*([\d,]+)/i.exec(operating);
  if (!origination || !sale || ![origination[1], sale[1]].every(v => Number.isFinite(Number(v!.replaceAll(",", ""))) && Number(v!.replaceAll(",", "")) > 0)) return undefined;
  // Retain EV only as context when the named filed components tie to the
  // provider debt perimeter at the same date. No industrial debt inference.
  const balance = [bundle.statements.balanceQuarterly, bundle.statements.balanceAnnual]
    .flatMap(s => s.ok ? s.value.data.rows : []).find(r => r.date === source.reportDate);
  const components = lenderDebtLines(source.statementsText);
  const sum = components.reduce((n, c) => n + c.value, 0);
  // D-234 (P7, P8): the admitted row at this date carries the filed borrowings plus the operating lease. A
  // bundle collected after D-234 stores that row already admitted, so the provider's own figure, which the
  // named lines must tie to, is the vendor total the admission kept beside it.
  const admitted = [...admittedBalances, ...(balance ? [balance] : [])].find(r => r.date === source.reportDate && filedBorrowingsAdmitted(r));
  const filedDebt = admitted && typeof admitted.totalDebt === "number" ? admitted.totalDebt : undefined;
  const providerDebt = admitted ? admitted.fieldConflicts?.totalDebt?.vendorValue : balance?.totalDebt;
  const debt = typeof providerDebt === "number" ? providerDebt : null;
  const lease = typeof balance?.operatingLeaseLiability === "number" ? balance.operatingLeaseLiability : 0;
  const borrowingComponents = components.filter(c => /^Debt,/i.test(c.name));
  const payables = components.filter(c => /^Payables to third-party loan owners$/i.test(c.name));
  const tied = components.length > 0 && debt !== null && Math.abs(sum - (debt - lease)) <= Math.max(1000, debt * 0.0001);
  const evDebtBasis = !tied ? undefined : filedDebt !== undefined
    ? `EV context only: debt is the filed ${borrowingComponents.map(c => `${c.name} ${c.value}`).join("; ")} (statement currency, ${source.reportDate}), plus the selected lease convention. The provider's debt figure also counted the filed ${payables.map(c => `${c.name} ${c.value}`).join("; ")}, which is not included. This is not industrial borrowing or a lender solvency measure.`
    : `EV context only: provider debt includes the filed ${components.map(c => `${c.name} ${c.value}`).join("; ")} (statement currency, ${source.reportDate}), plus the selected lease convention. This perimeter is not industrial borrowing or a lender solvency measure.`;
  const debtPerimeter = evDebtBasis && borrowingComponents.length === 3 && payables.length === 1 &&
    new Set(borrowingComponents.map(c => c.name.toLowerCase())).size === 3 && /^[A-Z]{3}$/.test(balance?.reportedCurrency ?? "")
    ? { label: LENDER_DEBT_PERIMETER_LABEL, borrowings: borrowingComponents.reduce((n, c) => n + c.value, 0), loanOwnerPayables: payables[0]!.value,
      components: borrowingComponents, currency: balance!.reportedCurrency!, source: source.documentUrl, ...(filedDebt !== undefined ? { filedDebt } : {}) } : undefined;
  return { status: "not-applicable", evDebtBasis, ...(debtPerimeter ? { debtPerimeter } : {}), asOf: source.reportDate, sourceIds: [source.documentUrl],
    reason: `Owner FCF, P/FCF, FCF yield, FCF conversion/growth and cash runway are not applicable: SIC ${sic} and the ${source.form} cash-flow statement for ${source.reportDate} place held-for-sale loan originations and loan-sale proceeds in operating activities. Warehouse and loan-owner funding is operating inventory finance; industrial EV/EBITDA, EV/Sales, net debt, net debt/EBITDA and interest coverage are not applicable. Capital adequacy is not modelled for non-bank lenders: industrial coverage and leverage do not measure solvency. Vendor gross margin is not a filed lender income-statement line. ROIC and ROIC-vs-WACC are not applicable because invested capital (debt + equity - cash) is undefined when debt funds operating inventory; ROTE is the capital-return convention. OCF less capex reflects loan inventory funding and turnover, not cash available to owners or an exhaustion clock. An FCF-based DCF (including reverse DCF and sensitivity) is not applicable. Filed OCF, capex, loan flows, earnings and book value remain source observations, subject to their own data checks. Source: ${source.documentUrl}.` };
}

/** Remove economic interpretations, retaining raw cash-flow bridge operands and SBC. */
export function applyLenderCapitalApplicability(capital: CapitalResult, reason: string): void {
  capital.fcf = { ...capital.fcf, latestFcf: null, latestFcfBeforeSbc: null, latestConversion: null, latestConversionBeforeSbc: null, basis: reason,
    series: capital.fcf.series.map(row => ({ ...row, fcf: null, fcfBeforeSbc: null, fcfConversion: null, fcfConversionBeforeSbc: null, note: reason })) };
  capital.sbc.pctOfFcf = null;
  capital.netDebtToEbitda = { ...capital.netDebtToEbitda, value: null, netDebt: null, note: reason };
  capital.interestCoverage = { ...capital.interestCoverage, value: null, note: reason };
  if (capital.current) {
    const current = capital.current;
    current.netDebt = null; current.netDebtToEbitda = null; current.interestCoverage = null;
    current.debtBridge = { ...current.debtBridge, netDebtIncludingLeases: null, netDebtExcludingOperatingLeases: null,
      netDebtIncludingDisclosedLeasePortion: null, netDebtExcludingDisclosedOperatingLeasePortion: null, compositionNote: reason };
    current.fcfBeforeSbc = null; current.fcfConversionBeforeSbc = null; current.sbcPctOfFcf = null;
    current.cashBridge = { ...current.cashBridge, standardizedFcf: null, leaseAdjustedFcf: null, issuerFcf: null, afterSbcStandardizedFcf: null, afterSbcIssuerFcf: null, definition: reason };
  }
  capital.notes.push(reason);
}
