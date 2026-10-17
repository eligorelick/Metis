import type { CompanyFacts } from "@/edgar/xbrl";
import type { EdgarBundle } from "@/pipeline/types";

function cik(value: unknown): string | null {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : typeof value === "string" ? value : "";
  return /^\d{1,10}$/.test(text) && Number(text) > 0 ? text.replace(/^0+/, "") : null;
}

/** SEC answering an FMP-supplied CIK does not establish the requested issuer. */
export function confirmedIssuerFacts(symbol: string, edgar: Pick<EdgarBundle, "cik" | "registrant" | "companyFacts"> | undefined): CompanyFacts | null {
  if (!edgar?.cik?.ok || !edgar.companyFacts?.ok || edgar.companyFacts.value.source !== "edgar") return null;
  const mapping = edgar.cik.value.data;
  const mappedCik = cik(mapping.cik);
  const facts = edgar.companyFacts.value.data as CompanyFacts | null;
  if (mappedCik === null || cik(mapping.cik10) !== mappedCik || facts === null || typeof facts !== "object" ||
      cik(facts.cik) !== mappedCik || facts.facts === null || typeof facts.facts !== "object") return null;
  const requested = symbol.trim().toUpperCase();
  if (requested === "") return null;
  const secMapping = edgar.cik.value.source === "edgar" && mapping.ticker.trim().toUpperCase() === requested;
  const registrant = edgar.registrant;
  const secRegistrant = registrant != null && cik(registrant.cik10) === mappedCik &&
    registrant.tickers.some((ticker) => ticker.trim().toUpperCase() === requested);
  return secMapping || secRegistrant ? facts : null;
}
