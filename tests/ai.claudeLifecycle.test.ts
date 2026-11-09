import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AiStore } from "@/ai/store";
const fake = vi.hoisted(() => ({ store: null as AiStore | null, spawn: vi.fn(), login: { loggedIn: true, authMethod: "claude.ai", email: "one@example.test", orgId: "org" }, hang: false, native: true, npm: false, version: "2.1.319 (Claude Code)", launchError: false }));
vi.mock("node:child_process", () => ({ spawn: (...args: unknown[]) => fake.spawn(...args) }));
vi.mock("node:fs", () => ({ default: { statSync: () => { if (!fake.native) throw new Error("missing"); return { isFile: () => true }; },
  readFileSync: () => { if (!fake.npm) throw new Error("missing"); return '{"name":"@anthropic-ai/claude-code"}'; }, existsSync: () => fake.npm } }));
vi.mock("@/ai/store", () => ({
  aiDirectory: () => process.cwd(), ensurePrivateDirectory: () => {}, claimAiRuntime: () => {},
  readAiStore: () => fake.store,
  withAiStore: async <T>(fn: (store: AiStore) => T) => fn(fake.store!),
}));
import { claudeExecutable, connectClaude, runClaude, disconnectClaude } from "@/ai/claude";
const result = { type: "result", subtype: "success", result: "{}", modelUsage: { "claude-sonnet-5-5": { inputTokens: 2, outputTokens: 1 } } };
beforeEach(() => {
  fake.store = { version: 1, hostId: "urn:uuid:test", profiles: [], selection: { provider: "none" } };
  fake.login.email = "one@example.test"; fake.hang = false; fake.native = true; fake.npm = false; fake.version = "2.1.319 (Claude Code)"; fake.launchError = false;
  fake.spawn.mockReset().mockImplementation((_command: string, args: string[]) => {
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null as number | null, signalCode: null as string | null,
      kill: vi.fn(() => { queueMicrotask(() => { child.signalCode = "SIGKILL"; child.emit("close", null); }); return true; }) });
    queueMicrotask(() => {
      if (fake.launchError) { child.emit("error", new Error("private launch details")); child.emit("close", 1); return; }
      if (args.includes("--print") && fake.hang) return;
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
