import {describe,expect,it} from 'vitest';
import {runStageB} from '@/pipeline/compute';
import {validateBundle} from '@/pipeline/stageA/validate';
import {completeCurrencyBundle} from './helpers/currencyBundle';

describe('validation eligibility reaches deterministic consumers',()=>{
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
