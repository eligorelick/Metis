import { establishedIsoCode } from "@/pipeline/estimateCurrency";
import { sameShareBasis } from "@/edgar/splits";
import type { DataBundle } from "./types";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { filerShareUnitRepair } from "@/edgar/shareUnitRepair";
import { quotePriceObservationDay } from "./stageB/priceCurrency";
import { guardVendorShareFields, vendorShareUnitShownAcross, type PrimaryShareReconciliation } from "./keyless";
import { resolveForeignShareRatio, resolveForeignValuation } from "./foreignCurrency";

/** Same-period filed admission for fresh inputs and immutable frozen replay. */
function withFiledShareValues(bundle: DataBundle): DataBundle {
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const acquired = bundle.edgar?.companyFacts?.ok ? bundle.edgar.companyFacts.value.fetchedAt : null;
  const splitBasis = bundle.edgar?.shareBasis;
  if (!facts || !acquired || !Number.isFinite(Date.parse(acquired)) || Date.parse(acquired) > Date.parse(bundle.builtAt) || !splitBasis) return bundle;
  const profile = bundle.profile?.ok ? bundle.profile.value.data.rows[0] : null;
  const foreign = profile?.isAdr === true ? resolveForeignShareRatio(bundle).basis : null;
  const gaps = [...bundle.gaps];
  const names = ["incomeAnnual", "incomeQuarterly"] as const;
  const reconciliationFor = (name: (typeof names)[number]): PrimaryShareReconciliation => (
    { companyFacts: facts, observedAt: acquired, isAdr: typeof profile?.isAdr === "boolean" ? profile.isAdr : null,
      registrantTickers: bundle.edgar.registrant?.tickers, fiscalYearEnd: bundle.edgar.registrant?.fiscalYearEnd ?? null,
      period: name === "incomeAnnual" ? "annual" : "quarter", reconcileFiled: true,
      ordinarySharesPerQuotedUnit: foreign?.ratio, quotedUnitSourceIds: foreign?.securityEvidence.flatMap(e => e.sourceIds) });
  // D-234 (P3, P8): with several listed symbols, a series that shows the vendor's share unit governs the
  // other, as in the producer. Asked of the annual rows alone, a lone doubled year was never compared.
  // Only a vendor series is evidence of the vendor's unit: a series rebuilt from SEC facts agrees with them
  // by construction, so it is left out here exactly as the producer leaves it out.
  const shareUnitShown = vendorShareUnitShownAcross(names.flatMap(name => {
    const input = bundle.statements[name];
    return input.ok && input.value.source !== "edgar" ? [{ rows: input.value.data.rows, reconciliation: reconciliationFor(name) }] : [];
  }), splitBasis.splits, splitBasis.basisDay);
  const family = (name: (typeof names)[number]) => {
    const input = bundle.statements[name];
    if (!input.ok) return input;
    const result = guardVendorShareFields(input.value.data.rows, [], splitBasis.splits, splitBasis.basisDay,
      shareUnitShown ? { ...reconciliationFor(name), shareUnitShown } : reconciliationFor(name));
    for (const { date, field, reason } of result.reconciled) gaps.push({ field: `statements.income.${date}.${field}.filedReconciliation`, reason, severity: "info", expected: true });
    for (const { date, field, reason } of result.withheld) gaps.push({ field: `statements.income.${date}.${field}`, reason, severity: "warn" });
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows: result.rows } } };
  };
  return { ...bundle, statements: { ...bundle.statements, incomeAnnual: family("incomeAnnual"), incomeQuarterly: family("incomeQuarterly") }, gaps };
}

