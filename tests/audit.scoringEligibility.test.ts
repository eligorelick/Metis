import {describe,expect,it} from 'vitest';
import {runStageB} from '@/pipeline/compute';
import {validateBundle} from '@/pipeline/stageA/validate';
import {completeCurrencyBundle} from './helpers/currencyBundle';
import {buildDataCompleteness} from '@/report/completeness';

describe('validation eligibility reaches deterministic consumers',()=>{
 const revenueFailure={checks:[{id:'xbrlCrossCheck.revenue.FY.2025-12-31',name:'Revenue cross-check',status:'fail' as const,detail:'unreconciled definitions'}],flags:[],gaps:[]};
 it('FIN-110 carries refused annual revenue into projection history, dispersion, margins and forensics',()=>{
  const bundle=completeCurrencyBundle({}),original=structuredClone(bundle);
  const flagged=runStageB(bundle,{evIncludeLeases:false},revenueFailure);
  const revenue=flagged.projections.series.find(s=>s.metric==='revenue');
  expect(revenue?.historical.every(h=>h.value.value===null)??true).toBe(true);
  expect(flagged.scenarioTargets.dispersion===null||flagged.scenarioTargets.missingReasons.some(m=>/unreconciled/.test(m.reason))).toBe(true);
  expect(flagged.forensics.beneish?.indices.sgi??null).toBeNull();
  expect(flagged.forensics.gaps.some(g=>g.field==='forensics.revenueEligibility'&&/unreconciled/.test(g.reason))).toBe(true);
  expect(flagged.gaps.some(g=>g.field==='projections.revenueEligibility')).toBe(true);
  for(const margin of ['operating','gross','net'] as const)expect(flagged.growth.margins[margin].series.filter(p=>p.pct!==null)).toEqual([]);
  expect(buildDataCompleteness(flagged.gaps).state).not.toBe('blocked');
  expect(bundle).toEqual(original);
 });
 it('FIN-110 control: clean annual revenue remains available in each consumer',()=>{
  const clean=runStageB(completeCurrencyBundle({}),{evIncludeLeases:false});
  expect(clean.projections.series.find(s=>s.metric==='revenue')?.historical.some(h=>h.value.value!==null)).toBe(true);
  expect(clean.forensics.beneish?.indices.sgi??null).not.toBeNull();
  expect(clean.growth.margins.operating.series.some(p=>p.pct!==null)).toBe(true);
 });
 it.each([false,true])('FIN-110 preserves independent capital, returns and route metrics (bank=%s)',bank=>{
  const bundle=completeCurrencyBundle({bank}),clean=runStageB(bundle,{evIncludeLeases:false});
  const flagged=runStageB(bundle,{evIncludeLeases:false},revenueFailure);
  expect(flagged.capital).toEqual(clean.capital);
  expect(flagged.returns).toEqual(clean.returns);
  expect(flagged.financialMetrics).toEqual(clean.financialMetrics);
  expect(flagged.growth.epsDilutedCagrs).toEqual(clean.growth.epsDilutedCagrs);
  expect(flagged.growth.fcfCagrs).toEqual(clean.growth.fcfCagrs);
 });
 it('a known annual revenue conflict cannot remain a fully observed growth driver',()=>{
  const bundle=completeCurrencyBundle({bank:true});
  const validation={checks:[{id:'xbrlCrossCheck.revenue.FY.2025-12-31',name:'Revenue cross-check',status:'fail' as const,detail:'unreconciled definitions'}],flags:[],gaps:[]};
  const result=runStageB(bundle,undefined,validation);
  expect(result.growth.revenueCagrs.every(p=>p.cagrPct===null)).toBe(true);
  expect(result.scores.aspects.fundamentals.drivers.some(d=>d.source.endsWith('.revenueCagr'))).toBe(false);
  expect(result.gaps.some(g=>/eligibility.*revenue/.test(g.field))).toBe(true);
 });
 it('irrelevant validation warnings do not change legitimate scores',()=>{
  const bundle=completeCurrencyBundle({});
  const clean=runStageB(bundle,{evIncludeLeases:false});
  const flagged=runStageB(bundle,{evIncludeLeases:false},{checks:[{id:'staleness.quote',name:'quote',status:'fail',detail:'stale quote'}],flags:[],gaps:[]});
  expect(flagged.scores).toEqual(clean.scores);
 });
 it('future quote and acquisition timestamps fail freshness instead of passing',()=>{
  const bundle=completeCurrencyBundle({});
  if(!bundle.quote.ok)throw Error('fixture');
  bundle.quote.value.asOf='2027-01-01';bundle.quote.value.fetchedAt='2027-01-01T00:00:00Z';
  bundle.edgar.companyFacts={ok:false,gap:{field:'facts',reason:'not available',severity:'info'}};
  const result=validateBundle(bundle,{now:new Date(bundle.builtAt)});
  expect(result.checks.find(c=>c.id==='staleness.quote')?.status).toBe('fail');
  expect(result.gaps.map(g=>g.reason).join(' ')).toMatch(/future/i);
 });
});
