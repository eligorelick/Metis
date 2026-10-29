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

import { establishedCurrencyOn, statementCurrencyEvidence, statementCurrencies } from "@/pipeline/compute";
import { admitHistoricalEnterpriseValue, DERIVED_EV_ENDPOINT } from "@/report/enterpriseValueSafety";
import { inheritedIssuerCurrency, providerRowCurrency } from "@/pipeline/estimateCurrency";
import type { DataBundle } from "@/pipeline/types";
import type { MarketData } from "@/report/schema";
import { quotePriceObservationDay } from "@/providers/fmp";
import { completedTotalOmission, leaseDebtConflict, millions, type LeaseDebtInputs } from "@/pipeline/stageB/netDebt";

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

/** Balance dates whose total debt Stage B withheld (audit O-2), with the reason; a derived EV built on that debt is refused.
 * An info entry records a recovery, not a withhold. */
function stageBWithheldDebtDates(gaps: readonly { field: string; severity?: string; reason?: string }[] | undefined): Map<string, string> {
  return new Map((gaps ?? []).filter((gap) => gap.severity !== "info").flatMap((gap): [string, string][] => {
    const date = /^statements\.balance\.(\d{4}-\d{2}-\d{2})\.totalDebt$/.exec(gap.field)?.[1];
    return date === undefined ? [] : [[date, gap.reason ?? "total debt withheld"]];
  }));
}

const DEBT_FIELDS = ["totalDebt", "shortTermDebt", "longTermDebt", "capitalLeaseObligations", "operatingLeaseLiability", "financeLeaseLiability"] as const;

/**
 * Audit 2026-10-29, AMZN #51 (FIG-2; D-132): a provider EV is that date's
 * market cap + the vendor's total debt − cash. It is withheld when the
 * same-date balance's debt was refused (its operand cannot be checked) or was
 * composed from the filing because the vendor's own total was partial and the
 * operand differs from it. Returns the reason, or null to show it as served.
 */
function providerEnterpriseValueRefusal(ev: NonNullable<MarketData["enterpriseValue"]>, balances: readonly Row[], currency: string | null,
  currencyEvidence: ReturnType<typeof statementCurrencyEvidence>, withheld: ReadonlyMap<string, string>): string | null {
  const operand = ev.totalDebt === null ? "(not stated)" : millions(ev.totalDebt);
  for (const row of balances) {
    if (day(row.date) !== ev.periodEnd || currency === null || establishedCurrencyOn([row], ev.periodEnd, currencyEvidence) !== currency) continue;
    const conflicts = row.fieldConflicts as Record<string, { usable?: boolean; reason?: string }> | undefined;
    const refusedField = DEBT_FIELDS.find((field) => conflicts?.[field]?.usable === false);
    const refusal = withheld.get(ev.periodEnd) ?? (refusedField ? `${refusedField}: ${conflicts![refusedField]!.reason}` : null) ?? leaseDebtConflict(row as LeaseDebtInputs);
    if (refusal) return `the same-date balance's debt was refused (${refusal}), so the provider's debt operand ${operand} cannot be checked`;
    const total = n(row.totalDebt);
    const provenance = (row.fieldProvenance as Record<string, { calculation?: string; tags?: string[] }> | undefined)?.totalDebt;
    const composed = provenance?.calculation === "noncurrent-lease-line-completed";
    if (composed && total !== null && (ev.totalDebt === null || Math.abs(total - ev.totalDebt) > Math.max(1, Math.abs(total) * 1e-6))) {
      return `its debt operand ${operand} differs from the same-date total debt including leases ${millions(total)} composed from the filing, because the vendor's own total left out ${completedTotalOmission(provenance?.tags ?? [])}`;
    }
  }
  return null;
}

