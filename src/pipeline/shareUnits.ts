import type { DataBundle } from "./types";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { filerShareUnitRepair } from "@/edgar/shareUnitRepair";
import { quotePriceObservationDay } from "./stageB/priceCurrency";

/** Re-admit a documented primary-unit refusal in a frozen calculation view. */
export function withFilerShareUnits(bundle: DataBundle): DataBundle {
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
