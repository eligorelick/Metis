import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import type { DataBundle } from "@/pipeline/types";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import frozen from "./fixtures/crwv-debt-facts.json";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";

function candidate(source: "edgar" | "fmp", ticker = "CRWV", registrantTicker = "OTHER"): DataBundle {
  const bundle = completeCurrencyBundle({ symbol: "CRWV", siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  bundle.builtAt = "2026-10-16T09:33:42.064Z";
  if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture missing");
  const row = bundle.statements.balanceQuarterly.value.data.rows[0]!;
  Object.assign(row, { date: "2026-06-30", totalDebt: 22724 * M, shortTermDebt: 6184 * M,
    operatingLeaseLiability: 16319 * M, financeLeaseLiability: 221 * M });
  delete row.longTermDebt;
  bundle.edgar = { ...bundle.edgar,
    cik: { ok: true, value: { source, endpoint: "test mapping", asOf: frozen.asOf, fetchedAt: bundle.builtAt,
      data: { cik: 1769628, cik10: "0001769628", ticker, title: "CoreWeave" } } },
    registrant: { name: "CoreWeave", cik10: "0001769628", sic: null, sicDescription: null, exchanges: [],
      tickers: [registrantTicker], fiscalYearEnd: null, stateOfIncorporation: null, forms: ["10-Q"] },
    companyFacts: { ok: true, value: { source: "edgar", endpoint: "test facts", asOf: frozen.asOf, fetchedAt: bundle.builtAt,
      data: structuredClone(frozen.facts) } },
  };
  return bundle;
}

function debtValue(bundle: DataBundle) {
  const before = JSON.stringify(bundle);
  const computed = runStageB(bundle);
  const payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] } as unknown as ValidationReport);
  expect(JSON.stringify(bundle)).toBe(before);
  const value = payload.provenanceRegistry?.find((entry) => entry.id === "payload.statements.balance-sheet-quarterly.2026-06-30.total-debt")?.value;
  expect(computed.valuation.multiples!.enterpriseValue.value === null).toBe(value === undefined);
  return value;
}

describe("late debt admission requires independent issuer identity", () => {
  it("retains vendor debt when an FMP-supplied CIK belongs to another registrant", () => {
    expect(debtValue(candidate("fmp"))).toBe(22724 * M);
  });
  it("does not trust an unrelated SEC mapping object in a saved bundle", () => {
    expect(debtValue(candidate("edgar", "OTHER"))).toBe(22724 * M);
  });
  it("does not admit facts when the CIK resolution is absent", () => {
    const bundle = candidate("edgar");
    bundle.edgar.cik = { ok: false, gap: { field: "cik", reason: "unresolved", severity: "warn" } };
    expect(debtValue(bundle)).toBe(22724 * M);
  });
  it("does not attach mismatched company-facts CIK data to a confirmed mapping", () => {
    const bundle = candidate("edgar");
    if (!bundle.edgar.companyFacts.ok) throw new Error("fixture missing");
    (bundle.edgar.companyFacts.value.data as { cik: number }).cik = 804328;
    expect(debtValue(bundle)).toBe(22724 * M);
  });
  it.each(["edgar", "fmp"] as const)("admits matching facts under independently confirmed %s mapping", (source) => {
    expect(debtValue(candidate(source, "CRWV", " crwv "))).toBeUndefined();
  });
  it("does not use a matching ticker on a different registrant CIK to confirm an FMP mapping", () => {
    const bundle = candidate("fmp", "CRWV", "CRWV");
    bundle.edgar.registrant!.cik10 = "0000804328";
    expect(debtValue(bundle)).toBe(22724 * M);
  });

  it.each(["missing-facts", "zero-cik", "padded-mismatch", "missing-facts-body", "non-sec-facts", "blank-symbol", "ticker-alias"] as const)("withholds incomplete identity evidence (%s)", (mode) => {
    const bundle = candidate("edgar");
    if (!bundle.edgar.cik.ok || !bundle.edgar.companyFacts.ok) throw new Error("fixture missing");
    const mapping = bundle.edgar.cik.value.data;
    const facts = bundle.edgar.companyFacts.value;
    let symbol = bundle.symbol;
    if (mode === "missing-facts") bundle.edgar.companyFacts = { ok: false, gap: { field: "facts", reason: "unavailable", severity: "warn" } };
    if (mode === "zero-cik") mapping.cik = 0;
    if (mode === "padded-mismatch") mapping.cik10 = "0000804328";
    if (mode === "missing-facts-body") Reflect.set(facts, "data", null);
    if (mode === "non-sec-facts") facts.source = "fmp";
    if (mode === "blank-symbol") symbol = " ";
    if (mode === "ticker-alias") { mapping.ticker = "CRWV.A"; symbol = "CRWV-A"; }
    expect(confirmedIssuerFacts(symbol, bundle.edgar)).toBeNull();
  });
  it("does not require a registrant object when the exact SEC mapping and facts CIK match", () => {
    const bundle = candidate("edgar");
    bundle.edgar.registrant = null;
    expect(confirmedIssuerFacts(bundle.symbol, bundle.edgar)).not.toBeNull();
    expect(confirmedIssuerFacts(bundle.symbol, undefined)).toBeNull();
  });
});
