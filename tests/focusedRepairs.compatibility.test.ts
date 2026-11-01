import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { runStageB } from "@/pipeline/compute";
import { validateBundle } from "@/pipeline/stageA/validate";
import { assembleContextPayload, payloadFingerprint } from "@/pipeline/stageC/payload";
import { createSectionCheckpoint } from "@/pipeline/stageC/sectionCheckpoint";
import { captureRunInputSnapshot, CURRENT_SNAPSHOT_VERSIONS } from "@/pipeline/runInputSnapshot";
import { replayRunInputSnapshot } from "@/pipeline/replayRunInput";

it("does not reuse accepted sections or replay old arithmetic under the repaired implementation", () => {
  const bundle = completeCurrencyBundle({});
  bundle.edgar.companyFacts = { ok: false, gap: { field: "edgar.companyFacts", reason: "offline fixture", severity: "info" } };
  const old = captureRunInputSnapshot(bundle, { evIncludeLeases: false }, { ...CURRENT_SNAPSHOT_VERSIONS, stageB: "STAGE_B_2026_10_ACCOUNTING_EVIDENCE_35" });
  expect(() => replayRunInputSnapshot(old)).toThrow(/implementation|version/i);
  const payload = assembleContextPayload(bundle, runStageB(bundle), validateBundle(bundle));
  const prior = payloadFingerprint({ ...payload, payloadVersion: "1.56.0" });
  const repaired = payloadFingerprint(payload);
  expect(repaired).not.toBe(prior);
  const directory = mkdtempSync(join(tmpdir(), "metis-focused-compatibility-"));
  try {
    createSectionCheckpoint(prior, directory).save("llm.bull", { thesis: ["accepted old work"] });
    expect(createSectionCheckpoint(repaired, directory).load("llm.bull")).toEqual({});
    expect(createSectionCheckpoint(prior, directory).load("llm.bull")).toEqual({ thesis: ["accepted old work"] });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
