import type { DataBundle } from "@/pipeline/types";
import type { ValuationFx } from "@/pipeline/fx";
import { selectValuationFx } from "@/pipeline/fx";
import { resolveSecurityBasis, type SecurityBasisEvidence } from "@/pipeline/stageB/securityBasis";
import { comparePriceCurrency, quotePriceObservationDay } from "@/pipeline/stageB/priceCurrency";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { conceptFactsSchema, CORE_FACT_FORMS, parseFactPoints, type FactPoint } from "@/edgar/xbrl";
import { createHash } from "node:crypto";
import type { ValuationBundleInputs, DcfAssumptionInputs } from "@/pipeline/stageB/valuation";
import type { ProjectionsInputs } from "@/pipeline/stageB/projections";

export interface ForeignValuationBasis {
  fx: ValuationFx;
  ratio: number;
  securityEvidence: SecurityBasisEvidence[];
  quotedShares: number;
  marketCapUsd: number;
  note: string;
}
export function resolveForeignValuation(bundle: DataBundle, reportingCurrency: string | null): { basis: ForeignValuationBasis | null; reason: string | null } {
  const profile = bundle.profile?.ok ? bundle.profile.value.data.rows[0] : undefined;
  if (reportingCurrency === profile?.currency || comparePriceCurrency(reportingCurrency, typeof profile?.currency === "string" ? profile.currency : null).comparable) return { basis: null, reason: null };
  const refuse = (reason: string) => ({ basis: null, reason });
  const quote = bundle.quote?.ok ? bundle.quote.value.data.rows[0] : undefined;
  const quoteDate = quotePriceObservationDay(quote);
  const selected = selectValuationFx(reportingCurrency, typeof profile?.currency === "string" ? profile.currency : null, quoteDate, bundle.valuationFx);
  if (!selected.rate) return refuse(selected.reason);
  const security = resolveForeignShareRatio(bundle);
  if (!security.basis) return refuse(security.reason ?? "quoted-unit security evidence is absent");
  const fx = selected.rate;
  const note = `Valuation translated at one spot rate (constant currency): all reporting-currency monetary valuation inputs and historical levels use ${fx.usdPerReportingUnit} USD per ${fx.reportingCurrency}; ` +
    `FRED ${fx.series}, ${fx.observation.date}, native value ${fx.observation.value}, quote date ${quoteDate}. Source statements and source amounts in basis notes remain in ${fx.reportingCurrency}. Historical growth rates are unchanged by translation. ` +
    security.basis.note + ` USD cash flows are discounted at the USD-based rate; intrinsic values are USD per ${security.basis.securityEvidence[0]?.quoteUnit === "ordinary" ? "quoted common share" : "ADS"}. Analyst rows without an established currency/share basis remain withheld. Historical price-multiple bands require their own dated FX/security evidence and remain withheld.`;
  return { basis: { ...security.basis, fx, note }, reason: null };
}

