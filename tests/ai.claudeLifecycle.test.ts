import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiStore } from "@/ai/store";
const fake = vi.hoisted(() => ({ store: null as AiStore | null, spawn: vi.fn(), login: { loggedIn: true, authMethod: "claude.ai", email: "one@example.test", orgId: "org" }, hang: false, native: true, npm: false, version: "2.1.319 (Claude Code)", launchError: false, research: [] as string[], researchHang: false }));
vi.mock("node:child_process", () => ({ spawn: (...args: unknown[]) => fake.spawn(...args) }));
vi.mock("node:fs", () => ({ default: { statSync: () => { if (!fake.native) throw new Error("missing"); return { isFile: () => true }; },
  readFileSync: () => { if (!fake.npm) throw new Error("missing"); return '{"name":"@anthropic-ai/claude-code"}'; }, existsSync: () => fake.npm } }));
vi.mock("@/ai/store", () => ({
  aiDirectory: () => process.cwd(), ensurePrivateDirectory: () => {}, claimAiRuntime: () => {},
  readAiStore: () => fake.store,
  withAiStore: async <T>(fn: (store: AiStore) => T) => fn(fake.store!),
}));
import { claudeExecutable, connectClaude, runClaude, disconnectClaude, ClaudeResearchError, CLAUDE_RESEARCH_TIMEOUT_MS } from "@/ai/claude";
const result = { type: "result", subtype: "success", result: "{}", modelUsage: { "claude-sonnet-5-5": { inputTokens: 2, outputTokens: 1 } } };
beforeEach(() => {
  fake.store = { version: 1, hostId: "urn:uuid:test", profiles: [], selection: { provider: "none" } };
  fake.login.email = "one@example.test"; fake.hang = false; fake.native = true; fake.npm = false; fake.version = "2.1.319 (Claude Code)"; fake.launchError = false; fake.research = []; fake.researchHang = false;
  fake.spawn.mockReset().mockImplementation((_command: string, args: string[]) => {
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null as number | null, signalCode: null as string | null,
      kill: vi.fn(() => { queueMicrotask(() => { child.signalCode = "SIGKILL"; child.emit("close", null); }); return true; }) });
    queueMicrotask(() => {
      if (fake.launchError) { child.emit("error", new Error("private launch details")); child.emit("close", 1); return; }
      if (args.includes("--print") && fake.hang) return;
      if (args.includes("stream-json")) {
        // Lines arrive split across chunks, as a pipe delivers them.
        // A finished stream's last line may lack a newline; a live one ends each line.
        const text = fake.research.join("\n") + (fake.researchHang ? "\n" : ""); const middle = Math.floor(text.length / 2);
        child.stdout.write(text.slice(0, middle)); child.stdout.write(text.slice(middle));
        if (fake.researchHang) return;
        child.stdout.end(); child.exitCode = 0; child.emit("close", 0); return;
      }
      child.stdout.end(args.includes("--version") ? fake.version : args.includes("status") ? JSON.stringify(fake.login) : JSON.stringify(result));
      child.exitCode = 0; child.emit("close", 0);
    });
    return child;
  });
});
afterEach(async () => { await disconnectClaude(); });
it("connects without inference and stores only account identity, then runs through the official CLI", async () => {
  await connectClaude();
  expect(fake.spawn.mock.calls.map(call => call[1])).toEqual([["--version"], ["auth", "status"]]);
  expect(JSON.stringify(fake.store)).not.toContain("one@example.test");
  expect(await runClaude(fake.store!.claude!.id, "sonnet", "request")).toMatchObject({ text: "{}", model: "claude-sonnet-5-5" });
  expect(fake.spawn.mock.calls.at(-1)![2]).toMatchObject({ shell: false, windowsHide: true });
});
it("refuses to run when the CLI account has changed since connection", async () => {
  await connectClaude(); fake.login.email = "two@example.test";
  await expect(runClaude(fake.store!.claude!.id, "sonnet", "request")).rejects.toThrow("account changed");
  expect(fake.spawn.mock.calls.some(call => call[1].includes("--print"))).toBe(false);
});
it("cancels in-flight inference on disconnect and leaves the CLI login alone", async () => {
  await connectClaude(); fake.hang = true;
  const request = runClaude(fake.store!.claude!.id, "sonnet", "request");
  const rejected = expect(request).rejects.toThrow("could not complete");
  await vi.waitFor(() => expect(fake.spawn.mock.calls.some(call => call[1].includes("--print"))).toBe(true));
  await disconnectClaude(); await rejected;
  expect(fake.store!.claude).toBeNull();
  expect(fake.spawn.mock.calls.some(call => call[1].includes("logout"))).toBe(false);
});
it("resolves official npm installations without a shell and explains missing installations", async () => {
  fake.native = false; fake.npm = true;
  expect(claudeExecutable()).toMatchObject({ command: process.execPath, prefix: [expect.stringMatching(/cli\.js$/)] });
  fake.npm = false;
  expect(claudeExecutable()).toBeNull();
  await expect(connectClaude()).rejects.toThrow("Install the official Claude Code CLI");
});
it("rejects unsupported versions and sanitizes launch errors", async () => {
  fake.version = "2.1.318 (Claude Code)";
  await expect(connectClaude()).rejects.toThrow("2.1.319 or newer");
  fake.launchError = true;
  await expect(connectClaude()).rejects.toThrow("could not start");
  expect(fake.store!.claude).toBeUndefined();
});

