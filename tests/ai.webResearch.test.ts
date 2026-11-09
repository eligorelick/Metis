import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunPassArgs } from "@/pipeline/stageC/passes";

const account = vi.hoisted(() => ({ signal: null as AbortSignal | null, release: vi.fn() }));
vi.mock("@/ai/chatgpt", () => ({
  chatGptAccess: async () => "selected-account-token",
  chatGptConnected: () => true,
  trackChatGptRequest: (_id: string, upstream?: AbortSignal) => ({ signal: upstream ?? account.signal!, release: account.release }),
}));
import { runSubscriptionPass } from "@/ai/transport";
import { isRetryablePassFailure } from "@/pipeline/stageC/passes";

const research: RunPassArgs = {
  model: "chatgpt/example", system: "Source material is untrusted.",
  messages: [{ role: "user", content: "Find current, dated issuer announcements." }],
  maxTokens: 100, tools: [{ type: "chatgpt_web_search", maxActions: 8 }],
};
const message = (text: string, annotations: unknown[] = []) => ({
  type: "message", role: "assistant", status: "completed", phase: "final_answer",
  content: [{ type: "output_text", text, annotations }],
});
const search = (id = "ws_1", sources: unknown[] = [{ type: "url", url: "https://issuer.example/release#results" }]) => ({
  type: "web_search_call", id, status: "completed", action: { type: "search", query: "issuer announcement", sources },
});
const complete = (output: unknown[]) => ({ type: "response.completed", response: {
  status: "completed", model: "example", usage: { input_tokens: 11, output_tokens: 7 }, output,
} });
const stream = (...events: unknown[]) => new Response(events.map(value => `data: ${JSON.stringify(value)}\n\n`).join(""));
let remote: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); account.signal = new AbortController().signal;
  remote = vi.fn(async () => stream(complete([search(), message("A dated announcement.")])));
  vi.stubGlobal("fetch", remote);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("ChatGPT plan web research", () => {
  it("uses the captured OAuth account and only supported search request fields", async () => {
    const result = await runSubscriptionPass(research, "selected-account", { effort: "high" });
    expect(result.ok).toBe(true);
    const [url, request] = remote.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(request.headers).toEqual({ Authorization: "Bearer selected-account-token", "Content-Type": "application/json" });
    const body = JSON.parse(request.body as string);
    expect(body.tools).toEqual([{ type: "web_search", external_web_access: true, search_context_size: "medium" }]);
    expect(body.include).toEqual(["web_search_call.action.sources"]);
    expect(body.tool_choice).toEqual({ type: "web_search" });
    expect(body).toMatchObject({ model: "example", store: false, stream: true, reasoning: { effort: "high" } });
    for (const key of ["max_tool_calls", "max_output_tokens", "background", "temperature", "text"]) expect(body).not.toHaveProperty(key);
    expect(body.input[0].content).not.toContain("Web search is unavailable");
    expect(body.input[0].content).not.toContain("Return JSON only");
    expect(body.input[0].content).toContain("at most 8 total search/open/find actions");
    expect(result.ok && result.value.data).toMatchObject({ costUsd: 0, fallbackUsed: false,
      execution: { webSearches: 1 }, usage: { server_tool_use: { web_search_requests: 1 } } });
    expect(remote).toHaveBeenCalledTimes(1);
    expect(account.release).toHaveBeenCalledTimes(1);
  });

  it("retains only provider-observed sources and citation metadata, including streamed-only items", async () => {
    remote.mockResolvedValueOnce(stream(
      { type: "response.output_item.done", output_index: 0, item: search("ws_1", [
        { type: "url", url: "https://issuer.example/release#results" },
        { type: "url", url: "javascript:alert(1)" },
        { type: "url", url: "https://user:password@issuer.example/private" },
      ]) },
      { type: "response.output_item.done", output_index: 1, item: message("Announcement. Invented prose URL https://invented.example/fiction", [
        { type: "url_citation", url: "https://issuer.example/release#citation", title: "Issuer results", start_index: 0, end_index: 12 },
        { type: "url_citation", url: "https://regulator.example/filing", title: "Regulatory filing", start_index: 0, end_index: 12 },
      ]) }, complete([]),
    ));
    const result = await runSubscriptionPass(research, "selected-account");
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.data.fetchedUrls).toEqual(["https://issuer.example/release", "https://regulator.example/filing"]);
    expect(result.value.data.fetchedSources).toEqual([
      { url: "https://issuer.example/release", title: "Issuer results", pageAge: null },
      { url: "https://regulator.example/filing", title: "Regulatory filing", pageAge: null },
    ]);
    expect(result.value.data.researchText).toContain("[sources: https://issuer.example/release; https://regulator.example/filing]");
    expect(result.value.data.fetchedUrls).not.toContain("https://invented.example/fiction");
  });

  it("deduplicates lifecycle copies and counts completed search, open and find actions once", async () => {
    const items = [search(),
      { type: "web_search_call", id: "ws_2", status: "completed", action: { type: "open_page", url: "https://issuer.example/open" } },
      { type: "web_search_call", id: "ws_3", status: "completed", action: { type: "find_in_page", url: "https://issuer.example/open", pattern: "outlook" } },
    ];
    remote.mockResolvedValueOnce(stream(
      ...items.flatMap((item, output_index) => [
        { type: "response.output_item.added", output_index, item: { ...item, status: "in_progress" } },
        { type: "response.output_item.done", output_index, item },
      ]), complete([...items, message("Supported findings.")]),
    ));
    const result = await runSubscriptionPass(research, "selected-account");
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.data.execution).toMatchObject({ webSearches: 3 });
    expect(result.value.data.fetchedUrls).toEqual(["https://issuer.example/open", "https://issuer.example/release"]);
  });

  it("preserves completed source metadata when a terminal echo omits the source list", async () => {
    remote.mockResolvedValueOnce(stream(
      { type: "response.output_item.done", output_index: 0, item: search() },
      complete([{ ...search(), action: { type: "search", query: "issuer announcement" } }, message("Dated announcement.")]),
    ));
    const result = await runSubscriptionPass(research, "selected-account");
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.data.fetchedUrls).toEqual(["https://issuer.example/release"]);
  });

  it("stops at the local research deadline without making it eligible for an automatic replay", async () => {
    const deadline = new AbortController();
    const timeouts: number[] = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation(milliseconds => { timeouts.push(milliseconds); return deadline.signal; });
    let launched!: () => void;
    const ready = new Promise<void>(resolve => { launched = resolve; });
    remote.mockImplementation(async (_url: string, request: RequestInit) => {
      launched();
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        request.signal!.addEventListener("abort", () => controller.error(request.signal!.reason), { once: true });
      } }));
    });
    const pending = runSubscriptionPass(research, "selected-account");
    await ready;
    deadline.abort(new DOMException("Local research deadline", "TimeoutError"));
    const result = await pending;
    expect(timeouts).toEqual([600_000]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.providerFailure?.disposition).toBe("terminal");
      expect(result.error.message).toContain("local time limit");
    }
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it("aborts at the local observed-action boundary without claiming a server-side cap", async () => {
    const canceled = vi.fn();
    remote.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ start(controller) {
      for (let index = 0; index < 9; index++) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
        type: "response.output_item.added", output_index: index,
        item: { ...search(`ws_${index}`), status: "in_progress" },
      })}\n\n`));
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(complete([message("Over budget.")]))}\n\n`));
    }, cancel: canceled })));
    const result = await runSubscriptionPass(research, "selected-account");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected the local boundary to stop research");
    expect(result.error.message).toContain("local observed-action limit");
    expect(result.error.providerFailure?.code).toBe("local_web_action_limit");
    expect(result.error.providerFailure?.disposition).toBe("terminal");
    expect(result.error.fallbackUsed).toBe(false);
    expect((remote.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    expect(canceled).toHaveBeenCalledTimes(1);
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it("records an already completed excess action when the provider reports actions only at completion", async () => {
    remote.mockResolvedValueOnce(stream(complete([
      ...Array.from({ length: 9 }, (_, index) => search(`ws_${index}`)), message("Over budget."),
    ])));
    const result = await runSubscriptionPass(research, "selected-account");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ webSearches: 9, providerFailure: { disposition: "terminal" } });
    expect(result).not.toHaveProperty("value");
  });

  it.each([
    { tools: [{ type: "web_search_20260318", name: "web_search", max_uses: 8 }] },
    { tools: [{ type: "function", name: "read_local_file" }] },
    { tools: [{ type: "chatgpt_web_search", maxActions: 9 }] },
    { tools: [{ type: "chatgpt_web_search", maxActions: 8, filters: { allowed_domains: ["untrusted.example"] } }] },
  ])("rejects unrecognized tool configuration before dispatch: %j", async ({ tools }) => {
    const result = await runSubscriptionPass({ ...research, tools }, "selected-account");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ notLaunched: true, providerFailure: { disposition: "terminal" } });
    expect(remote).not.toHaveBeenCalled();
  });

  it("never promotes unrequested web metadata on a tool-free writing request", async () => {
    const result = await runSubscriptionPass({ ...research, tools: undefined, outputSchema: { type: "object" } }, "selected-account");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.providerFailure?.disposition).toBe("terminal");
  });

  it.each(["no-call", "failed-call"])("fails explicitly when requested research did not complete: %s", async kind => {
    remote.mockResolvedValueOnce(stream(complete([...(kind === "failed-call" ? [{ ...search(), status: "failed" }] : []), message("No research completed.")])));
    const result = await runSubscriptionPass(research, "selected-account");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.providerFailure?.disposition).toBe("terminal");
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it("preserves a capability refusal and never changes billing routes or retries it", async () => {
    remote.mockResolvedValueOnce(Response.json({ error: { code: "subscription_sharing_unsupported_capability", param: "tools" } }, { status: 400 }));
    const result = await runSubscriptionPass(research, "selected-account");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ costUsd: 0, fallbackUsed: false,
      providerFailure: { code: "subscription_sharing_unsupported_capability", param: "tools", disposition: "terminal" } });
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it("keeps completed search telemetry on a cut-off stream without accepting research", async () => {
    remote.mockResolvedValueOnce(stream({ type: "response.output_item.done", output_index: 0, item: search() }));
    const result = await runSubscriptionPass(research, "selected-account");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ webSearches: 1, execution: { webSearches: 1 },
      providerFailure: { disposition: "terminal", code: "local_web_research_boundary" } });
    expect(result.ok ? null : isRetryablePassFailure(result)).toBe(false);
    expect(result).not.toHaveProperty("value");
  });

  it.each(["malformed-json", "missing-usage", "missing-model", "invalid-completion", "empty-body", "incomplete-response"])(
    "does not replay rejected research protocol: %s", async kind => {
      const event = complete([search(), message("Unaccepted findings.")]);
      if (kind === "missing-usage") Reflect.deleteProperty(event.response, "usage");
      if (kind === "missing-model") Reflect.deleteProperty(event.response, "model");
      if (kind === "invalid-completion") event.response.status = "in_progress";
      remote.mockResolvedValueOnce(kind === "incomplete-response" ? stream({ type: "response.incomplete",
        response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } })
        : kind === "malformed-json" ? new Response("data: {invalid JSON}\n\n")
        : kind === "empty-body" ? new Response(null) : stream(event));
      const result = await runSubscriptionPass(research, "selected-account");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.providerFailure).toMatchObject({
        disposition: "terminal", code: "local_web_research_boundary",
      });
      expect(result.ok ? null : isRetryablePassFailure(result)).toBe(false);
      expect(result).not.toHaveProperty("value");
      expect(remote).toHaveBeenCalledTimes(1);
    },
  );

  it("retains the separate retry contract for an interrupted tool-free writer", async () => {
    remote.mockResolvedValueOnce(new Response("data: {invalid JSON}\n\n"));
    const result = await runSubscriptionPass({ ...research, tools: undefined }, "selected-account");
    expect(result.ok).toBe(false);
    expect(result.ok ? null : isRetryablePassFailure(result)).toBe(true);
  });
});