/** Re-admit a documented primary-unit refusal in a frozen calculation view. */
export function withFilerShareUnits(bundle: DataBundle): DataBundle {
  bundle = withFiledShareValues(bundle);
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const profile = bundle.profile?.ok ? bundle.profile.value.data.rows[0] : null;
  const quote = bundle.quote?.ok ? bundle.quote.value.data.rows[0] : null;
  const tickers = bundle.edgar?.registrant?.tickers;
  const acquired = bundle.edgar?.companyFacts?.ok ? bundle.edgar.companyFacts.value.fetchedAt : null;
  const quoteDay = quotePriceObservationDay(quote ?? undefined);
  if (!facts || !acquired || Date.parse(acquired) > Date.parse(bundle.builtAt) || !Number.isFinite(Date.parse(acquired)) ||
      profile?.isAdr !== false || !tickers || tickers.length !== 1 || tickers[0] !== bundle.symbol ||
      !quoteDay || quoteDay > bundle.builtAt.slice(0, 10) ||
      !(typeof quote?.price === "number" && quote.price > 0 && typeof quote.marketCap === "number" && quote.marketCap > 0) ||
      bundle.edgar.shareBasis?.splits.unresolved.length) return bundle;
  const gaps = [...bundle.gaps];
  const family = (name: "incomeAnnual" | "incomeQuarterly") => {
    const input = bundle.statements[name];
    if (!input.ok) return input;
    const rows = input.value.data.rows.map(row => {
      let out = row;
      if (Number(row.cik) !== facts.cik || row.reportedCurrency !== profile.currency ||
          bundle.edgar.shareBasis?.splits.events.some(e => e.date > String(row.date) && e.date <= bundle.builtAt.slice(0, 10))) return row;
      for (const field of ["weightedAverageShsOut", "weightedAverageShsOutDil"] as const) {
        const conflict = row.fieldConflicts?.[field];
        if (conflict?.usable !== false || row[field] != null || !conflict.secEvidence ||
            typeof conflict.vendorValue !== "number" || typeof conflict.secValue !== "number" ||
            conflict.secEvidence.periodEnd !== row.date ||
            (row.periodStart != null && row.periodStart !== conflict.secEvidence.periodStart) ||
            (row.filingDate != null && !conflict.secEvidence.filings.some(f => f.filed === row.filingDate))) continue;
        const repair = filerShareUnitRepair({ facts, vendor: conflict.vendorValue, filed: conflict.secValue, proof: conflict.secEvidence,
          marketShares: quote.marketCap! / quote.price!, cutoff: bundle.builtAt.slice(0, 10) });
        if (!repair) continue;
        const fieldConflicts = { ...out.fieldConflicts };
        delete fieldConflicts[field];
        out = { ...out, [field]: repair.value, fieldConflicts };
        gaps.push({ field: `statements.income.${row.date}.${field}.shareUnitRepair`, severity: "info", expected: true, reason: repair.basis });
      }
      return out;
    });
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows } } };
  };
  return { ...bundle, statements: { ...bundle.statements, incomeAnnual: family("incomeAnnual"), incomeQuarterly: family("incomeQuarterly") }, gaps };
}

/** D-272: presentation-only indicated annual rate; never a trailing yield or score input. */
export function indicatedDividendYield(bundle: DataBundle, declaration: { amount: number | null; currency: string | null; frequency: string | null | undefined; declarationAsOf: string | null; source: string; shareUnit: "ordinary" | "ADS" | null }) {
  const quote=bundle.quote?.ok ? bundle.quote.value.data.rows[0] : undefined;
  const profile=bundle.profile?.ok ? bundle.profile.value.data.rows[0] : undefined;
  const quoteDate=quotePriceObservationDay(quote);
  const quoteCurrency=establishedIsoCode(profile?.currency);
  const payments=({quarterly:4,monthly:12,"semi-annual":2,annual:1} as Record<string,number>)[declaration.frequency ?? ""] ?? null;
  const price=typeof quote?.price==="number" && quote.price>0 ? quote.price : null;
  let reason: string | null=null, ratio: number | null=null, fx=1, basis="";
  if (declaration.amount===null || !Number.isFinite(declaration.amount) || declaration.amount<0) reason="No admitted declared dividend per share is available.";
  else if (!payments) reason="A recurring dividend payment frequency is not proven; special, supplemental and variable dividends are not annualized.";
  else if (!quoteDate || !price || !declaration.declarationAsOf || declaration.declarationAsOf>quoteDate || quoteDate>bundle.builtAt.slice(0,10)) reason="A compatible dated declaration and positive dated quote are required.";
  else if (!bundle.edgar?.shareBasis || sameShareBasis(bundle.edgar.shareBasis.splits,declaration.declarationAsOf,quoteDate)!==null) reason="Share basis between declaration and quote is unestablished or a split intervenes.";
  else if (profile?.isAdr===false && declaration.shareUnit==="ordinary") ratio=1;
  else if (profile?.isAdr===true && declaration.shareUnit!==null) {
    const proof=resolveForeignShareRatio(bundle);
    if (!proof.basis || proof.basis.securityEvidence.some(e=>e.effectiveFrom>declaration.declarationAsOf!)) reason=proof.reason ?? "The ADS ratio is not proven at the declaration date.";
    else {ratio=proof.basis.ratio;basis=proof.basis.note;}
  } else reason="The declared dividend share unit is not established against the quote; an ADS requires independent ratio proof.";
  if (!reason && (!declaration.currency || !quoteCurrency)) reason="Dividend and quote currencies are unestablished.";
  if (!reason && declaration.currency!==quoteCurrency) {
    const foreign=resolveForeignValuation(bundle,declaration.currency);
    if (!foreign.basis || quoteCurrency!=="USD") reason=foreign.reason ?? "No admitted currency conversion for the dividend and quote.";
    else {fx=foreign.basis.fx.usdPerReportingUnit;basis += ` ${foreign.basis.note}`;}
  }
  const annualizedPerQuotedShare=reason===null && ratio!==null ? declaration.amount!*payments!*(declaration.shareUnit==="ADS" ? 1 : ratio)*fx : null;
  return {value:annualizedPerQuotedShare===null ? null : annualizedPerQuotedShare/price!*100, annualizedPerQuotedShare,
    declaredPerShare:declaration.amount, paymentsPerYear:payments, ordinarySharesPerQuotedUnit:ratio, price,quoteDate,
    basis,quoteSource:bundle.quote?.ok ? `${bundle.quote.value.source}: ${bundle.quote.value.endpoint}` : "Quote unavailable",declarationAsOf:declaration.declarationAsOf,source:declaration.source,currency:quoteCurrency,reason};
}
