import type { CompanyFacts } from "@/edgar/xbrl";
import type { EdgarBundle } from "@/pipeline/types";
import type { FetchResult } from "@/types/core";
import { sameEntitySymbol } from "@/symbol";

export type IssuerFactsInput = Pick<EdgarBundle, "companyFacts"> & Partial<Pick<EdgarBundle, "cik" | "registrant">>;

function cik(value: unknown): string | null {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : typeof value === "string" ? value : "";
  return /^\d{1,10}$/.test(text) && Number(text) > 0 ? text.replace(/^0+/, "") : null;
}

/** SEC answering an FMP-supplied CIK does not establish the requested issuer. */
export function confirmedIssuerFacts(symbol: string, edgar: IssuerFactsInput | undefined): CompanyFacts | null {
  if (!edgar?.cik?.ok || !edgar.companyFacts?.ok || edgar.companyFacts.value.source !== "edgar") return null;
  const mapping = edgar.cik.value.data;
  const mappedCik = cik(mapping.cik);
  const facts = edgar.companyFacts.value.data as CompanyFacts | null;
  if (mappedCik === null || cik(mapping.cik10) !== mappedCik || facts === null || typeof facts !== "object" ||
      cik(facts.cik) !== mappedCik || facts.facts === null || typeof facts.facts !== "object") return null;
  const requested = symbol.trim().toUpperCase();
  if (requested === "") return null;
  const secMapping = edgar.cik.value.source === "edgar" && sameEntitySymbol(requested, mapping.ticker);
  const registrant = edgar.registrant;
  const secRegistrant = registrant != null && cik(registrant.cik10) === mappedCik &&
    registrant.tickers.some((ticker) => sameEntitySymbol(requested, ticker));
  return secMapping || secRegistrant ? facts : null;
}

/** Calculation view only: keep the original response in the bundle for audit. */
export function admittedIssuerFacts(symbol: string, edgar: IssuerFactsInput | undefined): FetchResult<CompanyFacts> | null {
  const result = edgar?.companyFacts;
  if (result === undefined) return null;
  if (!result.ok || confirmedIssuerFacts(symbol, edgar) !== null) return result;
  return { ok: false, gap: {
    field: "edgar.companyFacts.issuerIdentity",
    reason: `SEC companyfacts were retained as source observations but excluded from calculations because their issuer identity is not independently confirmed for ${symbol.trim().toUpperCase()}.`,
    severity: "warn",
  } };
}

/** D-286 (P5): historical rows may name the retained predecessor itself.
 * This establishes that row's issuer only; it never proves successor continuity.
 */
export function statementIssuerFacts(symbol: string, edgar: EdgarBundle | undefined, rowCik: unknown, observedAt: string): CompanyFacts | null {
  const own = confirmedIssuerFacts(symbol, edgar);
  if (!own || rowCik == null || cik(rowCik) === cik(own.cik)) return own;
  const prior = edgar?.predecessor;
  const observed = (value: string | null) => value !== null && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.parse(observedAt);
  return prior && cik(rowCik) === cik(prior.cik10) && cik(prior.facts.cik) === cik(prior.cik10) &&
    observed(prior.fetchedAt) && observed(prior.via.filed) && prior.via.accession !== "" && prior.via.successorFormAccession !== ""
    ? prior.facts : null;
}
