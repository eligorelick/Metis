import { withFixtureQuoteDay } from "./helpers/valuationUse";
import { describe, expect, it } from "vitest";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function bundle() {
  const b = withFixtureQuoteDay(completeCurrencyBundle({ symbol: "SYNTH", siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] }), "2026-03-31");
  const accession = "0000000001-26-000001", url = "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/annual.htm";
  const metadata = { accessionNumber: accession, filingDate: "2026-02-01", reportDate: "2025-12-31", form: "10-K", primaryDocument: "annual.htm" };
  b.edgar.cik = { ok: true, value: { source: "edgar", endpoint: "fixture", asOf: "2026-02-01", fetchedAt: b.builtAt, data: { cik: 1, cik10: "0000000001", ticker: "SYNTH", title: "Synthetic" } } };
  b.edgar.latestTenK = { ok: true, value: { source: "edgar", endpoint: "https://data.sec.gov/submissions/CIK0000000001.json", asOf: "2026-02-01", fetchedAt: b.builtAt, data: metadata } };
  b.edgar.tenKNotes = { ok: true, value: { source: "edgar", endpoint: url, asOf: "2025-12-31", fetchedAt: b.builtAt,
    data: { ...metadata, accession, sectionName: "tenKNotes", documentUrl: url, text: "At December 31, 2025, $2 billion remained authorized for repurchase under our stock repurchase program.", method: "header-regex", chars: 104 } } };
  return b;
}
describe("annual authorization informs the existing flat-share policy", () => {
  it("retains annual remaining authority with dated source and keeps discretionary repurchases at zero", () => {
    const b = bundle();
    expect(buildFilingDisclosures(b)?.capitalReturn).toMatchObject({ authorizationRemaining: 2e9, authorizationRemainingAsOf: "2025-12-31", authorizationRemainingSource: { form: "10-K" } });
    expect(runStageB(b).projections.series.find(s => s.metric === "epsDiluted")?.capitalReturn).toMatchObject({ authorizationRemaining: 2e9, appliedShareCountAnnualizedPct: 0 });
  });
  it.each(["document", "period", "future"])("refuses incompatible annual %s", mode => {
    const b = bundle(); if (!b.edgar.tenKNotes?.ok) throw Error("fixture");
    if (mode === "document") b.edgar.tenKNotes.value.data.documentUrl = "https://example.com/annual.htm";
    if (mode === "period") b.edgar.tenKNotes.value.data.reportDate = "2024-12-31";
    if (mode === "future") b.edgar.tenKNotes.value.data.filingDate = "2027-02-01";
    expect(buildFilingDisclosures(b)?.capitalReturn?.authorizationRemaining ?? null).toBeNull();
  });
});
