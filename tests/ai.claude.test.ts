import { expect, it, afterEach, vi } from "vitest";
import { claudeEnvironment, claudeRunArgs, parseClaudeResult, claudeIdentity } from "@/ai/claude";
afterEach(() => vi.unstubAllEnvs());
it("keeps OAuth in the official CLI and excludes inherited paid keys and code injection", () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "not-a-real-key"); vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "not-a-real-token");
  vi.stubEnv("NODE_OPTIONS", "--require unsafe.js");
  const env = claudeEnvironment();
  expect(env.ANTHROPIC_API_KEY).toBeUndefined(); expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined(); expect(env.NODE_OPTIONS).toBeUndefined();
  const args = claudeRunArgs("opus", "high");
  expect(args).toContain("--safe-mode"); expect(args).toContain("--no-session-persistence");
  expect(args[args.indexOf("--tools") + 1]).toBe(""); expect(args).toContain("--strict-mcp-config");
  expect(args).not.toContain("--bare"); expect(args).not.toContain("--dangerously-skip-permissions");
  expect(() => claudeRunArgs("--evil")).toThrow();
});
it("records observed CLI models and usage including cached input", () => {
  expect(parseClaudeResult(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: '{"ok":true}',
    modelUsage: { "claude-opus-5-5": { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 20, cacheCreationInputTokens: 4 } } })))
    .toMatchObject({ text: '{"ok":true}', model: "claude-opus-5-5", input: 34, output: 5, observedModels: ["claude-opus-5-5"] });
});
it.each([
  { type: "result", subtype: "error_max_turns", result: "partial" },
  { type: "result", subtype: "success", is_error: true, result: "error" },
  { type: "result", subtype: "success", result: "{}", modelUsage: {} },
  { type: "result", subtype: "success", result: "{}", modelUsage: { opus: { inputTokens: -1, outputTokens: 2 } } },
])("rejects partial, failed and unaccounted responses", result => {
  expect(() => parseClaudeResult(JSON.stringify(result))).toThrow();
});
it("binds to the authenticated account, and rejects an API-key login on the subscription route", () => {
  const login = { loggedIn: true, authMethod: "claude.ai", email: "test@example.com", orgId: "org" };
  expect(claudeIdentity(login)).toMatch(/^[a-f0-9]{64}$/);
  expect(claudeIdentity({ ...login, email: "other@example.com" })).not.toBe(claudeIdentity(login));
  expect(() => claudeIdentity({ ...login, authMethod: "api_key" })).toThrow();
  expect(() => claudeIdentity({ loggedIn: false })).toThrow();
});
