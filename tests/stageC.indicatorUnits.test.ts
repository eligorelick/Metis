/**
 * D-44 (2026-10-13) — units the payload prints are units the model can copy,
 * and a unit that names an indicator is read only on that indicator's record.
 *
 * Reports 25/26 logged 10 unit-mismatch numbers: "RSI" / "RSI index" (read as
 * the ISO currency "RSI"), "MACD histogram" (the row printed no unit), and
 * report 26's "evidence-completeness fraction" 0.4 / 0.45, which cited the
 * quality/leadership SCORE records — completeness had no record of its own.
 * The bank fixture's quality and leadership completeness were 0.4 and 0.45,
 * the same as report 26's (leadership is 0.31 since D-49, 0.45 since D-61). Since D-48 RSI-14
 * is no longer a scored driver, so only its payload row carries it.
 */

import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import { assembleContextPayload, serializePayloadForPrompt, type ContextPayload } from "@/pipeline/stageC/payload";
import { SHARED_RULES_BLOCK, TRACED_NUMBER_UNIT_RULE, buildBullFraming, buildJudgeFraming } from "@/pipeline/stageC/prompts";
import type { JudgeOutput } from "@/report/schema";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

const VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;

function build(): ContextPayload {
  const bundle = completeCurrencyBundle({ bank: true });
  return assembleContextPayload(bundle, runStageB(bundle), VALIDATION);
}

function record(payload: ContextPayload, id: string) {
  const found = (payload.provenanceRegistry ?? []).find((entry) => entry.id === id);
  if (!found) throw new Error(`no record ${id}`);
  return found;
}

async function verifyNumbers(payload: ContextPayload, numbers: object[]) {
  const result = await runVerifyPass({} as PassDeps, payload, { keyNumbers: numbers } as unknown as JudgeOutput, { fetchedUrls: [] });
  return result.log.filter((entry) => entry.evidenceKind === "number").map((entry) => entry.reason);
}

describe("indicator and completeness rows (D-44)", () => {
  it("prints the actual dimensions on technicals rows and preserves their registry ids", () => {
    const payload = build();
    const prompt = serializePayloadForPrompt(payload);
    expect(prompt).toMatch(/RSI-14: [\d.-]+ index \[computed\.technicals\.rsi-14 · /);
    expect(prompt).toMatch(/MACD histogram: [\d.e-]+ currency\/share/);
    expect(record(payload, "computed.technicals.rsi-14").unit).toBe("index");
    expect(record(payload, "computed.technicals.macd-histogram")).toMatchObject({ unit: "currency-per-share", currency: "USD" });
    // The excess-return horizon is in years, as its label says.
    expect(record(payload, "computed.valuation.excess-return-horizon-years").unit).toBe("years");
    // No numeric figure in any section prints without a unit.
    const sections = [payload.quote, ...payload.computed, payload.estimates, payload.peers, payload.insiders,
      payload.institutional, payload.leadership, payload.shortInterest, payload.segments, payload.macro, payload.news];
    const unitless = sections.flatMap((section) => section.figures)
      .filter((figure) => typeof figure.value === "number" && figure.unit.trim() === "")
      .map((figure) => figure.label);
    expect(unitless).toEqual([]);
  });

  it("gives each aspect's evidence completeness its own row and record, and keeps it off the score row", () => {
    const payload = build();
    const prompt = serializePayloadForPrompt(payload);
    expect(prompt).not.toMatch(/completeness [\d.]+\)/);
    expect(prompt).toMatch(/quality evidence completeness: 0\.3989 fraction \[computed\.deterministic-aspect-scores\.quality-evidence-completeness · /);
    const quality = record(payload, "computed.deterministic-aspect-scores.quality-evidence-completeness");
    expect(quality.unit).toBe("ratio");
    expect(quality.value).toBeCloseTo(0.39888888888888885, 14);
    // D-61: capitalDeployment (0.25) left the aspect, so the observed share-
    // count trend (0.25) is read against 0.55, not 0.8; buyback timing has
    // no tagged execution price in this fixture.
    expect(record(payload, "computed.deterministic-aspect-scores.leadership-evidence-completeness")).toMatchObject({ value: 0.25 / 0.55, unit: "ratio" });
  });

  it("verifies report 25/26's indicator spellings on their own records and rejects them on another indicator's", async () => {
    const payload = build();
    const rsi = record(payload, "computed.technicals.rsi-14");
    const macd = record(payload, "computed.technicals.macd-histogram");
    const at = (r: typeof rsi, value: number, unit: string) => ({ value, unit, source: r.id, asOf: r.asOf, verified: null });
    expect(await verifyNumbers(payload, [
      at(rsi, rsi.value, "RSI"),
      at(rsi, rsi.value, "RSI index"),
      at(macd, macd.value, "MACD histogram"),
      at(macd, macd.value, "index"),
      at(rsi, rsi.value, "rsi"),
    ])).toEqual(["supported", "supported", "supported", "unit-mismatch", "supported"]);
    // D-48: RSI-14 is displayed, not scored, so no driver record exists.
    expect((payload.provenanceRegistry ?? []).some((entry) => entry.id === "computed.scores.technicals.rsi14")).toBe(false);
    // The same values under the other indicator's name: id, value and as-of
    // match, and before D-44 lowercase "rsi" on the MACD record verified.
    expect(await verifyNumbers(payload, [
      at(macd, macd.value, "RSI"),
      at(macd, macd.value, "rsi"),
      at(rsi, rsi.value, "MACD histogram"),
      at(rsi, rsi.value, "RSI %"),
    ])).toEqual(["unit-mismatch", "unit-mismatch", "unit-mismatch", "unit-mismatch"]);
  });

  it("keeps report 26's completeness-on-the-score citation failing, and verifies completeness on its own record", async () => {
    const payload = build();
    const score = record(payload, "computed.deterministic-aspect-scores.quality-score");
    const completeness = record(payload, "computed.deterministic-aspect-scores.quality-evidence-completeness");
    expect(await verifyNumbers(payload, [
      // Report 26 quality.graded.keyNumbers[1], verbatim apart from the as-of.
      { value: 0.4, unit: "evidence-completeness fraction", source: score.id, asOf: score.asOf, verified: null },
      { value: 0.4, unit: "fraction", source: score.id, asOf: score.asOf, verified: null },
      { value: 0.3989, unit: "fraction", source: completeness.id, asOf: completeness.asOf, verified: null },
      { value: 0.4, unit: "fraction", source: completeness.id, asOf: completeness.asOf, verified: null },
      { value: 0.45, unit: "fraction", source: completeness.id, asOf: completeness.asOf, verified: null },
    ])).toEqual(["unit-mismatch", "unit-mismatch", "supported", "value-mismatch", "value-mismatch"]);
  });
});

describe("unit and excerpt-number rules reach the pass that writes the numbers", () => {
  it("states the bare-unit rule, with the indicator line, to the judge as well as the analysts (D-44)", () => {
    expect(TRACED_NUMBER_UNIT_RULE).toContain("Indicator readings");
    expect(buildJudgeFraming()).toContain(TRACED_NUMBER_UNIT_RULE);
    expect(buildBullFraming()).toContain(TRACED_NUMBER_UNIT_RULE);
  });

  it("states the excerpt-number rule in the shared system block every pass receives (D-45)", () => {
    expect(SHARED_RULES_BLOCK).toContain("EXCERPT NUMBERS");
    expect(SHARED_RULES_BLOCK).toContain("never \"people\" or another noun in place of the unit");
  });
});
