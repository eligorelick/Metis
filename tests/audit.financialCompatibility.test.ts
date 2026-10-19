import {describe,expect,it} from 'vitest';
import {computeFinancialMetrics,computeNareitFfo,PREMIUMS_EARNED_TAGS,INCURRED_CLAIMS_TAGS,UNDERWRITING_EXPENSE_TAGS,NET_CHARGE_OFF_TAGS,LOANS_TAGS,NONACCRUAL_LOAN_TAGS,PROVISION_TAGS,REPO_FUNDING_TAGS,type FinancialMetricsInputs} from '@/pipeline/stageB/financialMetrics';
import {computeRunway} from '@/pipeline/stageB/sectorRouting';
import type {CompanyFacts} from '@/edgar/xbrl';
import type {FetchResult} from '@/types/core';

const FY='2025-12-31';
function facts(entries:Array<[string,number,string,string?]>):FetchResult<CompanyFacts>{
 const raw:CompanyFacts={cik:1,entityName:'Audit',facts:{'us-gaap':Object.fromEntries(entries.map(([tag,val,unit,start])=>[tag,{label:tag,units:{[unit]:[{val,end:FY,...(start?{start}:{}),filed:'2026-02-01',accn:'0000000001-26-000001',form:'10-K',fp:'FY',fy:2025}]}}]))}};
 return {ok:true,value:{data:raw,asOf:FY,fetchedAt:'2026-02-01',source:'edgar',endpoint:'audit'}};
}
const inputs=(companyFacts:FetchResult<CompanyFacts>):FinancialMetricsInputs=>({companyFacts,balance:[{date:FY,totalAssets:100,totalStockholdersEquity:50,reportedCurrency:'USD'}],income:[{date:FY,revenue:100,netIncome:10}],shares:10});
const metric=(r:ReturnType<typeof computeFinancialMetrics>,key:string)=>r.metrics.find(m=>m.key===key)!;
describe('route financial compatibility',()=>{
 it('preserves compatible statement-only NII and still rejects conflicting dates or currencies',()=>{
  const input:FinancialMetricsInputs={companyFacts:null,balance:[{date:FY,totalAssets:100,reportedCurrency:'USD'}],income:[{date:FY,netInterestIncome:10,reportedCurrency:'USD'}]};
  expect(metric(computeFinancialMetrics('bank',input),'niiToAverageAssets').value).toBe(10);
  input.income[0]!.reportedCurrency='EUR';
  expect(metric(computeFinancialMetrics('bank',input),'niiToAverageAssets').value).toBeNull();
  input.income[0]!.reportedCurrency='USD'; input.income[0]!.date='2024-12-31';
  expect(metric(computeFinancialMetrics('bank',input),'niiToAverageAssets').value).toBeNull();
 });
 it('gates both actual prior denominators in the repo-funded spread',()=>{
  const cf=facts([[REPO_FUNDING_TAGS[0],100,'USD']]);if(!cf.ok)throw Error('fixture');
  (cf.value.data.facts['us-gaap']![REPO_FUNDING_TAGS[0]] as {units:Record<string,unknown[]>}).units.USD!.push({val:100,end:'2024-12-31',filed:'2025-02-01',form:'10-K',accn:'b'});
  const input=inputs(cf);input.income[0]!.interestIncome=10;input.income[0]!.interestExpense=1;input.income[0]!.reportedCurrency='USD';
  input.balance=[...input.balance,{date:'2024-12-31',totalAssets:300,reportedCurrency:'USD'}];
  expect(metric(computeFinancialMetrics('reit-mortgage',input),'netInterestSpreadRepoFunded').value).toBe(4);
  input.balance[1]!.reportedCurrency='EUR';
  expect(metric(computeFinancialMetrics('reit-mortgage',input),'netInterestSpreadRepoFunded').value).toBeNull();
 });
 it.each(['currency','flow-start','prior-currency'])('a credit-cycle flag cannot consume incompatible %s evidence',kind=>{
  const cf=facts([[PROVISION_TAGS[0],1,kind==='currency'?'EUR':'USD',kind==='flow-start'?'2025-01-11':'2025-01-01'],[NET_CHARGE_OFF_TAGS[0],10,'USD','2025-01-01'],[LOANS_TAGS[0],100,'USD'],[NONACCRUAL_LOAN_TAGS[0],20,'USD']]);if(!cf.ok)throw Error('fixture');
  for(const [tag,value] of [[LOANS_TAGS[0],100],[NONACCRUAL_LOAN_TAGS[0],10]] as const){
   const concept=cf.value.data.facts['us-gaap']![tag] as {units:Record<string,unknown[]>};
   concept.units[kind==='prior-currency'?'EUR':'USD']??=[];
   concept.units[kind==='prior-currency'?'EUR':'USD']!.push({val:value,end:'2024-12-31',filed:'2025-02-01',form:'10-K',accn:'b'});
  }
  const input=inputs(cf);input.balance=[...input.balance,{date:'2024-12-31',totalAssets:100,reportedCurrency:'USD'}];
  const out=computeFinancialMetrics('bank',input);
  expect(out.flags?.some(f=>f.key==='provisionsBelowChargeOffs')).toBe(false);
  expect(out.notes.some(n=>n.includes('0.10x'))).toBe(false);
 });
 it('checks prior statement currency and an alternate prior earning-assets tag',()=>{
  const cf=facts([['InterestIncomeExpenseNet',10,'USD','2025-01-01']]);
  const input=inputs(cf);input.income[0]!.reportedCurrency='USD';
  input.balance=[...input.balance,{date:'2024-12-31',totalAssets:300,reportedCurrency:'EUR'}];
  expect(metric(computeFinancialMetrics('bank',input),'niiToAverageAssets').value).toBeNull();
  if(!cf.ok)throw Error('fixture');
  cf.value.data.facts['us-gaap']!.InterestEarningAssets={units:{USD:[{end:FY,val:100,filed:'2026-02-01',form:'10-K',accn:'a'}]}};
  cf.value.data.facts['us-gaap']!.AverageEarningAssets={units:{EUR:[{end:'2024-12-31',val:200,filed:'2025-02-01',form:'10-K',accn:'b'}]}};
  input.balance[1]!.reportedCurrency='USD';
  expect(metric(computeFinancialMetrics('bank',input),'nim').value).toBeNull();
 });
 it.each(['shares','pure','USD/shares','USD-per-shares'])('rejects nonmonetary %s operands in NIM and FFO',(unit)=>{
  expect(metric(computeFinancialMetrics('bank',inputs(facts([['InterestIncomeExpenseNet',10,unit,'2025-01-01'],['InterestEarningAssets',100,'USD']]))),'nim').value).toBeNull();
  expect(computeNareitFfo({companyFacts:facts([['NetIncomeLoss',10,'USD','2025-01-01'],['DepreciationDepletionAndAmortization',20,unit,'2025-01-01']]),periodEnd:FY,netIncome:null,depreciationAndAmortization:null}).ffo).toBeNull();
 });
 it('unused straight-line rent does not invalidate a rough total-capex AFFO',()=>{
  const result=computeNareitFfo({companyFacts:facts([['NetIncomeLoss',10,'USD','2025-01-01'],['DepreciationDepletionAndAmortization',20,'USD','2025-01-01'],['StraightLineRent',2,'EUR','2025-01-01']]),periodEnd:FY,reportedCurrency:'USD',netIncome:null,depreciationAndAmortization:null,capitalExpenditure:-5});
  expect(result.ffo).toBe(30);expect(result.affo).toBe(25);expect(result.affoHistoryComparable).toBe(true);
 });
 it('share counts are not monetary operands even when their income row has another currency',()=>{
  const input=inputs(facts([]));input.income[0]!.reportedCurrency='EUR';input.sharesBasis='statements:income.weightedAverageShsOutDil';
  expect(metric(computeFinancialMetrics('reit-mortgage',input),'bookValuePerShare').value).toBe(5);
 });
 it('same-unit bank NIM remains10%, mixed monetary units cannot become10%',()=>{
  for(const [unit,expected] of [['USD',10],['EUR',null]] as const){
   const r=computeFinancialMetrics('bank',inputs(facts([['InterestIncomeExpenseNet',10,'USD','2025-01-01'],['InterestEarningAssets',100,unit]])));
   expect(metric(r,'nim').value).toBe(expected);
   if(expected===null)expect(metric(r,'nim').withheldReason).toMatch(/unit|currency/i);
  }
 });
 it('insurer sums and ratios require identical currency and fiscal flow starts',()=>{
  const rows:Array<[string,number,string,string?]>=[[PREMIUMS_EARNED_TAGS[0]!,100,'USD','2025-01-01'],[INCURRED_CLAIMS_TAGS[0]!,60,'EUR','2025-01-01'],[UNDERWRITING_EXPENSE_TAGS[0]!,10,'USD','2025-01-01'],[UNDERWRITING_EXPENSE_TAGS[1]!,20,'EUR','2025-01-01']];
  const mixed=computeFinancialMetrics('insurer',inputs(facts(rows)));
  for(const key of ['lossRatio','expenseRatio','combinedRatio'])expect(metric(mixed,key).value).toBeNull();
  const valid=rows.map(([tag,val,,start])=>[tag,val,'USD',start] as [string,number,string,string?]);
  expect(metric(computeFinancialMetrics('insurer',inputs(facts(valid))),'combinedRatio').value).toBe(90);
  valid[1]![3]='2025-01-11';
  expect(metric(computeFinancialMetrics('insurer',inputs(facts(valid))),'lossRatio').value).toBeNull();
 });
 it('FFO refuses mixed-unit addbacks rather than producing30',()=>{
  const r=computeNareitFfo({companyFacts:facts([['NetIncomeLoss',10,'USD','2025-01-01'],['DepreciationDepletionAndAmortization',20,'EUR','2025-01-01']]),periodEnd:FY,netIncome:null,depreciationAndAmortization:null,capitalExpenditure:-5});
  expect(r.ffo).toBeNull();expect(r.affo).toBeNull();expect(r.gaps.map(g=>g.reason).join(' ')).toMatch(/unit|currency/i);
 });
 it('a two-year-old balance never masquerades as the adjacent opening balance',()=>{
  const input=inputs(facts([['InterestIncomeExpenseNet',10,'USD','2025-01-01']]));
  input.balance=[...input.balance,{date:'2023-12-31',totalAssets:50,totalStockholdersEquity:25,reportedCurrency:'USD'}];
  // Without an actual opening balance the existing explicitly labelled point-end proxy may remain.
  const r=computeFinancialMetrics('bank',input);
  expect(metric(r,'niiToAverageAssets').value).toBe(10);
  expect(metric(r,'niiToAverageAssets').basis).toMatch(/single period-end|no adjacent/i);
 });
 it('contradictory combined liquidity suppresses runway; consistent liquidity retains10quarters',()=>{
  const flows=[{date:FY,operatingCashFlow:-50,capitalExpenditure:0}];
  const base={date:FY,cashAndShortTermInvestments:500,cashAndCashEquivalents:500,shortTermInvestments:0};
  expect(computeRunway(base,flows).runwayQuarters).toBe(10);
  const result=computeRunway({...base,cashAndCashEquivalents:1000},flows);
  expect(result.runwayQuarters).toBeNull();expect(result.gaps.map(g=>g.reason).join(' ')).toMatch(/conflict|below/i);
 });
});
