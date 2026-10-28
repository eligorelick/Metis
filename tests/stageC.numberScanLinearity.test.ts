/**
 * SEC-203 (audit 2026-10-27): the number scanners ran in quadratic time on a
 * long whitespace run, because an optional sign, an optional currency symbol
 * and the `\s*` between them each re-scanned the same run from every start
 * position. Model or filing text could therefore stall the verify step. Each
 * optional token now consumes its own trailing whitespace, so the scan is
 * linear in the claim length.
 *
 * Timing bounds are generous (the fixed scan takes a few milliseconds; the
 * defect took 1.6 to 3.2 s at 2,000 characters) so a loaded machine does not
 * flake them.
 */

import { describe, expect, it } from "vitest";

import { runConsistencyChecks, parseNumbers, proseNumbers } from "@/pipeline/stageC/consistency";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import type { SourcedClaim } from "@/report/schema";

const RECORD: NumericProvenanceRecord = {
  id: "computed:revenueGrowthYoY",
  kind: "computed",
  value: 105.8511,
  unit: "percent",
  currency: null,
  period: "2026-07-26",
  asOf: "2026-07-26",
  origin: "computed.growth",
  formulaVersion: "stage-b-v1",
  displayPrecision: 4,
};
const BASE = "Revenue growth year over year for the quarter ended 2026-07-26 was 105.9%.";
const N = 2000;
const PADS = { spaces: " ".repeat(N), newlines: "\n".repeat(N) };

function timed<T>(fn: () => T): { value: T; ms: number } {
  const t0 = performance.now();
  const value = fn();
  return { value, ms: performance.now() - t0 };
}

function claimOf(text: string): SourcedClaim {
  return { text, label: "FACT", source: RECORD.id, asOf: RECORD.asOf };
}

describe.each(Object.entries(PADS))("number scanners on %s padding (SEC-203)", (_name, pad) => {
  const padded = `${BASE.slice(0, 20)}${pad}${BASE.slice(20)}`;

  it("parseNumbers finds the same numbers in under 250 ms", () => {
    const { value, ms } = timed(() => parseNumbers(padded));
    expect(value.length).toBe(parseNumbers(BASE).length);
    expect(ms).toBeLessThan(250);
  });

  it("proseNumbers runs in under 250 ms", () => {
    const { value, ms } = timed(() => proseNumbers(padded));
    expect(value).toEqual(proseNumbers(BASE));
    expect(ms).toBeLessThan(250);
  });

  it("a trailing run after a bare sign or currency symbol stays fast", () => {
    for (const lead of ["-", "$", "$-", "- $"]) {
      const { ms } = timed(() => parseNumbers(`${lead}${pad}x`));
      expect(ms).toBeLessThan(250);
    }
  });

  it("runConsistencyChecks still checks the unit in under 250 ms", () => {
    const { value, ms } = timed(() => runConsistencyChecks({
      claims: [{ claim: claimOf(padded), path: "commentary[0]" }],
      registry: [RECORD],
      citationRegistry: [],
      fetchedUrls: new Set(),
      personNames: [],
    }));
    expect(value.checks.unit.checked).toBe(1);
    expect(ms).toBeLessThan(250);
  });

  it("validateClaimNumericSupport gives the unpadded status in under 250 ms", () => {
    const options = { record: RECORD, excerpts: [], sourceId: RECORD.id, reportingCurrency: "USD" };
    const expected = validateClaimNumericSupport(claimOf(BASE), options);
    const { value, ms } = timed(() => validateClaimNumericSupport(claimOf(padded), options));
    expect(value.status).toBe(expected.status);
    expect(ms).toBeLessThan(250);
  });

  it("runVerifyPass on one padded claim runs in under 1000 ms", async () => {
    const payload = { provenanceRegistry: [RECORD], citationRegistry: [] } as unknown as ContextPayload;
    const deps = { runPass: () => { throw new Error("no model call in a verify test"); } } as unknown as PassDeps;
    const t0 = performance.now();
    await runVerifyPass(deps, payload, { commentary: [claimOf(padded)] });
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe("ParsedNumber.start (SEC-203)", () => {
  it("points at the first digit, not the whitespace before it", () => {
    expect(parseNumbers("rose 5%")[0].start).toBe(5);
  });

  it("points at the sign when there is one (control: passes before the fix)", () => {
    expect(parseNumbers("rose  -5%")[0].start).toBe(6);
  });

  it("points at the currency symbol", () => {
    expect(parseNumbers("rose  $5 million")[0].start).toBe(6);
  });
});

describe("direction window distance (SEC-203 review)", () => {
  const decline: NumericProvenanceRecord = { ...RECORD, id: "computed.growth.revenue-growth-yoy", value: -3.2 };

  // "Revenue rose" + gap + "3.2%": the gap is one space before the number and
  // plain filler words between, so only the window length decides.
  const direction = (gap: number) => {
    const filler = `${"a".repeat(gap - 2)} `;
    const sentence = `Revenue rose ${filler}3.2% year over year.`;
    expect(sentence.indexOf("3.2") - sentence.indexOf("rose") - "rose".length).toBe(gap);
    return runConsistencyChecks({
      claims: [{ claim: { text: sentence, label: "FACT", source: decline.id, asOf: decline.asOf }, path: "commentary[0]" }],
      registry: [decline],
      citationRegistry: [],
      fetchedUrls: new Set(),
      personNames: [],
    }).checks.direction;
  };

  it("counts from the direction word's end to the figure's first digit: 40 characters attach the word", () => {
    expect(direction(40)).toEqual({ checked: 1, passed: 0, failed: 1, rate: 0 });
  });

  it("does not attach a word 41 characters before the figure", () => {
    expect(direction(41).checked).toBe(0);
  });
});