/** Quoted-unit corroboration is independent of FX; native EPS needs no exchange rate. */
export function resolveForeignShareRatio(bundle: DataBundle): { basis: Omit<ForeignValuationBasis, "fx"> | null; reason: string | null } {
  const profile = bundle.profile?.ok ? bundle.profile.value.data.rows[0] : undefined;
  const quote = bundle.quote?.ok ? bundle.quote.value.data.rows[0] : undefined;
  const quoteDate = quotePriceObservationDay(quote);
  const refuse = (reason: string) => ({ basis: null, reason });
  if (!quoteDate) return refuse("dated quote is absent");
  if (!bundle.builtAt || !validDay(bundle.builtAt.slice(0, 10))) return refuse("analysis cutoff is not established");
  if (quoteDate! > bundle.builtAt.slice(0, 10)) return refuse("quote date is after the analysis cutoff");
  // A directly listed ordinary share requires the same two independent count
  // constructions, and both must prove 1:1. An unknown listing is never guessed.
  if (profile?.isAdr !== true && profile?.isAdr !== false) return refuse("foreign quoted-unit identity is not established as an ADS or an ordinary listing");
  const ordinaryListing = profile.isAdr === false;
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  if (!facts) return refuse("independent SEC issuer/share evidence is absent");
  if (bundle.economicShareEvidence?.length || bundle.edgar.economicShareInventory?.some(i => i.classes.length > 1)) return refuse("common-class economic coverage needs separate resolution");
  if (bundle.edgar.shareBasis?.splits.unresolved.length) return refuse("share split history is unresolved");
  const outstanding = bundle.sharesFloat?.ok ? bundle.sharesFloat.value.data.rows[0] : undefined;
  const quotedShares = outstanding?.outstandingShares;
  const cap = quote?.marketCap, price = quote?.price;
  const floatDay = typeof outstanding?.date === "string" ? outstanding.date.slice(0, 10) : "";
  // The provider re-stamps its share-count row on each refresh, so the row can be
  // dated after the quote day while carrying the same count. A count observed
  // within 7 days of the quote and before the analysis cutoff is not hindsight.
  if (!positive(quotedShares) || !positive(cap) || !positive(price) || !validDay(floatDay) ||
    Math.abs(days(floatDay, quoteDate!)) > 7 || floatDay > bundle.builtAt.slice(0, 10) || !agrees(cap / price, quotedShares, 0.01)) {
    return refuse("dated quoted shares and market cap / price identity are absent or disputed (1% tolerance)");
  }
  const points = (namespace: string, tag: string, unit = "shares"): FactPoint[] => {
    const concept = conceptFactsSchema.safeParse(facts.facts[namespace]?.[tag]);
    return concept.success ? parseFactPoints(concept.data.units[unit] ?? []).filter(p => CORE_FACT_FORMS.has(p.form) &&
      validDay(p.end) && validDay(p.filed) && p.end <= quoteDate! && p.filed <= bundle.builtAt.slice(0, 10) &&
      p.filed >= p.end && positive(p.val) && /^\d{10}-\d{2}-\d{6}$/.test(p.accn)) : [];
  };
  const recentOutstanding = (ps: FactPoint[]) => ps.filter(p => !p.start && days(p.end, quoteDate!) <= 400)
    .sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed));
  const deiOutstanding = recentOutstanding(points("dei", "EntityCommonStockSharesOutstanding"));
  // D-186: IFRS issuers may tag their outstanding count only in the IFRS
  // namespace. Issued/authorized shares and monetary treasury stock are not
  // synonyms. Keep an established DEI path unchanged; all age/identity,
  // disagreement and independent weighted-average checks still apply.
  const current = deiOutstanding.length ? deiOutstanding : recentOutstanding(points("ifrs-full", "NumberOfSharesOutstanding"));
  const cover = current[0];
  if (!cover) return refuse("filed ordinary outstanding count is absent or older than 400 days");
  if (current.some(p => p.end === cover.end && p.filed === cover.filed && p.val !== cover.val)) return refuse("filed outstanding count is disputed");
  let ratio = standardRatio(cover.val / quotedShares);
  // D-188: a cover exactly equal to issued shares can include treasury.
  // It cannot itself be used as outstanding; only the independent weighted
  // construction may then identify a standard receipt ratio.
  const issued = points("ifrs-full", "NumberOfSharesIssued").filter(p => !p.start && p.end === cover.end &&
    p.accn === cover.accn && p.filed === cover.filed && p.form === cover.form);
  const issuedCover = ratio === null && issued.length > 0 && issued.every(p => agrees(cover.val, p.val, 0.001));
  if (ratio === null && !issuedCover) return refuse(ordinaryListing
    ? "filed ordinary / quoted outstanding counts do not establish one-for-one ordinary units within 1%"
    : "filed ordinary / quoted outstanding counts do not establish a standard ADS ratio within 1%");
  if (ordinaryListing && ratio !== 1) return refuse("non-ADR ordinary listing requires independently corroborated one-for-one share units");
  const annual = bundle.statements.incomeAnnual;
  if (!annual.ok || annual.value.source !== "fmp") return refuse("independent provider weighted-average count evidence is absent");
  const weighted = [
    ...points("ifrs-full", "WeightedAverageShares"),
    ...points("us-gaap", "WeightedAverageNumberOfSharesOutstandingBasic"),
  ].filter(p => p.start && days(p.start, p.end) >= 350 && days(p.start, p.end) <= 380 && days(p.end, quoteDate!) <= 3 * 366)
    .sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed));
  let weightedMatch: { fact: FactPoint; provider: number } | null = null;
  for (const p of weighted) {
    const row = annual.value.data.rows.find(r => r.date === p.end && positive(r.weightedAverageShsOut));
    if (!row) continue;
    // A contradictory newest common period cannot be rescued by an older match.
    const samePeriod = weighted.filter(v => v.end === p.end && v.filed === p.filed);
    const weightedRatio = standardRatio(p.val / row.weightedAverageShsOut!);
    if (samePeriod.some(v => v.val !== p.val) || weightedRatio === null || (ratio !== null && weightedRatio !== ratio)) return refuse("filed/provider weighted-average ratio disputes the outstanding-share ADS ratio");
    if (issuedCover) ratio = weightedRatio;
    weightedMatch = { fact: p, provider: row.weightedAverageShsOut! };
    break;
  }
  if (!weightedMatch || ratio === null) return refuse("a second independent filed/provider weighted-average ratio is absent");
  const declared = points("dei", "EntityListingDepositoryReceiptRatio", "pure").sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed))[0];
  if (declared && declared.val !== ratio) return refuse("filed depositary receipt ratio disputes inferred count ratios");
  // Counts can have different split bases. Do not bridge a split between the
  // historical corroboration and today's quote by guessing a restatement.
  if (bundle.edgar.shareBasis?.splits.events.some(e => e.date > weightedMatch.fact.end && e.date <= quoteDate!)) return refuse("a split intervenes between ratio corroboration and the quote");
  const evidence = [
    { fact: cover, provider: quotedShares, endpoint: bundle.sharesFloat.ok ? bundle.sharesFloat.value.endpoint : "", label: issuedCover ? "issued-cover identity; ratio from independent weighted count" : "outstanding" },
    { fact: weightedMatch.fact, provider: weightedMatch.provider, endpoint: annual.value.endpoint, label: "weighted-average" },
  ].map(({ fact, provider, endpoint, label }): SecurityBasisEvidence => ({ issuerId: String(facts.cik).padStart(10, "0"), securityId: bundle.symbol,
    ordinaryClassId: "ordinary", quoteUnit: ordinaryListing ? "ordinary" : "ADS", ordinarySharesPerQuotedUnit: ratio!, effectiveFrom: fact.end, effectiveTo: null,
    sourceHash: createHash("sha256").update(JSON.stringify({ fact, provider, endpoint, label })).digest("hex"),
    sourceIds: [`https://www.sec.gov/Archives/edgar/data/${facts.cik}/${fact.accn.replaceAll("-", "")}/`, `${endpoint} (${label} count ${provider})`],
  }));
  if (!resolveSecurityBasis(evidence, quoteDate!)) return refuse("security identity or effective-dated ratios disagree");
  const note = (ordinaryListing
      ? "Verified one-for-one ordinary listing: 1 quoted common share = 1 filed ordinary share, corroborated by independent filed/provider outstanding and weighted-average counts (1% tolerance); "
      : issuedCover
      ? `1 ADS = ${ratio} ordinary shares: the cover count equals same-filing issued shares within 0.1%, so it may include treasury; the independent filed/provider weighted-average ratio establishes the standard ratio within 1%. The issued cover is not treated as outstanding; `
      : `1 ADS = ${ratio} ordinary shares, corroborated by filed ordinary/provider quoted outstanding and independently matched weighted-average counts (1% tolerance); `) +
    `market cap / price = ${cap / price} ${ordinaryListing ? "ordinary shares" : "ADS"} versus provider ${quotedShares}. ` +
    `Sources: ${evidence.flatMap(e => e.sourceIds).join("; ")}.`;
  return { basis: { ratio, securityEvidence: evidence, quotedShares, marketCapUsd: cap, note }, reason: null };
}

