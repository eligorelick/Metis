import {sessionTailTtlMs} from "./usSession";
import {isTransientProviderError} from "./http";
function window(key:string):{family:string;from:string;to:string}|null {
 const i=key.indexOf(":");if(i<0)return null;
 const url=new URL(key.slice(i+1),"https://cache.invalid");
 const yahoo=key.startsWith("yahoo:") && url.pathname.startsWith("/v8/finance/chart/") && url.searchParams.get("interval")==="1d";
 const fmp=key.startsWith("fmp:") && url.pathname==="/stable/historical-price-eod/full";
 if(!yahoo&&!fmp)return null;
 const from=url.searchParams.get(yahoo?"period1":"from"),to=url.searchParams.get(yahoo?"period2":"to");
 if(!from||!to)return null;
 return {family:yahoo?`yahoo:${url.pathname}`:`fmp:${url.pathname}:${url.searchParams.get("symbol")}`,from,to};
}
export function historyWindowFallback(key:string) {
 const requested=window(key);if(!requested)return undefined;
 return {when:isTransientProviderError,acceptKey:(candidate:string)=>{
  const cached=window(candidate);if(!cached||cached.family!==requested.family)return false;
  return (["from","to"] as const).every(k=>{const days=(Date.parse(requested[k])-Date.parse(cached[k]))/86400000;return Number.isFinite(days)&&days>=0&&days<=7;});
 }};
}

export function historyTailTtlMs(key:string,now:Date):number|null {
 const w=window(key);return w?sessionTailTtlMs(w.to,now):null;
}
