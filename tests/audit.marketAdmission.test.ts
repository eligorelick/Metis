import {describe,expect,it} from 'vitest';
import {sanitizeRows,computeTechnicals,type OhlcvRow} from '@/pipeline/stageB/technicals';
import {runStageB} from '@/pipeline/compute';
import {preparePricePlotData,prepareRelativeStrengthPlotData} from '@/components/charts/plotData';
import {priceChartPropsFromBundle,relativeStrengthSeriesFromBundle} from '@/components/charts/map';
import {currencyBundle} from './helpers/currencyBundle';

const bars=(n:number):OhlcvRow[]=>Array.from({length:n},(_,i)=>({date:new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),open:100,high:201,low:99,close:i===n-1?200:100,volume:1000}));
describe('audit market admission',()=>{
 it('identical duplicate observations cannot change technical or plotted moving averages',()=>{
  const unique=bars(200), duplicate=[...unique,unique[199]!];
  const original=computeTechnicals(unique,[],[],null),actual=computeTechnicals(duplicate,[],[],null);
  expect(actual.smaCross.sma50).toBe(original.smaCross.sma50);
  expect(actual.smaCross.sma200).toBe(original.smaCross.sma200);
  expect(preparePricePlotData(duplicate).rows.at(-1)?.sma50).toBe(102);
 });
 it('conflicting same-date observations are excluded from both calculation and chart',()=>{
  const unique=bars(200),conflict=[...unique,{...unique[199]!,close:150}];
  expect(sanitizeRows(conflict,'symbol').rows).toHaveLength(199);
  expect(sanitizeRows(conflict,'symbol').notes.join(' ')).toMatch(/conflicting/i);
  expect(preparePricePlotData(conflict).bars).toHaveLength(199);
 });
 it('rejects inverted range and nonpositive open without asserting adjustment consistency',()=>{
  const sample=bars(1)[0]!;
  expect(sanitizeRows([{...sample,high:80,low:120},{...sample,open:0}],'symbol').rows).toEqual([]);
  // A provider can give an adjusted close and unadjusted range; do not infer common basis.
  expect(sanitizeRows([{...sample,close:500}],'symbol').rows).toHaveLength(1);
 });
 it('future raw bars cannot change StageB score or enter the displayed series',()=>{
  const clean=currencyBundle({}), raw=bars(300);
  if(!clean.eodPrices.ok)throw Error('fixture');
  clean.eodPrices.value.data.rows=raw.map(r=>({...r,volume:r.volume??undefined}));
  const original=runStageB(clean),future=structuredClone(clean);
  if(!future.eodPrices.ok)throw Error('fixture');
  future.eodPrices.value.data.rows.push({...raw.at(-1)!,date:'2027-01-01',close:1000,high:1001,volume:1000});
  const actual=runStageB(future);
  expect(actual.technicals.asOf).toBe(original.technicals.asOf);
  expect(actual.scores.aspects.technicals.score).toBe(original.scores.aspects.technicals.score);
  expect(actual.technicals.notes.join(' ')).toMatch(/future/i);
  expect(priceChartPropsFromBundle(future,actual).rows.map(r=>r.date)).not.toContain('2027-01-01');
  expect(prepareRelativeStrengthPlotData(relativeStrengthSeriesFromBundle(future)).rows.map(r=>r.date)).not.toContain('2027-01-01');
 });
 it('relative-strength conflicts cannot choose an arbitrary last winner',()=>{
  const rows=[{date:'2025-01-01',close:10},{date:'2025-01-02',close:20},{date:'2025-01-02',close:30}];
  expect(prepareRelativeStrengthPlotData([{label:'TEST',rows}]).rows.map(r=>r.date)).toEqual(['2025-01-01']);
 });
});
