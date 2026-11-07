import { describe, expect, it } from "vitest";
import { buildBearFraming, buildBullFraming, buildJudgeFraming } from "@/pipeline/stageC/prompts";

describe("evidence-backed strategy requirements reach both analysts and synthesis", () => {
  it.each([buildBullFraming, buildBearFraming, buildJudgeFraming])("requires opportunities and their economic constraints in %s", (build) => {
    const text = build();
    expect(text).toContain("commercial agreement, management target, or longer-term possibility");
    expect(text).toContain("customer warrants");
    expect(text).toContain("Do not add opportunity revenue on top of consensus");
    expect(text).toContain("revenue-replacement bridge");
    expect(text).toContain("sources-and-uses");
    expect(text).toContain("historical-dispersion sensitivities");
    expect(text).toContain("Missing segment profit or tax evidence");
    expect(text).toContain("dated prove/disprove milestones");
  });
});
