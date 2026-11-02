import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ protect: vi.fn() }));
vi.mock("node:child_process", () => ({ execFileSync: (...args: unknown[]) => fake.protect(...args) }));
import * as store from "@/ai/store";
import { getConfig, resetConfigCache } from "@/config/env";
import { captureAiSelection } from "@/ai/connections";
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "p6-unreadable-"));
  vi.stubEnv("LOCALAPPDATA", directory); vi.stubEnv("XDG_CONFIG_HOME", directory);
  vi.stubEnv("FMP_API_KEY", "example-data"); vi.stubEnv("ANTHROPIC_API_KEY", "example-paid"); vi.stubEnv("ANTHROPIC_ADMIN_KEY", "example-admin");
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  fake.protect.mockReset().mockImplementation((_e, _a, o) => o.input);
  resetConfigCache();
});
afterEach(() => { vi.useRealTimers(); Object.defineProperty(process, "platform", platform); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); });
function envelope(provider = "none") {
  return JSON.stringify({ protection: "windows-dpapi", data: Buffer.from(JSON.stringify({ version: 1, hostId: "urn:uuid:fixture", profiles: [], gemini: null, selection: { provider } })).toString("base64") });
}
it.each(["future-schema", "decrypt"])("keeps configuration usable but money and writes closed: %s (SEC-204)", async (cause) => {
  store.ensurePrivateDirectory(store.aiDirectory());
  const file = path.join(store.aiDirectory(), "connections.v1.json");
  const bytes = envelope(cause === "future-schema" ? "future" : "none"); fs.writeFileSync(file, bytes);
  if (cause === "decrypt") fake.protect.mockImplementation(() => { throw new Error("synthetic failure"); });
  expect(() => getConfig()).not.toThrow();
  expect(getConfig().fmpApiKey).toBe("example-data"); expect(getConfig().hasAnthropicKey).toBe(false);
  expect(store.getProviderCredential("ANTHROPIC_API_KEY")).toBeUndefined();
  expect(store.getProviderCredential("ANTHROPIC_ADMIN_KEY")).toBeUndefined();
  expect(() => captureAiSelection()).toThrow("docs/OPERATIONS.md");
  const mutate = vi.fn(); await expect(store.withAiStore(mutate)).rejects.toThrow("cannot be read"); expect(mutate).not.toHaveBeenCalled();
  expect(fs.readFileSync(file, "utf8")).toBe(bytes);
  const calls = fake.protect.mock.calls.length; getConfig(); getConfig(); expect(fake.protect.mock.calls.length).toBe(calls);
  fake.protect.mockImplementation((_e, _a, o) => o.input);
  fs.writeFileSync(file, envelope() + " ");
  expect(getConfig().hasAnthropicKey).toBe(true);
});
it("retries an unchanged failure after thirty seconds (SEC-204)", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  store.ensurePrivateDirectory(store.aiDirectory()); fs.writeFileSync(path.join(store.aiDirectory(), "connections.v1.json"), envelope());
  fake.protect.mockImplementationOnce(() => { throw new Error("synthetic timeout"); });
  expect(() => getConfig()).not.toThrow(); expect(getConfig().hasAnthropicKey).toBe(false);
  vi.setSystemTime(Date.now() + 30_001); expect(getConfig().hasAnthropicKey).toBe(true);
});
