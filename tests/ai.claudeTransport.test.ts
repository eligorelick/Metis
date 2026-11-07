import { beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ runClaude: vi.fn() }));
vi.mock("@/ai/claude", () => ({ runClaude: fake.runClaude }));
import { runSubscriptionPass } from "@/ai/transport";
import { buildAnalysisRoute } from "@/ai/analysisRoute";
import { PassSettlementHookError } from "@/pipeline/jobArtifacts";
beforeEach(() => { fake.runClaude.mockReset(); });
it("routes Claude passes to the CLI with the selected account, model and effort", async () => {
  fake.runClaude.mockResolvedValue({ text: '{"ok":true}', model: "claude-opus-5-5", input: 20, output: 10, observedModels: ["claude-opus-5-5"] });
  const result = await runSubscriptionPass({ model: "claude/opus", system: "Rules", messages: [{ role: "user", content: "Evidence" }], maxTokens: 100 }, "account", { effort: "high" });
  expect(fake.runClaude).toHaveBeenCalledWith("account", "opus", expect.stringContaining("Evidence"), undefined, "high");
  expect(result).toMatchObject({ ok: true, value: { data: { model: "claude/claude-opus-5-5", costUsd: 0, execution: { requestedEffort: "high", modelObserved: true, usageReported: true } } } });
  expect(buildAnalysisRoute({ provider: "claude", connectionId: "account", model: "opus", effort: "high" }, true, { analysisModel: "other", analysisEffort: "low" }).label).toContain("Claude");
});
it("reports Claude failures without invoking paid API fallback", async () => {
  const error = new Error("Claude account is signed out.");
  expect(error instanceof PassSettlementHookError).toBe(false);
  fake.runClaude.mockRejectedValue(error);
  expect(await runSubscriptionPass({ model: "claude/sonnet", system: "Rules", messages: [], maxTokens: 10 }, "account"))
    .toMatchObject({ ok: false, error: { message: "Claude account is signed out.", fallbackUsed: false, costUsd: 0 } });
});
