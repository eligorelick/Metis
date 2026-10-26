/**
 * ChatGPT plan usage follows OpenAI's Sign in with ChatGPT documentation
 * (developers.openai.com/siwc, "Errors and recovery" and "UI/UX guidelines")
 * and its speed page (learn.chatgpt.com/docs/agent-configuration/speed):
 * - each documented Responses error code gets its documented recovery;
 * - an unusable refresh token is cleared so the account reads signed out,
 *   while a temporary token-service failure keeps the credentials;
 * - Fast is offered only for the models OpenAI lists for it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiStore } from "@/ai/store";
const fake = vi.hoisted(() => ({ store: null as AiStore | null }));
vi.mock("@/ai/store", () => ({
  claimAiRuntime: () => {},
  readAiStore: () => fake.store,
  withAiStore: async <T>(fn: (store: AiStore) => Promise<T> | T): Promise<T> => {
    // As the real store: a callback that throws writes nothing.
    const draft = structuredClone(fake.store!);
    const result = await fn(draft);
    fake.store = draft;
    return result;
  },
}));
import { chatGptAccess } from "@/ai/chatgpt";
import { consumeChatGptStream } from "@/ai/transport";
import { CHATGPT_MANAGE_USAGE_URL, chatGptFastOffered } from "@/ai/contracts";

const failed = (error: unknown) => new Response(`data: ${JSON.stringify({ type: "response.failed", response: { error } })}\n\n`);

describe("documented ChatGPT plan-usage errors", () => {
  it("names Manage usage for a usage limit, before or after the stream opens", async () => {
    await expect(consumeChatGptStream(failed({ code: "subscription_sharing_usage_limit_exceeded" }))).rejects.toThrow(CHATGPT_MANAGE_USAGE_URL);
    await expect(consumeChatGptStream(new Response("{}", { status: 429 }))).rejects.toThrow("usage limit reached");
    expect(CHATGPT_MANAGE_USAGE_URL).toBe("https://chatgpt.com/settings/usage");
  });

  it("keeps the connection on a temporary outage instead of calling the plan exhausted", async () => {
    for (const code of ["subscription_sharing_usage_unavailable", "subscription_sharing_user_unavailable"]) {
      const error = await consumeChatGptStream(failed({ code })).catch((e: Error) => e);
      expect((error as Error).message).toMatch(/temporarily unavailable.*connection is kept/);
      expect((error as Error).message).not.toMatch(/exhausted/);
    }
    await expect(consumeChatGptStream(new Response("{}", { status: 503 }))).rejects.toThrow("temporarily unavailable");
  });

  it.each([
    ["subscription_sharing_user_not_eligible", /not available for this account, workspace or policy/],
    ["subscription_sharing_invalid_user", /Reconnect the account/],
    ["subscription_sharing_route_not_supported", /authorization setup/],
    ["chatpass_v2_scope_not_authorized", /authorization setup/],
    ["chatpass_v2_invalid_authorization_context", /authorization setup/],
  ])("gives %s its documented recovery", async (code, expected) => {
    await expect(consumeChatGptStream(failed({ code }))).rejects.toThrow(expected);
  });

  it("names the rejected option of an unsupported capability, and keeps the speed and effort wording", async () => {
    await expect(consumeChatGptStream(failed({ code: "subscription_sharing_unsupported_capability", param: "temperature" }))).rejects.toThrow("(temperature)");
    await expect(consumeChatGptStream(failed({ code: "subscription_sharing_unsupported_capability", param: "service_tier" }))).rejects.toThrow("selected speed");
    await expect(consumeChatGptStream(new Response("{}", { status: 401 }))).rejects.toThrow("Reconnect");
    await expect(consumeChatGptStream(new Response("{}", { status: 403 }))).rejects.toThrow("policy or permission");
  });
});

describe("refresh-token failures", () => {
  let tokenResponse: Response;
  beforeEach(() => {
    fake.store = { version: 1, hostId: "urn:uuid:aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", gemini: null, selection: { provider: "none" },
      profiles: [{ id: "p1", clientId: "oaiapp_issued", subject: "sub", tokens: { access: "old", refresh: "r", id: "i", expiresAt: 0, scopes: ["chatgpt.tokens.use.direct"] } }] } as AiStore;
    vi.stubGlobal("fetch", vi.fn(async () => tokenResponse));
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["invalid_grant", "refresh_token_expired", "refresh_token_reused"])("clears unusable tokens on %s and keeps the issued registration", async (code) => {
    tokenResponse = Response.json({ error: code }, { status: 400 });
    await expect(chatGptAccess("p1")).rejects.toThrow("Reconnect this account");
    const profile = fake.store!.profiles[0];
    expect(profile.tokens).toBeUndefined();
    expect(profile.clientId).toBe("oaiapp_issued");
    expect(profile.subject).toBe("sub");
  });

  it("keeps the credentials when the token service fails temporarily", async () => {
    tokenResponse = new Response("busy", { status: 503 });
    await expect(chatGptAccess("p1")).rejects.toThrow("temporarily unavailable");
    expect(fake.store!.profiles[0].tokens?.refresh).toBe("r");
  });

  it("replaces the access token, expiry, scopes and rotating refresh token together", async () => {
    tokenResponse = Response.json({ access_token: "new", refresh_token: "r2", token_type: "Bearer", expires_in: 3600, scope: "openid chatgpt.tokens.use.direct" });
    expect(await chatGptAccess("p1")).toBe("new");
    expect(fake.store!.profiles[0].tokens).toMatchObject({ access: "new", refresh: "r2", id: "i" });
  });
});

describe("Fast is offered only where OpenAI documents it", () => {
  it("lists GPT-6.1 Sol and Terra, GPT-6 Astra, Sol and Luna, and nothing else", () => {
    for (const model of ["gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-astra", "gpt-6-sol", "gpt-6-luna"]) expect(chatGptFastOffered(model)).toBe(true);
    for (const model of ["gpt-6.1-luna", "gpt-5.5", "gpt-6.1-sol-mini", ""]) expect(chatGptFastOffered(model)).toBe(false);
  });
});

describe("Fast on the wire (live NVDA run, 2026-10-26)", () => {
  it("sends Fast as the priority service tier and Standard as default", async () => {
    const { chatGptWireServiceTier } = await import("@/ai/transport");
    expect(chatGptWireServiceTier("fast")).toBe("priority");
    expect(chatGptWireServiceTier("default")).toBe("default");
    expect(chatGptWireServiceTier(undefined)).toBe("default");
  });

  it("names the speed when the provider rejects a service tier, and gives the status otherwise", async () => {
    const rejected = Response.json({ error: { message: "Unsupported service_tier: fast", type: "invalid_request_error", param: null } }, { status: 400 });
    await expect(consumeChatGptStream(rejected)).rejects.toThrow("selected speed");
    await expect(consumeChatGptStream(Response.json({ error: { message: "other" } }, { status: 400 }))).rejects.toThrow("(HTTP 400)");
  });
});
