import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { economicEvidenceFromInventories, parsePrimaryEconomicShares } from "@/edgar/economicShares";
import { retainedCommonClassAmbiguity } from "@/pipeline/stageB/commonClassScope";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { runStageB } from "@/pipeline/compute";

const html = readFileSync("tests/fixtures/iren-source-scope/iren-20260630-cover.html", "utf8");
const identity = { issuerId: "1878848", securityId: "IREN", form: "10-K", accession: "0001878848-26-000052", filingDate: "2026-08-27", primaryDocument: "iren-20260630.htm", documentUrl: "https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm" };
it("retains newer class-A and differently dated class-B observations without inventing a complete economic count", () => {
  const result = parsePrimaryEconomicShares(html, identity, "2026-10-19");
  expect(result.observations).toEqual(expect.arrayContaining([
    expect.objectContaining({ asOf: "2026-08-14", shares: 394_058_648, contextId: "c-3" }),
    expect.objectContaining({ asOf: "2026-07-31", shares: 2, contextId: "c-4" }),
  ]));
  expect(result.evidence).toBeNull();
  expect(economicEvidenceFromInventories([result])).toEqual([]);
});
it("withholds issuer capitalization and EV when the retained paragraph facts establish unresolved classes and mixed dates", () => {
  const bundle = completeCurrencyBundle({ symbol: "IREN" });
  bundle.builtAt = "2026-10-19T12:00:00Z";
  bundle.edgar.economicShareInventory = [parsePrimaryEconomicShares(html, identity, "2026-10-19")];
  expect(retainedCommonClassAmbiguity(bundle)?.reason).toMatch(/2026-08-14.*2026-07-31|2026-07-31.*2026-08-14/);
  const result = runStageB(bundle);
  expect(result.valuation.multiples?.enterpriseValue.value).toBeNull();
});
it.each([
  html.replaceAll('xmlns:dei="http://xbrl.sec.gov/dei/2026"', 'xmlns:dei="https://lookalike.invalid/dei/2026"'),
  html.replaceAll('>0001878848<', '>0000000001<'),
  html.replaceAll('xbrli:shares</xbrli:measure>', 'xbrli:pure</xbrli:measure>'),
])("does not admit namespace, entity or unit lookalikes into dated observations", body => {
  expect(parsePrimaryEconomicShares(body, identity, "2026-10-19").observations ?? []).toEqual([]);
});
