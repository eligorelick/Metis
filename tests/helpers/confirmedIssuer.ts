import type { CompanyFacts } from "@/edgar/xbrl";
import type { DataBundle } from "@/pipeline/types";

/**
 * Inject SEC companyfacts into a bundle as a CONFIRMED issuer (`confirmedIssuerFacts`): an SEC-sourced CIK mapping for the
 * bundle's ticker, matching `cik`/`cik10`, and SEC-sourced facts of that CIK. `confirmed: false` makes the mapping an
 * FMP-supplied CIK whose ticker does not match, with no SEC registrant ticker: the stale-CIK case.
 */
export function withIssuerFacts(bundle: DataBundle, facts: CompanyFacts, confirmed = true): DataBundle {
  const cik = Number(facts.cik);
  const edgar = (bundle.edgar ?? {}) as unknown as Record<string, unknown>;
  edgar.cik = {
    ok: true,
    value: {
      source: confirmed ? "edgar" : "fmp", endpoint: "test cik", asOf: "2026-07-01", fetchedAt: bundle.builtAt,
      data: { cik, cik10: String(cik).padStart(10, "0"), ticker: confirmed ? bundle.symbol : "OTHER", title: "Test" },
    },
  };
  edgar.companyFacts = { ok: true, value: { source: "edgar", endpoint: "test facts", asOf: "2026-07-01", fetchedAt: bundle.builtAt, data: facts } };
  bundle.edgar = edgar as unknown as DataBundle["edgar"];
  return bundle;
}
