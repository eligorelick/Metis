import type { DataBundle } from "@/pipeline/types";
import type { CapitalResult } from "./capital";
import type { CompanyRoute } from "@/types/core";

const day = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
/** Primary-statement rule; neither sector labels nor a negative CFO establish it. */
export function lenderCashFlowApplicability(bundle: DataBundle, route: CompanyRoute): CompanyRoute["cashFlowApplicability"] {
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
  return { status: "not-applicable", asOf: source.reportDate, sourceIds: [source.documentUrl],
    reason: `Owner FCF, P/FCF, FCF yield, FCF conversion/growth and cash runway are not applicable: SIC ${sic} and the ${source.form} cash-flow statement for ${source.reportDate} place held-for-sale loan originations and loan-sale proceeds in operating activities. OCF less capex reflects loan inventory funding and turnover, not cash available to owners or an exhaustion clock. An FCF-based DCF (including reverse DCF and sensitivity) is not applicable. Filed OCF, capex, loan flows, earnings and book value remain source observations, subject to their own data checks. Source: ${source.documentUrl}.` };
}

/** Remove economic interpretations, retaining raw cash-flow bridge operands and SBC. */
export function applyLenderCapitalApplicability(capital: CapitalResult, reason: string): void {
  capital.fcf = { ...capital.fcf, latestFcf: null, latestFcfBeforeSbc: null, latestConversion: null, latestConversionBeforeSbc: null, basis: reason,
    series: capital.fcf.series.map(row => ({ ...row, fcf: null, fcfBeforeSbc: null, fcfConversion: null, fcfConversionBeforeSbc: null, note: reason })) };
  capital.sbc.pctOfFcf = null;
  if (capital.current) {
    const current = capital.current;
    current.fcfBeforeSbc = null; current.fcfConversionBeforeSbc = null; current.sbcPctOfFcf = null;
    current.cashBridge = { ...current.cashBridge, standardizedFcf: null, leaseAdjustedFcf: null, issuerFcf: null, afterSbcStandardizedFcf: null, afterSbcIssuerFcf: null, definition: reason };
  }
  capital.notes.push(reason);
}
