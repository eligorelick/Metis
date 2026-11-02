import type { TechnicalsResult } from "@/pipeline/stageB/technicals";

/** The price relation is arithmetic; the trend category remains Stage B's house rule. */
export function technicalTrendText(t: TechnicalsResult, currency: string | null): string {
  const finite = (n: number | null): n is number => n !== null && Number.isFinite(n);
  const price = (n: number) => `${currency !== null && /^[A-Z]{3}$/.test(currency) ? `${currency} ` : ""}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
  const prefix = `House SMA trend: ${t.read.trend}${t.asOf ? ` as of ${t.asOf}` : ""}.`;
  const close = t.lastClose, s50 = t.smaCross.sma50, s200 = t.smaCross.sma200;
  if (!finite(close)) return `${prefix} Last close unavailable; no price-to-average relation established.`;
  if (!finite(s50) || !finite(s200)) {
    return `${prefix} Last close ${price(close)}; ${finite(s50) ? `50-day average ${price(s50)}` : "50-day average unavailable"}; ${finite(s200) ? `200-day average ${price(s200)}` : "200-day average unavailable"}. A relation to both averages is unavailable.`;
  }
  const relation = close === s50 && close === s200 ? "equal to both averages"
    : close === s50 ? "equal to the 50-day average"
      : close === s200 ? "equal to the 200-day average"
        : close < Math.min(s50, s200) ? "below both averages"
          : close > Math.max(s50, s200) ? "above both averages" : "between the averages";
  return `${prefix} Last close ${price(close)} is ${relation} (50-day ${price(s50)}; 200-day ${price(s200)}).`;
}
