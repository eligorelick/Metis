import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload, PAYLOAD_BUDGETS } from "@/pipeline/stageC/payload";
import { CURRENT_REPORTS_VERSION, type MaterialEventFiling } from "@/providers/currentReports";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

// SEC accession 0001493152-26-040931, Item 2.01; the public text retained in
// the read-only 2026-11-02 frozen snapshot. No snapshot database is needed.
const closing = readFileSync("fixtures/edgar/figr-evidence-context/closing-item201.txt", "utf8").trim();
function event(accession: string, text: string): MaterialEventFiling {
  return { accession, form: "8-K", filingDate: "2026-09-01", eventDate: "2026-09-01", items: ["2.01"],
    url: `https://www.sec.gov/Archives/${accession}/filing.htm`,
    sections: [{ item: "2.01", title: "Completion of Acquisition or Disposition of Assets", summary: text, text, incorporates: null }] };
}

describe("8-K context allocation within the existing shared pool (R8)", () => {
  it("keeps consideration, funding and both acquired-facility closures without increasing the pool", () => {
    const bundle = completeCurrencyBundle({});
    bundle.edgar.currentReports = { ok: true, value: {
      data: { version: CURRENT_REPORTS_VERSION, releases: [], events: [event("closing", closing), ...Array.from({ length: 9 }, (_, i) => event(`other-${i}`, closing.replaceAll("Kiavi", "Harbor")))], notes: [] },
      source: "edgar", endpoint: "fixture:currentReports", asOf: "2026-09-01", fetchedAt: bundle.builtAt,
    } };
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    const excerpts = payload.filings.filter(excerpt => excerpt.source.startsWith("edgar:8-K "));
    const text = excerpts.filter(excerpt => excerpt.source === "edgar:8-K closing").map(excerpt => excerpt.text).join(" ");
    for (const fact of ["On September 1, 2026", "approximately $590 million", "$600 million aggregate", "repaid in full all outstanding obligations", "Deutsche Bank AG", "all liens securing the obligations thereunder were released"]) expect(text).toContain(fact);
    expect(excerpts.reduce((sum, excerpt) => sum + excerpt.text.length, 0)).toBeLessThanOrEqual(PAYLOAD_BUDGETS.eightKEventsTotalChars);
    for (const excerpt of excerpts) expect(excerpt.text.length).toBeLessThanOrEqual(excerpt.title.startsWith("8-K financing lifecycle") ? PAYLOAD_BUDGETS.eightKEventChars : PAYLOAD_BUDGETS.eightKTransactionEventChars);
    expect(payload.citationRegistry?.some(record => record.id === "edgar:8-K closing" && record.asOf === "2026-09-01")).toBe(true);
  });
});
