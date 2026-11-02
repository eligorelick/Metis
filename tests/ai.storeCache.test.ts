import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ protect: vi.fn() }));
vi.mock("node:child_process", () => ({ execFileSync: (...args: unknown[]) => fake.protect(...args) }));
vi.mock("@/ai/mutex", () => ({ withAiMutex: async (_file: string, fn: () => unknown) => fn(), holdProcessLifetimeLock: () => true }));
import { withAiStore, readAiStore, aiDirectory, providerCredentialSnapshot } from "@/ai/store";
import { chatGptAccess, chatGptConnected } from "@/ai/chatgpt";
import { getConfig, resetConfigCache } from "@/config/env";
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "p6-cache-"));
  vi.stubEnv("LOCALAPPDATA", directory); vi.stubEnv("XDG_CONFIG_HOME", directory);
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  fake.protect.mockReset().mockImplementation((_e, _a, o) => o.input); resetConfigCache();
});
afterEach(() => { Object.defineProperty(process, "platform", platform); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); });
async function seed() { await withAiStore((s) => { s.profiles.push({ id: "fixture", clientId: "example", tokens: { access: "example-access", refresh: "example-refresh", id: "example-id", expiresAt: Date.now() + 3_600_000, scopes: ["chatgpt.tokens.use.direct"] } }); }); }
it("does not spawn DPAPI or rewrite for a valid-token ChatGPT request (PERF-201)", async () => {
  await seed(); await chatGptAccess("fixture"); getConfig();
  fake.protect.mockClear(); const rename = vi.spyOn(fs, "renameSync");
  expect(await chatGptAccess("fixture")).toBe("example-access"); expect(chatGptConnected("fixture")).toBe(true); resetConfigCache(); getConfig();
  expect(fake.protect).not.toHaveBeenCalled(); expect(rename).not.toHaveBeenCalled();
});
it("writes real changes once and isolates failed mutations and callers", async () => {
  await seed(); fake.protect.mockClear(); const rename = vi.spyOn(fs, "renameSync");
  await withAiStore((s) => { s.providerCredentials = { FMP_API_KEY: "example-one" }; });
  expect(readAiStore()?.providerCredentials?.FMP_API_KEY).toBe("example-one"); expect(fake.protect).toHaveBeenCalledTimes(1); expect(rename).toHaveBeenCalledTimes(1);
  readAiStore()!.profiles.length = 0; expect(readAiStore()?.profiles).toHaveLength(1);
  await expect(withAiStore((s) => { s.profiles.length = 0; throw new Error("synthetic"); })).rejects.toThrow("synthetic"); expect(readAiStore()?.profiles).toHaveLength(1);
});
it("sees another process replacing same-length bytes immediately", async () => {
  await seed(); const saved = readAiStore()!; saved.profiles[0].tokens!.access = "rotated-token!";
  const file = path.join(aiDirectory(), "connections.v1.json");
  const bytes = JSON.stringify({ protection: "windows-dpapi", data: Buffer.from(JSON.stringify(saved)).toString("base64") });
  fs.writeFileSync(file + ".other", bytes); fs.renameSync(file + ".other", file); fake.protect.mockClear();
  expect(readAiStore()?.profiles[0].tokens?.access).toBe("rotated-token!"); expect(fake.protect).toHaveBeenCalledTimes(1);
});

it("refuses to persist a store this build could not read back, leaving the file unchanged (P6 review L-2)", async () => {
  await seed(); const file = path.join(aiDirectory(), "connections.v1.json"); const before = fs.readFileSync(file, "utf8");
  await expect(withAiStore((s) => { s.profiles[0]!.tokens!.access = ""; })).rejects.toThrow(/AI connection storage was not updated/);
  expect(fs.readFileSync(file, "utf8")).toBe(before);
  expect(readAiStore()?.profiles[0]?.tokens?.access).toBe("example-access");
});
it("returns one frozen credential object while the store bytes are unchanged (P6 review L-3)", async () => {
  await withAiStore((s) => { s.providerCredentials = { FMP_API_KEY: "example-one" }; });
  const first = providerCredentialSnapshot().values;
  const clone = vi.spyOn(globalThis, "structuredClone");
  expect(providerCredentialSnapshot().values).toBe(first); expect(Object.isFrozen(first)).toBe(true); expect(clone).not.toHaveBeenCalled();
  clone.mockRestore();
  await withAiStore((s) => { s.providerCredentials = { FMP_API_KEY: "example-two" }; });
  expect(providerCredentialSnapshot().values.FMP_API_KEY).toBe("example-two");
});
