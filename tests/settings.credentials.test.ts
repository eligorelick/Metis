import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/settings/credentials/route";
import { getConfig, resetConfigCache } from "@/config/env";
import { aiDirectory, readAiStore, withAiStore } from "@/ai/store";
import { getClient, resolveModel, _resetAnthropicForTests } from "@/providers/anthropic";
import { FmpClient } from "@/providers/fmp";
import { createDefaultEdgarTransport, hasConfiguredEdgarIdentity } from "@/providers/edgar";

let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "metis-provider-keys-"));
  vi.stubEnv("LOCALAPPDATA", directory);
  vi.stubEnv("XDG_CONFIG_HOME", directory);
  for (const key of ["FMP_API_KEY", "FINNHUB_API_KEY", "FRED_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_ADMIN_KEY", "EDGAR_CONTACT"]) vi.stubEnv(key, "");
  resetConfigCache();
  _resetAnthropicForTests();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetConfigCache();
  _resetAnthropicForTests();
  fs.rmSync(directory, { recursive: true, force: true });
});

function request(body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/settings/credentials", {
    method: body === undefined ? "GET" : "POST",
    headers: { host: "localhost", "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

// macOS fixes credentials to the real OS profile; never write there in tests.
describe.skipIf(process.platform === "darwin")("provider key settings", () => {
  it("saves privately, preserves account choices, and updates cached config without a restart", async () => {
    vi.stubEnv("FMP_API_KEY", "environment-key");
    expect(getConfig().fmpApiKey).toBe("environment-key");
    await withAiStore((store) => { store.selection = { provider: "anthropic" }; });
    const response = await POST(request({ action: "save", key: "FMP_API_KEY", value: " saved-secret " }));
    expect(response.status).toBe(200);
    expect(getConfig().fmpApiKey).toBe("saved-secret");
    expect(getConfig().fixtureMode).toBe(false);
    expect(readAiStore()?.selection).toEqual({ provider: "anthropic" });
    const view = await GET(request());
    const text = await view.text();
    expect(text).not.toContain("saved-secret");
    expect(text).not.toContain("environment-key");
    expect(JSON.parse(text).credentials.FMP_API_KEY).toEqual({ configured: true, source: "settings" });
    expect(view.headers.get("cache-control")).toBe("no-store");
    if (process.platform === "win32") {
      expect(fs.readFileSync(path.join(aiDirectory(), "connections.v1.json"), "utf8")).not.toContain("saved-secret");
    }
  }, 60_000);

  it("rotates the actual Claude client after saving a replacement key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "old-key");
    const previous = getClient();
    expect(previous?.apiKey).toBe("old-key");
    const response = await POST(request({ action: "save", key: "ANTHROPIC_API_KEY", value: "new-key" }));
    expect(response.status).toBe(200);
    expect(getClient()?.apiKey).toBe("new-key");
    expect(getClient()).not.toBe(previous);
  }, 60_000);

  it("uses saved FMP keys in clients created by report pipelines while preserving explicit fixture mode", async () => {
    expect(new FmpClient().fixtureMode).toBe(true);
    expect((await POST(request({ action: "save", key: "FMP_API_KEY", value: "saved-fmp-secret" }))).status).toBe(200);
    expect(new FmpClient().fixtureMode).toBe(false);
    expect(new FmpClient({ apiKey: "" }).fixtureMode).toBe(true);
  }, 60_000);

  it("resolves available Claude models again after rotating the saved key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "old-key");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const key = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get("x-api-key");
      const id = key === "old-key" ? "claude-opus-5-5" : "claude-sonnet-5-5";
      return Response.json({ data: [{ id, type: "model", display_name: id, created_at: "2026-01-01T00:00:00Z" }], has_more: false, first_id: id, last_id: id });
    }));
    expect((await resolveModel("auto")).model).toBe("claude-opus-5-5");
    expect((await POST(request({ action: "save", key: "ANTHROPIC_API_KEY", value: "new-key" }))).status).toBe(200);
    expect((await resolveModel("auto")).model).toBe("claude-sonnet-5-5");
  }, 60_000);

  it("tests a valid FRED key when the latest observation is a holiday", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const limit = Number(new URL(String(input)).searchParams.get("limit"));
      return Response.json({ observations: [{ date: "2026-09-07", value: "." }, { date: "2026-09-04", value: "4.0" }].slice(0, limit) });
    }));
    const response = await POST(request({ action: "test", key: "FRED_API_KEY", value: "valid-key" }));
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it("uses the saved SEC contact in new live transports", async () => {
    expect(hasConfiguredEdgarIdentity()).toBe(false);
    expect((await POST(request({ action: "save", key: "EDGAR_CONTACT", value: "Research Team research@metis-research.com" }))).status).toBe(200);
    expect(hasConfiguredEdgarIdentity()).toBe(true);
    let contact: string | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
      contact = new Headers(init?.headers).get("user-agent");
      return new Response('{"cik":"0000320193","name":"Apple Inc."}');
    }));
    const transport = createDefaultEdgarTransport();
    await transport.fetchText("https://data.sec.gov/submissions/CIK0000320193.json", { ttlMs: 0 });
    expect(contact).toBe("Research Team research@metis-research.com");
  }, 60_000);

  it.each([
    ["FMP_API_KEY", [{ symbol: "AAPL", price: 200 }], "financialmodelingprep.com", "apikey"],
    ["FINNHUB_API_KEY", { c: 200, h: 201, l: 199, o: 200, pc: 199, t: 1750000000 }, "finnhub.io", "x-finnhub-token"],
    ["FRED_API_KEY", { observations: [{ date: "2026-01-01", value: "3.5" }] }, "api.stlouisfed.org", null],
    ["ANTHROPIC_API_KEY", { data: [{ id: "claude-sonnet-5-5", type: "model" }], has_more: false }, "api.anthropic.com", "x-api-key"],
    ["ANTHROPIC_ADMIN_KEY", { data: [], has_more: false }, "api.anthropic.com", "x-api-key"],
    ["EDGAR_CONTACT", { cik: "0000320193", name: "Apple Inc." }, "data.sec.gov", "user-agent"],
  ] as const)("tests %s against its own provider without saving a draft", async (key, payload, hostname, header) => {
    const secret = key === "EDGAR_CONTACT" ? "Research research@metis-research.com" : "test-secret";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.hostname).toBe(hostname);
      expect(init?.redirect).toBe("error");
      expect(init?.cache).toBe("no-store");
      if (header) expect(new Headers(init?.headers).get(header)).toBe(secret);
      else expect(url.searchParams.get("api_key")).toBe(secret);
      return Response.json(payload);
    }));
    const response = await POST(request({ action: "test", key, value: secret }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(readAiStore()).toBeNull();
  });

  it("tests the saved secret when the input is blank", async () => {
    await POST(request({ action: "save", key: "FINNHUB_API_KEY", value: "saved-finnhub-secret" }));
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("x-finnhub-token")).toBe("saved-finnhub-secret");
      return Response.json({ c: 200 });
    }));
    const response = await POST(request({ action: "test", key: "FINNHUB_API_KEY" }));
    expect(await response.json()).toMatchObject({ ok: true });
  }, 60_000);

  it.each([401, 402, 403, 429, 500])("does not claim success for provider HTTP %s or echo its body", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("test-secret", { status })));
    const response = await POST(request({ action: "test", key: "FMP_API_KEY", value: "test-secret" }));
    const text = await response.text();
    expect(JSON.parse(text).ok).toBe(false);
    expect(text).not.toContain("test-secret");
  });

  it.each([{ error: "test-secret" }, { "Error Message": "test-secret" }, [], {}, [{ symbol: "AAPL", price: null }]])("rejects malformed or error payloads even with HTTP 200: %j", async (payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(payload)));
    const response = await POST(request({ action: "test", key: "FMP_API_KEY", value: "test-secret" }));
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it("handles a network failure without leaking a URL containing the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("https://provider.test?apikey=test-secret"); }));
    const response = await POST(request({ action: "test", key: "FRED_API_KEY", value: "test-secret" }));
    const text = await response.text();
    expect(JSON.parse(text).ok).toBe(false);
    expect(text).not.toContain("test-secret");
  });

  it.each([
    { action: "save", key: "PATH", value: "bad" },
    { action: "save", key: "FMP_API_KEY", value: "" },
    { action: "save", key: "FMP_API_KEY", value: "key\nOTHER=bad" },
    { action: "save", key: "FMP_API_KEY", value: 123 },
    { action: "save", key: "EDGAR_CONTACT", value: "Name contact@example.com" },
    { action: "test", key: "FMP_API_KEY" },
  ])("rejects invalid input without writing credentials: %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(readAiStore()).toBeNull();
  });

  it("rejects cross-origin and LAN requests before reading or writing credentials", async () => {
    const body = { action: "save", key: "FMP_API_KEY", value: "test-secret" };
    expect((await POST(request(body, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }))).status).toBe(403);
    vi.stubEnv("METIS_ALLOWED_HOST", "192.168.1.50");
    expect((await GET(request(undefined, { host: "192.168.1.50" }))).status).toBe(403);
    expect(readAiStore()).toBeNull();
  });
});
