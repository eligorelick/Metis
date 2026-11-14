import { describe, it, expect } from 'vitest';
import { buildDcfAssumptions, type DcfAssumptionInputs } from '@/pipeline/stageB/valuation';
import { resolveNetDebt } from '@/pipeline/stageB/netDebt';
import { computeRoic } from '@/pipeline/stageB/returns';
const date='2025-12-31';
const dcf=(over:Record<string,unknown>={}):DcfAssumptionInputs=>({revenueCagr3yPct:12,revenueCagr5yPct:13,analystEstimates:null,waccPct:9,riskFreePct:4.48,marketCap:5000,
 incomeTtm:{date,revenue:1000,operatingIncome:200,incomeBeforeTax:180,incomeTaxExpense:36},incomeHistory:[{date,revenue:1000,operatingIncome:200},{date:'2024-12-31',revenue:900,operatingIncome:180}],
 balance:{date,basis:'annual',totalDebt:400,shortTermDebt:50,longTermDebt:50,operatingLeaseLiability:300,financeLeaseLiability:0,capitalLeaseObligations:300,totalEquity:1500,totalStockholdersEquity:1500,cashAndCashEquivalents:100,shortTermInvestments:20,cashAndShortTermInvestments:120,...over}});
const income=[{date,operatingIncome:100,incomeBeforeTax:100,incomeTaxExpense:20}];
const balance=(investments:number|null)=>({date,totalDebt:800,totalStockholdersEquity:300,cashAndCashEquivalents:50,shortTermInvestments:investments,cashAndShortTermInvestments:null,
 fieldConflicts:{shortTermInvestments:{usable:false,reason:'independent investment refusal'}}});
describe('D-261 admitted-row main parity',()=>{
 it('matches main: combined 130 is used despite components totalling 120',()=>{
  const r=buildDcfAssumptions(dcf({cashAndShortTermInvestments:130}));expect(r.assumptions).not.toBeNull();
  expect(r.assumptions?.salesToCapital.value).toBeCloseTo(1000/1470,12);
 });
 it('matches main: lease line 200 does not newly reject operating lease 300',()=>{
  const r=buildDcfAssumptions(dcf({capitalLeaseObligations:200}));expect(r.assumptions).not.toBeNull();
  expect(r.assumptions?.salesToCapital.value).toBeCloseTo(1000/1480,12);
 });
 it.each(['cashAndShortTermInvestments','cashAndCashEquivalents'])('matches main: rejects unrepaired refused %s', field=>{
  const reason='independent liquidity refusal';
  const r=buildDcfAssumptions(dcf({fieldConflicts:{[field]:{usable:false,reason}}}));
  expect(r.assumptions).toBeNull();
  expect(r.gaps).toContainEqual({field:'valuation.dcf.salesToCapital',severity:'critical',cause:'invested-capital-balance-fields-missing',
    reason:`balance-sheet fields missing for invested capital: ${field==='cashAndShortTermInvestments'?'cashAndShortTermInvestments withheld ('+reason+')':'cashAndShortTermInvestments, cashAndCashEquivalents withheld ('+reason+')'} at ${date} - this sales-to-capital DCF is suppressed instead of inventing a capital-efficiency input. An explicit operating-cash-flow model requires separately supported reinvestment assumptions; negative book capital alone does not prohibit valuation`});
 });
 it('matches main: unrepaired independently refused investments keep the cash-only ROIC',()=>{
  expect(computeRoic(income,[balance(null)]).latestRoicPct).toBeCloseTo(80/1050*100,12);
 });
 it('matches main: unrepaired investments kept on the row retain net debt and ROIC',()=>{
  const b=balance(20);expect(resolveNetDebt(b).value).toBe(730);
  expect(computeRoic(income,[b]).latestRoicPct).toBeCloseTo(80/1030*100,12);
 });
 it.each([null,20])('still refuses independent investments on a repaired row (%s)', investments=>{
  const b={...balance(investments),cashConflictReconciled:true as const};
  expect(resolveNetDebt(b)).toMatchObject({value:null,conflict:true});expect(computeRoic(income,[b]).latestRoicPct).toBeNull();
 });
 it('still checks conflicting components on a repaired DCF row',()=>{
  const r=buildDcfAssumptions(dcf({cashAndShortTermInvestments:130,cashConflictReconciled:true}));expect(r.assumptions).toBeNull();
  expect(r.gaps.some(g=>g.reason.includes("liquidity refused"))).toBe(true);
 });
});
