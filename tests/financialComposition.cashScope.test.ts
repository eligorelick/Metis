import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { financialCompositionFacts } from "@/pipeline/financialComposition";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { confirmFixtureIssuer } from "./helpers/edgarIdentity";

// Public SEC concept metadata and exact current/prior points only. No private
// snapshot or vendor input is required to run this regression.
const publicFacts = JSON.parse(readFileSync(new URL("../fixtures/edgar/crwv-cash-composition.json", import.meta.url), "utf8"));
function fixture() {
  const bundle = completeCurrencyBundle({ symbol: "CRWV" });
  bundle.builtAt = "2026-10-17T00:00:00Z";
  confirmFixtureIssuer(bundle, 1769628);
  const facts = structuredClone(publicFacts);
  bundle.edgar.companyFacts = { ok: true, value: { source: "edgar", endpoint: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001769628.json", asOf: "2026-06-30", fetchedAt: bundle.builtAt, data: facts } };
  bundle.edgar.tenQNotes = { ok: true, value: { source: "edgar", endpoint: facts.source, asOf: "2026-06-30", fetchedAt: bundle.builtAt,
    data: { sectionName: "tenQNotes", text: "Notes to condensed consolidated financial statements", chars: 51, method: "toc-anchor", form: "10-Q", accession: "0001769628-26-000366",
      reportDate: "2026-06-30", filingDate: "2026-08-12", documentUrl: facts.source } } };
  const gaap = facts.facts["us-gaap"];
  const noncurrent = gaap.RestrictedCashAndCashEquivalentsNoncurrent.units.USD[1];
  return { bundle, gaap, noncurrent };
}
const cash = (bundle: ReturnType<typeof fixture>["bundle"]) => financialCompositionFacts(bundle, "USD").filter(f => f.key.startsWith("composition-cash-"));
const combined = (bundle: ReturnType<typeof fixture>["bundle"]) => cash(bundle).find(f => f.key === "composition-cash-combined");

describe("cash composition taxonomy scope", () => {
  it("bridges the exact public CRWV Q2 components and preserves their filing, currency and scope", () => {
    const { bundle } = fixture();
    const facts = cash(bundle);
    expect(facts.map(f => f.value)).toEqual([5_524_000_000, 873_000_000, 507_000_000, 6_904_000_000]);
    expect(facts.find(f => f.key === "composition-cash-restricted")?.label).toMatch(/current/i);
    expect(facts.find(f => f.key === "composition-cash-restricted-noncurrent")?.sourceTag).toBe("edgar:xbrl us-gaap/RestrictedCashAndCashEquivalentsNoncurrent");
    expect(combined(bundle)?.computed).toContain("5524000000 + 873000000 + 507000000 = 6904000000 USD");
    expect(facts.every(f => f.source.accession === "0001769628-26-000366" && f.source.url === publicFacts.source && f.asOf === "2026-06-30")).toBe(true);
    expect(facts.every(f => /reconciles/.test(f.text) && /not all available liquidity/.test(f.text))).toBe(true);
    expect(facts.every(f => /current and noncurrent/.test(f.text) && /not additive/.test(f.text))).toBe(true);
  });

  it.each(["missing", "different-accession", "different-date", "different-filed-date", "different-currency", "negative", "conflicting", "inconsistent"])("keeps a %s noncurrent component unknown or inconsistent instead of completing the bridge", kind => {
    const { bundle, gaap, noncurrent } = fixture();
    if (kind === "missing") gaap.RestrictedCashAndCashEquivalentsNoncurrent.units.USD = [];
    if (kind === "different-accession") noncurrent.accn = "0001769628-26-000999";
    if (kind === "different-date") noncurrent.end = "2026-03-31";
    if (kind === "different-filed-date") noncurrent.filed = "2026-08-13";
    if (kind === "different-currency") { gaap.RestrictedCashAndCashEquivalentsNoncurrent.units.EUR = [noncurrent]; gaap.RestrictedCashAndCashEquivalentsNoncurrent.units.USD = []; }
    if (kind === "negative") noncurrent.val = -507_000_000;
    if (kind === "conflicting") gaap.RestrictedCashAndCashEquivalentsNoncurrent.units.USD.push({ ...noncurrent, val: 508_000_000 });
    if (kind === "inconsistent") noncurrent.val = 508_000_000;
    expect(combined(bundle)?.value).toBe(6_904_000_000);
    expect(combined(bundle)?.computed).toBeNull();
    expect(combined(bundle)?.text).toMatch(/complete nonnegative cash reconciliation is unestablished/i);
    if (!["negative", "inconsistent"].includes(kind)) expect(cash(bundle).some(f => f.key === "composition-cash-restricted-noncurrent")).toBe(false);
  });

  it("does not infer missing noncurrent cash is zero even when a current-only sum equals the reported aggregate", () => {
    const { bundle, gaap } = fixture();
    gaap.RestrictedCashAndCashEquivalentsNoncurrent.units.USD = [];
    gaap.CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents.units.USD[1].val = 6_397_000_000;
    expect(combined(bundle)?.computed).toBeNull();
    expect(combined(bundle)?.text).toMatch(/noncurrent.*unestablished|missing.*unknown/i);
  });

  it("accepts an explicitly reported zero noncurrent component", () => {
    const { bundle, gaap, noncurrent } = fixture();
    noncurrent.val = 0;
    gaap.CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents.units.USD[1].val = 6_397_000_000;
    expect(combined(bundle)?.computed).toContain("5524000000 + 873000000 + 0 = 6397000000 USD");
  });

  it("never adds a reported aggregate or an unrecognized overlapping tag to its components", () => {
    const { bundle, gaap } = fixture();
    gaap.RestrictedCashAndCashEquivalents = { units: { USD: [{ ...gaap.RestrictedCashAndCashEquivalentsNoncurrent.units.USD[1], val: 1_380_000_000 }] } };
    expect(cash(bundle).map(f => f.value)).toEqual([5_524_000_000, 873_000_000, 507_000_000, 6_904_000_000]);
    expect(combined(bundle)?.computed).toContain("5524000000 + 873000000 + 507000000 = 6904000000 USD");
    gaap.RestrictedCashAndCashEquivalentsNoncurrent.units.USD = [];
    expect(combined(bundle)?.computed).toBeNull();
  });

  it.each(["foreign-issuer", "future-filing"])("rejects the complete bridge from a %s", kind => {
    const { bundle } = fixture();
    if (!bundle.edgar.companyFacts.ok) throw new Error("missing fixture facts");
    if (kind === "foreign-issuer") bundle.edgar.companyFacts.value.data.cik = 1;
    if (kind === "future-filing") bundle.builtAt = "2026-08-11T00:00:00Z";
    expect(cash(bundle)).toEqual([]);
  });

  it("does not promote prior-date comparative balances into the current bridge", () => {
    const { bundle, gaap } = fixture();
    gaap.RestrictedCashAndCashEquivalentsNoncurrent.units.USD.pop();
    expect(cash(bundle).some(f => f.value === 184_000_000)).toBe(false);
    expect(combined(bundle)?.computed).toBeNull();
  });
});
