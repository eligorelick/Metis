import { describe, it, expect } from 'vitest';
import { admitBalanceCash } from '@/edgar/financialEnrichment';
import { resolveNetDebt } from '@/pipeline/stageB/netDebt';
import { buildDcfAssumptions } from '@/pipeline/stageB/valuation';
import { computeRoic } from '@/pipeline/stageB/returns';
import { runStageB } from '@/pipeline/compute';
import { completeCurrencyBundle, M } from './helpers/currencyBundle';
import { withIssuerFacts } from './helpers/confirmedIssuer';
import type { FmpBalanceSheetRow } from '@/providers/fmp';
import type { ExtractedSection } from '@/pipeline/types';
import type { CompanyFacts } from '@/edgar/xbrl';
const end='2025-12-31', accn='0000000001-26-000001', observed='2026-10-13T12:00:00.000Z';
const fact=(value:number)=>({end,val:value,accn,filed:'2026-02-01',form:'10-K',fy:2025,fp:'FY'});
const facts=(invest=true):CompanyFacts=>({cik:1,entityName:'Example',facts:{'us-gaap':{CashAndCashEquivalentsAtCarryingValue:{units:{USD:[fact(50*M)]}},...(invest?{ShortTermInvestments:{units:{USD:[fact(500*M)]}}}:{})}}});
const income=[{date:end,operatingIncome:100*M,incomeBeforeTax:100*M,incomeTaxExpense:20*M}];
const balance={date:end,cik:'1',reportedCurrency:'USD',totalDebt:800*M,totalStockholdersEquity:300*M,cashAndCashEquivalents:40*M,cashAndShortTermInvestments:50*M};
describe('D-261 final owner policy',()=>{
 it('withholds capital rather than silently dropping a known same-instant investment fact',()=>{
  const a=admitBalanceCash(balance,facts(),'annual',observed);
  expect(a.row.cashAndCashEquivalents).toBe(50*M);
  expect(resolveNetDebt(a.row).value).toBeNull();
  const roic=computeRoic(income,[{...a.row,date:end}]);
  expect(roic.latestRoicPct).toBeNull();
  expect(roic.gaps.map(g=>g.reason).join(' ')).toContain('ShortTermInvestments');
  expect(roic.gaps.map(g=>g.reason).join(' ')).toContain(accn);
 });
 it('refuses the dimensioned investment family observed in a dated primary filing table',()=>{
  const section={accession:accn,form:'10-K',filingDate:'2026-02-01',reportDate:end,
   documentUrl:'https://www.sec.gov/Archives/edgar/data/1/'+accn.replaceAll('-','')+'/example.htm',
   text:'Fair Value December 31, 2025 Cash equivalents 50 Short-term investments: Available-for-sale debt securities 500 Noncurrent investments 20',
   statementsText:'',chars:170,sectionName:'tenKNotes',method:'toc-anchor'} as ExtractedSection;
  const a=admitBalanceCash(balance,facts(false),'annual',observed,[section]);
  expect(a.row.cashAndCashEquivalents).toBe(50*M);expect(resolveNetDebt(a.row).value).toBeNull();
  expect(a.gaps.map(g=>g.reason).join(' ')).toContain('AvailableForSaleSecuritiesDebtSecuritiesCurrent');
  expect(a.gaps.map(g=>g.reason).join(' ')).toContain(accn);
 });
 it.each([false,true])('preserves main-admitted liquidity despite an unadmitted investment observation (%s)', dimensional=>{
  const row={...balance,cashAndCashEquivalents:50*M,shortTermInvestments:0,cashAndShortTermInvestments:50*M};
  const section={accession:accn,form:'10-K',filingDate:'2026-02-01',reportDate:end,
   documentUrl:'https://www.sec.gov/Archives/edgar/data/1/'+accn.replaceAll('-','')+'/example.htm',
   text:'Fair Value December 31, 2025 Short-term investments: Available-for-sale debt securities 500',
   statementsText:'',chars:100,sectionName:'tenKNotes',method:'toc-anchor'} as ExtractedSection;
  const out=admitBalanceCash(row,facts(!dimensional),'annual',observed,dimensional?[section]:[]);
  expect(out.row).toEqual(row);expect(out.gaps).toEqual([]);
 });
 it('preserves the main restricted-inclusive reconciliation and its investment component',()=>{
  const f=facts(false);f.facts['us-gaap']!.CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents={units:{USD:[fact(70*M)]}};
  const row:FmpBalanceSheetRow={...balance,filingDate:'2026-02-01',cashAndCashEquivalents:70*M,shortTermInvestments:10*M,cashAndShortTermInvestments:80*M};
  const out=admitBalanceCash(row,f,'annual',observed).row;
  expect(out.cashAndCashEquivalents).toBe(50*M);expect(out.shortTermInvestments).toBe(10*M);
  expect(out.fieldConflicts?.cashAndCashEquivalents?.reason).toContain('vendor cash scope reconciled');
 });
 it('preserves a main-admitted average whose liquidity observations have no refusal',()=>{
  const r=computeRoic([...income,{...income[0]!,date:'2024-12-31'}],[{...balance,cashAndCashEquivalents:50*M,cashAndShortTermInvestments:null},
   {...balance,date:'2024-12-31',cashAndCashEquivalents:50*M,shortTermInvestments:100*M,cashAndShortTermInvestments:150*M}]);
  expect(r.latestRoicPct).not.toBeNull();
 });
 it('preserves main single-period capital when an old opening lease observation is unusable',()=>{
  const current={...balance,cashAndCashEquivalents:50*M,shortTermInvestments:100*M,cashAndShortTermInvestments:150*M};
  const r=computeRoic([...income,{...income[0]!,date:'2024-12-31'}],[current,
    {...current,date:'2024-12-31',operatingLeaseLiability:100*M,capitalLeaseObligations:0}]);
  expect(r.latestRoicPct).not.toBeNull();
 });
 it('honors an independently refused investment on a repaired row',()=>{
  const b={...balance,cashConflictReconciled:true as const,cashAndCashEquivalents:50*M,cashAndShortTermInvestments:null,shortTermInvestments:null,fieldConflicts:{shortTermInvestments:{usable:false,reason:'investment issuer scope refused'}}};
  expect(resolveNetDebt(b)).toMatchObject({value:null,conflict:true});
  const r=computeRoic(income,[b]);expect(r.latestRoicPct).toBeNull();
  expect(r.gaps.map(g=>g.reason).join(' ')).toContain('investment issuer scope refused');
 });
 it('does not average cash-only capital against capital that deducts investments',()=>{
  const r=computeRoic([...income,{...income[0]!,date:'2024-12-31'}],[{...balance,cashConflictReconciled:true as const,cashAndCashEquivalents:50*M,cashAndShortTermInvestments:null},
   {...balance,date:'2024-12-31',cashAndCashEquivalents:50*M,shortTermInvestments:100*M,cashAndShortTermInvestments:150*M}]);
  expect(r.latestRoicPct).toBeNull();
  expect(r.gaps.map(g=>g.reason).join(' ')).toMatch(/liquidity bas/i);
 });
 it.each([false,true])('withholds mixed actual liquidity bases in either direction (closing investments %s)', closingInvestments=>{
  const cashOnly={...balance,cashAndCashEquivalents:50*M,shortTermInvestments:null,cashAndShortTermInvestments:null};
  const combined={...balance,cashAndCashEquivalents:50*M,shortTermInvestments:500*M,cashAndShortTermInvestments:550*M};
  const closing={...(closingInvestments?combined:cashOnly),cashConflictReconciled:true as const};
  const opening={...(closingInvestments?cashOnly:combined),date:'2024-12-31'};
  const r=computeRoic([...income,{...income[0]!,date:'2024-12-31'}],[closing,opening]);
  expect(r.latestRoicPct).toBeNull();
  expect(r.series.find(y=>y.date===end)?.investedCapitalAvg).toBeNull();
  expect(r.gaps).toContainEqual(expect.objectContaining({field:'returns.roic.'+end,reason:expect.stringMatching(/liquidity bases differ.*cash-only.*cash-and-investments|liquidity bases differ.*cash-and-investments.*cash-only/)}));
 });
 it('keeps the DCF when operating leases exceed half the full debt total',()=>{
  const r=buildDcfAssumptions({revenueCagr3yPct:12,revenueCagr5yPct:13,analystEstimates:null,waccPct:9,riskFreePct:4.48,marketCap:5000,
   incomeTtm:{date:end,revenue:1000,operatingIncome:200,incomeBeforeTax:180,incomeTaxExpense:36},incomeHistory:[{date:end,revenue:1000,operatingIncome:200},{date:'2024-12-31',revenue:900,operatingIncome:180}],
   balance:{date:end,basis:'annual',totalDebt:400,shortTermDebt:50,longTermDebt:50,operatingLeaseLiability:300,financeLeaseLiability:0,capitalLeaseObligations:300,totalEquity:1500,totalStockholdersEquity:1500,cashAndCashEquivalents:100,shortTermInvestments:20,cashAndShortTermInvestments:120}});
  expect(r.assumptions).not.toBeNull();
  expect(r.gaps.some(g=>g.severity==='critical')).toBe(false);
 });
 it('does not qualify grades for an unused cash-only quarter',()=>{
  const b=completeCurrencyBundle({});const f=facts(false);(f.facts['us-gaap']!.CashAndCashEquivalentsAtCarryingValue as {units:{USD:{end:string}[]}}).units.USD[0]!.end='2010-03-31';withIssuerFacts(b,f);
  if(!b.statements.balanceQuarterly.ok)throw Error('fixture');
  b.statements.balanceQuarterly.value.data.rows.push({...balance,date:'2010-03-31',filingDate:'2026-02-01'});
  const r=runStageB(b);
  expect(r.scores.qualification?.aspects.quality.reasons.some(x=>x.code==='cash-only-liquidity')).toBe(false);
 });
});
