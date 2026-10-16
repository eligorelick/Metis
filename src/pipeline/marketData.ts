/**
 * D-62: the provider market and consensus data a reader expects on page 1
 * (quote, market cap, share count, period-end EV, FY+1/FY+2 consensus,
 * price-target and analyst-grade distributions, short interest), copied from
 * the bundle onto the report as served. No computation and no LLM input: the
 * payload the model sees is unchanged.
 *
 * Currency follows D-57: quote and EV figures are in the listing currency;
 * estimates and targets carry their own row currency, else the issuer
 * currency they inherit when the statements and the listing agree and the
 * issuer is not an ADR, else no currency (and the renderers say so).
 */

import { statementCurrencies } from "@/pipeline/compute";
import { inheritedIssuerCurrency, providerRowCurrency } from "@/pipeline/estimateCurrency";
import type { DataBundle } from "@/pipeline/types";
import type { MarketData } from "@/report/schema";

type Row = Record<string, unknown>;

function rows(fetch: unknown): Row[] {
  const f = fetch as { ok?: boolean; value?: { data?: { rows?: unknown } } } | undefined;
  const list = f?.ok ? f.value?.data?.rows : undefined;
  return Array.isArray(list) ? (list as Row[]) : [];
}

function asOfOf(fetch: unknown): string | null {
  const f = fetch as { ok?: boolean; value?: { asOf?: unknown } } | undefined;
  return f?.ok && typeof f.value?.asOf === "string" ? f.value.asOf : null;
}

function n(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function day(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1]! : null;
}

function iso(value: unknown): string | null {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export function buildMarketData(bundle: DataBundle, options: { isAdr?: boolean } = {}): MarketData | undefined {
  const profile = rows(bundle.profile)[0];
  let currencies: { trading: string | null; model: string | null };
  try {
    const resolved = statementCurrencies(bundle);
    currencies = { trading: resolved.trading, model: resolved.model };
  } catch {
    currencies = { trading: iso(profile?.currency), model: null };
  }
  const issuer = inheritedIssuerCurrency({
    reporting: currencies.model,
    listing: currencies.trading,
    isAdr: options.isAdr === true || profile?.isAdr === true,
  });

  const q = rows(bundle.quote)[0];
  const quote: MarketData["quote"] = q
    ? {
        price: n(q.price), marketCap: n(q.marketCap), yearHigh: n(q.yearHigh), yearLow: n(q.yearLow),
        volume: n(q.volume), priceAvg50: n(q.priceAvg50), priceAvg200: n(q.priceAvg200), asOf: asOfOf(bundle.quote),
      }
    : null;

  const sf = rows(bundle.sharesFloat)[0];
  const shares: MarketData["shares"] = sf && (n(sf.outstandingShares) !== null || n(sf.floatShares) !== null)
    ? { outstanding: n(sf.outstandingShares), float: n(sf.floatShares), freeFloatPct: n(sf.freeFloat), asOf: day(sf.date) ?? asOfOf(bundle.sharesFloat) }
    : null;

  const evRows = rows(bundle.enterpriseValues)
    .map((row) => ({ row, date: day(row.date) }))
    .filter((entry): entry is { row: Row; date: string } => entry.date !== null && n(entry.row.enterpriseValue) !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
  const ev = evRows[0];
  const enterpriseValue: MarketData["enterpriseValue"] = ev
    ? { value: n(ev.row.enterpriseValue)!, periodEnd: ev.date, marketCap: n(ev.row.marketCapitalization), totalDebt: n(ev.row.addTotalDebt), cash: n(ev.row.minusCashAndCashEquivalents) }
    : null;

  // FY+1 and FY+2: the first two estimate rows after the latest reported fiscal year.
  const lastFiscal = day(rows(bundle.statements?.incomeAnnual)[0]?.date);
  const estimateRows = rows(bundle.analystEstimates)
    .map((row) => ({ row, date: day(row.date) }))
    .filter((entry): entry is { row: Row; date: string } => entry.date !== null && (lastFiscal === null || entry.date > lastFiscal))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 2);
  const ptc = rows(bundle.priceTargetConsensus)[0];
  const pts = rows(bundle.priceTargetSummary)[0];
  const estimateCurrencies = new Set(
    [...estimateRows.map((entry) => providerRowCurrency(entry.row, issuer).code), ...(ptc ? [providerRowCurrency(ptc, issuer).code] : [])],
  );
  // One currency for the whole consensus block, or none: rows in two
  // currencies are not shown as one table of money.
  const estimateCurrency = estimateCurrencies.size === 1 ? [...estimateCurrencies][0] ?? null : null;
  const inheritedAny = [...estimateRows.map((entry) => entry.row), ...(ptc ? [ptc] : [])].some((row) => providerRowCurrency(row, issuer).inherited);

  const priceTarget: MarketData["priceTarget"] = ptc || pts
    ? {
        consensus: n(ptc?.targetConsensus), median: n(ptc?.targetMedian), high: n(ptc?.targetHigh), low: n(ptc?.targetLow),
        asOf: asOfOf(bundle.priceTargetConsensus),
        lastMonthCount: n(pts?.lastMonthCount), lastMonthAverage: n(pts?.lastMonthAvgPriceTarget),
        lastQuarterCount: n(pts?.lastQuarterCount), lastQuarterAverage: n(pts?.lastQuarterAvgPriceTarget),
      }
    : null;

  const g = rows(bundle.gradesConsensus)[0];
  // Missing buckets are unknown, not zero. A total requires all five actual counts.
  const gradeCounts: MarketData["gradeCounts"] = g && [g.strongBuy, g.buy, g.hold, g.sell, g.strongSell].every((value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    ? {
        strongPositive: n(g.strongBuy)!, positive: n(g.buy)!, neutral: n(g.hold)!,
        negative: n(g.sell)!, strongNegative: n(g.strongSell)!, asOf: asOfOf(bundle.gradesConsensus),
      }
    : null;

  const si = bundle.shortInterest?.ok ? bundle.shortInterest.value.data : null;
  const settlement = si ? day(si.settlementDate) : null;
  const shortInterest: MarketData["shortInterest"] = si && settlement && Number.isFinite(si.currentShortPositionQuantity)
    ? { shares: si.currentShortPositionQuantity, daysToCover: si.daysToCoverQuantity, averageDailyVolume: si.averageDailyVolumeQuantity, settlementDate: settlement, changePct: si.changePercent }
    : null;

  const estimates = estimateRows.map(({ row, date }) => ({
    fiscalYearEnd: date,
    revenueAvg: n(row.revenueAvg), revenueLow: n(row.revenueLow), revenueHigh: n(row.revenueHigh),
    epsAvg: n(row.epsAvg), epsLow: n(row.epsLow), epsHigh: n(row.epsHigh),
    analystsRevenue: n(row.numAnalystsRevenue), analystsEps: n(row.numAnalystsEps),
  }));
  if (!quote && !shares && !enterpriseValue && estimates.length === 0 && !priceTarget && !gradeCounts && !shortInterest) return undefined;
  return {
    version: "1",
    currency: currencies.trading,
    estimateCurrency,
    estimateCurrencyBasis: (estimateCurrency !== null && inheritedAny) || (estimateCurrency === null && (estimates.length > 0 || ptc)) ? issuer.basis : null,
    quote,
    shares,
    enterpriseValue,
    estimates,
    estimatesAsOf: asOfOf(bundle.analystEstimates),
    priceTarget,
    gradeCounts,
    shortInterest,
  };
}