const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const validDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const days = (a: string, b: string): number => (Date.parse(b) - Date.parse(a)) / 86_400_000;
const agrees = (a: number, b: number, tolerance: number): boolean => Math.abs(a / b - 1) <= tolerance;
const STANDARD_RATIOS = [0.1, 0.2, 0.25, 0.5, 1, 2, 3, 4, 5, 8, 10, 20, 25, 50, 100];
const standardRatio = (ratio: number): number | null => STANDARD_RATIOS.find(r => agrees(ratio, r, 0.01)) ?? null;

/** A recent average can identify its unit, but never replaces a diluted count. */
export function quotedDilutedCount(count: number | null, basis: ForeignValuationBasis): number | null {
  if (!positive(count)) return null;
  if (agrees(count, basis.quotedShares, 0.01)) return count;
  if (basis.ratio !== 1 && agrees(count, basis.quotedShares * basis.ratio, 0.01)) return count / basis.ratio;
  return null;
}

/** Explicit monetary operands only. Percentages, dates, counts and source facts never change. */
function money<T extends object>(row: T, keys: readonly string[], basis: ForeignValuationBasis): T {
  const k = basis.fx.usdPerReportingUnit;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (key === "fieldProvenance" && value && typeof value === "object") return [key, Object.fromEntries(Object.entries(value).map(([field, proof]) => {
      if (!keys.includes(field) || !proof || typeof proof !== "object" || !("unit" in proof) || proof.unit !== basis.fx.reportingCurrency) return [field, proof];
      return [field, { ...proof, unit: "USD", originalUnit: proof.unit, currencyTranslation: basis.fx }];
    }))];
    return [key, keys.includes(key) && typeof value === "number" ? value * k : value];
  })) as T;
}
const INCOME_MONEY = ["revenue", "operatingIncome", "grossProfit", "incomeBeforeTax", "incomeTaxExpense", "unusualOperatingItems", "depreciationAndAmortization", "netIncome", "netIncomeAvailableToCommon", "preferredDividendsPaid", "noncontrollingIncome"];
const BALANCE_MONEY = ["totalDebt", "cashAndCashEquivalents", "shortTermInvestments", "cashAndShortTermInvestments", "marketableEquitySecurities", "totalStockholdersEquity", "totalEquity", "goodwill", "intangibleAssets", "minorityInterest", "preferredStock", "temporaryEquity", "temporaryEquityAttributableToParent", "temporaryEquityAttributableToNoncontrollingInterest", "commonEquity", "capitalLeaseObligations", "financeLeaseLiability", "operatingLeaseLiability", "shortTermDebt", "longTermDebt", "longTermInvestments"];

