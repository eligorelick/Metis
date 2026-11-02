import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ protect: vi.fn() }));
vi.mock("node:child_process", () => ({ execFileSync: (...args: unknown[]) => fake.protect(...args) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/watchlist/watchlist", () => ({ getWatchlistView: async () => [] }));
import { POST as credentialsPOST } from "@/app/api/settings/credentials/route";
import { POST as connectionsPOST } from "@/app/api/ai/connections/route";
import RootLayout from "@/app/layout";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
  expect(renderToStaticMarkup(await RootLayout({ children: createElement("main", null, "saved research") }))).toContain("saved research");
  expect(getConfig().fmpApiKey).toBe("example-data"); expect(getConfig().hasAnthropicKey).toBe(false);
  expect(store.getProviderCredential("ANTHROPIC_API_KEY")).toBeUndefined();
  expect(store.getProviderCredential("ANTHROPIC_ADMIN_KEY")).toBeUndefined();
  expect(() => captureAiSelection()).toThrow("docs/OPERATIONS.md");
  const mutate = vi.fn(); await expect(store.withAiStore(mutate)).rejects.toThrow("cannot be read"); expect(mutate).not.toHaveBeenCalled();
  expect(fs.readFileSync(file, "utf8")).toBe(bytes);
  const response = await credentialsPOST(new Request("http://localhost/api/settings/credentials", { method: "POST", headers: { host: "localhost", "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify({ action: "save", key: "FMP_API_KEY", value: "example-data" }) }));
  expect(response.status).toBe(500);
  expect((await response.json()).error).toContain("docs/OPERATIONS.md");
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

it("does not cache a transient file-read error (SEC-204 control)", async () => {
  await store.withAiStore(() => {});
  const file = path.join(store.aiDirectory(), "connections.v1.json");
  const original = fs.readFileSync;
  const read = vi.spyOn(fs, "readFileSync").mockImplementation(((...args: Parameters<typeof fs.readFileSync>) => {
    if (args[0] === file) throw Object.assign(new Error("synthetic busy"), { code: "EBUSY" });
    return original(...args);
  }) as typeof fs.readFileSync);
  expect(getConfig().hasAnthropicKey).toBe(false);
  read.mockRestore(); expect(getConfig().hasAnthropicKey).toBe(true);
});

it("names the recovery guide when a connection choice meets an unreadable store (P6 review L-1)", async () => {
  store.ensurePrivateDirectory(store.aiDirectory());
  const file = path.join(store.aiDirectory(), "connections.v1.json");
  const bytes = envelope("future"); fs.writeFileSync(file, bytes);
  const request = new Request("http://127.0.0.1:3000/api/ai/connections", { method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000", "sec-fetch-site": "same-origin" }, body: JSON.stringify({ action: "select", selection: { provider: "none" } }) });
  const response = await connectionsPOST(request);
  const body = await response.json();
  expect(response.status).toBe(400);
  expect(body.error).toContain("docs/OPERATIONS.md");
  expect(fs.readFileSync(file, "utf8")).toBe(bytes);
});
