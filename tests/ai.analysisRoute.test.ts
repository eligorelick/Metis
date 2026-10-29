import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiStore } from "@/ai/store";

const fake = vi.hoisted(() => ({
  store: null as AiStore | null,
  key: false,
  cli: null as string | null,
  settings: { analysisModel: "claude-opus-5-5", analysisEffort: "max" } as { analysisModel: string; analysisEffort: string },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/ai/store", () => ({ readAiStore: () => fake.store, withAiStore: async (fn: (s: AiStore) => unknown) => fn(fake.store!) }));
vi.mock("@/config/env", () => ({ getConfig: () => ({ hasAnthropicKey: fake.key }) }));
vi.mock("@/ai/chatgpt", () => ({ chatGptPending: () => null }));
vi.mock("@/ai/gemini", () => ({ geminiExecutable: () => fake.cli, geminiPending: () => null }));
vi.mock("@/settings/settings", () => ({ getWritableSettingsAuthority: () => ({ state: fake.settings }) }));

import { describeAnalysisRoute } from "@/ai/connections";
import { requestedAnalysisModel } from "@/ai/analysisRoute";

const GRANT = ["chatgpt.tokens.use.direct"];
function chatgptStore(connected: boolean, selection: AiStore["selection"]): AiStore {
  return fake.store = {
    version: 1, hostId: "urn:uuid:fixture", gemini: null, selection,
    profiles: [{ id: "p", clientId: "oaiapp_secret_client", email: "owner@example.test",
      ...(connected ? { tokens: { access: "ACCESS-TOKEN-XYZ", refresh: "REFRESH-TOKEN-XYZ", id: "ID-TOKEN-XYZ", expiresAt: 1, scopes: GRANT } } : {}) }],
  } as AiStore;
}

beforeEach(() => {
  fake.store = null; fake.key = false; fake.cli = null;
  fake.settings = { analysisModel: "claude-opus-5-5", analysisEffort: "max" };
});

describe("describeAnalysisRoute", () => {
  it("describes the Claude API route from the saved model and effort", () => {
    fake.key = true; // legacy install, no saved selection
    expect(describeAnalysisRoute()).toEqual({
      provider: "anthropic", model: "claude-opus-5-5", effort: "max", ready: true,
      label: "Claude API · Opus 5.5 · max effort",
    });
  });
  it("says a Claude route without a key is not ready", () => {
    chatgptStore(false, { provider: "anthropic" });
    const route = describeAnalysisRoute();
    expect(route).toMatchObject({ provider: "anthropic", ready: false });
    expect(route.label).toBe("Claude API · Opus 5.5 · max effort · key needed");
  });
  it("describes a ready ChatGPT plan route and ignores the Claude settings", () => {
    chatgptStore(true, { provider: "chatgpt", connectionId: "p", model: "gpt-6.1-sol", effort: "max" });
    expect(describeAnalysisRoute()).toEqual({
      provider: "chatgpt", model: "gpt-6.1-sol", effort: "max", ready: true,
      label: "ChatGPT plan · gpt-6.1-sol · max effort",
    });
  });
  it("includes the Fast service tier and omits an unset effort", () => {
    chatgptStore(true, { provider: "chatgpt", connectionId: "p", model: "gpt-6.1-sol", serviceTier: "fast" });
    expect(describeAnalysisRoute().label).toBe("ChatGPT plan · gpt-6.1-sol · Fast");
  });
  it("reports a ChatGPT route whose sign-in is gone as not ready", () => {
    chatgptStore(false, { provider: "chatgpt", connectionId: "p", model: "gpt-6.1-sol", effort: "high" });
    const route = describeAnalysisRoute();
    expect(route.ready).toBe(false);
    expect(route.label).toBe("ChatGPT plan · sign-in needed");
  });
  it("describes Gemini ready and not ready", () => {
    const store = chatgptStore(false, { provider: "gemini", connectionId: "g", model: "auto" });
    store.gemini = { id: "g", connected: true };
    expect(describeAnalysisRoute()).toMatchObject({ provider: "gemini", model: "auto", effort: null, ready: false, label: "Gemini · sign-in needed" });
    fake.cli = "official";
    expect(describeAnalysisRoute()).toMatchObject({ ready: true, label: "Gemini · auto" });
  });
  it("describes AI off", () => {
    chatgptStore(false, { provider: "none" });
    expect(describeAnalysisRoute()).toEqual({ provider: "none", model: null, effort: null, ready: false, label: "AI off (data-only reports)" });
  });
  it("never exposes an email, token, client id or key", () => {
    chatgptStore(true, { provider: "chatgpt", connectionId: "p", model: "gpt-6.1-sol", effort: "max" });
    const text = JSON.stringify(describeAnalysisRoute());
    for (const secret of ["owner@example.test", "TOKEN", "oaiapp_secret_client", "sk-"]) expect(text).not.toContain(secret);
  });
  it("agrees with the model the job runner requests for every provider", () => {
    const settings = { analysisModel: "claude-opus-5-5", analysisEffort: "max" } as const;
    chatgptStore(true, { provider: "chatgpt", connectionId: "p", model: "gpt-6.1-sol" });
    expect(requestedAnalysisModel(fake.store!.selection, settings.analysisModel)).toBe("chatgpt/gpt-6.1-sol");
    expect(requestedAnalysisModel({ provider: "gemini", connectionId: "g", model: "auto" }, settings.analysisModel)).toBe("gemini/auto");
    expect(requestedAnalysisModel({ provider: "anthropic" }, settings.analysisModel)).toBe("claude-opus-5-5");
    expect(describeAnalysisRoute().model).toBe("gpt-6.1-sol");
  });
  it("keeps the job runner on the shared model rule, so the label cannot drift from the route that runs", () => {
    // Review of 398bb18: the agreement test above calls the shared helper on both sides, so it would still pass if the
    // runner inlined its own copy of the rule. Pin the runner's source to the helper instead.
    const runner = readFileSync(path.join(process.cwd(), "src/pipeline/jobRunner.ts"), "utf8");
    expect(runner).toContain('import { requestedAnalysisModel } from "@/ai/analysisRoute";');
    expect(runner.match(/requestedAnalysisModel\(aiSelection, capturedSettings\.state\.analysisModel\)/g)?.length).toBe(2);
    expect(runner).not.toMatch(/subscriptionModel\(aiSelection\.provider, aiSelection\.model\)/);
  });
});