function translatedDcf(d: DcfAssumptionInputs, basis: ForeignValuationBasis): DcfAssumptionInputs {
  const k = basis.fx.usdPerReportingUnit;
  return { ...d, reportedCurrency: "USD", waccBasis: `${d.waccBasis ?? ""} ${basis.note}`,
    incomeTtm: d.incomeTtm && money(d.incomeTtm, INCOME_MONEY, basis),
    incomeHistory: d.incomeHistory.map(r => money(r, INCOME_MONEY, basis)),
    balance: d.balance && money(d.balance, BALANCE_MONEY, basis),
    capitalHistory: d.capitalHistory?.map(r => money(r, BALANCE_MONEY, basis)),
    equityMethodStake: d.equityMethodStake && { ...d.equityMethodStake, value: d.equityMethodStake.value * k, basis: `${d.equityMethodStake.basis} ${basis.note}` },
    fcfSbc: d.fcfSbc && { ...money(d.fcfSbc, ["beforeSbc", "afterSbc", "sbc"], basis), basis: `${d.fcfSbc.basis} ${basis.note}` },
    unusualOperatingItems: d.unusualOperatingItems && { ...d.unusualOperatingItems, value: d.unusualOperatingItems.value * k, components: d.unusualOperatingItems.components.map(c => money(c, ["value"], basis)), basis: `${d.unusualOperatingItems.basis} ${basis.note}` },
    analystEstimates: d.analystEstimates?.map(r => money(r, ["revenueAvg", "revenueLow", "revenueHigh"], basis)) ?? null,
    quarterRevenue: d.quarterRevenue && { ...d.quarterRevenue,
      latest: money(d.quarterRevenue.latest, ["revenue"], basis),
      yearAgo: d.quarterRevenue.yearAgo && money(d.quarterRevenue.yearAgo, ["revenue"], basis),
      guidedYearAgo: d.quarterRevenue.guidedYearAgo && money(d.quarterRevenue.guidedYearAgo, ["revenue"], basis),
      guidedYearAgoWindow: d.quarterRevenue.guidedYearAgoWindow?.map(r => money(r, ["revenue"], basis)),
    },
    guidance: d.guidance && { ...money(d.guidance, ["revenue", "revenueLow", "revenueHigh"], basis), currency: "USD",
      annualRevenueComparison: d.guidance.annualRevenueComparison && { ...money(d.guidance.annualRevenueComparison, ["low", "high"], basis), currency: "USD" } },
    fiscalYearToDate: d.fiscalYearToDate && money(d.fiscalYearToDate, ["revenue"], basis),
    revenueSeasonality: d.revenueSeasonality && { ...d.revenueSeasonality, quarters: d.revenueSeasonality.quarters.map(r => money(r, ["revenue"], basis)) },
  };
}

