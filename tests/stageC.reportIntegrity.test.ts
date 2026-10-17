import { describe, expect, it } from "vitest";
import { buildJudgeProtocolNote } from "@/pipeline/stageC/judgeProtocol";
import { buildBullFraming, buildBearFraming, buildJudgeFraming } from "@/pipeline/stageC/prompts";
import type { JudgeProtocol } from "@/report/schema";

function protocol(setting: JudgeProtocol["setting"]): Omit<JudgeProtocol, "note"> {
  const side = { chars: 2000, originalChars: 2000, capChars: 24000, truncated: false, droppedItems: 0, caseStrength: 3 };
  return { setting, order: "bull-first", seed: "audit-shared-inputs", bull: side, bear: side,
    sharedModelFamily: { shared: true, analystFamily: "opus", judgeFamily: "opus" } };
}

describe("judge protocol limits", () => {
  it.each(["random", "bull-first", "bear-first", "both"] as const)("discloses an absent mirrored comparison for %s", (setting) => {
    const note = buildJudgeProtocolNote(protocol(setting));
    expect(note).toContain("order sensitivity is unmeasured");
    expect(note).toContain("same retained inputs");
    expect(note).toContain("not independent factual validation");
  });

  it("preserves a recorded comparison without implying that agreement validates source facts", () => {
    const input = protocol("both");
    input.reconciliation = { performed: true, secondaryOrder: "bear-first", agreed: true,
      comparedFields: ["verdict.gradeStrip.fundamentals.grade"], disagreements: [],
      note: "Both judge passes produced the same section grades." };
    const note = buildJudgeProtocolNote(input);
    expect(note).toContain(input.reconciliation.note);
    expect(note).not.toContain("order sensitivity is unmeasured");
    expect(note).toContain("not independent factual validation");
  });
});

describe("analytical framing contract", () => {
  it.each([
    ["bull", buildBullFraming], ["bear", buildBearFraming], ["judge", buildJudgeFraming],
  ] as const)("keeps reported earnings, issuer adjustments and sensitivities distinct in the %s request", (_role, framing) => {
    const prompt = framing();
    expect(prompt).toContain("reported GAAP results, issuer-reconciled non-GAAP results, and analytical sensitivities");
    expect(prompt).toContain("Never infer an item-specific tax effect from the consolidated effective tax rate");
    expect(prompt).toContain("not independent factual validation");
    expect(prompt).toContain("not a calibrated probability");
    expect(prompt).toContain("to unknown and explain the uncertainty");
    expect(prompt).toContain("Observed current conditions do not by themselves establish the likelihood of a future adverse outcome");
    expect(prompt).toContain("do not infer forward probability solely from an observed expense or margin pressure");
  });
});