describe("Claude research requests through the CLI (D-269)", () => {
  const init = JSON.stringify({ type: "system", subtype: "init", tools: ["WebFetch", "WebSearch"], mcp_servers: [] });
  const search = (id: string) => JSON.stringify({ type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "tool_use", id, name: "WebSearch", input: { query: "issuer results" } }] } });
  const searched = (id: string) => JSON.stringify({ type: "user", parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id: id, content: "Links: prose" }] },
    tool_use_result: { results: [{ content: [{ title: "Issuer release", url: "https://issuer.example/release" }] }], searchCount: 1 } });
  const done = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Notes citing https://invented.example/x", permission_denials: [],
    modelUsage: { "claude-opus-5-5": { inputTokens: 3, outputTokens: 2 }, "claude-haiku-5-5": { inputTokens: 5, outputTokens: 1, webSearchRequests: 1 } } });
  it("streams the research request with only the CLI's web tools and reads typed events", async () => {
    await connectClaude(); fake.research = [init, search("toolu_1"), searched("toolu_1"), done];
    const result = await runClaude(fake.store!.claude!.id, "opus", "request", undefined, "high", { maxActions: 8 });
    expect(result).toMatchObject({ webSearches: 1, fetchedUrls: ["https://issuer.example/release"], researchText: "Notes citing https://invented.example/x" });
    const args = fake.spawn.mock.calls.at(-1)![1] as string[];
    expect(args).toEqual(expect.arrayContaining(["--output-format", "stream-json", "--verbose", "--tools", "WebSearch,WebFetch", "--allowedTools", "WebSearch", "WebFetch", "--safe-mode", "--strict-mcp-config", "--no-session-persistence"]));
    expect(await runClaude(fake.store!.claude!.id, "sonnet", "writer")).toMatchObject({ text: "{}" });
    const writer = fake.spawn.mock.calls.at(-1)![1] as string[];
    expect(writer[writer.indexOf("--tools") + 1]).toBe(""); expect(writer).not.toContain("--allowedTools");
  });
  it("stops the CLI at the first action beyond the limit", async () => {
    await connectClaude(); fake.researchHang = true;
    fake.research = [init, ...Array.from({ length: 9 }, (_, index) => search(`toolu_${index}`))];
    const error = await runClaude(fake.store!.claude!.id, "opus", "request", undefined, undefined, { maxActions: 8 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ClaudeResearchError);
    expect((error as ClaudeResearchError).providerFailure.code).toBe("local_web_action_limit");
    const child = fake.spawn.mock.results.at(-1)!.value as { kill: ReturnType<typeof vi.fn> };
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });
  it("stops the CLI at the local research deadline", async () => {
    await connectClaude(); fake.researchHang = true; fake.research = [init, search("toolu_1")];
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const pending = runClaude(fake.store!.claude!.id, "opus", "request", undefined, undefined, { maxActions: 8 }).catch((caught: unknown) => caught);
      for (let tries = 0; tries < 100 && !fake.spawn.mock.calls.some(call => (call[1] as string[]).includes("stream-json")); tries++) await new Promise(resolve => setImmediate(resolve));
      vi.advanceTimersByTime(CLAUDE_RESEARCH_TIMEOUT_MS);
      const error = await pending;
      expect(CLAUDE_RESEARCH_TIMEOUT_MS).toBe(600_000);
      expect(error).toBeInstanceOf(ClaudeResearchError);
      expect((error as ClaudeResearchError).providerFailure).toMatchObject({ disposition: "terminal", code: "local_web_time_limit" });
      expect((error as Error).message).toContain("local time limit");
    } finally { vi.useRealTimers(); }
  });
  it("rejects a research run whose CLI exits with an error, keeping no notes", async () => {
    await connectClaude(); fake.research = [init, search("toolu_1"), searched("toolu_1")];
    const error = await runClaude(fake.store!.claude!.id, "opus", "request", undefined, undefined, { maxActions: 8 }).catch((caught: unknown) => caught);
    expect((error as ClaudeResearchError).providerFailure.code).toBe("local_web_research_boundary");
  });
});