/** Translate the admitted calculation view; provider bundles remain immutable. */
export function translateValuationInputs(input: ValuationBundleInputs, basis: ForeignValuationBasis): ValuationBundleInputs {
  const k = basis.fx.usdPerReportingUnit;
  const d = quotedDilutedCount(input.dilutedShares, basis);
  const inc = input.multiples.incomeTtm;
  const translatedInc = inc && money(inc, INCOME_MONEY, basis);
  if (translatedInc) {
    // Currency/share labels here describe the derived operands, not raw SEC facts.
    for (const key of ["incomeScope", "commonIncomeScope", "preferredCashScope", "noncontrollingIncomeScope", "targetScope"] as const) {
      if (translatedInc[key]) translatedInc[key] = { ...translatedInc[key], currency: "USD" };
    }
    translatedInc.commonIncomeQuarters = inc!.commonIncomeQuarters?.map(r => money(r, ["value"], basis));
    // Price/common-income remains available when a provider's EPS unit cannot
    // independently reconcile. Never multiply an already per-ADS EPS twice.
    const eps = inc!.epsDiluted;
    const net = inc!.netIncomeAvailableToCommon ?? inc!.netIncome;
    const epsUnits = positive(eps) && positive(net) && positive(d)
      ? [1, ...(basis.ratio === 1 ? [] : [basis.ratio])].filter(r => agrees(eps * r, net / d, 0.03)) : [];
    translatedInc.epsDiluted = epsUnits.length === 1 ? eps! * epsUnits[0] * k : null;
    translatedInc.epsSecurityBasis = "quoted";
  }
  return { ...money(input, ["netDebt", "minorityInterest", "preferred", "leaseLiability", "operatingLeaseLiability", "convertiblePreferredClaim"], basis),
    dilutedShares: d, dilutedShareSecurityBasis: d === null ? undefined : "quoted",
    bridgeBalance: input.bridgeBalance && { ...money(input.bridgeBalance, BALANCE_MONEY, basis), reportedCurrency: "USD" },
    nonOperatingAssets: input.nonOperatingAssets && { ...input.nonOperatingAssets, value: input.nonOperatingAssets.value * k, basis: `${input.nonOperatingAssets.basis} ${basis.note}` },
    noncontrollingEarnings: input.noncontrollingEarnings && money(input.noncontrollingEarnings, ["noncontrollingIncome", "consolidatedProfit"], basis),
    staleNoncontrollingEarnings: input.staleNoncontrollingEarnings && money(input.staleNoncontrollingEarnings, ["noncontrollingIncome", "consolidatedProfit"], basis),
    temporaryEquity: input.temporaryEquity && money(input.temporaryEquity, ["total", "capitalTotal", "redeemablePreferred", "redeemableNoncontrolling", "unsplit"], basis),
    debtLikeObligations: input.debtLikeObligations && Object.fromEntries(Object.entries(input.debtLikeObligations).map(([key, row]) => [key, row && { ...row, value: row.value * k, basis: `${row.basis} ${basis.note}` }])) as ValuationBundleInputs["debtLikeObligations"],
    convertibles: input.convertibles?.map(r => ({ ...r, claim: r.claim === null ? null : r.claim * k, conversionShares: r.conversionShares / basis.ratio,
      conversionPrice: r.conversionPrice === null ? null : r.conversionPrice * k * basis.ratio, basis: `${r.basis} ${basis.note}` })),
    dcfInputs: input.dcfInputs && translatedDcf(input.dcfInputs, basis),
    multiples: { ...input.multiples, reportedCurrency: "USD", securityBasis: basis.securityEvidence,
      quote: { ...input.multiples.quote, marketCapSecurityBasis: "issuer-common" },
      incomeTtm: translatedInc,
      cashFlowTtm: input.multiples.cashFlowTtm && { ...money(input.multiples.cashFlowTtm, ["operatingCashFlow", "capitalExpenditure", "depreciationAndAmortization"], basis),
        annualDepreciationAndAmortization: input.multiples.cashFlowTtm.annualDepreciationAndAmortization && money(input.multiples.cashFlowTtm.annualDepreciationAndAmortization, ["value"], basis) },
      balance: input.multiples.balance && { ...money(input.multiples.balance, BALANCE_MONEY, basis), reportedCurrency: "USD" },
      ffoApprox: input.multiples.ffoApprox == null ? input.multiples.ffoApprox : input.multiples.ffoApprox * k,
      affoApprox: input.multiples.affoApprox == null ? input.multiples.affoApprox : input.multiples.affoApprox * k,
      quarterlyFundamentals: [], enterpriseValuesHistory: [], keyMetricsHistory: [],
    },
    excessReturn: input.excessReturn && { ...money(input.excessReturn, ["bookValue", "tangibleCommonEquity", "totalDebt", "convertiblePreferredClaim", "permanentPreferred"], basis), dilutedShares: d,
      startAlternative: input.excessReturn.startAlternative && money(input.excessReturn.startAlternative, ["bookValue", "convertiblePreferredClaim", "permanentPreferred"], basis),
      convertibles: input.excessReturn.convertibles?.map(r => ({ ...r, claim: r.claim === null ? null : r.claim * k, conversionShares: r.conversionShares / basis.ratio, conversionPrice: r.conversionPrice === null ? null : r.conversionPrice * k * basis.ratio })) },
    reit: input.reit && { ...money(input.reit, ["ffoApprox", "affoApprox", "noiApprox"], basis), shares: d,
      // valueCompany supplies the house EV from translated multiples. A
      // preassembled aggregate may contain a USD capitalization already.
      enterpriseValue: undefined },
  };
}

export function translateProjectionInputs(input: ProjectionsInputs, basis: ForeignValuationBasis): ProjectionsInputs {
  return { ...input, currency: "USD", dilutedShares: quotedDilutedCount(input.dilutedShares, basis),
    incomeHistory: input.incomeHistory.map(r => ({ ...money(r, ["revenue", "ebit", "netIncome", "interestExpense"], basis), epsDiluted: null })),
    fcfHistory: input.fcfHistory.map(r => money(r, ["fcf"], basis)),
    interestRunRate: input.interestRunRate && { ...money(input.interestRunRate, ["value"], basis), basis: `${input.interestRunRate.basis} ${basis.note}` },
    debtAtAnchor: input.debtAtAnchor && money(input.debtAtAnchor, ["debt"], basis),
    capitalReturn: input.capitalReturn && money(input.capitalReturn, ["authorizationRemaining"], basis),
  };
}
