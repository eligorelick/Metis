import { expect } from "vitest";
import type { ComputedMetrics } from "@/pipeline/compute";
import type { ContextPayload } from "@/pipeline/stageC/payload";

/** Pin the reviewed policy deltas before restoring the unchanged historical financial/hash contracts. */
export function restoreCurrentValuationPolicyGolden<T extends { computed: ComputedMetrics; payload: ContextPayload }>(input: T): T {
  let bytes = JSON.stringify(input);
  for (const [current, prior, occurrences] of [
    ["FAIR_VALUE_2026_11_CURRENT_VALUATION_USE_58", "FAIR_VALUE_2026_11_PRIMARY_OPERATING_PROOF_57", 2],
    ["SCENARIO_TARGETS_2026_11_CURRENT_VALUATION_USE_58", "SCENARIO_TARGETS_2026_11_PRIMARY_OPERATING_PROOF_57", 4],
  ] as const) {
    expect(bytes.split(current)).toHaveLength(occurrences + 1);
    bytes = bytes.replaceAll(current, prior);
  }
  const result = JSON.parse(bytes) as T, { computed, payload } = result;
  expect(payload.payloadVersion).toBe("1.88.0"); payload.payloadVersion = "1.83.0";
  expect(computed.fairValue.currentUse).toEqual({ status: "current", reason: "supported-roll-forward",
    statementDate: "2026-03-28", valueDate: "2026-07-05", quoteDate: "2026-07-05" });
  const reasons = [
    { code: "limited-applicable-evidence", aspect: "leadership", field: "scores.aspects.leadership", detail: "Leadership has limited evidence (score 74/100 on one signal, 45.5% of signals)." },
    { code: "missing-applicable-aspect", aspect: "technicals", field: "scores.aspects.technicals", detail: "Technicals has no route-applicable score evidence." },
  ];
  expect(computed.scores.qualification?.composite).toEqual({ status: "provisional", reasons });
  expect(computed.scores.qualification?.aspects).toEqual(Object.fromEntries(
    ["fundamentals", "valuation", "quality", "balanceSheet", "moat", "leadership", "technicals"].map(key => [key,
      { status: key === "leadership" || key === "technicals" ? "provisional" : "supported", reasons: reasons.filter(r => r.aspect === key) }])));
  delete computed.fairValue.currentUse; delete computed.scores.qualification;
  expect(computed.fairValue.perShare?.asOf).toBe("2026-07-05"); computed.fairValue.perShare!.asOf = "2026-07-06";
  for (const target of computed.scenarioTargets.targets) { expect(target.perShare?.asOf).toBe("2026-07-05"); target.perShare!.asOf = "2026-07-06"; }
  const valuation = payload.computed.find(s => s.title === "Valuation (computed)")!;
  const note = "Provisional: " + reasons.map(r => r.detail).join(" ");
  expect(valuation.notes.filter(n => n.startsWith("Provisional: "))).toEqual([note]);
  valuation.notes = valuation.notes.filter(n => n !== note);
  const ids = [
    "computed.deterministic-scenario-interpretation.minimum-available-sensitivity-grid-value",
    "computed.deterministic-scenario-interpretation.maximum-available-sensitivity-grid-value",
    "payload.computed.scenario-targets.bull.per-share", "payload.computed.scenario-targets.base.per-share",
    "payload.computed.scenario-targets.bear.per-share", "payload.computed.fair-value.per-share",
  ];
  for (const id of ids) {
    const record = payload.provenanceRegistry!.find(r => r.id === id)!;
    expect(record.asOf, id).toBe("2026-07-05"); record.asOf = "2026-07-06";
  }
  for (const [label, day] of [["DCF per share", "2026-07-05"], ["DCF terminal value share", "2026-03-28"],
    ["reverse-DCF implied revenue growth", "2026-07-05"], ["reverse-DCF implied terminal margin", "2026-07-05"]]) {
    const figure = valuation.figures.find(f => f.label === label)!;
    expect(figure.asOf, label).toBe(day); figure.asOf = typeof figure.value === "number" ? "2026-07-06" : null;
    const record = payload.provenanceRegistry!.find(r => r.id === figure.provenanceId)!;
    if (typeof figure.value === "number") { expect(record.asOf, label).toBe(day); record.asOf = "2026-07-06"; }
    else expect(record).toBeUndefined();
  }
  const gap = payload.citationRegistry!.find(r => r.id === "computed.valuation.reverseDcf")!;
  expect(gap.kind).toBe("payload-gap"); expect(gap.asOf).toBe("2026-07-05"); gap.asOf = null;
  const sensitivity = payload.computed.find(s => s.title === "Deterministic scenario interpretation")!;
  for (const figure of sensitivity.figures.filter(f => /^(minimum|maximum) available sensitivity-grid value$/.test(f.label))) {
    expect(figure.asOf).toBe("2026-07-05"); figure.asOf = "2026-07-06";
  }
  return result;
}
