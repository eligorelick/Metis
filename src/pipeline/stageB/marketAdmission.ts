/** Shared, browser-safe admission for observed OHLCV. No clock or provider calls. */
export interface MarketBar {
  date: string; open: number; high: number; low: number; close: number;
  volume?: number | null;
}

function day(value:unknown):string|null {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const time=Date.parse(value);
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?value:null;
}

export function admitMarketBars<T extends MarketBar>(rows:readonly T[]|null|undefined,label:string,analysisAt?:string):{rows:T[];notes:string[]} {
  const notes:string[]=[];
  if(!rows?.length)return {rows:[],notes};
  const cutoff=analysisAt===undefined?undefined:day(analysisAt.slice(0,10));
  if(analysisAt!==undefined&&(cutoff===null||!Number.isFinite(Date.parse(analysisAt))))return {rows:[],notes:[`${label}: analysis cutoff invalid; observed prices withheld.`]};
  let invalid=0,future=0,unavailableVolume=0,duplicates=0;
  const byDate=new Map<string,T>();
  const conflicts=new Set<string>();
  for(const row of rows){
    if(day(row.date)===null||![row.open,row.high,row.low,row.close].every(v=>Number.isFinite(v)&&v>0)||row.low>row.high){invalid++;continue;}
    // Adjusted close may differ from the basis of the range; do not infer that basis.
    if(cutoff!==undefined&&cutoff!==null&&row.date>cutoff){future++;continue;}
    const volume=typeof row.volume==='number'&&Number.isFinite(row.volume)&&row.volume>=0?row.volume:null;
    if(volume===null)unavailableVolume++;
    const clean={...row,volume};
    const prior=byDate.get(row.date);
    if(prior){
      if(['open','high','low','close','volume'].some(k=>prior[k as keyof T]!==clean[k as keyof T]))conflicts.add(row.date);
      else duplicates++;
    }else byDate.set(row.date,clean);
  }
  const admitted=[...byDate.values()].filter(r=>!conflicts.has(r.date));
  if(admitted.some((r,i)=>i>0&&r.date<admitted[i-1]!.date))notes.push(`${label}: input rows were not sorted ASC by date — re-sorted defensively.`);
  admitted.sort((a,b)=>a.date.localeCompare(b.date));
  if(invalid)notes.push(`${label}: dropped ${invalid} row(s) with invalid dates, non-finite/non-positive prices or inverted high/low.`);
  if(future)notes.push(`${label}: excluded ${future} future-dated price row(s) after analysis date ${cutoff}.`);
  if(conflicts.size)notes.push(`${label}: excluded ${conflicts.size} date(s) with conflicting duplicate observations.`);
  if(duplicates)notes.push(`${label}: deduplicated ${duplicates} identical observation(s).`);
  if(unavailableVolume)notes.push(`${label}: kept ${unavailableVolume} valid price row(s) with unavailable volume normalized to null.`);
  return {rows:admitted,notes};
}