export function buildMarketData(bundle: DataBundle, options: { isAdr?: boolean; stageBGaps?: readonly { field: string; severity?: string; reason?: string }[] } = {}): MarketData | undefined {
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
  // Yahoo's chart carries no market cap, so one on a Yahoo quote is the keyless
  // price × filed share count, not a provider observation.
  const quoteSource = bundle.quote?.ok ? bundle.quote.value.source : null;
  const marketCapOrigin = n(q?.marketCap) === null ? undefined
    : quoteSource === "fmp" ? "provider" as const : quoteSource === "yahoo" ? "computed" as const : undefined;
  const quote: MarketData["quote"] = q
    ? {
        price: n(q.price), marketCap: n(q.marketCap), yearHigh: n(q.yearHigh), yearLow: n(q.yearLow),
        volume: n(q.volume), priceAvg50: n(q.priceAvg50), priceAvg200: n(q.priceAvg200), asOf: quotePriceObservationDay(q),
        ...(marketCapOrigin ? { marketCapOrigin } : {}),
      }
    : null;

  const sf = rows(bundle.sharesFloat)[0];
  const sharesAsOf = day(sf?.date) ?? day(asOfOf(bundle.sharesFloat));
  const floatAsOf = sf?.publicFloatPriceBasis === "latest quote" ? null : day(sf?.publicFloatAsOf) ?? sharesAsOf;
  const percentage = n(sf?.freeFloat);
  const outstanding = n(sf?.outstandingShares);
  const float = n(sf?.floatShares);
  const comparable = sharesAsOf !== null && floatAsOf === sharesAsOf &&
    (float === null || (float >= 0 && (outstanding === null || (outstanding > 0 && float <= outstanding))));
  const shares: MarketData["shares"] = sf && (n(sf.outstandingShares) !== null || n(sf.floatShares) !== null)
    ? { outstanding, float, freeFloatPct: comparable && percentage !== null && percentage >= 0 && percentage <= 100 ? percentage : null, asOf: sharesAsOf, floatAsOf }
    : null;

  const evRows = rows(bundle.enterpriseValues)
    .map((row) => ({ row, date: day(row.date) }))
    .filter((entry): entry is { row: Row; date: string } => entry.date !== null && n(entry.row.enterpriseValue) !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
  const ev = evRows[0];
  const enterpriseValue: MarketData["enterpriseValue"] = ev
    ? { value: n(ev.row.enterpriseValue)!, periodEnd: ev.date, marketCap: n(ev.row.marketCapitalization), totalDebt: n(ev.row.addTotalDebt), cash: n(ev.row.minusCashAndCashEquivalents) }
    : null;
  const evEnvelope = bundle.enterpriseValues?.ok ? bundle.enterpriseValues.value : null;
  const evOrigin = evEnvelope?.source === "computed" && evEnvelope.endpoint === DERIVED_EV_ENDPOINT ? "computed" as const
    : evEnvelope?.source === "fmp" ? "provider" as const : undefined;
  const currencyEvidence = statementCurrencyEvidence(bundle);
  const withheldDebt = stageBWithheldDebtDates(options.stageBGaps);
  const historicalEv = admitHistoricalEnterpriseValue(enterpriseValue, evOrigin, currencies.trading,
    [...rows(bundle.statements?.balanceQuarterly), ...rows(bundle.statements?.balanceAnnual)].map((row) => ({
      date: day(row.date) ?? "", currency: establishedCurrencyOn([row], day(row.date), currencyEvidence), value: n(row.totalDebt),
      usable: !withheldDebt.has(day(row.date) ?? "") && !["totalDebt", "shortTermDebt", "longTermDebt", "capitalLeaseObligations", "operatingLeaseLiability", "financeLeaseLiability"].some((field) =>
        (row.fieldConflicts as Record<string, { usable?: boolean }> | undefined)?.[field]?.usable === false),
    })));
  const providerRefusal = evOrigin === "provider" && historicalEv.enterpriseValue !== null
    ? providerEnterpriseValueRefusal(historicalEv.enterpriseValue, [...rows(bundle.statements?.balanceQuarterly), ...rows(bundle.statements?.balanceAnnual)], currencies.trading, currencyEvidence, withheldDebt)
    : null;
  if (providerRefusal !== null) {
    historicalEv.enterpriseValueNote = `Provider enterprise value withheld at ${historicalEv.enterpriseValue!.periodEnd}: ${providerRefusal}. The report's market EV is separate; no replacement value is inferred.`;
    historicalEv.enterpriseValue = null;
  }
  if (evOrigin === "computed" && historicalEv.enterpriseValue !== null) {
    const balance = [...rows(bundle.statements?.balanceQuarterly), ...rows(bundle.statements?.balanceAnnual)].find((row) =>
      day(row.date) === historicalEv.enterpriseValue!.periodEnd && establishedCurrencyOn([row], day(row.date), currencyEvidence) === currencies.trading);
    const current = n(balance?.shortTermDebt), noncurrent = n(balance?.longTermDebt), leases = n(balance?.capitalLeaseObligations);
    if (current !== null && noncurrent !== null && leases !== null && leases > 0 && historicalEv.enterpriseValue.totalDebt !== null &&
        Math.abs(current + noncurrent + leases - historicalEv.enterpriseValue.totalDebt) <= 1) {
      historicalEv.enterpriseValueNote = "This dated internal cash-only EV bridge uses current and noncurrent carrying debt plus the reported lease liabilities. It retains that historical source basis; the report's primary current EV uses its separately disclosed bridge.";
    }
  }

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
    ...historicalEv,
    estimates,
    estimatesAsOf: asOfOf(bundle.analystEstimates),
    priceTarget,
    gradeCounts,
    shortInterest,
  };
}
