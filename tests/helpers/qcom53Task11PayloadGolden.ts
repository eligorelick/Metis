import { expect } from "vitest";
import type { ComputedMetrics } from "@/pipeline/compute";
import { fnv1a32, formatFigure, payloadFingerprint, serializePayloadForPrompt, type ContextPayload } from "@/pipeline/stageC/payload";

/** D-138 Task 11: exact f214830/current dumps attribute eight added timing objects.
 * Restore only those objects, then run the unchanged Task 4 and all published pins. */
export function restoreQcom53Task11Golden(input: { computed: ComputedMetrics; payload: ContextPayload }) {
  const payload = structuredClone(input.payload);
  if (!payload.provenanceRegistry || !payload.citationRegistry) throw new Error("Task11 golden requires both registries");
  const snapshot = () => ({ fingerprint: payloadFingerprint(payload), promptBytes: Buffer.byteLength(serializePayloadForPrompt(payload)),
    provenanceHash: fnv1a32(JSON.stringify(payload.provenanceRegistry)), provenanceCount: payload.provenanceRegistry!.length,
    provenanceIdsHash: fnv1a32(JSON.stringify(payload.provenanceRegistry!.map(r => r.id))),
    citationCount: payload.citationRegistry!.length, citationHash: fnv1a32(JSON.stringify(payload.citationRegistry)),
    computedHash: fnv1a32(JSON.stringify(input.computed)) });
  const unchanged = { provenanceCount: 530, provenanceIdsHash: "951b34ca", citationCount: 77, citationHash: "fc174a94", computedHash: "92bf340d" };
  expect(snapshot()).toEqual({ ...unchanged, fingerprint: "1.55.0:7c555e2d", promptBytes: 148619, provenanceHash: "ffdcd0e8" });
  const timing = { version: "1", precision: "day-UTC", asOfRole: "unclassified", acquisitionOrigin: "legacy-recorded", acquiredOn: null,
    fixtureLoadedOn: null, recordedOn: "2026-07-06", publishedOn: null };
  const ids = ["payload.estimates.est-revenue-2026-09-30", "payload.estimates.est-eps-2026-09-30",
    "payload.estimates.est-revenue-2027-09-30", "payload.estimates.est-eps-2027-09-30"];
  const labels = ["est revenue 2026-09-30", "est EPS 2026-09-30", "est revenue 2027-09-30", "est EPS 2027-09-30"];
  let additions = 0;
  JSON.stringify(payload, (key, value) => { if (key === "estimateTiming") additions++; return value; });
  expect(additions).toBe(8);
  for (let index = 0; index < 4; index++) {
    const figure = payload.estimates.figures[index];
    const record = payload.provenanceRegistry[348 + index];
    expect(Object.keys(figure).sort()).toEqual(["asOf", "currency", "currencyInherited", "estimateTiming", "label", "period", "provenanceId", "source", "unit", "value"]);
    expect(Object.keys(record).sort()).toEqual(["asOf", "currency", "currencyBasis", "displayPrecision", "estimateTiming", "formulaVersion", "id", "kind", "label", "origin", "period", "unit", "value"]);
    expect(figure.provenanceId).toBe(ids[index]);
    expect(record.id).toBe(ids[index]);
    expect(figure.label).toBe(labels[index]);
    expect(record.label).toBe(labels[index]);
    expect(figure.source).toBe("fmp:analyst-estimates");
    expect(record.origin).toBe("fmp:analyst-estimates");
    expect(figure.estimateTiming).toEqual(timing);
    expect(record.estimateTiming).toEqual(timing);
    expect(formatFigure(figure)).toContain(
      "; estimate timing: unclassified recorded date 2026-07-01; recorded response UTC day 2026-07-06; acquisition origin unestablished; original acquisition not established; publication/update vintage not established",
    );
    delete figure.estimateTiming;
    delete record.estimateTiming;
  }
  // Whole-payload restoration catches every unowned leaf, including numeric changes.
  expect(snapshot()).toEqual({ ...unchanged, fingerprint: "1.55.0:af8f54bd", promptBytes: 147779, provenanceHash: "4dddbe66" });
  return { computed: input.computed, payload };
}
