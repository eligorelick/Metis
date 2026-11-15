/**
 * D-279. (1) P4: a vendor enterprise value whose currency is not established as the displayed (listing) currency
 * is refused with a disclosed cause, never relabelled. (2) P22: compacting long integers in stored sentences never
 * rewrites a URL, an SEC accession (dashed or undashed) or a zero-padded identifier. Synthetic fixtures only.
 */
import { describe, expect, it } from "vitest";

import { buildMarketData } from "@/pipeline/marketData";
import type { DataBundle } from "@/pipeline/types";
import { compactLongIntegers } from "@/report/presentation";

import { completeCurrencyBundle, type CurrencyBundleOptions } from "./helpers/currencyBundle";

const M = 1_000_000;
const Q = "2026-03-31";

function withProviderEv(opts: CurrencyBundleOptions, date = Q): DataBundle {
  const bundle = completeCurrencyBundle({ symbol: "EVCO", ...opts });
  (bundle as unknown as Record<string, unknown>).enterpriseValues = { ok: true, value: { source: "fmp", endpoint: "enterprise-values", asOf: date, fetchedAt: bundle.builtAt,
    data: { rows: [{ date, enterpriseValue: 5_000 * M, marketCapitalization: 5_010 * M, addTotalDebt: 0, minusCashAndCashEquivalents: 70 }], raw: {} } } };
  return bundle;
}

describe("D-279: a provider EV is shown only in an established displayed currency (P4)", () => {
  it("refuses it when the same-date balance is in the reporting currency of a foreign filer listed in USD", () => {
    const md = buildMarketData(withProviderEv({ profileCurrency: "USD", annualCurrency: "TWD", quarterCurrencies: ["TWD", "TWD", "TWD", "TWD"], siblingQuarterCurrencies: ["TWD", "TWD", "TWD", "TWD"] }), { isAdr: true })!;
    expect(md.currency).toBe("USD");
    expect(md.enterpriseValue).toBeNull();
    expect(md.enterpriseValueOrigin).toBe("provider");
    expect(md.enterpriseValueNote).toBe("Provider enterprise value withheld at 2026-03-31: the vendor row states no currency and its same-date balance does not establish it in the displayed currency " +
      "(statements in TWD, quote in USD — no FX conversion is attempted). The report's market EV is separate; no replacement value is inferred.");
  });

  it("refuses it when no same-date balance establishes its currency", () => {
    const md = buildMarketData(withProviderEv({ profileCurrency: "USD", annualCurrency: "USD", siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] }, "2026-02-28"))!;
    expect(md.enterpriseValue).toBeNull();
    expect(md.enterpriseValueNote).toMatch(/^Provider enterprise value withheld at 2026-02-28: .*\(statements' currency unknown \(quote in USD\)\)/);
  });

  it("control: a domestic USD filer's provider EV on a USD balance is shown as served", () => {
    const md = buildMarketData(withProviderEv({ profileCurrency: "USD", annualCurrency: "USD", siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] }))!;
    expect(md.enterpriseValue?.value).toBe(5_000 * M);
    expect(md.enterpriseValueNote).toBeUndefined();
  });

  it("control: a foreign filer that reports in its listing currency keeps the provider EV", () => {
    const md = buildMarketData(withProviderEv({ profileCurrency: "EUR", annualCurrency: "EUR", quarterCurrencies: ["EUR", "EUR", "EUR", "EUR"], siblingQuarterCurrencies: ["EUR", "EUR", "EUR", "EUR"] }))!;
    expect(md.currency).toBe("EUR");
    expect(md.enterpriseValue?.value).toBe(5_000 * M);
  });
});

describe("D-279: long-integer compaction leaves identifiers and URLs alone (P22)", () => {
  it("never rewrites a digit run inside a URL", () => {
    const text = "WACC basis: https://www.sec.gov/Archives/edgar/data/1046179/000162828026025362/ and 1234567890123 units.";
    expect(compactLongIntegers(text)).toBe("WACC basis: https://www.sec.gov/Archives/edgar/data/1046179/000162828026025362/ and 1.23T units.");
  });

  it("never compacts an undashed accession, a dashed accession or a padded CIK in prose", () => {
    expect(compactLongIntegers("accession 000162828026025362 filed")).toBe("accession 000162828026025362 filed");
    expect(compactLongIntegers("accession 0001628280-26-025362 filed")).toBe("accession 0001628280-26-025362 filed");
    expect(compactLongIntegers("CIK 0000320193")).toBe("CIK 0000320193");
  });

  it("control: an ordinary long integer still compacts, also beside a URL", () => {
    expect(compactLongIntegers("starting revenue 302969000000 reporting-currency units")).toBe("starting revenue 302.97B (reporting currency)");
    expect(compactLongIntegers("diluted shares 24285000000 (www.example.com/x/1234567890)")).toBe("diluted shares 24.29B (www.example.com/x/1234567890)");
    expect(compactLongIntegers("net -1500000000 change")).toBe("net -1.50B change");
  });
});
